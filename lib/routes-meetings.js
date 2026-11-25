'use strict';
// Meetings area (docs/EXTENDING.md "Meetings"; sections 18, 21 and 23 of the Teams list).
//  - Scheduling: db.meetings (repeats, invitees, RSVP), a meeting chat (channel kind 'meeting') or a channel meeting,
//    link #meet=<id>, a 12-digit meeting ID + passcode, templates, reminders (15 min before + "starting now" ring).
//  - Joining: lobby enforced in hooks.callJoin (403 { lobby: true }), admit / deny, guest join by link (the host still
//    approves the person; the approval prompt says which meeting), call.meeting + call.roles on meeting calls.
//  - Engagement: Q&A, agenda, breakout rooms (channels kind 'breakout'), attendance report, recap.
//  - Webinars: attendees can only watch (enforced on media / share), registration with approval, presenters vs audience.
// Data I own: db.meetings, db.meetingData (per meeting: qa, agenda, rooms, att, regs), db.meetingTemplates.
const crypto = require('crypto');

module.exports = (ctx) => {
  const { api, db, S, store, json, body, fail, rid, str, rate, isObj, userById, isAdmin, canSee, audience, emit, emitFor, chanOut, sysMsg, addMessage, activity, online, chanMsgs, msgOut } = ctx;
  const DAY = 86400000, MIN = 60000;
  const M = () => ctx.coll('meetings'), X = () => ctx.coll('meetingData'), T = () => ctx.coll('meetingTemplates');
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const ID = /^[a-f0-9]{16}$/;
  const LOBBY = ['everyone', 'members', 'invited', 'organizer'], PRESENT = ['everyone', 'specific', 'organizer'], CHAT = ['on', 'off', 'during'];
  const DEFAULT_OPTS = () => ({ present: 'everyone', viewOnly: false, chat: 'on', qa: true, sounds: true, record: true, registration: { on: false, email: true, notes: false, question: '', approve: true }, interp: [] });
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : NaN; };
  const okUser = (id) => { const u = userById(id); return !!u && !u.removed && !u.deleted; };
  const uidList = (v, max) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.length <= 32 && okUser(x)))].slice(0, max) : []);
  const nameOf = (id) => (userById(id) || {}).name || 'Someone';
  const rules = () => (isObj(S.meetingRules) ? S.meetingRules : {});

  // ---------- records ----------
  function norm(m) { // old / partial records keep loading
    m.invitees = Array.isArray(m.invitees) ? m.invitees : []; m.optional = Array.isArray(m.optional) ? m.optional : []; m.presenters = Array.isArray(m.presenters) ? m.presenters : [];
    m.rsvp = isObj(m.rsvp) ? m.rsvp : {}; m.options = { ...DEFAULT_OPTS(), ...(isObj(m.options) ? m.options : {}) }; m.sent = isObj(m.sent) ? m.sent : {};
    if (!m.tz) m.tz = 'UTC'; if (!m.title) m.title = 'Meeting'; if (m.end <= m.start || !m.end) m.end = (m.start || 0) + 30 * MIN;
    return m;
  }
  const all = () => Object.values(M()).filter((m) => m && typeof m === 'object' && m.id).map(norm);
  const getM = (v) => { const id = str(v, 32); if (!ID.test(id) || !has(M(), id)) fail(404, 'No such meeting.'); return norm(M()[id]); };
  const xOf = (id) => { const a = X(); if (!has(a, id) || !isObj(a[id])) a[id] = {}; const x = a[id]; x.qa ||= []; x.agenda ||= []; x.att ||= {}; x.regs ||= []; return x; };
  const newId = () => { let id; do id = rid(8); while (has(M(), id)); return id; };
  const newCode = () => { const used = new Set(all().map((m) => m.code)); let c; do c = String(100000000000 + (crypto.randomBytes(6).readUIntBE(0, 6) % 900000000000)); while (used.has(c)); return c; };
  const PASS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newPass = () => Array.from(crypto.randomBytes(6), (b) => PASS[b % PASS.length]).join('');
  const xGet = (id) => { const x = X()[id]; return isObj(x) ? x : null; }; // read-only: no record is created

  // ---------- who is who ----------
  const isOrg = (uid, m) => m.organizer === uid;
  const invited = (uid, m) => isOrg(uid, m) || m.invitees.includes(uid) || m.presenters.includes(uid);
  const lobbyOf = (m) => (LOBBY.includes(m.lobby) ? m.lobby : LOBBY.includes(rules().lobby) ? rules().lobby : 'members');
  const presentMode = (m) => (m.options.present === 'everyone' && rules().present === 'organizers' ? 'specific' : m.options.present);
  const roleFor = (m, uid) => {
    if (isOrg(uid, m)) return 'organizer';
    if (m.presenters.includes(uid)) return 'presenter';
    return presentMode(m) === 'everyone' && !m.options.viewOnly ? 'presenter' : 'attendee';
  };
  const lobbies = new Map();   // meetingId -> { waiting: Map(uid -> ts), admitted: Set(uid) }
  const lob = (id) => { let l = lobbies.get(id); if (!l) lobbies.set(id, l = { waiting: new Map(), admitted: new Set() }); return l; };
  function bypass(u, m) {
    if (!u) return false; if (isOrg(u.id, m)) return true; const l = lobbies.get(m.id); if (l && l.admitted.has(u.id)) return true;
    const p = lobbyOf(m);
    if (p === 'everyone') return true;
    if (p === 'members') return u.role !== 'guest';
    if (p === 'invited') return invited(u.id, m);
    return false; // 'organizer': only the organizer gets in without waiting
  }
  const callOf = (m) => { const c = ctx.calls && ctx.calls.get(m.chan); return c && c.meeting === m.id ? c : null; };
  const liveOf = (m) => { const c = callOf(m); return c ? { participants: c.parts.size, started: c.started } : null; };
  const canAdmit = (uid, m) => { if (isOrg(uid, m) || m.presenters.includes(uid)) return true; const c = callOf(m); return !!(c && c.parts.has(uid) && ['organizer', 'presenter'].includes((c.roles || {})[uid] || roleFor(m, uid))); };
  const admitters = (m) => { const ids = new Set([m.organizer, ...m.presenters]); const c = callOf(m); if (c) for (const p of c.parts) if (canAdmit(p, m)) ids.add(p); return [...ids]; };
  const canView = (u, m) => !!u && (invited(u.id, m) || has(m.rsvp, u.id) || canSee(u, m.chan));
  const chanOfM = (m) => db.channels[m.chan] || null;

  // ---------- time: occurrences of a (repeating) meeting, in the meeting's time zone ----------
  const fmtCache = new Map(), WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function partsIn(ts, tz) {
    let f = fmtCache.get(tz);
    if (f === undefined) { try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }); } catch { f = null; } fmtCache.set(tz, f); }
    if (!f) { const d = new Date(ts); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() }; }
    const o = {}; for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD.indexOf(o.weekday) };
  }
  const offsetAt = (ts, tz) => { const p = partsIn(ts, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - (ts - (((ts % 1000) + 1000) % 1000)); };
  const zoned = (y, mo, d, h, mi, tz) => { const g = Date.UTC(y, mo - 1, d, h, mi); const t1 = g - offsetAt(g, tz); return g - offsetAt(t1, tz); };
  const validTz = (v) => { const tz = str(v, 64); if (!tz) return 'UTC'; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; } };
  function occurrences(m, from, to, max = 500) {
    const dur = m.end - m.start, out = [], skip = new Set(Array.isArray(m.skip) ? m.skip : []);
    const push = (s) => { if (s + dur > from && s < to && s >= m.start && !skip.has(s)) out.push(s); };
    const r = m.repeat;
    if (!r || !['daily', 'weekly', 'monthly'].includes(r.freq)) { push(m.start); return out; }
    const tz = m.tz || 'UTC', p = partsIn(m.start, tz), k = Math.max(1, r.interval || 1), until = r.until || Infinity, end = Math.min(to, until + 1);
    if (r.freq === 'daily') {
      const i0 = Math.max(0, Math.floor((from - m.start - dur) / (k * DAY)) - 1) * k;
      for (let i = i0, n = 0; n < 5000 && out.length < max; i += k, n++) { const s = zoned(p.y, p.mo, p.d + i, p.h, p.mi, tz); if (s >= end) break; push(s); }
    } else if (r.freq === 'weekly') {
      const days = (r.days && r.days.length ? r.days : [p.wd]).slice().sort((a, b) => a - b), w0 = Math.max(0, Math.floor((from - m.start - dur) / (k * 7 * DAY)) - 1) * k;
      outer: for (let w = w0, n = 0; n < 2000 && out.length < max; w += k, n++) {
        for (const wd of days) { const s = zoned(p.y, p.mo, p.d - p.wd + wd + w * 7, p.h, p.mi, tz); if (s >= end) break outer; push(s); }
      }
    } else {
      const i0 = Math.max(0, Math.floor((from - m.start - dur) / (k * 31 * DAY)) - 1) * k;
      for (let i = i0, n = 0; n < 1000 && out.length < max; i += k, n++) {
        const mo = p.mo + i, last = new Date(Date.UTC(p.y, mo, 0)).getUTCDate(); if (p.d > last) continue; // e.g. "every 31st" skips short months
        const s = zoned(p.y, mo, p.d, p.h, p.mi, tz); if (s >= end) break; push(s);
      }
    }
    return out;
  }
  ctx.meetingOccurrences = (m, from, to) => occurrences(norm(m), from, to);
  const nextOcc = (m, now = Date.now()) => { const l = occurrences(m, now, now + 400 * DAY, 1); return l.length ? l[0] : null; };
  // the occurrence a call at time t belongs to (its start), or the call's own start for unscheduled use of the chat
  const occAt = (m, t) => { const dur = m.end - m.start; const l = occurrences(m, t - dur - 60 * MIN, t + 30 * MIN, 50); let best = null; for (const s of l) if (best === null || Math.abs(s - t) < Math.abs(best - t)) best = s; return best !== null && t >= best - 30 * MIN && t <= best + dur + 60 * MIN ? best : null; };

  // ---------- validation ----------
  function normRepeat(r, start) {
    if (!isObj(r) || !['daily', 'weekly', 'monthly'].includes(r.freq)) return null;
    const interval = Math.max(1, Math.min(99, num(r.interval) || 1)); let until = num(r.until);
    until = until > start ? Math.min(until, start + 3 * 366 * DAY) : 0;
    const days = r.freq === 'weekly' ? [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : [];
    return { freq: r.freq, interval, until, days };
  }
  function normOptions(o, prev) {
    const p = { ...DEFAULT_OPTS(), ...(prev || {}) }; if (!isObj(o)) return p;
    if (o.present !== undefined) p.present = PRESENT.includes(o.present) ? o.present : 'everyone';
    if (o.chat !== undefined) p.chat = CHAT.includes(o.chat) ? o.chat : 'on';
    for (const k of ['viewOnly', 'qa', 'sounds', 'record']) if (o[k] !== undefined) p[k] = !!o[k];
    if (o.registration !== undefined) { const r = isObj(o.registration) ? o.registration : {}; p.registration = { on: !!r.on, email: r.email !== false, notes: !!r.notes, question: str(r.question, 200).trim(), approve: r.approve !== false }; }
    if (o.interp !== undefined) p.interp = (Array.isArray(o.interp) ? o.interp : []).filter((i) => isObj(i) && okUser(str(i.uid, 32)) && str(i.lang, 30).trim()).slice(0, 10).map((i) => ({ uid: i.uid, lang: str(i.lang, 30).trim() }));
    return p;
  }
  function applyFields(m, b, creating) {
    const now = Date.now();
    if (creating || b.title !== undefined) { const t = str(b.title, 120).replace(/\s+/g, ' ').trim(); if (!t) fail(400, 'Give the meeting a title.'); m.title = t; }
    if (creating || b.start !== undefined || b.end !== undefined) {
      let s = num(b.start !== undefined ? b.start : m.start), e = num(b.end !== undefined ? b.end : m.end);
      if (b.instant) { s = now; e = now + 60 * MIN; }
      if (!(s > 0) || !(e > 0)) fail(400, 'Pick a start and an end time.');
      s -= s % MIN; e -= e % MIN; // whole minutes, so every occurrence of a series lines up with the first one
      if (e <= s) fail(400, 'The meeting has to end after it starts.');
      if (e - s > 14 * DAY) fail(400, 'A meeting can last up to 14 days.');
      if (s < now - 366 * DAY || s > now + 5 * 366 * DAY) fail(400, 'Pick a date within the next few years.');
      m.start = s; m.end = e;
    }
    if (creating || b.allDay !== undefined) m.allDay = !!b.allDay;
    if (creating || b.tz !== undefined) m.tz = validTz(b.tz);
    if (creating || b.repeat !== undefined) m.repeat = normRepeat(b.repeat, m.start);
    if (creating || b.invitees !== undefined) m.invitees = uidList(b.invitees, 200).filter((x) => x !== m.organizer);
    if (creating || b.presenters !== undefined) m.presenters = uidList(b.presenters, 50).filter((x) => x !== m.organizer);
    for (const p of m.presenters) if (!m.invitees.includes(p)) m.invitees.push(p);
    if (creating || b.optional !== undefined || b.invitees !== undefined) m.optional = uidList(b.optional !== undefined ? b.optional : m.optional, 200).filter((x) => m.invitees.includes(x) && !m.presenters.includes(x));
    if (creating || b.location !== undefined) m.location = str(b.location, 120).trim();
    if (creating || b.details !== undefined) m.details = str(b.details, 4000);
    if (creating || b.lobby !== undefined) m.lobby = LOBBY.includes(b.lobby) ? b.lobby : '';
    if (creating || b.options !== undefined) m.options = normOptions(b.options, m.options);
  }

  // ---------- what people see ----------
  function counts(m) { const c = { yes: 0, maybe: 0, no: 0, none: 0 }; for (const u of m.invitees) { const r = m.rsvp[u]; if (r && c[r] !== undefined) c[r]++; else c.none++; } return c; }
  function view(m, v) {
    const c = chanOfM(m), org = !!v && isOrg(v.id, m), see = canView(v, m);
    const o = { id: m.id, title: m.title, organizer: m.organizer, start: m.start, end: m.end, allDay: !!m.allDay, tz: m.tz, repeat: m.repeat || null, chan: m.chan, cancelled: m.cancelled || 0, adhoc: !!m.adhoc, webinar: !!m.options.viewOnly,
      isOrganizer: org, invited: !!v && invited(v.id, m), member: !!v && canSee(v, m.chan), lobby: lobbyOf(m), bypass: bypass(v, m), live: liveOf(m), myRsvp: (v && m.rsvp[v.id]) || '', role: v ? roleFor(m, v.id) : 'attendee',
      next: m.cancelled ? null : nextOcc(m), chatKind: c ? c.kind || '' : 'gone', registration: m.options.registration.on ? { on: true, mine: v ? regOut(((xGet(m.id) || {}).regs || []).find((r) => r.uid === v.id), true) : null } : null };
    if (!see) return o; // someone with the link: enough for the pre-join screen
    Object.assign(o, { location: m.location || '', details: m.details || '', invitees: m.invitees, optional: m.optional, presenters: m.presenters, code: m.code, passcode: m.passcode, options: m.options, skip: m.skip || [], created: m.created, counts: counts(m), sessions: sessionsOut(m) });
    if (org) o.rsvp = m.rsvp;
    return o;
  }
  const occOut = (m, s, v) => ({ id: m.id, occurrence: s, start: s, end: s + (m.end - m.start), title: m.title, organizer: m.organizer, chan: m.chan, rsvp: m.rsvp[v.id] || '', allDay: !!m.allDay, location: m.location || '', isOrganizer: isOrg(v.id, m), webinar: !!m.options.viewOnly, repeat: !!m.repeat, online: true, live: !!callOf(m) });
  const watchers = (m) => [...new Set([m.organizer, ...m.invitees, ...m.presenters, ...Object.keys(m.rsvp), ...(chanOfM(m) && chanOfM(m).kind === 'meeting' ? audience(m.chan) || [] : [])])];
  function emitMeeting(m, extra = []) { const ids = [...new Set([...watchers(m), ...extra])]; emitFor('mt_meeting', (v) => (v && canView(v, m) ? { id: m.id, meeting: view(m, v) } : { id: m.id, gone: true }), ids); }

  // ---------- the meeting chat ----------
  const chatMembers = (m) => [...new Set([m.organizer, ...m.invitees, ...m.presenters])].filter(okUser);
  function makeChat(m) {
    const id = 'mt-' + rid(5), c = { id, name: m.title.slice(0, 60), topic: '', created: Date.now(), by: m.organizer, members: chatMembers(m), kind: 'meeting', meeting: m.id };
    db.channels[id] = c; emit('channel', chanOut(c), c.members); return id;
  }
  function ensureChat(m) { // the chat was deleted: a meeting with its own chat gets a fresh one
    if (chanOfM(m)) return chanOfM(m); if (!m.ownChat) fail(404, 'The channel of this meeting was deleted.');
    m.chan = makeChat(m); store.save(); return chanOfM(m);
  }
  function addToChat(m, uid) {
    const c = chanOfM(m); if (!c || c.kind !== 'meeting' || !c.members || c.members.includes(uid)) return;
    c.members.push(uid); store.save(); emit('channel', chanOut(c), c.members);
  }
  function syncChat(m, removed, rename) {
    const c = chanOfM(m); if (!c || c.kind !== 'meeting' || !c.members) return;
    const want = new Set([...c.members.filter((x) => !removed.includes(x)), ...chatMembers(m)]), gone = c.members.filter((x) => !want.has(x));
    c.members = [...want]; if (rename) c.name = m.title.slice(0, 60);
    if (gone.length) emit('channel_removed', { id: c.id }, gone); emit('channel', chanOut(c), c.members);
  }
  const cardText = (m, kind) => (kind === 'cancel' ? 'Cancelled: ' : kind === 'update' ? 'Updated: ' : kind === 'reg' ? 'Registration open: ' : 'Meeting: ') + m.title;
  function postCard(m, kind, extra) { if (!chanOfM(m)) return null; return addMessage({ chan: m.chan, from: m.organizer, text: cardText(m, kind), mtCard: { meeting: m.id, kind, ...(extra || {}) } }); }
  // activity items: kind = invite | update | time | cancel | removed | start | rsvp | reg | regok | regno (rendered by LC.ext.activityTypes.meeting)
  // (chan only for channel meetings: a meeting chat is named after the meeting, so the feed would show the title twice)
  const tell = (uids, from, m, kind, extra) => { for (const u of uids) activity(u, { type: 'meeting', kind, ...(from ? { from } : {}), meeting: m.id, ...(m.ownChat ? {} : { chan: m.chan }), title: m.title, start: m.start, ...(extra || {}) }); };

  // ---------- create / update / cancel / RSVP ----------
  api['POST /api/meetings/create'] = async (req, res, me) => {
    const b = await body(req, 32768);
    if (me.role === 'guest') fail(403, "Guests can't schedule meetings.");
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('mtc:' + me.id, 30, 600000)) fail(429, 'You are scheduling too many meetings. Wait a few minutes.');
    if (all().filter((x) => x.organizer === me.id && !x.cancelled).length >= 500) fail(400, 'You have too many meetings. Cancel some old ones first.');
    const m = { id: newId(), organizer: me.id, created: Date.now(), rsvp: {}, code: newCode(), passcode: newPass(), sent: {}, options: DEFAULT_OPTS() };
    applyFields(m, b, true); if (b.instant) m.adhoc = true;
    const where = str(b.chan, 64);
    if (where) {
      const c = db.channels[where];
      if (where.startsWith('dm:') || !c || !canSee(me, where)) fail(404, 'No such chat.');
      if (c.kind === 'meeting' || c.kind === 'breakout') fail(400, 'Pick a channel or a group chat.');
      if (c.readonly && !isAdmin(me)) fail(403, 'Only admins can post in that channel.'); // the invitation card is posted there
      if (c.members) { const out = m.invitees.filter((x) => !c.members.includes(x)); if (out.length) fail(400, `${out.map(nameOf).join(', ')} ${out.length > 1 ? 'are' : 'is'} not in that group chat. Meet in a new meeting chat instead.`); }
      m.chan = where; m.ownChat = false;
    } else { m.ownChat = true; m.chan = makeChat(m); }
    M()[m.id] = m; store.save();
    if (!m.adhoc) { postCard(m, 'invite'); tell(m.invitees, me.id, m, 'invite'); }
    emitMeeting(m); json(res, 200, { ok: true, meeting: view(m, me) });
  };

  api['POST /api/meetings/update'] = async (req, res, me) => {
    const b = await body(req, 32768), m = getM(b.id);
    if (!isOrg(me.id, m)) fail(403, 'Only the organizer can change this meeting.');
    if (m.cancelled) fail(400, 'This meeting was cancelled.');
    if (!rate('mtu:' + me.id, 120, 600000)) fail(429, 'Slow down.');
    const before = { start: m.start, end: m.end, repeat: JSON.stringify(m.repeat || null), title: m.title, location: m.location, details: m.details, invitees: [...m.invitees], allDay: m.allDay };
    applyFields(m, b, false);
    if (m.chan && chanOfM(m) && chanOfM(m).members && !m.ownChat) { const out = m.invitees.filter((x) => !chanOfM(m).members.includes(x)); if (out.length) fail(400, `${out.map(nameOf).join(', ')} ${out.length > 1 ? 'are' : 'is'} not in that group chat.`); }
    const timeChanged = before.start !== m.start || before.end !== m.end || before.repeat !== JSON.stringify(m.repeat || null) || before.allDay !== m.allDay;
    const added = m.invitees.filter((x) => !before.invitees.includes(x)), removed = before.invitees.filter((x) => !m.invitees.includes(x));
    if (timeChanged) { m.rsvp = {}; m.sent = {}; }
    for (const x of removed) delete m.rsvp[x];
    const big = timeChanged || before.title !== m.title || before.location !== m.location || before.details !== m.details;
    if (b.schedule === true) m.adhoc = false; // a "Meet now" meeting that gets a proper schedule shows up in calendars
    syncChat(m, removed, before.title !== m.title); m.updated = Date.now(); store.save();
    if (big && !m.adhoc) { postCard(m, 'update'); tell(m.invitees.filter((x) => !added.includes(x)), me.id, m, timeChanged ? 'time' : 'update'); }
    if (!m.adhoc) tell(added, me.id, m, 'invite');
    tell(removed, me.id, m, 'removed');
    emitMeeting(m, removed); json(res, 200, { ok: true, meeting: view(m, me) });
  };

  api['POST /api/meetings/cancel'] = async (req, res, me) => {
    const b = await body(req, 2048), m = getM(b.id);
    if (!isOrg(me.id, m) && !isAdmin(me)) fail(403, 'Only the organizer can cancel this meeting.');
    if (m.cancelled) return json(res, 200, { ok: true });
    const note = str(b.message, 300).trim(), occ = num(b.occurrence);
    if (occ && m.repeat) {
      if (!occurrences(m, occ - 1, occ + 1).includes(occ)) fail(404, 'That meeting is not on the calendar.');
      m.skip = [...(Array.isArray(m.skip) ? m.skip : []), occ].slice(-500);
    } else m.cancelled = Date.now();
    store.save(); postCard(m, 'cancel', { occ: occ && m.repeat ? occ : undefined, note: note || undefined });
    tell(m.invitees, me.id, m, 'cancel', occ && m.repeat ? { occurrence: occ } : null);
    if (m.cancelled) { for (const uid of lob(m.id).waiting.keys()) emit('mt_denied', { meeting: m.id, reason: 'cancelled' }, [uid]); lobbies.delete(m.id); }
    emitMeeting(m); json(res, 200, { ok: true });
  };

  api['POST /api/meetings/rsvp'] = async (req, res, me) => {
    const b = await body(req, 512), m = getM(b.id), r = str(b.rsvp, 8);
    if (!['yes', 'maybe', 'no'].includes(r)) fail(400, 'Pick Accept, Tentative or Decline.');
    if (isOrg(me.id, m)) fail(400, "You're the organizer of this meeting.");
    if (!invited(me.id, m) && !canSee(me, m.chan)) fail(403, "You're not invited to this meeting.");
    if (m.cancelled) fail(400, 'This meeting was cancelled.');
    if (!rate('mtr:' + me.id, 60, 60000)) fail(429, 'Slow down.');
    const prev = m.rsvp[me.id]; m.rsvp[me.id] = r; store.save();
    if (prev !== r) tell([m.organizer], me.id, m, 'rsvp', { rsvp: r });
    emitMeeting(m); json(res, 200, { ok: true, rsvp: r });
  };

  // ---------- reading ----------
  api['GET /api/meetings'] = async (req, res, me, url) => {
    const q = url.searchParams, now = Date.now(); let from = num(q.get('from')), to = num(q.get('to'));
    if (!(from > 0)) from = now - DAY; if (!(to > from)) to = from + 31 * DAY; if (to - from > 400 * DAY) to = from + 400 * DAY;
    const out = [];
    for (const m of all()) {
      if (m.cancelled || m.adhoc || !(invited(me.id, m) || (has(m.rsvp, me.id) && m.rsvp[me.id] !== 'no') || (chanOfM(m) && chanOfM(m).kind === 'meeting' && canSee(me, m.chan)))) continue;
      for (const s of occurrences(m, from, to)) { out.push(occOut(m, s, me)); if (out.length >= 3000) break; }
    }
    out.sort((a, b) => a.start - b.start); json(res, 200, { meetings: out });
  };
  api['GET /api/meetings/get'] = async (req, res, me, url) => { const m = getM(url.searchParams.get('id')); json(res, 200, { meeting: view(m, me) }); };
  // meetings I organised or attended, newest first (the Meet pane's "Recent" list)
  api['GET /api/meetings/recent'] = async (req, res, me) => {
    const out = [];
    for (const m of all()) {
      if (!canView(me, m)) continue; const x = X()[m.id]; if (!x || !x.att) continue;
      for (const [occ, rec] of Object.entries(x.att)) if (isOrg(me.id, m) || (rec.people && rec.people[me.id])) out.push({ id: m.id, title: m.title, occ, start: rec.start, end: rec.end || 0, chan: m.chan, people: Object.keys(rec.people || {}).length, isOrganizer: isOrg(me.id, m) });
    }
    out.sort((a, b) => b.start - a.start); json(res, 200, { recent: out.slice(0, 30) });
  };
  api['POST /api/meetings/lookup'] = async (req, res, me) => { // "Join with a meeting ID": the ID and the passcode
    const b = await body(req, 512), code = str(b.code, 40).replace(/\D/g, ''), pass = str(b.passcode, 40).trim();
    if (ctx.rateCount('mtpass:' + me.id, 600000) >= 10) fail(429, 'Too many wrong tries. Wait a few minutes.');
    if (!rate('mtlook:' + me.id, 30, 60000)) fail(429, 'Slow down.');
    const m = code.length >= 9 && code.length <= 12 ? all().find((x) => x.code === code && !x.cancelled) : null;
    if (!m || !pass || !ctx.safeEq(m.passcode, pass)) { ctx.rateAdd('mtpass:' + me.id); fail(404, 'Check the meeting ID and the passcode.'); }
    json(res, 200, { id: m.id, meeting: view(m, me) });
  };

  // ---------- joining and the lobby ----------
  const lobbyErr = (m) => Object.assign(new Error('You are in the lobby. Someone in the meeting will let you in soon.'), { status: 403, lobby: true, meeting: m.id });
  function addWaiting(m, u) {
    const l = lob(m.id); if (l.waiting.has(u.id)) return; if (l.waiting.size >= 100) fail(503, 'The lobby is full. Try again later.');
    l.waiting.set(u.id, Date.now()); pushLobby(m);
    for (const a of admitters(m)) if (a !== u.id) emit('mt_knock', { meeting: m.id, chan: m.chan, title: m.title, uid: u.id, name: u.name }, [a]);
  }
  const lobbyOut = (m) => [...lob(m.id).waiting].map(([uid, ts]) => ({ uid, name: nameOf(uid), ts, guest: (userById(uid) || {}).role === 'guest', invited: invited(uid, m) }));
  const pushLobby = (m) => emit('mt_lobby', { meeting: m.id, chan: m.chan, title: m.title, waiting: lobbyOut(m) }, admitters(m));
  function admit(m, uid) {
    const l = lob(m.id); l.waiting.delete(uid); l.admitted.add(uid); addToChat(m, uid);
    const c = chanOfM(m); emit('mt_admitted', { meeting: m.id, chan: m.chan, channel: c ? chanOut(c) : null }, [uid]);
  }
  api['POST /api/meetings/join'] = async (req, res, me) => {
    const b = await body(req, 1024), m = getM(b.id);
    if (!rate('mtj:' + me.id, 40, 60000)) fail(429, 'Slow down.');
    if (m.cancelled) fail(400, 'This meeting was cancelled.');
    const c = ensureChat(m);
    if (c.kind !== 'meeting' && !canSee(me, m.chan)) fail(403, "This meeting is in a channel you can't open. Ask the organizer to invite you to the channel.");
    if (!bypass(me, m)) { addWaiting(m, me); return json(res, 202, { lobby: true, meeting: m.id, chan: m.chan, title: m.title }); }
    const l = lobbies.get(m.id); if (l && l.waiting.delete(me.id)) pushLobby(m); addToChat(m, me.id);
    json(res, 200, { ok: true, meeting: m.id, chan: m.chan, channel: chanOut(chanOfM(m)), live: !!ctx.calls.get(m.chan) });
  };
  api['POST /api/meetings/lobby'] = async (req, res, me) => {
    const b = await body(req, 1024), m = getM(b.id), op = str(b.op, 12), l = lob(m.id);
    if (op === 'leave') { if (l.waiting.delete(me.id)) pushLobby(m); return json(res, 200, { ok: true }); }
    if (!canAdmit(me.id, m)) fail(403, 'Only organizers and presenters can let people in.');
    if (op === 'list') return json(res, 200, { waiting: lobbyOut(m) });
    const who = op === 'admitAll' ? [...l.waiting.keys()] : [str(b.uid, 32)];
    if (!['admit', 'admitAll', 'deny'].includes(op)) fail(400, 'Bad operation');
    for (const uid of who) {
      if (!l.waiting.has(uid)) continue;
      if (op === 'deny') { l.waiting.delete(uid); emit('mt_denied', { meeting: m.id, reason: 'denied' }, [uid]); } else admit(m, uid);
    }
    pushLobby(m); json(res, 200, { ok: true, waiting: lobbyOut(m) });
  };
  // guest join by link: the browser of someone who is not signed in yet says which meeting it came for; the host's
  // approval prompt then names the meeting. It never lets anyone in: the normal join + approval flow still runs.
  const intents = new Map(); // deviceId -> { meeting, exp }
  ctx.publicRoutes.add('POST /api/meetings/intent');
  api['POST /api/meetings/intent'] = async (req, res) => {
    if (!rate('mtint:' + ctx.ipOf(req), 20, 60000)) fail(429, 'Slow down.');
    const b = await body(req, 512), dev = str(b.deviceId, 64), id = str(b.meeting, 32), now = Date.now();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(dev) || !ID.test(id) || !has(M(), id) || M()[id].cancelled) return json(res, 200, { ok: true });
    for (const [k, v] of intents) if (v.exp < now) intents.delete(k);
    if (intents.size >= 500) intents.delete(intents.keys().next().value);
    intents.set(dev, { meeting: id, exp: now + 30 * MIN }); json(res, 200, { ok: true });
  };
  const reqMeeting = (r) => { if (!r) return null; if (!r.mtMeeting && r.dev) { const it = intents.get(r.dev); if (it && it.exp > Date.now()) r.mtMeeting = it.meeting; } return r.mtMeeting && has(M(), r.mtMeeting) ? M()[r.mtMeeting] : null; };
  // app.js sets ctx.reqOut after the route modules load, so it is wrapped right after createApp() finishes
  queueMicrotask(() => { const orig = ctx.reqOut; if (typeof orig !== 'function' || orig._mt) return; ctx.reqOut = Object.assign((r) => { const o = orig(r), m = reqMeeting(r); if (m) { o.meeting = m.id; o.meetingTitle = m.title; } return o; }, { _mt: true }); });

  // ---------- hooks: meeting chats, calls ----------
  ctx.hooks.chanFields.push((c) => (c.meeting ? { meeting: c.meeting, parent: c.parent || undefined } : null));
  ctx.hooks.initExtra.push((u) => {
    const out = {};
    if (isAdmin(u)) { const reqs = {}; for (const r of ctx.pending.values()) { const m = r.status === 'pending' && reqMeeting(r); if (m) reqs[r.id] = { meeting: m.id, title: m.title }; } out.mtReqs = reqs; }
    const lobbyNow = []; for (const [id, l] of lobbies) { const m = has(M(), id) ? norm(M()[id]) : null; if (m && l.waiting.size && canAdmit(u.id, m)) lobbyNow.push({ meeting: id, chan: m.chan, title: m.title, waiting: lobbyOut(m) }); }
    out.mtLobby = lobbyNow; return out;
  });
  // chat in a meeting: on / off / only while the meeting is on (organizers and presenters can always post)
  ctx.hooks.beforeMessage.push((msg, p, me) => {
    const c = db.channels[msg.chan]; if (!c || c.kind !== 'meeting' || !c.meeting || !has(M(), c.meeting)) return;
    const m = norm(M()[c.meeting]), mode = m.options.chat; if (mode === 'on' || isOrg(me.id, m) || m.presenters.includes(me.id)) return;
    if (mode === 'off') fail(403, 'The organizer turned off the chat for this meeting.');
    if (mode === 'during' && !ctx.calls.has(msg.chan)) fail(403, 'This chat is open only while the meeting is on.');
  });
  // which meeting a new call belongs to: the meeting chat's meeting, the one the client asked for, or a meeting in this channel happening now
  function meetingForCall(chan, b) {
    const want = str(b && b.mtMeeting, 32);
    if (ID.test(want) && has(M(), want)) { const m = norm(M()[want]); if (m.chan === chan && !m.cancelled) return m; }
    const c = db.channels[chan]; if (c && c.meeting && has(M(), c.meeting)) { const m = norm(M()[c.meeting]); return m.cancelled ? null : m; }
    const now = Date.now(); let best = null, bestS = 0;
    for (const m of all()) { if (m.chan !== chan || m.cancelled) continue; for (const s of occurrences(m, now, now + 15 * MIN, 5)) if (!best || Math.abs(s - now) < Math.abs(bestS - now)) { best = m; bestS = s; } }
    return best;
  }
  const webinarMax = () => 25; // the most a mesh call carries (the calls area caps call.max there too); watchers only receive
  function setupCall(call, m, chan) {
    call.meeting = m.id; call.roles ||= {}; call.roles[m.organizer] = 'organizer';
    for (const p of m.presenters) call.roles[p] = roleFor(m, p);
    const c = db.channels[chan]; if (c && c.kind === 'breakout') call.mtRoom = true;
    if (m.options.viewOnly) { call.max = Math.max(call.max || 0, webinarMax()); call.hardMute = true; call.noCams = true; } // attendees can only watch: enforced by the calls area
    call.mtOcc = String(occAt(m, call.started || Date.now()) || call.started || Date.now());
    const r = call.mtRoom && xGet(m.id) && xGet(m.id).rooms; if (r && r.occ) call.mtOcc = r.occ; // time in a breakout room counts for the main meeting
  }
  ctx.hooks.callJoin.push((me, chan, call, b, starting) => {
    let m = null;
    if (starting) { m = meetingForCall(chan, b); if (m) setupCall(call, m, chan); }
    else if (call.meeting && has(M(), call.meeting)) m = norm(M()[call.meeting]);
    if (!m) return;
    const c = db.channels[chan];
    if (!(c && c.kind === 'breakout') && !bypass(me, m)) { addWaiting(m, me); throw lobbyErr(m); } // breakout rooms: being in the room is the permission
    const l = lobbies.get(m.id); if (l && l.waiting.delete(me.id)) pushLobby(m);
    call.roles ||= {}; call.roles[me.id] ||= roleFor(m, me.id); // a role the organizer changed during this meeting stays
  });
  // the lobby answer carries { lobby: true } (fail() only sends the message)
  for (const key of ['POST /api/call/start', 'POST /api/call/join']) {
    const orig = api[key]; if (!orig) continue;
    api[key] = async (req, res, me, url) => { try { return await orig(req, res, me, url); } catch (e) { if (e && e.lobby && !res.headersSent) return json(res, 403, { error: e.message, lobby: true, meeting: e.meeting }); throw e; } };
  }
  ctx.hooks.callFields.push((call) => {
    if (!call.meeting || !has(M(), call.meeting)) return null; const m = norm(M()[call.meeting]);
    return { meeting: call.meeting, roles: call.roles || {}, mt: { title: m.title, organizer: m.organizer, viewOnly: !!m.options.viewOnly, sounds: m.options.sounds !== false, qa: m.options.qa !== false, chat: m.options.chat, interp: m.options.interp || [], room: !!call.mtRoom, occ: call.mtOcc || '' } };
  });
  // attendance: who joined, first join, last leave, time in the meeting (breakout rooms count as the meeting)
  function attRec(m, call) {
    const x = xOf(m.id), key = call.mtOcc || String(call.started); let r = x.att[key];
    if (!r) { const keys = Object.keys(x.att); if (keys.length >= 200) delete x.att[keys.sort((a, b) => x.att[a].start - x.att[b].start)[0]]; r = x.att[key] = { occ: occAt(m, call.started) || null, start: call.started || Date.now(), end: 0, people: {} }; }
    return r;
  }
  ctx.hooks.callEvent.push((type, chan, call, uid) => {
    if (!call || !call.meeting || !has(M(), call.meeting)) return; const m = norm(M()[call.meeting]), r = attRec(m, call), now = Date.now();
    if (type === 'start' || type === 'join') {
      if (!uid) return; call.roles ||= {}; call.roles[uid] ||= roleFor(m, uid);
      const p = (r.people[uid] ||= { first: now, last: 0, ms: 0, open: 0, joins: 0, role: roleFor(m, uid) }); if (!p.open) { p.open = now; p.joins++; } r.end = 0;
      if (canAdmit(uid, m) && lob(m.id).waiting.size) emit('mt_lobby', { meeting: m.id, chan: m.chan, title: m.title, waiting: lobbyOut(m) }, [uid]);
    } else if (type === 'leave' && uid) { const p = r.people[uid]; if (p && p.open) { p.ms += now - p.open; p.open = 0; p.last = now; } }
    else if (type === 'end') { for (const p of Object.values(r.people)) if (p.open) { p.ms += now - p.open; p.open = 0; p.last = now; } r.end = now; if (!call.mtRoom) { const l = lobbies.get(m.id); if (l && !l.waiting.size) lobbies.delete(m.id); if (m.adhoc && m.end > now) m.end = Math.max(m.start + MIN, now - (now % MIN) + MIN); } } // a "Meet now" meeting is over when its call ends (presence)
    store.save();
  });
  const pOut = (p, now) => ({ first: p.first, last: p.open ? now : p.last, ms: p.ms + (p.open ? now - p.open : 0), joins: p.joins, role: p.role, here: !!p.open });
  function sessionsOut(m) {
    const x = X()[m.id]; if (!x || !x.att) return [];
    return Object.entries(x.att).map(([occ, r]) => ({ occ, start: r.start, end: r.end || 0, scheduled: r.occ || null, people: Object.keys(r.people).length })).sort((a, b) => b.start - a.start).slice(0, 50);
  }
  api['GET /api/meetings/attendance'] = async (req, res, me, url) => {
    const q = url.searchParams, m = getM(q.get('id')); if (!isOrg(me.id, m) && !isAdmin(me)) fail(403, 'Only the organizer can see the attendance report.');
    const x = xOf(m.id), occ = str(q.get('occ'), 20), r = x.att[occ], now = Date.now(); if (!r) fail(404, 'No attendance for that meeting yet.');
    const rows = Object.entries(r.people).map(([uid, p]) => ({ uid, name: nameOf(uid), ...pOut(p, now) })).sort((a, b) => a.first - b.first);
    if (q.get('format') !== 'csv') return json(res, 200, { occ, start: r.start, end: r.end, people: rows });
    const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const iso = (t) => (t ? new Date(t).toISOString() : '');
    const lines = [['Meeting', 'Name', 'Role', 'First join (UTC)', 'Last leave (UTC)', 'Minutes in meeting', 'Times joined'], ...rows.map((p) => [m.title, p.name, p.role, iso(p.first), p.here ? 'still in the meeting' : iso(p.last), Math.round(p.ms / 6000) / 10, p.joins])];
    const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n', fname = ('attendance-' + m.title).replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().slice(0, 60) || 'attendance';
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance.csv"; filename*=UTF-8''${encodeURIComponent(fname)}.csv`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(csv);
  };

  // ---------- recap: date, duration, attendance, chat, files, polls, recordings, Q&A, agenda ----------
  api['GET /api/meetings/recap'] = async (req, res, me, url) => {
    const q = url.searchParams, m = getM(q.get('id')); if (!isOrg(me.id, m) && !canSee(me, m.chan)) fail(403, 'Only people in the meeting chat can see the recap.');
    const x = xOf(m.id), list = sessionsOut(m), occ = str(q.get('occ'), 20) || (list[0] && list[0].occ) || '', r = x.att[occ], now = Date.now();
    const from = r ? r.start : m.start, to = r ? r.end || now : m.end, see = canSee(me, m.chan);
    const okMsg = (x2) => (ctx.canSeeMsg ? ctx.canSeeMsg(me, x2) : true); // e.g. people added to a chat without its older history
    const msgs = see ? chanMsgs(m.chan).filter((x2) => x2.ts >= from - 10 * MIN && x2.ts <= to + 10 * MIN && !x2.deleted && okMsg(x2)) : [];
    const people = r ? Object.entries(r.people).map(([uid, p]) => ({ uid, name: nameOf(uid), ...pOut(p, now) })).sort((a, b) => a.first - b.first) : [];
    json(res, 200, {
      id: m.id, title: m.title, occ, sessions: list, start: from, end: r ? r.end : 0, duration: r ? (r.end || now) - r.start : 0, ongoing: !!r && !r.end,
      attendance: isOrg(me.id, m) || isAdmin(me) ? people : people.map((p) => ({ uid: p.uid, name: p.name })), attendees: people.length,
      messages: msgs.filter((x2) => !x2.system && !x2.poll && !x2.recording && !x2.mtCard && !x2.thread).slice(-200).map(msgOut),
      files: msgs.flatMap((x2) => (x2.files || []).map((f) => ({ ...f, from: x2.from, ts: x2.ts, msg: x2.id }))).slice(-100),
      polls: msgs.filter((x2) => x2.poll).slice(-30).map(msgOut), recordings: msgs.filter((x2) => x2.recording).map(msgOut),
      qa: qaOut(m, me).filter((x2) => !x2.dismissed), agenda: x.agenda,
    });
  };

  // ---------- reminders: 15 minutes before (toast), at the start (a ring with Join / Dismiss) ----------
  ctx.ticks.push({ every: 15000, mt: 'reminders', fn: (now) => {
    let dirty = false;
    for (const m of all()) {
      if (m.cancelled || m.adhoc) continue; if (!m.repeat && (m.start > now + 16 * MIN || m.start < now - 10 * MIN)) continue;
      for (const s of occurrences(m, now - 10 * MIN, now + 16 * MIN, 5)) {
        const key = String(s), bits = m.sent[key] || 0, going = (uid) => m.rsvp[uid] !== 'no';
        const people = [m.organizer, ...m.invitees.filter(going), ...Object.keys(m.rsvp).filter((u) => !m.invitees.includes(u) && m.rsvp[u] === 'yes')];
        if (!(bits & 1) && s - now <= 15 * MIN && s - now > MIN) { m.sent[key] = bits | 1; dirty = true; emit('mt_reminder', { id: m.id, occurrence: s, title: m.title, start: s, chan: m.chan, kind: 'soon' }, people); }
        if (!(bits & 2) && now >= s - 30000 && now - s < 5 * MIN) {
          m.sent[key] = (m.sent[key] || 0) | 3; dirty = true; const ring = people.filter((u) => m.rsvp[u] !== 'maybe');
          emit('mt_reminder', { id: m.id, occurrence: s, title: m.title, start: s, chan: m.chan, kind: 'start' }, ring);
          tell(ring, null, m, 'start', { occurrence: s, start: s });
        }
      }
      for (const k of Object.keys(m.sent)) if (Number(k) < now - 2 * DAY) { delete m.sent[k]; dirty = true; }
    }
    // the lobby forgets people who closed the page
    for (const [id, l] of lobbies) { let changed = false; for (const uid of [...l.waiting.keys()]) if (!online(uid) || Date.now() - l.waiting.get(uid) > 60 * MIN) { l.waiting.delete(uid); changed = true; } if (changed && has(M(), id)) pushLobby(norm(M()[id])); }
    if (dirty) store.save();
  } });

  // ---------- Q&A (per meeting; ask anonymously, upvote, the organizer marks answered / dismisses / pins) ----------
  const canMod = (uid, m) => isOrg(uid, m) || m.presenters.includes(uid);
  const mustSee = (me, m) => { if (!isOrg(me.id, m) && !canSee(me, m.chan)) fail(403, 'Join the meeting chat first.'); };
  function qaOut(m, v) {
    const mod = canMod(v.id, m);
    return xOf(m.id).qa.filter((q) => !q.dismissed || mod || q.by === v.id).map((q) => ({ id: q.id, text: q.text, ts: q.ts, anon: !!q.anon, by: q.anon ? null : q.by, mine: q.by === v.id, votes: q.votes.length, voted: q.votes.includes(v.id), answered: !!q.answered, dismissed: !!q.dismissed, pinned: !!q.pinned, replies: (q.replies || []).map((r) => ({ id: r.id, text: r.text, by: r.by, ts: r.ts })) }));
  }
  const qaAud = (m) => { const a = chanOfM(m) ? audience(m.chan) : []; if (a === null) return null; return [...new Set([m.organizer, ...(a || []), ...((callOf(m) && [...callOf(m).parts]) || [])])]; }; // null = a public channel: everyone
  api['GET /api/meetings/qa'] = async (req, res, me, url) => { const m = getM(url.searchParams.get('id')); mustSee(me, m); json(res, 200, { items: qaOut(m, me), moderator: canMod(me.id, m), on: m.options.qa !== false }); };
  api['POST /api/meetings/qa'] = async (req, res, me) => {
    const b = await body(req, 4096), m = getM(b.id), op = str(b.op, 10), x = xOf(m.id); mustSee(me, m);
    if (!rate('mtqa:' + me.id, 60, 60000)) fail(429, 'Slow down.');
    if (me.mutedUntil > Date.now() && ['ask', 'reply'].includes(op)) fail(403, 'You are muted.');
    const q = op === 'ask' ? null : x.qa.find((i) => i.id === str(b.qid, 16)); if (op !== 'ask' && !q) fail(404, 'That question is gone.');
    if (op === 'ask') {
      if (m.options.qa === false) fail(403, 'Q&A is off for this meeting.');
      const text = str(b.text, 500).trim(); if (!text) fail(400, 'Type your question.'); if (x.qa.length >= 500) fail(400, 'Too many questions.');
      x.qa.push({ id: rid(6), text, by: me.id, anon: !!b.anon, ts: Date.now(), votes: [], replies: [] });
    } else if (op === 'vote') { const i = q.votes.indexOf(me.id); if (i >= 0) q.votes.splice(i, 1); else q.votes.push(me.id); }
    else if (op === 'reply') { const text = str(b.text, 500).trim(); if (!text) fail(400, 'Type your reply.'); if ((q.replies ||= []).length >= 50) fail(400, 'Too many replies.'); q.replies.push({ id: rid(6), text, by: me.id, ts: Date.now() }); }
    else if (['answer', 'dismiss', 'pin'].includes(op)) { if (!canMod(me.id, m)) fail(403, 'Only organizers and presenters can do that.'); const k = op === 'answer' ? 'answered' : op === 'dismiss' ? 'dismissed' : 'pinned'; q[k] = b.on === undefined ? !q[k] : !!b.on; }
    else if (op === 'delete') { if (q.by !== me.id && !canMod(me.id, m)) fail(403, 'You can only delete your own questions.'); x.qa = x.qa.filter((i) => i !== q); }
    else fail(400, 'Bad operation');
    store.save(); emit('mt_qa', { meeting: m.id }, qaAud(m)); json(res, 200, { ok: true });
  };

  // ---------- agenda (the shared note stays in the apps area: /api/collab + /api/note on the meeting chat) ----------
  api['GET /api/meetings/agenda'] = async (req, res, me, url) => { const m = getM(url.searchParams.get('id')); mustSee(me, m); json(res, 200, { agenda: xOf(m.id).agenda }); };
  api['POST /api/meetings/agenda'] = async (req, res, me) => {
    const b = await body(req, 4096), m = getM(b.id), op = str(b.op, 8), x = xOf(m.id); mustSee(me, m);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.'); if (!rate('mtag:' + me.id, 60, 60000)) fail(429, 'Slow down.');
    const a = op === 'add' ? null : x.agenda.find((i) => i.id === str(b.aid, 16)); if (op !== 'add' && !a) fail(404, 'That agenda item is gone.');
    const mins = (v) => Math.max(0, Math.min(480, num(v) || 0));
    if (op === 'add') { const text = str(b.text, 200).trim(); if (!text) fail(400, 'Write the agenda item first.'); if (x.agenda.length >= 50) fail(400, 'Too many agenda items.'); x.agenda.push({ id: rid(6), text, mins: mins(b.mins), done: false, by: me.id, ts: Date.now() }); }
    else if (op === 'toggle') a.done = !a.done;
    else if (op === 'edit') { if (b.text !== undefined) a.text = str(b.text, 200).trim() || a.text; if (b.mins !== undefined) a.mins = mins(b.mins); }
    else if (op === 'move') { const i = x.agenda.indexOf(a), j = Math.max(0, Math.min(x.agenda.length - 1, i + (num(b.by) || 0))); x.agenda.splice(i, 1); x.agenda.splice(j, 0, a); }
    else if (op === 'del') { if (a.by !== me.id && !canMod(me.id, m)) fail(403, 'Only the organizer or the person who added it can remove it.'); x.agenda = x.agenda.filter((i) => i !== a); }
    else fail(400, 'Bad operation');
    store.save(); emit('mt_agenda', { meeting: m.id, agenda: x.agenda }, qaAud(m)); json(res, 200, { ok: true, agenda: x.agenda });
  };

  // ---------- breakout rooms ----------
  const roomsOut = (m) => { const r = xOf(m.id).rooms; return r ? { open: !!r.open, closesAt: r.closesAt || 0, openedAt: r.openedAt || 0, rooms: r.list.map((x) => ({ chan: x.chan, name: x.name, members: x.members, live: ctx.calls.has(x.chan) ? [...ctx.calls.get(x.chan).parts] : [] })) } : { open: false, closesAt: 0, rooms: [] }; };
  const roomAud = (m) => { const r = xOf(m.id).rooms, a = qaAud(m); return a === null ? null : [...new Set([...a, ...(r ? r.list.flatMap((x) => x.members) : [])])]; };
  const pushRooms = (m) => emit('mt_rooms', { meeting: m.id, state: roomsOut(m) }, roomAud(m));
  function roomChan(m, name) { const id = 'br-' + rid(5), c = { id, name: name.slice(0, 60), topic: '', created: Date.now(), by: m.organizer, members: [m.organizer], kind: 'breakout', meeting: m.id, parent: m.chan }; db.channels[id] = c; emit('channel', chanOut(c), c.members); return id; }
  function dropRoom(x) { const c = db.channels[x.chan]; if (!c) return; const aud = c.members || []; ctx.removeMessages([...chanMsgs(x.chan)]); delete db.channels[x.chan]; ctx.byChan.delete(x.chan); if (db.extras) delete db.extras[x.chan]; emit('channel_deleted', { id: x.chan }, aud); }
  function setRoomMembers(m, x, members) {
    const c = db.channels[x.chan]; if (!c) return; const want = [...new Set([m.organizer, ...members])].filter(okUser), gone = (c.members || []).filter((u) => !want.includes(u));
    c.members = want; x.members = members.filter((u) => u !== m.organizer); if (gone.length) emit('channel_removed', { id: c.id }, gone); emit('channel', chanOut(c), c.members);
  }
  function autoAssign(m, r) {
    const call = callOf(m), pool = (call ? [...call.parts] : chatMembers(m)).filter((u) => !isOrg(u, m) && okUser(u));
    for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    r.list.forEach((x) => { x.members = []; }); pool.forEach((u, i) => r.list[i % r.list.length].members.push(u));
  }
  function closeRooms(m, why) {
    const r = xOf(m.id).rooms; if (!r || !r.open) return; r.open = false; r.closesAt = 0; r.warned = false;
    for (const x of r.list) { emit('mt_move', { meeting: m.id, to: m.chan, from: x.chan, reason: 'close' }, [m.organizer, ...x.members]); if (db.channels[x.chan]) sysMsg(x.chan, 'The breakout room closed. Everyone went back to the main meeting.'); }
    if (chanOfM(m)) sysMsg(m.chan, why === 'timer' ? 'Breakout rooms closed (time is up).' : 'Breakout rooms closed.'); store.save(); pushRooms(m);
  }
  api['GET /api/meetings/rooms'] = async (req, res, me, url) => { const m = getM(url.searchParams.get('id')); mustSee(me, m); json(res, 200, { state: roomsOut(m), manager: isOrg(me.id, m) }); };
  api['POST /api/meetings/rooms'] = async (req, res, me) => {
    const b = await body(req, 16384), m = getM(b.id), op = str(b.op, 10), x = xOf(m.id);
    if (!isOrg(me.id, m)) fail(403, 'Only the organizer manages breakout rooms.');
    if (!rate('mtrm:' + me.id, 120, 60000)) fail(429, 'Slow down.');
    let r = x.rooms;
    if (op === 'create') {
      if (r && r.open) fail(400, 'Close the rooms first.'); const n = Math.max(1, Math.min(20, num(b.n) || 2));
      r = x.rooms ||= { list: [], open: false, closesAt: 0 };
      while (r.list.length < n) r.list.push({ chan: roomChan(m, `Room ${r.list.length + 1}`), name: `Room ${r.list.length + 1}`, members: [] });
      while (r.list.length > n) dropRoom(r.list.pop());
      for (const it of r.list) if (!db.channels[it.chan]) it.chan = roomChan(m, it.name);
      if (b.auto !== false) autoAssign(m, r); else r.list.forEach((it) => { it.members = it.members.filter(okUser); });
    } else {
      if (!r || !r.list.length) fail(400, 'Create the rooms first.');
      if (op === 'auto') autoAssign(m, r);
      else if (op === 'assign') {
        if (!isObj(b.assign)) fail(400, 'Bad assignment'); const moves = [];
        for (const [uid, idx] of Object.entries(b.assign).slice(0, 300)) {
          if (!okUser(uid) || isOrg(uid, m)) continue; const i = num(idx), from = r.list.find((it) => it.members.includes(uid));
          for (const it of r.list) it.members = it.members.filter((u) => u !== uid); if (i >= 0 && i < r.list.length) r.list[i].members.push(uid);
          if (r.open && (from ? r.list.indexOf(from) : -1) !== i) moves.push([uid, i]);
        }
        if (r.open) { for (const it of r.list) setRoomMembers(m, it, it.members); for (const [uid, i] of moves) emit('mt_move', { meeting: m.id, to: i >= 0 && i < r.list.length ? r.list[i].chan : m.chan, name: i >= 0 && r.list[i] ? r.list[i].name : '', reason: i >= 0 ? 'open' : 'close' }, [uid]); }
      } else if (op === 'rename') { const it = r.list[num(b.room)]; if (!it) fail(404, 'No such room'); const nm = str(b.name, 40).trim(); if (!nm) fail(400, 'Give the room a name.'); it.name = nm; const c = db.channels[it.chan]; if (c) { c.name = nm; emit('channel', chanOut(c), c.members); } }
      else if (op === 'open') {
        if (r.open) fail(400, 'The rooms are already open.'); const mins = Math.max(0, Math.min(240, num(b.minutes) || 0));
        r.open = true; r.openedAt = Date.now(); r.closesAt = mins ? Date.now() + mins * MIN : 0; r.warned = false; r.occ = (callOf(m) || {}).mtOcc || r.occ || '';
        for (const it of r.list) { if (!db.channels[it.chan]) it.chan = roomChan(m, it.name); setRoomMembers(m, it, it.members); sysMsg(it.chan, `${it.name} is open.` + (mins ? ` It closes in ${mins} min.` : '')); for (const uid of it.members) emit('mt_move', { meeting: m.id, to: it.chan, name: it.name, reason: 'open' }, [uid]); }
        if (chanOfM(m)) sysMsg(m.chan, `${me.name} opened ${r.list.length} breakout room${r.list.length > 1 ? 's' : ''}.`);
      } else if (op === 'close') closeRooms(m, 'organizer');
      else if (op === 'timer') { if (!r.open) fail(400, 'Open the rooms first.'); const mins = Math.max(0, Math.min(240, num(b.minutes) || 0)); r.closesAt = mins ? Date.now() + mins * MIN : 0; r.warned = false; }
      else if (op === 'announce') {
        const text = str(b.text, 300).trim(); if (!text) fail(400, 'Write the announcement first.');
        for (const it of r.list) if (db.channels[it.chan]) sysMsg(it.chan, `📢 ${me.name}: ${text}`);
        emit('mt_announce', { meeting: m.id, text, from: me.id }, [...new Set(r.list.flatMap((it) => it.members))]);
      } else if (op === 'delete') { if (r.open) fail(400, 'Close the rooms first.'); for (const it of r.list) dropRoom(it); x.rooms = null; }
      else fail(400, 'Bad operation');
    }
    store.save(); pushRooms(m); json(res, 200, { ok: true, state: roomsOut(m) });
  };
  ctx.ticks.push({ every: 5000, mt: 'rooms', fn: (now) => {
    for (const [id, x] of Object.entries(X())) {
      const r = x && x.rooms; if (!r || !r.open || !r.closesAt || !has(M(), id)) continue; const m = norm(M()[id]);
      if (now >= r.closesAt) closeRooms(m, 'timer');
      else if (!r.warned && r.closesAt - now <= 60000) { r.warned = true; emit('mt_announce', { meeting: id, text: 'Breakout rooms close in 1 minute.', warn: true }, [...new Set(r.list.flatMap((it) => it.members))]); }
    }
  } });

  // ---------- webinars: registration with approval ----------
  const regOut = (r, own) => (r ? { id: r.id, status: r.status, ts: r.ts, ...(own ? { name: r.name, email: r.email } : {}) } : null);
  api['GET /api/meetings/register'] = async (req, res, me, url) => {
    const m = getM(url.searchParams.get('id')), reg = m.options.registration, mine = xOf(m.id).regs.find((r) => r.uid === me.id);
    json(res, 200, { id: m.id, title: m.title, organizer: m.organizer, start: m.start, end: m.end, repeat: m.repeat || null, details: reg.on ? (m.details || '').slice(0, 1000) : '', open: !!reg.on && !m.cancelled, fields: { email: !!reg.email, notes: !!reg.notes, question: reg.question || '' }, mine: mine ? { status: mine.status, name: mine.name, email: mine.email, notes: mine.notes, answer: mine.answer } : null, invited: invited(me.id, m) });
  };
  api['POST /api/meetings/register'] = async (req, res, me) => {
    const b = await body(req, 4096), m = getM(b.id), reg = m.options.registration, x = xOf(m.id);
    if (!reg.on || m.cancelled) fail(400, 'Registration for this event is closed.');
    if (!rate('mtreg:' + me.id, 10, 60000)) fail(429, 'Slow down.');
    const name = str(b.name, 60).replace(/\s+/g, ' ').trim(), email = str(b.email, 120).trim(), notes = reg.notes ? str(b.notes, 500).trim() : '', answer = reg.question ? str(b.answer, 500).trim() : '';
    if (!name) fail(400, 'Type your name.'); if (reg.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Type a valid email address.');
    let r = x.regs.find((i) => i.uid === me.id);
    if (r && r.status === 'approved') return json(res, 200, { ok: true, status: r.status });
    if (!r) { if (x.regs.length >= 1000) fail(400, 'This event is full.'); r = { id: rid(6), uid: me.id, ts: Date.now() }; x.regs.push(r); }
    Object.assign(r, { name, email: reg.email ? email : '', notes, answer, status: 'pending' });
    if (!reg.approve) approveReg(m, r, m.organizer);
    store.save(); emit('mt_reg', { meeting: m.id }, [m.organizer]);
    if (r.status === 'pending') tell([m.organizer], me.id, m, 'reg');
    json(res, 200, { ok: true, status: r.status });
  };
  function approveReg(m, r, by) {
    r.status = 'approved'; r.decided = Date.now();
    if (!m.invitees.includes(r.uid) && !isOrg(r.uid, m)) m.invitees.push(r.uid); addToChat(m, r.uid);
    tell([r.uid], by, m, 'regok', { link: '#meet=' + m.id });
  }
  api['GET /api/meetings/registrations'] = async (req, res, me, url) => {
    const m = getM(url.searchParams.get('id')); if (!isOrg(me.id, m)) fail(403, 'Only the organizer sees registrations.');
    json(res, 200, { registrations: xOf(m.id).regs.map((r) => ({ id: r.id, uid: r.uid, name: r.name, email: r.email, notes: r.notes, answer: r.answer, status: r.status, ts: r.ts })) });
  };
  api['POST /api/meetings/registrations'] = async (req, res, me) => {
    const b = await body(req, 2048), m = getM(b.id), x = xOf(m.id), op = str(b.op, 10); if (!isOrg(me.id, m)) fail(403, 'Only the organizer decides registrations.');
    if (!['approve', 'decline'].includes(op)) fail(400, 'Bad operation');
    const list = b.all ? x.regs.filter((r) => r.status === 'pending') : x.regs.filter((r) => r.id === str(b.rid, 16)); if (!list.length) fail(404, 'Nothing to decide.');
    for (const r of list) { if (op === 'approve') approveReg(m, r, me.id); else { r.status = 'declined'; r.decided = Date.now(); tell([r.uid], me.id, m, 'regno'); } }
    store.save(); emitMeeting(m); emit('mt_reg', { meeting: m.id }, [m.organizer]); json(res, 200, { ok: true, decided: list.length });
  };

  // ---------- templates (built-in ones live in the client) ----------
  api['GET /api/meetings/templates'] = async (req, res, me) => json(res, 200, { templates: (T()[me.id] || []) });
  api['POST /api/meetings/templates'] = async (req, res, me) => {
    const b = await body(req, 8192), list = Array.isArray(T()[me.id]) ? T()[me.id] : (T()[me.id] = []), op = str(b.op, 8);
    if (op === 'delete') { T()[me.id] = list.filter((x) => x.id !== str(b.tid, 16)); store.save(); return json(res, 200, { ok: true, templates: T()[me.id] }); }
    if (op !== 'save') fail(400, 'Bad operation');
    const name = str(b.name, 40).trim(); if (!name) fail(400, 'Name the template.');
    const tpl = { id: rid(6), name, titlePrefix: str(b.titlePrefix, 60), duration: Math.max(5, Math.min(24 * 60, num(b.duration) || 30)), lobby: LOBBY.includes(b.lobby) ? b.lobby : '', options: normOptions(b.options, {}) };
    delete tpl.options.interp; const i = list.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) { tpl.id = list[i].id; list[i] = tpl; } else { if (list.length >= 20) fail(400, 'You can keep up to 20 templates.'); list.push(tpl); }
    store.save(); json(res, 200, { ok: true, templates: list });
  };
};
