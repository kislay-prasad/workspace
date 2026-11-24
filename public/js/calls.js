'use strict';
// Calls: voice, video and screen sharing in a Teams-style meeting window. WebRTC mesh (up to 8 people); the server only
// relays signaling and tells everyone who is muted, who has their camera on, whose hand is up and who is presenting.
// Every peer connection carries three tracks: microphone, camera and screen (the camera stays visible while you present).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  let call = null, ringTimer = null, ringBox = null, audioCtx = null, drawQueued = false;
  const media = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  const canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer:coarse)').matches;
  const stopStream = (s) => s && s.getTracks().forEach((x) => x.stop());
  LC.inCall = () => !!call;
  LC.callChan = () => (call ? call.chan : null);
  LC.callDebug = () => (call ? [...call.peers.values()].map((p) => p.pc.connectionState + '/' + p.pc.iceConnectionState) : null);
  const state = () => (call && S.calls[call.chan]) || { participants: [], media: {}, sharing: null };
  const mediaOf = (id) => (id === S.me.id ? call.me : (state().media || {})[id]);
  const drawSoon = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawUi(); }); };

  // ---------- bar above the chat while a call is running ----------
  LC.renderCallBar = () => {
    const bar = $('#callBar'); if (!bar) return; const c = S.calls[S.chan];
    if (!c) { bar.classList.add('hidden'); bar.replaceChildren(); return; }
    const inThis = call && call.chan === S.chan;
    bar.replaceChildren(el('span', { class: 'livedot', 'aria-hidden': 'true' }), LC.icon(c.mode === 'video' ? 'video' : 'call', { filled: true }), el('span', { class: 'grow', text: `${t('callInProgress')} · ${c.participants.map(LC.uname).join(', ')}` }),
      inThis ? el('button', { class: 'secondary sm', text: t('openCall'), onclick: () => LC.showCall() }) : el('button', { class: 'primary sm withicon', onclick: () => LC.joinCall(S.chan) }, LC.icon('call'), t('joinCall')));
    bar.classList.remove('hidden');
  };

  // ---------- devices ----------
  async function getMic(id) { const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }; try { return await navigator.mediaDevices.getUserMedia({ audio: id ? { ...base, deviceId: { exact: id } } : base }); } catch (e) { if (!id) throw e; return navigator.mediaDevices.getUserMedia({ audio: base }); } }
  async function getCam(id) { const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } }; try { return await navigator.mediaDevices.getUserMedia({ video: id ? { ...base, deviceId: { exact: id } } : base }); } catch (e) { if (!id) throw e; return navigator.mediaDevices.getUserMedia({ video: base }); } }
  async function getLocal(mode) {
    const local = new MediaStream(); let cam = false;
    try { (await getMic(LC.ui.micId)).getAudioTracks().forEach((x) => local.addTrack(x)); }
    catch (e) { if (e && e.name === 'NotFoundError') LC.toast(t('noMic')); else throw new Error(t('micDenied')); }
    if (mode === 'video') { try { (await getCam(LC.ui.camId)).getVideoTracks().forEach((x) => local.addTrack(x)); cam = true; } catch { LC.toast(t('noCamera')); } }
    return { local, cam };
  }

  // ---------- starting / joining ----------
  LC.startCall = async (chan, mode) => {
    if (call) { if (call.chan === chan) return LC.showCall(); return LC.toast(t('alreadyInCall')); }
    if (S.calls[chan]) return LC.joinCall(chan, mode);
    if (!media()) return LC.needSecure();
    let got; try { got = await getLocal(mode); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/start', { chan, mode }); begin(chan, r.call, got); } catch (e) { stopStream(got.local); LC.toast(e.message); }
  };
  LC.joinCall = async (chan, mode) => {
    if (call) { if (call.chan === chan) return LC.showCall(); return LC.toast(t('alreadyInCall')); }
    const c = S.calls[chan]; if (!c) return LC.toast(t('callEnded'));
    if (!media()) return LC.needSecure();
    stopRing(); let got; try { got = await getLocal(mode || c.mode); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/join', { chan }); begin(chan, r.call, got); } catch (e) { stopStream(got.local); LC.toast(e.message); }
  };
  function begin(chan, info, got) {
    call = { chan, mode: info.mode, local: got.local, screen: null, mixed: null, peers: new Map(), tiles: new Map(), t0: Date.now(), me: { mic: got.local.getAudioTracks().length > 0, cam: got.cam, hand: false }, mini: false, panel: null, spoke: {}, meLevel: {} };
    S.calls[chan] = info; syncMedia();
    for (const id of info.participants) if (id !== S.me.id) connect(id, true);
    startLevels(); LC.showCall(); LC.renderCallBar(); if (S.chan && LC.renderHeader) LC.renderHeader();
  }
  const syncMedia = () => call && LC.api('/api/call/media', { chan: call.chan, ...call.me }).catch(() => {});
  LC.showCall = () => { if (!call) return; call.mini = false; drawUi(); };
  const setMini = (v) => { if (!call) return; call.mini = v; if (v && document.fullscreenElement) document.exitFullscreen().catch(() => {}); drawUi(); };

  // ---------- peer connections ----------
  const send = (to, kind, data) => LC.api('/api/call/signal', { chan: call.chan, to, kind, data }).catch(() => {});
  const outgoing = () => {
    const mic = call.local.getAudioTracks()[0] || null;
    return { a: call.mixed ? call.mixed.track : mic, v: call.local.getVideoTracks()[0] || null, s: call.screen ? call.screen.getVideoTracks()[0] || null : null };
  };
  function peer(id) {
    let p = call.peers.get(id); if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: [] });
    p = { id, pc, tx: null, cam: new MediaStream(), screen: null, aud: null, audio: null, queue: [], ready: false }; call.peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) send(id, 'ice', e.candidate); };
    pc.ontrack = () => drawSoon();
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') LC.toast(t('callPeerFailed', { name: LC.uname(id) })); drawSoon(); };
    return p;
  }
  // transceivers in m-line order: microphone, camera, screen
  function bindRemote(p) {
    const trs = p.pc.getTransceivers().filter((x) => x.mid !== null), au = trs.find((x) => x.receiver.track.kind === 'audio'), vids = trs.filter((x) => x.receiver.track.kind === 'video');
    p.tx = { au, cam: vids[0], scr: vids[1] };
    p.cam = new MediaStream([au, vids[0]].filter(Boolean).map((x) => x.receiver.track));
    p.aud = au ? new MediaStream([au.receiver.track]) : null;
    p.screen = vids[1] ? new MediaStream([vids[1].receiver.track]) : null;
    for (const x of [au, ...vids]) if (x) x.receiver.track.onmute = x.receiver.track.onunmute = drawSoon;
    attachAudio(p); drawSoon();
  }
  function attachLocal(p, offerer) {
    const { a, v, s } = outgoing();
    if (offerer) { const au = p.pc.addTransceiver(a || 'audio', { direction: 'sendrecv', streams: [call.local] }), cam = p.pc.addTransceiver('video', { direction: 'sendrecv' }), scr = p.pc.addTransceiver('video', { direction: 'sendrecv' }); cam.sender.replaceTrack(v); scr.sender.replaceTrack(s); p.tx = { au, cam, scr }; }
    else { for (const x of p.pc.getTransceivers()) if (x.mid !== null) x.direction = 'sendrecv'; bindRemote(p); setSenders(p, { a, v, s }); }
  }
  function setSenders(p, o) {
    if (!p.tx) return; const put = (x, tr) => x && x.sender.track !== tr && x.sender.replaceTrack(tr).catch(() => {});
    put(p.tx.au, o.a); put(p.tx.cam, o.v); put(p.tx.scr, o.s);
    if (p.tx.scr && o.s) { try { const prm = p.tx.scr.sender.getParameters(); if (prm.encodings && prm.encodings[0]) { prm.encodings[0].maxBitrate = 2500000; p.tx.scr.sender.setParameters(prm).catch(() => {}); } } catch {} }
  }
  const updateSenders = () => { const o = outgoing(); for (const p of call.peers.values()) setSenders(p, o); };
  async function connect(id, offerer) {
    const p = peer(id); if (!offerer) return p;
    attachLocal(p, true);
    try { await p.pc.setLocalDescription(await p.pc.createOffer()); await send(id, 'offer', p.pc.localDescription); } catch (e) { console.error('offer failed', e); }
    return p;
  }
  async function flush(p) { p.ready = true; for (const c of p.queue.splice(0)) { try { await p.pc.addIceCandidate(c); } catch {} } }
  LC.on('callsig', async (m) => {
    if (!call || m.chan !== call.chan) return; const p = peer(m.from), pc = p.pc;
    try {
      if (m.kind === 'offer') {
        if (pc.signalingState === 'have-local-offer') { if (S.me.id < m.from) await pc.setLocalDescription({ type: 'rollback' }); else return; } // glare: the lower id yields
        await pc.setRemoteDescription(m.data); attachLocal(p, false);
        await pc.setLocalDescription(await pc.createAnswer()); await send(m.from, 'answer', pc.localDescription); await flush(p);
      } else if (m.kind === 'answer') { if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(m.data); bindRemote(p); await flush(p); } }
      else if (m.kind === 'ice') { if (p.ready) await pc.addIceCandidate(m.data).catch(() => {}); else p.queue.push(m.data); }
    } catch (e) { console.error('signal error', e); }
  });
  function attachAudio(p) {
    let host = $('#callAudio'); if (!host) { host = el('div', { id: 'callAudio', class: 'hidden' }); document.body.append(host); }
    if (!p.audio) { p.audio = el('audio', { autoplay: true }); host.append(p.audio); }
    if (p.aud && p.audio.srcObject !== p.aud) { p.audio.srcObject = p.aud; p.audio.play().catch(() => {}); }
    if (LC.ui.speakerId && p.audio.setSinkId) p.audio.setSinkId(LC.ui.speakerId).catch(() => {});
  }
  const dropPeer = (id) => { const p = call.peers.get(id); if (!p) return; try { p.pc.close(); } catch {} if (p.audio) p.audio.remove(); call.peers.delete(id); };

  LC.on('callstate', (e) => {
    if (call && e.chan === call.chan) {
      if (!e.call) return endLocal();
      const ids = new Set(e.call.participants); for (const id of [...call.peers.keys()]) if (!ids.has(id)) dropPeer(id);
      if (call.screen && e.call.sharing && e.call.sharing !== S.me.id) { stopScreen(true); LC.toast(t('tookOver', { name: LC.uname(e.call.sharing) })); }
      drawSoon();
    }
    if (ringBox && ringBox.dataset.chan === e.chan && (!e.call || e.call.participants.includes(S.me.id))) stopRing();
    LC.renderCallBar();
  });
  LC.on('init', () => { if (call) { const c = S.calls[call.chan]; if (!c) endLocal(); else if (!c.participants.includes(S.me.id)) LC.api('/api/call/join', { chan: call.chan }).then(() => syncMedia()).catch(() => endLocal()); } });

  // ---------- who is talking ----------
  function startLevels() {
    try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume().catch(() => {}); } catch { return; }
    const level = (stream, o) => {
      const tr = stream && stream.getAudioTracks()[0]; if (!tr || tr.readyState !== 'live') return 0;
      if (o.anTrack !== tr) { try { const src = audioCtx.createMediaStreamSource(new MediaStream([tr])), an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an); o.an = an; o.anTrack = tr; o.buf = new Uint8Array(an.fftSize); } catch { return 0; } }
      o.an.getByteTimeDomainData(o.buf); let sum = 0; for (const v of o.buf) { const d = (v - 128) / 128; sum += d * d; } return Math.sqrt(sum / o.buf.length);
    };
    call.levelTimer = setInterval(() => {
      if (!call) return; const now = Date.now();
      const mark = (id, lvl, muted) => { const on = !muted && lvl > 0.035, tile = call.tiles.get(id); if (on) call.spoke[id] = now; if (tile) tile.classList.toggle('speaking', on || now - (call.spoke[id] || 0) < 400); };
      mark(S.me.id, level(call.local, call.meLevel), !call.me.mic);
      for (const p of call.peers.values()) mark(p.id, level(p.aud, p), (mediaOf(p.id) || {}).mic === false);
    }, 150);
  }
  const dominant = () => { let best = null, ts = 0; for (const [id, at] of Object.entries(call.spoke)) if (id !== S.me.id && at > ts && call.peers.has(id)) { best = id; ts = at; } return best; };

  // ---------- tiles ----------
  function tileFor(id) {
    let tile = call.tiles.get(id); if (tile) return tile;
    const vid = el('video', { autoplay: true, playsinline: true, muted: true }); vid.muted = true;
    tile = el('div', { class: 'tile' + (id === S.me.id ? ' local' : ''), 'data-id': id }, vid, el('div', { class: 'tav' }), el('div', { class: 'tlabel' }));
    call.tiles.set(id, tile); return tile;
  }
  function updateTile(id) {
    const tile = tileFor(id), local = id === S.me.id, p = call.peers.get(id), md = mediaOf(id), u = S.users.get(id), vid = tile.querySelector('video');
    let stream = null, camOn = false;
    if (local) { const v = call.local.getVideoTracks()[0]; if (v && call.me.cam) { if (!call.selfView || call.selfView.getVideoTracks()[0] !== v) call.selfView = new MediaStream([v]); stream = call.selfView; camOn = true; } }
    else if (p) { const v = p.cam.getVideoTracks()[0]; stream = p.cam; camOn = !!v && v.readyState === 'live' && (md ? md.cam : !v.muted); }
    if (camOn && vid.srcObject !== stream) { vid.srcObject = stream; vid.play().catch(() => {}); }
    tile.classList.toggle('novideo', !camOn);
    const tav = tile.querySelector('.tav'); if (!tav.firstChild || tav.dataset.av !== String((u && u.avatar) || '') + (u && u.color)) { tav.replaceChildren(LC.avatar(u, 'xl', false)); tav.dataset.av = String((u && u.avatar) || '') + (u && u.color); }
    const conn = !local && (!p || !['connected', 'completed'].includes(p.pc.iceConnectionState));
    tile.querySelector('.tlabel').replaceChildren(...[md && md.mic === false ? LC.icon('mic_off', { cls: 'tmute', label: t('muted') }) : null, el('span', { text: local ? t('you') : LC.uname(id) }), md && md.hand ? LC.icon('hand_right', { filled: true, cls: 'thand', label: t('handRaised') }) : null, conn ? el('span', { class: 'tconn', text: t('connecting') }) : null].filter(Boolean));
    tile.classList.toggle('hand', !!(md && md.hand));
  }
  function screenBox(sharer) {
    const p = call.peers.get(sharer); if (!call.screenVid) { call.screenVid = el('video', { autoplay: true, playsinline: true, muted: true }); call.screenVid.muted = true; }
    if (p && p.screen && call.screenVid.srcObject !== p.screen) { call.screenVid.srcObject = p.screen; call.screenVid.play().catch(() => {}); }
    return call.screenVid;
  }

  // ---------- the meeting window ----------
  function drawUi() {
    const ui = $('#callUI'); if (!call) { ui.classList.add('hidden'); ui.className = 'callui hidden'; ui.replaceChildren(); return; }
    const st = state(), ids = [S.me.id, ...st.participants.filter((x) => x !== S.me.id)];
    for (const id of ids) updateTile(id);
    for (const [id, tile] of call.tiles) if (!ids.includes(id)) { tile.remove(); call.tiles.delete(id); }
    const sharer = st.sharing && ids.includes(st.sharing) ? st.sharing : null, me = call.me, sharingMe = sharer === S.me.id;
    if (!call.rlayer) call.rlayer = el('div', { class: 'rlayer', 'aria-hidden': 'true' });
    if (call.mini) {
      const focus = sharer && !sharingMe ? el('div', { class: 'present' }, screenBox(sharer)) : tileFor(dominant() || ids.find((x) => x !== S.me.id) || S.me.id);
      ui.replaceChildren(el('div', { class: 'minibox', role: 'region', 'aria-label': t('callInProgress') }, el('div', { class: 'minititle' }, LC.icon(call.mode === 'video' ? 'video' : 'call', { filled: true }), el('span', { class: 'grow', text: LC.chanInfo(call.chan).title }), el('span', { class: 'ctimer', id: 'callTimer' })), focus,
        el('div', { class: 'minibar' }, LC.ibtn(me.mic ? 'mic' : 'mic_off', me.mic ? t('mute') : t('unmuteMic'), toggleMic, { cls: 'cbtn sm' + (me.mic ? '' : ' off') }), LC.ibtn(me.cam ? 'video' : 'video_off', me.cam ? t('turnCameraOff') : t('turnCameraOn'), toggleCam, { cls: 'cbtn sm' + (me.cam ? '' : ' off') }),
          LC.ibtn('arrow_maximize', t('openCall'), () => setMini(false), { cls: 'cbtn sm' }), LC.ibtn('call_end', t('leaveCall'), () => LC.leaveCall(), { cls: 'leave sm', filled: true }))), call.rlayer);
      ui.className = 'callui mini'; if (call.miniPos) Object.assign(ui.style, call.miniPos); dragMini(ui); tickTimer(); return;
    }
    let stage;
    if (sharer) {
      const present = el('div', { class: 'present' });
      if (sharingMe) present.append(el('div', { class: 'selfshare' }, LC.icon('share_screen_start', { cls: 'big' }), el('h2', { text: t('youArePresenting') }), el('p', { text: t('youArePresentingHelp') }), el('button', { class: 'primary danger withicon', onclick: () => stopScreen() }, LC.icon('share_screen_stop'), t('stopShare'))));
      else present.append(screenBox(sharer), el('div', { class: 'plabel' }, LC.icon('share_screen_start'), el('span', { text: t('isPresenting', { name: LC.uname(sharer) }) })), LC.ibtn('full_screen_maximize', t('fullScreen'), () => fullscreen(present), { cls: 'icon pfull' }));
      stage = el('div', { class: 'stage presenting' }, present, el('div', { class: 'film' }, ids.map(tileFor)));
    } else if (ids.length === 2) stage = el('div', { class: 'stage duo' }, tileFor(ids[1]), tileFor(S.me.id));
    else { const n = ids.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols); stage = el('div', { class: 'stage gallery n' + Math.min(n, 9), style: `--cols:${cols};--rows:${rows}` }, ids.map(tileFor)); }
    const ctl = (icon, label, fn, o = {}) => el('button', { class: 'cbtn' + (o.on ? ' on' : '') + (o.off ? ' off' : ''), title: label, 'aria-label': label, 'aria-pressed': o.pressed === undefined ? null : String(!!o.pressed), 'aria-haspopup': o.menu ? 'menu' : null, onclick: fn }, LC.icon(icon, { filled: !!o.on }), el('span', { class: 'clabel', text: o.text || label }));
    const controls = el('div', { class: 'ccontrols', role: 'toolbar', 'aria-label': t('callControls') },
      ctl('chat', t('openChat'), () => { setMini(true); LC.openChat(call.chan); }, { text: t('tabChat') }),
      ctl('people', t('participants'), () => { call.panel = call.panel === 'people' ? null : 'people'; drawUi(); }, { on: call.panel === 'people', pressed: call.panel === 'people', text: t('people') }),
      ctl('hand_right', me.hand ? t('lowerHand') : t('raiseHand'), toggleHand, { on: me.hand, pressed: me.hand, text: t('raise') }),
      ctl('emoji', t('react'), (e) => reactMenu(e.currentTarget), { text: t('react'), menu: true }),
      ctl('more_horizontal', t('moreOptions'), (e) => moreMenu(e.currentTarget), { text: t('more'), menu: true }),
      el('span', { class: 'csep', 'aria-hidden': 'true' }),
      ctl(me.cam ? 'video' : 'video_off', me.cam ? t('turnCameraOff') : t('turnCameraOn'), toggleCam, { pressed: me.cam, off: !me.cam, text: t('camera') }),
      ctl(me.mic ? 'mic' : 'mic_off', me.mic ? t('mute') : t('unmuteMic'), toggleMic, { pressed: me.mic, off: !me.mic, text: t('mic') }),
      canShare() ? el('div', { class: 'sharegroup' + (sharingMe ? ' live' : '') }, ctl(sharingMe ? 'share_screen_stop' : 'share_screen_start', sharingMe ? t('stopShare') : t('shareScreen'), () => (sharingMe ? stopScreen() : startScreen()), { on: sharingMe, text: sharingMe ? t('stopShareShort') : t('share') }),
        LC.native && LC.native.screens ? el('button', { class: 'cbtn caret', title: t('shareOptions'), 'aria-label': t('shareOptions'), 'aria-haspopup': 'dialog', onclick: () => sharePicker() }, LC.icon('chevron_down')) : null) : null,
      el('button', { class: 'leave', onclick: () => LC.leaveCall(), title: t('leaveCall'), 'aria-label': t('leaveCall') }, LC.icon('call_end', { filled: true }), el('span', { text: t('leave') })));
    const head = el('div', { class: 'cbar' }, el('div', { class: 'ctitle' }, LC.ibtn('arrow_minimize', t('minimize'), () => setMini(true), { cls: 'icon cmin' }), el('div', { class: 'ctname' }, el('b', { text: LC.chanInfo(call.chan).title }), el('span', { class: 'ctimer', id: 'callTimer' }))), controls);
    ui.replaceChildren(head, el('div', { class: 'cbody' }, stage, call.panel === 'people' ? peoplePanel(ids) : null), call.rlayer);
    ui.className = 'callui'; ui.removeAttribute('style'); ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', t('callWindow')); tickTimer();
  }
  // the small call window can be dragged by its title
  function dragMini(ui) {
    const bar = ui.querySelector('.minititle'); if (!bar || bar._drag) return; bar._drag = true;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; const r = ui.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; bar.setPointerCapture(e.pointerId);
      const move = (ev) => { const x = Math.max(4, Math.min(innerWidth - r.width - 4, ev.clientX - dx)), y = Math.max(4, Math.min(innerHeight - r.height - 4, ev.clientY - dy)); call.miniPos = { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' }; Object.assign(ui.style, call.miniPos); };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
    });
  }
  function peoplePanel(ids) {
    return el('div', { class: 'cside', role: 'group', 'aria-label': t('participants') }, el('div', { class: 'row-between' }, el('h2', { text: `${t('participants')} (${ids.length})` }), LC.ibtn('dismiss', t('close'), () => { call.panel = null; drawUi(); })),
      ...ids.map((id) => { const md = mediaOf(id) || {}; return el('div', { class: 'prow' }, LC.avatar(S.users.get(id), 'sm', false), el('span', { class: 'grow', text: id === S.me.id ? `${LC.uname(id)} (${t('you')})` : LC.uname(id) }), md.hand ? LC.icon('hand_right', { filled: true, cls: 'thand', label: t('handRaised') }) : null, LC.icon(md.cam ? 'video' : 'video_off', { label: md.cam ? t('cameraOn') : t('cameraOff') }), LC.icon(md.mic === false ? 'mic_off' : 'mic', { label: md.mic === false ? t('muted') : t('micOn') })); }),
      el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => LC.inviteDialog() }, LC.icon('person_add'), t('invite'))));
  }
  const tickTimer = () => { const n = $('#callTimer'); if (n && call) { const s = Math.floor((Date.now() - call.t0) / 1000), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); n.textContent = (h ? h + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(s % 60).padStart(2, '0'); } };
  setInterval(tickTimer, 1000);
  const fullscreen = (node) => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (node && node.requestFullscreen) node.requestFullscreen().catch(() => {}); };

  // ---------- controls ----------
  async function toggleMic() {
    if (!call) return; const a = call.local.getAudioTracks()[0];
    if (!a) { try { const s = await getMic(LC.ui.micId); s.getAudioTracks().forEach((x) => call.local.addTrack(x)); call.me.mic = true; remix(); updateSenders(); } catch { return LC.toast(t('micDenied')); } }
    else { a.enabled = !a.enabled; call.me.mic = a.enabled; }
    syncMedia(); drawUi();
  }
  async function toggleCam() {
    if (!call) return;
    if (call.me.cam) { call.local.getVideoTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); call.me.cam = false; updateSenders(); }
    else { try { const s = await getCam(LC.ui.camId); s.getVideoTracks().forEach((x) => call.local.addTrack(x)); call.me.cam = true; updateSenders(); } catch { return LC.toast(t('noCamera')); } }
    syncMedia(); drawUi();
  }
  function toggleHand() { if (!call) return; call.me.hand = !call.me.hand; syncMedia(); drawUi(); }
  function reactMenu(anchor) { LC.menu(anchor, ['👍', '❤️', '😂', '👏', '😮', '🎉'].map((e) => ({ icon: e, label: t('reactWith', { e }), fn: () => LC.api('/api/call/react', { chan: call.chan, emoji: e }).catch(() => {}) }))); }
  LC.on('callreact', (r) => {
    if (!call || r.chan !== call.chan || !call.rlayer) return;
    const b = el('div', { class: 'floatr', style: { left: 8 + Math.random() * 74 + '%' } }, el('span', { class: 'fe', text: r.emoji }), el('span', { class: 'fn', text: LC.uname(r.from) }));
    call.rlayer.append(b); setTimeout(() => b.remove(), 3600);
  });
  function moreMenu(anchor) {
    LC.menu(anchor, [{ icon: document.fullscreenElement ? 'full_screen_minimize' : 'full_screen_maximize', label: document.fullscreenElement ? t('exitFullScreen') : t('fullScreen'), fn: () => fullscreen($('#callUI')) }, { icon: 'arrow_minimize', label: t('minimize'), fn: () => setMini(true) }, 'sep', { icon: 'settings', label: t('deviceSettings'), fn: () => deviceDialog() }]);
  }
  async function deviceDialog() {
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const pick = (kind, key, label) => { const list = devs.filter((d) => d.kind === kind); if (!list.length) return null; const s = el('select', { 'aria-label': label, onchange: (e) => switchDevice(key, e.target.value) }, el('option', { value: '', text: t('systemDefault') }), list.map((d, i) => el('option', { value: d.deviceId, text: d.label || `${label} ${i + 1}` }))); s.value = LC.ui[key] || ''; return el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), s); };
    LC.modal([el('h2', {}, LC.icon('settings'), ' ' + t('deviceSettings')), pick('audioinput', 'micId', t('microphone')), pick('videoinput', 'camId', t('camera')), 'setSinkId' in HTMLMediaElement.prototype ? pick('audiooutput', 'speakerId', t('speaker')) : null, el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('done'), onclick: LC.closeModal }))]);
  }
  async function switchDevice(key, id) {
    LC.setUi({ [key]: id }); if (!call) return;
    try {
      if (key === 'micId') { const tr = (await getMic(id)).getAudioTracks()[0]; call.local.getAudioTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); tr.enabled = call.me.mic; call.local.addTrack(tr); remix(); }
      else if (key === 'camId' && call.me.cam) { const tr = (await getCam(id)).getVideoTracks()[0]; call.local.getVideoTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); call.local.addTrack(tr); }
      else if (key === 'speakerId') for (const p of call.peers.values()) if (p.audio && p.audio.setSinkId) p.audio.setSinkId(id).catch(() => {});
      updateSenders(); drawUi();
    } catch { LC.toast(t('deviceFailed')); }
  }

  // ---------- screen sharing (the whole screen by default) ----------
  // computer sound from the shared screen is mixed into your microphone track
  function remix() {
    if (call.mixed) { try { call.mixed.ctx.close(); } catch {} call.mixed = null; }
    const sys = call.screen && call.screen.getAudioTracks()[0]; if (!sys) return;
    try { const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination(), mic = call.local.getAudioTracks()[0]; ctx.createMediaStreamSource(new MediaStream([sys])).connect(dest); if (mic) { const g = ctx.createGain(); ctx.createMediaStreamSource(new MediaStream([mic])).connect(g); g.connect(dest); } call.mixed = { ctx, track: dest.stream.getAudioTracks()[0] }; } catch { call.mixed = null; }
  }
  async function startScreen(pick) {
    if (!call) return; if (!canShare()) return LC.needSecure();
    try {
      if (LC.native && LC.native.pickScreen) LC.native.pickScreen(pick ? pick.id : 'auto', !!(pick && pick.audio));
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', frameRate: { ideal: 15, max: 30 } }, audio: !!(pick && pick.audio), selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include', systemAudio: 'include' });
      const tr = s.getVideoTracks()[0]; if (!tr || !call) return stopStream(s);
      try { tr.contentHint = 'detail'; } catch {}
      if (call.screen) stopStream(call.screen);
      call.screen = s; tr.onended = () => stopScreen(); remix(); updateSenders();
      await LC.api('/api/call/share', { chan: call.chan, on: true }).catch(() => {});
      drawUi();
    } catch (e) { if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') LC.toast(t('captureDenied')); }
  }
  function stopScreen(silent) {
    if (!call || !call.screen) return; stopStream(call.screen); call.screen = null; remix(); updateSenders();
    if (!silent) LC.api('/api/call/share', { chan: call.chan, on: false }).catch(() => {});
    drawUi();
  }
  async function sharePicker() {
    let list = []; try { list = await LC.native.screens(); } catch {}
    const audio = el('input', { type: 'checkbox' });
    const card = (s) => el('button', { class: 'srccard', onclick: () => { LC.closeModal(); startScreen({ id: s.id, audio: audio.checked }); } }, s.thumb ? el('img', { src: s.thumb, alt: '' }) : el('div', { class: 'srcph' }, LC.icon(s.kind === 'screen' ? 'desktop' : 'window')), el('span', { text: s.name || t('entireScreen') }));
    const screens = list.filter((s) => s.kind === 'screen'), wins = list.filter((s) => s.kind === 'window');
    LC.modal([el('h2', {}, LC.icon('share_screen_start'), ' ' + t('shareContent')), el('h3', {}, LC.icon('desktop'), ' ' + t('screens')), el('div', { class: 'srcgrid' }, screens.map(card)), wins.length ? el('h3', {}, LC.icon('window'), ' ' + t('windows')) : null, wins.length ? el('div', { class: 'srcgrid' }, wins.map(card)) : null,
      LC.native.platform === 'win32' ? el('label', { class: 'check' }, audio, ' ' + t('includeSound')) : null, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))], { wide: true });
  }

  // ---------- incoming call ----------
  function stopRing() { clearInterval(ringTimer); ringTimer = null; if (ringBox) { ringBox.remove(); ringBox = null; } }
  LC.on('callring', (r) => {
    if (call || S.me.presence === 'dnd' || LC.isMuted(r.chan)) return; stopRing();
    const u = S.users.get(r.from), video = r.call.mode === 'video', i = LC.chanInfo(r.chan);
    const accept = (mode) => async () => { stopRing(); await LC.openChat(r.chan); LC.joinCall(r.chan, mode); };
    ringBox = el('div', { class: 'ringbox', 'data-chan': r.chan, role: 'alertdialog', 'aria-label': t('incomingCallTitle') },
      el('div', { class: 'ringhead' }, LC.avatar(u, 'lg', false), el('div', { class: 'grow' }, el('b', { text: LC.uname(r.from) }), el('div', { class: 'small muted', text: (video ? t('incomingVideo') : t('incomingVoice')) + (i.kind === 'dm' ? '' : ' · ' + i.title) }))),
      el('div', { class: 'ringacts' }, video ? el('button', { class: 'ring-ok', title: t('acceptVideo'), 'aria-label': t('acceptVideo'), onclick: accept('video') }, LC.icon('video', { filled: true })) : null,
        el('button', { class: 'ring-ok', title: t('acceptAudio'), 'aria-label': t('acceptAudio'), onclick: accept('voice') }, LC.icon('call', { filled: true })),
        el('button', { class: 'ring-no', title: t('decline'), 'aria-label': t('decline'), onclick: stopRing }, LC.icon('call_end', { filled: true }))));
    document.body.append(ringBox); LC.playSound('ring'); let n = 0; ringTimer = setInterval(() => { if (++n > 8) return stopRing(); LC.playSound('ring'); }, 3500);
    if (LC.native && !LC.visible()) LC.native.notify(t('incomingCallTitle'), `${LC.uname(r.from)} · ${i.title}`, r.chan);
  });

  // ---------- leaving ----------
  function endLocal() {
    if (!call) return; clearInterval(call.levelTimer);
    for (const id of [...call.peers.keys()]) dropPeer(id);
    stopStream(call.local); if (call.screen) stopStream(call.screen); if (call.mixed) { try { call.mixed.ctx.close(); } catch {} }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    call = null; drawUi(); LC.renderCallBar(); if (S.chan && LC.renderHeader) LC.renderHeader();
  }
  LC.leaveCall = async () => { if (!call) return; const chan = call.chan; endLocal(); LC.api('/api/call/leave', { chan }).catch(() => {}); LC.playSound('pop'); };
  window.addEventListener('beforeunload', () => { if (call && navigator.sendBeacon) navigator.sendBeacon('/api/call/leave?token=' + encodeURIComponent(S.token), new Blob([JSON.stringify({ chan: call.chan })], { type: 'application/json' })); });
  // Teams shortcuts: Ctrl+Shift+M mute, Ctrl+Shift+O camera, Ctrl+Shift+K raise hand, Ctrl+Shift+H leave
  document.addEventListener('keydown', (e) => {
    if (!call || !(e.ctrlKey || e.metaKey) || !e.shiftKey) return; const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); toggleMic(); } else if (k === 'o') { e.preventDefault(); toggleCam(); } else if (k === 'k') { e.preventDefault(); toggleHand(); } else if (k === 'h') { e.preventDefault(); LC.leaveCall(); }
  });
})();
