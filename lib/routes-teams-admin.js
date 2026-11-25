'use strict';
// Admin and security (section 24 of the Teams list), shown in the Manage dialog: activity log (ctx.audit lives in
// routes-admin.js), usage reports, messaging and meeting rules, bad-word filter, "Report a concern", export and legal
// hold, information barriers, sensitivity labels, bulk add with invite codes, guests' channel access, PIN / password
// sign-in with an authenticator-app code (TOTP, RFC 6238), signed-in devices, team naming and expiry rules,
// call-quality dashboard and the branded lobby.
// Data owned here: db.tmConfig (policies, labels, branding), db.tmReports, db.tmHolds, db.tmHoldArchive, db.tmInvites,
// db.tmAuth, db.tmDevices, db.tmUsage; S.messagingRules and S.meetingRules (shared contract).
// Every rule is a no-op until an admin turns it on, so existing sessions behave exactly as before.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip');

module.exports = (ctx) => {
  const { api, db, S, store, P, json, body, fail, rid, sha, str, rate, isObj, userById, isAdmin, isOwner, adminIds, canSee, audience, emit, emitFor, emitUser, msgOut, msgById, chanMsgs, coll, activity, hooks, safeEq, ipOf, dmPeer, dmParts, gcFiles, clients, rebuildIndexes, cleanUserName, findByName } = ctx;
  const TM = (ctx.tm ||= {});
  const audit = (...a) => ctx.audit && ctx.audit(...a);
  const now = () => Date.now(), DAY = 86400000;
  const needAdmin = (me) => { if (!isAdmin(me)) fail(403, 'Only the host or an admin can do that'); };
  const needOwner = (me) => { if (!isOwner(me)) fail(403, 'Only the host can do that'); };
  const cleanText = (v, max) => str(v, max * 2).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const live = (u) => !!u && !u.removed && !u.deleted;
  const chatName = (c) => { if (!c) return ''; if (c.startsWith('dm:')) return 'DM: ' + dmParts(c).slice(1).map((i) => userById(i)?.name || '?').join(' & '); const ch = db.channels[c]; if (!ch) return '(deleted chat)'; const t = ch.team && TM.teams ? TM.teams()[ch.team] : null; return t ? `${t.name} › ${ch.name}` : (ch.members ? ch.name : '#' + ch.name); };
  TM.chatName = chatName;

  // ---------- policies (db.tmConfig) ----------
  const LABELS = [{ id: 'general', name: 'General', color: '#13a10e', level: 0, desc: 'Everyday chats' }, { id: 'confidential', name: 'Confidential', color: '#e3a21a', level: 1, desc: "Can't be forwarded outside the team; no “anyone” share links" }, { id: 'highly', name: 'Highly confidential', color: '#c4314b', level: 2, desc: 'Also: no guests' }];
  const DEF = { teamCreate: 'everyone', naming: { prefix: '', suffix: '', blocked: [] }, expiry: { days: 0, warnDays: 7 }, badwords: { on: false, words: [], action: 'block' }, barriers: { on: false, segments: [], blocks: [] }, labels: LABELS, brand: { logo: '', color: '', welcome: '' }, pinSkipsApproval: false };
  const cfg = () => coll('tmConfig');
  const policy = () => { const c = cfg(); const o = {}; for (const k of Object.keys(DEF)) o[k] = c[k] === undefined ? DEF[k] : c[k]; return o; };
  TM.policy = policy;
  const MSG_DEF = { edit: true, delete: true, editMinutes: 0, stickers: true, memes: true, gifs: true };
  const MEET_DEF = { record: 'everyone', present: 'everyone', maxPeople: 0, watermark: false, lobby: 'members' };
  const msgRules = () => ({ ...MSG_DEF, ...(isObj(S.messagingRules) ? S.messagingRules : {}) });
  const meetRules = () => ({ ...MEET_DEF, ...(isObj(S.meetingRules) ? S.meetingRules : {}) });
  // what every client needs to know (labels for badges, the naming rule for the create-team form, branding)
  const publicCfg = () => { const p = policy(); return { labels: p.labels, naming: { prefix: p.naming.prefix, suffix: p.naming.suffix }, teamCreate: p.teamCreate, brand: brandPublic(), pinSkipsApproval: !!p.pinSkipsApproval }; };
  const pushCfg = () => emit('tm_config', publicCfg());
  hooks.initExtra.push((u) => ({ tmCfg: publicCfg(), tmReportsOpen: isAdmin(u) ? openReports() : 0 }));

  // ---------- bad words (whole words, case-insensitive) ----------
  let badCache = null;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (words) => new RegExp('(?<![\\p{L}\\p{N}_])(?:' + words.map(escRe).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
  const badRe = () => { const b = policy().badwords; if (!b.on || !b.words.length) return null; const key = b.words.join('\n'); if (!badCache || badCache.key !== key) badCache = { key, re: wordRe(b.words) }; badCache.re.lastIndex = 0; return badCache.re; };
  // names are always refused; messages are refused or get *** depending on the rule
  TM.checkText = (text, me, where) => {
    const re = badRe(); if (!re || !text) return text;
    if (!re.test(text)) return text; re.lastIndex = 0;
    if (where === 'name') fail(400, "That name contains a word that isn't allowed in this session.");
    if (policy().badwords.action === 'replace') return text.replace(re, '***');
    fail(400, "Your message contains a word that isn't allowed in this session. Please rephrase it.");
  };
  TM.checkName = (name, me, what) => {
    if (!name) return name; TM.checkText(name, me, 'name');
    if (what !== 'team' || isAdmin(me)) return name;
    const n = policy().naming; if (n.blocked.length && wordRe(n.blocked).test(name)) fail(400, 'That team name uses a word the host has blocked for team names.');
    let out = name; if (n.prefix && !out.startsWith(n.prefix)) out = n.prefix + out; if (n.suffix && !out.endsWith(n.suffix)) out += n.suffix;
    return out.slice(0, 100);
  };

  // ---------- sensitivity labels ----------
  TM.labelById = (id) => policy().labels.find((l) => l.id === id) || null;
  TM.labelLevel = (t, c) => Math.max(t && t.label && TM.labelById(t.label) ? TM.labelById(t.label).level : 0, c && c.label && TM.labelById(c.label) ? TM.labelById(c.label).level : 0);
  const chanLevel = (chan) => { const c = db.channels[chan]; if (!c) return 0; return TM.labelLevel(c.team && TM.teams ? TM.teams()[c.team] : null, c); };
  // for other areas (e.g. files: no "anyone with the link" sharing from a confidential chat)
  ctx.sensitivity = (chan) => { const c = db.channels[chan]; const t = c && c.team && TM.teams ? TM.teams()[c.team] : null; const id = (c && c.label) || (t && t.label) || ''; const l = TM.labelById(id); return { level: chanLevel(chan), label: l ? l.name : '', anyoneLinks: chanLevel(chan) < 1 }; };
  // files area contract: may this file get an "anyone with the link" share link? (no, from a confidential chat)
  ctx.allowAnyoneLink = (me, chan, fileId) => {
    if (chan && chanLevel(chan) >= 1) return false;
    if (fileId) for (const m of db.messages) if (m.files && m.files.some((f) => f.id === fileId) && chanLevel(m.chan) >= 1) return false;
    return true;
  };
  const origForward = api['POST /api/forward'];
  api['POST /api/forward'] = async (req, res, me, url) => {
    const b = await body(req, 512), src = msgById.get(str(b.id, 32));
    if (src && canSee(me, src.chan) && chanLevel(src.chan) >= 1) {
      const to = str(b.chan, 64), st = TM.teamOfChan ? TM.teamOfChan(src.chan) : null, tt = TM.teamOfChan ? TM.teamOfChan(to) : null;
      if (to !== src.chan && !(st && tt && st.id === tt.id)) fail(403, 'This message is in a confidential chat, so it can only be forwarded inside the same team.');
    }
    if (src && canSee(me, src.chan) && TM.blockedPair && str(b.chan, 64).startsWith('dm:') && TM.blockedPair(me.id, dmPeer(str(b.chan, 64), me))) fail(403, "You can't send messages to this person because of an information barrier.");
    return origForward(req, res, me, url);
  };

  // ---------- information barriers ----------
  const segsOf = (uid) => policy().barriers.segments.filter((s) => s.members.includes(uid)).map((s) => s.id);
  TM.blockedPair = (a, c) => {
    const b = policy().barriers; if (!b.on || !b.blocks.length || !a || !c || a === c) return false;
    const sa = segsOf(a), sc = segsOf(c); if (!sa.length || !sc.length) return false;
    return b.blocks.some(([x, y]) => (sa.includes(x) && sc.includes(y)) || (sa.includes(y) && sc.includes(x)));
  };
  // people on the other side of a barrier don't appear in each other's people lists and pickers
  hooks.userFields.push((u, viewer) => (viewer && viewer.id !== u.id && TM.blockedPair(u.id, viewer.id) ? { removed: true, barrier: true } : {}));
  const barrierIn = (me, chan) => {
    if (!policy().barriers.on) return false;
    if (chan.startsWith('dm:')) return TM.blockedPair(me.id, dmPeer(chan, me));
    const c = db.channels[chan]; return !!(c && c.members && !c.team && c.members.some((i) => i !== me.id && TM.blockedPair(me.id, i)));
  };

  // ---------- messages: bad words, messaging rules (stickers / memes / GIFs), information barriers ----------
  hooks.beforeMessage.push((m, p, me) => {
    if (barrierIn(me, m.chan)) fail(403, m.chan.startsWith('dm:') ? "You can't send messages to this person because of an information barrier." : "You can't post in this group because of an information barrier.");
    // session-wide sticker / meme / GIF rules are enforced by chatux (it sets m.sticker / m.meme / m.gif); a team can also turn stickers and memes off
    const t = TM.teamOfChan ? TM.teamOfChan(m.chan) : null;
    if (t && TM.settingsOf(t).stickers === false && (m.sticker || m.meme)) fail(403, 'Stickers and memes are turned off in this team.');
    if (m.text) m.text = TM.checkText(m.text, me, 'message');
    if (typeof m.subject === 'string' && m.subject) m.subject = TM.checkText(m.subject, me, 'message');
    if (m.card) { if (m.card.title) m.card.title = TM.checkText(m.card.title, me, 'message'); if (m.card.text) m.card.text = TM.checkText(m.card.text, me, 'message'); }
  });
  const origEdit = api['POST /api/edit'];
  api['POST /api/edit'] = async (req, res, me, url) => {
    const b = await body(req, 65536), m = msgById.get(str(b.id, 32));
    if (m && canSee(me, m.chan) && !m.deleted) {
      const r = msgRules();
      if (m.from === me.id && !isAdmin(me)) {
        if (r.edit === false) fail(403, 'Editing sent messages is turned off in this session.');
        if (r.editMinutes > 0 && now() - m.ts > r.editMinutes * 60000) fail(403, `Messages can only be edited within ${r.editMinutes} minutes of sending.`);
      }
      if (typeof b.text === 'string') b.text = TM.checkText(b.text, me, 'message');
      if (m.from === me.id && typeof b.text === 'string' && b.text !== m.text && held(m)) archiveHeld(m, 'edit', me);
    }
    return origEdit(req, res, me, url);
  };
  const origDel = api['POST /api/delete'];
  api['POST /api/delete'] = async (req, res, me, url) => {
    const b = await body(req, 256), m = msgById.get(str(b.id, 32));
    if (m && canSee(me, m.chan) && !m.deleted) {
      const r = msgRules();
      if (m.from === me.id && !isAdmin(me)) {
        if (r.delete === false) fail(403, 'Deleting sent messages is turned off in this session.');
        if (r.editMinutes > 0 && now() - m.ts > r.editMinutes * 60000) fail(403, `Messages can only be deleted within ${r.editMinutes} minutes of sending.`);
      }
      if (held(m)) archiveHeld(m, 'delete', me);
    }
    return origDel(req, res, me, url);
  };

  // archived teams are read-only: no notes, whiteboard, tasks, events, reactions, pins or votes either
  const RO = { 'POST /api/note': 300000, 'POST /api/board/stroke': 60000, 'POST /api/board/undo': 256, 'POST /api/board/clear': 256, 'POST /api/board/live': 20000, 'POST /api/todo': 4096, 'POST /api/event': 4096, 'POST /api/react': 256, 'POST /api/pin': 256, 'POST /api/poll/vote': 256 };
  for (const [key, limit] of Object.entries(RO)) {
    const orig = api[key]; if (!orig) continue;
    api[key] = async (req, res, me, url) => {
      const b = await body(req, limit), chan = b.chan ? str(b.chan, 64) : (msgById.get(str(b.id, 32)) || {}).chan, t = chan && TM.teamOfChan ? TM.teamOfChan(chan) : null;
      if (t && t.archived && canSee(me, chan)) fail(403, 'This team is archived, so it is read-only.');
      return orig(req, res, me, url);
    };
  }

  // ---------- calls: information barriers (the calls area enforces S.meetingRules: record, present, maxPeople, watermark) ----------
  hooks.callJoin.push((me, chan, call) => {
    if (barrierIn(me, chan) || [...call.parts].some((i) => TM.blockedPair(me.id, i))) fail(403, "You can't join this call because of an information barrier.");
  });

  // ---------- policies API (Manage › Policies, Teams, Settings) ----------
  api['GET /api/tm/admin/policies'] = async (req, res, me) => {
    needAdmin(me); const p = policy();
    json(res, 200, { ...p, brand: { ...p.brand, logo: p.brand.logo ? true : false }, messagingRules: msgRules(), meetingRules: meetRules(), owner: isOwner(me) });
  };
  const words = (v, max = 500) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map((w) => str(String(w), 60).trim().toLowerCase()).filter(Boolean).filter((w, i, a) => a.indexOf(w) === i).slice(0, max);
  api['POST /api/tm/admin/policies'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 400000), c = cfg(), changed = [];
    if (isObj(b.messagingRules)) { const r = b.messagingRules, o = msgRules(); for (const k of ['edit', 'delete', 'stickers', 'memes', 'gifs']) if (r[k] !== undefined) o[k] = !!r[k]; if (r.editMinutes !== undefined) o.editMinutes = Math.max(0, Math.min(Math.round(Number(r.editMinutes)) || 0, 525600)); S.messagingRules = o; changed.push('messaging rules'); }
    if (isObj(b.meetingRules)) {
      const r = b.meetingRules, o = meetRules();
      if (r.record !== undefined) o.record = ['everyone', 'organizers', 'nobody'].includes(r.record) ? r.record : 'everyone';
      if (r.present !== undefined) o.present = ['everyone', 'organizers'].includes(r.present) ? r.present : 'everyone';
      if (r.lobby !== undefined) o.lobby = ['everyone', 'members', 'invited', 'organizer'].includes(r.lobby) ? r.lobby : 'members';
      if (r.maxPeople !== undefined) o.maxPeople = Math.max(0, Math.min(Math.round(Number(r.maxPeople)) || 0, 1000));
      if (r.watermark !== undefined) o.watermark = !!r.watermark;
      S.meetingRules = o; changed.push('meeting rules');
    }
    if (isObj(b.badwords)) { const o = { ...policy().badwords }; if (b.badwords.on !== undefined) o.on = !!b.badwords.on; if (b.badwords.words !== undefined) o.words = words(b.badwords.words); if (b.badwords.action !== undefined) o.action = b.badwords.action === 'replace' ? 'replace' : 'block'; c.badwords = o; changed.push('bad-word filter'); }
    if (isObj(b.naming)) { const o = { ...policy().naming }; if (b.naming.prefix !== undefined) o.prefix = cleanText(b.naming.prefix, 20); if (b.naming.suffix !== undefined) o.suffix = cleanText(b.naming.suffix, 20); if (b.naming.blocked !== undefined) o.blocked = words(b.naming.blocked, 200); c.naming = o; changed.push('team naming'); }
    if (isObj(b.expiry)) { const o = { ...policy().expiry }; if (b.expiry.days !== undefined) o.days = Math.max(0, Math.min(Math.round(Number(b.expiry.days)) || 0, 3650)); if (b.expiry.warnDays !== undefined) o.warnDays = Math.max(1, Math.min(Math.round(Number(b.expiry.warnDays)) || 7, 90)); if (o.days && o.warnDays >= o.days) o.warnDays = Math.max(1, Math.floor(o.days / 2)); c.expiry = o; changed.push('team expiry'); }
    if (b.teamCreate !== undefined) { c.teamCreate = b.teamCreate === 'admins' ? 'admins' : 'everyone'; changed.push('who can create teams'); }
    if (isObj(b.barriers)) {
      const o = { ...policy().barriers }, x = b.barriers;
      if (x.on !== undefined) o.on = !!x.on;
      if (Array.isArray(x.segments)) o.segments = x.segments.slice(0, 50).filter(isObj).map((s) => ({ id: /^[a-z0-9]{4,16}$/.test(str(s.id, 16)) ? s.id : rid(4), name: cleanText(s.name, 40) || 'Segment', members: [...new Set((Array.isArray(s.members) ? s.members : []).filter((i) => typeof i === 'string' && userById(i)))].slice(0, 1000) }));
      if (Array.isArray(x.blocks)) { const ids = new Set(o.segments.map((s) => s.id)); o.blocks = x.blocks.filter((p) => Array.isArray(p) && p.length === 2 && ids.has(p[0]) && ids.has(p[1]) && p[0] !== p[1]).slice(0, 200).map((p) => [String(p[0]), String(p[1])]); }
      c.barriers = o; changed.push('information barriers');
      for (const u of Object.values(db.users)) if (!u.deleted) emitUser(u); // pickers update for everyone
    }
    if (Array.isArray(b.labels)) {
      const seen = new Set(); c.labels = b.labels.slice(0, 20).filter(isObj).map((l) => ({ id: /^[a-z0-9-]{2,24}$/.test(str(l.id, 24)) && !seen.has(l.id) ? l.id : rid(4), name: cleanText(l.name, 40) || 'Label', color: HEX.test(str(l.color, 7)) ? l.color : '#616161', level: [0, 1, 2].includes(Number(l.level)) ? Number(l.level) : 0, desc: cleanText(l.desc, 140) })).filter((l) => !seen.has(l.id) && seen.add(l.id));
      changed.push('sensitivity labels');
    }
    if (b.pinSkipsApproval !== undefined) { needOwner(me); c.pinSkipsApproval = !!b.pinSkipsApproval; changed.push('PIN sign-in'); }
    if (isObj(b.brand)) {
      needOwner(me); const o = { ...policy().brand };
      if (b.brand.logo !== undefined) { const v = b.brand.logo; if (v === '' || v === null) o.logo = ''; else { const s = str(v, 300001); if (s.length > 300000 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(s)) fail(400, 'Use a PNG, JPEG, GIF or WebP logo under 200 KB.'); o.logo = s; } }
      if (b.brand.color !== undefined) o.color = HEX.test(str(b.brand.color, 7)) ? b.brand.color : '';
      if (b.brand.welcome !== undefined) o.welcome = cleanText(b.brand.welcome, 500);
      c.brand = o; changed.push('branded lobby');
    }
    store.save(); emit('settings', ctx.clientSettings()); pushCfg();
    if (changed.length) audit(me, 'policy', changed.join(', '));
    json(res, 200, { ok: true });
  };

  // ---------- branded lobby (public: shown before sign-in) ----------
  function brandPublic() { const b = policy().brand; if (!b.logo && !b.color && !b.welcome) return null; return { color: b.color || '', welcome: b.welcome || '', logo: b.logo ? '/api/tm/brand/logo?v=' + sha(b.logo).slice(0, 10) : '' }; }
  TM.brandPublic = brandPublic;
  ctx.publicRoutes.add('GET /api/tm/brand/logo');
  api['GET /api/tm/brand/logo'] = async (req, res) => {
    if (!rate('logo:' + ipOf(req), 120, 60000)) fail(429, 'Slow down');
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(policy().brand.logo || ''); if (!m) { res.writeHead(404); return res.end(); }
    const buf = Buffer.from(m[2], 'base64'); res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }); res.end(buf);
  };

  // ---------- "Report a concern" + Reports inbox ----------
  const reports = () => coll('tmReports', () => []);
  const openReports = () => reports().filter((r) => r.status === 'open').length;
  const REASONS = ['harassment', 'spam', 'hate', 'violence', 'inappropriate', 'privacy', 'other'];
  api['POST /api/tm/report'] = async (req, res, me) => {
    const b = await body(req, 4096); if (!rate('report:' + me.id, 20, 3600000)) fail(429, 'You have sent many reports. Try again later.');
    const reason = REASONS.includes(b.reason) ? b.reason : 'other', note = cleanText(b.note, 500); let m = null, user = '';
    if (b.msg) { m = msgById.get(str(b.msg, 32)); if (!m || m.deleted || !canSee(me, m.chan)) fail(404, 'Message not found'); if (m.from === me.id) fail(400, "You can't report your own message."); user = m.from || ''; }
    else { const u = userById(str(b.user, 32)); if (!u || u.deleted || u.id === me.id) fail(404, 'No such person'); user = u.id; }
    const r = { id: rid(6), ts: now(), by: me.id, reason, note, status: 'open', user, msg: m ? m.id : null, chan: m ? m.chan : null, where: m ? chatName(m.chan) : '', snapshot: m ? { text: String(m.text || '').slice(0, 4000), files: (m.files || []).map((f) => f.name), card: m.card ? m.card.title || '' : '', ts: m.ts } : null };
    const list = reports(); list.push(r); if (list.length > 2000) list.splice(0, list.length - 2000); store.save();
    const who = userById(user)?.name || 'someone';
    for (const a of adminIds()) { const u = userById(a); activity(a, { type: 'report', from: me.id, chan: m && u && canSee(u, m.chan) ? m.chan : undefined, msg: m && u && canSee(u, m.chan) ? m.id : undefined, text: `Reported ${who}: ${reason}` }); }
    emit('tm_reports', { open: openReports() }, adminIds()); json(res, 200, { ok: true });
  };
  api['GET /api/tm/admin/reports'] = async (req, res, me, url) => {
    needAdmin(me); const all = url.searchParams.get('all') === '1';
    const out = reports().filter((r) => all || r.status === 'open').slice(-300).reverse().map((r) => ({ ...r, byName: userById(r.by)?.name || '?', userName: userById(r.user)?.name || '?', canOpen: !!(r.chan && canSee(me, r.chan) && msgById.has(r.msg)), msgGone: !!r.msg && (!msgById.has(r.msg) || msgById.get(r.msg).deleted) }));
    json(res, 200, { reports: out, open: openReports() });
  };
  // admin delete of any message (also in chats the admin can't open, e.g. a reported direct message); keeps legal-hold copies
  function adminDelete(m, me) {
    if (held(m)) archiveHeld(m, 'delete', me);
    const files = (m.files || []).map((f) => f.id);
    for (const k of ['text', 'files', 'poll', 'game', 'reactions', 'preview', 'editHistory', 'mentions', 'everyone', 'pinned', 'reply', 'fwd', 'expiresAt', 'system', 'card']) delete m[k];
    m.deleted = true; m.deletedBy = me.id; m.reactions = {}; gcFiles(files); store.save(); emit('update', msgOut(m), audience(m.chan));
  }
  api['POST /api/tm/admin/reports/act'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 1024), r = reports().find((x) => x.id === str(b.id, 16)); if (!r) fail(404, 'No such report');
    const action = str(b.action, 12);
    if (action === 'delete') { const m = msgById.get(r.msg); if (m && !m.deleted) { const author = userById(m.from); if (author && isOwner(author) && !isOwner(me)) fail(403, "Only the host can delete the host's messages."); adminDelete(m, me); } r.status = 'actioned'; r.outcome = 'message deleted'; }
    else if (action === 'dismiss') { r.status = 'dismissed'; r.outcome = 'dismissed'; }
    else if (action === 'resolve') { r.status = 'actioned'; r.outcome = cleanText(b.outcome, 60) || 'resolved'; }
    else if (action === 'reopen') { r.status = 'open'; r.outcome = ''; }
    else fail(400, 'Bad action');
    r.handledBy = me.id; r.handledAt = now(); store.save(); audit(me, 'report.' + action, `${userById(r.user)?.name || '?'} (${r.reason})${r.outcome ? ' — ' + r.outcome : ''}`);
    emit('tm_reports', { open: openReports() }, adminIds()); json(res, 200, { ok: true });
  };

  // ---------- legal hold + export ----------
  const holds = () => coll('tmHolds');
  const archive = () => coll('tmHoldArchive', () => []);
  const held = (m) => !!m && !!m.from && Object.prototype.hasOwnProperty.call(holds(), m.from);
  // core clean-up also removes the replies of a removed thread root, so a root with held replies is kept too
  let rootsKey = '', heldRoots = new Set();
  const rootsWithHeld = () => { const hk = Object.keys(holds()); if (!hk.length) return heldRoots = new Set(); const key = db.seq + ':' + hk.join(','); if (key !== rootsKey) { rootsKey = key; heldRoots = new Set(db.messages.filter((m) => m.thread && held(m)).map((m) => m.thread)); } return heldRoots; };
  hooks.keepMessage.push((m) => held(m) || (Object.keys(holds()).length > 0 && rootsWithHeld().has(m.id)));
  const holdDir = () => path.join(P.dir, 'hold');
  function archiveHeld(m, action, by) {
    const files = (m.files || []).map((f) => {
      let kept = false;
      if (action === 'delete') { try { fs.mkdirSync(holdDir(), { recursive: true }); const dst = path.join(holdDir(), f.id); if (!fs.existsSync(dst)) fs.copyFileSync(path.join(P.uploads, f.id), dst); kept = true; } catch {} }
      return { id: f.id, name: f.name, size: f.size, kept };
    });
    const list = archive(); list.push({ id: rid(6), uid: m.from, msg: m.id, chan: m.chan, where: chatName(m.chan), action, at: now(), by: by ? by.id : null, orig: { text: String(m.text || ''), ts: m.ts, edited: m.edited || 0, files, card: m.card || undefined, poll: m.poll ? m.poll.q : undefined } });
    if (list.length > 50000) list.splice(0, list.length - 50000); store.save();
  }
  TM.archiveHeld = archiveHeld; TM.held = held;
  api['GET /api/tm/admin/holds'] = async (req, res, me) => {
    needOwner(me); const cnt = {}; for (const m of db.messages) if (m.from && holds()[m.from]) cnt[m.from] = (cnt[m.from] || 0) + 1;
    const arch = {}; for (const a of archive()) arch[a.uid] = (arch[a.uid] || 0) + 1;
    json(res, 200, { holds: Object.entries(holds()).map(([uid, h]) => ({ uid, name: userById(uid)?.name || '?', ...h, messages: cnt[uid] || 0, archived: arch[uid] || 0 })) });
  };
  api['POST /api/tm/admin/hold'] = async (req, res, me) => {
    needOwner(me); const b = await body(req, 1024), u = userById(str(b.uid, 32)); if (!u) fail(404, 'No such person');
    if (b.on === false) { delete holds()[u.id]; audit(me, 'hold.off', u.name); } else { holds()[u.id] = { by: me.id, ts: now(), note: cleanText(b.note, 200) }; audit(me, 'hold.on', u.name + (b.note ? ' — ' + cleanText(b.note, 80) : '')); }
    store.save(); json(res, 200, { ok: true });
  };
  api['GET /api/tm/admin/hold/items'] = async (req, res, me, url) => {
    needOwner(me); const uid = str(url.searchParams.get('uid'), 32);
    json(res, 200, { items: archive().filter((a) => a.uid === uid).slice(-500).reverse().map((a) => ({ ...a, byName: userById(a.by)?.name || '' })) });
  };
  ctx.ticks.push({ every: 3600000, fn: () => { // held files that no archive entry needs any more
    try { const need = new Set(); for (const a of archive()) for (const f of a.orig.files || []) need.add(f.id); for (const f of fs.readdirSync(holdDir())) if (!need.has(f)) fs.unlinkSync(path.join(holdDir(), f)); } catch {}
  } });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  api['GET /api/tm/admin/export'] = async (req, res, me, url) => {
    needOwner(me); const u = userById(str(url.searchParams.get('uid'), 32)); if (!u) fail(404, 'No such person');
    const mine = db.messages.filter((m) => m.from === u.id);
    const rows = mine.map((m) => ({ id: m.id, chat: chatName(m.chan), chan: m.chan, ts: m.ts, time: new Date(m.ts).toISOString(), text: m.deleted ? '' : m.text || '', deleted: !!m.deleted, edited: m.edited ? new Date(m.edited).toISOString() : undefined, thread: m.thread || undefined, files: (m.files || []).map((f) => f.name), card: m.card ? m.card.title : undefined, poll: m.poll ? m.poll.q : undefined, editHistory: (m.editHistory || []).map((e) => ({ text: e.text, time: new Date(e.ts).toISOString() })) }));
    const heldItems = archive().filter((a) => a.uid === u.id);
    const html = `<!doctype html><meta charset="utf-8"><title>Messages by ${esc(u.name)}</title><style>body{font:14px system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}h2{margin-top:28px}.m{border-bottom:1px solid #ddd;padding:8px 0}.t{color:#666;font-size:12px}.d{color:#a00}</style>`
      + `<h1>Messages by ${esc(u.name)}</h1><p>Exported from ${esc(S.name)} on ${esc(new Date().toISOString())} · ${rows.length} messages · ${heldItems.length} held originals</p>`
      + Object.entries(rows.reduce((a, r) => { (a[r.chat] ||= []).push(r); return a; }, {})).map(([chat, list]) => `<h2>${esc(chat)}</h2>` + list.map((r) => `<div class="m"><div class="t">${esc(r.time)}${r.edited ? ' · edited' : ''}${r.deleted ? ' · <span class="d">deleted</span>' : ''}</div><div>${esc(r.text).replace(/\n/g, '<br>')}</div>${r.files.length ? `<div class="t">Files: ${r.files.map(esc).join(', ')}</div>` : ''}</div>`).join('')).join('')
      + (heldItems.length ? '<h2>Held originals (edited or deleted while on hold)</h2>' + heldItems.map((a) => `<div class="m"><div class="t">${esc(new Date(a.at).toISOString())} · ${esc(a.action)} · ${esc(a.where)}</div><div>${esc(a.orig.text).replace(/\n/g, '<br>')}</div></div>`).join('') : '');
    const entries = [{ name: 'messages.json', data: Buffer.from(JSON.stringify({ person: { id: u.id, name: u.name }, session: S.name, exportedAt: new Date().toISOString(), messages: rows, held: heldItems }, null, 1)) }, { name: 'messages.html', data: Buffer.from(html) }];
    const seen = new Set();
    for (const m of mine) for (const f of m.files || []) { if (seen.has(f.id) || !db.files[f.id]) continue; seen.add(f.id); const p = path.join(P.uploads, f.id); if (fs.existsSync(p)) entries.push({ name: `files/${f.id}-${String(f.name).replace(/[\\/\0-\x1f]/g, '_').slice(0, 100)}`, file: p }); }
    for (const a of heldItems) for (const f of a.orig.files || []) { if (!f.kept || seen.has(f.id)) continue; seen.add(f.id); const p = path.join(holdDir(), f.id); if (fs.existsSync(p)) entries.push({ name: `held-files/${f.id}-${String(f.name).replace(/[\\/\0-\x1f]/g, '_').slice(0, 100)}`, file: p }); }
    audit(me, 'export', `${u.name}: ${rows.length} messages, ${seen.size} files`);
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="lanchat-export-${u.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.zip"`, 'Cache-Control': 'no-store' });
    try { await writeZip(entries, res); res.end(); } catch (e) { res.destroy(e); }
  };

  // ---------- usage reports + call quality ----------
  const usage = () => coll('tmUsage');
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const markActive = (uid, msg) => { if (!uid) return; const u = usage(), k = dayKey(now()), d = (u[k] ||= { a: [], m: 0 }); if (!d.a.includes(uid)) d.a.push(uid); if (msg) d.m++; const keys = Object.keys(u); if (keys.length > 800) for (const x of keys.sort().slice(0, keys.length - 800)) delete u[x]; };
  hooks.initExtra.push((u) => { markActive(u.id); return {}; });
  hooks.afterMessage.push((m) => { if (m.from && !m.system && !(userById(m.from) || {}).bot) markActive(m.from, true); });
  const range = (q) => { const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30; const start = new Date(); start.setHours(0, 0, 0, 0); return { days, from: start.getTime() - (days - 1) * DAY }; };
  const callLog = () => (Array.isArray(db.callLog) ? db.callLog : []);
  api['GET /api/tm/admin/usage'] = async (req, res, me, url) => {
    needAdmin(me); const { days, from } = range(url.searchParams), idx = (ts) => Math.floor((ts - from) / DAY);
    const active = Array(days).fill(0), messages = Array(days).fill(0), calls = Array(days).fill(0), minutes = Array(days).fill(0), files = Array(days).fill(0), bytes = Array(days).fill(0), counted = Array(days).fill(0), people = Array.from({ length: days }, () => new Set());
    for (const m of db.messages) { if (m.ts < from || !m.from || m.system) continue; const i = idx(m.ts); if (i >= 0 && i < days) { counted[i]++; people[i].add(m.from); } }
    for (let i = 0; i < days; i++) { const d = usage()[dayKey(from + i * DAY + 3600000)]; if (d) for (const x of d.a) people[i].add(x); messages[i] = Math.max(counted[i], d ? d.m : 0); active[i] = people[i].size; }
    for (const c of callLog()) { if (!c.start || c.start < from) continue; const i = idx(c.start); if (i >= 0 && i < days) { calls[i]++; minutes[i] += Math.max(0, Math.round(((c.end || c.start) - c.start) / 60000)); } }
    for (const f of Object.values(db.files)) { if (!f.ts || f.ts < from) continue; const i = idx(f.ts); if (i >= 0 && i < days) { files[i]++; bytes[i] += f.size || 0; } }
    let storage = 0; for (const f of Object.values(db.files)) storage += f.size || 0;
    const out = { days, from, active, messages, calls, minutes, files, bytes, storage, people: Object.values(db.users).filter((u) => !u.deleted && !u.bot).length, hasCalls: Array.isArray(db.callLog) };
    if (url.searchParams.get('csv') === '1') {
      const lines = [['date', 'active people', 'messages', 'calls', 'call minutes', 'files', 'file bytes'], ...active.map((_, i) => [dayKey(from + i * DAY + 3600000), active[i], messages[i], calls[i], minutes[i], files[i], bytes[i]])];
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lanchat-usage-${days}d.csv"`, 'Cache-Control': 'no-store' }); return res.end(lines.map((r) => r.join(',')).join('\r\n'));
    }
    json(res, 200, out);
  };
  api['GET /api/tm/admin/callquality'] = async (req, res, me, url) => {
    needAdmin(me); const { days, from } = range(url.searchParams), list = callLog().filter((c) => c && c.start >= from);
    if (!list.length) return json(res, 200, { empty: true, days, from, hasLog: Array.isArray(db.callLog) });
    const perDay = Array(days).fill(0), stars = [0, 0, 0, 0, 0]; let mins = 0, parts = 0, rtt = 0, rttN = 0, loss = 0, lossN = 0, jit = 0, jitN = 0, poor = 0, ratings = 0, starSum = 0;
    const recent = [];
    for (const c of list) {
      const i = Math.floor((c.start - from) / DAY); if (i >= 0 && i < days) perDay[i]++;
      const dur = Math.max(0, ((c.end || c.start) - c.start) / 60000); mins += dur; parts += (c.parts || []).length;
      let bad = false; const q = isObj(c.quality) ? Object.values(c.quality) : [];
      for (const x of q) { if (Number.isFinite(x.rtt)) { rtt += x.rtt; rttN++; if (x.rtt > 400) bad = true; } if (Number.isFinite(x.loss)) { loss += x.loss; lossN++; if (x.loss > 5) bad = true; } /* loss is in % */ if (Number.isFinite(x.jitter)) { jit += x.jitter; jitN++; } }
      const rs = isObj(c.ratings) ? Object.values(c.ratings) : []; for (const r of rs) { const s = Math.round(Number(r.stars)); if (s >= 1 && s <= 5) { stars[s - 1]++; ratings++; starSum += s; if (s <= 2) bad = true; } }
      if (bad) poor++;
      recent.push({ start: c.start, minutes: Math.round(dur), where: chatName(c.chan), mode: c.mode || '', people: (c.parts || []).length, missed: (c.missed || []).length, stars: rs.length ? +(rs.reduce((a, r) => a + (Number(r.stars) || 0), 0) / rs.length).toFixed(1) : null, rtt: q.length ? Math.round(q.reduce((a, x) => a + (Number(x.rtt) || 0), 0) / q.length) : null, loss: q.length ? +(q.reduce((a, x) => a + (Number(x.loss) || 0), 0) / q.length).toFixed(1) : null, poor: bad });
    }
    json(res, 200, { days, from, calls: list.length, minutes: Math.round(mins), avgMinutes: +(mins / list.length).toFixed(1), avgPeople: +(parts / list.length).toFixed(1), ratings, avgStars: ratings ? +(starSum / ratings).toFixed(2) : null, stars, rtt: rttN ? Math.round(rtt / rttN) : null, loss: lossN ? +(loss / lossN).toFixed(1) : null, jitter: jitN ? Math.round(jit / jitN) : null, poor, perDay, recent: recent.sort((a, b) => b.start - a.start).slice(0, 25) });
  };

  // ---------- activity log (who / what / when), filter + CSV ----------
  api['GET /api/tm/admin/audit'] = async (req, res, me, url) => {
    needAdmin(me); const q = url.searchParams, by = str(q.get('by'), 32), action = str(q.get('action'), 60).toLowerCase(), fromTs = Number(q.get('from')) || 0, toTs = Number(q.get('to')) || Infinity;
    const log = coll('tmAudit', () => []); const list = (Array.isArray(log) ? log : []).filter((e) => (!by || e.by === by) && (!action || e.action.toLowerCase().includes(action)) && e.ts >= fromTs && e.ts < toTs);
    if (q.get('csv') === '1') {
      const cell = (s) => { const v = String(s ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="lanchat-activity-log.csv"', 'Cache-Control': 'no-store' });
      return res.end([['time', 'who', 'action', 'details'], ...list.map((e) => [new Date(e.ts).toISOString(), e.name, e.action, e.details])].map((r) => r.map(cell).join(',')).join('\r\n'));
    }
    json(res, 200, { entries: list.slice(-500).reverse(), total: list.length, actions: [...new Set((Array.isArray(log) ? log : []).map((e) => e.action))].sort() });
  };

  // ---------- bulk add (CSV) → one-time invite codes or pre-approved names ----------
  const invites = () => coll('tmInvites');
  const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newInviteCode = () => Array.from(crypto.randomBytes(10), (b) => CODE[b % CODE.length]).join('').replace(/(.{5})(.{5})/, '$1-$2');
  const normCode = (c) => str(c, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
  api['POST /api/tm/admin/bulk'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 300000); if (!Array.isArray(b.rows)) fail(400, 'No people to add');
    const mode = b.mode === 'names' ? 'names' : 'codes', days = Math.max(1, Math.min(Math.round(Number(b.days)) || 14, 90)), created = [], skipped = [], seen = new Set();
    for (const row of b.rows.slice(0, 500)) {
      if (!isObj(row)) continue; const name = cleanUserName(row.name);
      if (!name || ['everyone', 'here', 'channel', 'deleted user'].includes(name.toLowerCase())) { skipped.push({ name: str(row.name, 40), why: 'not a valid name' }); continue; }
      if (seen.has(name.toLowerCase())) { skipped.push({ name, why: 'listed twice' }); continue; } seen.add(name.toLowerCase());
      if (findByName(name)) { skipped.push({ name, why: 'already in this session' }); continue; }
      if (Object.values(invites()).some((x) => !x.used && x.exp > now() && x.name.toLowerCase() === name.toLowerCase())) { skipped.push({ name, why: 'already invited' }); continue; }
      const role = String(row.role || '').toLowerCase() === 'guest' ? 'guest' : 'member', rec = { id: rid(5), name, role, title: cleanText(row.title, 60), dept: cleanText(row.dept || row.department, 60), created: now(), by: me.id, exp: now() + days * DAY, used: 0, kind: mode === 'names' ? 'name' : 'code' };
      if (mode === 'names') { invites()['n:' + name.toLowerCase()] = rec; created.push({ name, role }); }
      else { const code = newInviteCode(); invites()[sha(normCode(code))] = rec; created.push({ name, role, code }); }
    }
    store.save(); audit(me, 'bulk.add', `${created.length} ${mode === 'names' ? 'pre-approved names' : 'invite codes'}, ${skipped.length} skipped`);
    json(res, 200, { created, skipped, mode, days });
  };
  api['GET /api/tm/admin/invites'] = async (req, res, me) => {
    needAdmin(me);
    json(res, 200, { invites: Object.entries(invites()).map(([k, x]) => ({ key: x.id, name: x.name, role: x.role, title: x.title, dept: x.dept, kind: x.kind, created: x.created, exp: x.exp, used: x.used, usedBy: x.usedBy || null, expired: x.exp < now() })).sort((a, c) => c.created - a.created).slice(0, 500) });
  };
  api['POST /api/tm/admin/invites/revoke'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 512), all = invites(); let n = 0;
    for (const [k, x] of Object.entries(all)) if (b.all ? !x.used : x.id === str(b.id, 16)) { delete all[k]; n++; }
    store.save(); audit(me, 'invite.revoke', `${n} invite(s)`); json(res, 200, { ok: true, removed: n });
  };
  // join with an invite (routes-auth.js): returns { name, role, consume(u) } or null; a wrong code fails
  TM.invite = (b, ip) => {
    const all = invites();
    if (b.invite) {
      if (!rate('invite:' + ip, 20, 600000)) fail(429, 'Too many tries. Wait a few minutes.');
      const key = sha(normCode(b.invite)), x = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
      if (!x || x.kind !== 'code' || x.used || x.exp < now()) fail(403, 'That invite code is not valid any more. Ask the host for a new one.');
      return { name: x.name, role: x.role, consume: (u) => use(x, u) };
    }
    const n = cleanUserName(b.name).toLowerCase(), x = n ? all['n:' + n] : null;
    if (x && x.kind === 'name' && !x.used && x.exp > now() && !findByName(n)) return { name: x.name, role: x.role, consume: (u) => use(x, u) };
    return null;
  };
  // job title and department go into the people area's profile (u.profile, docs/features-people.md)
  function use(x, u) { x.used = now(); x.usedBy = u.id; if (x.role === 'guest') u.role = 'guest'; if (x.title || x.dept) u.profile = { ...(isObj(u.profile) ? u.profile : {}), ...(x.title ? { jobTitle: x.title } : {}), ...(x.dept ? { department: x.dept } : {}) }; store.save(); }
  ctx.publicRoutes.add('GET /api/tm/invite');
  api['GET /api/tm/invite'] = async (req, res, me, url) => { // the sign-in page shows who an invite code is for
    if (!rate('invite:' + ipOf(req), 20, 600000)) fail(429, 'Too many tries. Wait a few minutes.');
    const all = invites(), key = sha(normCode(url.searchParams.get('code'))), x = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
    if (!x || x.kind !== 'code' || x.used || x.exp < now()) return json(res, 404, { error: 'That invite code is not valid any more.' });
    json(res, 200, { name: x.name, guest: x.role === 'guest' });
  };

  // ---------- guests: which session-wide channels a guest may see ----------
  api['GET /api/tm/admin/guestchans'] = async (req, res, me, url) => { needAdmin(me); const uid = str(url.searchParams.get('uid'), 32); json(res, 200, { chans: Object.entries(coll('tmGuestChans')).filter(([, l]) => l.includes(uid)).map(([c]) => c) }); };
  api['POST /api/tm/admin/guestchans'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 8192), u = userById(str(b.uid, 32)); if (!u || u.role !== 'guest') fail(400, 'Pick a guest.');
    const want = new Set((Array.isArray(b.chans) ? b.chans : []).map((c) => str(c, 64)).filter((c) => db.channels[c] && !db.channels[c].team && !db.channels[c].members));
    for (const c of want) if (chanLevel(c) >= 2) fail(403, 'Guests cannot be added to a highly confidential channel.');
    const before = new Set(Object.values(db.channels).filter((c) => canSee(u, c.id)).map((c) => c.id)), all = coll('tmGuestChans');
    for (const [c, list] of Object.entries(all)) if (!want.has(c) && list.includes(u.id)) all[c] = list.filter((i) => i !== u.id);
    for (const c of want) { all[c] ||= []; if (!all[c].includes(u.id)) all[c].push(u.id); }
    store.save();
    const after = new Set(Object.values(db.channels).filter((c) => canSee(u, c.id)).map((c) => c.id));
    for (const c of after) if (!before.has(c)) emit('channel', ctx.chanOut(db.channels[c]), [u.id]);
    for (const c of before) if (!after.has(c)) emit('channel_removed', { id: c }, [u.id]);
    audit(me, 'guest.channels', `${u.name}: ${[...want].map((c) => '#' + db.channels[c].name).join(', ') || 'none'}`); json(res, 200, { ok: true });
  };
  TM.roleChangedAdmin = null;

  // ---------- signed-in devices ----------
  const devices = () => coll('tmDevices');
  const uaLabel = (ua) => { const s = String(ua || ''); const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : ''; const app = /Electron|LANChat/.test(s) ? 'LANChat app' : /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : s ? 'Browser' : ''; return [app, os].filter(Boolean).join(' on ') || 'Unknown device'; };
  TM.deviceNew = (u, token, ip, ua) => { if (!u || !token) return; devices()[sha(token)] = { uid: u.id, first: now(), last: now(), ip: str(ip, 64), ua: uaLabel(ua) }; store.save(); };
  TM.deviceSeen = (u, token, ip, ua) => { const h = sha(token), d = devices()[h]; if (d) { d.last = now(); d.ip = str(ip, 64); if (ua) d.ua = uaLabel(ua); } else devices()[h] = { uid: u.id, first: (u.tokens.find((x) => x.h === h) || {}).created || now(), last: now(), ip: str(ip, 64), ua: uaLabel(ua) }; const tk = u.tokens.find((x) => x.h === h); if (tk) tk.last = now(); store.save(); };
  TM.deviceGone = (h) => { delete devices()[h]; store.save(); };
  const devList = (u, cur) => { const all = devices(); for (const [h, d] of Object.entries(all)) if (d.uid === u.id && !u.tokens.some((x) => x.h === h)) delete all[h]; return u.tokens.map((x) => { const d = all[x.h] || {}; return { id: x.h.slice(0, 16), created: d.first || x.created, last: d.last || x.last || x.created, dev: x.dev || '', ip: d.ip || '', ua: d.ua || 'Unknown device', current: x.h === cur }; }).sort((a, b) => b.last - a.last); };
  function signOut(u, id) { // id = 16-char prefix of the token hash, or null for every device
    const gone = u.tokens.filter((x) => !id || x.h.startsWith(id)); if (!gone.length) fail(404, 'No such device');
    u.tokens = u.tokens.filter((x) => !gone.includes(x)); for (const x of gone) delete devices()[x.h]; rebuildIndexes(); store.save();
    const set = clients.get(u.id); if (set) for (const r of [...set]) { try { r.end(); } catch {} } // devices reconnect; the signed-out one is refused
    return gone.length;
  }
  const curHash = (req) => sha(str(req.headers['x-token'], 200));
  api['GET /api/tm/me/devices'] = async (req, res, me) => json(res, 200, { devices: devList(me, curHash(req)) });
  api['POST /api/tm/me/devices/signout'] = async (req, res, me) => { const b = await body(req, 256), id = str(b.id, 16); if (!/^[a-f0-9]{16}$/.test(id)) fail(400, 'Pick a device'); json(res, 200, { ok: true, removed: signOut(me, id) }); };
  api['GET /api/tm/admin/devices'] = async (req, res, me, url) => { needAdmin(me); const u = userById(str(url.searchParams.get('uid'), 32)); if (!u || u.deleted) fail(404, 'No such person'); if (isOwner(u) && !isOwner(me)) fail(403, "Only the host can see the host's devices."); json(res, 200, { devices: devList(u, curHash(req)) }); };
  api['POST /api/tm/admin/devices/signout'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 512), u = userById(str(b.uid, 32)); if (!u || u.deleted) fail(404, 'No such person');
    if (isAdmin(u) && !isOwner(me) && u.id !== me.id) fail(403, 'Only the host can sign out an admin.'); if (isOwner(u) && !isOwner(me)) fail(403, 'Only the host can do that');
    const id = b.all ? null : str(b.id, 16); if (!b.all && !/^[a-f0-9]{16}$/.test(id)) fail(400, 'Pick a device');
    const n = signOut(u, id); audit(me, 'devices.signout', `${u.name}: ${b.all ? 'all devices' : '1 device'}`); json(res, 200, { ok: true, removed: n });
  };

  // ---------- PIN / password sign-in with an authenticator-app code (TOTP, RFC 6238) ----------
  const auth = () => coll('tmAuth');
  const scrypt = (secret, salt) => new Promise((resolve, reject) => crypto.scrypt(String(secret), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
  const hashSecret = async (secret) => { const salt = crypto.randomBytes(16); return { salt: salt.toString('hex'), hash: (await scrypt(secret, salt)).toString('hex') }; };
  const checkSecret = async (secret, rec) => { if (!rec || typeof secret !== 'string' || !secret || secret.length > 200) { await scrypt('x', Buffer.alloc(16)); return false; } const k = await scrypt(secret, Buffer.from(rec.salt, 'hex')); return crypto.timingSafeEqual(k, Buffer.from(rec.hash, 'hex')); };
  TM.hashSecret = hashSecret; TM.checkSecret = checkSecret;
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const b32enc = (buf) => { let bits = 0, val = 0, out = ''; for (const b of buf) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; };
  const b32dec = (s) => { let bits = 0, val = 0; const out = []; for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = ((val << 5) | B32.indexOf(ch)) & 0xffff; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
  const hotp = (key, counter) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac('sha1', key).update(c).digest(), o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
  const totpStep = (secret, code, last) => { const key = b32dec(secret), c = String(code || '').replace(/\D/g, ''), step = Math.floor(now() / 30000); if (c.length !== 6) return 0; let hit = 0; for (const d of [-1, 0, 1]) { const s = step + d; if (s > (last || 0) && safeEq(hotp(key, s), c)) hit = s; } return hit; };
  TM.hotp = (secret, counter) => hotp(b32dec(secret), counter); TM.b32enc = b32enc;
  const pinFails = (u, ip) => ctx.rateCount('pinfail:' + u.id, 600000) >= 5 || ctx.rateCount('pinfail-ip:' + ip, 600000) >= 20;
  TM.authNeeded = (u) => !!(auth()[u.id] && auth()[u.id].pin);
  // a sign-in by name on a new device for an account protected with a PIN: { ok, skipApproval } or { status, error, needPin, totp }
  TM.checkAuth = async (u, b, ip) => {
    const a = auth()[u.id], totp = !!(a.totp && a.totp.on);
    if (pinFails(u, ip)) return { status: 429, error: 'Too many wrong tries. Wait 10 minutes and try again.' };
    if (!b.pin) return { status: 401, needPin: true, totp, error: `${u.name} signs in with a ${a.pin.kind === 'password' ? 'password' : 'PIN'}${totp ? ' and an authenticator code' : ''}.` };
    if (!(await checkSecret(str(b.pin, 200), a.pin))) { ctx.rateAdd('pinfail:' + u.id); ctx.rateAdd('pinfail-ip:' + ip); return { status: 403, needPin: true, totp, error: 'Wrong PIN or password.' }; }
    if (totp) {
      if (!b.totp) return { status: 401, needPin: true, totp, error: 'Enter the 6-digit code from your authenticator app.' };
      const s = totpStep(a.totp.secret, b.totp, a.totp.last); if (!s) { ctx.rateAdd('pinfail:' + u.id); ctx.rateAdd('pinfail-ip:' + ip); return { status: 403, needPin: true, totp, error: 'That code is wrong or has expired.' }; }
      a.totp.last = s; store.save();
    }
    return { ok: true, skipApproval: !!policy().pinSkipsApproval };
  };
  const meAuth = (me) => auth()[me.id] || null;
  const verifyCurrent = async (me, b) => {
    const a = meAuth(me); if (!a || !a.pin) return;
    if (ctx.rateCount('pinfail:' + me.id, 600000) >= 5) fail(429, 'Too many wrong tries. Wait 10 minutes and try again.');
    if (!(await checkSecret(str(b.current, 200), a.pin))) { ctx.rateAdd('pinfail:' + me.id); fail(403, 'Your current PIN or password is wrong.'); }
  };
  api['GET /api/tm/me/security'] = async (req, res, me) => { const a = meAuth(me); json(res, 200, { pin: !!(a && a.pin), kind: a && a.pin ? a.pin.kind : '', totp: !!(a && a.totp && a.totp.on), pinSkipsApproval: !!policy().pinSkipsApproval }); };
  api['POST /api/tm/me/pin'] = async (req, res, me) => {
    const b = await body(req, 1024); if (me.bot) fail(400, 'Bots cannot sign in.'); await verifyCurrent(me, b);
    const v = str(b.pin, 200), kind = /^\d+$/.test(v) ? 'pin' : 'password';
    if (kind === 'pin' ? !/^\d{4,12}$/.test(v) : v.length < 8 || v.length > 128) fail(400, 'Use a PIN of 4–12 digits, or a password of at least 8 characters.');
    if (kind === 'pin' && /^(\d)\1+$|^(0123|1234|2345|3456|4567|5678|6789)/.test(v) && v.length < 6) fail(400, 'That PIN is too easy to guess. Pick another one.');
    const a = (auth()[me.id] ||= {}); a.pin = { kind, ...(await hashSecret(v)), set: now() }; store.save();
    json(res, 200, { ok: true, kind });
  };
  api['POST /api/tm/me/pin/remove'] = async (req, res, me) => { const b = await body(req, 1024); await verifyCurrent(me, b); delete auth()[me.id]; store.save(); json(res, 200, { ok: true }); };
  api['POST /api/tm/me/totp/start'] = async (req, res, me) => {
    const a = meAuth(me); if (!a || !a.pin) fail(400, 'Set a PIN or password first.'); if (!rate('totp:' + me.id, 10, 600000)) fail(429, 'Slow down');
    const secret = b32enc(crypto.randomBytes(20)); a.pending = { secret, ts: now() }; store.save();
    const label = encodeURIComponent(`${S.name}:${me.name}`), issuer = encodeURIComponent(`LANChat ${S.name}`);
    json(res, 200, { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
  };
  api['POST /api/tm/me/totp/confirm'] = async (req, res, me) => {
    const b = await body(req, 512), a = meAuth(me); if (!a || !a.pending || now() - a.pending.ts > 1800000) fail(400, 'Start again: scan a new code.');
    if (ctx.rateCount('pinfail:' + me.id, 600000) >= 5) fail(429, 'Too many wrong tries. Wait 10 minutes and try again.');
    const s = totpStep(a.pending.secret, b.code, 0); if (!s) { ctx.rateAdd('pinfail:' + me.id); fail(403, 'That code is wrong. Check the time on your phone and try again.'); }
    a.totp = { secret: a.pending.secret, on: true, last: s }; delete a.pending; store.save(); json(res, 200, { ok: true });
  };
  api['POST /api/tm/me/totp/off'] = async (req, res, me) => { const b = await body(req, 1024); await verifyCurrent(me, b); const a = meAuth(me); if (a) { delete a.totp; delete a.pending; } store.save(); json(res, 200, { ok: true }); };
  api['POST /api/tm/admin/pin/reset'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 256), u = userById(str(b.uid, 32)); if (!u) fail(404, 'No such person'); if (isOwner(u) && !isOwner(me)) fail(403, 'Only the host can do that');
    delete auth()[u.id]; store.save(); audit(me, 'pin.reset', u.name); activity(u.id, { type: 'system', from: me.id, text: 'An admin reset your sign-in PIN. Set a new one in Settings › Security.' }); json(res, 200, { ok: true });
  };
  hooks.userFields.push((u, viewer) => (viewer && (isAdmin(viewer) || viewer.id === u.id) && auth()[u.id] && auth()[u.id].pin ? { hasPin: true, has2fa: !!(auth()[u.id].totp && auth()[u.id].totp.on) } : {}));

  // ---------- team expiry: warn owners, then archive teams nobody used for N days ----------
  TM.expiryTick = (t0 = now()) => {
    const e = policy().expiry; if (!e.days || !TM.teams) return;
    for (const t of Object.values(TM.teams())) {
      if (t.archived) continue; const idle = t0 - (t.active || t.created), limit = e.days * DAY, warnAt = limit - e.warnDays * DAY;
      if (t.warned && idle < warnAt) { t.warned = 0; store.save(); TM.pushTeam(t); continue; }
      if (t.warned && idle >= limit && t0 - t.warned >= e.warnDays * DAY - 60000) { TM.archive(t, 'expired'); for (const o of t.owners) activity(o, { type: 'system', team: t.id, text: `${t.name} was archived because nobody used it for ${e.days} days. An owner can renew it.` }); audit(null, 'team.expired', t.name); }
      else if (!t.warned && idle >= warnAt) { t.warned = t0; store.save(); TM.pushTeam(t); for (const o of t.owners) activity(o, { type: 'system', team: t.id, chan: t.general, text: `${t.name} expires in ${e.warnDays} days unless an owner renews it.` }); }
    }
  };
  ctx.ticks.push({ every: 3600000, fn: (t0) => TM.expiryTick(t0) });

  // ---------- Manage › Teams (every team in the session) ----------
  api['GET /api/tm/admin/teams'] = async (req, res, me) => { needAdmin(me); json(res, 200, { teams: TM.adminTeams ? TM.adminTeams() : [] }); };
  api['POST /api/tm/admin/teams/act'] = async (req, res, me) => {
    needAdmin(me); const b = await body(req, 512), t = TM.teams && TM.teams()[str(b.id, 32)]; if (!t || !Object.prototype.hasOwnProperty.call(TM.teams(), str(b.id, 32))) fail(404, 'No such team');
    const a = str(b.action, 12);
    if (a === 'archive') TM.archive(t, 'admin'); else if (a === 'restore') TM.unarchive(t); else if (a === 'delete') TM.deleteTeam(t);
    else if (a === 'owner') TM.setOwner(t, userById(str(b.uid, 32)), me); else if (a === 'label') { const l = str(b.label, 32); if (l && !TM.labelById(l)) fail(400, 'Unknown label'); if (l && TM.labelById(l).level >= 2 && t.guests.length) fail(400, 'Remove the guests first: highly confidential teams cannot have guests.'); t.label = l; store.save(); TM.pushTeam(t); }
    else fail(400, 'Bad action');
    audit(me, 'team.' + a, t.name + (a === 'owner' ? ' → ' + (userById(str(b.uid, 32))?.name || '?') : a === 'label' ? ' → ' + (str(b.label, 32) || 'no label') : ''));
    json(res, 200, { ok: true });
  };
  void emitFor;
};
