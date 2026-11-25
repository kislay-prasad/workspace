'use strict';
// Calls: WebRTC signaling only (media goes peer-to-peer), plus who is muted / on camera / presenting.
module.exports = (ctx) => {
  const { api, db, json, body, fail, rid, str, rate, canSee, audience, emit, sysMsg, online } = ctx;
  const see = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  // ----- calls (WebRTC signaling only; media goes peer-to-peer) -----
  const calls = new Map(); // chan -> { id, mode, by, started, parts:Set, media:{uid:{mic,cam,hand}}, sharing:uid|null }
  const callOut = (c) => ({ ...extraFields(c), id: c.id, mode: c.mode, by: c.by, started: c.started, participants: [...c.parts], media: Object.fromEntries([...c.parts].filter((i) => c.media[i]).map((i) => [i, c.media[i]])), sharing: c.sharing && c.parts.has(c.sharing) ? c.sharing : null });
  // extension points (docs/EXTENDING.md): hooks.callJoin(me, chan, call, body, starting) may throw fail(...) to refuse;
  // hooks.callEvent(type, chan, call, userId) for 'start' | 'join' | 'leave' | 'end'; hooks.callFields(call) adds fields to the call state.
  for (const k of ['callJoin', 'callEvent', 'callFields']) ctx.hooks[k] ||= [];
  function extraFields(c) { const o = {}; for (const h of ctx.hooks.callFields) { try { Object.assign(o, h(c) || {}); } catch (e) { console.error('callFields hook:', e.message); } } return o; }
  const fire = (type, chan, c, uid) => { for (const h of ctx.hooks.callEvent) { try { h(type, chan, c, uid); } catch (e) { console.error('callEvent hook:', e.message); } } };
  const maxOf = (c) => c.max || ctx.S.maxCallSize || 8;
  const dropPart = (c, id) => { c.parts.delete(id); delete c.media[id]; if (c.sharing === id) c.sharing = null; };
  const stateOf = (chan) => (calls.has(chan) ? callOut(calls.get(chan)) : null);
  ctx.activeCalls = (u) => [...calls.keys()].filter((c) => canSee(u, c)).map((chan) => ({ chan, call: stateOf(chan) }));
  const pushState = (chan) => emit('callstate', { chan, call: stateOf(chan) }, audience(chan));
  const endIfEmpty = (chan) => {
    const c = calls.get(chan); if (!c || c.parts.size) return;
    calls.delete(chan); const mins = Math.max(1, Math.round((Date.now() - c.started) / 60000)); sysMsg(chan, `Call ended · ${mins} min`, { kind: 'callend' }); fire('end', chan, c, null);
  };
  const leave = (chan, uid) => { const c = calls.get(chan); if (!c || !c.parts.has(uid)) return false; dropPart(c, uid); fire('leave', chan, c, uid); endIfEmpty(chan); pushState(chan); return true; };
  Object.assign(ctx, { calls, callOut, callState: stateOf, pushCallState: pushState, leaveCall: leave });

  api['POST /api/call/start'] = async (req, res, me) => {
    const b = await body(req, 256), chan = str(b.chan, 64); see(me, chan);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!rate('call:' + me.id, 10, 60000)) fail(429, 'Too many calls started.');
    let c = calls.get(chan), fresh = false;
    if (!c) {
      c = { id: rid(6), mode: b.mode === 'video' ? 'video' : 'voice', by: me.id, started: Date.now(), parts: new Set(), media: {}, sharing: null }; fresh = true;
      for (const h of ctx.hooks.callJoin) h(me, chan, c, b, true);
      calls.set(chan, c); sysMsg(chan, `${me.name} started a ${c.mode} call`, { kind: 'call' }); fire('start', chan, c, me.id);
      if (audience(chan)) emit('callring', { chan, call: callOut(c), from: me.id }, audience(chan).filter((i) => i !== me.id));
    }
    if (c.parts.size >= maxOf(c) && !c.parts.has(me.id)) fail(409, `This call is full (${maxOf(c)} people).`);
    if (!fresh && !c.parts.has(me.id)) for (const h of ctx.hooks.callJoin) h(me, chan, c, b, false);
    const isNew = !c.parts.has(me.id); c.parts.add(me.id); if (isNew) fire('join', chan, c, me.id); pushState(chan); json(res, 200, { ok: true, call: callOut(c) });
  };
  api['POST /api/call/join'] = async (req, res, me) => {
    const b = await body(req, 1024), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan); if (!c) fail(404, 'That call has ended.');
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (c.parts.size >= maxOf(c) && !c.parts.has(me.id)) fail(409, `This call is full (${maxOf(c)} people).`);
    if (!c.parts.has(me.id)) { for (const h of ctx.hooks.callJoin) h(me, chan, c, b, false); c.parts.add(me.id); fire('join', chan, c, me.id); }
    pushState(chan); json(res, 200, { ok: true, call: callOut(c) });
  };
  api['POST /api/call/leave'] = async (req, res, me) => {
    const chan = str((await body(req, 256)).chan, 64); see(me, chan); leave(chan, me.id);
    json(res, 200, { ok: true });
  };
  const inCall = async (req, me, size = 256) => { const b = await body(req, size), chan = str(b.chan, 64); see(me, chan); const c = calls.get(chan); if (!c || !c.parts.has(me.id)) fail(400, 'Not in this call'); if (!rate('cmedia:' + me.id, 120, 60000)) fail(429, 'Slow down'); return { b, chan, c }; };
  // mic / camera / raised hand, so everybody's tiles show the right icons
  api['POST /api/call/media'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me); c.media[me.id] = { mic: b.mic !== false, cam: !!b.cam, hand: !!b.hand }; pushState(chan); json(res, 200, { ok: true });
  };
  // one presenter at a time: starting a share takes over from whoever was presenting
  api['POST /api/call/share'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me); if (b.on) c.sharing = me.id; else if (c.sharing === me.id) c.sharing = null; pushState(chan); json(res, 200, { ok: true, sharing: c.sharing });
  };
  const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉'];
  api['POST /api/call/react'] = async (req, res, me) => {
    const { b, chan, c } = await inCall(req, me); if (!REACTIONS.includes(b.emoji)) fail(400, 'Unknown reaction');
    emit('callreact', { chan, from: me.id, emoji: b.emoji }, [...c.parts]); json(res, 200, { ok: true });
  };
  api['POST /api/call/signal'] = async (req, res, me) => {
    const b = await body(req, 60000), chan = str(b.chan, 64); see(me, chan);
    const c = calls.get(chan), to = str(b.to, 32), kind = str(b.kind, 10);
    if (!c || !c.parts.has(me.id) || !c.parts.has(to) || !['offer', 'answer', 'ice'].includes(kind)) fail(400, 'Not in this call');
    if (!rate('sig:' + me.id, 600, 60000)) fail(429, 'Too much signaling');
    emit('callsig', { chan, from: me.id, kind, data: b.data }, [to]); json(res, 200, { ok: true });
  };
  ctx.ticks.push({ every: 5000, fn: () => { for (const [chan, c] of [...calls]) for (const id of [...c.parts]) if (!online(id)) leave(chan, id); } });
};
