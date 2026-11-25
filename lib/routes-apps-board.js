'use strict';
// Whiteboard extras: shapes, text boxes, sticky notes, pictures and pen strokes on a large canvas, with select / move /
// resize / delete. Everything lives in db.extras[chan].board next to the old pen strokes ({ c, w, pts } without a type),
// so old boards keep loading and the old /api/board/* routes keep working.
module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, canSee, audience, emit } = ctx;
  const A = ctx.apps;
  const MAX = 3000, LIM = 20000;
  const ex = (chan) => (db.extras[chan] ||= { note: { text: '', v: 0, by: null, ts: 0 }, board: [], todos: [], events: [] });
  const C = (n) => Math.max(-LIM, Math.min(LIM, Math.round(Number(n) || 0)));
  const S = (n, lo = 1) => Math.max(lo, Math.min(LIM, Math.round(Number(n) || 0)));
  const col = (v, d) => (v === 'none' ? 'none' : A.color(v, d));
  const pts = (a, min, max) => { if (!Array.isArray(a) || a.length < min || a.length > max || a.length % 2) fail(400, 'Bad drawing'); return a.map(C); };
  const TYPES = ['pen', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'image'];
  function clean(o, me, prev) {
    if (!isObj(o) || !TYPES.includes(o.t)) fail(400, 'Unknown whiteboard item');
    const x = { t: o.t };
    if (o.t === 'pen') { x.c = o.c === 'erase' ? 'erase' : A.color(o.c, '#000000'); x.w = A.int(o.w, 1, 80, 3); x.pts = pts(o.pts, 2, 8000); if (o.a !== undefined) x.a = Math.max(0.1, Math.min(1, Number(o.a) || 1)); }
    else if (o.t === 'line' || o.t === 'arrow') { x.pts = pts(o.pts, 4, 4); x.c = A.color(o.c, '#242424'); x.sw = A.int(o.sw, 1, 40, 3); }
    else {
      x.x = C(o.x); x.y = C(o.y); x.w = S(o.w, 4); x.h = S(o.h, 4);
      if (o.t === 'rect' || o.t === 'ellipse') { x.c = col(o.c, '#242424'); x.f = col(o.f, 'none'); x.sw = A.int(o.sw, 0, 40, 3); }
      else if (o.t === 'text') { x.text = A.text(o.text, 2000); x.c = A.color(o.c, '#242424'); x.fs = A.int(o.fs, 8, 300, 28); x.b = !!o.b; }
      else if (o.t === 'sticky') { x.text = A.text(o.text, 1000); x.f = A.color(o.f, '#fff100'); x.fs = A.int(o.fs, 8, 120, 24); }
      else if (o.t === 'image') { const f = A.fileRef(me, o.img, prev && prev.img ? [prev.img] : []); if (!f) fail(400, 'That picture is no longer available.'); x.img = f; }
    }
    return x;
  }
  const findIdx = (e, id) => e.board.findIndex((s) => s.id === str(id, 16));
  api['POST /api/ap/board'] = async (req, res, me) => {
    const b = await body(req, 400000), chan = A.writer(me, b.chan), op = str(b.op, 10), e = ex(chan);
    if (!rate('apboard:' + me.id, 300, 60000)) fail(429, 'Slow down a little.');
    const fresh = (o) => { const want = str(o && o.id, 16); return /^[a-f0-9]{12}$/.test(want) && findIdx(e, want) < 0 ? want : rid(6); };
    if (op === 'add' || op === 'addmany') {
      const list = op === 'add' ? [b.obj] : Array.isArray(b.objs) ? b.objs.slice(0, 300) : [];
      if (!list.length) fail(400, 'Nothing to add');
      if (e.board.length + list.length > MAX) fail(400, 'This whiteboard is full. Clear it or delete some things first.');
      const out = list.map((o) => ({ id: fresh(o), by: me.id, ts: Date.now(), ...clean(o, me) }));
      e.board.push(...out); store.save();
      if (out.length === 1) emit('board', { chan, op: 'add', stroke: out[0] }, audience(chan)); else emit('board', { chan, op: 'addmany', objs: out }, audience(chan));
      return json(res, 200, { ok: true, ids: out.map((o) => o.id) });
    }
    if (op === 'upd') { // move / resize / restyle / edit text (several at once)
      const list = Array.isArray(b.objs) ? b.objs.slice(0, 300) : [], out = [];
      for (const o of list) { const i = findIdx(e, o && o.id); if (i < 0) continue; const prev = e.board[i]; const nx = { id: prev.id, by: prev.by, ts: prev.ts, eby: me.id, ...clean(o, me, prev) }; e.board[i] = nx; out.push(nx); }
      if (out.length) { store.save(); emit('board', { chan, op: 'upd', objs: out }, audience(chan)); }
      return json(res, 200, { ok: true, n: out.length });
    }
    if (op === 'del') {
      const ids = new Set((Array.isArray(b.ids) ? b.ids : []).slice(0, MAX).map((x) => str(x, 16))), before = e.board.length;
      e.board = e.board.filter((s) => !ids.has(s.id));
      if (e.board.length !== before) { store.save(); emit('board', { chan, op: 'delmany', ids: [...ids] }, audience(chan)); }
      return json(res, 200, { ok: true });
    }
    if (op === 'front' || op === 'back') { // stacking order
      const ids = new Set((Array.isArray(b.ids) ? b.ids : []).slice(0, MAX).map((x) => str(x, 16))), moved = e.board.filter((s) => ids.has(s.id)), rest = e.board.filter((s) => !ids.has(s.id));
      e.board = op === 'front' ? [...rest, ...moved] : [...moved, ...rest]; store.save(); emit('board', { chan, op: 'order', ids: e.board.map((s) => s.id) }, audience(chan));
      return json(res, 200, { ok: true });
    }
    fail(400, 'Bad operation');
  };
  // a pen stroke while it is being drawn (not stored)
  api['POST /api/ap/board/live'] = async (req, res, me) => {
    const b = await body(req, 40000), chan = A.writer(me, b.chan);
    if (!rate('apblive:' + me.id, 60, 1000)) return json(res, 200, { ok: true });
    const s = b.seg; if (!isObj(s)) fail(400, 'Bad drawing');
    const seg = { c: s.c === 'erase' ? 'erase' : A.color(s.c, '#000000'), w: A.int(s.w, 1, 80, 3), pts: pts(s.pts, 2, 4000), a: s.a !== undefined ? Math.max(0.1, Math.min(1, Number(s.a) || 1)) : undefined };
    emit('boardlive', { chan, by: me.id, seg, sid: str(b.sid, 12), world: true }, audience(chan)); json(res, 200, { ok: true });
  };
  A.keepFiles(() => Object.values(db.extras).flatMap((e) => (e && Array.isArray(e.board) ? e.board.filter((s) => s.img).map((s) => s.img.id) : [])));
  A.shareFiles((u, id) => Object.entries(db.extras).some(([chan, e]) => e && Array.isArray(e.board) && e.board.some((s) => s.img && s.img.id === id) && canSee(u, chan)));
};
