'use strict';
// LANChat server core. createApp() returns an isolated instance (one "session"), so the desktop app can host several.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { openStore, sha } = require('./store');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const SAFE_INLINE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.weba': 'audio/webm', '.pdf': 'application/pdf' };
const COLORS = ['#6264a7', '#c239b3', '#038387', '#ca5010', '#498205', '#0078d4', '#b146c2', '#986f0b', '#d13438', '#4f6bed'];
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const PUBLIC_ROUTES = new Set(['POST /api/join', 'GET /api/join/status', 'POST /api/join/cancel', 'GET /api/config']);

const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const safeEq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

function createApp(opts = {}) {
  const store = openStore(opts.dataDir || path.join(process.cwd(), 'data'), opts.passphrase);
  const db = store.db, P = store.paths;
  const publicDir = opts.publicDir || path.join(__dirname, '..', 'public');
  // settings proxy: always reads db.settings, so a restore (which swaps the object) can never leave a stale reference
  const S = new Proxy({}, {
    get: (_, k) => db.settings[k], set: (_, k, v) => { db.settings[k] = v; return true; }, has: (_, k) => k in db.settings,
    ownKeys: () => Reflect.ownKeys(db.settings), getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, writable: true, value: db.settings[k] }),
  });
  if (opts.name && !S.name) S.name = String(opts.name).slice(0, 40);
  if (!S.name) S.name = 'LANChat';
  if (typeof opts.passcode === 'string') S.passcode = opts.passcode;
  if (typeof opts.requireApproval === 'boolean') S.requireApproval = opts.requireApproval;

  // admin key: lets the host's own app/browser claim ownership. Never sent over the network except by the host's own client.
  let adminKey = opts.adminKey;
  if (!adminKey) {
    const kf = path.join(P.dir, 'admin.key');
    try { adminKey = fs.readFileSync(kf, 'utf8').trim(); } catch {}
    if (!adminKey) { adminKey = rid(24); try { fs.writeFileSync(kf, adminKey, { mode: 0o600 }); } catch {} }
  }
  const checkAdminKey = (k) => typeof k === 'string' && k.length > 10 && k.length < 200 && safeEq(k, adminKey);

  const clients = new Map();            // userId -> Set<res>
  const pending = new Map();            // join requests (memory only)
  const tokenIndex = new Map();         // sha256(token) -> userId
  const byChan = new Map(), msgById = new Map();
  const hits = new Map(), fileAccess = new Map();
  let trustProxy = !!opts.trustProxy, listenPort = 0;

  // ---------- indexes ----------
  function rebuildIndexes() {
    tokenIndex.clear(); byChan.clear(); msgById.clear();
    for (const u of Object.values(db.users)) for (const t of u.tokens) tokenIndex.set(t.h, u.id);
    for (const m of db.messages) { (byChan.get(m.chan) || byChan.set(m.chan, []).get(m.chan)).push(m); msgById.set(m.id, m); }
  }
  rebuildIndexes();
  const chanMsgs = (chan) => byChan.get(chan) || byChan.set(chan, []).get(chan);
  const lastSeq = (chan) => { const a = byChan.get(chan); return a && a.length ? a[a.length - 1].seq : 0; };

  // ---------- generic helpers ----------
  const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(b); };
  function readBody(req, limit = 1 << 20) {
    return new Promise((resolve, reject) => {
      let size = 0, over = false; const chunks = [];
      req.on('data', (c) => { if (over) return; size += c.length; if (size > limit) { over = true; chunks.length = 0; reject(Object.assign(new Error('Request too large'), { status: 413 })); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  const body = async (req, limit) => { const b = await readBody(req, limit); try { const o = JSON.parse(b.toString('utf8') || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
  const ipOf = (req) => {
    let ip = req.socket.remoteAddress || '';
    if (trustProxy) ip = String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || ip);
    return ip.replace(/^::ffff:/, '').slice(0, 64);
  };
  function rate(key, max, windowMs) {
    const now = Date.now(); let a = hits.get(key); if (!a) hits.set(key, a = []);
    while (a.length && a[0] <= now - windowMs) a.shift();
    if (a.length >= max) return false; a.push(now); return true;
  }
  const rateCount = (key, windowMs) => { const a = hits.get(key); if (!a) return 0; const now = Date.now(); return a.filter((t) => t > now - windowMs).length; };
  const rateAdd = (key) => { let a = hits.get(key); if (!a) hits.set(key, a = []); a.push(Date.now()); };
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  // ---------- users ----------
  const userById = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(db.users, id) ? db.users[id] : null);
  const userByToken = (t) => { if (typeof t !== 'string' || !t || t.length > 200) return null; const id = tokenIndex.get(sha(t)); const u = id && db.users[id]; return u && !u.removed ? u : null; };
  const cleanUserName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').replace(/^@+/, '').trim().slice(0, 24);
  const findByName = (n) => { const l = String(n).toLowerCase(); return Object.values(db.users).find((u) => u.name.toLowerCase() === l) || null; };
  const isOwner = (u) => !!u && u.role === 'owner';
  const isAdmin = (u) => !!u && (u.role === 'owner' || u.role === 'admin');
  const online = (id) => (clients.get(id)?.size || 0) > 0;
  const adminIds = () => Object.values(db.users).filter((u) => isAdmin(u) && !u.removed).map((u) => u.id);
  const sanitizeUserName = (n) => { const c = cleanUserName(n); if (!c || ['everyone', 'here', 'channel'].includes(c.toLowerCase())) fail(400, c ? 'That name is reserved' : 'Pick a name'); return c; };

  function newToken(u, dev) {
    const tok = crypto.randomBytes(24).toString('hex');
    u.tokens.push({ h: sha(tok), created: Date.now(), last: 0, dev: str(dev, 64) });
    while (u.tokens.length > 10) { const old = u.tokens.shift(); tokenIndex.delete(old.h); }
    tokenIndex.set(sha(tok), u.id); store.save(); return tok;
  }
  function makeUser(name) {
    const u = { id: rid(8), name, color: COLORS[Object.keys(db.users).length % COLORS.length], role: 'member', tokens: [], created: Date.now(), lastSeen: Date.now(), read: {}, seen: {}, delivered: {}, prefs: {}, presence: 'auto', statusText: '', statusEmoji: '', mutedUntil: 0, baseSeq: db.seq };
    db.users[u.id] = u; store.save(); return u;
  }
  function makeOwner(u) {
    for (const o of Object.values(db.users)) if (o.role === 'owner' && o.id !== u.id) o.role = 'admin';
    u.role = 'owner'; u.removed = false; store.save();
  }
  const presenceOf = (u, viewer) => {
    if (!online(u.id)) return 'offline';
    if (u.presence === 'invisible') return viewer && viewer.id === u.id ? 'invisible' : 'offline';
    if (u.presence === 'auto') return u.idle ? 'away' : 'online';
    return u.presence;
  };
  const pub = (u, viewer) => ({
    id: u.id, name: u.name, color: u.color, avatar: u.avatar || null, statusText: u.statusText, statusEmoji: u.statusEmoji, role: u.role, removed: !!u.removed,
    presence: presenceOf(u, viewer), lastSeen: u.presence === 'invisible' && (!viewer || viewer.id !== u.id) ? 0 : (u.lastSeen || 0), muted: u.mutedUntil > Date.now(),
  });
  const meOut = (u) => ({ ...pub(u, u), prefs: u.prefs, mutedUntil: u.mutedUntil });

  // ---------- chats ----------
  const dmParts = (chan) => chan.split(':');
  const validChan = (chan) => {
    if (typeof chan !== 'string' || chan.length > 64) return false;
    if (chan.startsWith('dm:')) { const p = dmParts(chan); return p.length === 3 && p[1] < p[2] && !!userById(p[1]) && !!userById(p[2]); }
    return Object.prototype.hasOwnProperty.call(db.channels, chan);
  };
  const canSee = (u, chan) => {
    if (!u || !validChan(chan)) return false;
    if (chan.startsWith('dm:')) return dmParts(chan).slice(1).includes(u.id);
    const c = db.channels[chan]; return !c.members || c.members.includes(u.id);
  };
  const audience = (chan) => (chan.startsWith('dm:') ? dmParts(chan).slice(1) : (db.channels[chan]?.members || null));
  const dmPeer = (chan, me) => dmParts(chan).slice(1).find((i) => i !== me.id);
  const dmChansOf = (u) => [...byChan.keys()].filter((c) => c.startsWith('dm:') && dmParts(c).includes(u.id) && userById(dmParts(c)[1]) && userById(dmParts(c)[2]));
  const chanOut = (c) => ({ id: c.id, name: c.name, topic: c.topic || '', category: c.category || '', created: c.created, by: c.by || null, members: c.members || undefined, readonly: !!c.readonly, slow: c.slow || 0, ttl: c.ttl || 0 });

  // ---------- events ----------
  function emit(event, data, ids) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (ids) { for (const id of ids) { const set = clients.get(id); if (set) for (const res of set) res.write(payload); } }
    else for (const set of clients.values()) for (const res of set) res.write(payload);
  }
  const emitFor = (event, make, ids) => { // per-viewer payloads (presence-aware user objects)
    for (const [id, set] of clients) { if (ids && !ids.includes(id)) continue; const v = db.users[id]; const payload = `event: ${event}\ndata: ${JSON.stringify(make(v))}\n\n`; for (const res of set) res.write(payload); }
  };
  const emitUser = (u) => emitFor('user', (v) => pub(u, v));
  const notifyHost = (name, payload) => { try { opts.onEvent && opts.onEvent(name, payload); } catch {} };

  // ---------- messages ----------
  function msgOut(m) {
    if (m.deleted) return { id: m.id, seq: m.seq, chan: m.chan, from: m.from, ts: m.ts, deleted: true, deletedBy: m.deletedBy || null, thread: m.thread || null, threadCount: m.threadCount || 0 };
    const o = { ...m }; delete o.editHistory; o.edits = (m.editHistory || []).length;
    if (o.poll && o.poll.quiz && !o.poll.closed) { o.poll = { ...o.poll }; delete o.poll.correct; }
    return o;
  }
  function addMessage(m) {
    m.id ||= rid(8); m.seq = ++db.seq; m.ts ||= Date.now(); m.reactions ||= {};
    db.messages.push(m); chanMsgs(m.chan).push(m); msgById.set(m.id, m);
    if (m.thread) {
      const root = msgById.get(m.thread);
      if (root) { root.threadCount = (root.threadCount || 0) + 1; root.threadLast = m.ts; root.threadUsers = [...new Set([m.from, ...(root.threadUsers || [])])].filter(Boolean).slice(0, 3); emit('update', msgOut(root), audience(root.chan)); }
    }
    const sender = m.from && db.users[m.from]; if (sender) sender.read[m.chan] = m.seq;
    store.save();
    const aud = audience(m.chan);
    emit('message', msgOut(m), aud);
    if (m.chan.startsWith('dm:') && sender) { const peer = userById(dmPeer(m.chan, sender)); if (peer && online(peer.id)) { peer.delivered[m.chan] = m.seq; emit('delivered', { chan: m.chan, user: peer.id, seq: m.seq }, aud); } }
    return m;
  }
  const sysMsg = (chan, text, extra) => addMessage({ chan, from: null, text: '', system: String(text).slice(0, 300), ...(extra || {}) });

  function gcFiles(candidates) {
    const live = new Set();
    for (const m of db.messages) if (m.files) for (const f of m.files) live.add(f.id);
    for (const s of db.scheduled) if (s.files) for (const f of s.files) live.add(f.id);
    for (const u of Object.values(db.users)) if (u.avatar) live.add(u.avatar);
    for (const id of Object.values(db.emojis)) live.add(id);
    for (const id of candidates) if (id && !live.has(id)) { delete db.files[id]; fs.unlink(path.join(P.uploads, id), () => {}); }
  }
  // hard-delete messages (and thread replies of removed roots); returns count
  function removeMessages(list) {
    const ids = new Set(list.map((m) => m.id));
    for (const m of db.messages) if (m.thread && ids.has(m.thread)) ids.add(m.id);
    const gone = db.messages.filter((m) => ids.has(m.id)); if (!gone.length) return 0;
    const files = []; const byC = new Map();
    for (const m of gone) { if (m.files) files.push(...m.files.map((f) => f.id)); (byC.get(m.chan) || byC.set(m.chan, []).get(m.chan)).push(m.id); msgById.delete(m.id); }
    db.messages = db.messages.filter((m) => !ids.has(m.id));
    for (const c of byC.keys()) byChan.set(c, chanMsgs(c).filter((m) => !ids.has(m.id)));
    for (const m of gone) if (m.thread && msgById.get(m.thread) && !ids.has(m.thread)) { const root = msgById.get(m.thread); root.threadCount = Math.max(0, (root.threadCount || 1) - 1); emit('update', msgOut(root), audience(root.chan)); }
    gcFiles(files); store.save();
    for (const [chan, mids] of byC) emit('purge', { chan, ids: mids }, audience(chan));
    return gone.length;
  }

  // ---------- files ----------
  function fileCanRead(u, id) {
    const rec = db.files[id]; if (!rec) return false;
    if (rec.by === u.id) return true;
    const key = u.id + ':' + id, hit = fileAccess.get(key); if (hit && hit > Date.now()) return true;
    let ok = Object.values(db.users).some((x) => x.avatar === id) || Object.values(db.emojis).includes(id);
    if (!ok) ok = db.messages.some((m) => m.files && m.files.some((f) => f.id === id) && canSee(u, m.chan));
    if (ok) fileAccess.set(key, Date.now() + 30000);
    return ok;
  }
  function serveFile(req, res, u, id) {
    const rec = db.files[id];
    if (!rec || !fileCanRead(u, id)) { res.writeHead(404); return res.end('Not found'); }
    const f = path.join(P.uploads, id);
    fs.stat(f, (e, st) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(rec.name).toLowerCase(), type = SAFE_INLINE[ext], size = st.size;
      let start = 0, end = size - 1, status = 200;
      const r = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (r && (r[1] || r[2])) {
        if (r[1]) { start = Number(r[1]); if (r[2]) end = Math.min(Number(r[2]), size - 1); } else { start = Math.max(0, size - Number(r[2])); }
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        status = 206;
      }
      const h = {
        'Content-Type': type || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${type && req.url.includes('inline=1') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rec.name)}`, 'Cache-Control': 'private, max-age=3600',
      };
      if (ext === '.pdf') h['Content-Security-Policy'] = "frame-ancestors 'self'"; else h['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      if (status === 206) h['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(status, h);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f, { start, end }).pipe(res);
    });
  }

  // ---------- context shared with route modules ----------
  const api = {};
  const ticks = [];
  const ctx = {
    opts, db, store, P, S, api, ticks, clients, pending, hits, msgById, byChan, fileAccess,
    json, body, readBody, fail, rid, sha, str, isObj, BAD_KEYS, safeEq, rate, rateCount, rateAdd, ipOf, COLORS,
    userById, userByToken, cleanUserName, sanitizeUserName, findByName, isOwner, isAdmin, online, adminIds, newToken, makeUser, makeOwner, checkAdminKey,
    presenceOf, pub, meOut, validChan, canSee, audience, dmPeer, dmChansOf, dmParts, chanOut, chanMsgs, lastSeq,
    emit, emitFor, emitUser, notifyHost, msgOut, addMessage, sysMsg, removeMessages, gcFiles, fileCanRead, rebuildIndexes,
    getName: () => S.name, setTrustProxy: (v) => { trustProxy = !!v; },
    isBanned: (name, dev, ip) => db.bans.names.includes(String(name).toLowerCase()) || (dev && db.bans.devices.includes(dev)) || (ip && db.bans.ips.includes(ip)),
  };
  for (const mod of ['routes-auth', 'routes-admin', 'routes-chat', 'routes-collab']) require('./' + mod)(ctx);

  // ---------- init snapshot for a connecting client ----------
  function clientSettings() { const { passcode, ...rest } = S; return { ...rest, hasPasscode: !!passcode }; }
  function initFor(u) {
    const vis = Object.values(db.channels).filter((c) => canSee(u, c.id));
    const dms = dmChansOf(u);
    const unread = {}, mentions = {}, read = {}, peers = {};
    for (const chan of [...vis.map((c) => c.id), ...dms]) {
      const base = u.read[chan] ?? u.baseSeq; read[chan] = base;
      const arr = chanMsgs(chan);
      for (let i = arr.length - 1; i >= 0 && arr[i].seq > base; i--) {
        const m = arr[i]; if (m.deleted || !m.from || m.from === u.id) continue;
        unread[chan] = (unread[chan] || 0) + 1;
        if (m.everyone || (m.mentions && m.mentions.includes(u.id))) mentions[chan] = (mentions[chan] || 0) + 1;
      }
    }
    for (const chan of [...dms, ...vis.filter((c) => c.members).map((c) => c.id)]) {
      const ids = audience(chan).filter((i) => i !== u.id), o = {};
      for (const i of ids) { const x = userById(i); if (x) o[i] = { seen: x.seen[chan] || 0, delivered: x.delivered[chan] || 0 }; }
      peers[chan] = o;
    }
    return {
      chatName: S.name, me: meOut(u), users: Object.values(db.users).map((x) => pub(x, u)), channels: vis.map(chanOut), dms, unread, mentions, read, peers,
      settings: clientSettings(), calls: ctx.activeCalls ? ctx.activeCalls(u) : [], emojis: db.emojis, dmTtl: db.dmTtl, serverTime: Date.now(), pending: isAdmin(u) ? [...pending.values()].filter((r) => r.status === 'pending').map(reqOut) : [],
    };
  }
  const reqOut = (r) => ({ id: r.id, name: r.name, ts: r.ts, existing: !!r.existingId, ip: r.ip });
  ctx.reqOut = reqOut; ctx.clientSettings = clientSettings;

  function events(req, res, url) {
    const u = userByToken(url.searchParams.get('token'));
    if (!u) { res.writeHead(401); return res.end(); }
    const set = clients.get(u.id) || new Set(); if (set.size >= 8) { res.writeHead(429); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    res.write('retry: 3000\n\n');
    const wasOnline = online(u.id); clients.set(u.id, set); set.add(res); u.lastSeen = Date.now();
    res.write(`event: init\ndata: ${JSON.stringify(initFor(u))}\n\n`);
    if (!wasOnline) emitUser(u);
    // mark DMs delivered
    for (const chan of dmChansOf(u)) { const last = lastSeq(chan); if ((u.delivered[chan] || 0) < last) { u.delivered[chan] = last; emit('delivered', { chan, user: u.id, seq: last }, audience(chan)); } }
    const ka = setInterval(() => { try { res.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch {} }, 20000);
    req.on('close', () => { clearInterval(ka); set.delete(res); if (!set.size) { clients.delete(u.id); u.lastSeen = Date.now(); u.idle = false; store.save(); emitUser(u); } });
  }

  // ---------- HTTP ----------
  const pageHeaders = (extra) => ({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache', ...extra });
  function serveStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(publicDir, p));
    if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file), h = pageHeaders({ 'Content-Type': MIME[ext] || 'application/octet-stream' });
      if (ext === '.html') h['Content-Security-Policy'] = PAGE_CSP;
      res.writeHead(200, h); res.end(buf);
    });
  }
  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    try {
      let m;
      if ((m = url.pathname.match(/^\/files\/([a-f0-9]{24})\/(.*)$/)) && (req.method === 'GET' || req.method === 'HEAD')) {
        const u = userByToken(url.searchParams.get('token')); if (!u) { res.writeHead(401); return res.end('Unauthorized'); }
        return serveFile(req, res, u, m[1]);
      }
      if (url.pathname === '/api/events' && req.method === 'GET') return events(req, res, url);
      const key = `${req.method} ${url.pathname}`;
      if (Object.prototype.hasOwnProperty.call(api, key)) {
        if (PUBLIC_ROUTES.has(key)) return await api[key](req, res, null, url);
        const me = userByToken(req.headers['x-token'] || url.searchParams.get('token'));
        if (!me) return json(res, 401, { error: 'Not signed in' });
        me.lastSeen = Date.now();
        return await api[key](req, res, me, url);
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(req, res, url);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e.status === 413) { res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' }); return res.end(JSON.stringify({ error: e.message }), () => req.socket.destroy()); }
      if (e.status) return json(res, e.status, { error: e.message });
      console.error('Server error:', e); json(res, 500, { error: 'Server error' });
    }
  });

  // ---------- timers ----------
  let tickTimer = null; const lastRun = new Map();
  function tick() {
    const now = Date.now();
    for (const t of ticks) { if (now - (lastRun.get(t) || 0) >= t.every) { lastRun.set(t, now); try { t.fn(now); } catch (e) { console.error('tick error:', e.message); } } }
  }
  function lanAddresses() {
    const lan = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    return ips.sort((a, b) => lan(b) - lan(a)).map((ip) => ({ ip, lan: lan(ip), url: `http://${ip}:${listenPort}` }));
  }
  ctx.lanAddresses = lanAddresses;

  return {
    server, ctx, adminKey,
    get port() { return listenPort; },
    start(port = 3000, tries = 10) {
      return new Promise((resolve, reject) => {
        const onErr = (e) => { server.removeListener('error', onErr); if (e.code === 'EADDRINUSE' && tries > 0) resolve(this.start(port + 1, tries - 1)); else reject(e); };
        server.once('error', onErr);
        server.listen(port, '0.0.0.0', () => { server.removeListener('error', onErr); listenPort = port; if (!tickTimer) tickTimer = setInterval(tick, 1000); resolve(port); });
      });
    },
    stop() { clearInterval(tickTimer); tickTimer = null; store.flush(); store.close(); try { for (const set of clients.values()) for (const r of set) r.end(); server.closeAllConnections(); server.close(); } catch {} },
    flush: () => store.flush(),
    lanAddresses, onlineCount: () => clients.size, getName: () => S.name,
    setName(n) { const c = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!c) return S.name; S.name = c; store.save(); emit('meta', { name: c }); return c; },
    setTrustProxy: (v) => { trustProxy = !!v; },
    setPublicUrl: (u) => { ctx.publicUrl = u || ''; },
    setSetting(k, v) { if (!['requireApproval', 'passcode'].includes(k)) return; S[k] = v; store.save(); emit('settings', clientSettings()); },
    getSetting: (k) => S[k],
    store: store,
    encrypted: () => store.isEncrypted(),
    pendingCount: () => [...pending.values()].filter((r) => r.status === 'pending').length,
  };
}

module.exports = { createApp };
