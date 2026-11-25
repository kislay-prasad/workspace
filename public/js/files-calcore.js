'use strict';
// Calendar core shared by the server (require) and the browser (LC.calcore): time zones and repeating events.
// Events: { start, end, allDay, tz, repeat: { freq: daily|weekdays|weekly|monthly|yearly, interval, days: [0-6, Sun=0], until, count }, exdates: [occurrence start] }.
// Timed events repeat at the same wall-clock time in their own time zone (so 9:00 stays 9:00 across daylight-saving changes);
// all-day events are stored as UTC midnights (start inclusive, end exclusive) so they land on the same date for everyone.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else { root.LC = root.LC || {}; root.LC.calcore = api; } })(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000, WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], fmts = new Map(), okTz = new Map();
  const FREQS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
  function validTz(tz) {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    if (!okTz.has(tz)) { let ok = true; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { ok = false; } okTz.set(tz, ok); }
    return okTz.get(tz);
  }
  const utcParts = (ts) => { const d = new Date(ts); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() }; };
  function wall(ts, tz) { // the wall-clock time at instant ts in zone tz (month 0-based)
    if (!tz || tz === 'UTC' || !validTz(tz)) return utcParts(ts);
    let f = fmts.get(tz);
    if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }); fmts.set(tz, f); }
    const o = {}; for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, dow: WD.indexOf(o.weekday) };
  }
  const offset = (ts, tz) => { const p = wall(ts, tz); return Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - (ts - (((ts % 1000) + 1000) % 1000)); }; // ms east of UTC
  function fromWall(y, m, d, h, mi, tz) { // the instant when the clock in zone tz shows y-m-d h:mi (m 0-based; overflowing days/months roll over)
    const guess = Date.UTC(y, m, d, h, mi);
    if (!tz || tz === 'UTC' || !validTz(tz)) return guess;
    const o1 = offset(guess, tz); let ts = guess - o1; const o2 = offset(ts, tz);
    if (o2 !== o1) { const t2 = guess - o2; if (offset(t2, tz) === o2) ts = t2; }
    return ts;
  }
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  function normRepeat(r) {
    if (!r || typeof r !== 'object' || !FREQS.includes(r.freq)) return null;
    const out = { freq: r.freq, interval: Math.max(1, Math.min(99, Math.round(Number(r.interval)) || 1)) };
    if (r.freq === 'weekly') out.days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
    const until = Number(r.until), count = Math.round(Number(r.count));
    if (count > 0) out.count = Math.min(count, 999); else if (until > 0 && until < 7e12) out.until = until;
    return out;
  }
  // occurrences of ev overlapping [from, to): [{ start, end }]
  function expand(ev, from, to, max = 500) {
    const out = [], dur = Math.max(0, (ev.end || ev.start) - ev.start), tz = ev.allDay ? 'UTC' : ev.tz || 'UTC', len = Math.max(dur, 1);
    const r = ev.repeat && FREQS.includes(ev.repeat.freq) ? ev.repeat : null, ex = new Set(Array.isArray(ev.exdates) ? ev.exdates : []);
    if (!r) { if (ev.start < to && ev.start + len > from) out.push({ start: ev.start, end: ev.start + dur }); return out; }
    const b = wall(ev.start, tz), iv = Math.max(1, Math.min(99, r.interval | 0 || 1)), until = r.until > 0 ? r.until : Infinity, count = r.count > 0 ? r.count | 0 : 0;
    let n = 0, guard = 0;
    const emit = (y, m, d) => { // false = stop
      const s = fromWall(y, m, d, b.h, b.mi, tz);
      if (s < ev.start) return true;
      n++; if ((count && n > count) || s > until || s >= to) return false;
      if (s + len > from && !ex.has(s)) { out.push({ start: s, end: s + dur }); if (out.length >= max) return false; }
      return true;
    };
    const at = (k) => { const x = new Date(Date.UTC(b.y, b.m, b.d + k)); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), x.getUTCDay()]; };
    const skip = (period) => (!count && from - len > ev.start + 2 * period ? Math.max(0, Math.floor((from - len - ev.start) / period) - 2) : 0);
    if (r.freq === 'daily') { for (let k = skip(iv * DAY) * iv; guard++ < 6000; k += iv) { const [y, m, d] = at(k); if (!emit(y, m, d)) break; } }
    else if (r.freq === 'weekdays') { for (let k = skip(DAY); guard++ < 9000; k++) { const [y, m, d, dow] = at(k); if (dow === 0 || dow === 6) continue; if (!emit(y, m, d)) break; } }
    else if (r.freq === 'weekly') {
      const days = (r.days && r.days.length ? r.days : [b.dow]).slice().sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)), mon = -((b.dow + 6) % 7);
      outer: for (let w = skip(iv * 7 * DAY) * iv; guard++ < 4000; w += iv) for (const dw of days) { const k = mon + w * 7 + ((dw + 6) % 7); if (k < 0) continue; const [y, m, d] = at(k); if (!emit(y, m, d)) break outer; }
    } else if (r.freq === 'monthly') { for (let k = 0; guard++ < 2400; k += iv) { const mm = b.m + k, y = b.y + Math.floor(mm / 12), m = ((mm % 12) + 12) % 12; if (b.d > dim(y, m)) continue; if (!emit(y, m, b.d)) break; } }
    else if (r.freq === 'yearly') { for (let k = 0; guard++ < 500; k += iv) { const y = b.y + k; if (b.d > dim(y, b.m)) continue; if (!emit(y, b.m, b.d)) break; } }
    return out;
  }
  return { DAY, FREQS, validTz, wall, fromWall, offset, expand, normRepeat, dim };
});
