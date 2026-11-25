'use strict';
// Bots and automation (section 11 of the Teams list): bot users (u.bot, can't sign in), incoming webhooks (a URL with a
// secret that posts into a channel), outgoing webhooks (a channel bot: @mention it and LANChat POSTs the message to a
// URL, signed with HMAC-SHA256, and posts the answer), simple keyword/regex bots with welcome messages, workflows
// ("when this happens, do that"), rich cards with buttons (m.card), message extensions and API keys (x-api-key).
// Data owned here: db.tmBots, db.tmHooks, db.tmFlows, db.tmKeys, db.tmBotEvents, db.tmBotMeta.
// Secrets (webhook keys, API keys) are stored as salted scrypt hashes and compared in constant time; HMAC secrets of
// outgoing webhooks must stay readable to sign requests. This module only adds hooks and routes (no wrapping).
const http = require('http');
const https = require('https');
const vm = require('vm');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, sha, str, rate, isObj, userById, isAdmin, canSee, emit, msgOut, msgById, chanMsgs, addMessage, coll, hooks, ipOf, adminIds, dmChansOf, makeUser, emitUser, findByName, cleanUserName, activity } = ctx;
  const TM = (ctx.tm ||= {});
  const now = () => Date.now();
  const audit = (...a) => ctx.audit && ctx.audit(...a);
  const bots = () => coll('tmBots'), whooks = () => coll('tmHooks'), flows = () => coll('tmFlows'), keys = () => coll('tmKeys'), events = () => coll('tmBotEvents'), meta = () => coll('tmBotMeta');
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const needAdmin = (me) => { if (!isAdmin(me)) fail(403, 'Only the host or an admin can do that'); };
  const dmId = (a, b) => 'dm:' + [a, b].sort().join(':');
  const live = (u) => !!u && !u.removed && !u.deleted;
  const SRC = Symbol('botsource'); // internal marker on createMessage bodies: JSON request bodies can never carry it

  // ---------- bot users ----------
  function makeBot(name, avatar, kind, hidden) {
    let n = cleanUserName(name) || 'Bot'; if (['everyone', 'here', 'channel', 'team', 'deleted user'].includes(n.toLowerCase())) n += ' bot';
    const base = n.slice(0, 20); for (let i = 2; findByName(n); i++) n = `${base} ${i}`;
    const u = makeUser(n); u.bot = true; u.botKind = kind; u.prefs = {}; if (avatar) u.avatar = avatar; if (hidden) u.removed = true; // webhook identities don't appear in people lists
    store.save(); emitUser(u); return u;
  }
  const avatarOk = (me, id) => { if (!id) return null; const f = db.files[str(id, 24)]; if (!f || f.by !== me.id || !/\.(png|jpe?g|gif|webp)$/i.test(f.name) || f.size > 3 * 1024 * 1024) fail(400, 'The picture must be an image under 3 MB.'); return f.id; };
  // bots are always available (presence is set here because the core treats people without a live connection as offline first)
  hooks.userFields.push((u) => (u.bot ? { bot: true, botKind: u.botKind || 'bot', ...(u.removed ? {} : { presence: 'online' }) } : {}));
  const flowsBot = () => { const m = meta(); let u = m.flows && userById(m.flows); if (!u || u.deleted) { u = makeBot('Workflows', null, 'flows'); m.flows = u.id; store.save(); } if (u.removed) { u.removed = false; emitUser(u); } return u; };
  TM.flowsBot = flowsBot;

  // ---------- cards ----------
  const DATAIMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  function cleanCard(c, fromBot) {
    if (!isObj(c)) fail(400, 'A card must be an object.');
    const out = { title: str(c.title, 200).trim(), text: str(c.text, 4000) };
    if (c.image) { const s = str(c.image, 400001); if (s.length > 400000 || !DATAIMG.test(s)) fail(400, 'Card pictures must be a PNG, JPEG, GIF or WebP data: URL under 300 KB.'); out.image = s; }
    if (Array.isArray(c.facts)) out.facts = c.facts.slice(0, 12).filter(isObj).map((f) => ({ k: str(f.k ?? f.name, 60).trim(), v: str(f.v ?? f.value, 300).trim() })).filter((f) => f.k || f.v);
    if (Array.isArray(c.buttons)) out.buttons = c.buttons.slice(0, 6).filter(isObj).map((b) => {
      const label = str(b.label ?? b.title, 40).trim(); if (!label) return null;
      if (b.url !== undefined) { const u = str(b.url, 500).trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? { label, url: u } : null; }
      if (b.action === 'reply') return { label, action: 'reply', value: str(b.value, 500) || label };
      if (b.action === 'post' && fromBot) return { label, action: 'post', id: str(b.id, 60) || label };
      return null;
    }).filter(Boolean);
    for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
    if (!out.title && !String(out.text || '').trim() && !out.image && !out.facts) fail(400, 'A card needs a title, text, a picture or facts.');
    return out;
  }
  TM.cleanCard = cleanCard;
  // cards from people (message extension "Create a card"); bots and the API mark their messages through the SRC marker
  hooks.beforeMessage.push((m, p, me) => {
    if (p.card !== undefined && p.card !== null) m.card = cleanCard(p.card, !!p[SRC]);
    if (p[SRC] && me.bot) m.bot = p[SRC];
  });

  // a bot posts in a chat (webhooks, bot rules, workflows): checks the chat, the archive state and the bad-word filter
  function botPost(uid, chan, p, src, o = {}) {
    const bu = userById(uid); if (!bu || bu.deleted) throw Object.assign(new Error('The bot is gone.'), { status: 410 });
    if (chan.startsWith('dm:') ? !ctx.validChan(chan) : !db.channels[chan]) fail(410, 'That chat no longer exists.');
    const t = TM.teamOfChan ? TM.teamOfChan(chan) : null; if (t && t.archived) fail(403, 'This team is archived, so it is read-only.');
    let text = str(p.text, 8000), card = p.card ? cleanCard(p.card, true) : null;
    if (!card && str(p.title, 200).trim()) { card = cleanCard({ title: p.title, text }, true); text = ''; }
    if (!text.trim() && !card) fail(400, 'Send some text or a card.');
    if (TM.checkText) { text = TM.checkText(text, bu, 'message'); if (card) { if (card.title) card.title = TM.checkText(card.title, bu, 'message'); if (card.text) card.text = TM.checkText(card.text, bu, 'message'); } }
    const m = { chan, from: uid, text, bot: src }; if (card) m.card = card;
    if (o.thread) { const root = msgById.get(o.thread); if (root && root.chan === chan && !root.thread && !root.deleted) m.thread = root.id; }
    return addMessage(m);
  }
  TM.botPost = botPost;

  // ---------- secrets: salted scrypt hashes, a short in-memory cache of good answers ----------
  const okCache = new Map();
  async function verify(rec, secret) {
    if (!rec || typeof secret !== 'string' || secret.length < 16 || secret.length > 200 || !TM.checkSecret) { if (TM.checkSecret) await TM.checkSecret('x', null); return false; }
    const ck = sha(rec.id + ':' + rec.hash + ':' + secret), hit = okCache.get(ck); if (hit && hit > now()) return true;
    const good = await TM.checkSecret(secret, rec); if (good) { okCache.set(ck, now() + 600000); if (okCache.size > 2000) okCache.clear(); }
    return good;
  }
  const newSecret = () => crypto.randomBytes(24).toString('base64url');

  // ---------- outgoing HTTP (outgoing webhooks, workflow "call a webhook"): LAN or internet, 5 s timeout, 64 KB answers ----------
  function postJson(target, payload, headers, ms = 5000) {
    return new Promise((resolve, reject) => {
      let u; try { u = new URL(target); } catch { return reject(new Error('That is not a valid URL.')); }
      if (!/^https?:$/.test(u.protocol)) return reject(new Error('Only http:// and https:// URLs work.'));
      let done = false; const end = (f, v) => { if (!done) { done = true; clearTimeout(timer); f(v); } };
      const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'User-Agent': 'LANChat-Webhook/1', ...headers } }, (res) => {
        let size = 0; const chunks = [];
        res.on('data', (c) => { size += c.length; if (size > 65536) { req.destroy(); end(reject, new Error('The answer was too large.')); } else chunks.push(c); });
        res.on('end', () => end(resolve, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (e) => end(reject, e));
      });
      const timer = setTimeout(() => { req.destroy(); end(reject, new Error(`No answer within ${ms / 1000} seconds.`)); }, ms);
      req.on('error', (e) => end(reject, new Error(e.code === 'ECONNREFUSED' ? 'Connection refused.' : e.message)));
      req.end(payload);
    });
  }
  TM.postJson = postJson;

  // ---------- connectors on a channel: incoming and outgoing webhooks ----------
  const teamOf = (chan) => (TM.teamOfChan ? TM.teamOfChan(chan) : null);
  const canApps = (me, chan, outgoing) => {
    if (isAdmin(me)) return true; const c = db.channels[chan], t = teamOf(chan); if (!c || !t || t.archived || !canSee(me, chan)) return false;
    if (TM.canOwn(t, me) || (c.owners || []).includes(me.id)) return true;
    return !outgoing && TM.settingsOf(t).memberAddApps && me.role !== 'guest';
  };
  const hookOut = (h) => ({ id: h.id, kind: h.kind, chan: h.chan, name: userById(h.uid)?.name || h.name, uid: h.uid, url: h.kind === 'out' ? h.url : undefined, by: h.by, created: h.created, lastUsed: h.lastUsed || 0, count: h.count || 0, off: !!h.off, lastError: h.lastError || '', lastErrorAt: h.lastErrorAt || 0 });
  const inUrl = (h, key) => `/api/hook/in?id=${h.id}&key=${key}`;
  api['GET /api/tm/hooks'] = async (req, res, me, url) => {
    const chan = str(url.searchParams.get('chan'), 64);
    if (chan) { if (!db.channels[chan] || !canSee(me, chan)) fail(404, 'No such channel'); if (!canApps(me, chan)) fail(403, 'Only team owners can manage connectors here.'); return json(res, 200, { hooks: Object.values(whooks()).filter((h) => h.chan === chan).map(hookOut), canOut: canApps(me, chan, true) }); }
    needAdmin(me); json(res, 200, { hooks: Object.values(whooks()).map((h) => ({ ...hookOut(h), where: TM.chatName ? TM.chatName(h.chan) : h.chan })) });
  };
  api['POST /api/tm/hooks/create'] = async (req, res, me) => {
    const b = await body(req, 4096), chan = str(b.chan, 64), kind = b.kind === 'out' ? 'out' : 'in';
    if (!db.channels[chan] || !canSee(me, chan)) fail(404, 'No such channel');
    if (!canApps(me, chan, kind === 'out')) fail(403, kind === 'out' ? 'Only admins and team owners can add outgoing webhooks.' : 'Only team owners can add connectors here.');
    if (!rate('hookmk:' + me.id, 20, 3600000)) fail(429, 'Too many webhooks created. Try again later.');
    if (Object.values(whooks()).filter((h) => h.chan === chan).length >= 20) fail(400, 'This channel has too many webhooks.');
    const name = cleanUserName(b.name); if (!name) fail(400, 'Give the webhook a name.'); if (TM.checkText) TM.checkText(name, me, 'name');
    let target = '';
    if (kind === 'out') { target = str(b.url, 500).trim(); try { const u = new URL(target); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { fail(400, 'Enter the http:// or https:// address that should receive the messages.'); } }
    const bu = makeBot(name, avatarOk(me, b.picture), kind === 'out' ? 'outgoing' : 'incoming', kind === 'in');
    const h = { id: rid(5), kind, chan, uid: bu.id, name: bu.name, by: me.id, created: now(), count: 0 }; let shown = {};
    if (kind === 'in') { const key = newSecret(); Object.assign(h, await TM.hashSecret(key)); shown = { url: inUrl(h, key) }; }
    else { h.url = target; h.secret = crypto.randomBytes(32).toString('base64'); shown = { secret: h.secret }; }
    whooks()[h.id] = h; store.save(); audit(me, 'webhook.create', `${kind === 'in' ? 'incoming' : 'outgoing'} “${bu.name}” in ${TM.chatName ? TM.chatName(chan) : chan}`);
    json(res, 200, { hook: hookOut(h), ...shown });
  };
  const myHook = (me, id, kind) => { const h = own(whooks(), str(id, 16)) ? whooks()[str(id, 16)] : null; if (!h || (kind && h.kind !== kind)) fail(404, 'No such webhook'); if (!canApps(me, h.chan, h.kind === 'out')) fail(403, 'Only team owners can manage connectors here.'); return h; };
  api['POST /api/tm/hooks/regen'] = async (req, res, me) => {
    const h = myHook(me, (await body(req, 256)).id); let shown;
    if (h.kind === 'in') { const key = newSecret(); Object.assign(h, await TM.hashSecret(key)); shown = { url: inUrl(h, key) }; } else { h.secret = crypto.randomBytes(32).toString('base64'); shown = { secret: h.secret }; }
    okCache.clear(); store.save(); audit(me, 'webhook.regenerate', h.name); json(res, 200, { hook: hookOut(h), ...shown });
  };
  api['POST /api/tm/hooks/update'] = async (req, res, me) => {
    const b = await body(req, 1024), h = myHook(me, b.id);
    if (b.off !== undefined) h.off = !!b.off;
    if (b.url !== undefined && h.kind === 'out') { const u = str(b.url, 500).trim(); try { if (!/^https?:$/.test(new URL(u).protocol)) throw 0; } catch { fail(400, 'Enter an http:// or https:// address.'); } h.url = u; }
    store.save(); json(res, 200, { hook: hookOut(h) });
  };
  api['POST /api/tm/hooks/remove'] = async (req, res, me) => {
    const h = myHook(me, (await body(req, 256)).id); delete whooks()[h.id]; okCache.clear();
    const bu = userById(h.uid); if (bu && !bu.removed) { bu.removed = true; emitUser(bu); }
    store.save(); audit(me, 'webhook.remove', h.name); json(res, 200, { ok: true });
  };
  // the incoming webhook itself: public, checked with the secret (constant time), rate-limited
  ctx.publicRoutes.add('POST /api/hook/in');
  api['POST /api/hook/in'] = async (req, res, _me, url) => {
    const ip = ipOf(req); if (!rate('hookin-ip:' + ip, 120, 60000)) fail(429, 'Too many requests. Wait a minute.');
    const id = str(url.searchParams.get('id'), 16), key = str(url.searchParams.get('key') || req.headers['x-lanchat-key'], 200), all = whooks();
    const h = own(all, id) && all[id].kind === 'in' ? all[id] : null;
    if (!(await verify(h, key)) || h.off) fail(404, 'Unknown webhook');
    if (!rate('hookin:' + h.id, 30, 60000)) fail(429, 'Too many messages. Wait a minute.');
    const b = await body(req, 300000);
    const m = botPost(h.uid, h.chan, { text: b.text, title: b.title, card: b.card }, { kind: 'in', id: h.id });
    h.lastUsed = now(); h.count = (h.count || 0) + 1; store.save(); json(res, 200, { ok: true, id: m.id });
  };
  // outgoing webhooks: @mention the bot in its channel → POST the message (signed) → its answer is posted as a reply
  const mentionRe = (name) => new RegExp('(^|[\\s(])@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'iu');
  const hookError = (h, msg) => {
    h.lastError = String(msg).slice(0, 200); h.lastErrorAt = now(); h.errors = (h.errors || 0) + 1; store.save();
    if (rate('hookerr:' + h.id, 1, 600000)) for (const a of adminIds()) activity(a, { type: 'system', chan: undefined, text: `Outgoing webhook “${h.name}” failed: ${h.lastError}` });
  };
  async function callOut(h, m, user, extra) {
    if (!rate('hookout:' + h.id, 20, 60000)) return hookError(h, 'Called too often in a minute; skipped.');
    const c = db.channels[m.chan], t = teamOf(m.chan);
    const payload = JSON.stringify({ type: extra ? 'invoke' : 'message', id: m.id, chan: m.chan, channel: c ? c.name : '', team: t ? t.name : '', from: { id: user.id, name: user.name }, text: m.text || '', ts: m.ts, thread: m.thread || null, ...(extra || {}) });
    const sig = crypto.createHmac('sha256', Buffer.from(h.secret, 'base64')).update(payload).digest();
    try {
      const r = await postJson(h.url, payload, { Authorization: 'HMAC ' + sig.toString('base64'), 'X-LANChat-Signature': 'sha256=' + sig.toString('hex') });
      h.lastUsed = now(); h.count = (h.count || 0) + 1;
      if (r.status < 200 || r.status >= 300) throw new Error(`The service answered with HTTP ${r.status}.`);
      let d = {}; try { d = r.body ? JSON.parse(r.body) : {}; } catch { d = { text: r.body.slice(0, 4000) }; }
      if (d && (d.text || d.card || d.title)) botPost(h.uid, m.chan, { text: d.text, title: d.title, card: d.card }, { kind: 'out', id: h.id }, { thread: m.thread || m.id });
      h.lastError = ''; store.save(); return d;
    } catch (e) { hookError(h, e.message); return null; }
  }
  TM.callOut = callOut;

  // ---------- simple bots (Manage › Bots) ----------
  const botOut = (b) => { const u = userById(b.uid); return { id: b.id, uid: b.uid, name: u ? u.name : b.name, avatar: u ? u.avatar || null : null, on: b.on !== false, rules: b.rules || [], welcome: b.welcome || { general: false, dm: false, text: '' }, by: b.by, created: b.created, runs: b.runs || 0, lastRun: b.lastRun || 0, lastError: b.lastError || '' }; };
  const regexTest = (pattern, text) => { try { return !!vm.runInNewContext('r.test(s)', { r: new RegExp(pattern, 'iu'), s: text.slice(0, 2000) }, { timeout: 50 }); } catch { return false; } };
  const wordTest = (words, text) => { const list = String(words || '').split(',').map((w) => w.trim()).filter(Boolean); if (!list.length) return true; return list.some((w) => new RegExp('(?<![\\p{L}\\p{N}_])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'iu').test(text)); };
  const fill = (tpl, v) => String(tpl || '').replace(/\{(person|text|chat|team|emoji|date|time|input|name)\}/g, (_m, k) => String((k === 'name' ? v.person : v[k]) ?? '').slice(0, 1000));
  const cleanRules = (list) => (Array.isArray(list) ? list : []).slice(0, 50).filter(isObj).map((r) => {
    const match = r.match === 'regex' ? 'regex' : 'keyword', pattern = str(r.pattern, 200).trim(); if (!pattern) return null;
    if (match === 'regex') { try { new RegExp(pattern, 'iu'); } catch { fail(400, `“${pattern}” is not a valid regular expression.`); } }
    const reply = { text: str(r.reply && r.reply.text, 4000) }; if (r.reply && r.reply.card) reply.card = cleanCard(r.reply.card, true);
    if (!reply.text.trim() && !reply.card) fail(400, 'Each rule needs a reply.');
    const chans = Array.isArray(r.chans) ? r.chans.map((c) => str(c, 64)).filter((c) => c === '*' || c === 'dm' || db.channels[c]).slice(0, 50) : ['*'];
    return { id: /^[a-z0-9]{4,12}$/.test(str(r.id, 12)) ? r.id : rid(4), match, pattern, reply, chans: chans.length ? chans : ['*'] };
  }).filter(Boolean);
  api['GET /api/tm/admin/bots'] = async (req, res, me) => { needAdmin(me); json(res, 200, { bots: Object.values(bots()).map(botOut) }); };
  api['POST /api/tm/admin/bots/save'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 600000); let bot = b.id ? (own(bots(), str(b.id, 16)) ? bots()[str(b.id, 16)] : null) : null; if (b.id && !bot) fail(404, 'No such bot');
    if (!bot) { if (Object.keys(bots()).length >= 50) fail(400, 'Too many bots.'); const name = cleanUserName(b.name); if (!name) fail(400, 'Give the bot a name.'); if (TM.checkText) TM.checkText(name, me, 'name'); const u = makeBot(name, avatarOk(me, b.picture), 'bot'); const nid = rid(5); bot = bots()[nid] = { id: nid, uid: u.id, name: u.name, on: true, rules: [], welcome: { general: false, dm: false, text: '' }, by: me.id, created: now() }; }
    const u = userById(bot.uid);
    if (b.name !== undefined && u) { const n = cleanUserName(b.name); if (n && n !== u.name) { if (findByName(n)) fail(409, 'That name is taken.'); if (TM.checkText) TM.checkText(n, me, 'name'); u.name = n; bot.name = n; emitUser(u); } }
    if (b.picture !== undefined && u) { u.avatar = b.picture ? avatarOk(me, b.picture) : null; emitUser(u); }
    if (b.on !== undefined) bot.on = !!b.on;
    if (b.rules !== undefined) bot.rules = cleanRules(b.rules);
    if (isObj(b.welcome)) bot.welcome = { general: !!b.welcome.general, dm: !!b.welcome.dm, text: str(b.welcome.text, 2000) };
    store.save(); audit(me, 'bot.save', bot.name); json(res, 200, { bot: botOut(bot) });
  };
  api['POST /api/tm/admin/bots/remove'] = async (req, res, me) => {
    needAdmin(me); const id = str((await body(req, 256)).id, 16); const bot = own(bots(), id) ? bots()[id] : null; if (!bot) fail(404, 'No such bot');
    delete bots()[id]; for (const k of Object.values(keys())) if (k.uid === bot.uid) k.revoked = now();
    const u = userById(bot.uid); if (u) { u.removed = true; emitUser(u); } store.save(); audit(me, 'bot.remove', bot.name); json(res, 200, { ok: true });
  };
  function runBots(m, sender) {
    const text = String(m.text || ''); if (!text.trim()) return;
    for (const bot of Object.values(bots())) {
      if (bot.on === false || !bot.rules || !bot.rules.length) continue; const bu = userById(bot.uid); if (!live(bu) || m.from === bu.id) continue;
      const inDm = m.chan.startsWith('dm:') && m.chan.split(':').includes(bu.id);
      if (m.chan.startsWith('dm:') && !inDm) continue; // bots never read other people's 1:1 chats
      for (const r of bot.rules) {
        const where = inDm ? r.chans.includes('*') || r.chans.includes('dm') : (r.chans.includes('*') ? canSee(bu, m.chan) : r.chans.includes(m.chan));
        if (!where || !(r.match === 'regex' ? regexTest(r.pattern, text) : wordTest(r.pattern, text))) continue;
        if (!rate('botreply:' + bot.id + ':' + m.chan, 6, 60000)) break;
        try {
          const v = { person: sender.name, text: text.slice(0, 500), chat: TM.chatName ? TM.chatName(m.chan) : m.chan, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString() };
          botPost(bu.id, m.chan, { text: fill(r.reply.text, v), card: r.reply.card }, { kind: 'bot', id: bot.id }, { thread: inDm ? null : m.thread || (db.channels[m.chan] && db.channels[m.chan].kind === 'posts' ? m.id : null) });
          bot.runs = (bot.runs || 0) + 1; bot.lastRun = now(); bot.lastError = '';
        } catch (e) { bot.lastError = e.message; }
        break;
      }
    }
  }
  hooks.afterJoin.push((u) => {
    for (const bot of Object.values(bots())) {
      const w = bot.welcome, bu = userById(bot.uid); if (bot.on === false || !w || !live(bu) || u.bot) continue;
      const text = fill(w.text || 'Welcome, {person}!', { person: u.name });
      try { if (w.general && db.channels.general && canSee(bu, 'general')) botPost(bu.id, 'general', { text }, { kind: 'bot', id: bot.id }); } catch (e) { bot.lastError = e.message; }
      try { if (w.dm) botPost(bu.id, dmId(bu.id, u.id), { text }, { kind: 'bot', id: bot.id }); } catch (e) { bot.lastError = e.message; }
    }
    runFlows('join', { person: u });
  });

  // ---------- workflows: when this happens, do that ----------
  const TRIG = ['message', 'join', 'teamJoin', 'reaction', 'schedule', 'manual'], ACT = ['post', 'card', 'dm', 'addTeam', 'addChannel', 'task', 'webhook'];
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const flowOut = (f) => ({ ...f, byName: userById(f.by)?.name || '' });
  function cleanFlow(f, me) {
    if (!isObj(f)) fail(400, 'Bad workflow'); const tr = isObj(f.trigger) ? f.trigger : {}, type = TRIG.includes(tr.type) ? tr.type : fail(400, 'Pick what starts the workflow.');
    const trigger = { type };
    if (type === 'message' || type === 'reaction') { trigger.chan = str(tr.chan, 64); if (trigger.chan && (!db.channels[trigger.chan] || !canSee(me, trigger.chan))) fail(400, 'Pick a channel you can see.'); }
    if (type === 'message') trigger.words = str(tr.words, 300);
    if (type === 'reaction') trigger.emoji = str(tr.emoji, 16);
    if (type === 'teamJoin') { trigger.team = str(tr.team, 16); if (trigger.team && !(TM.teams && own(TM.teams(), trigger.team))) fail(400, 'No such team'); }
    if (type === 'schedule') { trigger.freq = tr.freq === 'weekly' ? 'weekly' : 'daily'; trigger.time = HM.test(str(tr.time, 5)) ? tr.time : '09:00'; trigger.days = (Array.isArray(tr.days) ? tr.days : [1, 2, 3, 4, 5]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).slice(0, 7); }
    if (type === 'manual') trigger.input = str(tr.input, 60);
    const actions = (Array.isArray(f.actions) ? f.actions : []).slice(0, 10).filter(isObj).map((a) => {
      if (!ACT.includes(a.type)) return null; const o = { type: a.type };
      if (['post', 'card', 'task'].includes(a.type)) { o.chan = str(a.chan, 64); if (o.chan && !db.channels[o.chan]) fail(400, 'A workflow step points to a chat that no longer exists.'); }
      if (['post', 'dm', 'task'].includes(a.type)) o.text = str(a.text, 4000);
      if (a.type === 'card') o.card = cleanCard({ ...(isObj(a.card) ? a.card : {}) }, true);
      if (a.type === 'dm') o.to = a.to === 'person' || !a.to ? 'person' : (userById(str(a.to, 32)) ? str(a.to, 32) : fail(400, 'Pick who gets the message.'));
      if (a.type === 'addTeam') { o.team = str(a.team, 16); if (!(TM.teams && own(TM.teams(), o.team))) fail(400, 'Pick a team.'); }
      if (a.type === 'addChannel') { o.chan = str(a.chan, 64); if (!db.channels[o.chan]) fail(400, 'Pick a channel.'); }
      if (a.type === 'webhook') { o.url = str(a.url, 500).trim(); try { if (!/^https?:$/.test(new URL(o.url).protocol)) throw 0; } catch { fail(400, 'Enter an http:// or https:// address for the webhook step.'); } }
      if (['post', 'dm', 'task'].includes(a.type) && !o.text.trim()) fail(400, 'A workflow step needs some text.');
      return o;
    }).filter(Boolean);
    if (!actions.length) fail(400, 'Add at least one step.');
    const name = str(f.name, 80).trim(); if (!name) fail(400, 'Give the workflow a name.');
    return { name, trigger, actions, on: f.on !== false };
  }
  api['GET /api/tm/admin/flows'] = async (req, res, me) => { needAdmin(me); json(res, 200, { flows: Object.values(flows()).map(flowOut) }); };
  api['POST /api/tm/admin/flows/save'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 600000), id = str(b.id, 16); let f = id ? (own(flows(), id) ? flows()[id] : fail(404, 'No such workflow')) : null;
    const clean = cleanFlow(b, me);
    if (!f) { if (Object.keys(flows()).length >= 100) fail(400, 'Too many workflows.'); const nid = rid(5); f = flows()[nid] = { id: nid, by: me.id, created: now(), runs: 0 }; }
    Object.assign(f, clean); store.save(); audit(me, 'workflow.save', f.name); json(res, 200, { flow: flowOut(f) });
  };
  api['POST /api/tm/admin/flows/toggle'] = async (req, res, me) => { needAdmin(me); const b = await body(req, 256), f = own(flows(), str(b.id, 16)) ? flows()[str(b.id, 16)] : fail(404, 'No such workflow'); f.on = !!b.on; store.save(); audit(me, f.on ? 'workflow.on' : 'workflow.off', f.name); json(res, 200, { flow: flowOut(f) }); };
  api['POST /api/tm/admin/flows/remove'] = async (req, res, me) => { needAdmin(me); const id = str((await body(req, 256)).id, 16); if (!own(flows(), id)) fail(404, 'No such workflow'); const n = flows()[id].name; delete flows()[id]; store.save(); audit(me, 'workflow.remove', n); json(res, 200, { ok: true }); };
  api['POST /api/tm/admin/flows/test'] = async (req, res, me) => { needAdmin(me); const id = str((await body(req, 256)).id, 16), f = own(flows(), id) ? flows()[id] : fail(404, 'No such workflow'); await runFlow(f, { person: me, chan: f.trigger.chan || '', text: 'test', input: 'test' }, true); json(res, 200, { flow: flowOut(f) }); };
  // manual workflows show up in the message box's ⋯ menu (message extensions)
  api['GET /api/tm/flows/manual'] = async (req, res, me, url) => {
    const chan = str(url.searchParams.get('chan'), 64); if (chan && !canSee(me, chan)) fail(404, 'No such chat');
    json(res, 200, { flows: Object.values(flows()).filter((f) => f.on && f.trigger.type === 'manual' && me.role !== 'guest').map((f) => ({ id: f.id, name: f.name, input: f.trigger.input || '' })) });
  };
  api['POST /api/tm/flows/run'] = async (req, res, me) => {
    const b = await body(req, 4096), f = own(flows(), str(b.id, 16)) ? flows()[str(b.id, 16)] : null, chan = str(b.chan, 64);
    if (!f || !f.on || f.trigger.type !== 'manual' || me.role === 'guest') fail(404, 'No such workflow');
    if (chan && !canSee(me, chan)) fail(404, 'No such chat');
    if (!rate('flowrun:' + me.id, 20, 60000)) fail(429, 'Slow down');
    await runFlow(f, { person: me, chan, input: str(b.input, 1000) });
    json(res, 200, { ok: true, error: f.lastError && f.lastErrorAt >= now() - 2000 ? f.lastError : '' });
  };
  async function doTask(chan, text, person, by) {
    if (typeof ctx.createTask === 'function') return ctx.createTask({ chan, text, assignee: person ? person.id : '', by: by.id });
    if (ctx.apps && typeof ctx.apps.createTask === 'function') return ctx.apps.createTask({ chan, text, assignee: person ? person.id : '', by: by.id });
    if (!db.extras || !api['POST /api/todo']) throw new Error('Tasks are not available.');
    const e = (db.extras[chan] ||= { note: { text: '', v: 0, by: null, ts: 0 }, board: [], todos: [], events: [] }); if (!Array.isArray(e.todos)) throw new Error('Tasks are not available.');
    if (e.todos.length >= 200) throw new Error('That chat has too many tasks.');
    e.todos.push({ id: rid(6), text: str(text, 200), done: false, by: by.id, assignee: person && canSee(person, chan) ? person.id : '', due: 0, ts: now() });
    store.save(); emit('todos', { chan, todos: e.todos }, ctx.audience(chan));
  }
  async function runAction(f, a, v, bu) {
    const person = v.person && userById(v.person.id), vars = { person: person ? person.name : '', text: v.text || '', chat: v.chan && TM.chatName ? TM.chatName(v.chan) : '', team: v.team ? v.team.name : '', emoji: v.emoji || '', date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), input: v.input || '' };
    const target = a.chan || v.chan;
    if (a.type === 'post' || a.type === 'card') {
      if (!target) throw new Error('No chat to post in.'); if (target.startsWith('dm:')) throw new Error('Workflows post in channels, not in 1:1 chats.');
      return botPost(bu.id, target, a.type === 'post' ? { text: fill(a.text, vars) } : { card: { ...a.card, title: fill(a.card.title, vars), text: fill(a.card.text, vars) } }, { kind: 'flow', id: f.id });
    }
    if (a.type === 'dm') { const to = a.to === 'person' ? person : userById(a.to); if (!live(to)) throw new Error('Nobody to message.'); return botPost(bu.id, dmId(bu.id, to.id), { text: fill(a.text, vars) }, { kind: 'flow', id: f.id }); }
    if (a.type === 'addTeam') { const t = TM.teams && TM.teams()[a.team]; if (!t) throw new Error('The team is gone.'); if (!live(person)) throw new Error('Nobody to add.'); return TM.addToTeam(t, person, userById(f.by) || bu); }
    if (a.type === 'addChannel') {
      const c = db.channels[a.chan]; if (!c) throw new Error('The channel is gone.'); if (!live(person)) throw new Error('Nobody to add.');
      if (c.members) { if (c.members.includes(person.id)) return; const t = teamOf(c.id); if (t && !c.shared && !TM.inTeam(t, person.id)) throw new Error(`${person.name} is not in the team.`); c.members.push(person.id); store.save(); emit('channel', ctx.chanOut(c), c.members); activity(person.id, { type: 'added', from: f.by, chan: c.id, text: c.name }); return ctx.sysMsg(c.id, `Workflow “${f.name}” added ${person.name}`); }
      if (person.role === 'guest' && !c.team) { const g = coll('tmGuestChans'); g[c.id] ||= []; if (!g[c.id].includes(person.id)) { g[c.id].push(person.id); store.save(); emit('channel', ctx.chanOut(c), [person.id]); } return; }
      return; // everyone already sees standard channels
    }
    if (a.type === 'task') { if (!target || !db.channels[target] && !target.startsWith('dm:')) throw new Error('No chat for the task.'); return doTask(target, fill(a.text, vars), person, userById(f.by) || bu); }
    if (a.type === 'webhook') { const r = await postJson(a.url, JSON.stringify({ workflow: f.name, trigger: f.trigger.type, person: person ? { id: person.id, name: person.name } : null, chat: v.chan || '', text: v.text || '', emoji: v.emoji || '', input: v.input || '', ts: now() })); if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`); }
  }
  async function runFlow(f, v, force) {
    if (!f.on && !force) return; if (!rate('flow:' + f.id, 30, 60000)) { f.lastError = 'Ran too often in a minute; skipped.'; f.lastErrorAt = now(); return; }
    const bu = flowsBot(); let err = '';
    for (const a of f.actions) { try { await runAction(f, a, v, bu); } catch (e) { err = `${a.type}: ${e.message}`.slice(0, 200); } }
    f.runs = (f.runs || 0) + 1; f.lastRun = now(); if (err) { f.lastError = err; f.lastErrorAt = now(); } else f.lastError = ''; store.save();
  }
  TM.runFlow = runFlow;
  function runFlows(type, v) { for (const f of Object.values(flows())) if (f.on && f.trigger.type === type && matches(f.trigger, v)) runFlow(f, v).catch((e) => { f.lastError = e.message; f.lastErrorAt = now(); }); }
  function matches(tr, v) {
    if (tr.type === 'message') return (!tr.chan || tr.chan === v.chan) && wordTest(tr.words, v.text || '');
    if (tr.type === 'reaction') return (!tr.chan || tr.chan === v.chan) && (!tr.emoji || tr.emoji === v.emoji);
    if (tr.type === 'teamJoin') return !tr.team || (v.team && tr.team === v.team.id);
    return true;
  }
  if (TM.onTeamJoin) TM.onTeamJoin((t, u) => runFlows('teamJoin', { person: u, team: t, chan: t.general }));
  else setImmediate(() => TM.onTeamJoin && TM.onTeamJoin((t, u) => runFlows('teamJoin', { person: u, team: t, chan: t.general })));
  hooks.afterReact.push((m, me, emoji, added) => { if (added && me && !me.bot && !m.chan.startsWith('dm:')) runFlows('reaction', { person: me, chan: m.chan, emoji, text: String(m.text || '').slice(0, 500) }); });
  ctx.ticks.push({ every: 20000, fn: (t0) => {
    const d = new Date(t0), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, day = d.getDay(), stamp = d.toDateString() + ' ' + hm;
    for (const f of Object.values(flows())) { const tr = f.trigger; if (!f.on || tr.type !== 'schedule' || tr.time !== hm || f.lastFired === stamp) continue; if (tr.freq === 'weekly' && !(tr.days || []).includes(day)) continue; f.lastFired = stamp; runFlow(f, { chan: '' }).catch(() => {}); }
  } });

  // every new message: outgoing webhooks, bot rules, message-triggered workflows (never for bot messages: no loops)
  hooks.afterMessage.push((m) => {
    if (!m.from || m.system || m.bot || m.deleted) return; const sender = userById(m.from); if (!sender || sender.bot) return;
    const text = String(m.text || '');
    if (text.includes('@')) for (const h of Object.values(whooks())) if (h.kind === 'out' && !h.off && h.chan === m.chan) { const bu = userById(h.uid); if (bu && mentionRe(bu.name).test(text)) callOut(h, m, sender).catch(() => {}); }
    runBots(m, sender);
    if (!m.chan.startsWith('dm:')) runFlows('message', { person: sender, chan: m.chan, text: text.slice(0, 2000) });
  });

  // ---------- card buttons that call back the bot or workflow that sent the card ----------
  api['POST /api/tm/card/action'] = async (req, res, me) => {
    const b = await body(req, 512), m = msgById.get(str(b.id, 32)); if (!m || m.deleted || !canSee(me, m.chan) || (ctx.canSeeMsg && !ctx.canSeeMsg(me, m))) fail(404, 'Message not found');
    const btn = m.card && Array.isArray(m.card.buttons) ? m.card.buttons[Number(b.button)] : null; if (!btn || btn.action !== 'post' || !m.bot) fail(400, 'That button does nothing.');
    if (!rate('cardact:' + me.id, 30, 60000)) fail(429, 'Slow down');
    const src = m.bot;
    if (src.kind === 'out') { const h = own(whooks(), src.id) ? whooks()[src.id] : null; if (!h) fail(410, 'That bot is gone.'); const d = await callOut(h, m, me, { action: btn.id, message: m.id }); return json(res, 200, { ok: true, text: d && d.text ? String(d.text).slice(0, 300) : '' }); }
    if (src.kind === 'flow') { const fid = String(btn.id).startsWith('flow:') ? String(btn.id).slice(5) : src.id, f = own(flows(), fid) ? flows()[fid] : null; if (!f) fail(410, 'That workflow is gone.'); await runFlow(f, { person: me, chan: m.chan, input: btn.id, text: String(m.text || '') }); return json(res, 200, { ok: true }); }
    if (src.kind === 'api') { const q = (events()[m.from] ||= []); q.push({ type: 'cardAction', msg: m.id, chan: m.chan, button: btn.id, user: { id: me.id, name: me.name }, ts: now() }); if (q.length > 200) q.splice(0, q.length - 200); store.save(); return json(res, 200, { ok: true }); }
    fail(400, 'That button does nothing.');
  };

  // ---------- API keys (Manage › Developer) and the bot API (x-api-key) ----------
  const keyOut = (k) => ({ id: k.id, name: k.name, uid: k.uid, bot: userById(k.uid)?.name || '?', scopes: k.scopes, by: k.by, created: k.created, lastUsed: k.lastUsed || 0, revoked: k.revoked || 0, prefix: 'lck_' + k.id });
  api['GET /api/tm/admin/keys'] = async (req, res, me) => { needAdmin(me); json(res, 200, { keys: Object.values(keys()).map(keyOut), bots: Object.values(db.users).filter((u) => u.bot && !u.deleted && !u.removed).map((u) => ({ id: u.id, name: u.name, kind: u.botKind || 'bot' })) }); };
  api['POST /api/tm/admin/keys/create'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 2048); if (!rate('keymk:' + me.id, 20, 3600000)) fail(429, 'Too many keys created. Try again later.');
    if (Object.values(keys()).filter((k) => !k.revoked).length >= 100) fail(400, 'Too many API keys.');
    const scopes = (Array.isArray(b.scopes) ? b.scopes : []).filter((s) => ['read', 'post'].includes(s)); if (!scopes.length) fail(400, 'Pick what the key may do (read, post).');
    let u = b.bot ? userById(str(b.bot, 32)) : null;
    if (b.bot && (!u || !u.bot || u.removed || u.deleted)) fail(400, 'Pick one of the bots.');
    if (!u) { const n = cleanUserName(b.botName || b.name); if (!n) fail(400, 'Name the bot this key acts as.'); if (TM.checkText) TM.checkText(n, me, 'name'); u = makeBot(n, null, 'api'); }
    const id = crypto.randomBytes(5).toString('hex'), secret = newSecret();
    keys()[id] = { id, name: str(b.name, 60).trim() || u.name, uid: u.id, scopes, by: me.id, created: now(), ...(await TM.hashSecret(secret)) };
    store.save(); audit(me, 'apikey.create', `${keys()[id].name} as ${u.name} (${scopes.join(', ')})`);
    json(res, 200, { key: `lck_${id}_${secret}`, info: keyOut(keys()[id]) });
  };
  api['POST /api/tm/admin/keys/revoke'] = async (req, res, me) => { needAdmin(me); const id = str((await body(req, 256)).id, 16), k = own(keys(), id) ? keys()[id] : fail(404, 'No such key'); k.revoked = now(); okCache.clear(); store.save(); audit(me, 'apikey.revoke', k.name); json(res, 200, { ok: true }); };
  async function keyAuth(req, scope) {
    if (!rate('botapi-ip:' + ipOf(req), 300, 60000)) fail(429, 'Too many requests. Wait a minute.');
    const raw = str(req.headers['x-api-key'], 200), mm = /^lck_([a-f0-9]{10})_([A-Za-z0-9_-]{20,100})$/.exec(raw);
    const rec = mm && own(keys(), mm[1]) ? keys()[mm[1]] : null;
    if (!(await verify(rec, mm ? mm[2] : '')) || rec.revoked) fail(401, 'Invalid or revoked API key');
    const u = userById(rec.uid); if (!u || u.deleted || !u.bot) fail(401, 'The bot for this API key is gone');
    if (scope && !rec.scopes.includes(scope)) fail(403, `This API key may not ${scope}.`);
    if (!rate('botapi:' + rec.id, 120, 60000)) fail(429, 'Too many requests for this key. Wait a minute.');
    rec.lastUsed = now(); return { rec, u };
  }
  for (const k of ['GET /api/bot/me', 'GET /api/bot/chats', 'GET /api/bot/messages', 'POST /api/bot/send', 'GET /api/bot/events']) ctx.publicRoutes.add(k);
  api['GET /api/bot/me'] = async (req, res) => { const { rec, u } = await keyAuth(req); json(res, 200, { id: u.id, name: u.name, scopes: rec.scopes }); };
  api['GET /api/bot/chats'] = async (req, res) => {
    const { u } = await keyAuth(req, 'read');
    const chans = Object.values(db.channels).filter((c) => canSee(u, c.id)).map((c) => ({ id: c.id, name: c.name, kind: c.kind || '', team: c.team || '', teamName: c.team && TM.teams && TM.teams()[c.team] ? TM.teams()[c.team].name : '' }));
    const dms = dmChansOf(u).map((c) => ({ id: c, kind: 'dm', with: c.split(':').slice(1).filter((i) => i !== u.id).map((i) => userById(i)?.name || '?')[0] || u.name }));
    json(res, 200, { chats: [...chans, ...dms] });
  };
  api['GET /api/bot/messages'] = async (req, res, me, url) => {
    const { u } = await keyAuth(req, 'read'), q = url.searchParams, chan = str(q.get('chan'), 64);
    if (!canSee(u, chan)) fail(404, 'No such chat (or the bot is not in it)');
    const after = Number(q.get('after')) || 0, limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
    const all = chanMsgs(chan).filter((m) => m.seq > after && (!ctx.canSeeMsg || ctx.canSeeMsg(u, m))), list = after ? all.slice(0, limit) : all.slice(-limit); // newest by default; ?after=<seq> pages forward
    json(res, 200, { messages: list.map(msgOut) });
  };
  api['POST /api/bot/send'] = async (req, res) => {
    const { rec, u } = await keyAuth(req, 'post'), b = await body(req, 300000), chan = str(b.chan, 64);
    if (!canSee(u, chan)) fail(404, 'No such chat (or the bot is not in it)');
    const m = ctx.createMessage(u, { chan, text: str(b.text, 8000), card: b.card, thread: b.thread ? str(b.thread, 32) : undefined, [SRC]: { kind: 'api', id: rec.id } });
    json(res, 200, { ok: true, id: m.id, seq: m.seq });
  };
  api['GET /api/bot/events'] = async (req, res) => { const { u } = await keyAuth(req, 'read'); const q = events()[u.id] || []; events()[u.id] = []; store.save(); json(res, 200, { events: q }); };
  // the developer guide (docs/API.md), shown from Manage › Developer
  api['GET /api/tm/docs/api'] = async (req, res) => {
    let txt = ''; try { txt = fs.readFileSync(path.join(__dirname, '..', 'docs', 'API.md'), 'utf8'); } catch { txt = 'The developer guide (docs/API.md) is not included in this copy of LANChat.'; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(txt);
  };
  void live;
};
