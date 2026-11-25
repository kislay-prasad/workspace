'use strict';
// Forms: surveys and quizzes (choice, multiple choice, text, rating, date, Likert, ranking). A form is shared in a chat as a
// card people fill in from the chat; one response per person (or several), anonymous option, close/reopen, results.
const crypto = require('crypto');
module.exports = (ctx) => {
  const { api, store, json, body, fail, rid, str, rate, isObj, isAdmin, canSee, userById } = ctx;
  const A = ctx.apps;
  const TYPES = ['choice', 'multi', 'text', 'rating', 'date', 'likert', 'ranking'];
  const forms = () => ctx.coll('ap_forms');
  const get = (id) => { const f = A.own(forms(), str(id, 16)) ? forms()[str(id, 16)] : null; if (!f) fail(404, 'That form was deleted.'); return f; };
  const fresh = (f, c) => !!f.ccs && f.ccs[c] === A.created(c); // the chat was not deleted and made again since
  const inChat = (me, f) => f.chans.some((c) => fresh(f, c) && canSee(me, c));
  const canView = (me, f) => f.owner === me.id || isAdmin(me) || inChat(me, f);
  const isOwner = (me, f) => f.owner === me.id || isAdmin(me);
  const canResults = (me, f) => isOwner(me, f) || (f.showResults && inChat(me, f));
  const who = (f, uid) => crypto.createHmac('sha256', f.salt).update(uid).digest('hex').slice(0, 24);
  const opt = (o) => { const id = isObj(o) && typeof o.id === 'string' && /^[a-z0-9]{1,8}$/.test(o.id) ? o.id : rid(3); return { id, t: A.line(typeof o === 'string' ? o : o && o.t, 200) }; };
  function cleanQ(q) {
    if (!isObj(q) || !TYPES.includes(q.type)) fail(400, 'Unknown kind of question');
    const x = { id: typeof q.id === 'string' && /^[a-z0-9]{1,8}$/.test(q.id) ? q.id : rid(3), type: q.type, text: A.line(q.text, 500), req: !!q.req };
    if (!x.text) fail(400, 'Every question needs a text.');
    if (['choice', 'multi', 'ranking'].includes(q.type)) {
      x.opts = (Array.isArray(q.opts) ? q.opts : []).slice(0, 30).map(opt).filter((o) => o.t);
      const seen = new Set(); x.opts = x.opts.filter((o) => !seen.has(o.id) && seen.add(o.id));
      if (x.opts.length < 2) fail(400, `“${x.text}” needs at least two options.`);
      if (q.type !== 'ranking' && Array.isArray(q.correct)) { x.correct = q.correct.map((c) => str(c, 8)).filter((c) => x.opts.some((o) => o.id === c)).slice(0, 30); x.pts = A.int(q.pts, 0, 100, 1); }
    }
    if (q.type === 'text') x.long = !!q.long;
    if (q.type === 'rating') { x.max = A.int(q.max, 3, 10, 5); x.stars = q.stars !== false; }
    if (q.type === 'likert') {
      x.rows = (Array.isArray(q.rows) ? q.rows : []).slice(0, 20).map(opt).filter((o) => o.t); x.cols = (Array.isArray(q.cols) ? q.cols : []).slice(0, 10).map(opt).filter((o) => o.t);
      if (!x.rows.length || x.cols.length < 2) fail(400, `“${x.text}” needs statements and at least two choices.`);
    }
    return x;
  }
  function cleanAnswer(q, v) {
    if (v === undefined || v === null || v === '') return undefined;
    if (q.type === 'choice') return q.opts.some((o) => o.id === v) ? v : undefined;
    if (q.type === 'multi') { const a = A.ids(v, (x) => (q.opts.some((o) => o.id === x) ? x : ''), 30); return a.length ? a : undefined; }
    if (q.type === 'text') { const t = A.text(v, 4000).trim(); return t || undefined; }
    if (q.type === 'rating') { const n = Math.round(Number(v)); return n >= 1 && n <= q.max ? n : undefined; }
    if (q.type === 'date') { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined; }
    if (q.type === 'likert') { if (!isObj(v)) return undefined; const o = {}; for (const r of q.rows) if (q.cols.some((c) => c.id === v[r.id])) o[r.id] = v[r.id]; return Object.keys(o).length ? o : undefined; }
    if (q.type === 'ranking') { const a = A.ids(v, (x) => (q.opts.some((o) => o.id === x) ? x : ''), 30); return a.length === q.opts.length ? a : undefined; }
    return undefined;
  }
  const score = (f, a) => { let got = 0, max = 0; for (const q of f.qs) if (q.correct && q.correct.length) { max += q.pts; const v = a[q.id], want = [...q.correct].sort().join(','); if (v !== undefined && (Array.isArray(v) ? [...v].sort().join(',') : v) === want) got += q.pts; } return { got, max }; };
  const summary = (f) => ({ id: f.id, title: f.title, desc: f.desc.slice(0, 200), owner: f.owner, n: f.responses.length, closed: !!f.closed, quiz: !!f.quiz, created: f.created, updated: f.updated, chans: f.chans, qn: f.qs.length });
  const cardOf = (f) => ({ kind: 'form', id: f.id, title: f.title, desc: f.desc.slice(0, 200), n: f.responses.length, closed: !!f.closed, quiz: !!f.quiz, qn: f.qs.length, deleted: !!f.deleted });
  const refreshCards = (f) => { for (const id of Object.values(f.msgs || {})) A.updateCard(id, cardOf(f)); };
  function out(me, f) {
    const mine = f.responses.filter((r) => r.who === who(f, me.id)), answered = mine.length > 0;
    const qs = f.qs.map((q) => (q.correct && !isOwner(me, f) && !answered ? { ...q, correct: undefined, pts: q.pts } : q));
    const o = { ...summary(f), desc: f.desc, qs, anon: !!f.anon, multi: !!f.multi, showResults: !!f.showResults, canEdit: isOwner(me, f), canResults: canResults(me, f), mine: mine.map((r) => ({ id: r.id, ts: r.ts, a: r.a, score: r.score })) };
    if (o.canResults) o.responses = f.responses.map((r) => ({ id: r.id, ts: r.ts, by: f.anon || !isOwner(me, f) ? null : r.by, a: r.a, score: r.score }));
    return o;
  }

  api['GET /api/ap/forms'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan');
    if (chan) A.see(me, chan);
    const list = Object.values(forms()).filter((f) => (chan ? f.chans.includes(chan) && fresh(f, chan) : canView(me, f) && (f.owner === me.id || inChat(me, f)))).sort((a, b) => b.updated - a.updated).slice(0, 300);
    json(res, 200, { forms: list.map((f) => ({ ...summary(f), mine: f.owner === me.id, answered: f.responses.some((r) => r.who === who(f, me.id)) })) });
  };
  api['GET /api/ap/form'] = async (req, res, me, url) => { const f = get(url.searchParams.get('id')); if (!canView(me, f)) fail(404, 'That form was deleted.'); json(res, 200, { form: out(me, f) }); };
  api['POST /api/ap/form/save'] = async (req, res, me) => {
    const b = await body(req, 120000);
    if (!rate('apform:' + me.id, 60, 60000)) fail(429, 'Slow down a little.');
    const title = A.line(b.title, 200); if (!title) fail(400, 'Give the form a title.');
    const qs = (Array.isArray(b.qs) ? b.qs : []).slice(0, 50).map(cleanQ); if (!qs.length) fail(400, 'Add at least one question.');
    let f;
    if (b.id) { f = get(b.id); if (!isOwner(me, f)) fail(403, 'Only the person who made this form can change it.'); }
    else {
      if (Object.values(forms()).filter((x) => x.owner === me.id).length >= 200) fail(400, 'You have too many forms. Delete some old ones first.');
      f = { id: rid(6), owner: me.id, salt: rid(16), chans: [], msgs: {}, responses: [], created: Date.now() }; forms()[f.id] = f;
    }
    Object.assign(f, { title, desc: A.text(b.desc, 2000).trim(), qs, anon: !!b.anon, multi: !!b.multi, showResults: !!b.showResults, quiz: qs.some((q) => q.correct && q.correct.length), updated: Date.now() });
    store.save(); refreshCards(f); json(res, 200, { ok: true, form: out(me, f) });
  };
  api['POST /api/ap/form/post'] = async (req, res, me) => { // share in a chat as a card
    const b = await body(req, 1024), f = get(b.id), chan = A.writer(me, b.chan);
    if (!isOwner(me, f)) fail(403, 'Only the person who made this form can share it.');
    if (!rate('apformpost:' + me.id, 20, 60000)) fail(429, 'Slow down a little.');
    const m = A.postCard(me, chan, cardOf(f), `Form: ${f.title}`);
    if (!f.chans.includes(chan)) f.chans.push(chan); f.msgs[chan] = m.id; (f.ccs ||= {})[chan] = A.created(chan); f.updated = Date.now(); store.save();
    const people = A.people(chan); if (people.length <= 150) for (const uid of people) A.notify(uid, { type: 'form', from: me.id, chan, msg: m.id, text: `Fill in “${f.title}”`, ref: { app: 'forms', id: f.id } });
    json(res, 200, { ok: true, msg: m.id });
  };
  api['POST /api/ap/form/respond'] = async (req, res, me) => {
    const b = await body(req, 120000), f = get(b.id);
    if (!(inChat(me, f) || f.owner === me.id)) fail(404, 'That form was deleted.');
    if (f.closed) fail(400, 'This form is closed. It no longer accepts responses.');
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('apresp:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const raw = isObj(b.a) ? b.a : {}, a = {};
    for (const q of f.qs) { const v = cleanAnswer(q, raw[q.id]); if (v === undefined) { if (q.req) fail(400, `Please answer “${q.text}”.`); } else a[q.id] = v; }
    if (!Object.keys(a).length) fail(400, 'Answer at least one question.');
    const w = who(f, me.id), prev = f.responses.find((r) => r.who === w && (!f.multi || r.id === str(b.rid, 12)));
    const sc = f.quiz ? score(f, a) : undefined;
    if (prev) Object.assign(prev, { a, ts: Date.now(), score: sc });
    else { if (f.responses.length >= 5000) fail(400, 'This form has too many responses.'); f.responses.push({ id: rid(6), who: w, by: f.anon ? null : me.id, ts: Date.now(), a, score: sc }); }
    f.updated = Date.now(); store.save(); refreshCards(f);
    json(res, 200, { ok: true, score: sc, form: out(me, f) });
  };
  api['POST /api/ap/form/close'] = async (req, res, me) => {
    const b = await body(req, 512), f = get(b.id); if (!isOwner(me, f)) fail(403, 'Only the person who made this form can close it.');
    f.closed = !!b.closed; f.updated = Date.now(); store.save(); refreshCards(f); json(res, 200, { ok: true });
  };
  api['POST /api/ap/form/delete'] = async (req, res, me) => {
    const b = await body(req, 512), f = get(b.id); if (!isOwner(me, f)) fail(403, 'Only the person who made this form can delete it.');
    f.deleted = true; refreshCards(f); delete forms()[f.id]; store.save(); json(res, 200, { ok: true });
  };
  api['POST /api/ap/form/clear'] = async (req, res, me) => { // delete all responses
    const b = await body(req, 512), f = get(b.id); if (!isOwner(me, f)) fail(403, 'Only the person who made this form can do that.');
    f.responses = []; f.updated = Date.now(); store.save(); refreshCards(f); json(res, 200, { ok: true });
  };
  void userById;
};
