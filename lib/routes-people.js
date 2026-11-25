'use strict';
// People area (docs/features-people.md): presence and status, profiles, contact groups, blocking, priority access, out of office.
//  - presence: manual Available / Busy / Do not disturb / Be right back / Appear away / Appear offline, optionally for a while;
//    automatic In a call / In a meeting / Presenting from ctx.calls and db.meetings; Out of office from a schedule
//  - status message with "clear after" and "show when people message me"; work location
//  - profile: job title, department, phone, email, office, pronouns, reports-to (org chart), time zone, a recording of your name
//  - prefs this area owns: blocked, priority (DND priority access), contactGroups, chatNotif, actTypes
// Data: fields on the user (presence, presenceUntil, statusText/Emoji/Until/Show, oof, workLoc, profile), prefs keys above,
// collections peopleVoice (name recordings) and peopleOofLog (automatic replies already sent today).
module.exports = (ctx) => {
  const { api, db, store, json, body, readBody, fail, str, rate, isObj, BAD_KEYS, rid, userById, validChan, emit, emitUser, meOut, online, dmPeer, hooks, coll } = ctx;
  const DAY = 86400000, MAX_AHEAD = 400 * DAY;
  const blocks = ctx.ppBlocks || ((u, id) => !!(u && id && u.prefs && Array.isArray(u.prefs.blocked) && u.prefs.blocked.includes(id)));
  const clean = (v, max) => str(v, max * 2).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const multi = (v, max) => str(v, max * 2).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
  const future = (v) => { const t = Math.round(Number(v)) || 0; return t > Date.now() ? Math.min(t, Date.now() + MAX_AHEAD) : 0; };
  const stamp = (v) => { const t = Math.round(Number(v)) || 0; return t > 0 && t < Date.now() + 2 * MAX_AHEAD ? t : 0; };
  const pushMe = (u) => { store.save(); emitUser(u); emit('me', meOut(u), [u.id]); };
  const limit = (me, key, n = 60) => { if (!rate(key + ':' + me.id, n, 60000)) fail(429, 'Slow down a little.'); };
  const oofActive = (u, now = Date.now()) => { const o = u && u.oof; return !!(o && o.on && (!o.from || now >= o.from) && (!o.to || now < o.to)); };
  ctx.oofActive = oofActive;

  // ---------- presence ----------
  // manual states; 'auto' = automatic (Available, Away when idle). Replaces the route in routes-auth.js (same body, more states).
  const STATES = ['auto', 'online', 'busy', 'dnd', 'brb', 'away', 'invisible'];
  api['POST /api/presence'] = async (req, res, me) => {
    const b = await body(req, 512); limit(me, 'presence', 120);
    if (b.state !== undefined) {
      if (!STATES.includes(b.state)) fail(400, 'Bad state');
      me.presence = b.state; me.presenceUntil = b.state === 'auto' ? 0 : future(b.until);
    }
    if (b.idle !== undefined) me.idle = !!b.idle;
    pushMe(me); json(res, 200, { ok: true });
  };
  // Teams' order: a manual Do not disturb wins, then Presenting, a manual Busy, In a meeting / In a call, Out of office, the rest
  hooks.presence.push((u, viewer) => {
    if (viewer && viewer.id !== u.id && blocks(u, viewer.id)) return 'offline'; // blocked people don't see your presence
    const auto = ctx.autoPresence.get(u.id), set = u.presence;
    if (set === 'dnd') return 'dnd';
    if (auto === 'presenting') return 'presenting';
    if (set === 'busy') return 'busy';
    if (auto) return auto;
    if (oofActive(u)) return 'oof';
    if (set === 'online' || set === 'brb' || set === 'away') return set;
    return u.idle ? 'away' : 'online';
  });

  // automatic In a call / In a meeting / Presenting, from the calls running now and from meetings on the calendar
  function occursNow(m, now) {
    const start = Number(m.start), end = Number(m.end); if (!(start > 0 && end > start) || m.allDay || m.cancelled || m.canceled) return false;
    // the meetings area's own calculator knows time zones and occurrences cancelled one at a time (m.skip)
    if (typeof ctx.meetingOccurrences === 'function') { try { return ctx.meetingOccurrences(m, now, now + 1).length > 0; } catch {} }
    const rep = m.repeat; if (!rep || !rep.freq) return now >= start && now < end;
    if (now < start || (rep.until && now > Number(rep.until) + DAY)) return false;
    const dur = end - start, s = new Date(start), every = Math.max(1, Math.round(Number(rep.interval)) || 1);
    for (let back = 0; back <= Math.ceil(dur / DAY); back++) { // occurrences that started today or a few days ago and are still running
      const d = new Date(now - back * DAY), occ = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.getHours(), s.getMinutes(), s.getSeconds()).getTime();
      if (occ < start || now < occ || now >= occ + dur) continue;
      const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / DAY);
      if (rep.freq === 'daily' && days % every === 0) return true;
      if (rep.freq === 'weekly') { const wd = Array.isArray(rep.days) && rep.days.length ? rep.days.map(Number) : [s.getDay()]; if (wd.includes(d.getDay()) && Math.floor((days + s.getDay()) / 7) % every === 0) return true; }
      if (rep.freq === 'monthly' && d.getDate() === s.getDate() && ((d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth()) % every === 0) return true;
    }
    return false;
  }
  function inMeetingNow(now) {
    const out = new Set(), all = db.meetings; if (!all || typeof all !== 'object') return out;
    for (const m of Array.isArray(all) ? all : Object.values(all)) {
      try {
        if (!m || !occursNow(m, now)) continue;
        const rsvp = isObj(m.rsvp) ? m.rsvp : {};
        for (const id of [m.organizer, ...(Array.isArray(m.invitees) ? m.invitees : [])]) if (typeof id === 'string' && rsvp[id] !== 'no') out.add(id);
      } catch {}
    }
    return out;
  }
  let meetingNow = new Set();
  function autoFor(uid) {
    if (ctx.calls) for (const c of ctx.calls.values()) if (c.parts && c.parts.has(uid)) return c.sharing === uid ? 'presenting' : c.meeting ? 'meeting' : 'call';
    return meetingNow.has(uid) ? 'meeting' : null;
  }
  function syncAuto(uid) { const want = online(uid) ? autoFor(uid) : null, cur = ctx.autoPresence.get(uid) || null; if (want !== cur) ctx.setAutoPresence(uid, want); }
  const syncAll = () => { for (const id of new Set([...ctx.clients.keys(), ...ctx.autoPresence.keys()])) syncAuto(id); };
  hooks.callEvent.push((type, chan, call, uid) => { if (uid) syncAuto(uid); if (call && call.parts) for (const id of call.parts) syncAuto(id); });
  const share0 = api['POST /api/call/share']; // a screen share starting or stopping changes "Presenting" right away
  if (share0) api['POST /api/call/share'] = async (req, res, me, url) => { const r = await share0(req, res, me, url); setImmediate(syncAll); return r; };
  ctx.ticks.push({ every: 3000, fn: syncAll });
  ctx.ticks.push({ every: 30000, fn: (now) => { meetingNow = inMeetingNow(now); syncAll(); } });

  // timed states run out; out of office starts and ends on its own schedule
  const oofWas = new Map(); let oofReady = false;
  ctx.ticks.push({ every: 10000, fn: (now) => {
    for (const u of Object.values(db.users)) {
      if (u.deleted) continue; let changed = false;
      if (u.presenceUntil && u.presenceUntil <= now) { u.presence = 'auto'; u.presenceUntil = 0; changed = true; }
      if (u.statusUntil && u.statusUntil <= now) { u.statusText = ''; u.statusEmoji = ''; u.statusUntil = 0; changed = true; }
      const act = oofActive(u, now); if (oofReady && (oofWas.get(u.id) || false) !== act) changed = true; oofWas.set(u.id, act);
      if (changed) pushMe(u);
    }
    oofReady = true;
  } });

  // ---------- status message, out of office, work location ----------
  api['POST /api/people/status'] = async (req, res, me) => {
    const b = await body(req, 4096); limit(me, 'ppstatus');
    if (b.text !== undefined) { me.statusText = clean(b.text, 280); if (!me.statusText && b.emoji === undefined) me.statusEmoji = ''; }
    if (b.emoji !== undefined) me.statusEmoji = clean(b.emoji, 16);
    if (b.show !== undefined) me.statusShow = !!b.show;
    if (b.until !== undefined || b.text !== undefined) me.statusUntil = me.statusText ? future(b.until) : 0;
    pushMe(me); json(res, 200, { ok: true, me: meOut(me) });
  };
  // the profile form in Settings changes statusText directly: a new text there has no "clear after"
  const profile0 = api['POST /api/profile'];
  if (profile0) api['POST /api/profile'] = async (req, res, me, url) => { const b = await body(req, 4096); if (b.statusText !== undefined && str(b.statusText, 80) !== me.statusText) me.statusUntil = 0; return profile0(req, res, me, url); };

  api['POST /api/people/oof'] = async (req, res, me) => {
    const b = await body(req, 8192); limit(me, 'ppoof');
    const o = { on: !!b.on, from: stamp(b.from), to: stamp(b.to), message: multi(b.message, 1000), reply: !!b.reply };
    if (o.from && o.to && o.to <= o.from) fail(400, 'The end has to be after the start.');
    if (o.on && o.to && o.to <= Date.now()) fail(400, 'Pick an end time in the future.');
    me.oof = o; pushMe(me); json(res, 200, { ok: true, me: meOut(me) });
  };
  api['POST /api/people/worklocation'] = async (req, res, me) => {
    const b = await body(req, 1024); limit(me, 'ppwork');
    const kind = str(b.kind, 10); if (!['office', 'remote', 'custom', ''].includes(kind)) fail(400, 'Bad location');
    const text = kind === 'custom' ? clean(b.text, 60) : ''; if (kind === 'custom' && !text) fail(400, 'Type where you are working from.');
    me.workLoc = kind ? { kind, text } : null; pushMe(me); json(res, 200, { ok: true, me: meOut(me) });
  };

  // ---------- profile ----------
  const validTz = (tz) => { if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tz)) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
  const TEXT = { jobTitle: 80, department: 80, office: 80, pronouns: 40 };
  api['POST /api/people/profile'] = async (req, res, me) => {
    const b = await body(req, 8192); limit(me, 'ppprofile');
    const p = { ...(isObj(me.profile) ? me.profile : {}) };
    for (const [k, max] of Object.entries(TEXT)) if (b[k] !== undefined) p[k] = clean(b[k], max);
    if (b.phone !== undefined) { const v = clean(b.phone, 32); if (v && !/^[0-9+()\-.\s/x#*]+$/i.test(v)) fail(400, 'Use digits, spaces and + - ( ) in the phone number.'); p.phone = v; }
    if (b.email !== undefined) { const v = clean(b.email, 120); if (v && !/^[^\s@<>"'()\\,;]+@[^\s@<>"'()\\,;]+\.[^\s@<>"'()\\,;]+$/.test(v)) fail(400, "That email address doesn't look right."); p.email = v; }
    if (b.manager !== undefined) {
      const id = str(b.manager, 32);
      if (id) {
        const m = userById(id); if (!m || m.deleted || m.removed) fail(400, 'Pick someone in this session.'); if (id === me.id) fail(400, "You can't report to yourself.");
        for (let x = m, n = 0; x && n < 60; n++) { const up = isObj(x.profile) ? x.profile.manager : ''; if (up === me.id) fail(400, `${m.name} already reports to you.`); x = up ? userById(up) : null; }
      }
      p.manager = id;
    }
    if (b.tz !== undefined) { const v = str(b.tz, 64); if (v && !validTz(v)) fail(400, 'Unknown time zone'); p.tz = v; }
    if (b.tzManual !== undefined) p.tzManual = !!b.tzManual;
    for (const k of Object.keys(p)) if (p[k] === '' || p[k] === false || p[k] === undefined) delete p[k];
    me.profile = p; pushMe(me); json(res, 200, { ok: true, me: meOut(me) });
  };

  // a short recording of your name (≤ 10 s); kept in the database (not in uploads, so file clean-up never removes it; it is in backups)
  const VOICE = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
  api['POST /api/people/voice'] = async (req, res, me) => {
    limit(me, 'ppvoice', 10);
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); if (!VOICE.has(type)) { req.resume(); fail(400, 'Record your name with the Record button.'); }
    const buf = await readBody(req, 400 * 1024); if (buf.length < 64) fail(400, 'That recording is empty.');
    const v = { type, data: buf.toString('base64'), ts: Date.now() }; coll('peopleVoice')[me.id] = v;
    pushMe(me); json(res, 200, { ok: true, voice: v.ts });
  };
  api['POST /api/people/voice/delete'] = async (req, res, me) => { limit(me, 'ppvoice', 10); delete coll('peopleVoice')[me.id]; pushMe(me); json(res, 200, { ok: true }); };
  api['GET /api/people/voice'] = async (req, res, me, url) => {
    const id = str(url.searchParams.get('id') || '', 32), u = userById(id), v = u && !u.deleted && coll('peopleVoice')[id];
    if (!v) return json(res, 404, { error: 'No recording' });
    const buf = Buffer.from(v.data, 'base64');
    res.writeHead(200, { 'Content-Type': VOICE.has(v.type) ? v.type : 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.end(buf);
  };

  // ---------- what other people see ----------
  hooks.userFields.push((u, viewer) => {
    if (u.deleted) return {};
    const o = {}, p = isObj(u.profile) ? u.profile : {}, self = !!viewer && viewer.id === u.id, hidden = !!viewer && !self && blocks(u, viewer.id);
    for (const k of ['jobTitle', 'department', 'office', 'pronouns', 'phone', 'email', 'manager', 'tz']) if (p[k]) o[k] = p[k];
    const v = coll('peopleVoice')[u.id]; if (v) o.voice = v.ts;
    if (u.workLoc && !hidden) o.workLoc = u.workLoc;
    if (hidden) { o.statusText = ''; o.statusEmoji = ''; }
    else {
      if (u.statusText && u.statusShow) o.statusShow = true;
      if (u.statusText && u.statusUntil) o.statusUntil = u.statusUntil;
      if (oofActive(u)) { o.oof = { to: u.oof.to || 0, message: u.oof.message || '' }; if (!online(u.id) && u.presence !== 'invisible') o.presence = 'oof'; }
    }
    if (self) { o.presenceSet = u.presence || 'auto'; o.presenceUntil = u.presenceUntil || 0; o.oofSettings = u.oof || null; o.tzManual = !!p.tzManual; o.statusShowSet = !!u.statusShow; }
    return o;
  });

  // ---------- prefs this area owns ----------
  const idList = (v, max, me) => { if (!Array.isArray(v)) fail(400, 'Bad list'); return [...new Set(v.filter((x) => typeof x === 'string' && x.length <= 32 && x !== me.id && !!userById(x)))].slice(0, max); };
  const ACT = new Set(['banner', 'feed', 'off']);
  function mine(b, me) {
    const out = {};
    if (b.blocked !== undefined) out.blocked = idList(b.blocked, 500, me);
    if (b.priority !== undefined) out.priority = idList(b.priority, 200, me);
    if (b.contactGroups !== undefined) {
      if (!Array.isArray(b.contactGroups)) fail(400, 'Bad contact groups');
      const ids = new Set(); out.contactGroups = [];
      for (const g of b.contactGroups.slice(0, 50)) {
        if (!isObj(g)) continue; const name = clean(g.name, 40); if (!name) continue;
        let id = str(g.id, 16); if (!/^[a-z0-9]{1,16}$/.test(id) || ids.has(id)) id = rid(4); ids.add(id);
        out.contactGroups.push({ id, name, members: [...new Set((Array.isArray(g.members) ? g.members : []).filter((x) => typeof x === 'string' && x.length <= 32 && !!userById(x)))].slice(0, 200) });
      }
    }
    if (b.chatNotif !== undefined) {
      if (!isObj(b.chatNotif)) fail(400, 'Bad chat settings'); out.chatNotif = {};
      for (const [c, v] of Object.entries(b.chatNotif).slice(0, 1000)) if (!BAD_KEYS.has(c) && (v === 'mentions' || v === 'off') && validChan(c)) out.chatNotif[c] = v;
    }
    if (b.actTypes !== undefined) {
      if (!isObj(b.actTypes)) fail(400, 'Bad activity settings'); out.actTypes = {};
      for (const [k, v] of Object.entries(b.actTypes).slice(0, 60)) if (!BAD_KEYS.has(k) && /^[a-zA-Z]{1,24}$/.test(k) && ACT.has(v)) out.actTypes[k] = v;
    }
    return out;
  }
  function applyMine(me, out) {
    const before = new Set(me.prefs.blocked || []);
    Object.assign(me.prefs, out);
    if (out.blocked) { // people who were just blocked or unblocked see the change in presence and status right away
      const now = new Set(out.blocked), touched = [...out.blocked.filter((i) => !before.has(i)), ...[...before].filter((i) => !now.has(i))];
      if (touched.length) ctx.emitFor('user', (v) => ctx.pub(me, v), touched);
    }
  }
  api['POST /api/people/prefs'] = async (req, res, me) => {
    const b = await body(req, 65536); limit(me, 'ppprefs', 120);
    applyMine(me, mine(b, me)); store.save(); emit('me', meOut(me), [me.id]); json(res, 200, { ok: true, prefs: me.prefs });
  };
  // LC.setPrefs({ contactGroups }) from other areas works too
  const prefs0 = api['POST /api/prefs'];
  if (prefs0) api['POST /api/prefs'] = async (req, res, me, url) => { const b = await body(req, 65536), out = mine(b, me); if (Object.keys(out).length) applyMine(me, out); return prefs0(req, res, me, url); };

  // ---------- blocking: no 1:1 messages, calls, reactions or typing from people you blocked ----------
  const dmOther = (chan, me) => { if (typeof chan !== 'string' || !chan.startsWith('dm:')) return null; const p = userById(dmPeer(chan, me)); return p && p.id !== me.id ? p : null; };
  hooks.beforeMessage.push((m, b, me) => {
    const peer = dmOther(m.chan, me); if (!peer) return;
    if (blocks(peer, me.id)) fail(403, `You can't send messages to ${peer.name}.`);
    if (blocks(me, peer.id)) fail(403, `You blocked ${peer.name}. Unblock them in Settings › Privacy to send messages.`);
  });
  hooks.callJoin.push((me, chan) => {
    const peer = dmOther(chan, me); if (!peer) return;
    if (blocks(peer, me.id)) fail(403, `You can't call ${peer.name}.`);
    if (blocks(me, peer.id)) fail(403, `You blocked ${peer.name}. Unblock them in Settings › Privacy to call.`);
  });
  const react0 = api['POST /api/react'];
  if (react0) api['POST /api/react'] = async (req, res, me, url) => { const b = await body(req, 256), m = ctx.msgById.get(str(b.id, 32)), peer = m && ctx.canSee(me, m.chan) && dmOther(m.chan, me); if (peer && blocks(peer, me.id)) fail(403, "You can't react to messages here."); return react0(req, res, me, url); };
  const typing0 = api['POST /api/typing'];
  if (typing0) api['POST /api/typing'] = async (req, res, me, url) => { const b = await body(req, 256), peer = dmOther(str(b.chan, 64), me); if (peer && blocks(peer, me.id)) return json(res, 200, { ok: true }); return typing0(req, res, me, url); };

  // ---------- out of office: one automatic reply per person per day in 1:1 chats ----------
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  hooks.afterMessage.push((m) => {
    if (!m.from || m.system || m.autoReply || m.deleted) return;
    const sender = userById(m.from), peer = sender && dmOther(m.chan, sender); if (!peer || peer.removed || peer.deleted) return;
    if (!oofActive(peer) || !peer.oof.reply || !peer.oof.message || blocks(peer, sender.id)) return;
    const log = coll('peopleOofLog'), rec = (log[peer.id] ||= {}), day = today(); if (rec[sender.id] === day) return; rec[sender.id] = day;
    setImmediate(() => {
      try {
        if (!userById(peer.id) || !ctx.validChan(m.chan)) return;
        const keep = peer.read[m.chan]; // an automatic reply must not mark the message as read for the person who is away
        ctx.addMessage({ chan: m.chan, from: peer.id, text: peer.oof.message.slice(0, 1000), autoReply: 'oof' });
        if (keep === undefined) delete peer.read[m.chan]; else peer.read[m.chan] = keep; store.save();
      } catch (e) { console.error('out of office reply:', e.message); }
    });
  });

  // ---------- housekeeping ----------
  ctx.ticks.push({ every: 3600000, fn: () => {
    const voice = coll('peopleVoice'), log = coll('peopleOofLog'), day = today();
    for (const id of Object.keys(voice)) { const u = userById(id); if (!u || u.deleted) delete voice[id]; }
    for (const [id, rec] of Object.entries(log)) { for (const [k, v] of Object.entries(rec)) if (v !== day) delete rec[k]; if (!Object.keys(rec).length || !userById(id)) delete log[id]; }
    store.save();
  } });
};
