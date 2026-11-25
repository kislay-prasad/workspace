'use strict';
// Calendar (section 12 of the Teams list, docs/features-files.md). Events live per chat in db.extras[chan].events (shared
// contract). This module takes over POST /api/event from routes-collab.js and extends the event shape (old events keep working):
//   { id, by, ts, title, start, end, notes, remind, reminded: true, v: 2, allDay, tz, repeat, exdates, location, online, rsvp,
//     remOcc (start of the last occurrence reminded), mod }
// `reminded: true` on every event keeps the old reminder tick in routes-collab.js away from them, so reminders never fire
// twice; this module reminds per occurrence (repeating events) instead.
// Also: the calendar range API across chats, free/busy, .ics export and import, personal settings (db.calPrefs[uid]).
const C = require('../public/js/files-calcore.js');

module.exports = (ctx) => {
  const { api, db, S, store, json, body, fail, rid, str, rate, isAdmin, userById, canSee, validChan, audience, emit, sysMsg, coll } = ctx;
  const DAY = 864e5, MIN = 6e4, SERVER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const ex = (chan) => { const e = (db.extras[chan] ||= { note: { text: '', v: 0, by: null, ts: 0 }, board: [], todos: [], events: [] }); if (!Array.isArray(e.events)) e.events = []; return e; };
  const see = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); return ex(chan); };
  const writer = (me, chan) => {
    const e = see(me, chan);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!chan.startsWith('dm:') && db.channels[chan].readonly && !isAdmin(me)) fail(403, 'Only admins can change things in this channel.');
    return e;
  };
  const mayEdit = (me, x) => x.by === me.id || isAdmin(me);
  const changed = (chan) => emit('fl_events', { chan }, audience(chan));
  const chatTitle = (chan) => { if (chan.startsWith('dm:')) return chan.split(':').slice(1).map((i) => (userById(i) || {}).name || '?').join(' & '); const c = db.channels[chan]; return c ? (c.members ? c.name : '#' + c.name) : chan; };
  const evEnd = (x) => (x.end > x.start ? x.end : x.start + 30 * MIN); // old events may have end 0
  const ser = (x) => ({ ...x, end: evEnd(x) });

  // ---------- creating and changing events ----------
  function setFields(x, b) {
    const keep = (k, f) => (b[k] === undefined ? x[k] : f(b[k]));
    const title = str(keep('title', (v) => v), 100).trim(); if (!title) fail(400, 'An event needs a title.');
    const allDay = !!keep('allDay', (v) => v);
    let start = num(b.start === undefined ? x.start : b.start), end = num(b.end === undefined ? x.end : b.end);
    if (!(start > 0 && start < 7e12)) fail(400, 'An event needs a title and a start time.');
    if (allDay) { start = Math.floor(start / DAY) * DAY; end = end > start ? Math.ceil(end / DAY) * DAY : start + DAY; } else if (!(end > start)) end = start + 30 * MIN;
    if (end - start > 366 * DAY) fail(400, 'An event can last one year at most.');
    const tz = C.validTz(b.tz) ? b.tz : x.tz || SERVER_TZ;
    const repeat = b.repeat === undefined ? x.repeat || null : C.normRepeat(b.repeat);
    if (repeat && repeat.freq === 'weekly') { const dow = C.wall(start, allDay ? 'UTC' : tz).dow; if (!repeat.days.includes(dow)) repeat.days = [...repeat.days, dow].sort(); }
    const timing = start !== x.start || JSON.stringify(repeat) !== JSON.stringify(x.repeat || null) || tz !== x.tz || allDay !== !!x.allDay;
    Object.assign(x, { title, start, end, allDay, tz, repeat, location: str(keep('location', (v) => v) || '', 200).trim(), online: !!keep('online', (v) => v), notes: str(keep('notes', (v) => v) || '', 2000), remind: Math.max(0, Math.min(Math.round(num(keep('remind', (v) => v))), 10080)) });
    if (!repeat) delete x.exdates; else if (timing && x.exdates) delete x.exdates; // a new pattern: deleted occurrences no longer line up
    if (timing) delete x.remOcc;
    x.reminded = true; x.v = 2; x.mod = Date.now();
  }
  // moving a series by drag and drop: deleted occurrences move along (snapped to the new pattern)
  function shiftExdates(x, delta) {
    if (!x.repeat || !x.exdates || !x.exdates.length || !delta) return;
    const moved = x.exdates.map((t) => t + delta), lo = Math.min(...moved) - 3 * 3600000, hi = Math.max(...moved) + 3 * 3600000;
    const occ = C.expand({ ...x, exdates: [] }, lo, hi, 5000).map((o) => o.start);
    x.exdates = moved.map((t) => occ.reduce((best, o) => (Math.abs(o - t) < Math.abs(best - t) ? o : best), Infinity)).filter((t) => Number.isFinite(t) && moved.some((m) => Math.abs(m - t) <= 2 * 3600000));
  }
  api['POST /api/event'] = async (req, res, me) => {
    const b = await body(req, 16384), chan = str(b.chan, 64), op = str(b.op, 10), e = writer(me, chan);
    const find = () => { const x = e.events.find((y) => y.id === str(b.id, 16)); if (!x) fail(404, 'No such event'); return x; };
    let id = str(b.id, 16);
    if (op === 'add') {
      if (e.events.length >= 1000) fail(400, 'Too many events in this chat.');
      if (!rate('ev:' + me.id, 60, 60000)) fail(429, 'You are adding events too fast.');
      const x = { id: rid(6), by: me.id, ts: Date.now(), rsvp: {} }; setFields(x, b); e.events.push(x); id = x.id;
    } else if (op === 'edit' || op === 'move') {
      const x = find(); if (!mayEdit(me, x)) fail(403, 'Only the creator or an admin can change this.');
      if (op === 'edit') setFields(x, b);
      else { const delta = num(b.start) - x.start, len = num(b.end) - num(b.start); const exd = x.exdates; setFields(x, { start: num(b.start), end: len > 0 ? num(b.start) + len : num(b.start) + (evEnd(x) - x.start) }); if (exd) { x.exdates = exd; shiftExdates(x, delta); } }
    } else if (op === 'del') { const x = find(); if (!mayEdit(me, x)) fail(403, 'Only the creator or an admin can delete this.'); e.events = e.events.filter((y) => y !== x); }
    else if (op === 'delocc') { // delete one occurrence of a repeating event
      const x = find(); if (!mayEdit(me, x)) fail(403, 'Only the creator or an admin can delete this.');
      const occ = num(b.occ); if (!x.repeat) fail(400, 'This event does not repeat.');
      if (!C.expand(x, occ - 1, occ + 1, 2).some((o) => o.start === occ)) fail(404, 'That occurrence is not on the calendar.');
      x.exdates = [...(x.exdates || []), occ].slice(-500); x.mod = Date.now();
    } else fail(400, 'Bad operation');
    e.events.sort((a, c) => a.start - c.start); store.save(); changed(chan); json(res, 200, { ok: true, id });
  };
  // Accept / Tentative / Decline for plain events (meetings use /api/meetings/rsvp)
  api['POST /api/calendar/rsvp'] = async (req, res, me) => {
    const b = await body(req, 512), chan = str(b.chan, 64), e = see(me, chan), x = e.events.find((y) => y.id === str(b.id, 16)); if (!x) fail(404, 'No such event');
    const r = str(b.rsvp, 8); if (!['yes', 'maybe', 'no', ''].includes(r)) fail(400, 'Pick Accept, Tentative or Decline.');
    if (!rate('evr:' + me.id, 60, 60000)) fail(429, 'Slow down.');
    const prev = (x.rsvp ||= {})[me.id] || ''; if (r) x.rsvp[me.id] = r; else delete x.rsvp[me.id];
    store.save(); changed(chan);
    if (r && r !== prev && x.by !== me.id) ctx.activity(x.by, { type: 'event', kind: 'rsvp', from: me.id, chan, event: x.id, title: x.title, start: x.start, rsvp: r });
    json(res, 200, { ok: true, rsvp: r });
  };

  // ---------- reading: occurrences in a date range, from every chat you are in (or one chat) ----------
  const occOut = (chan, x, o, me) => ({ id: x.id, chan, occ: o.start, start: o.start, end: o.end > o.start ? o.end : o.start + 30 * MIN, title: x.title, allDay: !!x.allDay, tz: x.tz || '', by: x.by, location: x.location || '', online: !!x.online, notes: x.notes || '', remind: x.remind || 0, repeat: x.repeat || null, rsvp: x.rsvp || {}, series: { start: x.start, end: evEnd(x) }, canEdit: mayEdit(me, x) });
  const range = (q, maxDays) => { const from = num(q.get('from')), to = num(q.get('to')); if (!(from > 0) || !(to > from) || to - from > maxDays * DAY) fail(400, `Pick a date range (up to ${maxDays} days).`); return [from, to]; };
  api['GET /api/calendar'] = async (req, res, me, url) => {
    const q = url.searchParams, [from, to] = range(q, 400), only = str(q.get('chan') || '', 64); if (only) see(me, only);
    const out = [];
    for (const chan of only ? [only] : Object.keys(db.extras)) {
      const e = db.extras[chan]; if (!e || !Array.isArray(e.events) || !e.events.length || !canSee(me, chan)) continue;
      for (const x of e.events) for (const o of C.expand(ser(x), from, to, 400)) { out.push(occOut(chan, x, o, me)); if (out.length >= 5000) break; }
    }
    out.sort((a, b) => a.start - b.start); json(res, 200, { events: out, tz: SERVER_TZ });
  };

  // ---------- free / busy (scheduling assistant): busy blocks only; titles only for chats / meetings you are in ----------
  api['GET /api/freebusy'] = async (req, res, me, url) => {
    const q = url.searchParams, [from, to] = range(q, 31);
    if (!rate('fb:' + me.id, 60, 60000)) fail(429, 'Slow down.');
    const ids = [...new Set((q.get('users') || '').split(',').filter((id) => { const u = userById(id); return u && !u.removed && !u.deleted; }))].slice(0, 20), busy = {};
    for (const id of ids) busy[id] = [];
    for (const [chan, e] of Object.entries(db.extras)) {
      if (!e || !Array.isArray(e.events) || !validChan(chan)) continue; const mine = canSee(me, chan);
      for (const x of e.events) {
        const who = ids.filter((id) => { const r = (x.rsvp || {})[id]; return r !== 'no' && (x.by === id || r === 'yes' || r === 'maybe') && canSee(userById(id), chan); });
        if (!who.length) continue;
        for (const o of C.expand(ser(x), from, to, 200)) for (const id of who) busy[id].push({ start: o.start, end: o.end, allDay: !!x.allDay, tentative: (x.rsvp || {})[id] === 'maybe' || undefined, title: mine ? x.title : undefined });
      }
    }
    for (const m of Object.values(db.meetings || {})) { // meetings area: organizer + invitees who did not decline
      if (!m || typeof m !== 'object' || m.cancelled || m.adhoc || !(m.end > m.start)) continue;
      const parts = [m.organizer, ...(m.invitees || []), ...(m.optional || [])], rs = m.rsvp || {}, who = ids.filter((id) => parts.includes(id) && rs[id] !== 'no'); if (!who.length) continue;
      const mine = parts.includes(me.id) || (!!m.chan && canSee(me, m.chan)), starts = ctx.meetingOccurrences ? ctx.meetingOccurrences(m, from, to) : m.start < to && m.end > from ? [m.start] : [];
      for (const s of starts) for (const id of who) busy[id].push({ start: s, end: s + (m.end - m.start), allDay: !!m.allDay, tentative: rs[id] === 'maybe' || undefined, title: mine ? m.title : undefined });
    }
    for (const id of ids) busy[id].sort((a, b) => a.start - b.start);
    json(res, 200, { busy });
  };

  // ---------- .ics export / import ----------
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsUnesc = (s) => String(s || '').replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
  const p2 = (n) => String(n).padStart(2, '0');
  const utcStamp = (ts) => { const d = new Date(ts); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`; };
  const dateStamp = (ts) => { const d = new Date(ts); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`; };
  const localStamp = (ts, tz) => { const w = C.wall(ts, tz); return `${w.y}${p2(w.m + 1)}${p2(w.d)}T${p2(w.h)}${p2(w.mi)}${p2(w.s)}`; };
  function fold(line) { // 75 octets per line, never splitting a UTF-8 character
    const out = []; let cur = '', bytes = 0;
    for (const ch of line) { const n = Buffer.byteLength(ch); if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; } cur += ch; bytes += n; }
    out.push(cur); return out.join('\r\n ');
  }
  function vevent(uid, x, extra = []) {
    const timed = !x.allDay, zoned = timed && x.repeat && x.tz && x.tz !== 'UTC' && C.validTz(x.tz);
    const dt = (k, ts) => (!timed ? `${k};VALUE=DATE:${dateStamp(ts)}` : zoned ? `${k};TZID=${x.tz}:${localStamp(ts, x.tz)}` : `${k}:${utcStamp(ts)}`);
    const L = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(x.mod || x.ts || Date.now())}`, dt('DTSTART', x.start), dt('DTEND', evEnd(x)), `SUMMARY:${icsEsc(x.title)}`];
    const r = x.repeat;
    if (r) {
      const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], freq = r.freq === 'weekdays' ? 'WEEKLY' : r.freq.toUpperCase(), parts = [`FREQ=${freq}`];
      if (r.interval > 1 && r.freq !== 'weekdays') parts.push(`INTERVAL=${r.interval}`);
      if (r.freq === 'weekdays') parts.push('BYDAY=MO,TU,WE,TH,FR'); else if (r.freq === 'weekly' && r.days && r.days.length) parts.push('BYDAY=' + r.days.map((d) => DAYS[d]).join(','));
      if (r.count) parts.push(`COUNT=${r.count}`); else if (r.until) parts.push(`UNTIL=${utcStamp(r.until)}`);
      L.push('RRULE:' + parts.join(';'));
      for (const e of (x.exdates || []).slice(0, 200)) L.push(dt('EXDATE', e));
    }
    if (x.notes || x.details) L.push(`DESCRIPTION:${icsEsc(x.notes || x.details)}`);
    if (x.location) L.push(`LOCATION:${icsEsc(x.location)}`);
    L.push(...extra, 'END:VEVENT'); return L;
  }
  api['GET /api/calendar/ics'] = async (req, res, me, url) => {
    const only = str(url.searchParams.get('chan') || '', 64); if (only) see(me, only);
    if (!rate('ics:' + me.id, 20, 60000)) fail(429, 'Too many downloads at once. Wait a moment.');
    const name = only ? chatTitle(only).replace(/^#/, '') : `${S.name || 'LANChat'} calendar`, L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LANChat//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(name)}`];
    let n = 0;
    for (const [chan, e] of Object.entries(db.extras)) {
      if ((only && chan !== only) || !e || !Array.isArray(e.events) || !canSee(me, chan)) continue;
      for (const x of e.events) { if (n++ >= 5000) break; L.push(...vevent(`${x.id}-${chan.replace(/[^\w-]/g, '')}@lanchat`, x, [`X-LANCHAT-CHAT:${icsEsc(chatTitle(chan))}`])); }
    }
    for (const m of Object.values(db.meetings || {})) { // meetings you are in (all of them for "my calendar", that chat's for one chat)
      if (!m || typeof m !== 'object' || m.cancelled || m.adhoc || !(m.end > m.start) || (only && m.chan !== only)) continue;
      if (![m.organizer, ...(m.invitees || []), ...(m.optional || [])].includes(me.id) || (m.rsvp || {})[me.id] === 'no') continue;
      const r = m.repeat && ['daily', 'weekly', 'monthly'].includes(m.repeat.freq) ? { freq: m.repeat.freq, interval: m.repeat.interval || 1, days: m.repeat.days, until: m.repeat.until } : null;
      let x = { ...m, repeat: r, exdates: m.skip || [], notes: m.details };
      if (m.allDay) { const w = C.wall(m.start, m.tz || SERVER_TZ), d0 = Date.UTC(w.y, w.m, w.d); x = { ...x, start: d0, end: d0 + Math.max(1, Math.round((m.end - m.start) / DAY)) * DAY, exdates: (m.skip || []).map((t) => { const z = C.wall(t, m.tz || SERVER_TZ); return Date.UTC(z.y, z.m, z.d); }) }; } // meetings keep all-day days as local midnights
      L.push(...vevent(`${String(m.id).replace(/[^\w-]/g, '')}@meetings.lanchat`, x));
    }
    L.push('END:VCALENDAR');
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'calendar')}.ics`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(L.map(fold).join('\r\n') + '\r\n');
  };
  function parseDt(p, tz) {
    const v = String(p.value || '').trim(); let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m || /^DATE$/i.test(p.params.VALUE || '')) { m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v); return m ? { ts: Date.UTC(+m[1], +m[2] - 1, +m[3]), date: true } : null; }
    m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v); if (!m) return null;
    const [y, mo, d, h, mi, s] = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)];
    if (m[7]) return { ts: Date.UTC(y, mo, d, h, mi, s), tz: 'UTC' };
    const z = C.validTz(p.params.TZID) ? p.params.TZID : tz; return { ts: C.fromWall(y, mo, d, h, mi, z) + s * 1000, tz: z };
  }
  const parseDur = (v) => { const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim()); if (!m) return 0; const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * MIN) + ((+m[6] || 0) * 1000); return m[1] === '-' ? -ms : ms; };
  function parseRule(v, tz) {
    const o = {}; for (const kv of String(v).split(';')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); }
    const f = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[String(o.FREQ || '').toUpperCase()]; if (!f) return { unsupported: true };
    const r = { freq: f, interval: Math.max(1, +o.INTERVAL || 1) };
    if (o.BYDAY) {
      const raw = o.BYDAY.split(','), idx = raw.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d.replace(/^[+-]?\d+/, '').toUpperCase())).filter((x) => x >= 0);
      if (raw.some((d) => /\d/.test(d)) || (f !== 'weekly' && f !== 'daily')) return { unsupported: true }; // "second Tuesday of the month" and the like
      if (idx.length === 5 && [1, 2, 3, 4, 5].every((x) => idx.includes(x)) && r.interval === 1) { r.freq = 'weekdays'; } else { r.freq = 'weekly'; r.days = idx; }
    }
    if (o.BYMONTHDAY || o.BYSETPOS || o.BYYEARDAY || o.BYWEEKNO || o.BYHOUR) return { unsupported: true };
    if (o.COUNT) r.count = +o.COUNT; else if (o.UNTIL) { const u = parseDt({ value: o.UNTIL, params: {} }, tz); if (u) r.until = u.date ? u.ts + DAY - 1 : u.ts; }
    return r;
  }
  function parseIcs(text, tz) {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'), out = []; let cur = null, depth = 0;
    for (const line of lines) {
      if (/^BEGIN:VEVENT\s*$/i.test(line)) { cur = {}; depth = 0; continue; }
      if (!cur) continue;
      if (/^END:VEVENT\s*$/i.test(line)) { out.push(cur); cur = null; if (out.length >= 2000) break; continue; }
      if (/^BEGIN:/i.test(line)) { depth++; continue; } if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); continue; }
      if (depth) continue; // alarms and the like
      const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line); if (!m) continue;
      const params = {}; for (const pp of m[2].split(';').slice(1)) { const i = pp.indexOf('='); if (i > 0) params[pp.slice(0, i).toUpperCase()] = pp.slice(i + 1).replace(/^"|"$/g, ''); }
      const k = m[1].toUpperCase(); if (!own(cur, k)) cur[k] = []; if (cur[k].length < 50) cur[k].push({ params, value: m[3] });
    }
    return out.map((v) => {
      const g = (k) => (own(v, k) ? v[k][0] : null);
      if (g('STATUS') && /CANCELLED/i.test(g('STATUS').value)) return null;
      const ds = g('DTSTART') && parseDt(g('DTSTART'), tz); if (!ds || !(ds.ts > 0 && ds.ts < 7e12)) return null;
      const de = g('DTEND') && parseDt(g('DTEND'), tz); let end = de ? de.ts : g('DURATION') ? ds.ts + parseDur(g('DURATION').value) : 0;
      const allDay = !!ds.date; if (!(end > ds.ts)) end = allDay ? ds.ts + DAY : ds.ts + 30 * MIN;
      const rule = g('RRULE') ? parseRule(g('RRULE').value, ds.tz || tz) : null, exdates = [];
      for (const e of v.EXDATE || []) for (const part of String(e.value).split(',')) { const d = parseDt({ value: part, params: e.params }, ds.tz || tz); if (d) exdates.push(d.ts); }
      return { title: icsUnesc(g('SUMMARY') && g('SUMMARY').value).trim().slice(0, 100) || 'Untitled event', start: ds.ts, end, allDay, tz: allDay ? tz : ds.tz || tz, repeat: rule && !rule.unsupported ? rule : null, partial: !!(rule && rule.unsupported), exdates, location: icsUnesc(g('LOCATION') && g('LOCATION').value).slice(0, 200), notes: icsUnesc(g('DESCRIPTION') && g('DESCRIPTION').value).slice(0, 2000) };
    }).filter(Boolean);
  }
  api['POST /api/calendar/import'] = async (req, res, me) => {
    const b = await body(req, 1300000), chan = str(b.chan, 64), e = writer(me, chan), tz = C.validTz(b.tz) ? b.tz : SERVER_TZ;
    if (!rate('icsin:' + me.id, 10, 60000)) fail(429, 'Too many imports at once. Wait a moment.');
    const text = str(b.ics, 1250000); if (!/BEGIN:VCALENDAR/i.test(text)) fail(400, 'That is not a calendar (.ics) file.');
    const list = parseIcs(text, tz); let added = 0, partial = 0;
    for (const v of list) {
      if (e.events.length >= 1000 || added >= 500) break;
      const x = { id: rid(6), by: me.id, ts: Date.now(), rsvp: {}, imported: true };
      try { setFields(x, { ...v, remind: 0, online: false }); } catch { continue; }
      if (v.repeat && v.exdates.length) x.exdates = v.exdates.slice(0, 500);
      e.events.push(x); added++; if (v.partial) partial++;
    }
    if (!added) fail(400, list.length ? 'This chat has too many events.' : 'No events found in that file.');
    e.events.sort((a, c) => a.start - c.start); store.save(); changed(chan);
    json(res, 200, { ok: true, added, skipped: list.length - added, partial });
  };

  // ---------- personal settings: category names, a category per event or meeting, a second time zone ----------
  const CATS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'], KEY = /^(e:[\w:-]{1,64}\/[\w-]{1,24}|m:[\w-]{1,48})$/;
  const prefsOf = (uid) => { const all = coll('calPrefs'); const p = own(all, uid) ? all[uid] : {}; return { cats: p.cats || {}, catOf: p.catOf || {}, tz2: p.tz2 || '', view: p.view || '' }; };
  api['GET /api/calendar/prefs'] = async (req, res, me) => json(res, 200, prefsOf(me.id));
  api['POST /api/calendar/prefs'] = async (req, res, me) => {
    const b = await body(req, 8192), all = coll('calPrefs'), p = prefsOf(me.id);
    if (b.cats && typeof b.cats === 'object') { p.cats = {}; for (const c of CATS) { const n = str(b.cats[c], 40).trim(); if (n) p.cats[c] = n; } }
    if (b.cat && typeof b.cat === 'object') { const k = str(b.cat.key, 120), c = str(b.cat.color, 10); if (!KEY.test(k)) fail(400, 'Bad event'); if (CATS.includes(c)) p.catOf[k] = c; else delete p.catOf[k]; const ks = Object.keys(p.catOf); if (ks.length > 2000) for (const k2 of ks.slice(0, ks.length - 2000)) delete p.catOf[k2]; }
    if (b.tz2 !== undefined) p.tz2 = C.validTz(b.tz2) ? b.tz2 : '';
    if (b.view !== undefined) p.view = ['day', 'workweek', 'week', 'month'].includes(b.view) ? b.view : '';
    all[me.id] = p; store.save(); emit('fl_calprefs', p, [me.id]); json(res, 200, p);
  };
  ctx.hooks.initExtra.push((u) => ({ flCal: prefsOf(u.id) }));

  // ---------- reminders (per occurrence; old events are migrated so the old tick leaves them alone) ----------
  ctx.ticks.push({ every: 15000, fn: (now) => {
    for (const [chan, e] of Object.entries(db.extras)) {
      if (!e || !Array.isArray(e.events) || (!db.channels[chan] && !chan.startsWith('dm:'))) continue;
      let dirty = false;
      for (const x of e.events) {
        if (x.v !== 2) { if (x.reminded) x.remOcc = x.start; x.reminded = true; x.v = 2; dirty = true; } // the old tick may have reminded it already
        if (!x.remind) continue;
        const lead = x.remind * MIN, pad = x.allDay ? DAY : 0;
        for (const o of C.expand(ser(x), now - 3600000 - pad, now + lead + MIN + pad, 4)) {
          if (o.start <= (x.remOcc || 0)) continue;
          const w = C.wall(o.start, 'UTC'), at = x.allDay ? C.fromWall(w.y, w.m, w.d, 0, 0, x.tz || SERVER_TZ) : o.start;
          if (at - lead > now) break;
          x.remOcc = o.start; dirty = true; if (at <= now - 3600000) continue;
          const when = at - now > MIN ? `in ${Math.round((at - now) / MIN)} min` : 'now';
          const ids = (audience(chan) || Object.values(db.users).filter((u) => !u.removed && !u.deleted && canSee(u, chan)).map((u) => u.id)).filter((id) => (x.rsvp || {})[id] !== 'no');
          sysMsg(chan, `⏰ ${x.title} starts ${when}`); emit('reminder', { chan, text: `${x.title} starts ${when}`, ts: now, event: x.id }, ids);
          break;
        }
      }
      if (dirty) { store.save(); changed(chan); }
    }
  } });
  ctx.calendar = { parseIcs, expand: C.expand };
};
