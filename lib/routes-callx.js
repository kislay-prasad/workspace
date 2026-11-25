'use strict';
// Calls area, the parts that outlive a call: call history (db.callLog), per-person call settings (forwarding, voicemail
// greeting, ringtones, speed dial...), voicemail, call ratings and quality, and the walkie-talkie (push to talk).
const fs = require('fs');
const path = require('path');

module.exports = (ctx) => {
  const { api, db, P, json, body, fail, rid, str, rate, isObj, canSee, audience, emit, userById, coll, store, activity, online, hooks } = ctx;
  const X = ctx.callx; // from routes-calls.js
  const see = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  const live = (u) => !!u && !u.removed && !u.deleted;
  const EP = /^[A-Za-z0-9_-]{4,40}$/;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

  // ---------- call history ----------
  // f: all | missed | incoming | outgoing. Only calls you were part of (started, joined, rung or missed) in chats you can still see.
  api['GET /api/callx/history'] = async (req, res, me, url) => {
    const f = url.searchParams.get('f') || 'all', before = Number(url.searchParams.get('before')) || Infinity, limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 60));
    const out = [];
    for (let i = X.callLog().length - 1; i >= 0 && out.length < limit; i--) {
      const e = X.callLog()[i]; if (!e || e.start >= before) continue;
      const mine = e.by === me.id || (e.parts || []).includes(me.id) || (e.rung || []).includes(me.id) || (e.missed || []).includes(me.id);
      if (!mine || !canSee(me, e.chan)) continue;
      const dir = e.by === me.id ? 'out' : 'in', miss = (e.missed || []).includes(me.id) && !(e.parts || []).includes(me.id);
      if ((f === 'missed' && !miss) || (f === 'incoming' && dir !== 'in') || (f === 'outgoing' && dir !== 'out')) continue;
      out.push({ id: e.id, chan: e.chan, mode: e.mode, by: e.by, start: e.start, end: e.end || 0, parts: e.parts || [], dir, missed: miss, live: !e.end && !!ctx.calls.get(e.chan) && ctx.calls.get(e.chan).id === e.id, rated: !!(e.ratings && e.ratings[me.id]) });
    }
    json(res, 200, { calls: out });
  };
  const entryFor = (me, id) => { const e = X.callLog().find((x) => x && x.id === str(id, 16)); if (!e || !(e.parts || []).includes(me.id)) fail(404, 'No such call'); return e; };
  const ISSUES = ['audio', 'video', 'screen', 'echo', 'dropped', 'other'];
  api['POST /api/callx/rate'] = async (req, res, me) => {
    const b = await body(req, 1024), e = entryFor(me, b.id), stars = Math.round(Number(b.stars));
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Pick 1 to 5 stars.');
    const issues = Array.isArray(b.issues) ? [...new Set(b.issues.filter((x) => ISSUES.includes(x)))] : [];
    (e.ratings ||= {})[me.id] = { stars, issues, at: Date.now() }; store.save(); json(res, 200, { ok: true });
  };
  // a summary of the network quality you saw during the call (round-trip ms, packet loss %, jitter ms)
  api['POST /api/callx/quality'] = async (req, res, me) => {
    const b = await body(req, 1024), e = entryFor(me, b.id);
    (e.quality ||= {})[me.id] = { rtt: Math.round(num(b.rtt, 0, 10000)), loss: Math.round(num(b.loss, 0, 100) * 10) / 10, jitter: Math.round(num(b.jitter, 0, 10000)) };
    store.save(); json(res, 200, { ok: true });
  };

  // ---------- call settings (db.callPrefs[uid]) ----------
  const TONES = ['classic', 'chimes', 'marimba', 'bright', 'pulse', 'retro', 'none'];
  const prefs = (uid) => { const all = coll('callPrefs'); return isObj(all[uid]) ? all[uid] : {}; };
  const fwdVal = (me, v, dflt) => { const s = str(v, 32); if (s === 'off' || s === 'voicemail') return s; const u = userById(s); return live(u) && u.id !== me.id ? u.id : dflt; };
  hooks.initExtra.push((u) => ({ callPrefs: prefs(u.id) }));
  api['GET /api/callx/prefs'] = async (req, res, me) => json(res, 200, { prefs: prefs(me.id) });
  api['POST /api/callx/prefs'] = async (req, res, me) => {
    const b = await body(req, 8192), cur = { ...prefs(me.id) };
    if (isObj(b.forward)) cur.forward = { always: fwdVal(me, b.forward.always, 'off'), unanswered: fwdVal(me, b.forward.unanswered, 'voicemail'), busy: fwdVal(me, b.forward.busy, 'voicemail') };
    if (b.greeting !== undefined) cur.greeting = str(b.greeting, 200).replace(/[\u0000-\u001f]/g, ' ').trim();
    if (b.ringtone !== undefined) cur.ringtone = TONES.includes(b.ringtone) ? b.ringtone : 'classic';
    if (b.ringtoneFwd !== undefined) cur.ringtoneFwd = TONES.includes(b.ringtoneFwd) ? b.ringtoneFwd : 'chimes';
    if (b.autoRecord !== undefined) cur.autoRecord = !!b.autoRecord;
    if (b.askRating !== undefined) cur.askRating = !!b.askRating;
    if (b.speedDial !== undefined) { if (!Array.isArray(b.speedDial)) fail(400, 'Bad speed dial'); cur.speedDial = [...new Set(b.speedDial.filter((i) => typeof i === 'string' && i !== me.id && live(userById(i))))].slice(0, 20); }
    coll('callPrefs')[me.id] = cur; store.save(); emit('callprefs', cur, [me.id]); json(res, 200, { ok: true, prefs: cur });
  };

  // ---------- voicemail (db.voicemail[uid] = [{ id, from, chan, file, dur, ts, heard }]; audio in <data>/voicemail/) ----------
  const VM_DIR = path.join(P.dir, 'voicemail'); try { fs.mkdirSync(VM_DIR, { recursive: true }); } catch {}
  const box = (uid) => { const all = coll('voicemail'); if (!Array.isArray(all[uid])) all[uid] = []; return all[uid]; };
  const vmOut = (v) => ({ id: v.id, from: v.from, chan: v.chan, dur: v.dur, ts: v.ts, heard: !!v.heard, size: v.size, type: v.type });
  api['GET /api/voicemail/greeting'] = async (req, res, me, url) => { const u = userById(str(url.searchParams.get('to'), 32)); if (!live(u)) fail(404, 'No such person'); json(res, 200, { greeting: prefs(u.id).greeting || '', name: u.name }); };
  api['POST /api/voicemail/leave'] = async (req, res, me) => {
    const b = await body(req, 1024), to = userById(str(b.to, 32)), chan = str(b.chan, 64); see(me, chan);
    if (!live(to) || to.id === me.id) fail(400, 'Pick who the voicemail is for.');
    if (!chan.startsWith('dm:') || !chan.split(':').includes(to.id) || !chan.split(':').includes(me.id)) fail(400, 'Voicemail is for 1:1 calls.');
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('vm:' + me.id, 10, 600000)) fail(429, 'Too many voicemails. Wait a few minutes.');
    const f = db.files[str(b.file, 24)]; if (!f || f.by !== me.id || !/\.(weba|webm|ogg|opus|m4a|mp4|wav|mp3)$/i.test(f.name) || f.size > 6 * 1048576) fail(400, 'Record the voicemail first (up to 2 minutes).');
    const list = box(to.id); if (list.length >= 100) list.shift();
    const id = rid(6), ext = path.extname(f.name).toLowerCase();
    try { fs.renameSync(path.join(P.uploads, f.id), path.join(VM_DIR, id + ext)); } catch { fail(500, 'Could not save the voicemail.'); }
    delete db.files[f.id];
    const v = { id, from: me.id, chan, file: id + ext, dur: Math.round(num(b.dur, 0, 130)), ts: Date.now(), heard: false, size: f.size, type: ext.slice(1) };
    list.push(v); store.save();
    activity(to.id, { type: 'voicemail', from: me.id, chan, vm: id, dur: v.dur });
    emit('voicemail', vmOut(v), [to.id]); json(res, 200, { ok: true, id });
  };
  api['GET /api/voicemail'] = async (req, res, me) => { const l = box(me.id); json(res, 200, { voicemail: l.slice().reverse().map(vmOut), unheard: l.filter((v) => !v.heard).length }); };
  const vmFind = (me, id) => { const v = box(me.id).find((x) => x.id === str(id, 16)); if (!v) fail(404, 'No such voicemail'); return v; };
  api['POST /api/voicemail/heard'] = async (req, res, me) => { const b = await body(req, 256), v = vmFind(me, b.id); v.heard = b.heard !== false; store.save(); emit('voicemailstate', { id: v.id, heard: v.heard }, [me.id]); json(res, 200, { ok: true }); };
  api['POST /api/voicemail/delete'] = async (req, res, me) => {
    const b = await body(req, 256), v = vmFind(me, b.id), l = box(me.id); l.splice(l.indexOf(v), 1); store.save();
    fs.unlink(path.join(VM_DIR, path.basename(v.file)), () => {}); emit('voicemailstate', { id: v.id, deleted: true }, [me.id]); json(res, 200, { ok: true });
  };
  const AUDIO = { weba: 'audio/webm', webm: 'audio/webm', ogg: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg' };
  // streams your own voicemail (with byte ranges, so the audio player can seek)
  api['GET /api/voicemail/audio'] = async (req, res, me, url) => {
    const v = vmFind(me, url.searchParams.get('id')), file = path.join(VM_DIR, path.basename(v.file));
    let st; try { st = fs.statSync(file); } catch { fail(404, 'That voicemail is gone.'); }
    const size = st.size, r = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range); let start = 0, end = size - 1, status = 200;
    if (r && (r[1] || r[2])) { if (r[1]) { start = Number(r[1]); if (r[2]) end = Math.min(Number(r[2]), size - 1); } else start = Math.max(0, size - Number(r[2])); if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); } status = 206; }
    const h = { 'Content-Type': AUDIO[v.type] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
    if (status === 206) h['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(status, h); fs.createReadStream(file, { start, end }).pipe(res);
  };

  // ---------- walkie-talkie: push to talk in a chat; one talker at a time, the server grants the floor ----------
  const walkies = new Map(); // chan -> { eps: Map(ep -> { uid, at }), floor: { ep, uid, at } | null }
  const FLOOR_MS = 60000, WALKIE_IDLE = 40000;
  const wOut = (chan) => { const w = walkies.get(chan); return w ? { chan, people: [...new Set([...w.eps.values()].map((e) => e.uid))], eps: [...w.eps].map(([ep, e]) => ({ ep, uid: e.uid })), floor: w.floor ? { uid: w.floor.uid, ep: w.floor.ep, at: w.floor.at } : null } : { chan, people: [], eps: [], floor: null }; };
  const wPush = (chan) => emit('walkie', wOut(chan), audience(chan));
  const inW = async (req, me, size = 512) => {
    const b = await body(req, size), chan = str(b.chan, 64); see(me, chan); const w = walkies.get(chan), ep = str(b.ep, 40);
    if (!w || !w.eps.has(ep) || w.eps.get(ep).uid !== me.id) fail(400, 'Connect to the walkie-talkie first.');
    return { b, chan, w, ep };
  };
  const wDrop = (chan, ep) => { const w = walkies.get(chan); if (!w) return; w.eps.delete(ep); if (w.floor && w.floor.ep === ep) w.floor = null; if (!w.eps.size) walkies.delete(chan); wPush(chan); };
  api['GET /api/walkie/state'] = async (req, res, me) => json(res, 200, { walkies: [...walkies.keys()].filter((c) => canSee(me, c)).map(wOut) });
  api['POST /api/walkie/join'] = async (req, res, me) => {
    const b = await body(req, 512), chan = str(b.chan, 64), ep = str(b.ep, 40); see(me, chan);
    if (!EP.test(ep)) fail(400, 'Bad device id'); if (!rate('walkie:' + me.id, 20, 60000)) fail(429, 'Slow down');
    let w = walkies.get(chan); if (!w) walkies.set(chan, w = { eps: new Map(), floor: null });
    if (w.eps.has(ep) && w.eps.get(ep).uid !== me.id) fail(409, 'That device is already connected.');
    if (w.eps.size >= 25 && !w.eps.has(ep)) fail(409, 'This walkie-talkie channel is full.');
    w.eps.set(ep, { uid: me.id, at: Date.now() }); wPush(chan); json(res, 200, { ok: true, state: wOut(chan) });
  };
  api['POST /api/walkie/leave'] = async (req, res, me) => { const b = await body(req, 512), chan = str(b.chan, 64), w = walkies.get(chan), ep = str(b.ep, 40); if (w && w.eps.has(ep) && w.eps.get(ep).uid === me.id) wDrop(chan, ep); json(res, 200, { ok: true }); };
  api['POST /api/walkie/alive'] = async (req, res, me) => { const { w, ep } = await inW(req, me); w.eps.get(ep).at = Date.now(); json(res, 200, { ok: true }); };
  api['POST /api/walkie/talk'] = async (req, res, me) => {
    const { b, chan, w, ep } = await inW(req, me); const now = Date.now();
    if (b.on) {
      if (me.mutedUntil > now) fail(403, 'You are muted.');
      if (w.floor && w.floor.ep !== ep && now - w.floor.at < FLOOR_MS) fail(409, `${(userById(w.floor.uid) || {}).name || 'Someone'} is talking.`);
      if (!w.floor || w.floor.ep !== ep) w.floor = { ep, uid: me.id, at: now };
    } else if (w.floor && w.floor.ep === ep) w.floor = null;
    w.eps.get(ep).at = now; wPush(chan); json(res, 200, { ok: true, floor: !!(w.floor && w.floor.ep === ep) });
  };
  api['POST /api/walkie/signal'] = async (req, res, me) => {
    const { b, chan, w, ep } = await inW(req, me, 60000), to = str(b.to, 40), kind = str(b.kind, 10);
    if (!w.eps.has(to) || to === ep || !['offer', 'answer', 'ice'].includes(kind)) fail(400, 'Not connected');
    if (!rate('wsig:' + me.id, 600, 60000)) fail(429, 'Too much signaling');
    emit('walkiesig', { chan, from: me.id, fromEp: ep, to, kind, data: b.data }, [w.eps.get(to).uid]); json(res, 200, { ok: true });
  };
  ctx.ticks.push({ every: 2000, fn: (now) => {
    for (const [chan, w] of [...walkies]) {
      let changed = false;
      for (const [ep, e] of [...w.eps]) if (now - e.at > WALKIE_IDLE || !online(e.uid)) { w.eps.delete(ep); changed = true; }
      if (w.floor && (now - w.floor.at > FLOOR_MS || !w.eps.has(w.floor.ep))) { w.floor = null; changed = true; }
      if (!w.eps.size) walkies.delete(chan);
      if (changed) wPush(chan);
    }
  } });
  ctx.walkies = walkies;
};
