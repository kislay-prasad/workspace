'use strict';
// Tasks board (like Planner): buckets, labels, cards with assignees, dates, priority, progress, notes, checklist,
// comments and attachments. Tasks stay in db.extras[chan].todos (the old to-do list), so old to-dos show up as cards
// and the old /api/todo route keeps working. Buckets and labels live in ctx.coll('ap_plans').
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, isAdmin, canSee, audience, emit } = ctx;
  const A = ctx.apps;
  const LABEL_COLORS = ['#e8608a', '#d13438', '#ca5010', '#e3b200', '#498205', '#038387', '#0078d4', '#5b5fc7', '#8764b8', '#69797e'];
  const PRIO = ['urgent', 'important', 'medium', 'low'], PROG = ['notstarted', 'inprogress', 'completed'];
  A.perChat('ap_plans');
  const ex = (chan) => (db.extras[chan] ||= { note: { text: '', v: 0, by: null, ts: 0 }, board: [], todos: [], events: [] });
  const defPlan = () => ({ buckets: [{ id: 'todo', name: 'To do' }], labels: LABEL_COLORS.map((c, i) => ({ id: 'l' + (i + 1), name: '', color: c })) });
  const planOf = (chan) => A.peek('ap_plans', chan) || { cc: A.created(chan), ...defPlan() };
  const planW = (chan) => A.chatRec('ap_plans', chan, defPlan);
  const planOut = (p) => ({ buckets: p.buckets, labels: p.labels });
  // old to-dos only have { id, text, done, by, assignee, due, ts }: fill in the board fields
  const norm = (t, plan) => {
    if (!Array.isArray(t.assignees)) t.assignees = t.assignee ? [t.assignee] : [];
    if (!plan.buckets.some((b) => b.id === t.bucket)) t.bucket = plan.buckets[0].id;
    if (typeof t.order !== 'number') t.order = -(t.ts || 0) / 1e6;
    t.progress = t.done ? 'completed' : t.progress === 'inprogress' ? 'inprogress' : 'notstarted';
    t.priority = PRIO.includes(t.priority) ? t.priority : 'medium';
    for (const k of ['labels', 'checklist', 'comments', 'links', 'files']) if (!Array.isArray(t[k])) t[k] = [];
    if (typeof t.notes !== 'string') t.notes = ''; if (!t.start) t.start = 0; if (!t.due) t.due = 0;
    return t;
  };
  const tasksOf = (chan) => { const e = db.extras[chan]; if (!e) return []; const p = planOf(chan); return e.todos.map((t) => norm(t, p)); };
  const emitTask = (chan, t) => A.toChat('ap_task', chan, { task: t });
  const notifyAssigned = (me, chan, t, ids) => { for (const uid of ids) A.notify(uid, { type: 'task', from: me.id, chan, text: t.text, ref: { app: 'tasks', id: t.id } }); };
  A.notifyAssigned = notifyAssigned;

  api['GET /api/ap/tasks'] = async (req, res, me, url) => {
    const chan = A.see(me, url.searchParams.get('chan'));
    json(res, 200, { plan: planOut(planOf(chan)), tasks: tasksOf(chan), canDelAll: isAdmin(me) });
  };
  // "My tasks": everything assigned to me in every chat I can see
  api['GET /api/ap/mytasks'] = async (req, res, me) => {
    const out = [], plans = [];
    for (const chan of Object.keys(db.extras)) {
      const e = db.extras[chan]; if (!e || !Array.isArray(e.todos) || !e.todos.length || !canSee(me, chan)) continue;
      const p = planOf(chan), list = e.todos.map((t) => norm(t, p));
      plans.push({ chan, total: list.length, open: list.filter((t) => !t.done).length });
      for (const t of list) if (t.assignees.includes(me.id)) out.push({ ...t, chan, bucketName: (p.buckets.find((b) => b.id === t.bucket) || {}).name || '', labelDefs: p.labels.filter((l) => t.labels.includes(l.id)) });
      if (out.length > 1000) break;
    }
    json(res, 200, { tasks: out, plans });
  };

  // ----- one task -----
  const findTask = (e, id) => { const t = e.todos.find((x) => x.id === str(id, 12)); if (!t) fail(404, 'That task was deleted.'); return t; };
  const setFields = (me, chan, plan, t, b, isNew) => {
    const added = [];
    if (b.title !== undefined) { const v = A.line(b.title, 255); if (!v) fail(400, 'Give the task a name.'); t.text = v; }
    if (b.bucket !== undefined) { const bk = plan.buckets.find((x) => x.id === str(b.bucket, 12)); if (bk) t.bucket = bk.id; }
    if (b.assignees !== undefined) {
      const ids = A.ids(b.assignees, (x) => A.member(chan, x), 20);
      for (const i of ids) if (!t.assignees.includes(i) && i !== me.id) added.push(i);
      t.assignees = ids; t.assignee = ids[0] || '';
    }
    if (b.start !== undefined) t.start = A.ts(b.start);
    if (b.due !== undefined) { t.due = A.ts(b.due); delete t.reminded; }
    if (b.priority !== undefined) t.priority = A.oneOf(b.priority, PRIO, 'medium');
    if (b.labels !== undefined) t.labels = A.ids(b.labels, (x) => (plan.labels.some((l) => l.id === x) ? x : ''), 10);
    if (b.progress !== undefined) { const p = A.oneOf(b.progress, PROG, 'notstarted'); const done = p === 'completed'; if (done !== !!t.done) t.doneBy = done ? me.id : null; t.done = done; t.progress = p; if (done) t.doneTs = Date.now(); }
    if (b.notes !== undefined) t.notes = A.text(b.notes, 10000);
    if (!isNew) { t.ets = Date.now(); t.eby = me.id; }
    return added;
  };
  api['POST /api/ap/task'] = async (req, res, me) => {
    const b = await body(req, 32768), chan = A.writer(me, b.chan), op = str(b.op, 12), e = ex(chan), plan = planW(chan);
    if (!rate('aptask:' + me.id, 240, 60000)) fail(429, 'Slow down a little.');
    for (const t of e.todos) norm(t, plan);
    let t;
    if (op === 'add') {
      if (e.todos.length >= 500) fail(400, 'This board is full (500 tasks). Delete some finished ones first.');
      const bucket = plan.buckets.find((x) => x.id === str(b.bucket, 12)) || plan.buckets[0];
      const top = e.todos.filter((x) => x.bucket === bucket.id).reduce((m, x) => Math.min(m, x.order), 0);
      t = norm({ id: rid(6), text: '', done: false, by: me.id, assignee: '', due: 0, ts: Date.now(), bucket: bucket.id, order: top - 1 }, plan);
      const added = setFields(me, chan, plan, t, { title: b.title, assignees: b.assignees, due: b.due, start: b.start, priority: b.priority, labels: b.labels, progress: b.progress, notes: b.notes }, true);
      if (!t.text) fail(400, 'Give the task a name.');
      e.todos.push(t); store.save(); emitTask(chan, t); notifyAssigned(me, chan, t, added); return json(res, 200, { ok: true, task: t });
    }
    t = findTask(e, b.id);
    if (op === 'update') {
      const added = setFields(me, chan, plan, t, isObj(b.set) ? b.set : {}, false); store.save(); emitTask(chan, t); notifyAssigned(me, chan, t, added);
    } else if (op === 'move') { // drag and drop: new bucket and place (before another task, or at the end)
      const bk = plan.buckets.find((x) => x.id === str(b.bucket, 12)) || plan.buckets.find((x) => x.id === t.bucket);
      const col = e.todos.filter((x) => x.bucket === bk.id && x !== t).sort((x, y) => x.order - y.order);
      let i = b.before ? col.findIndex((x) => x.id === str(b.before, 12)) : -1; if (i < 0) i = col.length;
      col.splice(i, 0, t); col.forEach((x, k) => { x.order = k; }); t.bucket = bk.id;
      const added = b.set && isObj(b.set) ? setFields(me, chan, plan, t, { progress: b.set.progress, priority: b.set.priority, assignees: b.set.assignees }, false) : [];
      store.save(); A.toChat('ap_task', chan, { tasks: col }); notifyAssigned(me, chan, t, added);
      return json(res, 200, { ok: true });
    } else if (op === 'check') { // checklist items
      const act = str(b.act, 8), list = t.checklist, item = () => { const x = list.find((y) => y.id === str(b.item, 12)); if (!x) fail(404, 'That item was removed.'); return x; };
      if (act === 'add') { if (list.length >= 50) fail(400, 'A checklist holds 50 items.'); const v = A.line(b.text, 300); if (!v) fail(400, 'Write the item first.'); list.push({ id: rid(4), text: v, done: false }); }
      else if (act === 'toggle') { const x = item(); x.done = !x.done; }
      else if (act === 'edit') { const x = item(), v = A.line(b.text, 300); if (v) x.text = v; }
      else if (act === 'del') { const x = item(); t.checklist = list.filter((y) => y !== x); }
      else if (act === 'move') { const x = item(), i = list.indexOf(x), j = A.int(b.to, 0, list.length - 1, i); list.splice(i, 1); list.splice(j, 0, x); }
      else fail(400, 'Bad operation');
      t.ets = Date.now(); t.eby = me.id; store.save(); emitTask(chan, t);
    } else if (op === 'comment') {
      if (b.del) { const c = t.comments.find((x) => x.id === str(b.del, 12)); if (!c) fail(404, 'Comment not found'); if (c.by !== me.id && !isAdmin(me)) fail(403, 'You can only delete your own comments.'); t.comments = t.comments.filter((x) => x !== c); }
      else { const v = A.text(b.text, 2000).trim(); if (!v) fail(400, 'Write a comment first.'); if (t.comments.length >= 200) t.comments.shift(); t.comments.push({ id: rid(4), by: me.id, ts: Date.now(), text: v }); for (const uid of t.assignees) if (uid !== me.id) A.notify(uid, { type: 'task', from: me.id, chan, text: `Comment on “${t.text}”: ${v.slice(0, 120)}`, ref: { app: 'tasks', id: t.id } }); }
      store.save(); emitTask(chan, t);
    } else if (op === 'attach') { // links and files
      if (b.del) { t.links = t.links.filter((x) => x.id !== str(b.del, 12)); t.files = t.files.filter((x) => x.id !== str(b.del, 24)); }
      else if (b.file) { if (t.files.length >= 20) fail(400, 'Too many attachments.'); const f = A.fileRef(me, b.file); if (!f) fail(400, 'That file is no longer available.'); if (!t.files.some((x) => x.id === f.id)) t.files.push(f); }
      else { if (t.links.length >= 20) fail(400, 'Too many attachments.'); const u = A.url(b.url); if (!u) fail(400, 'Enter a web address that starts with http:// or https://'); t.links.push({ id: rid(4), url: u, name: A.line(b.name, 120) || u }); }
      t.ets = Date.now(); t.eby = me.id; store.save(); emitTask(chan, t);
    } else if (op === 'del') {
      if (t.by !== me.id && !isAdmin(me)) fail(403, 'Only the creator or an admin can delete this.');
      e.todos = e.todos.filter((x) => x !== t); store.save(); A.toChat('ap_task', chan, { del: t.id });
    } else fail(400, 'Bad operation');
    json(res, 200, { ok: true, task: t });
  };

  // ----- buckets and labels -----
  api['POST /api/ap/plan'] = async (req, res, me) => {
    const b = await body(req, 4096), chan = A.writer(me, b.chan), op = str(b.op, 12), p = planW(chan), e = ex(chan);
    const bucket = () => { const x = p.buckets.find((y) => y.id === str(b.id, 12)); if (!x) fail(404, 'That bucket was deleted.'); return x; };
    if (op === 'addbucket') { if (p.buckets.length >= 30) fail(400, 'Too many buckets.'); const n = A.line(b.name, 60); if (!n) fail(400, 'Name the bucket.'); const x = { id: rid(4), name: n }; const at = A.int(b.at, 0, p.buckets.length, p.buckets.length); p.buckets.splice(at, 0, x); }
    else if (op === 'rename') { const x = bucket(), n = A.line(b.name, 60); if (!n) fail(400, 'Name the bucket.'); x.name = n; }
    else if (op === 'movebucket') { const x = bucket(), i = p.buckets.indexOf(x), j = A.int(b.to, 0, p.buckets.length - 1, i); p.buckets.splice(i, 1); p.buckets.splice(j, 0, x); }
    else if (op === 'delbucket') { // its tasks move to the first remaining bucket
      const x = bucket(); if (p.buckets.length <= 1) fail(400, 'A board needs at least one bucket.');
      p.buckets = p.buckets.filter((y) => y !== x); for (const t of e.todos) if (t.bucket === x.id) { t.bucket = p.buckets[0].id; emit('ap_task', { chan, task: norm(t, p) }, audience(chan)); }
    } else if (op === 'label') { const l = p.labels.find((y) => y.id === str(b.id, 4)); if (!l) fail(404, 'No such label'); l.name = A.line(b.name, 40); }
    else fail(400, 'Bad operation');
    store.save(); A.toChat('ap_plan', chan, { plan: planOut(p) }); json(res, 200, { ok: true, plan: planOut(p) });
  };

  // files attached to tasks stay available to the people in that chat
  A.keepFiles(() => Object.values(db.extras).flatMap((e) => (e && Array.isArray(e.todos) ? e.todos.flatMap((t) => (t.files || []).map((f) => f.id)) : [])));
  A.shareFiles((u, id) => Object.entries(db.extras).some(([chan, e]) => e && Array.isArray(e.todos) && e.todos.some((t) => (t.files || []).some((f) => f.id === id)) && canSee(u, chan)));
};
