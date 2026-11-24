'use strict';
// Voice / video / screen-share calls. WebRTC mesh (up to 8 people); the server only relays signaling.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  let call = null, ringTimer = null, ringBox = null;
  const media = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  LC.inCall = () => !!call;
  LC.callDebug = () => (call ? [...call.peers.values()].map((p) => p.pc.connectionState + '/' + p.pc.iceConnectionState) : null);

  // ---------- header call bar ----------
  LC.renderCallBar = () => {
    const bar = $('#callBar'); if (!bar) return; const c = S.calls[S.chan];
    if (!c) { bar.classList.add('hidden'); bar.replaceChildren(); return; }
    const inThis = call && call.chan === S.chan;
    bar.replaceChildren(el('span', { class: 'recdot', text: '●' }), el('span', { text: ` ${c.mode === 'video' ? '📹' : '📞'} ${t('callInProgress')} · ${c.participants.map(LC.uname).join(', ')}` }), inThis ? el('button', { class: 'secondary sm', text: t('openCall'), onclick: () => $('#callUI').classList.remove('hidden') }) : el('button', { class: 'primary sm', text: t('joinCall'), onclick: () => LC.joinCall(S.chan) }));
    bar.classList.remove('hidden');
  };

  // ---------- starting / joining ----------
  async function getLocal(mode) {
    if (!media()) throw new Error(t('needSecure'));
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: mode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false }); }
    catch (e) { if (mode === 'video') { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); LC.toast(t('noCamera')); return s; } catch {} } throw new Error(t('micDenied')); }
  }
  LC.startCall = async (chan, mode) => {
    if (call) return LC.toast(t('alreadyInCall')); if (S.calls[chan]) return LC.joinCall(chan);
    let stream; try { stream = await getLocal(mode); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/start', { chan, mode }); begin(chan, r.call, stream); } catch (e) { stream.getTracks().forEach((x) => x.stop()); LC.toast(e.message); }
  };
  LC.joinCall = async (chan) => {
    if (call) return LC.toast(t('alreadyInCall')); const c = S.calls[chan]; if (!c) return LC.toast(t('callEnded'));
    stopRing(); let stream; try { stream = await getLocal(c.mode); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/join', { chan }); begin(chan, r.call, stream); } catch (e) { stream.getTracks().forEach((x) => x.stop()); LC.toast(e.message); }
  };
  function begin(chan, info, stream) {
    call = { chan, mode: info.mode, local: stream, screen: null, peers: new Map(), t0: Date.now() }; S.calls[chan] = info;
    $('#callUI').classList.remove('hidden'); drawUi();
    for (const id of info.participants) if (id !== S.me.id) connect(id, true);
    LC.renderCallBar();
  }

  // ---------- peers ----------
  const send = (to, kind, data) => LC.api('/api/call/signal', { chan: call.chan, to, kind, data }).catch(() => {});
  function peer(id) {
    let p = call.peers.get(id); if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: [] }), stream = new MediaStream(); p = { id, pc, stream, queue: [], ready: false, tile: null }; call.peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) send(id, 'ice', e.candidate); };
    pc.ontrack = (e) => { stream.addTrack(e.track); e.track.onmute = e.track.onunmute = () => updateTile(p); updateTile(p); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') LC.toast(t('callPeerFailed', { name: LC.uname(id) })); updateTile(p); };
    drawUi(); return p;
  }
  function attachLocal(pc, offerer) {
    const a = call.local.getAudioTracks()[0], v = (call.screen || call.local).getVideoTracks()[0];
    if (offerer) { if (a) pc.addTrack(a, call.local); const vt = pc.addTransceiver('video', { direction: 'sendrecv' }); if (v) vt.sender.replaceTrack(v); }
    else for (const tr of pc.getTransceivers()) { tr.direction = 'sendrecv'; if (tr.receiver.track.kind === 'audio') tr.sender.replaceTrack(a || null); else tr.sender.replaceTrack(v || null); }
  }
  async function connect(id, offerer) {
    const p = peer(id); if (!offerer) return p;
    attachLocal(p.pc, true);
    try { const offer = await p.pc.createOffer(); await p.pc.setLocalDescription(offer); await send(id, 'offer', p.pc.localDescription); } catch (e) { console.error('offer failed', e); }
    return p;
  }
  async function flush(p) { p.ready = true; for (const c of p.queue.splice(0)) { try { await p.pc.addIceCandidate(c); } catch {} } }
  LC.on('callsig', async (m) => {
    if (!call || m.chan !== call.chan) return; const p = peer(m.from), pc = p.pc;
    try {
      if (m.kind === 'offer') {
        if (pc.signalingState === 'have-local-offer') { if (S.me.id < m.from) await pc.setLocalDescription({ type: 'rollback' }); else return; } // glare: the lower id yields
        const fresh = pc.getTransceivers().length === 0; await pc.setRemoteDescription(m.data); if (fresh) attachLocal(pc, false); else attachLocal(pc, false);
        await pc.setLocalDescription(await pc.createAnswer()); await send(m.from, 'answer', pc.localDescription); await flush(p);
      } else if (m.kind === 'answer') { if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(m.data); await flush(p); } }
      else if (m.kind === 'ice') { if (p.ready) await pc.addIceCandidate(m.data).catch(() => {}); else p.queue.push(m.data); }
    } catch (e) { console.error('signal error', e); }
  });
  LC.on('callstate', (e) => {
    if (e.call) S.calls[e.chan] = e.call; else delete S.calls[e.chan];
    if (call && e.chan === call.chan) {
      if (!e.call) return endLocal(); const ids = new Set(e.call.participants);
      for (const [id, p] of call.peers) if (!ids.has(id)) { p.pc.close(); call.peers.delete(id); }
      drawUi();
    }
    if (ringBox && ringBox.dataset.chan === e.chan && (!e.call || e.call.participants.includes(S.me.id))) stopRing();
    LC.renderCallBar();
  });
  LC.on('init', () => { if (call) { const c = S.calls[call.chan]; if (!c) endLocal(); else if (!c.participants.includes(S.me.id)) LC.api('/api/call/join', { chan: call.chan }).catch(() => endLocal()); } });

  // ---------- ringing ----------
  function stopRing() { clearInterval(ringTimer); ringTimer = null; if (ringBox) { ringBox.remove(); ringBox = null; } }
  LC.on('callring', (r) => {
    if (call || S.me.presence === 'dnd' || LC.isMuted(r.chan)) return; stopRing();
    ringBox = el('div', { class: 'ringbox', 'data-chan': r.chan, role: 'alertdialog' }, el('b', { text: `${r.call.mode === 'video' ? '📹' : '📞'} ${LC.uname(r.from)}` }), el('span', { class: 'muted', text: t('incomingCall', { where: LC.chanInfo(r.chan).title }) }), el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('decline'), onclick: stopRing }), el('button', { class: 'primary sm', text: t('accept'), onclick: async () => { stopRing(); await LC.openChat(r.chan); LC.joinCall(r.chan); } })));
    document.body.append(ringBox); LC.playSound('ring'); let n = 0; ringTimer = setInterval(() => { if (++n > 8) return stopRing(); LC.playSound('ring'); }, 3500);
    if (LC.native && !LC.visible()) LC.native.notify(t('incomingCallTitle'), `${LC.uname(r.from)} · ${LC.chanInfo(r.chan).title}`, r.chan);
  });

  // ---------- UI ----------
  function updateTile(p) {
    if (!p.tile) return; const v = p.stream.getVideoTracks().some((x) => x.readyState === 'live' && !x.muted); p.tile.classList.toggle('novideo', !v);
    if (p.tile.querySelector('video').srcObject !== p.stream) p.tile.querySelector('video').srcObject = p.stream;
  }
  function tileFor(id, stream, local) {
    const u = S.users.get(id), vid = el('video', { autoplay: true, playsinline: true, muted: !!local }); vid.muted = !!local; vid.srcObject = stream;
    return el('div', { class: 'tile' + (local ? ' local' : '') + ' novideo', 'data-id': id }, vid, el('div', { class: 'tav' }, LC.avatar(u, 'lg', false)), el('span', { class: 'tname', text: (local ? t('you') : LC.uname(id)) }));
  }
  function drawUi() {
    const ui = $('#callUI'); if (!call) { ui.classList.add('hidden'); ui.replaceChildren(); return; }
    const grid = el('div', { class: 'tiles n' + Math.min(call.peers.size + 1, 9) });
    const lt = tileFor(S.me.id, new MediaStream((call.screen || call.local).getVideoTracks()), true); const hasV = (call.screen || call.local).getVideoTracks().some((x) => x.enabled); lt.classList.toggle('novideo', !hasV); grid.append(lt);
    for (const p of call.peers.values()) { p.tile = tileFor(p.id, p.stream, false); grid.append(p.tile); updateTile(p); }
    const audio = call.local.getAudioTracks()[0], cam = call.local.getVideoTracks()[0], b = (ic, label, fn, on) => el('button', { class: 'cbtn' + (on ? ' off' : ''), title: label, 'aria-label': label, text: ic, onclick: fn });
    const bar = el('div', { class: 'ccontrols' }, b(audio && audio.enabled ? '🎤' : '🔇', t('toggleMic'), () => { if (audio) audio.enabled = !audio.enabled; drawUi(); }, audio && !audio.enabled),
      call.mode === 'video' && cam ? b(cam.enabled ? '📹' : '🚫', t('toggleCam'), () => { cam.enabled = !cam.enabled; drawUi(); }, !cam.enabled) : null,
      navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia ? b(call.screen ? '🛑' : '🖥', call.screen ? t('stopShare') : t('shareScreen'), toggleScreen, !!call.screen) : null,
      b('⌄', t('minimize'), () => ui.classList.add('hidden')), b('📞', t('leaveCall'), () => LC.leaveCall(), true));
    ui.replaceChildren(el('div', { class: 'chead' }, el('b', { text: (call.mode === 'video' ? '📹 ' : '📞 ') + LC.chanInfo(call.chan).title }), el('span', { class: 'muted small', id: 'callTimer' })), grid, bar);
  }
  setInterval(() => { const n = $('#callTimer'); if (n && call) { const s = Math.floor((Date.now() - call.t0) / 1000); n.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }, 1000);
  async function toggleScreen() {
    if (call.screen) return stopScreen();
    try { const s = await navigator.mediaDevices.getDisplayMedia({ video: true }); call.screen = s; const tr = s.getVideoTracks()[0]; tr.onended = stopScreen; for (const p of call.peers.values()) { const vt = p.pc.getTransceivers().find((x) => x.receiver.track.kind === 'video'); if (vt) { vt.direction = 'sendrecv'; vt.sender.replaceTrack(tr); } } drawUi(); }
    catch (e) { LC.toast(t('captureDenied')); }
  }
  function stopScreen() { if (!call || !call.screen) return; call.screen.getTracks().forEach((x) => x.stop()); call.screen = null; const cam = call.local.getVideoTracks()[0]; for (const p of call.peers.values()) { const vt = p.pc.getTransceivers().find((x) => x.receiver.track.kind === 'video'); if (vt) vt.sender.replaceTrack(cam || null); } drawUi(); }
  function endLocal() { if (!call) return; for (const p of call.peers.values()) try { p.pc.close(); } catch {} call.local.getTracks().forEach((x) => x.stop()); if (call.screen) call.screen.getTracks().forEach((x) => x.stop()); call = null; drawUi(); LC.renderCallBar(); }
  LC.leaveCall = async () => { if (!call) return; const chan = call.chan; endLocal(); LC.api('/api/call/leave', { chan }).catch(() => {}); };
  window.addEventListener('beforeunload', () => { if (call && navigator.sendBeacon) navigator.sendBeacon('/api/call/leave?token=' + encodeURIComponent(S.token), new Blob([JSON.stringify({ chan: call.chan })], { type: 'application/json' })); });
})();
