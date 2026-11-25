'use strict';
// Calls area: Walkie Talkie (push to talk). Pick a chat or channel, connect, then hold the big button (or Space) to talk:
// everyone connected to that chat hears you. One person talks at a time; the server grants the floor
// (lib/routes-callx.js). Audio goes device to device over WebRTC, like calls.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cl_walkie: 'Walkie Talkie', cl_wConnect: 'Connect', cl_wDisconnect: 'Disconnect', cl_wHold: 'Hold to talk', cl_wHoldHelp: 'Hold the button, or hold Space, while you talk.', cl_wFree: 'The channel is free',
    cl_wTalking: '{name} is talking', cl_wYou: 'You’re talking', cl_wPeople: 'Connected ({n})', cl_wNobody: 'Nobody else is connected yet.', cl_wPick: 'Pick a chat or channel to talk in.', cl_wChats: 'Chats and channels', cl_wConnectedN: '{n} connected',
    cl_wBusy: '{name} is talking. Wait for them to finish.', cl_wNoMic: 'Walkie Talkie needs a microphone.',
  });
  LC.addStrings('hi', { cl_walkie: 'वॉकी टॉकी', cl_wConnect: 'कनेक्ट करें', cl_wHold: 'बोलने के लिए दबाए रखें' });
  LC.addStrings('es', { cl_walkie: 'Walkie Talkie', cl_wConnect: 'Conectar', cl_wDisconnect: 'Desconectar', cl_wHold: 'Mantén pulsado para hablar' });
  const EP = 'w' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  let W = null, sel = null, host = null, talking = false;
  const states = new Map(); // chan -> { people, eps, floor }
  const fail = (e) => LC.toast(e.message);
  const chats = () => [...S.channels.values()].map((c) => c.id);

  // ---------- connection ----------
  async function connect(chan) {
    if (W) await disconnect();
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection)) return LC.needSecure();
    let mic; try { mic = await (LC.callDevices ? LC.callDevices.getMic(LC.ui.micId) : navigator.mediaDevices.getUserMedia({ audio: true })); } catch { return LC.toast(t('cl_wNoMic')); }
    mic.getAudioTracks().forEach((x) => { x.enabled = false; });
    W = { chan, mic, peers: new Map() };
    try { const r = await LC.api('/api/walkie/join', { chan, ep: EP }); states.set(chan, r.state); for (const e of r.state.eps) if (e.ep !== EP) peerOf(e.ep, true); }
    catch (e) { mic.getTracks().forEach((x) => x.stop()); W = null; return fail(e); }
    W.alive = setInterval(() => { if (W) LC.api('/api/walkie/alive', { chan: W.chan, ep: EP }).catch(() => {}); }, 10000);
    draw();
  }
  async function disconnect() {
    if (!W) return; const w = W; W = null; talking = false; clearInterval(w.alive);
    for (const p of w.peers.values()) { try { p.pc.close(); } catch {} p.audio.remove(); }
    w.mic.getTracks().forEach((x) => x.stop()); LC.api('/api/walkie/leave', { chan: w.chan, ep: EP }).catch(() => {}); draw();
  }
  const sig = (to, kind, data) => LC.api('/api/walkie/signal', { chan: W.chan, ep: EP, to, kind, data }).catch(() => {});
  function peerOf(ep, offer) {
    let p = W.peers.get(ep); if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: [] }), audio = el('audio', { autoplay: true, class: 'hidden' }); document.body.append(audio);
    p = { pc, audio, queue: [], ready: false }; W.peers.set(ep, p);
    pc.addTrack(W.mic.getAudioTracks()[0], W.mic);
    pc.onicecandidate = (e) => { if (e.candidate && W) sig(ep, 'ice', e.candidate); };
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); if (LC.ui.speakerId && audio.setSinkId) audio.setSinkId(LC.ui.speakerId).catch(() => {}); audio.play().catch(() => {}); };
    if (offer) pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => sig(ep, 'offer', pc.localDescription)).catch(() => {});
    return p;
  }
  const flush = async (p) => { p.ready = true; for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {}); };
  LC.on('walkiesig', async (m) => {
    if (!W || m.chan !== W.chan || m.to !== EP) return; const p = peerOf(m.fromEp, false), pc = p.pc;
    try {
      if (m.kind === 'offer') { if (pc.signalingState === 'have-local-offer') { if (EP < m.fromEp) await pc.setLocalDescription({ type: 'rollback' }); else return; } await pc.setRemoteDescription(m.data); await pc.setLocalDescription(await pc.createAnswer()); sig(m.fromEp, 'answer', pc.localDescription); await flush(p); }
      else if (m.kind === 'answer') { if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(m.data); await flush(p); } }
      else if (m.kind === 'ice') { if (p.ready) await pc.addIceCandidate(m.data).catch(() => {}); else p.queue.push(m.data); }
    } catch (e) { console.error('walkie signal', e); }
  });
  LC.on('walkie', (s) => {
    states.set(s.chan, s);
    if (W && s.chan === W.chan) {
      const eps = new Set(s.eps.map((e) => e.ep)); for (const [ep, p] of [...W.peers]) if (!eps.has(ep)) { try { p.pc.close(); } catch {} p.audio.remove(); W.peers.delete(ep); }
      if (!eps.has(EP)) { disconnect(); return; }
      if (talking && (!s.floor || s.floor.ep !== EP)) stopTalk(true);
    }
    if (S.pane === 'walkie') { draw(); if (!S.app) LC.renderNav(); }
  });
  LC.on('init', () => { if (W) LC.api('/api/walkie/join', { chan: W.chan, ep: EP }).catch(() => disconnect()); LC.api('/api/walkie/state').then((r) => { for (const s of r.walkies) states.set(s.chan, s); }).catch(() => {}); });

  // ---------- talking ----------
  const chirp = (up) => { try { const ac = (LC.ringtones && LC.ringtones.ctx) || new AudioContext(); if (LC.ringtones) LC.ringtones.ctx = ac; const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime; o.frequency.setValueAtTime(up ? 880 : 1175, t0); o.frequency.linearRampToValueAtTime(up ? 1175 : 880, t0 + 0.09); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12); o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.14); } catch {} };
  async function startTalk() {
    if (!W || talking) return; talking = true; draw();
    try { const r = await LC.api('/api/walkie/talk', { chan: W.chan, ep: EP, on: true }); if (!r.floor || !talking) { talking = false; return draw(); } W.mic.getAudioTracks().forEach((x) => { x.enabled = true; }); chirp(true); }
    catch (e) { talking = false; LC.toast(e.message, { ms: 2500 }); }
    draw();
  }
  function stopTalk(lost) { if (!W) return; const was = talking; talking = false; W.mic.getAudioTracks().forEach((x) => { x.enabled = false; }); if (was && !lost) { chirp(false); LC.api('/api/walkie/talk', { chan: W.chan, ep: EP, on: false }).catch(() => {}); } draw(); }
  const typing = (e) => { const n = e.target; return n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(n.tagName)); };
  document.addEventListener('keydown', (e) => { if (W && S.app === 'walkie' && e.code === 'Space' && !e.repeat && !e.ctrlKey && !e.metaKey && !typing(e) && !document.querySelector('.modal:not(.hidden)')) { e.preventDefault(); startTalk(); } });
  document.addEventListener('keyup', (e) => { if (W && talking && e.code === 'Space') { e.preventDefault(); stopTalk(); } });
  window.addEventListener('blur', () => { if (talking) stopTalk(); });

  // ---------- the pane ----------
  function renderNav(nav) {
    const row = (chan) => { const s = states.get(chan), n = s ? s.people.length : 0, on = W && W.chan === chan;
      return el('button', { class: 'callrow cl-wrow' + (sel === chan ? ' on' : ''), 'aria-current': sel === chan ? 'true' : null, onclick: () => { sel = chan; LC.openApp('walkie'); LC.renderNav(); } }, LC.chatLead ? LC.chatLead(chan) : '', el('span', { class: 'itext' }, el('b', { class: 'name', text: LC.chanInfo(chan).title }), el('span', { class: 'prev', text: n ? t('cl_wConnectedN', { n }) : '' })), on ? LC.icon('walkie_talkie', { filled: true, cls: 'cl-won', label: t('cl_wConnect') }) : null); };
    nav.replaceChildren(el('div', { class: 'sec' }, el('h2', { class: 'sectitle', text: t('cl_wChats') })), ...chats().map(row));
  }
  function draw() {
    if (!host || !host.isConnected || S.app !== 'walkie') return;
    const chan = sel || (W && W.chan); if (!chan) return host.replaceChildren(LC.emptyState ? LC.emptyState('walkie_talkie', t('cl_wPick')) : el('p', { text: t('cl_wPick') }));
    const s = states.get(chan) || { people: [], floor: null }, on = W && W.chan === chan, floor = s.floor, mine = floor && floor.ep === EP, others = s.people.filter((u) => u !== S.me.id);
    const status = mine || (talking && on) ? t('cl_wYou') : floor ? t('cl_wTalking', { name: LC.uname(floor.uid) }) : t('cl_wFree');
    const ptt = el('button', { class: 'cl-ptt' + (mine ? ' on' : floor ? ' busy' : ''), type: 'button', disabled: !on, 'aria-label': t('cl_wHold'), 'aria-pressed': String(!!mine) }, LC.icon('walkie_talkie', { filled: true }), el('span', { text: t('cl_wHold') }));
    ptt.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); ptt.setPointerCapture(e.pointerId); startTalk(); });
    for (const ev of ['pointerup', 'pointercancel']) ptt.addEventListener(ev, () => stopTalk());
    ptt.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); startTalk(); } });
    ptt.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopTalk(); } });
    host.replaceChildren(el('div', { class: 'cl-walkie' }, el('div', { class: 'cl-whead' }, LC.chatLead ? LC.chatLead(chan, 'lg') : '', el('h2', { text: LC.chanInfo(chan).title }),
      on ? el('button', { class: 'secondary withicon', type: 'button', onclick: disconnect }, LC.icon('call_end'), t('cl_wDisconnect')) : el('button', { class: 'primary withicon', type: 'button', onclick: () => connect(chan) }, LC.icon('walkie_talkie'), t('cl_wConnect'))),
      el('p', { class: 'cl-wstatus' + (floor ? ' live' : ''), role: 'status', 'aria-live': 'polite', text: status }), ptt, el('p', { class: 'muted small', text: t('cl_wHoldHelp') }),
      el('h3', { text: t('cl_wPeople', { n: s.people.length }) }), el('div', { class: 'cl-wpeople' }, s.people.length ? s.people.map((u) => el('div', { class: 'cl-wp' + (floor && floor.uid === u ? ' talking' : '') }, LC.avatar(S.users.get(u), 'lg', false), el('span', { text: u === S.me.id ? t('you') : LC.uname(u) }))) : el('p', { class: 'muted', text: t('cl_wNobody') })), void others));
  }
  LC.ext.panes.walkie = { icon: 'walkie_talkie', label: () => t('cl_walkie'), order: 62, render: renderNav, main: (h) => { host = h; h.classList.add('cl-walkiehost'); if (!sel && S.chan && !S.chan.startsWith('dm:')) sel = S.chan; draw(); LC.api('/api/walkie/state').then((r) => { for (const s2 of r.walkies) states.set(s2.chan, s2); draw(); if (S.pane === 'walkie' && !S.app) LC.renderNav(); }).catch(() => {}); }, badge: () => (W ? 1 : 0), get live() { return !!W; } };
  LC.walkie = { connect, disconnect, talk: startTalk, release: () => stopTalk(), state: () => (W ? { chan: W.chan, talking, ep: EP, peers: [...W.peers.values()].map((p) => p.pc.connectionState) } : null) };
})();
