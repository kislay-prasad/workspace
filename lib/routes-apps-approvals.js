'use strict';
// Approvals: someone asks one or more people to approve something (everyone must approve, or the first response
// decides), with details and an optional attachment. Approvers answer from the card in the chat or the Approvals app.
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isAdmin, canSee, userById } = ctx;
  const A = ctx.apps;
  const all = () => ctx.coll('ap_approvals');
  const get = (id) => { const x = A.own(all(), str(id, 16)) ? all()[str(id, 16)] : null; if (!x) fail(404, 'That request was deleted.'); return x; };
  const canView = (me, x) => x.by === me.id || x.approvers.includes(me.id) || isAdmin(me) || (!!x.chan && x.cc === A.created(x.chan) && canSee(me, x.chan));
  const name = (id) => (userById(id) || { name: 'Someone' }).name;
  const cardOf = (x) => ({ kind: 'approval', id: x.id, title: x.title, by: x.by, status: x.status, approvers: x.approvers, res: Object.fromEntries(Object.entries(x.res).map(([k, v]) => [k, v.d])), mode: x.mode });
  const outOf = (me, x) => ({ ...x, mine: x.by === me.id, approver: x.approvers.includes(me.id), canAct: x.status === 'pending' && x.approvers.includes(me.id) && !x.res[me.id] });
  const decide = (x) => {
    const ds = x.approvers.map((u) => x.res[u] && x.res[u].d).filter(Boolean);
    if (x.mode === 'first') return ds[0] === 'approve' ? 'approved' : ds[0] === 'reject' ? 'rejected' : 'pending';
    if (ds.includes('reject')) return 'rejected';
    return ds.length === x.approvers.length ? 'approved' : 'pending';
  };
  api['GET /api/ap/approvals'] = async (req, res, me, url) => {
    const box = url.searchParams.get('box'), chan = url.searchParams.get('chan');
    if (chan) A.see(me, chan);
    const list = Object.values(all()).filter((x) => (chan ? x.chan === chan && x.cc === A.created(chan) : box === 'sent' ? x.by === me.id : box === 'received' ? x.approvers.includes(me.id) : canView(me, x))).sort((a, b) => b.created - a.created).slice(0, 500);
    json(res, 200, { approvals: list.map((x) => outOf(me, x)), pending: Object.values(all()).filter((x) => x.status === 'pending' && x.approvers.includes(me.id) && !x.res[me.id]).length });
  };
  api['GET /api/ap/approval'] = async (req, res, me, url) => { const x = get(url.searchParams.get('id')); if (!canView(me, x)) fail(404, 'That request was deleted.'); json(res, 200, { approval: outOf(me, x) }); };
  api['POST /api/ap/approval/new'] = async (req, res, me) => {
    const b = await body(req, 16384); if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('apappr:' + me.id, 20, 60000)) fail(429, 'Slow down a little.');
    const title = A.line(b.title, 200); if (!title) fail(400, 'Give the request a title.');
    const chan = b.chan ? A.writer(me, b.chan) : '';
    const approvers = A.ids(b.approvers, (id) => (chan ? A.member(chan, id) : A.anyone(id)), 20);
    if (!approvers.length) fail(400, chan ? 'Pick at least one approver from this chat.' : 'Pick at least one approver.');
    const file = b.file ? A.fileRef(me, b.file) : null; if (b.file && !file) fail(400, 'That file is no longer available.');
    const x = { id: rid(6), by: me.id, title, details: A.text(b.details, 4000).trim(), approvers, mode: b.mode === 'first' ? 'first' : 'all', chan, cc: chan ? A.created(chan) : 0, msg: '', file, status: 'pending', res: {}, hist: [{ ts: Date.now(), by: me.id, act: 'created' }], created: Date.now(), done: 0 };
    all()[x.id] = x;
    if (chan) { const m = A.postCard(me, chan, cardOf(x), `Approval request: ${title}`); x.msg = m.id; }
    store.save();
    for (const uid of approvers) A.notify(uid, { type: 'approval', from: me.id, chan: chan || undefined, msg: x.msg || undefined, text: `Asked you to approve “${title}”`, ref: { app: 'approvals', id: x.id } });
    json(res, 200, { ok: true, approval: outOf(me, x) });
  };
  api['POST /api/ap/approval/respond'] = async (req, res, me) => {
    const b = await body(req, 8192), x = get(b.id); if (!canView(me, x)) fail(404, 'That request was deleted.');
    if (!x.approvers.includes(me.id)) fail(403, 'You are not an approver of this request.');
    if (x.status !== 'pending') fail(400, `This request is already ${x.status}.`);
    if (x.res[me.id]) fail(400, 'You already answered.');
    const d = b.decision === 'approve' ? 'approve' : b.decision === 'reject' ? 'reject' : ''; if (!d) fail(400, 'Approve or reject?');
    const c = A.text(b.comment, 1000).trim();
    x.res[me.id] = { d, c, ts: Date.now() }; x.hist.push({ ts: Date.now(), by: me.id, act: d === 'approve' ? 'approved' : 'rejected', c });
    const before = x.status; x.status = decide(x); if (x.status !== before) { x.done = Date.now(); x.hist.push({ ts: Date.now(), by: null, act: 'final:' + x.status }); }
    store.save(); A.updateCard(x.msg, cardOf(x));
    A.notify(x.by, { type: 'approval', from: me.id, chan: x.chan || undefined, msg: x.msg || undefined, text: x.status !== 'pending' ? `“${x.title}” was ${x.status}` : `${name(me.id)} ${d === 'approve' ? 'approved' : 'rejected'} “${x.title}”`, ref: { app: 'approvals', id: x.id } });
    json(res, 200, { ok: true, approval: outOf(me, x) });
  };
  api['POST /api/ap/approval/cancel'] = async (req, res, me) => {
    const b = await body(req, 4096), x = get(b.id); if (!canView(me, x)) fail(404, 'That request was deleted.');
    if (x.by !== me.id && !isAdmin(me)) fail(403, 'Only the person who asked can cancel this request.');
    if (x.status !== 'pending') fail(400, `This request is already ${x.status}.`);
    x.status = 'canceled'; x.done = Date.now(); x.hist.push({ ts: Date.now(), by: me.id, act: 'canceled', c: A.text(b.comment, 1000).trim() });
    store.save(); A.updateCard(x.msg, cardOf(x));
    for (const uid of x.approvers) if (!x.res[uid]) A.notify(uid, { type: 'approval', from: me.id, chan: x.chan || undefined, text: `Canceled “${x.title}”`, ref: { app: 'approvals', id: x.id } });
    json(res, 200, { ok: true, approval: outOf(me, x) });
  };
  // the attachment is readable by everyone who can see the request
  A.keepFiles(() => Object.values(all()).filter((x) => x.file).map((x) => x.file.id));
  A.shareFiles((u, id) => Object.values(all()).some((x) => x.file && x.file.id === id && canView(u, x)));
  void db;
};
