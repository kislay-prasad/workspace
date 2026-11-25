'use strict';
// Lists: custom tables with typed columns (text, number, choice, date, person, yes/no, link), rows edited inline or in a
// form, templates. A list belongs to a chat (everyone there sees and edits it) or to one person ("My lists").
module.exports = (ctx) => {
  const { api, store, json, body, fail, rid, str, rate, isObj, isAdmin, canSee, emit, audience } = ctx;
  const A = ctx.apps;
  const TYPES = ['text', 'number', 'choice', 'date', 'person', 'bool', 'link'];
  const CHOICE_COLORS = ['#cfe4fa', '#dff6dd', '#fed9cc', '#fff4ce', '#f1dbf6', '#e1dfdd', '#c7e0f4', '#fde7e9'];
  const lists = () => ctx.coll('ap_lists');
  const get = (id) => { const l = A.own(lists(), str(id, 16)) ? lists()[str(id, 16)] : null; if (!l) fail(404, 'That list was deleted.'); return l; };
  const inChat = (me, l) => !!l.chan && l.cc === A.created(l.chan) && canSee(me, l.chan);
  const canView = (me, l) => (l.chan ? inChat(me, l) : l.owner === me.id);
  const canWrite = (me, l) => { if (!canView(me, l)) fail(404, 'That list was deleted.'); if (l.chan) { const e = A.writeErr(me, l.chan); if (e) fail(403, e); } };
  const canDelete = (me, l) => l.owner === me.id || isAdmin(me) || (l.chan && A.isManager(me, l.chan));
  const send = (l, data) => emit('ap_list', { id: l.id, chan: l.chan, ...data }, l.chan ? audience(l.chan) : [l.owner]);
  const meta = (l) => ({ id: l.id, chan: l.chan, owner: l.owner, name: l.name, desc: l.desc, color: l.color, icon: l.icon, n: l.rows.length, created: l.created, updated: l.updated });
  const col = (c, prev) => {
    if (!isObj(c)) fail(400, 'Bad column');
    const type = prev ? prev.type : A.oneOf(c.type, TYPES, ''); if (!type) fail(400, 'Unknown kind of column');
    const x = { id: prev ? prev.id : rid(4), name: A.line(c.name, 80), type }; if (!x.name) fail(400, 'Name the column.');
    if (type === 'choice') {
      const old = prev && prev.choices ? prev.choices : [];
      x.choices = (Array.isArray(c.choices) ? c.choices : []).slice(0, 30).map((o, i) => { const t = A.line(typeof o === 'string' ? o : o && o.t, 80); const id = isObj(o) && /^[a-z0-9]{1,8}$/.test(str(o.id, 8)) && old.some((p) => p.id === o.id) ? o.id : rid(3); return { id, t, c: A.color(isObj(o) && o.c, CHOICE_COLORS[i % CHOICE_COLORS.length]) }; }).filter((o) => o.t);
      if (!x.choices.length) fail(400, 'A choice column needs at least one choice.');
    }
    if (type === 'text') x.long = !!c.long;
    return x;
  };
  const value = (l, c, v) => {
    if (v === undefined || v === null || v === '') return undefined;
    switch (c.type) {
      case 'text': { const t = A.text(v, c.long ? 4000 : 400).trim(); return t || undefined; }
      case 'number': { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > 1e15) fail(400, `“${c.name}” must be a number.`); return n; }
      case 'choice': { const id = str(v, 8); if (!c.choices.some((o) => o.id === id)) fail(400, `Pick one of the choices for “${c.name}”.`); return id; }
      case 'date': { const s = str(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail(400, `“${c.name}” must be a date.`); return s; }
      case 'person': { const id = l.chan ? A.member(l.chan, v) : A.anyone(v); if (!id) fail(400, `Pick a person from this chat for “${c.name}”.`); return id; }
      case 'bool': return !!v;
      case 'link': { const u = A.url(v); if (!u) fail(400, `“${c.name}” must be a web address (http:// or https://).`); return u; }
      default: return undefined;
    }
  };
  const TEMPLATES = {
    blank: [['Title', 'text']],
    issues: [['Issue', 'text'], ['Description', 'text', { long: true }], ['Priority', 'choice', { choices: ['High', 'Medium', 'Low'] }], ['Status', 'choice', { choices: ['New', 'In progress', 'Blocked', 'Done'] }], ['Assigned to', 'person'], ['Date reported', 'date'], ['Due date', 'date']],
    assets: [['Asset', 'text'], ['Type', 'choice', { choices: ['Laptop', 'Phone', 'Monitor', 'Accessory', 'Other'] }], ['Serial number', 'text'], ['Owner', 'person'], ['Condition', 'choice', { choices: ['New', 'Good', 'Fair', 'Broken'] }], ['Purchase date', 'date'], ['Price', 'number'], ['Checked out', 'bool']],
    itinerary: [['Activity', 'text'], ['Date', 'date'], ['Start time', 'text'], ['Location', 'text'], ['Category', 'choice', { choices: ['Travel', 'Meal', 'Meeting', 'Free time'] }], ['Booking link', 'link'], ['Notes', 'text', { long: true }]],
    contacts: [['Name', 'text'], ['Company', 'text'], ['Email', 'text'], ['Phone', 'text'], ['Website', 'link'], ['Category', 'choice', { choices: ['Customer', 'Supplier', 'Partner', 'Friend'] }], ['Notes', 'text', { long: true }]],
  };

  api['GET /api/ap/lists'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan'); if (chan) A.see(me, chan);
    const out = Object.values(lists()).filter((l) => (chan ? l.chan === chan && inChat(me, l) : canView(me, l))).sort((a, b) => b.updated - a.updated).slice(0, 300).map(meta);
    json(res, 200, { lists: out });
  };
  api['GET /api/ap/list'] = async (req, res, me, url) => { const l = get(url.searchParams.get('id')); if (!canView(me, l)) fail(404, 'That list was deleted.'); json(res, 200, { list: { ...meta(l), cols: l.cols, rows: l.rows, canDelete: canDelete(me, l) } }); };
  api['POST /api/ap/list/new'] = async (req, res, me) => {
    const b = await body(req, 8192), chan = b.chan ? A.writer(me, b.chan) : ''; A.noGuest(me);
    if (!rate('aplist:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const name = A.line(b.name, 80); if (!name) fail(400, 'Name the list.');
    const mine = Object.values(lists()).filter((l) => (chan ? l.chan === chan : !l.chan && l.owner === me.id)); if (mine.length >= 50) fail(400, 'There are too many lists here.');
    const tpl = TEMPLATES[A.own(TEMPLATES, b.template) ? b.template : 'blank'];
    const cols = tpl.map(([n, type, o]) => col({ name: n, type, ...(o || {}) }));
    const l = { id: rid(6), chan, cc: chan ? A.created(chan) : 0, owner: me.id, name, desc: A.text(b.desc, 500).trim(), color: A.color(b.color, '#5b5fc7'), icon: A.line(b.icon, 30) || 'list', cols, rows: [], created: Date.now(), updated: Date.now() };
    lists()[l.id] = l; store.save(); send(l, { op: 'meta', list: meta(l) }); json(res, 200, { ok: true, id: l.id });
  };
  api['POST /api/ap/list/meta'] = async (req, res, me) => {
    const b = await body(req, 4096), l = get(b.id); canWrite(me, l); A.noGuest(me);
    if (b.name !== undefined) { const n = A.line(b.name, 80); if (!n) fail(400, 'Name the list.'); l.name = n; }
    if (b.desc !== undefined) l.desc = A.text(b.desc, 500).trim(); if (b.color !== undefined) l.color = A.color(b.color, l.color); if (b.icon !== undefined) l.icon = A.line(b.icon, 30) || 'list';
    l.updated = Date.now(); store.save(); send(l, { op: 'meta', list: meta(l) }); json(res, 200, { ok: true });
  };
  api['POST /api/ap/list/col'] = async (req, res, me) => {
    const b = await body(req, 16384), l = get(b.id), op = str(b.op, 8); canWrite(me, l); A.noGuest(me);
    const find = () => { const c = l.cols.find((x) => x.id === str(b.col, 8)); if (!c) fail(404, 'That column was deleted.'); return c; };
    if (op === 'add') { if (l.cols.length >= 30) fail(400, 'A list holds 30 columns.'); l.cols.push(col(b.def)); }
    else if (op === 'edit') { const c = find(), nx = col({ ...c, ...(isObj(b.def) ? b.def : {}) }, c); l.cols[l.cols.indexOf(c)] = nx; if (nx.type === 'choice') for (const r of l.rows) if (r.v[c.id] && !nx.choices.some((o) => o.id === r.v[c.id])) delete r.v[c.id]; }
    else if (op === 'del') { const c = find(); if (l.cols.length <= 1) fail(400, 'A list needs at least one column.'); l.cols = l.cols.filter((x) => x !== c); for (const r of l.rows) delete r.v[c.id]; }
    else if (op === 'move') { const c = find(), i = l.cols.indexOf(c), j = A.int(b.to, 0, l.cols.length - 1, i); l.cols.splice(i, 1); l.cols.splice(j, 0, c); }
    else fail(400, 'Bad operation');
    l.updated = Date.now(); store.save(); send(l, { op: 'cols', cols: l.cols, rows: op === 'add' || op === 'move' ? undefined : l.rows, list: meta(l) }); json(res, 200, { ok: true, cols: l.cols });
  };
  api['POST /api/ap/list/row'] = async (req, res, me) => {
    const b = await body(req, 65536), l = get(b.id), op = str(b.op, 8); canWrite(me, l);
    if (!rate('aplrow:' + me.id, 300, 60000)) fail(429, 'Slow down a little.');
    const cells = isObj(b.v) ? b.v : {};
    const apply = (r) => { for (const c of l.cols) if (A.own(cells, c.id)) { const v = value(l, c, cells[c.id]); if (v === undefined) delete r.v[c.id]; else r.v[c.id] = v; } };
    let r;
    if (op === 'add') { if (l.rows.length >= 2000) fail(400, 'A list holds 2000 items.'); r = { id: rid(6), by: me.id, ts: Date.now(), v: {} }; apply(r); if (!Object.keys(r.v).length) fail(400, 'Fill in at least one field.'); l.rows.push(r); }
    else if (op === 'edit') { r = l.rows.find((x) => x.id === str(b.row, 12)); if (!r) fail(404, 'That item was deleted.'); apply(r); r.eby = me.id; r.ets = Date.now(); }
    else if (op === 'del') { const ids = new Set((Array.isArray(b.rows) ? b.rows : [b.row]).map((x) => str(x, 12))); l.rows = l.rows.filter((x) => !ids.has(x.id)); l.updated = Date.now(); store.save(); send(l, { op: 'delrows', rows: [...ids], list: meta(l) }); return json(res, 200, { ok: true }); }
    else fail(400, 'Bad operation');
    l.updated = Date.now(); store.save(); send(l, { op: 'row', row: r, list: meta(l) }); json(res, 200, { ok: true, row: r });
  };
  api['POST /api/ap/list/delete'] = async (req, res, me) => {
    const b = await body(req, 512), l = get(b.id); if (!canView(me, l)) fail(404, 'That list was deleted.');
    if (!canDelete(me, l)) fail(403, 'Only the person who made this list, the group owner or an admin can delete it.');
    delete lists()[l.id]; store.save(); send(l, { op: 'deleted' }); json(res, 200, { ok: true });
  };
  // drop lists of chats that no longer exist
  ctx.ticks.push({ every: 3600000, fn: () => { let dirty = false; for (const l of Object.values(lists())) if (l.chan && l.cc !== A.created(l.chan) || (l.chan && !ctx.validChan(l.chan))) { delete lists()[l.id]; dirty = true; } if (dirty) store.save(); } });
};
