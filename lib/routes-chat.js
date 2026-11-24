'use strict';
// Channels, groups, messages and everything that lives on a message.
const fs = require('fs');
const path = require('path');
const { fetchPreview } = require('./linkpreview');

module.exports = (ctx) => {
  const { api, db, S, store, P, json, body, fail, rid, str, rate, isObj, BAD_KEYS, userById, isAdmin, isOwner, canSee, validChan, audience, dmPeer, chanMsgs, lastSeq, msgById, byChan, emit, msgOut, addMessage, sysMsg, removeMessages, gcFiles, chanOut } = ctx;
  const MAX_TEXT = 8000, MUTED_FOREVER = Number.MAX_SAFE_INTEGER;
  const lastPost = new Map(), lastTyping = new Map();
  const IMG = /\.(png|jpe?g|gif|webp)$/i;
  const mustSee = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  const getMsg = (me, id) => { const m = msgById.get(str(id, 32)); if (!m) fail(404, 'Message not found'); mustSee(me, m.chan); return m; };
  const chanName = (c) => (c.startsWith('dm:') ? 'a direct message' : '#' + db.channels[c].name);

  function checkNotMuted(me) { if (me.mutedUntil > Date.now()) fail(403, me.mutedUntil >= MUTED_FOREVER ? 'You are muted by an admin.' : 'You are muted until ' + new Date(me.mutedUntil).toLocaleString()); }
  function canPost(me, chan) {
    mustSee(me, chan); checkNotMuted(me);
    if (chan.startsWith('dm:')) { if (userById(dmPeer(chan, me)).removed) fail(403, 'That person is no longer in this session.'); return; }
    const c = db.channels[chan];
    if (c.readonly && !isAdmin(me)) fail(403, 'Only admins can post in this channel.');
    if (c.slow && !isAdmin(me)) { const wait = c.slow * 1000 - (Date.now() - (lastPost.get(me.id + ':' + chan) || 0)); if (wait > 0) fail(429, `Slow mode is on. Wait ${Math.ceil(wait / 1000)}s.`); }
  }
  const defaultTtl = (chan) => (chan.startsWith('dm:') ? db.dmTtl[chan] : db.channels[chan]?.ttl) || S.defaultTtl || 0;

  // ----- mentions / previews -----
  function parseMentions(text, me, chan) {
    const out = new Set(); let everyone = false;
    if (!text || !text.includes('@')) return { mentions: [], everyone };
    if (/(^|\s)@(everyone|here)(?![\p{L}\p{N}_])/iu.test(text) && (isAdmin(me) || S.membersCanEveryone)) everyone = true;
    const lower = text.toLowerCase(), users = Object.values(db.users).filter((u) => !u.removed && u.id !== me.id).sort((a, b) => b.name.length - a.name.length);
    for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
      if (i > 0 && /[\p{L}\p{N}_@]/u.test(lower[i - 1])) continue;
      const rest = lower.slice(i + 1);
      for (const u of users) { const n = u.name.toLowerCase(); if (rest.startsWith(n) && !/[\p{L}\p{N}_]/u.test(rest[n.length] || ' ')) { if (canSee(u, chan)) out.add(u.id); break; } }
    }
    return { mentions: [...out], everyone };
  }
  function attachPreview(m) {
    if (!S.linkPreviews || !m.text) return;
    const u = /https?:\/\/[^\s<>"']+/i.exec(m.text); if (!u) return;
    const url = u[0].replace(/[.,;:!?)\]]+$/, '');
    if (m.preview && m.preview.url === url) return;
    fetchPreview(url).then((p) => { if (p && msgById.has(m.id) && !m.deleted) { m.preview = p; store.save(); emit('update', msgOut(m), audience(m.chan)); } }).catch(() => {});
  }

  // ----- creating messages (used by /send, the scheduler and forwarding) -----
  function normFiles(me, list, own = true) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 10).map((f) => { const rec = isObj(f) ? db.files[str(f.id, 24)] : null; if (!rec || (own && rec.by !== me.id)) fail(400, 'A file in this message is no longer available.'); return { id: rec.id, name: rec.name, size: rec.size }; });
  }
  function normPoll(p) {
    if (!isObj(p)) fail(400, 'Bad poll');
    const q = str(p.q, 200).trim(), opts = Array.isArray(p.options) ? p.options.map((o) => str(o, 100).trim()).filter(Boolean).slice(0, 10) : [];
    if (!q || opts.length < 2) fail(400, 'A poll needs a question and at least two options.');
    const quiz = Number.isInteger(p.correct) && p.correct >= 0 && p.correct < opts.length;
    return { q, options: opts.map((t) => ({ t, v: [] })), multi: !quiz && !!p.multi, quiz, correct: quiz ? p.correct : undefined, closed: false };
  }
  function createMessage(me, p) {
    const chan = str(p.chan, 64); canPost(me, chan);
    const text = str(p.text, MAX_TEXT), files = normFiles(me, p.files, !p.foreignFiles), m = { chan, from: me.id, text };
    if (files.length) m.files = files;
    if (p.poll) m.poll = normPoll(p.poll);
    else if (p.game) { if (!isObj(p.game) || p.game.type !== 'ttt') fail(400, 'Unknown game'); m.game = { type: 'ttt', x: me.id, o: null, board: Array(9).fill(''), turn: 'x', winner: null }; }
    if (!text.trim() && !files.length && !m.poll && !m.game && !p.fwd) fail(400, 'Empty message');
    if (p.fwd) m.fwd = p.fwd;
    if (p.thread) { const root = msgById.get(str(p.thread, 32)); if (!root || root.chan !== chan || root.thread || root.deleted) fail(400, 'That thread is not available.'); m.thread = root.id; }
    if (p.replyTo) { const r = msgById.get(str(p.replyTo, 32)); if (r && r.chan === chan && !r.deleted) m.reply = { id: r.id, from: r.from, text: (r.text || r.poll?.q || (r.files?.length ? '📎 ' + r.files[0].name : '')).slice(0, 140) }; }
    const { mentions, everyone } = parseMentions(text, me, chan);
    if (mentions.length) m.mentions = mentions; if (everyone) m.everyone = true;
    const ttl = Number.isInteger(p.ttl) && p.ttl >= 5 && p.ttl <= 31536000 ? p.ttl : p.ttl === 0 ? 0 : defaultTtl(chan);
    if (ttl) m.expiresAt = Date.now() + ttl * 1000;
    lastPost.set(me.id + ':' + chan, Date.now());
    addMessage(m); attachPreview(m); return m;
  }

  api['POST /api/send'] = async (req, res, me) => {
    const b = await body(req, 65536), chan = str(b.chan, 64);
    mustSee(me, chan);
    if (!isAdmin(me) && !rate('msg:' + me.id, 30, 10000)) fail(429, 'You are sending too fast.');
    if (Number(b.sendAt) > Date.now() + 5000) {
      canPost(me, chan);
      if (Number(b.sendAt) > Date.now() + 366 * 86400000) fail(400, 'Pick a time within a year.');
      if (db.scheduled.filter((s) => s.from === me.id).length >= 50) fail(400, 'You have too many scheduled messages.');
      const text = str(b.text, MAX_TEXT), files = normFiles(me, b.files);
      if (!text.trim() && !files.length) fail(400, 'Empty message');
      const s = { id: rid(8), from: me.id, chan, sendAt: Math.round(Number(b.sendAt)), text, files, replyTo: str(b.replyTo, 32), thread: str(b.thread, 32), ttl: Number.isInteger(b.ttl) ? b.ttl : undefined };
      db.scheduled.push(s); store.save(); return json(res, 200, { ok: true, scheduled: s });
    }
    const m = createMessage(me, { chan, text: b.text, files: b.files, replyTo: b.replyTo, thread: b.thread, ttl: b.ttl, poll: b.poll, game: b.game });
    json(res, 200, { ok: true, id: m.id, seq: m.seq });
  };

  api['GET /api/scheduled'] = async (req, res, me) => json(res, 200, { scheduled: db.scheduled.filter((s) => s.from === me.id).map(({ id, chan, sendAt, text, files }) => ({ id, chan, sendAt, text, files })) });
  api['POST /api/scheduled/cancel'] = async (req, res, me) => {
    const b = await body(req, 256), s = db.scheduled.find((x) => x.id === str(b.id, 32) && x.from === me.id); if (!s) fail(404, 'Not found');
    db.scheduled = db.scheduled.filter((x) => x !== s); gcFiles((s.files || []).map((f) => f.id)); store.save(); json(res, 200, { ok: true });
  };
  ctx.ticks.push({ every: 2000, fn: (now) => {
    const due = db.scheduled.filter((s) => s.sendAt <= now); if (!due.length) return;
    db.scheduled = db.scheduled.filter((s) => s.sendAt > now);
    for (const s of due) { const u = userById(s.from); if (!u || u.removed) continue; try { createMessage(u, s); } catch (e) { emit('schedulefail', { id: s.id, chan: s.chan, error: e.message }, [u.id]); } }
    store.save();
  } });
  ctx.ticks.push({ every: 5000, fn: (now) => { const dead = db.messages.filter((m) => m.expiresAt && m.expiresAt <= now); if (dead.length) removeMessages(dead); } });
  ctx.createMessage = createMessage;

  api['POST /api/forward'] = async (req, res, me) => {
    const b = await body(req, 512), src = getMsg(me, b.id), chan = str(b.chan, 64);
    if (src.deleted || src.system || src.poll || src.game) fail(400, "That message can't be forwarded.");
    if (!isAdmin(me) && !rate('msg:' + me.id, 30, 10000)) fail(429, 'You are sending too fast.');
    const m = createMessage(me, { chan, text: src.text, files: (src.files || []).map((f) => ({ id: f.id })), fwd: { from: src.from, ts: src.ts }, foreignFiles: true });
    json(res, 200, { ok: true, id: m.id });
  };

  api['POST /api/edit'] = async (req, res, me) => {
    const b = await body(req, 65536), m = getMsg(me, b.id);
    if (m.from !== me.id || m.deleted || m.system || m.poll || m.game) fail(403, 'You can only edit your own text messages.');
    checkNotMuted(me);
    const t = str(b.text, MAX_TEXT); if (!t.trim() && !(m.files || []).length) fail(400, 'Empty message');
    if (t === m.text) return json(res, 200, { ok: true });
    (m.editHistory ||= []).push({ text: m.text, ts: m.edited || m.ts }); if (m.editHistory.length > 20) m.editHistory.shift();
    m.text = t; m.edited = Date.now();
    const { mentions, everyone } = parseMentions(t, me, m.chan); m.mentions = mentions.length ? mentions : undefined; m.everyone = everyone || undefined;
    delete m.preview; store.save(); emit('update', msgOut(m), audience(m.chan)); attachPreview(m); json(res, 200, { ok: true });
  };
  api['GET /api/msg/history'] = async (req, res, me, url) => {
    const m = getMsg(me, url.searchParams.get('id')); if (m.deleted) return json(res, 200, { versions: [] });
    json(res, 200, { versions: [...(m.editHistory || []).map((e) => ({ text: e.text, ts: e.ts })), { text: m.text, ts: m.edited || m.ts, current: true }] });
  };

  api['POST /api/delete'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id);
    if (m.deleted) return json(res, 200, { ok: true });
    const author = m.from && userById(m.from);
    if (m.from !== me.id && !(isAdmin(me) && !(author && isOwner(author)))) fail(403, 'You can only delete your own messages.');
    const files = (m.files || []).map((f) => f.id);
    for (const k of ['text', 'files', 'poll', 'game', 'reactions', 'preview', 'editHistory', 'mentions', 'everyone', 'pinned', 'reply', 'fwd', 'expiresAt', 'system']) delete m[k];
    m.deleted = true; m.deletedBy = me.id; m.reactions = {};
    gcFiles(files); store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };

  const emojiKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= 24 && !BAD_KEYS.has(k) && (/^:[a-z0-9_]{2,20}:$/.test(k) ? Object.prototype.hasOwnProperty.call(db.emojis, k.slice(1, -1)) : (!/^[\x00-\x7F]+$/.test(k) && k.length <= 16));
  api['POST /api/react'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id), e = b.emoji;
    if (m.deleted || m.system || !emojiKey(e)) fail(400, 'Bad reaction');
    checkNotMuted(me);
    if (!Object.prototype.hasOwnProperty.call(m.reactions, e) && Object.keys(m.reactions).length >= 24) fail(400, 'Too many different reactions.');
    const arr = (m.reactions[e] ||= []), i = arr.indexOf(me.id);
    if (i >= 0) arr.splice(i, 1); else arr.push(me.id);
    if (!arr.length) delete m.reactions[e];
    store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };

  api['POST /api/pin'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id);
    if (m.deleted || m.system) fail(400, "That message can't be pinned.");
    const c = m.chan.startsWith('dm:') ? null : db.channels[m.chan];
    if (c && !isAdmin(me) && !(c.members && c.by === me.id)) fail(403, 'Only admins can pin messages here.');
    if (m.pinned) delete m.pinned;
    else { if (chanMsgs(m.chan).filter((x) => x.pinned).length >= 50) fail(400, 'Too many pinned messages.'); m.pinned = { by: me.id, ts: Date.now() }; sysMsg(m.chan, `${me.name} pinned a message`, { ref: m.id, kind: 'pin' }); }
    store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true, pinned: !!m.pinned });
  };

  // ----- polls & games -----
  api['POST /api/poll/vote'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id); checkNotMuted(me);
    if (!m.poll || m.poll.closed) fail(400, 'This poll is closed.');
    const idx = Number(b.option), opt = m.poll.options[idx]; if (!opt) fail(400, 'No such option');
    const has = opt.v.includes(me.id);
    if (m.poll.quiz) { if (m.poll.options.some((o) => o.v.includes(me.id))) fail(409, 'You already answered.'); opt.v.push(me.id); }
    else if (m.poll.multi) { if (has) opt.v = opt.v.filter((x) => x !== me.id); else opt.v.push(me.id); }
    else { for (const o of m.poll.options) o.v = o.v.filter((x) => x !== me.id); if (!has) opt.v.push(me.id); }
    store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };
  api['POST /api/poll/close'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id);
    if (!m.poll || (m.from !== me.id && !isAdmin(me))) fail(403, 'Only the poll creator or an admin can close it.');
    m.poll.closed = true; store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  api['POST /api/game/join'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id);
    if (!m.game || m.game.o || m.game.x === me.id) fail(400, "You can't join this game."); checkNotMuted(me);
    m.game.o = me.id; store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };
  api['POST /api/game/move'] = async (req, res, me) => {
    const b = await body(req, 256), m = getMsg(me, b.id), g = m.game, cell = Number(b.cell);
    if (!g || g.winner || !g.o) fail(400, 'The game is not in progress.');
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || g.board[cell]) fail(400, 'Bad move');
    if ((g.turn === 'x' ? g.x : g.o) !== me.id) fail(403, "It's not your turn.");
    g.board[cell] = g.turn;
    if (LINES.some((l) => l.every((i) => g.board[i] === g.turn))) g.winner = g.turn; else if (g.board.every(Boolean)) g.winner = 'draw'; else g.turn = g.turn === 'x' ? 'o' : 'x';
    store.save(); emit('update', msgOut(m), audience(m.chan)); json(res, 200, { ok: true });
  };

  // ----- reading -----
  api['GET /api/messages'] = async (req, res, me, url) => {
    const q = url.searchParams, chan = q.get('chan'); mustSee(me, chan);
    const limit = Math.min(Math.max(Number(q.get('limit')) || 60, 10), 100);
    const all = chanMsgs(chan).filter((m) => !m.thread);
    const before = Number(q.get('before')), after = Number(q.get('after')), from = Number(q.get('from'));
    let slice, older, newer;
    if (before) { const arr = all.filter((m) => m.seq < before); slice = arr.slice(-limit); older = arr.length > limit; newer = false; }
    else if (after) { const arr = all.filter((m) => m.seq > after); slice = arr.slice(0, limit); older = true; newer = arr.length > limit; }
    else if (from) { const i = all.findIndex((m) => m.ts >= from); const start = i < 0 ? all.length : i; slice = all.slice(start, start + limit); older = start > 0; newer = start + limit < all.length; }
    else { slice = all.slice(-limit); older = all.length > limit; newer = false; }
    json(res, 200, { messages: slice.map(msgOut), older, newer });
  };
  api['GET /api/thread'] = async (req, res, me, url) => {
    const root = getMsg(me, url.searchParams.get('id'));
    json(res, 200, { root: msgOut(root), messages: chanMsgs(root.chan).filter((m) => m.thread === root.id).slice(0, 500).map(msgOut) });
  };
  api['POST /api/messages/byids'] = async (req, res, me) => {
    const b = await body(req, 16384), ids = Array.isArray(b.ids) ? b.ids.slice(0, 200) : [];
    json(res, 200, { messages: ids.map((id) => msgById.get(str(id, 32))).filter((m) => m && !m.deleted && canSee(me, m.chan)).map(msgOut) });
  };
  api['GET /api/seenby'] = async (req, res, me, url) => {
    const chan = url.searchParams.get('chan'), seq = Number(url.searchParams.get('seq')); mustSee(me, chan);
    const m = [...chanMsgs(chan)].reverse().find((x) => x.seq === seq);
    json(res, 200, { users: Object.values(db.users).filter((u) => !u.removed && u.id !== (m && m.from) && canSee(u, chan) && (u.seen[chan] || 0) >= seq).map((u) => u.id) });
  };
  api['GET /api/search'] = async (req, res, me, url) => {
    const q = url.searchParams, text = (q.get('q') || '').toLowerCase().trim(), from = q.get('from'), only = q.get('chan'), has = q.get('has');
    const after = Number(q.get('after')) || 0, before = Number(q.get('before')) || Infinity;
    if (!text && !from && !has && !only && !after && before === Infinity) return json(res, 200, { results: [] });
    if (text && text.length < 2 && !from && !has && !only) return json(res, 200, { results: [] });
    const vis = new Map(), seeChan = (c) => { if (!vis.has(c)) vis.set(c, canSee(me, c)); return vis.get(c); };
    const out = [];
    for (let i = db.messages.length - 1; i >= 0 && out.length < 60; i--) {
      const m = db.messages[i]; if (m.deleted || m.system || !seeChan(m.chan)) continue;
      if (only && m.chan !== only) continue; if (from && m.from !== from) continue; if (m.ts < after || m.ts >= before) continue;
      if (has === 'file' && !(m.files || []).length) continue; if (has === 'image' && !(m.files || []).some((f) => IMG.test(f.name))) continue;
      if (has === 'link' && !/https?:\/\//i.test(m.text || '')) continue; if (has === 'pin' && !m.pinned) continue; if (has === 'poll' && !m.poll) continue;
      if (has === 'mention' && !(m.everyone || (m.mentions || []).includes(me.id))) continue;
      if (text && !((m.text || '') + ' ' + (m.poll ? m.poll.q : '') + ' ' + (m.files || []).map((f) => f.name).join(' ')).toLowerCase().includes(text)) continue;
      out.push(msgOut(m));
    }
    json(res, 200, { results: out });
  };
  api['GET /api/files'] = async (req, res, me, url) => {
    const q = url.searchParams, chan = q.get('chan'), before = Number(q.get('before')) || Infinity, kind = q.get('kind') || 'all'; mustSee(me, chan);
    const out = [], arr = chanMsgs(chan);
    for (let i = arr.length - 1; i >= 0 && out.length < 60; i--) {
      const m = arr[i]; if (m.deleted || m.seq >= before) continue;
      for (const f of m.files || []) {
        const isImg = IMG.test(f.name), isMedia = /\.(mp4|webm|mov|mp3|wav|ogg|m4a|weba|opus)$/i.test(f.name);
        if (kind === 'image' && !isImg) continue; if (kind === 'media' && !isMedia) continue; if (kind === 'doc' && (isImg || isMedia)) continue;
        out.push({ id: f.id, name: f.name, size: f.size, from: m.from, ts: m.ts, seq: m.seq, msg: m.id });
      }
    }
    json(res, 200, { files: out });
  };

  api['POST /api/read'] = async (req, res, me) => {
    const chan = str((await body(req, 256)).chan, 64); mustSee(me, chan);
    const last = lastSeq(chan); me.read[chan] = last;
    emit('readstate', { chan, seq: last }, [me.id]);
    if (me.prefs.readReceipts !== false && (chan.startsWith('dm:') || db.channels[chan].members) && (me.seen[chan] || 0) < last) { me.seen[chan] = last; emit('seen', { chan, user: me.id, seq: last }, audience(chan)); }
    else if (me.prefs.readReceipts !== false) me.seen[chan] = last;
    store.save(); json(res, 200, { ok: true });
  };
  api['POST /api/typing'] = async (req, res, me) => {
    const b = await body(req, 256), chan = str(b.chan, 64); mustSee(me, chan);
    const k = me.id + ':' + chan; if (Date.now() - (lastTyping.get(k) || 0) > 1500) { lastTyping.set(k, Date.now()); emit('typing', { chan, user: me.id, thread: str(b.thread, 32) || undefined }, audience(chan)); }
    json(res, 200, { ok: true });
  };

  // ----- channels & groups -----
  const slug = (n) => String(n || '').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30);
  const groupMembers = (me, list) => { const ids = [...new Set([me.id, ...(Array.isArray(list) ? list : []).filter((i) => typeof i === 'string')])].filter((i) => { const u = userById(i); return u && !u.removed; }); return ids; };
  const canManage = (me, c) => isAdmin(me) || (!!c.members && c.by === me.id);

  api['POST /api/channel'] = async (req, res, me) => {
    const b = await body(req, 4096); checkNotMuted(me);
    if (Array.isArray(b.members)) { // private group
      if (!S.membersCanCreateGroups && !isAdmin(me)) fail(403, 'Only admins can create groups here.');
      const label = str(b.name, 60).replace(/\s+/g, ' ').trim().slice(0, 30); if (!label) fail(400, 'Give the group a name');
      const ids = groupMembers(me, b.members); if (ids.length < 2) fail(400, 'Pick at least one friend');
      const g = { id: 'g-' + rid(5), name: label, topic: '', created: Date.now(), by: me.id, members: ids };
      db.channels[g.id] = g; store.save(); emit('channel', chanOut(g), ids); sysMsg(g.id, `${me.name} created this group`); return json(res, 200, chanOut(g));
    }
    if (!S.membersCanCreateChannels && !isAdmin(me)) fail(403, 'Only admins can create channels here.');
    const id = slug(b.name); if (!id) fail(400, 'Invalid channel name'); if (Object.prototype.hasOwnProperty.call(db.channels, id) || id.startsWith('dm')) fail(409, 'A channel with that name exists');
    const c = { id, name: id, topic: str(b.topic, 100), category: str(b.category, 30).trim(), created: Date.now(), by: me.id };
    if (b.readonly && isAdmin(me)) c.readonly = true;
    db.channels[id] = c; store.save(); emit('channel', chanOut(c)); sysMsg(id, `${me.name} created this channel`); json(res, 200, chanOut(c));
  };
  api['POST /api/channel/update'] = async (req, res, me) => {
    const b = await body(req, 4096), c = db.channels[str(b.id, 64)];
    if (!c || !canSee(me, c.id)) fail(404, 'No such channel'); if (!canManage(me, c)) fail(403, 'Only admins can change this.');
    const notes = [];
    if (b.name !== undefined) { const n = c.members ? str(b.name, 60).replace(/\s+/g, ' ').trim().slice(0, 30) : slug(b.name); if (!n) fail(400, 'Invalid name'); if (!c.members && n !== c.name && Object.values(db.channels).some((o) => o.name === n)) fail(409, 'A channel with that name exists'); if (n !== c.name) { notes.push(`${me.name} renamed this to ${c.members ? n : '#' + n}`); c.name = n; } }
    if (b.topic !== undefined) c.topic = str(b.topic, 100);
    if (b.category !== undefined) c.category = str(b.category, 30).trim();
    if (b.readonly !== undefined && !!b.readonly !== !!c.readonly) { c.readonly = !!b.readonly; notes.push(c.readonly ? `${me.name} made this read-only (admins post)` : `${me.name} allowed everyone to post`); }
    if (b.slow !== undefined) { const s = Math.max(0, Math.min(Math.round(Number(b.slow)) || 0, 21600)); if (s !== (c.slow || 0)) { c.slow = s; notes.push(s ? `${me.name} turned on slow mode (${s}s)` : `${me.name} turned off slow mode`); } }
    if (b.ttl !== undefined) { const t = Math.max(0, Math.min(Math.round(Number(b.ttl)) || 0, 31536000)); if (t !== (c.ttl || 0)) { c.ttl = t; notes.push(t ? `${me.name} set messages to disappear after ${ttlLabel(t)}` : `${me.name} turned off disappearing messages`); } }
    store.save(); emit('channel', chanOut(c), audience(c.id)); for (const n of notes) sysMsg(c.id, n); json(res, 200, chanOut(c));
  };
  const ttlLabel = (s) => (s < 120 ? s + ' seconds' : s < 7200 ? Math.round(s / 60) + ' minutes' : s < 172800 ? Math.round(s / 3600) + ' hours' : Math.round(s / 86400) + ' days');
  api['POST /api/chat/ttl'] = async (req, res, me) => { // disappearing messages for a direct message
    const b = await body(req, 256), chan = str(b.chan, 64); mustSee(me, chan);
    if (!chan.startsWith('dm:')) fail(400, 'Use the channel settings instead.');
    const t = Math.max(0, Math.min(Math.round(Number(b.ttl)) || 0, 31536000)); if (t) db.dmTtl[chan] = t; else delete db.dmTtl[chan];
    store.save(); emit('dmttl', { chan, ttl: t }, audience(chan)); sysMsg(chan, t ? `${me.name} set messages to disappear after ${ttlLabel(t)}` : `${me.name} turned off disappearing messages`); json(res, 200, { ok: true });
  };
  api['POST /api/chat/clear'] = async (req, res, me) => { // scope "mine": your own messages here; scope "all": a whole channel/group (admins / the group's creator)
    const b = await body(req, 256), chan = str(b.chan, 64); mustSee(me, chan);
    if (b.scope === 'all') {
      const c = db.channels[chan]; if (!c) fail(400, 'In private chats you can delete your own messages only.');
      if (!canManage(me, c)) fail(403, 'Only admins can clear this chat.');
      const n = removeMessages([...chanMsgs(chan)]); sysMsg(chan, `${me.name} cleared the chat history`, { kind: 'clear' }); return json(res, 200, { ok: true, removed: n });
    }
    json(res, 200, { ok: true, removed: removeMessages(chanMsgs(chan).filter((m) => m.from === me.id)) });
  };
  api['POST /api/channel/delete'] = async (req, res, me) => {
    const b = await body(req, 256), c = db.channels[str(b.id, 64)];
    if (!c || !canSee(me, c.id)) fail(404, 'No such channel'); if (c.id === 'general') fail(400, "The general channel can't be deleted."); if (!canManage(me, c)) fail(403, 'Only admins can delete this.');
    const aud = audience(c.id); removeMessages([...chanMsgs(c.id)]); delete db.channels[c.id]; byChan.delete(c.id); delete ctx.db.extras[c.id];
    store.save(); emit('channel_deleted', { id: c.id }, aud); json(res, 200, { ok: true });
  };
  api['POST /api/channel/members'] = async (req, res, me) => {
    const b = await body(req, 4096), c = db.channels[str(b.id, 64)];
    if (!c || !c.members || !canSee(me, c.id)) fail(404, 'No such group');
    const rm = (Array.isArray(b.remove) ? b.remove : []).filter((i) => c.members.includes(i)), add = groupMembers({ id: '' }, b.add).filter((i) => i && !c.members.includes(i));
    const leaving = rm.length === 1 && rm[0] === me.id && !add.length;
    if (!leaving && !canManage(me, c)) fail(403, 'Only the group creator or an admin can change members.');
    const before = [...c.members];
    c.members = [...c.members.filter((i) => !rm.includes(i)), ...add];
    if (!c.members.length) { removeMessages([...chanMsgs(c.id)]); delete db.channels[c.id]; byChan.delete(c.id); store.save(); emit('channel_deleted', { id: c.id }, before); return json(res, 200, { ok: true, deleted: true }); }
    store.save();
    emit('channel_removed', { id: c.id }, rm); emit('channel', chanOut(c), c.members);
    if (leaving) sysMsg(c.id, `${me.name} left the group`);
    else { for (const i of add) sysMsg(c.id, `${me.name} added ${userById(i).name}`); for (const i of rm) sysMsg(c.id, `${me.name} removed ${userById(i)?.name || 'someone'}`); }
    json(res, 200, { ok: true, channel: chanOut(c) });
  };

  // ----- uploads & custom emoji -----
  api['POST /api/upload'] = async (req, res, me, url) => {
    checkNotMuted(me);
    if (!rate('up:' + me.id, 40, 60000)) fail(429, 'Too many uploads. Wait a moment.');
    const max = S.maxUploadMB * 1048576, len = Number(req.headers['content-length'] || 0);
    if (len > max) { req.resume(); fail(413, `File too large (${S.maxUploadMB} MB max)`); }
    const id = rid(12), name = (url.searchParams.get('name') || 'file').replace(/[\\/\0-\x1f]/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '').slice(0, 120) || 'file';
    const file = path.join(P.uploads, id), out = fs.createWriteStream(file); let size = 0, dead = false;
    const drop = () => { dead = true; out.destroy(); fs.unlink(file, () => {}); };
    req.on('data', (c) => { size += c.length; if (size > max && !dead) { drop(); if (!res.writableEnded) json(res, 413, { error: `File too large (${S.maxUploadMB} MB max)` }); req.destroy(); } });
    req.on('aborted', () => { if (!dead) drop(); });
    req.pipe(out);
    out.on('finish', () => { if (dead || res.writableEnded) return; db.files[id] = { id, name, size, by: me.id, ts: Date.now() }; store.save(); json(res, 200, { id, name, size }); });
    out.on('error', () => { if (!res.writableEnded) json(res, 500, { error: 'Upload failed' }); });
  };

  api['POST /api/emoji/add'] = async (req, res, me) => {
    const b = await body(req, 1024), name = str(b.name, 20).toLowerCase(), f = db.files[str(b.file, 24)];
    if (!S.membersCanAddEmoji && !isAdmin(me)) fail(403, 'Only admins can add emoji here.');
    if (!/^[a-z0-9_]{2,20}$/.test(name) || BAD_KEYS.has(name)) fail(400, 'Emoji names use letters, numbers and _ (2–20 characters).');
    if (Object.prototype.hasOwnProperty.call(db.emojis, name)) fail(409, 'That emoji name is taken.');
    if (!f || f.by !== me.id || !IMG.test(f.name) || f.size > 512 * 1024) fail(400, 'Use an image under 512 KB.');
    if (Object.keys(db.emojis).length >= 300) fail(400, 'Too many custom emoji.');
    db.emojis[name] = f.id; store.save(); emit('emoji', { name, id: f.id }); json(res, 200, { ok: true });
  };
  api['POST /api/emoji/remove'] = async (req, res, me) => {
    const name = str((await body(req, 256)).name, 20), id = Object.prototype.hasOwnProperty.call(db.emojis, name) ? db.emojis[name] : null;
    if (!id) fail(404, 'No such emoji'); if (!isAdmin(me) && db.files[id]?.by !== me.id) fail(403, 'Only admins or the uploader can remove it.');
    delete db.emojis[name]; gcFiles([id]); store.save(); emit('emoji', { name, id: null }); json(res, 200, { ok: true });
  };
};
