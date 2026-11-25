'use strict';
// Daily check-ins: questions ("What did you do yesterday? Today? Blockers?") asked in a chat on chosen days at a set
// time. At that time everyone gets a prompt (activity item + a card in the chat); answers make a daily summary.
module.exports = (ctx) => {
  const { api, store, json, body, fail, rid, str, rate, isObj, isAdmin, canSee, userById } = ctx;
  const A = ctx.apps;
  A.perChat('ap_checkins');
  const recOf = (chan) => A.peek('ap_checkins', chan);
  const find = (r, id) => { const c = r && r.list.find((x) => x.id === str(id, 12)); if (!c) fail(404, 'That check-in was deleted.'); return c; };
  const send = (chan) => A.toChat('ap_checkins', chan, {});
  const runsOut = (c) => Object.entries(c.runs).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30).map(([day, r]) => ({ day, ts: r.ts, msg: r.msg, ans: r.ans }));
  const outOf = (c) => ({ id: c.id, by: c.by, title: c.title, qs: c.qs, days: c.days, time: c.time, tz: c.tz, active: c.active, created: c.created, runs: runsOut(c) });
  const clean = (b, c) => {
    const title = A.line(b.title, 120); if (!title) fail(400, 'Give the check-in a name.');
    const qs = (Array.isArray(b.qs) ? b.qs : []).map((q) => A.line(q, 300)).filter(Boolean).slice(0, 10); if (!qs.length) fail(400, 'Add at least one question.');
    const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(); if (!days.length) fail(400, 'Pick at least one day.');
    const time = A.hm(b.time); if (!time) fail(400, 'Pick a time.');
    return Object.assign(c, { title, qs, days, time, tz: A.tz(b.tz), active: b.active !== false, since: Date.now() });
  };
  const cardOf = (c, day, run, chan) => ({ kind: 'checkin', id: c.id, day, title: c.title, qn: c.qs.length, n: Object.keys(run.ans).length, of: A.people(chan).length });
  function run(chan, c, day, by) { // post today's prompt: a card in the chat and an activity item for everyone
    const u = userById(by); if (!u || u.removed || !canSee(u, chan)) return null;
    const r = { ts: Date.now(), msg: '', ans: {} }; c.runs[day] = r;
    try { const m = A.postCard(u, chan, cardOf(c, day, r, chan), `Check-in: ${c.title}`); r.msg = m.id; } catch (e) { delete c.runs[day]; return null; }
    const days = Object.keys(c.runs).sort(); while (days.length > 60) delete c.runs[days.shift()];
    for (const uid of A.people(chan)) A.notify(uid, { type: 'checkin', from: by, chan, msg: r.msg, text: `Check-in: ${c.title}`, ref: { app: 'checkins', id: c.id, day } });
    store.save(); send(chan); return r;
  }
  ctx.ticks.push({ every: 30000, fn: (now) => {
    const all = ctx.coll('ap_checkins');
    for (const chan of Object.keys(all)) {
      const r = recOf(chan); if (!r) continue;
      for (const c of r.list) {
        if (!c.active) continue; const w = A.wall(c.tz, now), [hh, mm] = c.time.split(':').map(Number), at = hh * 60 + mm;
        if (!c.days.includes(w.wd) || w.min < at || w.min > at + 360 || c.runs[w.date]) continue; // up to 6 hours late (host was off)
        if (A.fromWall(c.tz, w.y, w.m, w.d, at) < (c.since || 0)) continue; // made or changed after today's time: start next time
        run(chan, c, w.date, c.by);
      }
    }
  } });

  api['GET /api/ap/checkins'] = async (req, res, me, url) => {
    const chan = A.see(me, url.searchParams.get('chan')), r = recOf(chan);
    json(res, 200, { list: r ? r.list.map(outOf) : [], people: A.people(chan), canAdd: !A.writeErr(me, chan) && !A.isGuest(me), canAnswer: !A.writeErr(me, chan) });
  };
  api['POST /api/ap/checkin'] = async (req, res, me) => {
    const b = await body(req, 16384), chan = A.writer(me, b.chan), op = str(b.op, 8);
    if (!rate('apchk:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const r = A.chatRec('ap_checkins', chan, () => ({ list: [] }));
    const mine = (c) => { if (c.by !== me.id && !A.isManager(me, chan)) fail(403, 'Only the person who made this check-in, the group owner or an admin can change it.'); };
    let out = {};
    if (op === 'add') { A.noGuest(me); if (r.list.length >= 10) fail(400, 'A chat holds 10 check-ins.'); const c = clean(b, { id: rid(6), by: me.id, created: Date.now(), runs: {} }); r.list.push(c); out = { id: c.id }; }
    else if (op === 'edit') { const c = find(r, b.id); mine(c); clean(b, c); }
    else if (op === 'del') { const c = find(r, b.id); mine(c); r.list = r.list.filter((x) => x !== c); }
    else if (op === 'run') { // "Ask now"
      const c = find(r, b.id); mine(c); const day = A.wall(c.tz, Date.now()).date;
      if (c.runs[day]) fail(409, 'Today’s check-in was already posted.');
      if (c.by !== me.id) c.by = me.id; if (!run(chan, c, day, me.id)) fail(400, 'The check-in could not be posted here.');
    } else fail(400, 'Bad operation');
    store.save(); send(chan); json(res, 200, { ok: true, ...out });
  };
  api['POST /api/ap/checkin/answer'] = async (req, res, me) => {
    const b = await body(req, 16384), chan = A.writer(me, b.chan), c = find(recOf(chan), b.id), day = str(b.day, 10), r = c.runs[day];
    if (!r) fail(404, 'That check-in is not open.');
    const a = (Array.isArray(b.a) ? b.a : []).slice(0, c.qs.length).map((x) => A.text(x, 2000).trim());
    if (!a.some(Boolean)) fail(400, 'Answer at least one question.');
    r.ans[me.id] = { ts: Date.now(), a }; store.save(); send(chan); A.updateCard(r.msg, cardOf(c, day, r, chan));
    json(res, 200, { ok: true });
  };
  void isObj; void isAdmin;
};
