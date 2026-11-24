'use strict';
// Joining (with host approval), sessions, profile, presence, per-user preferences.
module.exports = (ctx) => {
  const { api, db, S, store, pending, json, body, fail, rid, str, rate, ipOf, safeEq, isObj, BAD_KEYS, userById, userByToken, findByName, sanitizeUserName, makeUser, makeOwner, newToken, checkAdminKey, meOut, pub, emit, emitUser, sysMsg, adminIds, online, gcFiles, validChan, tokenHash } = ctx;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

  api['GET /api/config'] = async (req, res) => json(res, 200, { name: S.name, needPass: !!S.passcode, approval: !!S.requireApproval, version: 4, https: !!(ctx.httpsOn && ctx.httpsOn()) });

  function finishJoin(res, u, dev, code = 200) { const token = newToken(u, dev); ctx.emitUser(u); return json(res, code, { token, me: meOut(u) }); }

  api['POST /api/join'] = async (req, res) => {
    const ip = ipOf(req);
    if (!rate('join:' + ip, 15, 60000)) fail(429, 'Too many attempts. Wait a minute and try again.');
    const b = await body(req, 8192);
    const token = str(b.token, 200), dev = str(b.deviceId, 64);
    const keyOk = b.adminKey ? checkAdminKey(b.adminKey) : false;
    const existing = userByToken(token);
    if (existing) { existing.lastIp = ip; if (keyOk) makeOwner(existing); return json(res, 200, { token, me: meOut(existing) }); }
    if (keyOk) { // the host claiming its own session
      const u = findByName(sanitizeUserName(b.name)) || makeUser(sanitizeUserName(b.name));
      u.lastIp = ip; makeOwner(u); return finishJoin(res, u, dev);
    }
    const name = sanitizeUserName(b.name);
    if (ctx.isBanned(name, dev, ip)) fail(403, 'You have been blocked from this session.');
    if (S.passcode) { // wrong guesses are counted; once the limit is hit even the right passcode is refused for a while
      if (ctx.rateCount('pass:' + ip, 600000) >= 6) fail(429, 'Too many wrong passcodes. Try again later.');
      if (!safeEq(str(b.passcode, 100), S.passcode)) { ctx.rateAdd('pass:' + ip); fail(403, 'Wrong passcode'); }
    }
    const taken = findByName(name);
    if (taken && online(taken.id) && !taken.removed) fail(409, 'That name is in use right now. Pick another name.');
    if (!taken && !S.requireApproval) { const u = makeUser(name); u.lastIp = ip; sysMsg('general', `${name} joined`); return finishJoin(res, u, dev); }
    // needs the host's approval (new people, and anyone recovering an existing account)
    for (const r of pending.values()) if (r.status === 'pending' && r.name.toLowerCase() === name.toLowerCase()) {
      if (dev && r.dev === dev) return json(res, 202, { pending: true, id: r.id, secret: r.secret, name: r.name });
      fail(409, 'Someone is already waiting to join with that name.');
    }
    const mine = [...pending.values()].filter((r) => r.status === 'pending');
    if (mine.length >= 30) fail(503, 'Too many people are waiting. Try again later.');
    if (mine.filter((r) => r.ip === ip).length >= 3) fail(429, 'You already have requests waiting.');
    const r = { id: rid(8), secret: rid(16), name: taken ? taken.name : name, dev, ip, ts: Date.now(), existingId: taken ? taken.id : null, status: 'pending' };
    pending.set(r.id, r);
    emit('joinrequest', ctx.reqOut(r), adminIds());
    ctx.notifyHost('joinrequest', { id: r.id, name: r.name, existing: !!r.existingId });
    json(res, 202, { pending: true, id: r.id, secret: r.secret, name });
  };

  api['GET /api/join/status'] = async (req, res, _me, url) => {
    if (!rate('jst:' + ipOf(req), 120, 60000)) fail(429, 'Slow down');
    const r = pending.get(url.searchParams.get('id') || '');
    if (!r || !safeEq(r.secret, url.searchParams.get('s') || '')) return json(res, 404, { status: 'expired' });
    if (r.status === 'approved') { const u = userById(r.userId); if (!u || u.removed) return json(res, 200, { status: 'denied' }); return json(res, 200, { status: 'approved', token: r.token, me: meOut(u) }); }
    json(res, 200, { status: r.status, reason: r.reason || '' });
  };

  api['POST /api/join/cancel'] = async (req, res) => {
    const b = await body(req, 512), r = pending.get(str(b.id, 32));
    if (r && safeEq(r.secret, str(b.secret, 64)) && r.status === 'pending') { pending.delete(r.id); emit('joindecided', { id: r.id, status: 'cancelled' }, adminIds()); }
    json(res, 200, { ok: true });
  };

  api['POST /api/signout'] = async (req, res, me) => {
    const h = ctx.sha(str(req.headers['x-token'], 200));
    me.tokens = me.tokens.filter((t) => t.h !== h); ctx.rebuildIndexes(); store.save(); json(res, 200, { ok: true });
  };

  api['GET /api/info'] = async (req, res) => json(res, 200, { urls: ctx.lanAddresses(), publicUrl: ctx.publicUrl || '', passcode: !!S.passcode, approval: !!S.requireApproval, name: S.name, https: !!(ctx.httpsOn && ctx.httpsOn()) });

  // ----- move a signed-in browser from http:// to https:// on the same server, without asking the host again -----
  const handoffs = new Map(); // one-time code -> { uid, exp }
  api['POST /api/handoff'] = async (req, res, me) => {
    if (!rate('handoff:' + me.id, 10, 60000)) fail(429, 'Slow down');
    const now = Date.now(); for (const [k, v] of handoffs) if (v.exp < now) handoffs.delete(k);
    const code = rid(16); handoffs.set(code, { uid: me.id, exp: now + 120000 }); json(res, 200, { code });
  };
  api['POST /api/handoff/redeem'] = async (req, res) => {
    const ip = ipOf(req); if (!rate('redeem:' + ip, 20, 60000)) fail(429, 'Slow down');
    const b = await body(req, 512), code = str(b.code, 64), h = handoffs.get(code);
    if (!h || h.exp < Date.now()) { handoffs.delete(code); fail(404, 'That link has expired. Join again on this page.'); }
    handoffs.delete(code); const u = userById(h.uid); if (!u || u.removed || u.deleted) fail(404, 'That account is gone.');
    u.lastIp = ip; return finishJoin(res, u, str(b.deviceId, 64));
  };

  // ----- profile / presence / prefs -----
  api['POST /api/profile'] = async (req, res, me) => {
    const b = await body(req, 4096);
    if (b.name !== undefined) { const n = sanitizeUserName(b.name), o = findByName(n); if (o && o.id !== me.id) fail(409, 'That name is taken'); me.name = n; }
    if (b.color !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(str(b.color, 7))) fail(400, 'Bad color'); me.color = b.color; }
    if (b.statusText !== undefined) me.statusText = str(b.statusText, 80);
    if (b.statusEmoji !== undefined) me.statusEmoji = str(b.statusEmoji, 8);
    if (b.avatar !== undefined) {
      if (b.avatar === null || b.avatar === '') { const old = me.avatar; me.avatar = null; if (old) gcFiles([old]); }
      else {
        const f = db.files[str(b.avatar, 24)];
        if (!f || f.by !== me.id || !/\.(png|jpe?g|gif|webp)$/i.test(f.name) || f.size > 3 * 1024 * 1024) fail(400, 'Avatar must be an image under 3 MB');
        const old = me.avatar; me.avatar = f.id; if (old && old !== f.id) gcFiles([old]);
      }
    }
    store.save(); emitUser(me); emit('me', meOut(me), [me.id]); json(res, 200, { ok: true, me: meOut(me) });
  };

  api['POST /api/presence'] = async (req, res, me) => {
    const b = await body(req, 512);
    if (b.state !== undefined) { if (!['auto', 'away', 'dnd', 'invisible'].includes(b.state)) fail(400, 'Bad state'); me.presence = b.state; }
    if (b.idle !== undefined) me.idle = !!b.idle;
    store.save(); emitUser(me); emit('me', meOut(me), [me.id]); json(res, 200, { ok: true });
  };

  const idList = (v, test, max) => { if (!Array.isArray(v)) fail(400, 'Bad list'); return [...new Set(v.filter((x) => typeof x === 'string' && x.length <= 64 && test(x)))].slice(0, max); };
  api['POST /api/prefs'] = async (req, res, me) => {
    const b = await body(req, 32768), out = {};
    for (const [k, v] of Object.entries(b)) {
      if (BAD_KEYS.has(k)) continue;
      switch (k) {
        case 'pinnedChats': case 'archived': out[k] = idList(v, (c) => validChan(c), 60); break;
        case 'favorites': out[k] = idList(v, (i) => !!userById(i), 200); break;
        case 'saved': out[k] = idList(v, (i) => /^[a-f0-9]{16}$/.test(i), 500); break;
        case 'readReceipts': out[k] = !!v; break;
        case 'muted': { if (!isObj(v)) fail(400, 'Bad muted'); const m = {}; for (const [c, t] of Object.entries(v)) if (!BAD_KEYS.has(c) && validChan(c)) m[c] = t === true ? true : Math.max(0, Math.min(Number(t) || 0, Date.now() + 3.2e10)); out.muted = m; break; }
        case 'nicknames': { if (!isObj(v)) fail(400, 'Bad nicknames'); const m = {}; for (const [i, n] of Object.entries(v)) if (userById(i) && typeof n === 'string' && n.trim()) m[i] = n.trim().slice(0, 24); out.nicknames = m; break; }
        case 'quiet': { if (!isObj(v)) fail(400, 'Bad quiet hours'); out.quiet = { on: !!v.on, from: HM.test(v.from) ? v.from : '22:00', to: HM.test(v.to) ? v.to : '07:00' }; break; }
        case 'notif': { if (!isObj(v)) fail(400, 'Bad notif'); out.notif = { previews: v.previews !== false, sound: v.sound !== false, desktop: v.desktop !== false, mentionsOnly: !!v.mentionsOnly }; break; }
        default: break; // unknown keys are ignored
      }
    }
    Object.assign(me.prefs, out); store.save(); emit('me', meOut(me), [me.id]); json(res, 200, { ok: true, prefs: me.prefs });
  };
};
