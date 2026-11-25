'use strict';
// Chat experience (chatux area, docs/features-chatux.md): thread follows and "new replies", marking chats/messages unread,
// pinned list, group chat pictures, new chats from the To: box, deleting 1:1 chats for me, My GIFs, extra message fields
// (subject, priority, announcement, location, sticker, praise, meme/GIF markers), file-content search, find in chat, prefs.
const fs = require('fs');
const path = require('path');

module.exports = (ctx) => {
  const { api, db, S, store, P, json, body, fail, rid, str, isObj, userById, isAdmin, canSee, validChan, audience, chanMsgs, lastSeq, msgById, emit, msgOut, sysMsg, chanOut, hooks, coll, dmParts, fileCanRead, gcFiles, rate } = ctx;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const msgOk = (u, m) => ctx.canSeeMsg(u, m);
  const mustSee = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  const getMsg = (me, id) => { const m = msgById.get(str(id, 32)); if (!m || !canSee(me, m.chan) || !msgOk(me, m)) fail(404, 'Message not found'); return m; };
  const limit = (key, max, ms) => { if (!rate(key, max, ms)) fail(429, 'Too many requests. Wait a moment.'); };
  const notMuted = (me) => { if (me.mutedUntil > Date.now()) fail(403, 'An admin has muted you for now.'); };
  // per-person maps in a collection: coll(name)[uid] = {...}
  const userMap = (name, uid) => { const all = coll(name); if (!own(all, uid) || !isObj(all[uid])) all[uid] = {}; return all[uid]; };
  const peek = (name, uid) => (db[name] && own(db[name], uid) && isObj(db[name][uid]) ? db[name][uid] : {});
  const trim = (o, max) => { const k = Object.keys(o); if (k.length > max) for (const x of k.slice(0, k.length - max)) delete o[x]; };
  const isGroupChat = (c) => !!c && !!c.members && !c.team && (!c.kind || c.kind === 'group');
  const startOf = (u, chan) => (db.cxStart && own(db.cxStart, chan) && own(db.cxStart[chan], u.id) ? db.cxStart[chan][u.id] : 0);

  // ---------- follow / unfollow threads (u.follows, u.unfollows — shared contract, docs/EXTENDING.md) ----------
  const MAX_FOLLOWS = 500;
  function setFollow(u, rootId, on, manual) {
    if (!isObj(u.follows)) u.follows = {}; if (!isObj(u.unfollows)) u.unfollows = {};
    if (on) {
      if (manual) delete u.unfollows[rootId];
      if (u.follows[rootId]) return false;
      u.follows[rootId] = 1; trim(u.follows, MAX_FOLLOWS); return true;
    }
    const had = !!u.follows[rootId]; delete u.follows[rootId];
    if (manual) { u.unfollows[rootId] = 1; trim(u.unfollows, MAX_FOLLOWS); }
    return had || manual;
  }
  const markSeen = (uid, root) => { const m = userMap('cxThreadSeen', uid); delete m[root.id]; m[root.id] = root.threadCount || 0; trim(m, 400); return m[root.id]; };
  // people who post in a thread or are mentioned in it follow it automatically (unless they turned notifications off for it)
  hooks.afterMessage.push((m) => {
    if (m.thread && m.from && !m.system) {
      const root = msgById.get(m.thread); if (!root || root.deleted) return;
      const ids = new Set([root.from, m.from, ...(root.mentions || []), ...(m.mentions || [])].filter(Boolean));
      for (const id of ids) {
        const u = userById(id); if (!u || u.removed || u.deleted || (isObj(u.unfollows) && u.unfollows[root.id])) continue;
        if (!canSee(u, root.chan) || !msgOk(u, root)) continue;
        if (setFollow(u, root.id, true, false)) emit('cxfollow', { id: root.id, on: true, n: root.threadCount || 0, chan: root.chan }, [u.id]);
      }
      const n = markSeen(m.from, root); emit('cxthread', { id: root.id, n }, [m.from]); // you have seen the thread you just replied to
      store.save();
    }
    // a 1:1 chat you deleted comes back when a new message arrives
    if (m.chan.startsWith('dm:') && db.cxHidden) for (const uid of new Set(dmParts(m.chan).slice(1))) {
      const h = peek('cxHidden', uid); if (own(h, m.chan)) { delete h[m.chan]; emit('cxhidden', { chan: m.chan, on: false }, [uid]); store.save(); }
    }
  });
  api['POST /api/chatux/follow'] = async (req, res, me) => {
    const b = await body(req, 256), root = getMsg(me, b.id); limit('cxfollow:' + me.id, 60, 60000);
    if (root.thread || root.system || root.deleted) fail(400, "You can't follow that message.");
    const on = !!b.on; setFollow(me, root.id, on, true); store.save(); emit('cxfollow', { id: root.id, on, n: root.threadCount || 0, chan: root.chan }, [me.id]); json(res, 200, { ok: true, on });
  };
  api['POST /api/chatux/thread/seen'] = async (req, res, me) => {
    const b = await body(req, 256), root = getMsg(me, b.id); if (root.thread) fail(400, 'That is not a thread.');
    const n = markSeen(me.id, root); store.save(); emit('cxthread', { id: root.id, n }, [me.id]); json(res, 200, { ok: true, n });
  };
  api['GET /api/chatux/followed'] = async (req, res, me) => {
    const seen = peek('cxThreadSeen', me.id), byThread = new Map(), out = [];
    const repliesOf = (root) => { // one pass per chat, grouped by thread
      if (!byThread.has(root.chan)) { const g = new Map(); for (const x of chanMsgs(root.chan)) if (x.thread) (g.get(x.thread) || g.set(x.thread, []).get(x.thread)).push(x); byThread.set(root.chan, g); }
      return byThread.get(root.chan).get(root.id) || [];
    };
    for (const id of Object.keys(isObj(me.follows) ? me.follows : {})) {
      const root = msgById.get(id); if (!root || root.deleted || !canSee(me, root.chan) || !msgOk(me, root)) continue;
      const all = repliesOf(root), replies = all.filter((x) => !x.deleted && msgOk(me, x)); if (!replies.length) continue;
      const fresh = all.slice(own(seen, id) ? seen[id] : 0).filter((x) => !x.deleted && x.from !== me.id && msgOk(me, x)).length;
      const last = replies[replies.length - 1];
      out.push({ root: msgOut(root), count: replies.length, fresh, last: last.ts, lastText: String(last.text || (last.files && last.files.length ? last.files[0].name : '')).slice(0, 140), lastFrom: last.from, users: [...new Set(replies.map((x) => x.from))].slice(-4) });
    }
    out.sort((a, b) => b.last - a.last);
    json(res, 200, { threads: out.slice(0, 100) });
  };

  // ---------- unread: whole chats ("Mark as unread") and "Mark unread from here" ----------
  function countUnread(u, chan) {
    const base = u.read[chan] ?? u.baseSeq, arr = chanMsgs(chan); let unread = 0, mentions = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i].seq > base; i--) { const m = arr[i]; if (m.deleted || !m.from || m.from === u.id || !msgOk(u, m)) continue; unread++; if (m.everyone || (m.mentions && m.mentions.includes(u.id))) mentions++; }
    return { unread, mentions };
  }
  api['POST /api/chatux/unread'] = async (req, res, me) => {
    const b = await body(req, 256), chan = str(b.chan, 64); mustSee(me, chan); limit('cxunread:' + me.id, 60, 60000);
    if (b.msg) {
      const m = getMsg(me, b.msg); if (m.chan !== chan) fail(400, 'That message is in another chat.');
      me.read[chan] = Math.max(0, m.seq - 1); const counts = countUnread(me, chan); store.save();
      emit('cxreadset', { chan, seq: me.read[chan], ...counts }, [me.id]); return json(res, 200, { ok: true, seq: me.read[chan], ...counts });
    }
    const flags = userMap('cxUnread', me.id), on = b.on !== false;
    if (on) flags[chan] = Date.now(); else delete flags[chan];
    store.save(); emit('cxunread', { chan, on }, [me.id]); json(res, 200, { ok: true, on });
  };

  // ---------- pinned messages of a chat (newest pin first) ----------
  api['GET /api/chatux/pins'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan') || ''; mustSee(me, chan);
    const pins = chanMsgs(chan).filter((m) => m.pinned && !m.deleted && msgOk(me, m)).sort((a, b) => (b.pinned.ts || 0) - (a.pinned.ts || 0)).slice(0, 50).map(msgOut);
    json(res, 200, { pins });
  };

  // ---------- group chat pictures (small images kept in the database, served to members only) ----------
  const magicOk = (type, buf) => (type === 'image/png' ? buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG' : type === 'image/jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff : buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP');
  api['POST /api/chatux/chat/picture'] = async (req, res, me) => {
    const b = await body(req, 140000), chan = str(b.chan, 64); mustSee(me, chan); notMuted(me);
    const c = own(db.channels, chan) ? db.channels[chan] : null; if (!isGroupChat(c) || !c.members.includes(me.id)) fail(400, 'Only group chats have a picture.');
    limit('cxpic:' + me.id, 10, 60000);
    const pics = coll('cxPics');
    if (!b.data) { if (!own(pics, chan)) return json(res, 200, { ok: true }); delete pics[chan]; }
    else {
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(str(b.data, 130000)); if (!m) fail(400, 'Use a PNG, JPEG or WebP picture.');
      const buf = Buffer.from(m[2], 'base64'); if (buf.length < 40) fail(400, 'That picture is empty.'); if (buf.length > 96000) fail(400, 'That picture is too large (96 KB max).');
      if (!magicOk(m[1], buf)) fail(400, "That file isn't a picture.");
      pics[chan] = { type: m[1], b64: buf.toString('base64'), v: Date.now(), by: me.id };
    }
    store.save(); emit('channel', chanOut(c), audience(c.id));
    sysMsg(chan, b.data ? `${me.name} changed the group picture` : `${me.name} removed the group picture`, { kind: 'picture', actor: me.id });
    json(res, 200, { ok: true, channel: chanOut(c) });
  };
  api['GET /api/chatux/chat/picture'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan') || '', p = canSee(me, chan) && db.cxPics && own(db.cxPics, chan) ? db.cxPics[chan] : null;
    if (!p) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const buf = Buffer.from(p.b64, 'base64');
    res.writeHead(200, { 'Content-Type': p.type, 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.end(buf);
  };
  hooks.chanFields.push((c) => { const o = {}; if (db.cxPics && own(db.cxPics, c.id)) o.chatPic = db.cxPics[c.id].v; if (c.autoName) o.autoName = true; return o; });

  // ---------- new chat from the To: box: 1 person = their 1:1 chat, nobody = notes to self, 2+ = a new group chat ----------
  api['POST /api/chatux/chat/new'] = async (req, res, me) => {
    const b = await body(req, 8192); notMuted(me);
    const ids = [...new Set((Array.isArray(b.members) ? b.members : []).filter((i) => typeof i === 'string' && i !== me.id))].slice(0, 100);
    for (const i of ids) { const u = userById(i); if (!u || u.removed || u.deleted) fail(400, 'Someone in that list is no longer in this session.'); }
    if (ids.length <= 1) {
      const chan = 'dm:' + [me.id, ids[0] || me.id].sort().join(':'), h = peek('cxHidden', me.id);
      if (own(h, chan)) { delete h[chan]; store.save(); emit('cxhidden', { chan, on: false }, [me.id]); }
      return json(res, 200, { chan });
    }
    if (!S.membersCanCreateGroups && !isAdmin(me)) fail(403, 'Only admins can create group chats here.');
    limit('cxnew:' + me.id, 20, 60000);
    const label = str(b.name, 60).replace(/\s+/g, ' ').trim().slice(0, 30), members = [me.id, ...ids];
    const g = { id: 'g-' + rid(5), name: label || ctx.groupAutoName(members), topic: '', created: Date.now(), by: me.id, members, kind: 'group' };
    if (!label) g.autoName = true;
    db.channels[g.id] = g; store.save(); emit('channel', chanOut(g), members);
    sysMsg(g.id, `${me.name} created the chat`, { kind: 'create', actor: me.id }); ctx.groupAddedActivity(me, g, members);
    json(res, 200, { chan: g.id, channel: chanOut(g) });
  };

  // ---------- delete a 1:1 chat for me: hidden from my list (with its history) until a new message arrives ----------
  api['POST /api/chatux/chat/hide'] = async (req, res, me) => {
    const b = await body(req, 256), chan = str(b.chan, 64); mustSee(me, chan); limit('cxhide:' + me.id, 30, 60000);
    if (!chan.startsWith('dm:')) fail(400, 'Group chats are left, not deleted.');
    const hidden = userMap('cxHidden', me.id), on = b.on !== false;
    if (on) {
      hidden[chan] = Date.now(); ctx.setHistoryStart(chan, me.id, db.seq + 1); me.read[chan] = lastSeq(chan);
      const flags = peek('cxUnread', me.id); delete flags[chan];
      const pr = me.prefs; let touched = false;
      for (const k of ['pinnedChats', 'archived']) if (Array.isArray(pr[k]) && pr[k].includes(chan)) { pr[k] = pr[k].filter((x) => x !== chan); touched = true; }
      if (Array.isArray(pr.chatSections)) for (const s of pr.chatSections) if (Array.isArray(s.chats) && s.chats.includes(chan)) { s.chats = s.chats.filter((x) => x !== chan); touched = true; }
      if (touched) emit('me', ctx.meOut(me), [me.id]);
    } else delete hidden[chan];
    store.save(); emit('cxhidden', { chan, on, ts: hidden[chan] || 0 }, [me.id]); emit('readstate', { chan, seq: me.read[chan] || 0 }, [me.id]);
    json(res, 200, { ok: true });
  };

  // ---------- My GIFs: pictures/GIFs a person keeps to reuse (copied so they stay when the original message goes) ----------
  const IMGX = /\.(gif|png|jpe?g|webp)$/i, MAX_GIFS = 60;
  const gifIdx = { at: 0, ref: null, set: new Set() };
  const gifSet = () => {
    if (Date.now() - gifIdx.at > 2000 || gifIdx.ref !== db.cxGifs) {
      const set = new Set(); for (const [uid, list] of Object.entries(db.cxGifs || {})) { const u = userById(uid); if (u && !u.deleted && Array.isArray(list)) for (const g of list) set.add(g.id); }
      gifIdx.set = set; gifIdx.at = Date.now(); gifIdx.ref = db.cxGifs;
    }
    return gifIdx.set;
  };
  hooks.keepFile.push((id) => gifSet().has(id));
  const myGifs = (uid) => { const all = coll('cxGifs'); if (!own(all, uid) || !Array.isArray(all[uid])) all[uid] = []; return all[uid]; };
  const gifOut = (g) => ({ id: g.id, name: g.name, size: g.size, ts: g.ts });
  const gifsOf = (uid) => myGifs(uid).filter((g) => own(db.files, g.id)).map(gifOut);
  api['GET /api/chatux/gifs'] = async (req, res, me) => json(res, 200, { gifs: gifsOf(me.id) });
  api['POST /api/chatux/gifs/save'] = async (req, res, me) => {
    const b = await body(req, 256), id = str(b.file, 24), rec = own(db.files, id) ? db.files[id] : null;
    if (!rec || !fileCanRead(me, id)) fail(404, 'That picture is no longer available.');
    if (!IMGX.test(rec.name) || rec.size > 8 * 1048576) fail(400, 'Only pictures and GIFs under 8 MB can be saved.');
    const list = myGifs(me.id), dup = list.find((g) => g.id === id || g.src === id);
    if (dup && own(db.files, dup.id)) return json(res, 200, { ok: true, gif: gifOut(dup), existed: true });
    if (dup) list.splice(list.indexOf(dup), 1);
    if (list.length >= MAX_GIFS) fail(400, `You can keep up to ${MAX_GIFS} GIFs. Remove some first.`);
    limit('cxgif:' + me.id, 30, 60000);
    let g;
    if (rec.by === me.id) g = { id, name: rec.name, size: rec.size, ts: Date.now() };
    else {
      const nid = rid(12);
      try { await fs.promises.copyFile(path.join(P.uploads, id), path.join(P.uploads, nid)); } catch { fail(500, "Couldn't save that picture."); }
      db.files[nid] = { id: nid, name: rec.name, size: rec.size, by: me.id, ts: Date.now() };
      g = { id: nid, name: rec.name, size: rec.size, ts: Date.now(), src: id };
    }
    list.push(g); gifIdx.at = 0; store.save(); emit('cxgifs', { gifs: gifsOf(me.id) }, [me.id]); json(res, 200, { ok: true, gif: gifOut(g) });
  };
  api['POST /api/chatux/gifs/remove'] = async (req, res, me) => {
    const b = await body(req, 256), id = str(b.id, 24), list = myGifs(me.id), i = list.findIndex((g) => g.id === id);
    if (i < 0) fail(404, 'Not in your GIFs.');
    list.splice(i, 1); gifIdx.at = 0; gcFiles([id]); store.save(); emit('cxgifs', { gifs: gifsOf(me.id) }, [me.id]); json(res, 200, { ok: true });
  };

  // ---------- message fields: subject, priority, announcement, location, sticker, praise, meme / GIF markers ----------
  const BANNERS = ['brand', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
  const BADGES = ['kind', 'team', 'problem', 'leader', 'creative', 'coach', 'inclusive', 'achiever', 'courage', 'thanks', 'helper', 'star'];
  const IMG = /\.(png|jpe?g|gif|webp)$/i;
  hooks.beforeMessage.push((m, p, me) => {
    const rules = isObj(S.messagingRules) ? S.messagingRules : {}, top = !p.thread;
    if (isObj(p.announce) && top) {
      const a = p.announce, title = str(a.title, 120).replace(/\s+/g, ' ').trim(); if (!title) fail(400, 'An announcement needs a headline.');
      m.announce = { title, color: BANNERS.includes(a.color) ? a.color : 'brand' }; const sub = str(a.sub, 200).replace(/\s+/g, ' ').trim(); if (sub) m.announce.sub = sub;
      const img = str(a.image, 24); if (img) { const f = (m.files || []).find((x) => x.id === img); if (!f || !IMG.test(f.name)) fail(400, 'Attach the banner picture to the announcement.'); m.announce.image = img; }
    }
    if (isObj(p.location)) {
      const lat = Number(p.location.lat), lon = Number(p.location.lon), acc = Number(p.location.acc);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) fail(400, 'That location is not valid.');
      m.location = { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 }; if (Number.isFinite(acc) && acc >= 0) m.location.acc = Math.min(Math.round(acc), 1e6);
    }
    if (isObj(p.sticker)) {
      if (rules.stickers === false) fail(403, 'Stickers are turned off in this session.');
      const pk = str(p.sticker.p, 24), id = str(p.sticker.s, 32); if (!/^[a-z0-9-]{1,24}$/.test(pk) || !/^[a-z0-9-]{1,32}$/.test(id)) fail(400, 'Unknown sticker.');
      m.sticker = { p: pk, s: id }; const cap = str(p.sticker.c, 80).replace(/\s+/g, ' ').trim(); if (cap) m.sticker.c = cap;
    }
    if (isObj(p.praise)) {
      const pr = p.praise, badge = str(pr.b, 24); if (!BADGES.includes(badge)) fail(400, 'Unknown badge.');
      const to = [...new Set((Array.isArray(pr.to) ? pr.to : []).filter((i) => typeof i === 'string'))].slice(0, 20).filter((i) => { const u = userById(i); return u && !u.removed && !u.deleted && canSee(u, m.chan); });
      if (!to.length) fail(400, 'Pick who you want to praise.');
      m.praise = { b: badge, to }; const note = str(pr.note, 500).trim(); if (note) m.praise.note = note;
    }
    if (p.meme) { if (rules.memes === false) fail(403, 'Memes are turned off in this session.'); if (!(m.files || []).some((f) => IMG.test(f.name))) fail(400, 'A meme needs a picture.'); m.meme = 1; }
    if (p.gif) { if (rules.gifs === false) fail(403, 'GIFs are turned off in this session.'); if (!(m.files || []).some((f) => IMG.test(f.name))) fail(400, 'Pick a GIF to send.'); m.gif = 1; }
    // a subject and a priority only decorate a message that has something in it
    const content = (m.text || '').trim() || (m.files || []).length || m.poll || m.game || m.announce || m.location || m.sticker || m.praise;
    if (content && top && p.subject !== undefined) { const s = str(p.subject, 200).replace(/\s+/g, ' ').trim(); if (s) m.subject = s; }
    if (content && (p.priority === 'important' || p.priority === 'urgent')) m.priority = p.priority;
  });

  // ---------- search inside text files people can see (cached, ~1 MB each) ----------
  const TEXTX = /\.(txt|text|md|markdown|csv|tsv|json|jsonl|log|js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cc|cs|php|pl|lua|r|sh|bash|zsh|ps1|bat|cmd|sql|html?|css|scss|less|xml|svg|ya?ml|ini|cfg|conf|toml|properties|env|tex|rst|srt|vtt|ics|vcf)$/i;
  const textCache = new Map(); let cacheChars = 0; const CACHE_MAX = 24e6, TEXT_MAX = 1048576;
  async function fileText(id) {
    if (textCache.has(id)) { const v = textCache.get(id); textCache.delete(id); textCache.set(id, v); return v; }
    let t = '';
    try {
      const fh = await fs.promises.open(path.join(P.uploads, id), 'r');
      try { const buf = Buffer.alloc(TEXT_MAX), { bytesRead } = await fh.read(buf, 0, TEXT_MAX, 0), b = buf.subarray(0, bytesRead); if (!b.subarray(0, 8000).includes(0)) t = b.toString('utf8').replace(/^﻿/, ''); }
      finally { await fh.close(); }
    } catch {}
    const v = { t, l: t.toLowerCase() }; textCache.set(id, v); cacheChars += t.length * 2;
    while (cacheChars > CACHE_MAX && textCache.size > 1) { const [k, old] = textCache.entries().next().value; textCache.delete(k); cacheChars -= old.t.length * 2; }
    return v;
  }
  const snippetAt = (t, at, len) => { const a = Math.max(0, at - 50), z = Math.min(t.length, at + len + 70); return ((a ? '…' : '') + t.slice(a, z) + (z < t.length ? '…' : '')).replace(/\s+/g, ' ').trim(); };
  api['GET /api/chatux/search/files'] = async (req, res, me, url) => {
    const qp = url.searchParams, q = (qp.get('q') || '').trim().toLowerCase().slice(0, 100), only = qp.get('chan') || '', from = qp.get('from') || '';
    limit('cxfs:' + me.id, 40, 10000);
    const vis = new Map(), see = (c) => { if (!vis.has(c)) vis.set(c, canSee(me, c)); return vis.get(c); };
    const out = [], done = new Set(), t0 = Date.now(); let reads = 0;
    for (let i = db.messages.length - 1; i >= 0 && out.length < 60; i--) {
      const m = db.messages[i]; if (m.deleted || !m.files || !m.files.length || (only && m.chan !== only) || (from && m.from !== from) || !see(m.chan) || !msgOk(me, m)) continue;
      for (const f of m.files) {
        if (done.has(f.id) || !own(db.files, f.id)) continue; done.add(f.id);
        let hit = !q, snippet = '';
        if (q && f.name.toLowerCase().includes(q)) hit = true;
        else if (q && TEXTX.test(f.name) && (db.files[f.id].size || 0) <= TEXT_MAX && (textCache.has(f.id) || (reads < 300 && Date.now() - t0 < 2500))) {
          if (!textCache.has(f.id)) reads++;
          const v = await fileText(f.id), at = v.l.indexOf(q); if (at >= 0) { hit = true; snippet = snippetAt(v.t, at, q.length); }
        }
        if (hit) out.push({ id: f.id, name: f.name, size: f.size, chan: m.chan, msg: m.id, from: m.from, ts: m.ts, snippet: snippet || undefined, match: snippet ? 'content' : q ? 'name' : undefined });
        if (out.length >= 60) break;
      }
    }
    json(res, 200, { files: out });
  };

  // ---------- find in this chat (Ctrl+F): every matching message id, newest first ----------
  api['GET /api/chatux/find'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan') || ''; mustSee(me, chan); limit('cxfind:' + me.id, 60, 10000);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100); if (!q) return json(res, 200, { hits: [] });
    const arr = chanMsgs(chan), out = [];
    for (let i = arr.length - 1; i >= 0 && out.length < 500; i--) {
      const m = arr[i]; if (m.deleted || m.system || !msgOk(me, m)) continue;
      const hay = [m.text, m.subject, m.poll && m.poll.q, m.announce && m.announce.title, m.announce && m.announce.sub, m.sticker && m.sticker.c, m.praise && m.praise.note, ...(m.files || []).map((f) => f.name)].filter(Boolean).join('\n').toLowerCase();
      if (hay.includes(q)) out.push({ id: m.id, seq: m.seq, ts: m.ts, thread: m.thread || undefined });
    }
    json(res, 200, { hits: out });
  };

  // ---------- per-person settings kept in prefs (the core /api/prefs only knows its own keys) ----------
  const origPrefs = api['POST /api/prefs'];
  api['POST /api/prefs'] = async (req, res, me, url) => {
    const b = await body(req, 65536);
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (k === 'chatSections') me.prefs.chatSections = cleanSections(me, v);
      else if (k === 'skinTone') { const n = Math.round(Number(v)); me.prefs.skinTone = n >= 0 && n <= 5 ? n : 0; }
      else if (k === 'emojiShortcuts' || k === 'hidePreviews') me.prefs[k] = !!v;
      else if (k === 'sendKey') me.prefs.sendKey = v === 'ctrl' ? 'ctrl' : 'enter';
      else if (k === 'cannedReplies') me.prefs.cannedReplies = (Array.isArray(v) ? v : []).map((x) => str(x, 1000).trim()).filter(Boolean).slice(0, 30);
      else if (k === 'recentSearches') me.prefs.recentSearches = [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, 100).replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 10);
    }
    return origPrefs(req, res, me, url);
  };
  function cleanSections(me, v) {
    if (!Array.isArray(v)) fail(400, 'Bad sections');
    const used = new Set(), out = [];
    for (const s of v.slice(0, 20)) {
      if (!isObj(s)) continue;
      const chats = [];
      for (const c of Array.isArray(s.chats) ? s.chats : []) if (typeof c === 'string' && c.length <= 64 && !used.has(c) && chats.length < 100 && validChan(c) && canSee(me, c)) { used.add(c); chats.push(c); }
      out.push({ id: typeof s.id === 'string' && /^[a-z0-9]{4,16}$/.test(s.id) ? s.id : rid(4), name: str(s.name, 40).replace(/\s+/g, ' ').trim() || 'Section', chats, ...(s.closed ? { closed: true } : {}) });
    }
    return out;
  }

  // ---------- what a client gets when it connects ----------
  const brief = (m) => {
    const o = { id: m.id, from: m.from || null, ts: m.ts, text: m.deleted ? '' : String(m.text || '').slice(0, 140), system: m.system ? String(m.system).slice(0, 140) : undefined, kind: m.kind, deleted: m.deleted ? true : undefined };
    if (!m.deleted) {
      if (m.files && m.files.length) o.file = String(m.files[0].name).slice(0, 80); if (m.poll) o.poll = String(m.poll.q).slice(0, 100); if (m.game) o.game = true;
      if (m.subject) o.subject = m.subject.slice(0, 100); if (m.sticker) o.sticker = m.sticker.c || 1; if (m.praise) o.praise = m.praise.b; if (m.announce) o.announce = m.announce.title.slice(0, 100);
      if (m.location) o.location = 1; if (m.priority) o.priority = m.priority; if (m.gif) o.gif = 1; if (m.meme) o.meme = 1;
    }
    return o;
  };
  ctx.cxBrief = brief;
  hooks.initExtra.push((u) => {
    const last = {}, chans = [...Object.values(db.channels).filter((c) => canSee(u, c.id)).map((c) => c.id), ...ctx.dmChansOf(u)];
    for (const chan of chans) { const arr = chanMsgs(chan), st = startOf(u, chan); for (let i = arr.length - 1; i >= 0; i--) { const m = arr[i]; if (st && m.seq < st) break; if (m.thread || !msgOk(u, m)) continue; last[chan] = brief(m); break; } }
    const follows = Object.keys(isObj(u.follows) ? u.follows : {}), seen = peek('cxThreadSeen', u.id), threads = {};
    for (const id of follows) { const r = msgById.get(id); if (r && !r.deleted && r.threadCount && canSee(u, r.chan) && msgOk(u, r)) threads[id] = { n: r.threadCount, chan: r.chan }; }
    return { last, cx: { unread: peek('cxUnread', u.id), hidden: peek('cxHidden', u.id), follows, unfollows: Object.keys(isObj(u.unfollows) ? u.unfollows : {}), seen, threads } };
  });
};
