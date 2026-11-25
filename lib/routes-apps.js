'use strict';
// Built-in apps (section 10). This file: helpers shared by lib/routes-apps-*.js (ctx.apps), the per-chat tab list
// ("Add a tab" / app store), website tabs (can the page be framed?), live components inside messages (m.live),
// cards posted by the apps (m.apCard) and access to files the apps use (images on pages, attachments).
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, userById, isAdmin, canSee, audience, emit, validChan, msgById, msgOut } = ctx;
  const A = (ctx.apps = {});
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  A.own = own;

  // ---------- small validators ----------
  A.int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  A.ts = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 4e12 ? Math.round(n) : 0; };
  A.text = (v, max) => str(v, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  A.line = (v, max) => A.text(v, max).replace(/\s+/g, ' ').trim();
  A.color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(str(v, 7)) ? v.toLowerCase() : d);
  A.oneOf = (v, list, d) => (list.includes(v) ? v : d);
  A.nid = () => rid(6);
  A.url = (v) => { const s = str(v, 1000).trim(); if (!s) return ''; let u; try { u = new URL(s); } catch { return null; } return /^(https?|mailto):$/.test(u.protocol) && !u.username && !u.password ? u.toString() : null; };
  A.hm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(str(v, 5)) ? v : null);

  // ---------- chats and people ----------
  A.see = (me, chan) => { chan = str(chan, 64); if (!canSee(me, chan)) fail(404, 'No such chat'); return chan; };
  A.writeErr = (me, chan) => {
    if (me.mutedUntil > Date.now()) return 'You are muted.';
    if (!chan.startsWith('dm:') && db.channels[chan] && db.channels[chan].readonly && !isAdmin(me)) return 'Only admins can change things in this channel.';
    return '';
  };
  A.writer = (me, chan) => { chan = A.see(me, chan); const e = A.writeErr(me, chan); if (e) fail(403, e); return chan; };
  // DM participants, the group's creator and admins manage a chat's tabs and apps
  A.isManager = (me, chan) => isAdmin(me) || chan.startsWith('dm:') || (!!db.channels[chan] && !!db.channels[chan].members && db.channels[chan].by === me.id);
  A.people = (chan) => Object.values(db.users).filter((u) => !u.removed && !u.deleted && canSee(u, chan)).map((u) => u.id);
  A.member = (chan, id) => { const u = userById(str(id, 32)); return u && !u.removed && !u.deleted && canSee(u, chan) ? u.id : ''; };
  A.anyone = (id) => { const u = userById(str(id, 32)); return u && !u.removed && !u.deleted ? u.id : ''; };
  A.ids = (list, ok, max = 50) => [...new Set((Array.isArray(list) ? list : []).map((x) => ok(x)).filter(Boolean))].slice(0, max);
  A.chanLabel = (chan, viewer) => {
    if (chan.startsWith('dm:')) { const p = chan.split(':').slice(1), other = p.find((i) => !viewer || i !== viewer.id) || p[0], u = userById(other); return u ? u.name : 'a chat'; }
    const c = db.channels[chan]; return c ? (c.members ? c.name : '#' + c.name) : 'a chat';
  };
  // per-chat records remember the chat's creation time, so a chat deleted and created again with the same name starts empty
  A.created = (chan) => (chan.startsWith('dm:') ? 0 : (db.channels[chan] && db.channels[chan].created) || 0);
  A.peek = (name, chan) => { const all = ctx.coll(name), r = own(all, chan) ? all[chan] : null; return r && r.cc === A.created(chan) ? r : null; };
  A.chatRec = (name, chan, init) => { const all = ctx.coll(name); let r = own(all, chan) ? all[chan] : null; if (!r || r.cc !== A.created(chan)) r = all[chan] = { cc: A.created(chan), ...init() }; return r; };
  A.chatColls = new Set();
  A.perChat = (name) => A.chatColls.add(name);
  ctx.ticks.push({ every: 3600000, fn: () => { // drop data of chats that no longer exist
    let dirty = false;
    for (const name of A.chatColls) { const all = ctx.coll(name); for (const chan of Object.keys(all)) if (!validChan(chan) || all[chan].cc !== A.created(chan)) { delete all[chan]; dirty = true; } }
    if (dirty) store.save();
  } });

  // ---------- time zones: wall-clock times of a place (bookings, check-ins) ----------
  const fmts = new Map(), WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmt = (tz) => { if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' })); return fmts.get(tz); };
  A.hostTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  A.tz = (v) => { const s = str(v, 64); if (!s) return A.hostTz; try { fmt(s); return s; } catch { return A.hostTz; } };
  A.wall = (tz, ts) => { const p = {}; for (const x of fmt(tz).formatToParts(new Date(ts))) p[x.type] = x.value; return { y: +p.year, m: +p.month, d: +p.day, wd: WD.indexOf(p.weekday), min: (+p.hour % 24) * 60 + +p.minute, s: +p.second, date: `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` }; };
  A.offset = (tz, ts) => { const w = A.wall(tz, ts); return Math.round((Date.UTC(w.y, w.m - 1, w.d, 0, w.min, w.s) - Math.floor(ts / 1000) * 1000) / 60000); };
  A.fromWall = (tz, y, m, d, min) => { const guess = Date.UTC(y, m - 1, d, 0, min), first = guess - A.offset(tz, guess) * 60000; return guess - A.offset(tz, first) * 60000; };

  // ---------- activity + live events ----------
  A.notify = (uid, item) => { try { return ctx.activity(uid, item); } catch (e) { console.error('apps activity:', e.message); return null; } };
  A.toChat = (event, chan, data) => emit(event, { chan, ...data }, audience(chan));

  // ---------- cards the apps post into a chat (forms, approvals, check-ins) ----------
  const CARD = Symbol('apCard');
  ctx.hooks.beforeMessage.push((m, p) => { if (p && p[CARD]) m.apCard = p[CARD]; });
  A.postCard = (me, chan, card, text) => ctx.createMessage(me, { chan, text: str(text, 300), [CARD]: card });
  A.updateCard = (msgId, patch) => {
    const m = msgId && msgById.get(msgId); if (!m || m.deleted || !m.apCard) return;
    Object.assign(m.apCard, patch); store.save(); emit('update', msgOut(m), audience(m.chan));
  };

  // ---------- files the apps use (pictures on notebook pages and whiteboards, attachments) ----------
  // core gcFiles() keeps files listed by hooks.liveFiles; fileCanRead() asks hooks.fileRead (docs/features-apps.md)
  const keepers = [], readers = [];
  A.keepFiles = (fn) => keepers.push(fn);
  A.shareFiles = (fn) => readers.push(fn);
  (ctx.hooks.liveFiles ||= []).push(() => keepers.flatMap((f) => { try { return f() || []; } catch { return []; } }));
  (ctx.hooks.fileRead ||= []).push((u, id) => readers.some((f) => { try { return f(u, id); } catch { return false; } }));
  A.FID = /^[a-f0-9]{24}$/;
  // a file reference coming from a client: either one this person uploaded, or one that is already part of the record
  A.fileRef = (me, f, already = []) => {
    if (!isObj(f)) return null; const id = str(f.id, 24); if (!A.FID.test(id)) return null;
    const rec = db.files[id]; if (!rec) return null;
    if (rec.by !== me.id && !already.some((x) => x && x.id === id)) return null;
    return { id, name: rec.name, size: rec.size };
  };

  // ---------- rich text: strict allow-list sanitiser (notebook pages) ----------
  const TAGS = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'mark', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'sub', 'sup']);
  const VOID = new Set(['br', 'hr', 'img']);
  const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select', 'title', 'head', 'xml', 'frameset', 'frame', 'noembed', 'plaintext', 'xmp', 'canvas', 'video', 'audio', 'button', 'form', 'input', 'link', 'meta', 'base']);
  const escText = (s) => s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', nbsp: ' ', sol: '/', lpar: '(', rpar: ')', period: '.' };
  const decode = (s) => s.replace(/&#(\d{1,7});?/g, (_m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff))).replace(/&#x([0-9a-f]{1,6});?/gi, (_m, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff))).replace(/&([a-z]+);?/gi, (m, n) => (own(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : m));
  const safeHref = (raw) => { const v = decode(raw).replace(/[\u0000- \u007f-\u009f]/g, ''); if (/&[a-z#]/i.test(v)) return ''; return /^(https?:\/\/|mailto:)/i.test(v) ? v.slice(0, 1000) : ''; };
  function parseTag(s, i) { // s[i] === '<' → { end, close, name, attrs } or null (then '<' is plain text)
    let j = i + 1, close = false; if (s[j] === '/') { close = true; j++; }
    const m = /^[a-zA-Z][a-zA-Z0-9-]{0,20}/.exec(s.slice(j, j + 22)); if (!m) return null;
    const name = m[0].toLowerCase(), attrs = []; j += m[0].length;
    for (let guard = 0; guard < 200; guard++) {
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j >= s.length) return null;
      if (s[j] === '>') return { end: j + 1, close, name, attrs };
      if (s[j] === '/') { j++; continue; }
      let k = j; while (k < s.length && !/[\s=>/]/.test(s[k])) k++;
      const an = s.slice(j, k).toLowerCase(); j = k; while (j < s.length && /\s/.test(s[j])) j++;
      let av = '';
      if (s[j] === '=') {
        j++; while (j < s.length && /\s/.test(s[j])) j++;
        if (s[j] === '"' || s[j] === "'") { const e = s.indexOf(s[j], j + 1); if (e < 0) return null; av = s.slice(j + 1, e); j = e + 1; }
        else { let e = j; while (e < s.length && !/[\s>]/.test(s[e])) e++; av = s.slice(j, e); j = e; }
      }
      if (an) attrs.push([an, av]); else j++;
    }
    return null;
  }
  function tagOut(name, attrs) {
    const get = (k) => { const a = attrs.find((x) => x[0] === k); return a ? a[1] : null; };
    let out = '<' + name;
    if (name === 'a') { const h = safeHref(get('href') || ''); if (h) out += ` href="${escAttr(h)}" target="_blank" rel="noopener noreferrer"`; }
    else if (name === 'img') {
      const fid = String(get('data-fid') || ''); if (!A.FID.test(fid)) return null;
      out += ` data-fid="${fid}" data-fname="${escAttr(decode(get('data-fname') || 'image.png').replace(/[\\/\0-\x1f"<>]/g, '_').slice(0, 120))}" alt="${escAttr(decode(get('alt') || '').slice(0, 200))}"`;
      const w = Number(get('width')); if (Number.isFinite(w) && w >= 16 && w <= 4000) out += ` width="${Math.round(w)}"`;
    } else if (name === 'td' || name === 'th') { for (const k of ['colspan', 'rowspan']) { const n = Number(get(k)); if (Number.isInteger(n) && n > 1 && n <= 20) out += ` ${k}="${n}"`; } }
    else if (name === 'p' || name === 'li' || name === 'div') { const cl = String(get('class') || '').split(/\s+/); if (cl.includes('ap-chk')) out += ` class="ap-chk${cl.includes('on') ? ' on' : ''}"`; }
    else if (name === 'ol') { const n = Number(get('start')); if (Number.isInteger(n) && n > 1 && n < 100000) out += ` start="${n}"`; }
    return out + '>';
  }
  A.cleanHtml = (src, max = 200000) => {
    const s = String(typeof src === 'string' ? src : ''); if (s.length > max) fail(413, 'This page is too long. Split it into two pages.');
    let out = '', i = 0; const stack = [];
    while (i < s.length) {
      const lt = s.indexOf('<', i);
      if (lt < 0) { out += escText(s.slice(i)); break; }
      if (lt > i) out += escText(s.slice(i, lt));
      if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
      if (s[lt + 1] === '!' || s[lt + 1] === '?') { const e = s.indexOf('>', lt); i = e < 0 ? s.length : e + 1; continue; }
      const tg = parseTag(s, lt);
      if (!tg) { out += '&lt;'; i = lt + 1; continue; }
      i = tg.end;
      if (DROP.has(tg.name)) { if (!tg.close && !VOID.has(tg.name)) { const re = new RegExp('</' + tg.name + '\\s*>', 'ig'); re.lastIndex = i; const m = re.exec(s); i = m ? m.index + m[0].length : s.length; } continue; }
      if (!TAGS.has(tg.name)) continue; // unknown tag: drop it, keep what is inside
      if (tg.close) { const k = stack.lastIndexOf(tg.name); if (k >= 0) while (stack.length > k) out += '</' + stack.pop() + '>'; continue; }
      if (stack.length >= 40) continue;
      const t = tagOut(tg.name, tg.attrs); if (!t) continue;
      out += t; if (!VOID.has(tg.name)) stack.push(tg.name);
    }
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
  };
  A.htmlText = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  A.htmlFiles = (html) => [...String(html || '').matchAll(/data-fid="([a-f0-9]{24})"/g)].map((m) => m[1]);

  // ---------- per-chat tab list ("+" gallery, rename, remove, reorder) ----------
  A.perChat('ap_tabs');
  const tabOut = (r) => (r ? { added: r.added, hidden: r.hidden, names: r.names, order: r.order, v: r.v || 0 } : null);
  ctx.hooks.initExtra.push((u) => {
    const all = ctx.coll('ap_tabs'), out = {};
    for (const chan of Object.keys(all)) { const r = A.peek('ap_tabs', chan); if (r && canSee(u, chan)) out[chan] = tabOut(r); }
    return { apTabs: out, apUser: ctx.coll('ap_user')[u.id] || {} };
  });
  const KEY = /^[a-z][a-z0-9_]{1,30}(:[a-f0-9]{12})?$/;
  api['GET /api/ap/tabs'] = async (req, res, me, url) => { const chan = A.see(me, url.searchParams.get('chan')); json(res, 200, { cfg: tabOut(A.peek('ap_tabs', chan)) }); };
  api['POST /api/ap/tabs'] = async (req, res, me) => {
    const b = await body(req, 8192), chan = A.writer(me, b.chan), op = str(b.op, 10), manager = A.isManager(me, chan);
    if (!rate('aptabs:' + me.id, 60, 60000)) fail(429, 'Slow down a little.');
    const r = A.chatRec('ap_tabs', chan, () => ({ added: [], hidden: [], names: {}, order: [], v: 0 }));
    const key = str(b.key, 64), inst = r.added.find((x) => (x.type === x.id ? x.type : x.type + ':' + x.id) === key);
    const mayChange = () => { if (!manager && !(inst && inst.by === me.id)) fail(403, 'Only the person who added this tab, the group owner or an admin can change it.'); };
    if (op === 'add') {
      const type = str(b.type, 31); if (!/^[a-z][a-z0-9_]{1,30}$/.test(type)) fail(400, 'Unknown kind of tab');
      if (r.added.length >= 30) fail(400, 'This chat has too many tabs.');
      const name = A.line(b.name, 30);
      if (b.multi) { // several of the same kind (website tabs): each has its own id and settings
        const u = A.url(b.url); if (type === 'ap_web' && !u) fail(400, 'Enter a web address that starts with http:// or https://');
        const x = { id: rid(6), type, name: name || 'Website', url: u || '', by: me.id, ts: Date.now() }; r.added.push(x);
        r.hidden = r.hidden.filter((k) => k !== type + ':' + x.id); r.v++; store.save(); A.toChat('ap_tabs', chan, { cfg: tabOut(r) }); return json(res, 200, { ok: true, key: type + ':' + x.id, cfg: tabOut(r) });
      }
      r.hidden = r.hidden.filter((k) => k !== type);
      if (!r.added.some((x) => x.id === type)) r.added.push({ id: type, type, by: me.id, ts: Date.now() });
      if (name) r.names[type] = name;
      r.v++; store.save(); A.toChat('ap_tabs', chan, { cfg: tabOut(r) }); return json(res, 200, { ok: true, key: type, cfg: tabOut(r) });
    }
    if (op !== 'order' && (!KEY.test(key) || key === 'chat')) fail(400, "That tab can't be changed.");
    if (op === 'remove') {
      mayChange(); r.added = r.added.filter((x) => x !== inst); if (!r.hidden.includes(key)) r.hidden.push(key); r.hidden = r.hidden.slice(-60);
      delete r.names[key]; r.order = r.order.filter((k) => k !== key);
    } else if (op === 'rename') { mayChange(); const n = A.line(b.name, 30); if (n) r.names[key] = n; else delete r.names[key]; if (inst && inst.type !== inst.id && n) inst.name = n; }
    else if (op === 'url') { mayChange(); if (!inst || inst.type === inst.id) fail(400, 'This tab has no address.'); const u = A.url(b.url); if (!u) fail(400, 'Enter a web address that starts with http:// or https://'); inst.url = u; }
    else if (op === 'order') { if (!manager) fail(403, 'Only the group owner or an admin can reorder tabs here.'); r.order = (Array.isArray(b.keys) ? b.keys : []).map((k) => str(k, 64)).filter((k) => KEY.test(k)).slice(0, 60); }
    else fail(400, 'Bad operation');
    r.v++; store.save(); A.toChat('ap_tabs', chan, { cfg: tabOut(r) }); json(res, 200, { ok: true, cfg: tabOut(r) });
  };
  api['POST /api/ap/tabs/reset'] = async (req, res, me) => {
    const b = await body(req, 512), chan = A.writer(me, b.chan); if (!A.isManager(me, chan)) fail(403, 'Only the group owner or an admin can reset the tabs.');
    delete ctx.coll('ap_tabs')[chan]; store.save(); A.toChat('ap_tabs', chan, { cfg: null }); json(res, 200, { ok: true });
  };
  // per-person app settings: apps pinned to the app bar
  api['POST /api/ap/me'] = async (req, res, me) => {
    const b = await body(req, 4096), all = ctx.coll('ap_user'), rec = (all[me.id] ||= {});
    if (b.pins !== undefined) rec.pins = (Array.isArray(b.pins) ? b.pins : []).map((k) => str(k, 40)).filter((k) => /^[a-z][a-z0-9_]{1,39}$/.test(k)).slice(0, 20);
    store.save(); emit('ap_user', rec, [me.id]); json(res, 200, { ok: true, user: rec });
  };

  // ---------- website tabs: can the page be shown inside LANChat? ----------
  const badIp = (ip) => {
    if (net.isIPv4(ip)) { const [a, b2] = ip.split('.').map(Number); return a === 0 || a === 127 || (a === 169 && b2 === 254) || a >= 224; }
    const x = ip.toLowerCase(); if (x.startsWith('::ffff:')) return badIp(x.slice(7));
    return x === '::1' || x === '::' || /^fe[89ab]/.test(x) || x.startsWith('ff');
  };
  // LAN pages are the point of a website tab, so private addresses are fine; the host's own loopback services are not
  const lookup = (host, o, cb) => { if (typeof o === 'function') { cb = o; o = {}; } dns.lookup(host, { all: true }, (e, list) => { if (e) return cb(e); const ok = list.filter((a) => !badIp(a.address)); if (!ok.length) return cb(Object.assign(new Error('blocked'), { code: 'EBLOCKED' })); if (o && o.all) cb(null, ok); else cb(null, ok[0].address, ok[0].family); }); };
  function probe(urlStr, hops = 0) {
    return new Promise((resolve) => {
      let u; try { u = new URL(urlStr); } catch { return resolve({ reach: false, why: 'bad' }); }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return resolve({ reach: false, why: 'bad' });
      const host = u.hostname.replace(/^\[|\]$/g, '');
      if ((net.isIP(host) && badIp(host)) || host === 'localhost' || host.endsWith('.localhost')) return resolve({ reach: false, why: 'blocked' });
      const lib = u.protocol === 'https:' ? https : http; let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const rq = lib.request(u, { method: 'GET', lookup, timeout: 4000, headers: { 'user-agent': 'Mozilla/5.0 (compatible; LANChat website tab check)', accept: 'text/html,*/*' } }, (res) => {
        const h = res.headers; res.destroy();
        if (res.statusCode >= 300 && res.statusCode < 400 && h.location && hops < 3) { let nx; try { nx = new URL(h.location, u).toString(); } catch { return fin({ reach: true, status: res.statusCode }); } return probe(nx, hops + 1).then(fin); }
        fin({ reach: true, status: res.statusCode, xfo: String(h['x-frame-options'] || '').slice(0, 100), csp: String(h['content-security-policy'] || '').slice(0, 4000) });
      });
      rq.on('timeout', () => rq.destroy(new Error('timeout'))); rq.on('error', (e) => fin({ reach: false, why: e.code === 'EBLOCKED' ? 'blocked' : 'unreachable' })); rq.end();
    });
  }
  api['GET /api/ap/web/check'] = async (req, res, me, url) => {
    if (!rate('apweb:' + me.id, 30, 60000)) fail(429, 'Slow down a little.');
    const target = A.url(url.searchParams.get('url')); if (!target || !/^https?:/.test(target)) fail(400, 'Enter a web address that starts with http:// or https://');
    const r = await probe(target);
    let frame = 'unknown', why = r.why || '';
    if (r.reach) {
      const xfo = (r.xfo || '').toLowerCase(), fa = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(r.csp || '');
      if (/deny|sameorigin|allow-from/.test(xfo)) { frame = 'no'; why = 'xfo'; }
      else if (fa) { const v = fa[1].trim().toLowerCase(); frame = /(^|\s)\*(\s|$)/.test(v) || /(^|\s)https?:(\s|$)/.test(v) ? 'yes' : 'no'; if (frame === 'no') why = 'csp'; }
      else frame = 'yes';
    }
    json(res, 200, { reach: !!r.reach, status: r.status || 0, frame, why });
  };

  // ---------- live components inside messages (m.live = { kind, data, v }) ----------
  const LIVE = ['checklist', 'tasks', 'table'];
  const item = (x, chan) => ({ id: rid(4), text: A.line(x && x.text, 500), done: !!(x && x.done), who: x && x.who && chan ? A.member(chan, x.who) : '', due: A.ts(x && x.due) });
  function cleanLive(p, chan) {
    if (!isObj(p) || !LIVE.includes(p.kind)) fail(400, 'Unknown live component');
    const d = isObj(p.data) ? p.data : {}, title = A.line(d.title, 200);
    if (p.kind === 'table') {
      const cols = (Array.isArray(d.cols) ? d.cols : []).slice(0, 12).map((c) => ({ id: rid(4), name: A.line(typeof c === 'string' ? c : c && c.name, 80) }));
      if (!cols.length) cols.push({ id: rid(4), name: '' }, { id: rid(4), name: '' });
      const rows = (Array.isArray(d.rows) ? d.rows : []).slice(0, 60).map((r) => { const cells = {}; cols.forEach((c, i) => { const v = Array.isArray(r) ? r[i] : null; if (typeof v === 'string' && v) cells[c.id] = A.text(v, 500); }); return { id: rid(4), c: cells }; });
      if (!rows.length) rows.push({ id: rid(4), c: {} }, { id: rid(4), c: {} });
      return { kind: 'table', data: { title, cols, rows }, v: 1, by: null };
    }
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 100).map((x) => item(x, chan)).filter((x) => x.text);
    return { kind: p.kind, data: { title, items }, v: 1 };
  }
  ctx.hooks.beforeMessage.push((m, p, me) => { if (p && p.live !== undefined && p.live !== null) { m.live = cleanLive(p.live, m.chan); m.live.by = me.id; m.live.ts = Date.now(); } });
  api['POST /api/ap/live'] = async (req, res, me) => {
    const b = await body(req, 16384), m = msgById.get(str(b.id, 32));
    if (!m || !canSee(me, m.chan)) fail(404, 'Message not found');
    if (m.deleted || !m.live) fail(400, 'This message has no live component.');
    const e = A.writeErr(me, m.chan); if (e) fail(403, e);
    if (!rate('aplive:' + me.id, 120, 60000)) fail(429, 'Slow down a little.');
    const L = m.live, d = L.data, op = str(b.op, 10), conflict = () => json(res, 409, { error: 'Someone else changed this first. Your view is up to date now.', live: L });
    const findItem = () => { const x = (d.items || []).find((y) => y.id === str(b.item, 12)); if (!x) fail(404, 'That item was removed.'); return x; };
    const findRow = () => { const x = (d.rows || []).find((y) => y.id === str(b.row, 12)); if (!x) fail(404, 'That row was removed.'); return x; };
    const findCol = () => { const x = (d.cols || []).find((y) => y.id === str(b.col, 12)); if (!x) fail(404, 'That column was removed.'); return x; };
    if (op === 'title') { if (b.base !== undefined && str(b.base, 200) !== d.title) return conflict(); d.title = A.line(b.text, 200); }
    else if (op === 'set' && L.kind !== 'table') { // whole list replace (reorder): only on the latest version
      if (Number(b.v) !== L.v) return conflict();
      const ids = (Array.isArray(b.order) ? b.order : []).map((x) => str(x, 12)), byId = new Map(d.items.map((x) => [x.id, x]));
      if (ids.length !== d.items.length || !ids.every((x) => byId.has(x))) fail(400, 'Bad order'); d.items = ids.map((x) => byId.get(x));
    } else if (L.kind !== 'table') {
      if (op === 'add') { if (d.items.length >= 100) fail(400, 'This list is full (100 items).'); const x = item(b, m.chan); if (!x.text) fail(400, 'Write something first.'); d.items.push(x); }
      else if (op === 'toggle') { const x = findItem(); x.done = !x.done; x.doneBy = x.done ? me.id : undefined; }
      else if (op === 'edit') { const x = findItem(); if (b.base !== undefined && str(b.base, 500) !== x.text) return conflict(); const t = A.line(b.text, 500); if (!t) fail(400, 'Write something first.'); x.text = t; }
      else if (op === 'del') { const x = findItem(); d.items = d.items.filter((y) => y !== x); }
      else if (op === 'assign' && L.kind === 'tasks') { const x = findItem(); x.who = b.who ? A.member(m.chan, b.who) : ''; }
      else if (op === 'due' && L.kind === 'tasks') { const x = findItem(); x.due = A.ts(b.due); }
      else fail(400, 'Bad operation');
    } else {
      if (op === 'cell') { const r = findRow(), c = findCol(), cur = r.c[c.id] || ''; if (b.base !== undefined && str(b.base, 500) !== cur) return conflict(); const t = A.text(b.text, 500); if (t) r.c[c.id] = t; else delete r.c[c.id]; }
      else if (op === 'addrow') { if (d.rows.length >= 60) fail(400, 'This table is full (60 rows).'); d.rows.push({ id: rid(4), c: {} }); }
      else if (op === 'delrow') { const r = findRow(); d.rows = d.rows.filter((y) => y !== r); }
      else if (op === 'addcol') { if (d.cols.length >= 12) fail(400, 'This table is full (12 columns).'); d.cols.push({ id: rid(4), name: A.line(b.text, 80) }); }
      else if (op === 'delcol') { const c = findCol(); if (d.cols.length <= 1) fail(400, 'A table needs one column.'); d.cols = d.cols.filter((y) => y !== c); for (const r of d.rows) delete r.c[c.id]; }
      else if (op === 'colname') { const c = findCol(); if (b.base !== undefined && str(b.base, 80) !== c.name) return conflict(); c.name = A.line(b.text, 80); }
      else fail(400, 'Bad operation');
    }
    L.v++; L.eby = me.id; L.ets = Date.now(); store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true, live: L });
  };
  // a deleted message keeps nothing of its live component or card; cards and live components are not edited as text
  const origDelete = api['POST /api/delete'];
  api['POST /api/delete'] = async (req, res, me, url) => {
    const b = await body(req, 256); await origDelete(req, res, me, url);
    const m = msgById.get(str(b.id, 32)); if (m && m.deleted && (m.live || m.apCard)) { delete m.live; delete m.apCard; store.save(); }
  };
  const origEdit = api['POST /api/edit'];
  api['POST /api/edit'] = async (req, res, me, url) => {
    const b = await body(req, 65536), m = msgById.get(str(b.id, 32));
    if (m && canSee(me, m.chan) && (m.apCard || m.live)) fail(400, "This card can't be edited as text.");
    return origEdit(req, res, me, url);
  };
};
