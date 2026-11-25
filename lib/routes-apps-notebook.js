'use strict';
// Notebook (like OneNote): a notebook per chat with sections and pages. Page content is rich text, cleaned on the server
// with a strict allow-list (ctx.apps.cleanHtml). Every page has a version: a save based on an older version is refused
// with 409 and the newer page, so the editor can merge or let the person pick theirs or mine.
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, canSee } = ctx;
  const A = ctx.apps;
  const COLORS = ['#5b5fc7', '#038387', '#ca5010', '#c239b3', '#498205', '#0078d4', '#986f0b', '#d13438'];
  A.perChat('ap_notebooks');
  const nbOf = (chan) => A.peek('ap_notebooks', chan);
  const nbW = (chan) => A.chatRec('ap_notebooks', chan, () => ({ sections: [] }));
  const meta = (p) => ({ id: p.id, title: p.title, v: p.v, by: p.by, ts: p.ts, created: p.created, cby: p.cby, size: (p.html || '').length });
  const tree = (nb) => (nb ? nb.sections.map((s) => ({ id: s.id, name: s.name, color: s.color, pages: s.pages.map(meta) })) : []);
  const findPage = (nb, id) => { for (const s of nb ? nb.sections : []) { const p = s.pages.find((x) => x.id === id); if (p) return { s, p }; } return null; };
  let index = null; // file id -> Set(chan) of pages that show it
  const fileIndex = () => {
    if (index) return index; index = new Map();
    const all = ctx.coll('ap_notebooks');
    for (const chan of Object.keys(all)) for (const s of all[chan].sections || []) for (const p of s.pages) for (const fid of A.htmlFiles(p.html)) (index.get(fid) || index.set(fid, new Set()).get(fid)).add(chan);
    return index;
  };
  A.keepFiles(() => [...fileIndex().keys()]);
  A.shareFiles((u, id) => { const chans = fileIndex().get(id); return !!chans && [...chans].some((c) => !!nbOf(c) && canSee(u, c)); });

  api['GET /api/ap/nb'] = async (req, res, me, url) => { const chan = A.see(me, url.searchParams.get('chan')); json(res, 200, { tree: tree(nbOf(chan)) }); };
  api['GET /api/ap/nb/page'] = async (req, res, me, url) => {
    const chan = A.see(me, url.searchParams.get('chan')), hit = findPage(nbOf(chan), str(url.searchParams.get('id'), 12));
    if (!hit) fail(404, 'That page was deleted.'); json(res, 200, { page: { ...meta(hit.p), html: hit.p.html, sec: hit.s.id } });
  };
  const changed = (chan, nb) => { store.save(); A.toChat('ap_nb', chan, { op: 'tree', tree: tree(nb) }); };
  api['POST /api/ap/nb'] = async (req, res, me) => {
    const b = await body(req, 4096), chan = A.writer(me, b.chan), op = str(b.op, 10), nb = nbW(chan);
    if (!rate('apnb:' + me.id, 120, 60000)) fail(429, 'Slow down a little.');
    const sec = (id) => { const s = nb.sections.find((x) => x.id === str(id, 12)); if (!s) fail(404, 'That section was deleted.'); return s; };
    const move = (list, x, to) => { const i = list.indexOf(x), j = A.int(to, 0, list.length - 1, i); list.splice(i, 1); list.splice(j, 0, x); };
    let out = {};
    if (op === 'addsec') { if (nb.sections.length >= 50) fail(400, 'A notebook holds 50 sections.'); const s = { id: rid(6), name: A.line(b.name, 60) || 'New section', color: A.color(b.color, COLORS[nb.sections.length % COLORS.length]), pages: [] }; nb.sections.push(s); out = { id: s.id }; }
    else if (op === 'rensec') { const s = sec(b.id), n = A.line(b.name, 60); if (!n) fail(400, 'Name the section.'); s.name = n; }
    else if (op === 'colsec') { sec(b.id).color = A.color(b.color, COLORS[0]); }
    else if (op === 'movesec') { move(nb.sections, sec(b.id), b.to); }
    else if (op === 'delsec') { const s = sec(b.id); nb.sections = nb.sections.filter((x) => x !== s); index = null; }
    else if (op === 'addpage') {
      const s = sec(b.sec); if (s.pages.length >= 300) fail(400, 'A section holds 300 pages.');
      const p = { id: rid(6), title: A.line(b.title, 200), html: '', v: 1, by: me.id, ts: Date.now(), created: Date.now(), cby: me.id };
      const after = s.pages.findIndex((x) => x.id === str(b.after, 12)); s.pages.splice(after < 0 ? s.pages.length : after + 1, 0, p); out = { id: p.id };
    } else if (op === 'renpage') { const h = findPage(nb, str(b.id, 12)); if (!h) fail(404, 'That page was deleted.'); h.p.title = A.line(b.title, 200); h.p.ts = Date.now(); }
    else if (op === 'movepage') {
      const h = findPage(nb, str(b.id, 12)); if (!h) fail(404, 'That page was deleted.');
      const to = b.sec ? sec(b.sec) : h.s; if (to !== h.s && to.pages.length >= 300) fail(400, 'That section is full.');
      h.s.pages = h.s.pages.filter((x) => x !== h.p); to.pages.splice(A.int(b.to, 0, to.pages.length, to.pages.length), 0, h.p);
    } else if (op === 'delpage') { const h = findPage(nb, str(b.id, 12)); if (!h) fail(404, 'That page was deleted.'); h.s.pages = h.s.pages.filter((x) => x !== h.p); index = null; }
    else fail(400, 'Bad operation');
    changed(chan, nb); json(res, 200, { ok: true, ...out, tree: tree(nb) });
  };
  api['POST /api/ap/nb/page'] = async (req, res, me) => {
    const b = await body(req, 450000), chan = A.writer(me, b.chan), nb = nbW(chan), h = findPage(nb, str(b.id, 12));
    if (!h) fail(404, 'That page was deleted.');
    if (!rate('apnbsave:' + me.id, 180, 60000)) fail(429, 'Slow down a little.');
    if (Number(b.v) !== h.p.v) return json(res, 409, { error: 'Someone else changed this page.', page: { ...meta(h.p), html: h.p.html } });
    const html = A.cleanHtml(b.html, 200000);
    if (b.title !== undefined) h.p.title = A.line(b.title, 200);
    h.p.html = html; h.p.v++; h.p.by = me.id; h.p.ts = Date.now(); index = null;
    store.save(); A.toChat('ap_nb', chan, { op: 'page', page: meta(h.p), sec: h.s.id });
    json(res, 200, { ok: true, page: { ...meta(h.p), html } });
  };
};
