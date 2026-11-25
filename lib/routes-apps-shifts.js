'use strict';
// Shifts: a work schedule per chat (people × days), open shifts people can request, clock in / clock out with a time
// report. The person who made the schedule and admins edit it; everyone in the chat views it and can request shifts.
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, isAdmin, canSee, userById } = ctx;
  const A = ctx.apps;
  const DAY = 86400000;
  A.perChat('ap_shifts');
  const sched = (chan) => A.peek('ap_shifts', chan);
  const need = (me, chan) => { chan = A.see(me, chan); const s = sched(chan); if (!s) fail(404, 'This chat has no schedule yet.'); return { chan, s }; };
  const canEdit = (me, s) => s.owner === me.id || isAdmin(me);
  const needEdit = (me, s, chan) => { if (!canEdit(me, s)) fail(403, 'Only the schedule owner or an admin can change shifts.'); const e = A.writeErr(me, chan); if (e) fail(403, e); };
  const send = (chan, data) => A.toChat('ap_shifts', chan, data);
  const name = (id) => (userById(id) || { name: 'Someone' }).name;
  // the host's clock is the LAN's clock: activity texts use it (the app itself shows every time in the viewer's own time zone)
  const when = (x) => new Date(x.start).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '–' + new Date(x.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const cleanShift = (chan, o, prev) => {
    if (!isObj(o)) fail(400, 'Bad shift');
    const start = A.ts(o.start), end = A.ts(o.end); if (!start || !end || end <= start || end - start > DAY) fail(400, 'A shift needs a start and an end, at most 24 hours apart.');
    const uid = o.uid ? A.member(chan, o.uid) : ''; if (o.uid && !uid) fail(400, 'That person is not in this chat.');
    return { id: prev ? prev.id : rid(6), uid, start, end, label: A.line(o.label, 60), color: A.color(o.color, '#5b5fc7'), notes: A.text(o.notes, 500).trim() };
  };
  const view = (me, chan, s, from, to) => {
    const edit = canEdit(me, s), inRange = (x) => x.end > from && x.start < to;
    return {
      owner: s.owner, name: s.name, created: s.created, canEdit: edit, people: A.people(chan),
      shifts: s.shifts.filter(inRange),
      reqs: s.reqs.filter((r) => edit || r.by === me.id).slice(-300),
      clock: s.clock.filter((c) => (edit || c.uid === me.id) && (c.in < to && (c.out || Date.now()) > from)),
      open: s.clock.find((c) => c.uid === me.id && !c.out) || null,
    };
  };
  const range = (url) => { const from = A.ts(url.searchParams.get('from')) || Date.now() - 7 * DAY, to = A.ts(url.searchParams.get('to')) || from + 7 * DAY; if (to - from > 100 * DAY) fail(400, 'Pick a shorter time range.'); return [from, to]; };

  api['GET /api/ap/shifts'] = async (req, res, me, url) => {
    const chan = A.see(me, url.searchParams.get('chan')), s = sched(chan), [from, to] = range(url);
    json(res, 200, { schedule: s ? view(me, chan, s, from, to) : null, canCreate: !A.writeErr(me, chan) });
  };
  // "My shifts": my shifts and open shifts in every schedule I can see, and where I am clocked in
  api['GET /api/ap/myshifts'] = async (req, res, me, url) => {
    const [from, to] = range(url), all = ctx.coll('ap_shifts'), out = { schedules: [], shifts: [], open: [], clock: [] };
    for (const chan of Object.keys(all)) {
      const s = sched(chan); if (!s || !canSee(me, chan)) continue;
      out.schedules.push({ chan, name: s.name, owner: s.owner, canEdit: canEdit(me, s), people: A.people(chan).length });
      for (const x of s.shifts) if (x.end > from && x.start < to) { if (x.uid === me.id) out.shifts.push({ ...x, chan }); else if (!x.uid) out.open.push({ ...x, chan, asked: s.reqs.some((r) => r.shift === x.id && r.by === me.id && r.status === 'pending') }); }
      for (const c of s.clock) if (c.uid === me.id && (!c.out || c.in > from - 7 * DAY)) out.clock.push({ ...c, chan });
    }
    json(res, 200, out);
  };
  api['POST /api/ap/shifts/create'] = async (req, res, me) => {
    const b = await body(req, 1024), chan = A.writer(me, b.chan); if (sched(chan)) fail(409, 'This chat already has a schedule.');
    const s = A.chatRec('ap_shifts', chan, () => ({ owner: me.id, name: A.line(b.name, 60) || 'Schedule', created: Date.now(), shifts: [], reqs: [], clock: [] }));
    store.save(); send(chan, { op: 'all' }); json(res, 200, { ok: true, owner: s.owner });
  };
  api['POST /api/ap/shifts/delete'] = async (req, res, me) => {
    const b = await body(req, 512), { chan, s } = need(me, b.chan); if (!canEdit(me, s)) fail(403, 'Only the schedule owner or an admin can delete it.');
    delete ctx.coll('ap_shifts')[chan]; store.save(); send(chan, { op: 'all' }); json(res, 200, { ok: true });
  };
  api['POST /api/ap/shift'] = async (req, res, me) => {
    const b = await body(req, 200000), { chan, s } = need(me, b.chan), op = str(b.op, 8); needEdit(me, s, chan);
    const find = () => { const x = s.shifts.find((y) => y.id === str(b.id, 12)); if (!x) fail(404, 'That shift was deleted.'); return x; };
    const notifyNew = (x) => { if (x.uid && x.uid !== me.id) A.notify(x.uid, { type: 'shift', from: me.id, chan, text: `New shift: ${when(x)}${x.label ? ' · ' + x.label : ''}`, ref: { app: 'shifts', id: x.id } }); };
    if (op === 'add' || op === 'addmany') {
      const list = op === 'add' ? [b.shift] : Array.isArray(b.shifts) ? b.shifts.slice(0, 500) : [];
      if (s.shifts.length + list.length > 5000) fail(400, 'This schedule is full. Delete old shifts first.');
      const made = list.map((o) => cleanShift(chan, o)); s.shifts.push(...made); store.save(); send(chan, { op: 'all' }); if (made.length <= 20) made.forEach(notifyNew);
      return json(res, 200, { ok: true, ids: made.map((x) => x.id) });
    }
    if (op === 'edit') { const x = find(), nx = cleanShift(chan, b.shift, x); const reassigned = nx.uid !== x.uid; Object.assign(x, nx); if (reassigned) { notifyNew(x); s.reqs.filter((r) => r.shift === x.id && r.status === 'pending').forEach((r) => { r.status = 'declined'; }); } }
    else if (op === 'del') { const ids = new Set((Array.isArray(b.ids) ? b.ids : [b.id]).map((x) => str(x, 12))); s.shifts = s.shifts.filter((x) => !ids.has(x.id)); s.reqs = s.reqs.filter((r) => !ids.has(r.shift)); }
    else fail(400, 'Bad operation');
    store.save(); send(chan, { op: 'all' }); json(res, 200, { ok: true });
  };
  api['POST /api/ap/shift/request'] = async (req, res, me) => {
    const b = await body(req, 1024), { chan, s } = need(me, b.chan); const e = A.writeErr(me, chan); if (e) fail(403, e);
    const x = s.shifts.find((y) => y.id === str(b.id, 12)); if (!x) fail(404, 'That shift was deleted.'); if (x.uid) fail(400, 'Someone already has this shift.');
    if (x.end < Date.now()) fail(400, 'This shift is over.');
    if (s.reqs.some((r) => r.shift === x.id && r.by === me.id && r.status === 'pending')) fail(409, 'You already asked for this shift.');
    const r = { id: rid(6), shift: x.id, by: me.id, ts: Date.now(), status: 'pending', note: A.line(b.note, 200) }; s.reqs.push(r); if (s.reqs.length > 2000) s.reqs.splice(0, s.reqs.length - 2000);
    store.save(); send(chan, { op: 'all' });
    A.notify(s.owner, { type: 'shift', from: me.id, chan, text: `${name(me.id)} asked for an open shift${x.label ? ' (' + x.label + ')' : ''}`, ref: { app: 'shifts', id: x.id } });
    json(res, 200, { ok: true, req: r });
  };
  api['POST /api/ap/shift/decide'] = async (req, res, me) => {
    const b = await body(req, 1024), { chan, s } = need(me, b.chan); needEdit(me, s, chan);
    const r = s.reqs.find((y) => y.id === str(b.req, 12)); if (!r || r.status !== 'pending') fail(404, 'That request was already handled.');
    const x = s.shifts.find((y) => y.id === r.shift);
    if (b.approve) { if (!x || x.uid) fail(400, 'This shift is no longer open.'); if (!A.member(chan, r.by)) fail(400, 'That person is no longer in this chat.'); x.uid = r.by; r.status = 'approved'; for (const o of s.reqs) if (o !== r && o.shift === x.id && o.status === 'pending') o.status = 'declined'; }
    else r.status = 'declined';
    r.dby = me.id; r.dts = Date.now(); store.save(); send(chan, { op: 'all' });
    A.notify(r.by, { type: 'shift', from: me.id, chan, text: b.approve ? 'Your request for an open shift was approved' : 'Your request for an open shift was declined', ref: { app: 'shifts', id: r.shift } });
    json(res, 200, { ok: true });
  };
  api['POST /api/ap/clock'] = async (req, res, me) => {
    const b = await body(req, 1024), { chan, s } = need(me, b.chan), act = str(b.act, 4);
    if (!rate('apclock:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const open = s.clock.find((c) => c.uid === me.id && !c.out);
    if (act === 'in') { if (open) fail(400, 'You are already clocked in.'); s.clock.push({ id: rid(6), uid: me.id, in: Date.now(), out: 0, note: A.line(b.note, 200) }); if (s.clock.length > 20000) s.clock.splice(0, s.clock.length - 20000); }
    else if (act === 'out') { if (!open) fail(400, 'You are not clocked in.'); open.out = Date.now(); if (b.note) open.note = A.line(b.note, 200); }
    else fail(400, 'Clock in or out?');
    store.save(); send(chan, { op: 'all' }); json(res, 200, { ok: true });
  };
  void db;
};
