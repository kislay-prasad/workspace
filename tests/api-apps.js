'use strict';
// API tests for the built-in apps (docs/features-apps.md): tabs, tasks board, whiteboard objects, notebook, forms,
// approvals, lists, shifts, bookings, check-ins, website check, live components, and the files those apps use.
const H = require('./harness');
H.suite('Built-in apps', async (t) => {
  const s = await t.server();
  const host = s.owner, bob = await s.user('Bob'), carol = await s.user('Carol'), dave = await s.user('Dave'), erin = await s.user('Erin');
  const P = (p, b, who) => s.call('POST', p, b, who.token), G = (p, who) => s.call('GET', p, undefined, who.token);
  const grp = (await P('/api/channel', { name: 'Crew', members: [bob.id, carol.id] }, host)).d.id; // dave is not in it
  const enc = encodeURIComponent;

  await t.section('tabs: add, rename, reorder, remove; only members; defaults stay for others', async () => {
    let r = await P('/api/ap/tabs', { chan: grp, op: 'add', type: 'ap_notebook' }, bob); t.eq(r.s, 200, r.d); t.ok(r.d.cfg.added.some((x) => x.type === 'ap_notebook'));
    r = await P('/api/ap/tabs', { chan: grp, op: 'add', type: 'ap_web', multi: true, name: 'Wiki', url: 'http://192.168.1.20/wiki' }, carol); t.eq(r.s, 200, r.d);
    const wkey = r.d.key; t.ok(/^ap_web:[a-f0-9]{12}$/.test(wkey), wkey);
    t.eq((await P('/api/ap/tabs', { chan: grp, op: 'add', type: 'ap_web', multi: true, url: 'javascript:alert(1)' }, carol)).s, 400, 'only http(s) websites');
    t.eq((await P('/api/ap/tabs', { chan: grp, op: 'rename', key: wkey, name: 'Team wiki' }, bob)).s, 403, 'bob did not add it and is not the owner');
    t.eq((await P('/api/ap/tabs', { chan: grp, op: 'rename', key: wkey, name: 'Team wiki' }, carol)).s, 200);
    t.eq((await P('/api/ap/tabs', { chan: grp, op: 'order', keys: [wkey, 'notes'] }, carol)).s, 403, 'reorder: group owner or admin');
    r = await P('/api/ap/tabs', { chan: grp, op: 'order', keys: [wkey, 'notes', 'bad key!'] }, host); t.eq(r.d.cfg.order, [wkey, 'notes']);
    r = await P('/api/ap/tabs', { chan: grp, op: 'remove', key: 'calendar' }, host); t.ok(r.d.cfg.hidden.includes('calendar'));
    t.eq((await P('/api/ap/tabs', { chan: grp, op: 'add', type: 'ap_notebook' }, dave)).s, 404, 'not in the group');
    t.eq((await G('/api/ap/tabs?chan=' + grp, dave)).s, 404);
    const ev = s.sse(carol.token); const init = await ev.waitFor('init'); ev.close(); t.ok(init.apTabs[grp] && init.apTabs[grp].names[wkey] === 'Team wiki', init.apTabs);
    const evd = s.sse(dave.token); const initd = await evd.waitFor('init'); evd.close(); t.ok(!initd.apTabs[grp], 'dave gets no tab list of a group he is not in');
  });

  await t.section('tasks board: buckets, fields, move, checklist, comments, attachments, activity, my tasks', async () => {
    const ev = s.sse(carol.token); await s.wait(100);
    let r = await P('/api/ap/plan', { chan: grp, op: 'addbucket', name: 'Doing' }, bob); t.eq(r.s, 200, r.d); const doing = r.d.plan.buckets[1].id;
    r = await P('/api/ap/task', { chan: grp, op: 'add', title: 'Book the hall', assignees: [carol.id, dave.id], due: Date.now() + 86400000, priority: 'urgent', labels: ['l1', 'zz'] }, bob);
    t.eq(r.s, 200, r.d); const task = r.d.task; t.eq(task.assignees, [carol.id], 'dave is not in the group'); t.eq(task.labels, ['l1']); t.eq(task.priority, 'urgent');
    const act = await ev.waitFor('activity', (a) => a.type === 'task' && a.ref && a.ref.id === task.id); t.eq(act.from, bob.id);
    r = await P('/api/ap/task', { chan: grp, op: 'update', id: task.id, set: { progress: 'inprogress', notes: 'call first', bucket: doing } }, carol); t.eq(r.d.task.progress, 'inprogress'); t.eq(r.d.task.bucket, doing);
    r = await P('/api/ap/task', { chan: grp, op: 'check', id: task.id, act: 'add', text: 'Ask for price' }, carol); t.eq(r.d.task.checklist.length, 1);
    r = await P('/api/ap/task', { chan: grp, op: 'check', id: task.id, act: 'toggle', item: r.d.task.checklist[0].id }, carol); t.eq(r.d.task.checklist[0].done, true);
    r = await P('/api/ap/task', { chan: grp, op: 'comment', id: task.id, text: 'On it' }, carol); t.eq(r.d.task.comments[0].text, 'On it');
    t.eq((await P('/api/ap/task', { chan: grp, op: 'attach', id: task.id, url: 'ftp://x' }, carol)).s, 400);
    r = await P('/api/ap/task', { chan: grp, op: 'attach', id: task.id, url: 'https://example.com/hall', name: 'Hall site' }, carol); t.eq(r.d.task.links[0].name, 'Hall site');
    const t2 = (await P('/api/ap/task', { chan: grp, op: 'add', title: 'Second' }, bob)).d.task;
    r = await P('/api/ap/task', { chan: grp, op: 'move', id: t2.id, bucket: doing, before: task.id }, bob); t.eq(r.s, 200, r.d);
    const all = (await G('/api/ap/tasks?chan=' + grp, carol)).d; const inDoing = all.tasks.filter((x) => x.bucket === doing).sort((a, b) => a.order - b.order).map((x) => x.text); t.eq(inDoing, ['Second', 'Book the hall']);
    const mine = (await G('/api/ap/mytasks', carol)).d; t.ok(mine.tasks.some((x) => x.id === task.id && x.chan === grp && x.bucketName === 'Doing'), mine);
    t.eq((await G('/api/ap/mytasks', dave)).d.tasks.length, 0, 'dave sees nothing from the group');
    t.eq((await P('/api/ap/task', { chan: grp, op: 'del', id: task.id }, carol)).s, 403, 'only creator/admin delete');
    r = await P('/api/ap/plan', { chan: grp, op: 'delbucket', id: doing }, bob); t.eq(r.s, 200); const after = (await G('/api/ap/tasks?chan=' + grp, bob)).d.tasks; t.ok(after.every((x) => x.bucket === 'todo'), 'tasks moved to the first bucket');
    t.eq((await G('/api/ap/tasks?chan=' + grp, dave)).s, 404); ev.close();
  });

  await t.section('old to-dos show up as cards and the old route keeps working', async () => {
    await P('/api/todo', { chan: 'general', op: 'add', text: 'Old style', assignee: bob.id }, host);
    const d = (await G('/api/ap/tasks?chan=general', bob)).d, x = d.tasks.find((y) => y.text === 'Old style');
    t.ok(x && x.bucket === 'todo' && x.progress === 'notstarted' && x.assignees[0] === bob.id, x);
    await P('/api/todo', { chan: 'general', op: 'toggle', id: x.id }, bob); const y = (await G('/api/ap/tasks?chan=general', bob)).d.tasks.find((z) => z.id === x.id); t.eq(y.progress, 'completed');
    s.db.extras.general.todos.push({ id: 'abc123abc123', text: 'Very old', done: false, by: host.id, assignee: '', due: 0, ts: 1 }); // stored by an older LANChat
    t.ok((await G('/api/ap/tasks?chan=general', bob)).d.tasks.some((z) => z.text === 'Very old' && z.bucket === 'todo'));
  });

  await t.section('whiteboard: shapes, text, sticky notes, move, stacking, delete; old strokes still load', async () => {
    await P('/api/board/stroke', { chan: grp, stroke: { c: '#ff0000', w: 4, pts: [1, 2, 300, 400] } }, bob);
    let r = await P('/api/ap/board', { chan: grp, op: 'addmany', objs: [{ t: 'rect', x: -50, y: 10, w: 200, h: 100, c: '#111111', f: 'none' }, { t: 'sticky', x: 400, y: 50, w: 200, h: 200, text: 'Idea', f: '#ffc0cb' }, { t: 'arrow', pts: [0, 0, 5000, 90000] }, { t: 'text', x: 0, y: 0, w: 300, h: 50, text: '<b>hi</b>' }] }, bob);
    t.eq(r.s, 200, r.d); const [rect, , arrow] = r.d.ids;
    let b = (await G('/api/collab?chan=' + grp, carol)).d.board; t.eq(b.length, 5); t.eq(b[0].pts, [1, 2, 300, 400]); t.eq(b.find((o) => o.id === arrow).pts, [0, 0, 5000, 20000], 'clamped');
    t.eq(b.find((o) => o.t === 'text').text, '<b>hi</b>', 'drawn as plain text on the canvas');
    t.eq((await P('/api/ap/board', { chan: grp, op: 'add', obj: { t: 'script' } }, bob)).s, 400);
    r = await P('/api/ap/board', { chan: grp, op: 'upd', objs: [{ id: rect, t: 'rect', x: 10, y: 10, w: 50, h: 50, c: '#00ff00', f: '#ffffff' }] }, carol); t.eq(r.d.n, 1);
    await P('/api/ap/board', { chan: grp, op: 'back', ids: [arrow] }, carol); b = (await G('/api/collab?chan=' + grp, carol)).d.board; t.eq(b[0].id, arrow);
    await P('/api/ap/board', { chan: grp, op: 'del', ids: [rect] }, carol); b = (await G('/api/collab?chan=' + grp, carol)).d.board; t.ok(!b.some((o) => o.id === rect));
    t.eq((await P('/api/ap/board', { chan: grp, op: 'add', obj: { t: 'rect', x: 0, y: 0, w: 1, h: 1 } }, dave)).s, 404);
    t.eq((await P('/api/ap/board', { chan: grp, op: 'add', obj: { t: 'image', x: 0, y: 0, w: 10, h: 10, img: { id: 'a'.repeat(24) } } }, bob)).s, 400, 'unknown picture');
  });

  await t.section('pictures on a whiteboard or a page are readable by the chat and kept by clean-up', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const up = (await s.upload(bob.token, 'pic.png', png)).d;
    t.eq((await fetch(`${s.B}/files/${up.id}/pic.png?token=${carol.token}`)).status, 404, 'not shared yet');
    const r = await P('/api/ap/board', { chan: grp, op: 'add', obj: { t: 'image', x: 0, y: 0, w: 10, h: 10, img: { id: up.id } } }, bob); t.eq(r.s, 200, r.d);
    t.eq((await P('/api/ap/board', { chan: grp, op: 'add', obj: { t: 'image', x: 0, y: 0, w: 10, h: 10, img: { id: up.id } } }, carol)).s, 400, 'carol cannot attach bob’s upload');
    t.eq((await fetch(`${s.B}/files/${up.id}/pic.png?token=${carol.token}`)).status, 200, 'a member sees it');
    t.eq((await fetch(`${s.B}/files/${up.id}/pic.png?token=${dave.token}`)).status, 404, 'an outsider does not');
    s.db.files[up.id].ts = Date.now() - 3 * 86400000; s.ctx.gcFiles([up.id]); t.ok(s.db.files[up.id], 'clean-up keeps it');
  });

  await t.section('notebook: sections, pages, sanitised rich text, version conflicts, live tree', async () => {
    let r = await P('/api/ap/nb', { chan: grp, op: 'addsec', name: 'Trip' }, bob); t.eq(r.s, 200, r.d); const sec = r.d.id;
    r = await P('/api/ap/nb', { chan: grp, op: 'addpage', sec, title: 'Packing' }, bob); const page = r.d.id;
    const evil = '<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://ok.example">ok</a><a href="jav&#x61;script:alert(1)">x</a></p><iframe src="//evil"></iframe><p class="ap-chk on evil" style="color:red">done</p><table><tr><td colspan="2">c</td></tr></table><img data-fid="' + 'b'.repeat(24) + '" data-fname="a&quot;onerror=&quot;x.png" src="https://track">';
    r = await P('/api/ap/nb/page', { chan: grp, id: page, v: 1, html: evil, title: 'Packing list' }, bob); t.eq(r.s, 200, r.d);
    const h = r.d.page.html;
    t.ok(!/<script|\son[a-z]+=|javascript:|<iframe|style=|\ssrc=/i.test(h), h);
    t.ok(h.includes('<b>there</b>') && h.includes('href="https://ok.example"') && h.includes('class="ap-chk on"') && h.includes('colspan="2"') && h.includes('data-fid="' + 'b'.repeat(24) + '"'), h);
    t.eq((await P('/api/ap/nb/page', { chan: grp, id: page, v: 1, html: '<p>mine</p>' }, carol)).s, 409, 'stale version');
    const c = await P('/api/ap/nb/page', { chan: grp, id: page, v: 1, html: '<p>mine</p>' }, carol); t.eq(c.d.page.v, 2); t.ok(c.d.page.html.includes('there'), 'the conflict answer carries their page');
    r = await P('/api/ap/nb/page', { chan: grp, id: page, v: 2, html: '<p>merged</p>' }, carol); t.eq(r.d.page.v, 3);
    t.eq((await G(`/api/ap/nb/page?chan=${grp}&id=${page}`, dave)).s, 404);
    t.eq((await G(`/api/ap/nb/page?chan=${grp}&id=${page}`, bob)).d.page.html, '<p>merged</p>');
    t.eq((await P('/api/ap/nb/page', { chan: grp, id: page, v: 3, html: 'x'.repeat(200001) }, bob)).s, 413);
    r = await P('/api/ap/nb', { chan: grp, op: 'renpage', id: page, title: 'Packing (final)' }, carol); t.eq(r.d.tree[0].pages[0].title, 'Packing (final)');
  });

  await t.section('forms: build, share as a card, respond once, anonymous, quiz score, close, results privacy', async () => {
    let r = await P('/api/ap/form/save', { title: 'Lunch', desc: 'Pick', anon: false, qs: [{ id: 'q1', type: 'choice', text: 'Food?', req: true, opts: [{ id: 'a', t: 'Pizza' }, { id: 'b', t: 'Sushi' }] }, { id: 'q2', type: 'rating', text: 'Hunger', max: 5 }, { id: 'q3', type: 'likert', text: 'Rate', rows: ['Taste', 'Price'], cols: ['Bad', 'Good'] }, { id: 'q4', type: 'ranking', text: 'Order', opts: ['x', 'y', 'z'] }, { type: 'date', text: 'When' }, { type: 'text', text: 'Notes', long: true }] }, bob);
    t.eq(r.s, 200, r.d); const f = r.d.form;
    r = await P('/api/ap/form/post', { id: f.id, chan: grp }, bob); t.eq(r.s, 200, r.d);
    const msg = s.ctx.msgById.get(r.d.msg); t.eq(msg.apCard.kind, 'form'); t.eq(msg.apCard.n, 0);
    t.eq((await P('/api/send', { chan: grp, text: 'x', apCard: { kind: 'form', id: 'fake' } }, carol)).s, 200); t.ok(!s.db.messages[s.db.messages.length - 1].apCard, 'clients cannot post cards');
    t.eq((await P('/api/ap/form/respond', { id: f.id, a: { q2: 3 } }, carol)).s, 400, 'required question');
    const ranking = f.qs.find((q) => q.id === 'q4').opts.map((o) => o.id);
    r = await P('/api/ap/form/respond', { id: f.id, a: { q1: 'a', q2: 9, q3: { [f.qs[2].rows[0].id]: f.qs[2].cols[1].id }, q4: ranking } }, carol); t.eq(r.s, 200, r.d);
    t.eq(r.d.form.mine[0].a.q2, undefined, 'out-of-range rating dropped'); t.eq(r.d.form.mine[0].a.q4, ranking);
    await P('/api/ap/form/respond', { id: f.id, a: { q1: 'b' } }, carol); const g = (await G('/api/ap/form?id=' + f.id, bob)).d.form;
    t.eq(g.responses.length, 1, 'one response per person: the second replaces the first'); t.eq(g.responses[0].a.q1, 'b'); t.eq(g.responses[0].by, carol.id);
    t.eq(s.ctx.msgById.get(msg.id).apCard.n, 1, 'card count updates');
    t.eq((await G('/api/ap/form?id=' + f.id, carol)).d.form.responses, undefined, 'respondents do not see results unless shared');
    t.eq((await G('/api/ap/form?id=' + f.id, dave)).s, 404); t.eq((await P('/api/ap/form/respond', { id: f.id, a: { q1: 'a' } }, dave)).s, 404);
    await P('/api/ap/form/close', { id: f.id, closed: true }, bob); t.eq((await P('/api/ap/form/respond', { id: f.id, a: { q1: 'a' } }, host)).s, 400, 'closed');
    t.eq((await P('/api/ap/form/close', { id: f.id, closed: false }, carol)).s, 403);
    // anonymous quiz with several responses per person
    r = await P('/api/ap/form/save', { title: 'Quiz', anon: true, multi: true, showResults: true, qs: [{ id: 'q', type: 'choice', text: '2+2', opts: [{ id: 'a', t: '4' }, { id: 'b', t: '5' }], correct: ['a'], pts: 2 }] }, bob);
    const qz = r.d.form; t.ok(qz.quiz); await P('/api/ap/form/post', { id: qz.id, chan: grp }, bob);
    t.eq((await G('/api/ap/form?id=' + qz.id, carol)).d.form.qs[0].correct, undefined, 'answers hidden before responding');
    r = await P('/api/ap/form/respond', { id: qz.id, a: { q: 'a' } }, carol); t.eq(r.d.score, { got: 2, max: 2 });
    await P('/api/ap/form/respond', { id: qz.id, a: { q: 'b' } }, carol);
    const res2 = (await G('/api/ap/form?id=' + qz.id, carol)).d.form; t.eq(res2.responses.length, 2); t.ok(res2.responses.every((x) => x.by === null), 'anonymous');
    t.eq((await G('/api/ap/form?id=' + qz.id, bob)).d.form.responses[0].by, null, 'even the owner does not see names');
  });

  await t.section('approvals: request in a chat, approvers answer, everyone vs first, cancel, activity', async () => {
    const ev = s.sse(bob.token); await s.wait(100);
    t.eq((await P('/api/ap/approval/new', { title: 'Buy chairs', chan: grp, approvers: [dave.id] }, host)).s, 400, 'approvers come from the chat');
    let r = await P('/api/ap/approval/new', { title: 'Buy chairs', details: '4 chairs', chan: grp, approvers: [bob.id, carol.id], mode: 'all' }, host); t.eq(r.s, 200, r.d);
    const a = r.d.approval; t.ok(a.msg); await ev.waitFor('activity', (x) => x.type === 'approval' && x.ref.id === a.id);
    t.eq((await P('/api/ap/approval/respond', { id: a.id, decision: 'approve' }, dave)).s, 404);
    r = await P('/api/ap/approval/respond', { id: a.id, decision: 'approve', comment: 'ok' }, bob); t.eq(r.d.approval.status, 'pending');
    t.eq((await P('/api/ap/approval/respond', { id: a.id, decision: 'reject' }, bob)).s, 400, 'answer once');
    r = await P('/api/ap/approval/respond', { id: a.id, decision: 'approve' }, carol); t.eq(r.d.approval.status, 'approved');
    t.eq(s.ctx.msgById.get(a.msg).apCard.status, 'approved', 'card shows the result');
    const recv = (await G('/api/ap/approvals?box=received', carol)).d.approvals; t.ok(recv.some((x) => x.id === a.id));
    const sent = (await G('/api/ap/approvals?box=sent', host)).d.approvals; t.ok(sent.some((x) => x.id === a.id));
    r = await P('/api/ap/approval/new', { title: 'Pizza', approvers: [bob.id, carol.id], mode: 'first' }, dave); const b2 = r.d.approval; t.eq(b2.chan, '');
    r = await P('/api/ap/approval/respond', { id: b2.id, decision: 'reject', comment: 'no' }, carol); t.eq(r.d.approval.status, 'rejected');
    t.eq((await G('/api/ap/approval?id=' + b2.id, host)).s, 200, 'admins can look');
    r = await P('/api/ap/approval/new', { title: 'Later', approvers: [bob.id] }, dave); t.eq((await P('/api/ap/approval/cancel', { id: r.d.approval.id }, bob)).s, 403);
    t.eq((await P('/api/ap/approval/cancel', { id: r.d.approval.id }, dave)).d.approval.status, 'canceled'); ev.close();
  });

  await t.section('lists: templates, typed values, rows, columns, personal lists are private', async () => {
    let r = await P('/api/ap/list/new', { chan: grp, name: 'Bugs', template: 'issues' }, bob); t.eq(r.s, 200, r.d); const id = r.d.id;
    const l = (await G('/api/ap/list?id=' + id, carol)).d.list; t.ok(l.cols.length >= 5); const [title, , prio, , who] = l.cols;
    r = await P('/api/ap/list/row', { id, op: 'add', v: { [title.id]: 'Crash', [prio.id]: prio.choices[0].id, [who.id]: carol.id } }, carol); t.eq(r.s, 200, r.d); const row = r.d.row;
    t.eq((await P('/api/ap/list/row', { id, op: 'add', v: { [prio.id]: 'nope' } }, carol)).s, 400, 'unknown choice');
    t.eq((await P('/api/ap/list/row', { id, op: 'add', v: { [who.id]: dave.id } }, carol)).s, 400, 'person must be in the chat');
    r = await P('/api/ap/list/col', { id, op: 'add', def: { name: 'Cost', type: 'number' } }, carol); const cost = r.d.cols[r.d.cols.length - 1];
    t.eq((await P('/api/ap/list/row', { id, op: 'edit', row: row.id, v: { [cost.id]: 'abc' } }, carol)).s, 400);
    r = await P('/api/ap/list/row', { id, op: 'edit', row: row.id, v: { [cost.id]: '12.5' } }, carol); t.eq(r.d.row.v[cost.id], 12.5); t.eq(r.d.row.v[title.id], 'Crash', 'other cells untouched');
    t.eq((await G('/api/ap/list?id=' + id, dave)).s, 404);
    const p = (await P('/api/ap/list/new', { name: 'Mine', template: 'contacts' }, dave)).d.id; t.eq((await G('/api/ap/list?id=' + p, bob)).s, 404, 'personal list');
    t.ok((await G('/api/ap/lists', dave)).d.lists.some((x) => x.id === p));
    t.eq((await P('/api/ap/list/delete', { id }, carol)).s, 403); t.eq((await P('/api/ap/list/delete', { id }, bob)).s, 200);
  });

  await t.section('shifts: owner edits, members view and request open shifts, clock in/out', async () => {
    t.eq((await P('/api/ap/shifts/create', { chan: grp }, bob)).s, 200);
    const day = Date.now() + 86400000;
    t.eq((await P('/api/ap/shift', { chan: grp, op: 'add', shift: { uid: carol.id, start: day, end: day + 3600000 } }, carol)).s, 403, 'only the owner edits');
    let r = await P('/api/ap/shift', { chan: grp, op: 'addmany', shifts: [{ uid: carol.id, start: day, end: day + 8 * 3600000, label: 'Front desk' }, { uid: '', start: day, end: day + 3600000, label: 'Open' }] }, bob); t.eq(r.s, 200, r.d);
    const open = r.d.ids[1];
    t.eq((await P('/api/ap/shift', { chan: grp, op: 'add', shift: { uid: dave.id, start: day, end: day + 1 } }, bob)).s, 400, 'only chat members');
    r = await P('/api/ap/shift/request', { chan: grp, id: open }, carol); t.eq(r.s, 200, r.d);
    t.eq((await P('/api/ap/shift/request', { chan: grp, id: open }, carol)).s, 409);
    t.eq((await P('/api/ap/shift/decide', { chan: grp, req: r.d.req.id, approve: true }, carol)).s, 403);
    t.eq((await P('/api/ap/shift/decide', { chan: grp, req: r.d.req.id, approve: true }, bob)).s, 200);
    const v = (await G(`/api/ap/shifts?chan=${grp}&from=${day - 86400000}&to=${day + 86400000}`, carol)).d.schedule; t.eq(v.shifts.find((x) => x.id === open).uid, carol.id); t.eq(v.canEdit, false);
    t.eq((await P('/api/ap/clock', { chan: grp, act: 'out' }, carol)).s, 400);
    t.eq((await P('/api/ap/clock', { chan: grp, act: 'in' }, carol)).s, 200); t.eq((await P('/api/ap/clock', { chan: grp, act: 'in' }, carol)).s, 400);
    t.eq((await P('/api/ap/clock', { chan: grp, act: 'out' }, carol)).s, 200);
    const my = (await G(`/api/ap/myshifts?from=${day - 86400000}&to=${day + 86400000}`, carol)).d; t.eq(my.shifts.length, 2); t.eq(my.clock.length, 1);
    t.eq((await G(`/api/ap/shifts?chan=${grp}`, dave)).s, 404);
  });

  await t.section('bookings: services, staff hours, free slots only, no double booking, cancel, move', async () => {
    const tz = 'UTC', all = [[0, 1440]], hours = { 0: all, 1: all, 2: all, 3: all, 4: all, 5: all, 6: all };
    let r = await P('/api/ap/booking/save', { name: 'Haircuts', tz, services: [{ name: 'Cut', dur: 30 }], staff: [{ uid: carol.id, hours }] }, bob); t.eq(r.s, 200, r.d);
    const pg = r.d.page, svc = pg.services[0].id, slot = Math.ceil((Date.now() + 2 * 86400000) / 3600000) * 3600000;
    r = await P('/api/ap/book', { id: pg.id, svc, staff: carol.id, start: slot, note: 'short please' }, dave); t.eq(r.s, 200, r.d); const bk = r.d.booking;
    t.eq((await P('/api/ap/book', { id: pg.id, svc, staff: carol.id, start: slot + 15 * 60000 }, host)).s, 409, 'overlap');
    t.eq((await P('/api/ap/book', { id: pg.id, svc, staff: bob.id, start: slot }, host)).s, 400, 'not staff');
    t.eq((await P('/api/ap/book', { id: pg.id, svc, staff: carol.id, start: Date.now() - 86400000 }, host)).s, 400, 'past');
    const view = (await G('/api/ap/booking?id=' + pg.id, erin)).d.page; t.eq(view.bookings.length, 0, 'others see busy times only'); t.eq(view.busy.length, 1);
    t.eq((await G('/api/ap/booking?id=' + pg.id, host)).d.page.bookings.length, 1, 'admins see every booking');
    t.eq((await G('/api/ap/booking?id=' + pg.id, carol)).d.page.bookings.length, 1, 'staff sees the booking');
    t.eq((await P('/api/ap/book/cancel', { id: pg.id, bid: bk.id }, erin)).s, 403);
    r = await P('/api/ap/book/move', { id: pg.id, bid: bk.id, start: slot + 3600000 }, dave); t.eq(r.s, 200, r.d);
    t.eq((await P('/api/ap/book/cancel', { id: pg.id, bid: bk.id }, carol)).s, 200);
    // weekday hours in the page's time zone
    const wd = s.ctx.apps.wall('Asia/Kolkata', slot).wd, only = { [wd]: [[600, 720]] };
    r = await P('/api/ap/booking/save', { id: pg.id, name: 'Haircuts', tz: 'Asia/Kolkata', services: [{ id: svc, name: 'Cut', dur: 30 }], staff: [{ uid: carol.id, hours: only }] }, bob); t.eq(r.s, 200, r.d);
    const A = s.ctx.apps, w = A.wall('Asia/Kolkata', slot), ok = A.fromWall('Asia/Kolkata', w.y, w.m, w.d, 600);
    t.eq(A.wall('Asia/Kolkata', ok).min, 600);
    if (ok > Date.now()) { t.eq((await P('/api/ap/book', { id: pg.id, svc, staff: carol.id, start: ok }, dave)).s, 200); t.eq((await P('/api/ap/book', { id: pg.id, svc, staff: carol.id, start: ok + 120 * 60000 }, dave)).s, 400, 'outside hours'); }
  });

  await t.section('check-ins: schedule, prompt card + activity at the time, answers, summary', async () => {
    const ev = s.sse(carol.token); await s.wait(100);
    const now = new Date(), hhmm = String(now.getUTCHours()).padStart(2, '0') + ':' + String(now.getUTCMinutes()).padStart(2, '0');
    let r = await P('/api/ap/checkin', { chan: grp, op: 'add', title: 'Standup', qs: ['Yesterday?', 'Today?', 'Blockers?'], days: [0, 1, 2, 3, 4, 5, 6], time: hhmm, tz: 'UTC' }, bob); t.eq(r.s, 200, r.d);
    const id = r.d.id, c = s.ctx.apps.peek('ap_checkins', grp).list[0]; c.since = 0; // pretend it was made yesterday
    s.tick(Date.now()); const act = await ev.waitFor('activity', (a) => a.ref && a.ref.app === 'checkins'); t.eq(act.type, 'checkin'); t.eq(act.app, 'checkins');
    const day = act.ref.day, run = c.runs[day]; t.ok(run && run.msg, 'card posted'); t.eq(s.ctx.msgById.get(run.msg).apCard.kind, 'checkin');
    s.tick(Date.now()); t.eq(Object.keys(c.runs).length, 1, 'once a day');
    t.eq((await P('/api/ap/checkin/answer', { chan: grp, id, day, a: ['x'] }, dave)).s, 404);
    r = await P('/api/ap/checkin/answer', { chan: grp, id, day, a: ['Coded', 'Test', ''] }, carol); t.eq(r.s, 200, r.d);
    const list = (await G('/api/ap/checkins?chan=' + grp, bob)).d.list; t.eq(list[0].runs[0].ans[carol.id].a[0], 'Coded');
    t.eq(s.ctx.msgById.get(run.msg).apCard.n, 1);
    t.eq((await P('/api/ap/checkin', { chan: grp, op: 'run', id }, bob)).s, 409, 'already posted today');
    t.eq((await P('/api/ap/checkin', { chan: grp, op: 'del', id }, carol)).s, 403); ev.close();
  });

  await t.section('live components: checklist / table edited in place with version checks, live for everyone', async () => {
    let r = await P('/api/send', { chan: grp, text: 'Groceries', live: { kind: 'checklist', data: { title: 'Groceries', items: [{ text: 'Milk' }, { text: 'Eggs' }] } } }, bob); t.eq(r.s, 200, r.d);
    const id = r.d.id, ev = s.sse(carol.token); await s.wait(100);
    const m = s.ctx.msgById.get(id); t.eq(m.live.kind, 'checklist'); t.eq(m.live.data.items.length, 2);
    r = await P('/api/ap/live', { id, op: 'toggle', item: m.live.data.items[0].id }, carol); t.eq(r.d.live.data.items[0].done, true);
    await ev.waitFor('update', (x) => x.id === id && x.live.v === 2);
    r = await P('/api/ap/live', { id, op: 'edit', item: m.live.data.items[1].id, text: 'Brown eggs', base: 'Eggs' }, carol); t.eq(r.s, 200);
    t.eq((await P('/api/ap/live', { id, op: 'edit', item: m.live.data.items[1].id, text: 'White eggs', base: 'Eggs' }, bob)).s, 409, 'someone else changed it first');
    t.eq((await P('/api/ap/live', { id, op: 'add', text: 'Bread' }, dave)).s, 404);
    r = await P('/api/send', { chan: grp, text: 'Plan', live: { kind: 'table', data: { title: 'Plan', cols: ['Day', 'Who'], rows: [['Mon', 'Ana']] } } }, bob); const tid = r.d.id, tm = s.ctx.msgById.get(tid);
    r = await P('/api/ap/live', { id: tid, op: 'cell', row: tm.live.data.rows[0].id, col: tm.live.data.cols[1].id, text: 'Carol', base: 'Ana' }, carol); t.eq(r.s, 200, r.d);
    t.eq((await P('/api/send', { chan: grp, live: { kind: 'bogus' } }, bob)).s, 400);
    t.eq((await P('/api/edit', { id, text: 'changed' }, bob)).s, 400, 'live components are not edited as text');
    await P('/api/delete', { id }, bob); t.eq(s.ctx.msgById.get(id).live, undefined, 'deleting removes the content'); ev.close();
  });

  await t.section('website check: blocked loopback, frame headers are read', async () => {
    t.eq((await G('/api/ap/web/check?url=' + enc('javascript:alert(1)'), bob)).s, 400);
    let r = await G('/api/ap/web/check?url=' + enc(`http://127.0.0.1:${s.port}/`), bob); t.eq(r.d.reach, false); t.eq(r.d.why, 'blocked');
    const http = require('http'); const srv = http.createServer((q, res) => { res.writeHead(200, q.url === '/deny' ? { 'X-Frame-Options': 'DENY' } : q.url === '/csp' ? { 'Content-Security-Policy': "frame-ancestors 'self'" } : {}); res.end('ok'); });
    await new Promise((ok) => srv.listen(0, '0.0.0.0', ok)); const ip = Object.values(require('os').networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (ip) {
      const base = `http://${ip.address}:${srv.address().port}`;
      t.eq((await G('/api/ap/web/check?url=' + enc(base + '/'), bob)).d.frame, 'yes');
      t.eq((await G('/api/ap/web/check?url=' + enc(base + '/deny'), bob)).d.frame, 'no');
      t.eq((await G('/api/ap/web/check?url=' + enc(base + '/csp'), bob)).d.why, 'csp');
    }
    srv.close();
  });

  await t.section('a chat deleted and made again starts with empty apps', async () => {
    const ch = (await P('/api/channel', { name: 'temp' }, host)).d.id;
    await P('/api/ap/nb', { chan: ch, op: 'addsec', name: 'Secret' }, host); await P('/api/ap/tabs', { chan: ch, op: 'add', type: 'ap_notebook' }, host);
    await P('/api/channel/delete', { id: ch }, host); await s.wait(5); await P('/api/channel', { name: 'temp' }, host);
    t.eq((await G('/api/ap/nb?chan=' + ch, bob)).d.tree, []); t.eq((await G('/api/ap/tabs?chan=' + ch, bob)).d.cfg, null);
  });
});
