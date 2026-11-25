'use strict';
// Calls: WebRTC signaling (media goes peer-to-peer, the server never sees it) and the live state of every call.
// One person can be in a call from several devices ("endpoints", e.g. a laptop plus a phone joined as a companion).
// Also kept here: ringing (missed calls, "leave a voicemail", call forwarding), roles and organizer controls, hold,
// raised-hand order, spotlight, sharing (screen, whiteboard or PDF slides; paused; presenter mode), annotations and the
// remote pointer, the recording state, add people / transfer / consult / park, and the call log (db.callLog).
const crypto = require('crypto');

module.exports = (ctx) => {
  const { api, db, S, json, body, fail, rid, str, rate, isObj, canSee, audience, emit, sysMsg, online, userById, presenceOf, coll, store, activity, chanOut, isAdmin } = ctx;
  const see = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  const calls = new Map(); // chan -> call (see newCall)
  const ROLES = ['organizer', 'presenter', 'attendee'], REC = ['everyone', 'organizers', 'nobody'];
  const MESH_CAP = 25, RING_MS = 30000, ALIVE_MS = 45000, PARK_MS = 5 * 60000, LOG_MAX = 5000;
  const EP = /^[A-Za-z0-9_-]{4,40}$/, HEX = /^#[0-9a-fA-F]{6}$/;
  const rules = () => (isObj(S.meetingRules) ? S.meetingRules : {});
  // size limit: call.max (meetings) || session rule || S.maxCallSize || 16, never more than the mesh can carry
  const maxOf = (c) => Math.max(2, Math.min(MESH_CAP, Math.round(Number(c.max) || Number(rules().maxPeople) || Number(S.maxCallSize) || 16)));
  const dmOf = (a, b) => 'dm:' + [a, b].sort().join(':');
  const dmIds = (chan) => chan.split(':').slice(1);
  const nameOf = (id) => { const u = userById(id); return u ? u.name : 'Someone'; };
  const live = (u) => !!u && !u.removed && !u.deleted;

  // extension points (docs/EXTENDING.md): hooks.callJoin(me, chan, call, body, starting) may throw fail(...) to refuse;
  // hooks.callEvent(type, chan, call, userId) for 'start' | 'join' | 'leave' | 'end'; hooks.callFields(call) adds fields to the call state.
  for (const k of ['callJoin', 'callEvent', 'callFields']) ctx.hooks[k] ||= [];
  function extraFields(c) { const o = {}; for (const h of ctx.hooks.callFields) { try { Object.assign(o, h(c) || {}); } catch (e) { console.error('callFields hook:', e.message); } } return o; }
  const fire = (type, chan, c, uid) => { for (const h of ctx.hooks.callEvent) { try { h(type, chan, c, uid); } catch (e) { console.error('callEvent hook:', e.message); } } };

  function newCall(chan, mode, by) {
    return {
      id: rid(6), chan, mode: mode === 'video' ? 'video' : 'voice', by, started: Date.now(), parts: new Set(), media: {}, sharing: null,
      eps: new Map(), roles: {}, locked: false, hands: {}, held: {}, hardMute: false, noCams: false, allow: {}, spotlight: null, share: null, paused: false,
      rec: null, recPolicy: null, autoRec: false, inkAll: false, ctl: null, parked: null, consult: null, ringing: new Map(), kicked: new Set(), invited: new Set(),
      joinedEver: new Set(), missedSet: new Set(), log: null,
    };
  }
  // roles: organizer = who started the call (the meetings area may name the meeting organizer through hooks.callJoin)
  const defaultRole = () => (rules().present === 'organizers' ? 'attendee' : 'presenter');
  const roleOf = (c, uid) => c.roles[uid] || defaultRole();
  const isOrg = (c, uid) => roleOf(c, uid) === 'organizer';
  const canPresent = (c, uid) => roleOf(c, uid) !== 'attendee';
  const ensureOrganizer = (c, uid) => { if (!Object.values(c.roles).includes('organizer')) c.roles[uid] = 'organizer'; else c.roles[uid] ||= defaultRole(); };
  const recPolicyOf = (c) => c.recPolicy || (REC.includes(rules().record) ? rules().record : 'everyone');
  const canRecord = (c, uid) => { const p = recPolicyOf(c); return p === 'everyone' || (p === 'organizers' && isOrg(c, uid)); };

  const callOut = (c) => ({
    roles: { ...c.roles }, locked: !!c.locked, meeting: c.meeting || null, max: maxOf(c),
    endpoints: [...c.eps].map(([ep, e]) => ({ ep, uid: e.uid, companion: !!e.companion, cam: !!e.cam, want: e.want || null })),
    hands: Object.entries(c.hands).filter(([u]) => c.parts.has(u)).sort((a, b) => a[1] - b[1]).map(([u]) => u),
    held: Object.keys(c.held).filter((u) => c.parts.has(u)), hardMute: !!c.hardMute, noCams: !!c.noCams, allow: c.allow,
    spotlight: c.spotlight && c.parts.has(c.spotlight) ? c.spotlight : null, share: c.sharing && c.parts.has(c.sharing) ? c.share : null, paused: !!c.paused,
    rec: c.rec, recPolicy: recPolicyOf(c), autoRec: !!c.autoRec, inkAll: !!c.inkAll, ctl: c.ctl, parked: c.parked ? { code: c.parked.code, by: c.parked.by, at: c.parked.at } : null,
    consult: c.consult, consultOf: c.consultOf ? { from: c.consultOf.from, by: c.consultOf.by, other: c.consultOf.other, to: c.consultOf.to } : null, ringing: [...c.ringing.keys()],
    ...extraFields(c),
    id: c.id, mode: c.mode, by: c.by, started: c.started, participants: [...c.parts], media: Object.fromEntries([...c.parts].filter((i) => c.media[i]).map((i) => [i, c.media[i]])), sharing: c.sharing && c.parts.has(c.sharing) ? c.sharing : null,
  });
  const stateOf = (chan) => (calls.has(chan) ? callOut(calls.get(chan)) : null);
  ctx.activeCalls = (u) => [...calls.keys()].filter((c) => canSee(u, c)).map((chan) => ({ chan, call: stateOf(chan) }));
  const pushState = (chan) => emit('callstate', { chan, call: stateOf(chan) }, audience(chan));

  // ---------- call log (db.callLog, read by the teams area's call-quality dashboard and the Calls pane) ----------
  const callLog = () => { let l = coll('callLog', () => []); if (!Array.isArray(l)) l = db.callLog = []; return l; };
  function logStart(c) {
    const l = callLog(); c.log = { id: c.id, chan: c.chan, mode: c.mode, by: c.by, start: c.started, end: 0, parts: [], missed: [], rung: [], ratings: {}, quality: {} };
    l.push(c.log); if (l.length > LOG_MAX) l.splice(0, l.length - LOG_MAX); store.save();
  }
  function logJoin(c, uid) { if (!c.log) return; if (!c.log.parts.includes(uid)) c.log.parts.push(uid); c.log.missed = c.log.missed.filter((x) => x !== uid); store.save(); }
  function missed(c, uid, from, extra = {}) {
    if (c.joinedEver.has(uid) || c.missedSet.has(uid)) return; c.missedSet.add(uid);
    if (c.log && !c.log.missed.includes(uid)) { c.log.missed.push(uid); store.save(); }
    activity(uid, { type: 'missedCall', from: from || c.by, chan: c.chan, mode: c.mode, call: c.id, ...extra });
  }

  // ---------- endpoints (devices) ----------
  const epOf = (b, me) => { const e = str(b.ep, 40); return EP.test(e) ? e : me.id; };
  const myEps = (c, uid) => [...c.eps].filter(([, e]) => e.uid === uid).map(([ep]) => ep);
  function addEp(c, u, ep, o = {}) {
    const prev = c.eps.get(ep); if (prev && prev.uid !== u.id) fail(409, 'That device is already in the call.');
    c.eps.set(ep, { uid: u.id, companion: !!o.companion, cam: false, at: Date.now(), hb: false, want: null });
    c.ringing.delete(u.id); c.invited.delete(u.id);
    if (!c.roles[u.id]) c.roles[u.id] = defaultRole();
    if (!c.parts.has(u.id)) { c.parts.add(u.id); c.joinedEver.add(u.id); logJoin(c, u.id); fire('join', c.chan, c, u.id); }
  }
  function dropPart(c, id) {
    c.parts.delete(id); delete c.media[id]; delete c.hands[id]; delete c.held[id];
    if (c.sharing === id) stopShare(c); if (c.spotlight === id) c.spotlight = null; if (c.ctl && c.ctl.to === id) c.ctl = null;
    if (c.rec && c.rec.by === id) recStopped(c);
  }
  function dropEp(c, ep) {
    const e = c.eps.get(ep); if (!e) return false; c.eps.delete(ep);
    if (myEps(c, e.uid).length) return true; // still in the call on another device
    dropPart(c, e.uid); fire('leave', c.chan, c, e.uid); return true;
  }
  const endIfEmpty = (chan) => {
    const c = calls.get(chan); if (!c || c.parts.size) return;
    calls.delete(chan); const mins = Math.max(1, Math.round((Date.now() - c.started) / 60000)); sysMsg(chan, `Call ended · ${mins} min`, { kind: 'callend' });
    for (const uid of c.ringing.keys()) missed(c, uid, c.by); c.ringing.clear();
    if (c.log) { c.log.end = Date.now(); if (c.meeting) c.log.meeting = String(c.meeting).slice(0, 40); store.save(); }
    fire('end', chan, c, null);
  };
  const leave = (chan, uid) => { const c = calls.get(chan); if (!c || !c.parts.has(uid)) return false; for (const ep of myEps(c, uid)) dropEp(c, ep); if (c.parts.has(uid)) { dropPart(c, uid); fire('leave', chan, c, uid); } endIfEmpty(chan); pushState(chan); return true; };
  Object.assign(ctx, { calls, callOut, callState: stateOf, pushCallState: pushState, leaveCall: leave });

  // who may come in: already there (another device of yours), not removed, not locked out, room left, other areas' rules
  function checkJoin(c, chan, me, b) {
    if (c.parts.has(me.id)) return;
    if (c.kicked.has(me.id) && !c.invited.has(me.id)) fail(403, 'You were removed from this call.');
    if (c.locked && !isOrg(c, me.id) && !c.invited.has(me.id)) fail(403, 'This meeting is locked. Ask the organizer to let you in.');
    if (c.parts.size >= maxOf(c)) fail(409, `This call is full (${maxOf(c)} people).`);
    for (const h of ctx.hooks.callJoin) h(me, chan, c, b, false);
  }
  // other areas' rules (blocking, lobbies) also apply when the server moves someone into a call
  const allowedIn = (u, chan) => { const c = calls.get(chan) || newCall(chan, 'voice', u.id); try { for (const h of ctx.hooks.callJoin) h(u, chan, c, {}, !calls.has(chan)); return true; } catch { return false; } };
  function startCall(chan, mode, by, b, starting) {
    const c = newCall(chan, mode, by.id);
    if (starting) for (const h of ctx.hooks.callJoin) h(by, chan, c, b || {}, true);
    ensureOrganizer(c, by.id); calls.set(chan, c); logStart(c);
    sysMsg(chan, `${by.name} started a ${c.mode} call`, { kind: 'call' }); fire('start', chan, c, by.id);
    return c;
  }

  // ---------- ringing: missed calls, voicemail offers, forwarding ----------
  const prefsOf = (uid) => { const p = coll('callPrefs')[uid]; return isObj(p) ? p : {}; };
  const fwdOf = (uid) => { const f = prefsOf(uid).forward; return isObj(f) ? f : {}; };
  const busyElsewhere = (uid, c) => [...calls.values()].some((x) => x !== c && x.parts.has(uid));
  function ring(c, uid, o = {}) {
    if (c.parts.has(uid)) return;
    c.ringing.set(uid, { at: Date.now(), by: o.by || c.by });
    if (c.log && !c.log.rung.includes(uid)) c.log.rung.push(uid);
    emit('callring', { chan: c.chan, call: callOut(c), from: o.by || c.by, fwd: o.fwd || null, xfer: o.xfer || null, parked: !!o.parked, consult: !!o.consult, add: !!o.add }, [uid]);
  }
  // a 1:1 call: the callee's forwarding rules, busy, Do not disturb and offline decide whether it rings
  function ringDm(c, caller, callee, o = {}) {
    const f = fwdOf(callee.id);
    if (f.always && f.always !== 'off') return divert(c, callee, caller, f.always, 'always');
    if (!online(callee.id)) return divert(c, callee, caller, f.unanswered || 'voicemail', 'offline');
    if (busyElsewhere(callee.id, c)) return divert(c, callee, caller, f.busy || 'voicemail', 'busy');
    if (presenceOf(callee, callee) === 'dnd') return divert(c, callee, caller, f.unanswered || 'voicemail', 'dnd');
    ring(c, callee.id, { by: caller.id, ...o });
  }
  // nobody picks up: forward to another person (their app rings, the caller's call moves to that 1:1 chat) or offer voicemail
  function divert(c, callee, caller, rule, reason) {
    const target = rule && rule !== 'voicemail' && rule !== 'off' ? userById(rule) : null;
    if (target && live(target) && target.id !== caller.id && target.id !== callee.id && (c.fwdDepth || 0) < 2 && c.parts.has(caller.id)) {
      const to = dmOf(caller.id, target.id);
      if (!calls.has(to) && allowedIn(caller, to)) {
        missed(c, callee.id, caller.id, { reason, forwardedTo: target.id });
        const t = moveTo(c.chan, to, [caller.id], { mode: c.mode, by: caller.id, reason: 'forward', fwd: callee.id });
        t.fwdDepth = (c.fwdDepth || 0) + 1; ringDm(t, caller, target, { fwd: callee.id }); pushState(to); return;
      }
    }
    missed(c, callee.id, caller.id, { reason });
    emit('callnoanswer', { chan: c.chan, to: callee.id, reason, voicemail: rule !== 'off' }, [caller.id]);
  }
  function noAnswer(c, uid, reason) {
    const u = userById(uid); if (!u) return;
    const others = [...c.parts].filter((x) => x !== uid);
    if (c.chan.startsWith('dm:') && others.length === 1 && c.parts.size === 1) { const f = fwdOf(uid); return divert(c, u, userById(others[0]), (reason === 'busy' ? f.busy : f.unanswered) || 'voicemail', reason); }
    missed(c, uid, c.by, { reason });
  }
  function ringStart(c, me) {
    if (c.chan.startsWith('dm:')) { const peer = userById(dmIds(c.chan).find((i) => i !== me.id)); if (live(peer)) ringDm(c, me, peer); return; }
    const aud = audience(c.chan); if (aud) for (const id of aud) if (id !== me.id && live(userById(id))) ring(c, id, { by: me.id });
  }

  // ---------- moving people between calls (add people to a 1:1 call, transfer, consult, forwarding); their apps follow ----------
  function moveTo(from, to, uids, o = {}) {
    const src = calls.get(from), by = userById(o.by) || userById(uids[0]);
    let t = calls.get(to); if (!t) { if (!by) fail(400, 'Nobody to move'); t = startCall(to, o.mode, by, null, false); }
    for (const uid of uids) {
      const u = userById(uid); if (!src || !u || !canSee(u, to)) continue;
      const mine = myEps(src, uid).map((ep) => [ep, src.eps.get(ep)]); if (!mine.length) continue;
      for (const [ep] of mine) dropEp(src, ep);
      for (const [ep, e] of mine) addEp(t, u, ep, { companion: e.companion });
      emit('callmove', { from, to, call: callOut(t), reason: o.reason || '', by: o.by || null, fwd: o.fwd || null, xfer: o.xfer || null }, [uid]);
    }
    if (src) { endIfEmpty(from); pushState(from); }
    pushState(to); return t;
  }
  function newGroup(me, members) {
    const label = members.map((id) => nameOf(id).split(' ')[0]).join(', ').slice(0, 30) || 'Group call';
    const g = { id: 'g-' + rid(5), name: label, topic: '', created: Date.now(), by: me.id, members, kind: 'group' };
    db.channels[g.id] = g; store.save(); emit('channel', chanOut(g), members); sysMsg(g.id, `${me.name} created this group`); return g;
  }

  // ---------- sharing ----------
  function stopShare(c) { c.sharing = null; c.share = null; c.paused = false; c.ctl = null; }
  function recStopped(c) { if (!c.rec) return; recent.set(c.chan + '|' + c.rec.by, Date.now() + 6 * 3600000); c.rec = null; sysMsg(c.chan, 'Recording stopped', { kind: 'record' }); }
  const recent = new Map(); // "chan|uid" -> until: the last recorder may still upload parts after the call ended
  function pdfIn(chan, f, me) {
    const id = str(isObj(f) ? f.id : f, 24), rec = db.files[id];
    if (!rec || !/\.pdf$/i.test(rec.name)) fail(400, 'Pick a PDF file.');
    if (!ctx.chanMsgs(chan).some((m) => !m.deleted && m.files && m.files.some((x) => x.id === id) && (!ctx.canSeeMsg || ctx.canSeeMsg(me, m)))) fail(400, 'Post the PDF in this chat first, so everyone can open it.');
    return { id, name: rec.name, size: rec.size };
  }
  const page = (v) => Math.max(1, Math.min(9999, Math.round(Number(v)) || 1));
  const MODES = ['content', 'standout', 'side'];

  // ---------- routes ----------
  api['POST /api/call/start'] = async (req, res, me) => {
    const b = await body(req, 2048), chan = str(b.chan, 64); see(me, chan);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('call:' + me.id, 10, 60000)) fail(429, 'Too many calls started.');
    const ep = epOf(b, me); let c = calls.get(chan), fresh = false;
    if (!c) { c = startCall(chan, b.mode, me, b, true); fresh = true; } else checkJoin(c, chan, me, b);
    addEp(c, me, ep, { companion: b.companion });
    if (fresh) ringStart(c, me);
    pushState(chan); json(res, 200, { ok: true, call: callOut(c) });
  };
  api['POST /api/call/join'] = async (req, res, me) => {
    const b = await body(req, 2048), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan); if (!c) fail(404, 'That call has ended.');
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    checkJoin(c, chan, me, b); addEp(c, me, epOf(b, me), { companion: b.companion });
    if (c.parked && c.parked.by === me.id) c.parked = null; // came back for it
    pushState(chan); json(res, 200, { ok: true, call: callOut(c) });
  };
  api['POST /api/call/leave'] = async (req, res, me) => {
    const b = await body(req, 512), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan);
    if (c && b.ep && EP.test(str(b.ep, 40))) { const e = c.eps.get(b.ep); if (e && e.uid === me.id) { dropEp(c, b.ep); endIfEmpty(chan); pushState(chan); } }
    else leave(chan, me.id);
    json(res, 200, { ok: true });
  };
  const inCall = async (req, me, size = 512) => {
    const b = await body(req, size), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan);
    if (!c || !c.parts.has(me.id)) fail(400, 'Not in this call');
    let ep = EP.test(str(b.ep, 40)) ? b.ep : ''; if (!ep || !c.eps.has(ep) || c.eps.get(ep).uid !== me.id) ep = myEps(c, me.id)[0];
    if (!ep) fail(400, 'Not in this call');
    if (!rate('cmedia:' + me.id, 120, 60000)) fail(429, 'Slow down');
    return { b, chan, c, ep, e: c.eps.get(ep) };
  };
  // mic / camera / raised hand, so everybody's tiles show the right icons; "want" = whose camera this device wants to receive
  api['POST /api/call/media'] = async (req, res, me) => {
    const { b, chan, c, e } = await inCall(req, me, 4096), att = roleOf(c, me.id) === 'attendee', allow = c.allow[me.id] || {};
    if (e.companion) { e.cam = !!b.cam && !(c.noCams && att && !allow.cam); }
    else {
      const prev = c.media[me.id] || {}, mic = b.mic !== false, cam = !!b.cam, hand = !!b.hand;
      if (mic && !prev.mic && c.hardMute && att && !allow.mic) fail(403, 'The organizer has turned off mics for attendees.');
      if (cam && !prev.cam && c.noCams && att && !allow.cam) fail(403, 'The organizer has turned off cameras for attendees.');
      c.media[me.id] = { mic, cam, hand };
      if (hand && !c.hands[me.id]) c.hands[me.id] = Date.now(); else if (!hand) delete c.hands[me.id];
    }
    if (b.want === null || b.want === 'all') e.want = null;
    else if (Array.isArray(b.want)) e.want = [...new Set(b.want.filter((x) => typeof x === 'string' && EP.test(x)))].slice(0, 49);
    pushState(chan); json(res, 200, { ok: true });
  };
  // the device is still there (pages that crash or lose the network drop out after 45 s)
  api['POST /api/call/alive'] = async (req, res, me) => { const { e } = await inCall(req, me); e.at = Date.now(); e.hb = true; json(res, 200, { ok: true }); };
  // hold: you stop sending (and hearing); the others see "On hold"
  api['POST /api/call/hold'] = async (req, res, me) => { const { b, chan, c } = await inCall(req, me); if (b.on) c.held[me.id] = 1; else delete c.held[me.id]; pushState(chan); json(res, 200, { ok: true }); };

  // one presenter at a time: starting a share takes over from whoever was presenting. kind: screen | board | pdf
  api['POST /api/call/share'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 2048);
    if (b.on) {
      if (!canPresent(c, me.id)) fail(403, 'Only organizers and presenters can share.');
      const kind = ['screen', 'board', 'pdf'].includes(b.kind) ? b.kind : 'screen', file = kind === 'pdf' ? pdfIn(chan, b.file, me) : null;
      c.sharing = me.id; c.share = { kind, by: me.id, file, page: kind === 'pdf' ? page(b.page) : 0, mode: MODES.includes(b.mode) ? b.mode : 'content', sound: !!b.sound, video: !!b.video, at: Date.now() };
      c.paused = false; c.ctl = null; c.inkAll = false;
    } else if (c.sharing === me.id) stopShare(c);
    pushState(chan); json(res, 200, { ok: true, sharing: c.sharing });
  };
  // the presenter's live state: PDF page, paused, presenter mode, "let people annotate"
  api['POST /api/call/sharestate'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 1024); if (c.sharing !== me.id || !c.share) fail(403, 'You are not presenting.');
    if (b.page !== undefined && c.share.kind === 'pdf') c.share.page = page(b.page);
    if (b.paused !== undefined) c.paused = !!b.paused;
    if (b.mode !== undefined && MODES.includes(b.mode)) c.share.mode = b.mode;
    if (b.inkAll !== undefined) c.inkAll = !!b.inkAll;
    pushState(chan); json(res, 200, { ok: true });
  };
  // laser pointer, pen strokes and the remote pointer over the shared content (coordinates 0..10000 of the content)
  api['POST /api/call/ink'] = async (req, res, me) => {
    const b = await body(req, 8192), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan);
    if (!c || !c.parts.has(me.id)) fail(400, 'Not in this call'); if (!c.sharing) fail(400, 'Nobody is presenting.');
    const k = ['ptr', 'laser', 'pen', 'clr'].includes(b.k) ? b.k : ''; if (!k) fail(400, 'Bad annotation');
    const ctl = c.ctl && c.ctl.to === me.id;
    if (!(c.sharing === me.id || c.inkAll || (ctl && k === 'ptr'))) fail(403, 'The presenter has not turned on annotations.');
    if (!rate('ink:' + me.id, 40, 1000)) return json(res, 200, { ok: true, dropped: true });
    const n = (v) => Math.max(0, Math.min(10000, Math.round(Number(v)) || 0)), out = { chan, from: me.id, k, sid: str(b.sid, 12), c: HEX.test(str(b.c, 7)) ? b.c : '#ff3b30', w: Math.max(1, Math.min(12, Math.round(Number(b.w)) || 3)) };
    if (k === 'ptr' || k === 'laser') { out.x = n(b.x); out.y = n(b.y); out.off = !!b.off; }
    if (k === 'pen') { if (!Array.isArray(b.pts) || b.pts.length < 2 || b.pts.length > 400) fail(400, 'Bad stroke'); out.pts = b.pts.slice(0, 400).map(n); }
    if (k === 'clr') out.all = c.sharing === me.id || isOrg(c, me.id);
    emit('callink', out, [...c.parts].filter((x) => x !== me.id)); json(res, 200, { ok: true });
  };
  // request / give / take control (the controller gets a pointer everyone sees; no input is injected into the presenter's computer)
  api['POST /api/call/control'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 1024), act = str(b.action, 10), uid = str(b.uid, 32);
    if (!c.sharing) fail(400, 'Nobody is presenting.');
    if (act === 'request') { if (c.sharing === me.id) fail(400, 'You are the presenter.'); if (!rate('ctlreq:' + me.id, 5, 60000)) fail(429, 'Wait a moment before asking again.'); emit('callctl', { chan, type: 'request', from: me.id }, [c.sharing]); }
    else if (act === 'give') { if (c.sharing !== me.id) fail(403, 'Only the presenter can give control.'); if (!c.parts.has(uid) || uid === me.id) fail(400, 'They are not in the call.'); c.ctl = { to: uid, by: me.id, at: Date.now() }; emit('callctl', { chan, type: 'given', by: me.id }, [uid]); }
    else if (act === 'deny') { if (c.sharing !== me.id) fail(403, 'Only the presenter can answer.'); if (c.parts.has(uid)) emit('callctl', { chan, type: 'denied', by: me.id }, [uid]); }
    else if (act === 'take' || act === 'release') { if (c.sharing !== me.id && !(c.ctl && c.ctl.to === me.id)) fail(403, 'You do not have control.'); if (c.ctl && c.ctl.to !== me.id) emit('callctl', { chan, type: 'taken', by: me.id }, [c.ctl.to]); c.ctl = null; }
    else fail(400, 'Unknown action');
    pushState(chan); json(res, 200, { ok: true });
  };

  // organizer / presenter controls, enforced here (receiving apps also honour hard mute and camera bans for others)
  api['POST /api/call/admin'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 1024), act = str(b.action, 16), uid = str(b.uid, 32), org = isOrg(c, me.id), mod = org || roleOf(c, me.id) === 'presenter';
    const need = (ok, msg) => { if (!ok) fail(403, msg || 'Only organizers and presenters can do that.'); };
    const target = () => { if (!c.parts.has(uid)) fail(400, 'They are not in the call.'); return uid; };
    const cmd = (ids, action) => { if (ids.length) emit('callcmd', { chan, action, by: me.id }, ids); };
    const muteIds = (ids) => { for (const id of ids) if (c.media[id]) c.media[id].mic = false; cmd(ids, 'mute'); };
    const camIds = (ids) => { for (const id of ids) { if (c.media[id]) c.media[id].cam = false; for (const ep of myEps(c, id)) c.eps.get(ep).cam = false; } cmd(ids, 'camoff'); };
    const others = () => [...c.parts].filter((x) => x !== me.id), attendees = () => others().filter((x) => roleOf(c, x) === 'attendee');
    switch (act) {
      case 'mute': need(mod); muteIds([target()]); break;
      case 'muteall': need(mod); muteIds(others()); break;
      case 'hardmute': need(mod); c.hardMute = !!b.value; if (c.hardMute) { muteIds(attendees()); for (const id of Object.keys(c.allow)) if (c.allow[id]) delete c.allow[id].mic; } break;
      case 'allowmic': need(mod); target(); (c.allow[uid] ||= {}).mic = !!b.value; if (!b.value) muteIds([uid]); else cmd([uid], 'mayunmute'); break;
      case 'camoff': need(mod); camIds([target()]); break;
      case 'nocams': need(mod); c.noCams = !!b.value; if (c.noCams) { camIds(attendees()); for (const id of Object.keys(c.allow)) if (c.allow[id]) delete c.allow[id].cam; } break;
      case 'allowcam': need(mod); target(); (c.allow[uid] ||= {}).cam = !!b.value; if (!b.value) camIds([uid]); break;
      case 'remove': need(mod); target(); if (uid === me.id) fail(400, 'Use Leave instead.'); if (isOrg(c, uid) && !org) fail(403, 'Only organizers can remove an organizer.'); c.kicked.add(uid); cmd([uid], 'removed'); leave(chan, uid); return json(res, 200, { ok: true });
      case 'role': {
        need(org, 'Only organizers can change roles.'); target(); const role = ROLES.includes(b.value) ? b.value : null; if (!role) fail(400, 'Unknown role');
        if (c.roles[uid] === 'organizer' && role !== 'organizer' && [...c.parts].filter((x) => isOrg(c, x)).length < 2) fail(400, 'The meeting needs at least one organizer.');
        c.roles[uid] = role; if (role === 'attendee' && c.sharing === uid) { stopShare(c); cmd([uid], 'stopshare'); } break;
      }
      case 'lock': need(org, 'Only organizers can lock the meeting.'); c.locked = !!b.value; sysMsg(chan, c.locked ? `${me.name} locked the meeting` : `${me.name} unlocked the meeting`, { kind: 'call' }); break;
      case 'end': need(org, 'Only organizers can end the meeting for everyone.'); cmd(others(), 'ended'); for (const id of [...c.parts]) leave(chan, id); return json(res, 200, { ok: true });
      case 'spotlight': need(mod); c.spotlight = uid ? target() : null; break;
      case 'lowerhands': need(mod); { const up = Object.keys(c.hands); for (const id of up) if (c.media[id]) c.media[id].hand = false; c.hands = {}; cmd(up.filter((x) => x !== me.id), 'lowerhand'); } break;
      case 'lowerhand': need(mod); target(); if (c.media[uid]) c.media[uid].hand = false; delete c.hands[uid]; cmd([uid], 'lowerhand'); break;
      case 'recpolicy': need(org, 'Only organizers can choose who records.'); if (!REC.includes(b.value)) fail(400, 'Unknown choice'); c.recPolicy = b.value; break;
      case 'autorec': need(org, 'Only organizers can change this.'); c.autoRec = !!b.value; break;
      default: fail(400, 'Unknown action');
    }
    pushState(chan); json(res, 200, { ok: true });
  };

  // ring people who are not in the call ("Add people"). In a 1:1 call this makes a group chat and moves the call there.
  api['POST /api/call/ring'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 4096);
    if (!rate('ring:' + me.id, 30, 60000)) fail(429, 'Too many rings. Wait a moment.');
    if (c.locked && !isOrg(c, me.id) && roleOf(c, me.id) !== 'presenter') fail(403, 'This meeting is locked.');
    const ids = [...new Set((Array.isArray(b.users) ? b.users : []).filter((x) => typeof x === 'string'))].slice(0, 20).filter((id) => id !== me.id && live(userById(id)));
    if (!ids.length) fail(400, 'Pick someone to add.');
    if (chan.startsWith('dm:')) {
      const pair = dmIds(chan), extra = ids.filter((id) => !pair.includes(id));
      if (!extra.length) { for (const id of ids) if (!c.parts.has(id)) ring(c, id, { by: me.id }); pushState(chan); return json(res, 200, { ok: true, chan }); }
      if (!S.membersCanCreateGroups && !isAdmin(me)) fail(403, 'Only admins can create group chats here, so a third person can’t be added to a 1:1 call.');
      if (c.parts.size + extra.length > maxOf(c)) fail(409, `This call is full (${maxOf(c)} people).`);
      for (const id of c.ringing.keys()) emit('callringstop', { chan }, [id]); c.ringing.clear();
      const g = newGroup(me, [...new Set([...pair, ...extra])]);
      const t = moveTo(chan, g.id, [...c.parts], { mode: c.mode, by: me.id, reason: 'group' });
      for (const id of g.members) if (!t.parts.has(id)) ring(t, id, { by: me.id, add: true });
      pushState(g.id); return json(res, 200, { ok: true, chan: g.id });
    }
    let n = 0; for (const id of ids) { const u = userById(id); if (!canSee(u, chan) || c.parts.has(id)) continue; c.invited.add(id); c.kicked.delete(id); ring(c, id, { by: me.id, add: true }); n++; }
    if (!n) fail(400, 'They can’t join this chat’s call, or they are already in it.');
    pushState(chan); json(res, 200, { ok: true, chan });
  };
  api['POST /api/call/decline'] = async (req, res, me) => {
    const b = await body(req, 256), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan);
    if (c && c.ringing.has(me.id)) { c.ringing.delete(me.id); noAnswer(c, me.id, 'declined'); pushState(chan); }
    emit('callringstop', { chan }, [me.id]); json(res, 200, { ok: true });
  };
  // transfer a 1:1 call: the other person is connected to someone else's ringing call and you drop off
  api['POST /api/call/transfer'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 1024);
    if (!rate('xfer:' + me.id, 10, 60000)) fail(429, 'Wait a moment.');
    if (b.complete) { // after "consult first": chan is the consult call (you + the target)
      const k = c.consultOf; if (!k || k.by !== me.id) fail(400, 'There is no consult call to finish.');
      const orig = calls.get(k.from); if (!orig || !orig.parts.has(k.other)) fail(409, `${nameOf(k.other)} left the call.`);
      if (!c.parts.has(k.to)) fail(409, `${nameOf(k.to)} hasn't answered yet.`);
      const to = dmOf(k.other, k.to); if (calls.has(to)) fail(409, 'They are already in a call together.');
      if (!allowedIn(userById(k.other), to)) fail(403, `${nameOf(k.to)} can't take this call.`);
      orig.consult = null; moveTo(k.from, to, [k.other], { mode: orig.mode, by: k.other, reason: 'transfer', xfer: me.id });
      moveTo(chan, to, [k.to], { mode: orig.mode, by: k.other, reason: 'transfer', xfer: me.id }); leave(chan, me.id);
      return json(res, 200, { ok: true, chan: to });
    }
    if (!chan.startsWith('dm:') || c.parts.size !== 2) fail(400, 'Only 1:1 calls can be transferred.');
    const other = [...c.parts].find((x) => x !== me.id), target = userById(str(b.to, 32));
    if (!live(target) || target.id === me.id || target.id === other) fail(400, 'Pick someone else to transfer to.');
    const to = dmOf(other, target.id); if (calls.has(to)) fail(409, `${target.name} is already in a call with them.`);
    if (!allowedIn(userById(other), to)) fail(403, `${target.name} can't take this call.`);
    const t = moveTo(chan, to, [other], { mode: c.mode, by: other, reason: 'transfer', xfer: me.id });
    ringDm(t, userById(other), target, { xfer: me.id }); leave(chan, me.id); pushState(to);
    json(res, 200, { ok: true, chan: to });
  };
  // consult first: you call the target (the other person waits on hold), then finish with /transfer { complete } or cancel
  api['POST /api/call/consult'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me, 1024);
    if (b.cancel) {
      const k = c.consultOf; if (!k || k.by !== me.id) fail(400, 'You are not consulting.');
      const orig = calls.get(k.from), rest = [...c.parts].filter((x) => x !== me.id);
      if (orig) { orig.consult = null; moveTo(chan, k.from, [me.id], { by: me.id, reason: 'back' }); } else leave(chan, me.id);
      for (const id of rest) { emit('callcmd', { chan, action: 'ended', by: me.id }, [id]); leave(chan, id); }
      const live2 = calls.get(chan); if (live2) for (const id of live2.ringing.keys()) emit('callringstop', { chan }, [id]);
      return json(res, 200, { ok: true, chan: k.from });
    }
    if (!chan.startsWith('dm:') || c.parts.size !== 2) fail(400, 'You can consult before transferring a 1:1 call.');
    const other = [...c.parts].find((x) => x !== me.id), target = userById(str(b.to, 32));
    if (!live(target) || target.id === me.id || target.id === other) fail(400, 'Pick someone else.');
    const to = dmOf(me.id, target.id); if (calls.has(to)) fail(409, `You already have a call with ${target.name}.`);
    if (!allowedIn(me, to)) fail(403, `You can't call ${target.name}.`);
    if (!rate('xfer:' + me.id, 10, 60000)) fail(429, 'Wait a moment.');
    const t = moveTo(chan, to, [me.id], { mode: 'voice', by: me.id, reason: 'consult' });
    c.consult = { by: me.id, to: target.id }; t.consultOf = { from: chan, by: me.id, other, to: target.id };
    ring(t, target.id, { by: me.id, consult: true }); pushState(chan); pushState(to);
    json(res, 200, { ok: true, chan: to });
  };
  // park: you step out, the call shows "Parked" with a 3-digit code; anyone in the chat (or you, on another device) picks it up
  api['POST /api/call/park'] = async (req, res, me) => {
    const { chan, c } = await inCall(req, me);
    if (c.parts.size < 2) fail(400, 'There is nobody to park the call with.'); if (c.parked) fail(409, 'This call is already parked.');
    let code; do { code = String(100 + crypto.randomInt(900)); } while ([...calls.values()].some((x) => x.parked && x.parked.code === code));
    c.parked = { code, by: me.id, at: Date.now() }; leave(chan, me.id);
    json(res, 200, { ok: true, code });
  };
  api['POST /api/call/pickup'] = async (req, res, me) => {
    const b = await body(req, 256), code = str(String(b.code || ''), 3);
    if (!rate('pickup:' + me.id, 10, 60000)) fail(429, 'Too many tries. Wait a minute.');
    const c = /^\d{3}$/.test(code) ? [...calls.values()].find((x) => x.parked && x.parked.code === code) : null;
    if (!c || !canSee(me, c.chan)) fail(404, 'No parked call has that code.');
    c.parked = null; c.invited.add(me.id); c.kicked.delete(me.id); pushState(c.chan);
    json(res, 200, { ok: true, chan: c.chan, mode: c.mode });
  };
  // recording state (the recorder's app records and posts the video; see public/js/calls-record.js)
  api['POST /api/call/record'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me);
    if (b.on) {
      if (!canRecord(c, me.id)) fail(403, recPolicyOf(c) === 'nobody' ? 'Recording is turned off for this meeting.' : 'Only organizers can record this meeting.');
      if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
      if (c.rec && c.rec.by !== me.id) fail(409, `${nameOf(c.rec.by)} is already recording.`);
      if (!c.rec) { c.rec = { by: me.id, started: Date.now() }; sysMsg(chan, `${me.name} started recording`, { kind: 'record' }); }
    } else if (c.rec) {
      if (c.rec.by !== me.id && !isOrg(c, me.id)) fail(403, 'Only the person recording or an organizer can stop it.');
      if (c.rec.by !== me.id) emit('callcmd', { chan, action: 'stoprec', by: me.id }, [c.rec.by]);
      recStopped(c);
    }
    pushState(chan); json(res, 200, { ok: true, rec: c.rec });
  };
  api['POST /api/call/recpost'] = async (req, res, me) => {
    const b = await body(req, 2048), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan);
    if (!((c && c.rec && c.rec.by === me.id) || (recent.get(chan + '|' + me.id) || 0) > Date.now())) fail(403, 'You are not recording this call.');
    if (!rate('recpost:' + me.id, 30, 600000)) fail(429, 'Too many recordings.');
    const f = db.files[str(b.file, 24)]; if (!f || f.by !== me.id || !/\.(webm|mp4|mkv)$/i.test(f.name)) fail(400, 'Upload the recording first.');
    if (ctx.chanMsgs(chan).some((m) => m.files && m.files.some((x) => x.id === f.id))) fail(409, 'That recording is already posted.');
    const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));
    const m = ctx.addMessage({ chan, from: me.id, text: '', files: [{ id: f.id, name: f.name, size: f.size }], recording: true, rec: { part: num(b.part, 1, 999), dur: num(b.dur, 0, 86400), start: num(b.start, 0, 4e12), call: str(b.call, 16) || (c ? c.id : '') } });
    json(res, 200, { ok: true, id: m.id });
  };
  const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉'];
  api['POST /api/call/react'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me); if (!REACTIONS.includes(b.emoji)) fail(400, 'Unknown reaction');
    emit('callreact', { chan, from: me.id, emoji: b.emoji }, [...c.parts]); json(res, 200, { ok: true });
  };
  api['POST /api/call/signal'] = async (req, res, me) => {
    const b = await body(req, 60000), chan = str(b.chan, 64); see(me, chan);
    const c = calls.get(chan), kind = str(b.kind, 10); let to = str(b.to, 40), from = str(b.from, 40);
    if (!c || !c.parts.has(me.id) || !['offer', 'answer', 'ice'].includes(kind)) fail(400, 'Not in this call');
    if (!c.eps.has(to)) to = c.parts.has(to) ? myEps(c, to)[0] : ''; // an older client (or the API) may name a person instead of a device
    if (!c.eps.has(from) || c.eps.get(from).uid !== me.id) from = myEps(c, me.id)[0];
    if (!to || !from || to === from) fail(400, 'Not in this call');
    if (!rate('sig:' + me.id, 900, 60000)) fail(429, 'Too much signaling');
    emit('callsig', { chan, from: me.id, fromEp: from, to, kind, data: b.data }, [c.eps.get(to).uid]); json(res, 200, { ok: true });
  };

  // ---------- timers: ring timeouts, dead devices, parked calls, people who went offline ----------
  ctx.ticks.push({ every: 1000, fn: (now) => {
    for (const c of [...calls.values()]) {
      let changed = false;
      for (const [uid, r] of [...c.ringing]) if (now - r.at > RING_MS) { c.ringing.delete(uid); noAnswer(c, uid, 'noanswer'); changed = true; }
      for (const [ep, e] of [...c.eps]) if (e.hb && now - e.at > ALIVE_MS) { dropEp(c, ep); changed = true; }
      if (c.parked && !c.parked.rang && now - c.parked.at > PARK_MS) { c.parked.rang = true; const u = userById(c.parked.by); if (live(u) && !c.parts.has(u.id)) ring(c, u.id, { by: u.id, parked: true }); changed = true; }
      if (c.parked && now - c.parked.at > PARK_MS + 3 * 60000) { c.parked = null; changed = true; }
      if (!calls.has(c.chan)) continue;
      if (changed) { endIfEmpty(c.chan); pushState(c.chan); }
    }
  } });
  ctx.ticks.push({ every: 5000, fn: () => { for (const [chan, c] of [...calls]) for (const id of [...c.parts]) if (!online(id)) leave(chan, id); for (const [k, t] of recent) if (t < Date.now()) recent.delete(k); } });

  // for routes-callx.js (history, voicemail, walkie-talkie) and tests
  ctx.callx = { calls, dmOf, ring, callOut, roleOf, isOrg, maxOf, callLog };
};
