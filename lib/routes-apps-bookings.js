'use strict';
// Bookings: appointment pages with services (name, length), staff and their weekly hours. Anyone in the session books a
// free slot with a staff member; staff and customers see their bookings and can cancel or move them.
module.exports = (ctx) => {
  const { api, store, json, body, fail, rid, str, rate, isObj, isAdmin, userById, emit } = ctx;
  const A = ctx.apps;
  const DAY = 86400000;
  const pages = () => ctx.coll('ap_bookings');
  const get = (id) => { const p = A.own(pages(), str(id, 16)) ? pages()[str(id, 16)] : null; if (!p) fail(404, 'That booking page was deleted.'); return p; };
  const canEdit = (me, p) => p.owner === me.id || isAdmin(me);
  const name = (id) => (userById(id) || { name: 'Someone' }).name;
  const when = (p, ts) => new Date(ts).toLocaleString('en-GB', { timeZone: p.tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const hours = (h) => { // { "1": [[540, 1020]], ... } weekday (0 = Sunday) -> minute ranges
    const out = {}; if (!isObj(h)) return out;
    for (let d = 0; d < 7; d++) { const list = Array.isArray(h[d]) ? h[d] : []; const r = list.slice(0, 4).map((x) => (Array.isArray(x) ? [A.int(x[0], 0, 1440, 0), A.int(x[1], 0, 1440, 0)] : null)).filter((x) => x && x[1] > x[0]); if (r.length) out[d] = r; }
    return out;
  };
  const summary = (me, p) => ({ id: p.id, name: p.name, desc: p.desc, owner: p.owner, tz: p.tz, color: p.color, services: p.services.length, staff: p.staff.map((s) => s.uid), canEdit: canEdit(me, p) });
  const live = (p) => emit('ap_bookings', { id: p.id }, null);
  function out(me, p) {
    const staffIds = p.staff.map((s) => s.uid), isStaff = staffIds.includes(me.id), edit = canEdit(me, p), now = Date.now();
    const visible = p.bookings.filter((b) => edit || b.by === me.id || (isStaff && b.staff === me.id));
    return { ...summary(me, p), services: p.services, staffHours: p.staff, step: p.step, window: p.window, bookings: visible, busy: p.bookings.filter((b) => b.status === 'booked' && b.end > now).map((b) => ({ staff: b.staff, start: b.start, end: b.end })) };
  }
  // is [start, start + duration) inside the staff member's hours (in the page's time zone), and free?
  function check(p, svc, staffId, start, skip) {
    const st = p.staff.find((s) => s.uid === staffId); if (!st) fail(400, 'That person does not take bookings here.');
    if (!Number.isFinite(start) || start % 60000) fail(400, 'Pick a time from the list.');
    if (start < Date.now() - 60000) fail(400, 'That time is in the past.');
    if (start > Date.now() + p.window * DAY) fail(400, `Bookings open ${p.window} days ahead.`);
    const end = start + svc.dur * 60000, w = A.wall(p.tz, start), w2 = A.wall(p.tz, end - 60000);
    if (w.date !== w2.date || !(st.hours[w.wd] || []).some(([s, e]) => w.min >= s && w.min + svc.dur <= e)) fail(400, 'That time is outside their hours.');
    if (p.bookings.some((b) => b !== skip && b.status === 'booked' && b.staff === staffId && b.start < end && b.end > start)) fail(409, 'Someone just booked that time. Pick another one.');
    return end;
  }

  api['GET /api/ap/bookings'] = async (req, res, me) => {
    const list = Object.values(pages()), now = Date.now(), mine = [], staffOf = [];
    for (const p of list) for (const b of p.bookings) {
      if (b.end < now - 30 * DAY) continue;
      const row = { ...b, page: p.id, pageName: p.name, svcName: (p.services.find((s) => s.id === b.svc) || {}).name || '', tz: p.tz };
      if (b.by === me.id) mine.push(row); if (b.staff === me.id) staffOf.push(row);
    }
    json(res, 200, { pages: list.map((p) => summary(me, p)), mine, staffOf });
  };
  api['GET /api/ap/booking'] = async (req, res, me, url) => json(res, 200, { page: out(me, get(url.searchParams.get('id'))) });
  api['POST /api/ap/booking/save'] = async (req, res, me) => {
    const b = await body(req, 32768); if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('apbook:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const nm = A.line(b.name, 80); if (!nm) fail(400, 'Name the booking page.');
    let p;
    if (b.id) { p = get(b.id); if (!canEdit(me, p)) fail(403, 'Only the owner or an admin can change this booking page.'); }
    else { if (Object.values(pages()).filter((x) => x.owner === me.id).length >= 20) fail(400, 'You have too many booking pages.'); p = { id: rid(6), owner: me.id, bookings: [], created: Date.now() }; }
    const services = (Array.isArray(b.services) ? b.services : []).slice(0, 30).map((s) => ({ id: isObj(s) && /^[a-f0-9]{6,12}$/.test(str(s.id, 12)) ? s.id : rid(4), name: A.line(s && s.name, 80), dur: A.int(s && s.dur, 5, 480, 30), desc: A.text(s && s.desc, 300).trim() })).filter((s) => s.name);
    if (!services.length) fail(400, 'Add at least one service.');
    const staff = A.ids(Array.isArray(b.staff) ? b.staff : [], (s) => (isObj(s) && A.anyone(s.uid) ? s.uid : ''), 30).map((uid) => ({ uid, hours: hours((b.staff.find((s) => isObj(s) && s.uid === uid) || {}).hours) }));
    if (!staff.length) fail(400, 'Add at least one staff member.');
    Object.assign(p, { name: nm, desc: A.text(b.desc, 1000).trim(), tz: A.tz(b.tz), color: A.color(b.color, '#038387'), services, staff, step: A.oneOf(Number(b.step), [15, 30, 60], 30), window: A.int(b.window, 1, 180, 60), updated: Date.now() });
    pages()[p.id] = p; store.save(); live(p); json(res, 200, { ok: true, page: out(me, p) });
  };
  api['POST /api/ap/booking/delete'] = async (req, res, me) => {
    const b = await body(req, 512), p = get(b.id); if (!canEdit(me, p)) fail(403, 'Only the owner or an admin can delete this booking page.');
    for (const bk of p.bookings) if (bk.status === 'booked' && bk.end > Date.now()) for (const uid of [bk.by, bk.staff]) A.notify(uid, { type: 'booking', from: me.id, text: `Canceled: ${p.name} on ${when(p, bk.start)} (the booking page was deleted)`, ref: { app: 'bookings', id: p.id } });
    delete pages()[p.id]; store.save(); live(p); json(res, 200, { ok: true });
  };
  api['POST /api/ap/book'] = async (req, res, me) => {
    const b = await body(req, 4096), p = get(b.id); if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('apbk:' + me.id, 20, 60000)) fail(429, 'Slow down a little.');
    const svc = p.services.find((s) => s.id === str(b.svc, 12)); if (!svc) fail(400, 'Pick a service.');
    if (p.bookings.filter((x) => x.by === me.id && x.status === 'booked' && x.end > Date.now()).length >= 30) fail(400, 'You have too many upcoming bookings.');
    const start = Number(b.start), staffId = str(b.staff, 32), end = check(p, svc, staffId, start);
    const bk = { id: rid(6), svc: svc.id, staff: staffId, start, end, by: me.id, note: A.text(b.note, 500).trim(), status: 'booked', ts: Date.now() };
    p.bookings.push(bk); if (p.bookings.length > 5000) p.bookings = p.bookings.filter((x) => x.end > Date.now() - 180 * DAY);
    store.save(); live(p);
    A.notify(staffId, { type: 'booking', from: me.id, text: `${name(me.id)} booked “${svc.name}” with you on ${when(p, start)}`, ref: { app: 'bookings', id: p.id, booking: bk.id } });
    json(res, 200, { ok: true, booking: bk });
  };
  const findBk = (me, p, id) => {
    const bk = p.bookings.find((x) => x.id === str(id, 12)); if (!bk) fail(404, 'That booking was deleted.');
    if (bk.by !== me.id && bk.staff !== me.id && !canEdit(me, p)) fail(403, 'Only the customer, the staff member or the page owner can change this booking.');
    if (bk.status !== 'booked') fail(400, 'This booking was canceled.'); return bk;
  };
  api['POST /api/ap/book/cancel'] = async (req, res, me) => {
    const b = await body(req, 2048), p = get(b.id), bk = findBk(me, p, b.bid), svc = p.services.find((s) => s.id === bk.svc) || { name: 'booking' };
    bk.status = 'canceled'; bk.cby = me.id; bk.cts = Date.now(); bk.why = A.line(b.reason, 200); store.save(); live(p);
    for (const uid of new Set([bk.by, bk.staff])) A.notify(uid, { type: 'booking', from: me.id, text: `${name(me.id)} canceled “${svc.name}” on ${when(p, bk.start)}`, ref: { app: 'bookings', id: p.id, booking: bk.id } });
    json(res, 200, { ok: true });
  };
  api['POST /api/ap/book/move'] = async (req, res, me) => {
    const b = await body(req, 2048), p = get(b.id), bk = findBk(me, p, b.bid), svc = p.services.find((s) => s.id === bk.svc); if (!svc) fail(400, 'That service was removed.');
    const staffId = b.staff ? str(b.staff, 32) : bk.staff, start = Number(b.start), end = check(p, svc, staffId, start, bk), was = bk.start, oldStaff = bk.staff;
    Object.assign(bk, { start, end, staff: staffId, mby: me.id, mts: Date.now() }); store.save(); live(p);
    for (const uid of new Set([bk.by, bk.staff, oldStaff])) A.notify(uid, { type: 'booking', from: me.id, text: `${name(me.id)} moved “${svc.name}” from ${when(p, was)} to ${when(p, start)}`, ref: { app: 'bookings', id: p.id, booking: bk.id } });
    json(res, 200, { ok: true, booking: bk });
  };
};
