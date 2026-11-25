'use strict';
// Per-chat collaboration: shared note, whiteboard, to-do list, calendar (with reminders). Calls live in routes-calls.js.
// The apps area extends the to-dos into a task board (routes-apps-tasks.js) and the whiteboard (routes-apps-board.js).
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, userById, isAdmin, canSee, audience, emit, sysMsg, online } = ctx;
  const ex = (chan) => (db.extras[chan] ||= { note: { text: '', v: 0, by: null, ts: 0 }, board: [], todos: [], events: [] });
  const see = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); return ex(chan); };
  const writer = (me, chan) => {
    const e = see(me, chan);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!chan.startsWith('dm:') && db.channels[chan].readonly && !isAdmin(me)) fail(403, 'Only admins can change things in this channel.');
    return e;
  };
  const HEX = /^#[0-9a-fA-F]{6}$/;

  api['GET /api/collab'] = async (req, res, me, url) => { const e = see(me, url.searchParams.get('chan')); json(res, 200, { note: e.note, board: e.board, todos: e.todos, events: e.events }); };

  // ----- shared note (optimistic versioning) -----
  api['POST /api/note'] = async (req, res, me) => {
    const b = await body(req, 300000), chan = str(b.chan, 64), e = writer(me, chan), text = str(b.text, 100000);
    if (Number(b.v) !== e.note.v) return json(res, 409, { error: 'Someone else changed the note first.', note: e.note });
    e.note = { text, v: e.note.v + 1, by: me.id, ts: Date.now() }; store.save();
    emit('note', { chan, note: e.note }, audience(chan)); json(res, 200, { ok: true, note: e.note });
  };

  // ----- whiteboard -----
  const cleanStroke = (s, me) => {
    if (!isObj(s) || !Array.isArray(s.pts) || s.pts.length < 2 || s.pts.length > 4000) fail(400, 'Bad stroke');
    const c = s.c === 'erase' ? 'erase' : HEX.test(str(s.c, 7)) ? s.c : '#000000', w = Math.max(1, Math.min(Math.round(Number(s.w)) || 3, 40));
    return { c, w, pts: s.pts.map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)))) };
  };
  api['POST /api/board/stroke'] = async (req, res, me) => {
    const b = await body(req, 60000), chan = str(b.chan, 64), e = writer(me, chan);
    const s = { id: rid(6), by: me.id, ...cleanStroke(b.stroke, me) };
    e.board.push(s); if (e.board.length > 3000) e.board.shift(); store.save();
    emit('board', { chan, op: 'add', stroke: s }, audience(chan)); json(res, 200, { ok: true, id: s.id });
  };
  api['POST /api/board/undo'] = async (req, res, me) => {
    const chan = str((await body(req, 256)).chan, 64), e = writer(me, chan);
    for (let i = e.board.length - 1; i >= 0; i--) if (e.board[i].by === me.id) { const [s] = e.board.splice(i, 1); store.save(); emit('board', { chan, op: 'del', id: s.id }, audience(chan)); break; }
    json(res, 200, { ok: true });
  };
  api['POST /api/board/clear'] = async (req, res, me) => {
    const chan = str((await body(req, 256)).chan, 64), e = writer(me, chan); e.board = []; store.save(); emit('board', { chan, op: 'clear' }, audience(chan)); json(res, 200, { ok: true });
  };
  api['POST /api/board/live'] = async (req, res, me) => { // ephemeral, not stored
    const b = await body(req, 20000), chan = str(b.chan, 64); writer(me, chan);
    if (!rate('live:' + me.id, 60, 1000)) return json(res, 200, { ok: true });
    const s = cleanStroke(b.seg, me); emit('boardlive', { chan, by: me.id, seg: s, sid: str(b.sid, 12) }, audience(chan)); json(res, 200, { ok: true });
  };

  // ----- to-do list -----
  const dueTs = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 4e12 ? Math.round(n) : 0; };
  api['POST /api/todo'] = async (req, res, me) => {
    const b = await body(req, 4096), chan = str(b.chan, 64), e = writer(me, chan), op = str(b.op, 10);
    const find = () => { const t = e.todos.find((x) => x.id === str(b.id, 12)); if (!t) fail(404, 'No such task'); return t; };
    const assignee = () => { const a = str(b.assignee, 32); return a && userById(a) && canSee(userById(a), chan) ? a : ''; };
    if (op === 'add') {
      const text = str(b.text, 200).trim(); if (!text) fail(400, 'Write the task first.'); if (e.todos.length >= 500) fail(400, 'Too many tasks.');
      const a = assignee(), t = { id: rid(6), text, done: false, by: me.id, assignee: a, assignees: a ? [a] : [], due: dueTs(b.due), ts: Date.now() }; e.todos.push(t);
      if (a && ctx.apps) ctx.apps.notifyAssigned(me, chan, t, a === me.id ? [] : [a]);
    } else if (op === 'toggle') { const t = find(); t.done = !t.done; t.doneBy = t.done ? me.id : null; t.progress = t.done ? 'completed' : 'notstarted'; }
    else if (op === 'del') { const t = find(); if (t.by !== me.id && !isAdmin(me)) fail(403, 'Only the creator or an admin can delete this.'); e.todos = e.todos.filter((x) => x !== t); }
    else if (op === 'edit') { const t = find(); if (b.text !== undefined) t.text = str(b.text, 200).trim() || t.text; if (b.assignee !== undefined) { t.assignee = assignee(); t.assignees = t.assignee ? [t.assignee] : []; } if (b.due !== undefined) { t.due = dueTs(b.due); delete t.reminded; } }
    else fail(400, 'Bad operation');
    store.save(); emit('todos', { chan, todos: e.todos }, audience(chan)); json(res, 200, { ok: true });
  };

  // ----- calendar -----
  api['POST /api/event'] = async (req, res, me) => {
    const b = await body(req, 4096), chan = str(b.chan, 64), e = writer(me, chan), op = str(b.op, 10);
    const find = () => { const x = e.events.find((y) => y.id === str(b.id, 12)); if (!x) fail(404, 'No such event'); return x; };
    if (op === 'add' || op === 'edit') {
      const x = op === 'add' ? { id: rid(6), by: me.id, ts: Date.now() } : find();
      if (op === 'edit' && x.by !== me.id && !isAdmin(me)) fail(403, 'Only the creator or an admin can change this.');
      const title = str(b.title, 100).trim(), start = dueTs(b.start); if (!title || !start) fail(400, 'An event needs a title and a start time.');
      x.title = title; x.start = start; x.end = dueTs(b.end) || 0; x.notes = str(b.notes, 300); x.remind = Math.max(0, Math.min(Math.round(Number(b.remind)) || 0, 10080)); delete x.reminded;
      if (op === 'add') { if (e.events.length >= 200) fail(400, 'Too many events.'); e.events.push(x); }
    } else if (op === 'del') { const x = find(); if (x.by !== me.id && !isAdmin(me)) fail(403, 'Only the creator or an admin can delete this.'); e.events = e.events.filter((y) => y !== x); }
    else fail(400, 'Bad operation');
    e.events.sort((a, c) => a.start - c.start); store.save(); emit('events', { chan, events: e.events }, audience(chan)); json(res, 200, { ok: true });
  };

  ctx.ticks.push({ every: 20000, fn: (now) => {
    for (const [chan, e] of Object.entries(db.extras)) {
      if (!db.channels[chan] && !chan.startsWith('dm:')) continue;
      let dirty = false;
      for (const x of e.events) if (x.remind && !x.reminded && x.start - x.remind * 60000 <= now && x.start > now - 3600000) {
        x.reminded = true; dirty = true; const when = x.start - now > 60000 ? `in ${Math.round((x.start - now) / 60000)} min` : 'now';
        sysMsg(chan, `⏰ ${x.title} starts ${when}`); emit('reminder', { chan, text: `${x.title} starts ${when}`, ts: now }, audience(chan));
      }
      for (const t of e.todos) if (t.due && !t.done && !t.reminded && t.due <= now) {
        t.reminded = true; dirty = true; sysMsg(chan, `⏰ Task due: ${t.text}`);
        const who = Array.isArray(t.assignees) && t.assignees.length ? t.assignees : t.assignee ? [t.assignee] : null;
        emit('reminder', { chan, text: `Task due: ${t.text}`, ts: now }, who || audience(chan));
      }
      if (dirty) { store.save(); emit('events', { chan, events: e.events }, audience(chan)); emit('todos', { chan, todos: e.todos }, audience(chan)); }
    }
  } });
};
