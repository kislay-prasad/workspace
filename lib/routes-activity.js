'use strict';
// Activity feed (Teams "Activity"), owned by the people area (docs/features-people.md).
// The store and the producer ctx.activity(uid, item) live in app.js so every feature can post to it.
// Items: { id, ts, read, type, from?, chan?, msg?, thread?, text?, ... }  types: mention, reply, reaction, missedCall, voicemail,
// added, task, meeting, follow, urgent, approval, form, report, system (see docs/EXTENDING.md "Activity items").
// This module: the API (list with filters, read / unread), the read-time privacy filter (only chats you can still see, nothing
// from people you blocked, your per-type and per-chat notification settings), and the mention / reply / reaction items.
module.exports = (ctx) => {
  const { api, db, json, body, str, coll, store, emit, fail, rate, rid, isObj, userById, canSee, msgById, chanMsgs, hooks } = ctx;
  // u has blocked person `id` (prefs.blocked, see routes-people.js); shared with routes-people.js, which loads after this module
  const blocks = (u, id) => !!(u && id && u.prefs && Array.isArray(u.prefs.blocked) && u.prefs.blocked.includes(id));
  ctx.ppBlocks = blocks;
  const live = (u) => !!u && !u.removed && !u.deleted;
  const plain = (s) => String(s || '').replace(/```/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/`([^`\n]+)`/g, '$1').replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim();
  const snippet = (m) => (m.deleted ? '' : (plain(m.text) || (m.poll ? 'Poll: ' + m.poll.q : '') || (m.files && m.files.length ? 'File: ' + m.files[0].name : '') || (m.card && m.card.title ? String(m.card.title) : '')).slice(0, 160));
  const chanLabel = (chan, me) => {
    if (chan.startsWith('dm:')) { const ids = chan.split(':').slice(1), other = ids.find((i) => i !== me.id) || me.id, u = userById(other); return u ? u.name : ''; }
    const c = db.channels[chan]; return c ? (c.members ? c.name : '#' + c.name) : '';
  };
  // notification settings a person keeps in prefs (validated in routes-people.js): actTypes { type: 'banner'|'feed'|'off' }, chatNotif { chan: 'mentions'|'off' }
  const settingsOf = (me) => { const p = me.prefs || {}; return { types: isObj(p.actTypes) ? p.actTypes : {}, chats: isObj(p.chatNotif) ? p.chatNotif : {} }; };
  function visibleList(me) {
    const st = settingsOf(me), see = new Map(), list = coll('activity')[me.id] || [];
    return list.filter((a) => {
      if (!a || typeof a !== 'object') return false;
      if (a.from && blocks(me, a.from)) return false;
      if (st.types[a.type] === 'off') return false;
      if (a.chan) {
        if (!see.has(a.chan)) see.set(a.chan, canSee(me, a.chan)); if (!see.get(a.chan)) return false; // never leak chats someone left
        const cs = st.chats[a.chan]; if (cs === 'off' || (cs === 'mentions' && a.type !== 'mention')) return false;
      }
      return true;
    });
  }
  // the text always comes from the message as it is now (edits show, deleted messages show nothing)
  function present(a, me) {
    const o = { ...a };
    if (a.msg) {
      const m = msgById.get(a.msg);
      if (!m || m.deleted) { o.text = ''; o.gone = true; }
      else { o.text = snippet(m); if (m.priority) o.priority = m.priority; if (m.subject) o.subject = String(m.subject).slice(0, 140); }
    }
    if (a.chan) o.where = chanLabel(a.chan, me);
    return o;
  }
  ctx.activityUnread = (me) => visibleList(me).filter((a) => !a.read).length;

  // people who used LANChat before the feed existed: their recent @mentions become feed items once (like the old Activity list)
  function backfill(me) {
    const done = coll('activityBackfill'); if (done[me.id]) return; done[me.id] = Date.now();
    const all = coll('activity'), list = (all[me.id] ||= []);
    if (!list.some((a) => a.type === 'mention')) {
      const found = [];
      for (let i = db.messages.length - 1, n = 0; i >= 0 && n < 4000 && found.length < 100; i--, n++) {
        const m = db.messages[i]; if (m.deleted || m.system || !m.from || m.from === me.id || !(m.mentions || []).includes(me.id) || !canSee(me, m.chan)) continue;
        found.push({ id: rid(6), ts: m.ts, read: (me.read[m.chan] ?? me.baseSeq ?? 0) >= m.seq, type: 'mention', from: m.from, chan: m.chan, msg: m.id, thread: m.thread || undefined });
      }
      if (found.length) { list.push(...found); list.sort((a, b) => a.ts - b.ts); if (list.length > 300) list.splice(0, list.length - 300); }
    }
    store.save();
  }

  api['GET /api/activity'] = async (req, res, me, url) => {
    backfill(me);
    const q = url.searchParams, type = str(q.get('type') || '', 20), types = str(q.get('types') || '', 400).split(',').filter(Boolean).slice(0, 20);
    const unread = q.get('unread') === '1', before = Number(q.get('before')) || 0, limit = Math.max(1, Math.min(Number(q.get('limit')) || 200, 300));
    const all = visibleList(me), want = all.filter((a) => (!type || a.type === type) && (!types.length || types.includes(a.type)) && (!unread || !a.read) && (!before || a.ts < before));
    json(res, 200, { items: want.slice(-limit).reverse().map((a) => present(a, me)), unread: all.filter((a) => !a.read).length, more: want.length > limit });
  };
  // { ids: [...], read: true|false } marks some; { all: true } marks everything (optionally only some types: { all: true, types: [...] })
  api['POST /api/activity/read'] = async (req, res, me) => {
    if (!rate('actread:' + me.id, 120, 60000)) fail(429, 'Slow down');
    const b = await body(req, 8192), list = coll('activity')[me.id] || [], ids = Array.isArray(b.ids) ? new Set(b.ids.slice(0, 300).map((x) => str(x, 16))) : null, read = b.read !== false;
    const types = Array.isArray(b.types) ? new Set(b.types.slice(0, 20).map((x) => str(x, 20))) : null, changed = [];
    for (const a of list) if ((b.all && (!types || types.has(a.type))) || (ids && ids.has(a.id))) { if (a.read !== read) changed.push(a.id); a.read = read; }
    store.save(); emit('activityread', { ids: b.all && !types ? 'all' : b.all ? changed : [...(ids || [])], read }, [me.id]); json(res, 200, { ok: true });
  };

  // reading a chat also reads the @mentions in it (thread replies stay until you open them)
  const read0 = api['POST /api/read'];
  if (read0) api['POST /api/read'] = async (req, res, me, url) => {
    const r = await read0(req, res, me, url);
    try {
      const chan = str((await body(req, 256)).chan, 64), upto = me.read[chan] || 0, ids = [];
      for (const a of coll('activity')[me.id] || []) {
        if (a.read || a.chan !== chan || !a.msg || (a.type !== 'mention' && a.type !== 'urgent')) continue;
        const m = msgById.get(a.msg); if (!m || (!m.thread && m.seq <= upto)) { a.read = true; ids.push(a.id); }
      }
      if (ids.length) { store.save(); emit('activityread', { ids, read: true }, [me.id]); }
    } catch {}
    return r;
  };

  hooks.initExtra.push((u) => ({ ppActUnread: ctx.activityUnread(u) }));

  // ---------- producers: @mentions, thread replies, reactions ----------
  const audienceUsers = (chan) => Object.values(db.users).filter((u) => live(u) && canSee(u, chan));
  hooks.afterMessage.push((m) => {
    if (!m.from || m.system || m.deleted || m.autoReply) return;
    const base = { from: m.from, chan: m.chan, msg: m.id, thread: m.thread || undefined, text: snippet(m), priority: m.priority || undefined };
    const done = new Set([m.from]), direct = new Set(m.mentions || []);
    const give = (u, item) => { if (!live(u) || done.has(u.id) || !canSee(u, m.chan) || blocks(u, m.from)) return; done.add(u.id); ctx.activity(u.id, { ...base, ...item }); };
    for (const id of direct) give(userById(id), { type: 'mention' });
    if (m.everyone) for (const u of audienceUsers(m.chan)) give(u, { type: 'mention', everyone: true });
    if (m.thread) { // the thread's starter, everyone who replied, and followers (unless they unfollowed)
      const root = msgById.get(m.thread); if (!root) return;
      const ids = new Set(root.from ? [root.from] : []);
      for (const r of chanMsgs(m.chan)) if (r.thread === root.id && r.from && r.id !== m.id && !r.autoReply) ids.add(r.from);
      for (const u of Object.values(db.users)) if (u.follows && u.follows[root.id]) ids.add(u.id);
      for (const id of ids) { const u = userById(id); if (u && u.unfollows && u.unfollows[root.id]) continue; give(u, { type: 'reply', root: root.id, mine: root.from === id || undefined }); }
    }
  });
  hooks.afterReact.push((m, me, emoji, added) => {
    if (!m.from || m.from === me.id || m.system) return;
    const owner = userById(m.from); if (!live(owner) || !canSee(owner, m.chan)) return;
    const list = coll('activity')[owner.id] || [], same = (a) => a.type === 'reaction' && a.msg === m.id && a.from === me.id && a.emoji === emoji;
    if (!added) { // taking a reaction back removes the notice if it hasn't been seen yet
      const i = list.findIndex((a) => same(a) && !a.read);
      if (i >= 0) { const [gone] = list.splice(i, 1); store.save(); emit('ppactdel', { ids: [gone.id] }, [owner.id]); }
      return;
    }
    if (blocks(owner, me.id) || list.some((a) => same(a) && Date.now() - a.ts < 600000)) return;
    ctx.activity(owner.id, { type: 'reaction', from: me.id, chan: m.chan, msg: m.id, thread: m.thread || undefined, emoji: String(emoji).slice(0, 24), text: snippet(m) });
  });
};
