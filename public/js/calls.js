'use strict';
// Calls: voice and video calls and meetings in a Teams-style meeting window. WebRTC mesh (up to 25 devices; above 8 people
// each device asks only for the cameras it shows). The server relays signaling and keeps the call state (lib/routes-calls.js).
// Every peer connection carries three tracks: microphone, camera and screen (mapped by m-line order). A person may be in a
// call from several devices ("endpoints", e.g. a phone joined as a companion). Feature files plug in through LC.callApi
// (documented) and LC._cx (internal to the calls area): calls-share.js (sharing extras), calls-effects.js (backgrounds),
// calls-record.js (recording), calls-pane.js (Calls pane, settings), calls-walkie.js (walkie-talkie).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addEvents('callmove', 'callnoanswer', 'callringstop', 'callcmd', 'callink', 'callctl', 'callprefs', 'voicemail', 'voicemailstate', 'walkie', 'walkiesig');
  LC.addStrings('en', {
    cl_organizer: 'Organizer', cl_presenter: 'Presenter', cl_attendee: 'Attendee', cl_companion: 'Companion', cl_onHold: 'On hold', cl_youOnHold: 'Your call is on hold', cl_resume: 'Resume', cl_hold: 'Hold',
    cl_heldYou: '{name} put the call on hold', cl_consulting: '{name} is talking to someone else. You’re on hold.', cl_view: 'View', cl_gallery: 'Gallery', cl_largeGallery: 'Large gallery', cl_speaker: 'Speaker',
    cl_together: 'Together mode', cl_focusContent: 'Focus on content', cl_hideSelf: 'Hide my video', cl_showSelf: 'Show my video', cl_mirror: 'Mirror my video', cl_noIncoming: 'Turn off incoming video',
    cl_pinForMe: 'Pin for me', cl_unpin: 'Unpin', cl_spotlight: 'Spotlight for everyone', cl_unspotlight: 'Stop spotlighting', cl_muteThem: 'Mute', cl_muteAll: 'Mute all', cl_camOffThem: 'Turn off camera',
    cl_removeThem: 'Remove from meeting', cl_makeRole: 'Make {role}', cl_lowerHand: 'Lower hand', cl_lowerAll: 'Lower all hands', cl_allowMic: 'Allow mic', cl_disableMic: 'Disable mic', cl_allowCam: 'Allow camera', cl_disableCam: 'Disable camera',
    cl_meetingOptions: 'Meeting options', cl_lock: 'Lock the meeting', cl_unlock: 'Unlock the meeting', cl_hardMute: 'Don’t allow attendees to unmute', cl_noCams: 'Don’t allow attendees to turn on camera',
    cl_whoRecords: 'Who can record', cl_recEveryone: 'Everyone', cl_recOrganizers: 'Organizers only', cl_recNobody: 'Nobody', cl_autoRec: 'Record automatically', cl_endMeeting: 'End meeting', cl_endConfirm: 'End the meeting for everyone?',
    cl_inMeeting: 'In this meeting ({n})', cl_othersInChat: 'Others in this chat', cl_ring: 'Ring', cl_ringing: 'Ringing…', cl_ringSent: 'Ringing {name}…', cl_addPeople: 'Add people', cl_addPeopleHelp: 'They will be called. Adding someone to a 1:1 call starts a group chat with everyone.',
    cl_meetingChat: 'Meeting chat', cl_meetingInfo: 'Meeting info', cl_startedBy: 'Started by {name}', cl_startedAt: 'Started {time}', cl_peopleN: '{n} people', cl_meetingLink: 'Meeting link', cl_yourRole: 'Your role: {role}',
    cl_deviceSettings: 'Device settings', cl_noise: 'Noise suppression', cl_noiseAuto: 'Auto (default)', cl_noiseHigh: 'High', cl_noiseLow: 'Low', cl_noiseOff: 'Off', cl_music: 'Music mode (original sound)',
    cl_musicHelp: 'No echo cancellation or noise suppression, stereo, higher quality. Use headphones.', cl_noiseHelp: 'High also asks the browser for voice isolation where it has it. Takes effect right away.',
    cl_youreMuted: 'You’re muted', cl_unmute: 'Unmute', cl_ptt: 'Talking (hold Ctrl+Space)', cl_netPoor: 'Your network is causing poor call quality.', cl_netGood: 'Good', cl_netFair: 'Fair', cl_netBad: 'Poor', cl_network: 'Network: {q}',
    cl_handN: 'Hand raised ({n})', cl_mutedBy: '{name} muted you', cl_camOffBy: '{name} turned off your camera', cl_removedBy: '{name} removed you from the meeting', cl_endedBy: '{name} ended the meeting', cl_handLoweredBy: '{name} lowered your hand',
    cl_mayUnmute: 'You can unmute now', cl_hardMuted: 'The organizer has turned off mics for attendees.', cl_noCamsMsg: 'The organizer has turned off cameras for attendees.', cl_onlyPresenters: 'Only organizers and presenters can share.',
    cl_moreFor: 'More options for {name}', cl_page: 'Page {n} of {m}', cl_prevPage: 'Previous page', cl_nextPage: 'Next page', cl_recording: 'Recording', cl_recBy: 'Recording started by {name}',
    cl_recNotice: 'This meeting is being recorded. By staying, you agree to be recorded.', cl_dismiss: 'Dismiss', cl_locked: 'Locked', cl_parkedBy: '{name} parked the call · code {code}', cl_park: 'Park call', cl_parked: 'Call parked',
    cl_parkedHelp: 'Pick it up from Calls › Pick up a parked call (on any of your devices), or anyone in the chat can, with this code:', cl_transfer: 'Transfer', cl_transferTo: 'Transfer to', cl_consultFirst: 'Consult first',
    cl_transferNow: 'Transfer', cl_xferBanner: 'Talking with {to} before transferring {other}', cl_completeXfer: 'Transfer now', cl_backTo: 'Back to {name}', cl_movedGroup: 'Moved to a group call', cl_transferredTo: 'You were transferred to {name}',
    cl_forwardedTo: '{name} forwards calls to {to}. Ringing them now.', cl_noAnswer: '{name} didn’t answer.', cl_declined: '{name} declined the call.', cl_busy: '{name} is in another call.', cl_dnd: '{name} is set to Do not disturb.',
    cl_offline: '{name} isn’t online.', cl_always: '{name}’s calls go to voicemail.', cl_leaveVm: 'Leave a voicemail', cl_callAgain: 'Call again', cl_hangUp: 'Hang up', cl_vmFor: 'Voicemail for {name}', cl_vmGreeting: 'Greeting',
    cl_vmRecording: 'Recording… up to 2 minutes', cl_vmSend: 'Stop and send', cl_vmSent: 'Voicemail sent to {name}', cl_vmNoMic: 'There is no microphone to record with.', cl_incomingFwd: 'Forwarded from {name}', cl_incomingXfer: 'Transferred by {name}',
    cl_incomingParked: 'Your parked call is waiting', cl_incomingConsult: '{name} wants to talk before transferring a call to you', cl_incomingAdd: '{name} is adding you to the call', cl_callWaiting: 'You’re in another call. Answering ends it.',
    cl_rateTitle: 'How was the call quality?', cl_star: '{n} star', cl_stars: '{n} stars', cl_issues: 'What went wrong?', cl_issue_audio: 'Audio', cl_issue_video: 'Video', cl_issue_screen: 'Screen sharing', cl_issue_echo: 'Echo or noise',
    cl_issue_dropped: 'Call dropped', cl_issue_other: 'Something else', cl_submit: 'Submit', cl_notNow: 'Not now', cl_thanks: 'Thanks for the feedback', cl_leaveAndJoin: 'Leave your current call and join this one?', cl_largeCams: 'Cameras start off in large meetings, to keep the call smooth.',
    cl_camMenu: 'Camera options', cl_micMenu: 'Microphone options', cl_leaveMenu: 'Leave options', cl_effects: 'Video effects', cl_rejoining: 'Reconnecting to the call…', cl_shareOptions: 'Share options', cl_openChatMain: 'Open the chat',
    cl_fromDevice: '{name} (other device)', cl_signer: 'Signer', cl_hands: 'Raised hands', cl_reactions: 'Reactions', cl_calling: 'Calling {name}…', cl_endForAll: 'End for everyone',
  });
  LC.addStrings('hi', { cl_onHold: 'होल्ड पर', cl_hold: 'होल्ड करें', cl_resume: 'फिर शुरू करें', cl_view: 'व्यू', cl_gallery: 'गैलरी', cl_speaker: 'स्पीकर', cl_youreMuted: 'आप म्यूट हैं', cl_unmute: 'अनम्यूट', cl_meetingChat: 'मीटिंग चैट', cl_meetingInfo: 'मीटिंग जानकारी', cl_leaveVm: 'वॉइसमेल छोड़ें', cl_noAnswer: '{name} ने जवाब नहीं दिया।', cl_recording: 'रिकॉर्डिंग', cl_rateTitle: 'कॉल की क्वालिटी कैसी थी?', cl_endMeeting: 'मीटिंग खत्म करें', cl_addPeople: 'लोग जोड़ें', cl_transfer: 'ट्रांसफ़र' });
  LC.addStrings('es', { cl_onHold: 'En espera', cl_hold: 'Poner en espera', cl_resume: 'Reanudar', cl_view: 'Vista', cl_gallery: 'Galería', cl_speaker: 'Orador', cl_youreMuted: 'Tienes el micro silenciado', cl_unmute: 'Activar micro', cl_meetingChat: 'Chat de la reunión', cl_meetingInfo: 'Información de la reunión', cl_leaveVm: 'Dejar un mensaje de voz', cl_noAnswer: '{name} no contestó.', cl_recording: 'Grabando', cl_rateTitle: '¿Qué tal fue la calidad de la llamada?', cl_endMeeting: 'Finalizar reunión', cl_addPeople: 'Agregar personas', cl_transfer: 'Transferir' });

  let call = null, ringTimer = null, ringBox = null, audioCtx = null, drawQueued = false, lastInfo = null;
  const EP = 'e' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join(''); // this device in calls
  const media = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  const canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer:coarse)').matches;
  const stopStream = (s) => s && s.getTracks().forEach((x) => x.stop());
  const gum = (c) => navigator.mediaDevices.getUserMedia(c);
  LC.inCall = () => !!call;
  LC.callChan = () => (call ? call.chan : null);
  LC.callDebug = () => (call ? [...call.peers.values()].map((p) => p.pc.connectionState + '/' + p.pc.iceConnectionState) : null);
  const EMPTY = { participants: [], media: {}, sharing: null, endpoints: [], roles: {}, hands: [], held: [], ringing: [] };
  const state = () => (call && S.calls[call.chan]) || EMPTY;
  const drawSoon = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawUi(); }); };
  const epInfo = (ep) => (state().endpoints || []).find((e) => e.ep === ep) || null;
  const uidOf = (ep) => (call && ep === call.ep ? S.me.id : (epInfo(ep) || {}).uid || (call && call.peers.get(ep) || {}).uid || ep);
  const mediaOfEp = (ep) => {
    if (call && ep === call.ep) return { ...call.me, companion: call.companion };
    const e = epInfo(ep); if (e && e.companion) return { mic: false, cam: e.cam, hand: false, companion: true };
    return (state().media || {})[uidOf(ep)] || null;
  };
  const roleOf = (uid) => (state().roles || {})[uid] || 'presenter';
  const isOrg = (uid = S.me.id) => roleOf(uid) === 'organizer';
  const isMod = (uid = S.me.id) => roleOf(uid) !== 'attendee';
  const cprefs = () => LC.S.callPrefs || {};
  LC.callPrefs = cprefs;
  LC.setCallPrefs = (patch) => LC.api('/api/callx/prefs', patch).then((r) => { S.callPrefs = r.prefs; return r.prefs; }).catch((e) => { LC.toast(e.message); throw e; });
  LC.on('init', (d) => { S.callPrefs = d.callPrefs || {}; });
  LC.on('callprefs', (p) => { S.callPrefs = p; });
  const fmtDur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- ringtones (generated with WebAudio, no files) ----------
  const RT = (LC.ringtones = { names: ['classic', 'chimes', 'marimba', 'bright', 'pulse', 'retro', 'none'], ctx: null, timer: null });
  const PATTERNS = {
    classic: (n) => { for (const [at, f] of [[0, 660], [0.35, 880], [1.1, 660], [1.45, 880]]) n(f, at, 0.3, 0.07); },
    chimes: (n) => { [1318.5, 1046.5, 880, 659.3].forEach((f, i) => { n(f, i * 0.3, 1.3, 0.06); n(f * 2, i * 0.3, 0.5, 0.012); }); },
    marimba: (n) => { [523.3, 659.3, 784, 1046.5, 784, 659.3].forEach((f, i) => n(f, i * 0.17, 0.4, 0.1, 'triangle')); },
    bright: (n) => { for (let k = 0; k < 3; k++) { n(1568, k * 0.5, 0.12, 0.035, 'square'); n(2093, k * 0.5 + 0.15, 0.14, 0.035, 'square'); } },
    pulse: (n) => { for (let k = 0; k < 4; k++) n(440, k * 0.45, 0.42, 0.07); },
    retro: (n) => { for (const base of [0, 1]) for (let k = 0; k < 18; k++) n(k % 2 ? 480 : 440, base + k * 0.05, 0.05, 0.03, 'square'); },
  };
  RT.play = (name) => {
    const p = PATTERNS[name] || (name === 'none' ? null : PATTERNS.classic); if (!p) return;
    try {
      RT.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); const ac = RT.ctx; ac.resume().catch(() => {}); const t0 = ac.currentTime + 0.03;
      p((f, at, dur, vol, type = 'sine') => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(g); g.connect(ac.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); });
    } catch {}
  };
  RT.loop = (name) => { RT.stop(); if (name === 'none') return; RT.play(name); RT.timer = setInterval(() => RT.play(name), 3500); };
  RT.stop = () => { clearInterval(RT.timer); RT.timer = null; };

  // ---------- bar above the chat while a call is running ----------
  LC.renderCallBar = () => {
    const bar = $('#callBar'); if (!bar) return; const c = S.calls[S.chan];
    if (!c) { bar.classList.add('hidden'); bar.replaceChildren(); return; }
    const inThis = call && call.chan === S.chan;
    bar.replaceChildren(el('span', { class: 'livedot', 'aria-hidden': 'true' }), LC.icon(c.mode === 'video' ? 'video' : 'call', { filled: true }), el('span', { class: 'grow', text: `${t('callInProgress')} · ${c.participants.map(LC.uname).join(', ')}` }),
      c.rec ? el('span', { class: 'cl-recpill' }, el('span', { class: 'cl-recdot', 'aria-hidden': 'true' }), t('cl_recording')) : null, c.parked ? el('span', { class: 'cl-pill', text: t('cl_parkedBy', { name: LC.uname(c.parked.by), code: c.parked.code }) }) : null,
      inThis ? el('button', { class: 'secondary sm', text: t('openCall'), onclick: () => LC.showCall() }) : el('button', { class: 'primary sm withicon', onclick: () => LC.joinCall(S.chan) }, LC.icon('call'), t('joinCall')));
    bar.classList.remove('hidden');
  };

  // ---------- devices ----------
  // noise suppression levels map onto the browser's audio processing; music mode turns all of it off and asks for stereo
  function micConstraints(id) {
    let base;
    if (LC.ui.clMusic) base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } };
    else { const n = LC.ui.clNoise || 'auto'; base = { echoCancellation: true, noiseSuppression: n !== 'off', autoGainControl: n === 'auto' || n === 'high' }; if (n === 'high') base.voiceIsolation = true; }
    return id ? { ...base, deviceId: { exact: id } } : base;
  }
  async function getMic(id) { try { return await gum({ audio: micConstraints(id) }); } catch (e) { if (!id) throw e; return gum({ audio: micConstraints('') }); } }
  const camSize = () => ((state().endpoints || []).length > 8 ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } });
  async function getCam(id) { const base = camSize(); try { return await gum({ video: id ? { ...base, deviceId: { exact: id } } : base }); } catch (e) { if (!id) throw e; return gum({ video: base }); } }
  LC.callDevices = { getMic, getCam, micConstraints };
  // o (from LC.ext.beforeCall hooks, e.g. a "before you join" screen): { micId, camId, cam, muted, companion }
  async function getLocal(mode, o = {}) {
    const local = new MediaStream(); let cam = false;
    if (!o.companion) {
      try { (await getMic(o.micId || LC.ui.micId)).getAudioTracks().forEach((x) => { if (o.muted) x.enabled = false; local.addTrack(x); }); }
      catch (e) { if (e && e.name === 'NotFoundError') LC.toast(t('noMic')); else throw new Error(t('micDenied')); }
    }
    const wantCam = o.companion ? o.cam === true : o.cam === undefined ? mode === 'video' : !!o.cam;
    if (wantCam) { try { (await getCam(o.camId || LC.ui.camId)).getVideoTracks().forEach((x) => local.addTrack(x)); cam = true; } catch { LC.toast(t('noCamera')); } }
    return { local, cam };
  }
  // LC.ext.beforeCall: async ({ chan, mode, joining }) => false (cancel) | { micId, camId, cam, muted, companion, ...extra body fields } | undefined
  async function beforeCall(info) {
    const o = {};
    for (const h of LC.ext.beforeCall || []) { try { const r = await h({ ...info, opts: o }); if (r === false) return null; if (r && typeof r === 'object') Object.assign(o, r); } catch (e) { console.error('beforeCall hook', e); } }
    return o;
  }
  const bodyExtra = (o) => { const { micId, camId, cam, muted, ...rest } = o; void micId; void camId; void cam; void muted; return rest; };

  // ---------- starting / joining ----------
  async function leaveFirst(chan) {
    if (!call) return true; if (call.chan === chan) { LC.showCall(); return false; }
    if (!(await LC.confirm(t('cl_leaveAndJoin')))) return false; await LC.leaveCall(); return true;
  }
  LC.startCall = async (chan, mode, pre = {}) => {
    if (call) { if (call.chan === chan) return LC.showCall(); if (!(await leaveFirst(chan))) return; }
    if (S.calls[chan]) return LC.joinCall(chan, mode);
    if (!media()) return LC.needSecure();
    const o = await beforeCall({ chan, mode, joining: false }); if (!o || call) return; Object.assign(o, pre);
    let got; try { got = await getLocal(mode, o); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/start', { ...bodyExtra(o), chan, mode, ep: EP }); begin(chan, r.call, got, o); } catch (e) { stopStream(got.local); LC.toast(e.message); }
  };
  LC.joinCall = async (chan, mode, pre = {}) => {
    if (call) { if (call.chan === chan) return LC.showCall(); if (!(await leaveFirst(chan))) return; }
    const c = S.calls[chan]; if (!c) return LC.toast(t('callEnded'));
    if (!media()) return LC.needSecure();
    stopRing(); const o = await beforeCall({ chan, mode: mode || c.mode, joining: true }); if (!o || call) return; Object.assign(o, pre);
    if ((c.endpoints || []).length >= 8 && o.cam === undefined) { o.cam = false; LC.toast(t('cl_largeCams')); }
    let got; try { got = await getLocal(mode || c.mode, o); } catch (e) { return LC.toast(e.message); }
    try { const r = await LC.api('/api/call/join', { ...bodyExtra(o), chan, ep: EP }); begin(chan, r.call, got, o); } catch (e) { stopStream(got.local); LC.toast(e.message); }
  };
  function begin(chan, info, got, o = {}) {
    const a = got.local.getAudioTracks()[0];
    call = { chan, mode: info.mode, ep: EP, companion: !!o.companion, local: got.local, screen: null, mixed: null, peers: new Map(), tiles: new Map(), t0: info.started - (S.serverSkew || 0), joinedAt: Date.now(), id: info.id,
      me: { mic: !!a && a.enabled, cam: got.cam, hand: false }, mini: false, panel: null, spoke: {}, meLevel: {}, opts: o, view: LC.ui.clView || 'auto', page: 0, pin: null, held: false, noIncoming: false,
      camOut: null, camFx: null, scrOut: null, paused: false, want: undefined, banners: {}, q: { n: 0, rtt: 0, loss: 0, jitter: 0 }, dom: null, wasAlone: info.participants.length < 2 };
    S.calls[chan] = info; lastInfo = info; applyCamFx(); syncMedia();
    for (const e of info.endpoints || []) if (e.ep !== call.ep) connect(e.ep, true, e.uid);
    startLevels(); startTimers(); LC.showCall(); LC.renderCallBar(); if (S.chan && LC.renderHeader) LC.renderHeader();
    LC.emitLocal('call:joined', { chan, call: info });
  }
  // for feature modules (docs/EXTENDING.md and docs/features-calls.md)
  LC.callApi = {
    get chan() { return call ? call.chan : null; }, get me() { return call ? call.me : null; }, get local() { return call ? call.local : null; }, get ep() { return call ? call.ep : null; },
    state: () => (call ? state() : null), participants: () => (call ? [S.me.id, ...state().participants.filter((x) => x !== S.me.id)] : []),
    peers: () => (call ? call.peers : new Map()), redraw: () => drawSoon(), panel: () => (call ? call.panel : null),
    setPanel: (key) => { if (!call) return; call.panel = call.panel === key ? null : key; drawUi(); }, mini: () => !!(call && call.mini), setMini: (v) => setMini(v),
    toggleMic: () => toggleMic(), toggleCam: () => toggleCam(), syncMedia: () => syncMedia(), data: () => (call ? (call.ext ||= {}) : {}),
    // interpreter audio, companion devices...: volume 0..1 for everyone's audio from that person (all their devices)
    setVolume: (uid, v) => { if (!call) return; (call.vols ||= {})[uid] = Math.max(0, Math.min(1, Number(v))); for (const p of call.peers.values()) if (p.uid === uid) applyVolume(p); },
    volume: (uid) => (call && call.vols && call.vols[uid] !== undefined ? call.vols[uid] : 1),
    role: (uid) => roleOf(uid || S.me.id), isOrganizer: (uid) => isOrg(uid || S.me.id), canPresent: (uid) => isMod(uid || S.me.id),
    endpoints: () => (call ? state().endpoints || [] : []), streamOf: (uid) => { if (!call) return null; if (uid === S.me.id) return call.local; const p = [...call.peers.values()].find((x) => x.uid === uid && !mediaOfEp(x.ep)?.companion); return p ? p.cam : null; },
    audioOf: (uid) => { if (!call) return null; const p = [...call.peers.values()].find((x) => x.uid === uid && x.aud); return p ? p.aud : null; },
    view: () => (call ? call.view : null), setView: (v) => setView(v), pin: (uid) => { if (!call) return; const ep = epOfUid(uid); call.pin = call.pin === ep ? null : ep; sendWant(); drawSoon(); },
    hold: (on) => setHold(on !== false), ring: (uids) => ringPeople(uids), isRecording: () => !!(call && state().rec), companion: () => !!(call && call.companion),
  };
  const syncMedia = () => call && LC.api('/api/call/media', { chan: call.chan, ep: call.ep, ...call.me, ...(call.want !== undefined ? { want: call.want } : {}) }).catch((e) => { if (e.status === 403 && call) { LC.toast(e.message); if (/mic/i.test(e.message)) setMicTrack(false); else if (/camera/i.test(e.message) && call.me.cam) toggleCam(); } });
  LC.showCall = () => { if (!call) return; call.mini = false; drawUi(); };
  const setMini = (v) => { if (!call) return; call.mini = v; if (v && document.fullscreenElement) document.exitFullscreen().catch(() => {}); drawUi(); };
  const epOfUid = (uid) => (uid === S.me.id ? call.ep : ((state().endpoints || []).find((e) => e.uid === uid && !e.companion) || (state().endpoints || []).find((e) => e.uid === uid) || {}).ep || null);

  // ---------- peer connections (one per remote device) ----------
  const send = (to, kind, data) => LC.api('/api/call/signal', { chan: call.chan, to, from: call.ep, kind, data }).catch(() => {});
  const peerWants = (ep) => { const e = epInfo(ep); return !e || e.want === null || e.want === undefined || e.want.includes(call.ep); };
  function outFor(p) {
    if (!call || call.held) return { a: null, v: null, s: null };
    const mic = call.companion ? null : call.mixed ? call.mixed.track : call.local.getAudioTracks()[0] || null;
    const cam = call.me.cam ? call.camOut || call.local.getVideoTracks()[0] || null : null;
    const scr = call.screen && !call.paused ? call.scrOut || call.screen.getVideoTracks()[0] || null : null;
    return { a: mic, v: peerWants(p.ep) ? cam : null, s: scr };
  }
  function peer(ep, uid) {
    let p = call.peers.get(ep); if (p) { if (uid) p.uid = uid; return p; }
    const pc = new RTCPeerConnection({ iceServers: [] });
    p = { ep, uid: uid || (epInfo(ep) || {}).uid || null, pc, tx: null, cam: new MediaStream(), screen: null, aud: null, audio: null, queue: [], ready: false, q: null }; call.peers.set(ep, p);
    pc.onicecandidate = (e) => { if (e.candidate) send(ep, 'ice', e.candidate); };
    pc.ontrack = () => drawSoon();
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') LC.toast(t('callPeerFailed', { name: LC.uname(p.uid) })); drawSoon(); };
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
    const o = outFor(p);
    if (offerer) { const au = p.pc.addTransceiver(o.a || 'audio', { direction: 'sendrecv', streams: [call.local] }), cam = p.pc.addTransceiver('video', { direction: 'sendrecv' }), scr = p.pc.addTransceiver('video', { direction: 'sendrecv' }); cam.sender.replaceTrack(o.v); scr.sender.replaceTrack(o.s); p.tx = { au, cam, scr }; tune(p); }
    else { for (const x of p.pc.getTransceivers()) if (x.mid !== null) x.direction = 'sendrecv'; bindRemote(p); setSenders(p); }
  }
  const setParams = (tr, fn) => { if (!tr || !tr.sender) return; try { const prm = tr.sender.getParameters(); if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}]; fn(prm, prm.encodings[0]); tr.sender.setParameters(prm).catch(() => {}); } catch {} };
  // bitrates: music mode = high-quality audio; large meetings = smaller camera video; "optimize for video" = smooth screen
  function tune(p) {
    if (!p.tx) return; const big = (state().endpoints || []).length > 8, share = state().share || {};
    setParams(p.tx.au, (prm, e) => { if (LC.ui.clMusic) e.maxBitrate = 128000; else delete e.maxBitrate; });
    setParams(p.tx.cam, (prm, e) => { if (big) { e.maxBitrate = 350000; e.scaleResolutionDownBy = 2; } else { delete e.maxBitrate; delete e.scaleResolutionDownBy; } });
    setParams(p.tx.scr, (prm, e) => { e.maxBitrate = share.video ? 4000000 : 2500000; if (share.video) e.maxFramerate = 30; prm.degradationPreference = share.video ? 'maintain-framerate' : 'maintain-resolution'; });
  }
  function setSenders(p) {
    if (!p.tx) return; const o = outFor(p), put = (x, tr) => x && x.sender.track !== tr && x.sender.replaceTrack(tr).catch(() => {});
    put(p.tx.au, o.a); put(p.tx.cam, o.v); put(p.tx.scr, o.s); tune(p);
  }
  const updateSenders = () => { if (call) for (const p of call.peers.values()) setSenders(p); };
  async function connect(ep, offerer, uid) {
    const p = peer(ep, uid); if (!offerer) return p;
    attachLocal(p, true);
    try { await p.pc.setLocalDescription(await p.pc.createOffer()); await send(ep, 'offer', p.pc.localDescription); } catch (e) { console.error('offer failed', e); }
    return p;
  }
  async function flush(p) { p.ready = true; for (const c of p.queue.splice(0)) { try { await p.pc.addIceCandidate(c); } catch {} } }
  // every device here can play stereo Opus: say so in the other side's description, so music mode reaches people in stereo
  const stereo = (d) => { if (!d || !d.sdp) return d; const m = /a=rtpmap:(\d+) opus\/48000/i.exec(d.sdp); if (!m) return d; return { type: d.type, sdp: d.sdp.replace(new RegExp('(a=fmtp:' + m[1] + ' [^\\r\\n]*)'), (l) => (/stereo=1/.test(l) ? l : l + ';stereo=1;sprop-stereo=1')) }; };
  LC.on('callsig', async (m) => {
    if (!call || m.chan !== call.chan || (m.to && m.to !== call.ep)) return; const from = m.fromEp || m.from, p = peer(from, m.from), pc = p.pc;
    try {
      if (m.kind === 'offer') {
        if (pc.signalingState === 'have-local-offer') { if (call.ep < from) await pc.setLocalDescription({ type: 'rollback' }); else return; } // glare: the lower device id yields
        await pc.setRemoteDescription(stereo(m.data)); attachLocal(p, false);
        await pc.setLocalDescription(await pc.createAnswer()); await send(from, 'answer', pc.localDescription); await flush(p);
      } else if (m.kind === 'answer') { if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(stereo(m.data)); bindRemote(p); await flush(p); } }
      else if (m.kind === 'ice') { if (p.ready) await pc.addIceCandidate(m.data).catch(() => {}); else p.queue.push(m.data); }
    } catch (e) { console.error('signal error', e); }
  });
  // remote audio: muted locally while you are on hold, as a companion device, or when the server says that person is muted
  function applyVolume(p) {
    if (!p.audio) return; const md = mediaOfEp(p.ep) || {}, v = call.vols && call.vols[p.uid] !== undefined ? call.vols[p.uid] : 1;
    p.audio.muted = !!(call.companion || call.held || md.mic === false || (state().held || []).includes(p.uid)); p.audio.volume = v;
  }
  function attachAudio(p) {
    let host = $('#callAudio'); if (!host) { host = el('div', { id: 'callAudio', class: 'hidden' }); document.body.append(host); }
    if (!p.audio) { p.audio = el('audio', { autoplay: true }); host.append(p.audio); }
    if (p.aud && p.audio.srcObject !== p.aud) { p.audio.srcObject = p.aud; p.audio.play().catch(() => {}); }
    if (LC.ui.speakerId && p.audio.setSinkId) p.audio.setSinkId(LC.ui.speakerId).catch(() => {});
    applyVolume(p);
  }
  const dropPeer = (ep) => { const p = call.peers.get(ep); if (!p) return; try { p.pc.close(); } catch {} if (p.audio) p.audio.remove(); call.peers.delete(ep); };

  // ---------- live call state ----------
  LC.on('callstate', (e) => {
    if (call && e.chan === call.chan) {
      if (!e.call) return endLocal();
      lastInfo = e.call; const eps = new Set((e.call.endpoints || []).map((x) => x.ep));
      if (!eps.has(call.ep)) return rejoin();
      for (const ep of [...call.peers.keys()]) if (!eps.has(ep)) dropPeer(ep);
      if (call.screen && e.call.sharing && e.call.sharing !== S.me.id) { stopScreen(true); LC.toast(t('tookOver', { name: LC.uname(e.call.sharing) })); }
      const allow = (e.call.allow || {})[S.me.id] || {};
      if (e.call.hardMute && roleOf(S.me.id) === 'attendee' && !allow.mic && call.me.mic) setMicTrack(false);
      if (e.call.noCams && roleOf(S.me.id) === 'attendee' && !allow.cam && call.me.cam) toggleCam();
      if (e.call.participants.length > 1) call.wasAlone = false; else if (e.call.participants.length === 1 && call.banners.noAnswer && (e.call.ringing || []).length) call.banners.noAnswer = null;
      for (const p of call.peers.values()) { applyVolume(p); setSenders(p); }
      for (const f of X.onState) { try { f(e.call); } catch (err) { console.error(err); } }
      drawSoon();
    }
    if (ringBox && ringBox.dataset.chan === e.chan && (!e.call || e.call.participants.includes(S.me.id) || !(e.call.ringing || []).includes(S.me.id))) stopRing();
    LC.renderCallBar();
  });
  let rejoining = false;
  async function rejoin() {
    if (!call || rejoining) return; rejoining = true;
    try { const r = await LC.api('/api/call/join', { chan: call.chan, ep: call.ep, companion: call.companion }); S.calls[call.chan] = r.call; syncMedia(); for (const e of r.call.endpoints || []) if (e.ep !== call.ep && !call.peers.has(e.ep)) connect(e.ep, true, e.uid); drawSoon(); }
    catch { endLocal(); } finally { rejoining = false; }
  }
  LC.on('init', () => { if (call) { const c = S.calls[call.chan]; if (!c) endLocal(); else if (!(c.endpoints || []).some((x) => x.ep === call.ep)) rejoin(); } });
  // organizer actions and server decisions aimed at this person
  LC.on('callcmd', (c) => {
    if (!call || c.chan !== call.chan) return; const name = LC.uname(c.by);
    if (c.action === 'mute') { setMicTrack(false); LC.toast(t('cl_mutedBy', { name })); }
    else if (c.action === 'camoff') { if (call.me.cam) toggleCam(); LC.toast(t('cl_camOffBy', { name })); }
    else if (c.action === 'removed') { endLocal(); LC.toast(t('cl_removedBy', { name }), { ms: 8000 }); }
    else if (c.action === 'ended') { endLocal(); LC.toast(t('cl_endedBy', { name }), { ms: 6000 }); }
    else if (c.action === 'lowerhand') { call.me.hand = false; drawSoon(); LC.toast(t('cl_handLoweredBy', { name })); }
    else if (c.action === 'mayunmute') LC.toast(t('cl_mayUnmute'));
    else if (c.action === 'stopshare') stopScreen(true);
    for (const f of X.onCmd) { try { f(c); } catch (err) { console.error(err); } }
  });
  // the server moved this device to another call (a third person joined a 1:1 call, a transfer, forwarding, consulting)
  LC.on('callmove', (m) => {
    if (!call || m.from !== call.chan) return; const old = call.chan;
    for (const ep of [...call.peers.keys()]) dropPeer(ep);
    call.chan = m.to; call.id = m.call.id; S.calls[m.to] = m.call; call.t0 = m.call.started - (S.serverSkew || 0); call.banners = {}; call.pin = null; call.dom = null;
    for (const e of m.call.endpoints || []) if (e.ep !== call.ep) connect(e.ep, true, e.uid);
    syncMedia(); if (S.chan === old) LC.openChat(m.to);
    const who = (m.call.participants || []).filter((x) => x !== S.me.id).map(LC.uname).join(', ');
    if (m.reason === 'group') LC.toast(t('cl_movedGroup')); else if (m.reason === 'transfer') LC.toast(t('cl_transferredTo', { name: LC.chanInfo(m.to).title }));
    else if (m.reason === 'forward') LC.toast(t('cl_forwardedTo', { name: LC.uname(m.fwd), to: LC.chanInfo(m.to).title })); void who;
    LC.emitLocal('call:left', { chan: old, moved: true }); LC.emitLocal('call:joined', { chan: m.to, call: m.call, moved: true });
    drawUi(); LC.renderCallBar();
  });
  LC.on('callnoanswer', (n) => { if (!call || n.chan !== call.chan) return; call.banners.noAnswer = n; RT.stop(); drawSoon(); });

  // ---------- who is talking, "you're muted" warning ----------
  function startLevels() {
    try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume().catch(() => {}); } catch { return; }
    const level = (stream, o) => {
      const tr = stream && stream.getAudioTracks()[0]; if (!tr || tr.readyState !== 'live') return 0;
      if (o.anTrack !== tr) { try { const src = audioCtx.createMediaStreamSource(new MediaStream([tr])), an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an); o.an = an; o.anTrack = tr; o.buf = new Uint8Array(an.fftSize); } catch { return 0; } }
      o.an.getByteTimeDomainData(o.buf); let sum = 0; for (const v of o.buf) { const d = (v - 128) / 128; sum += d * d; } return Math.sqrt(sum / o.buf.length);
    };
    call.levelTimer = setInterval(() => {
      if (!call) return; const now = Date.now();
      const mark = (ep, lvl, muted) => { const on = !muted && lvl > 0.035, tile = call.tiles.get(ep); if (on) call.spoke[ep] = now; if (tile) tile.classList.toggle('speaking', on || now - (call.spoke[ep] || 0) < 400); };
      mark(call.ep, level(call.local, call.meLevel), !call.me.mic);
      for (const p of call.peers.values()) mark(p.ep, level(p.aud, p), (mediaOfEp(p.ep) || {}).mic === false);
      // talking while muted: listen on a copy of the mic that is never sent
      const mic = call.local.getAudioTracks()[0];
      if (mic && !call.me.mic && !call.held) {
        if (!call.probe || call.probe.src !== mic) { if (call.probe) call.probe.track.stop(); const c = mic.clone(); c.enabled = true; call.probe = { src: mic, track: c, st: new MediaStream([c]), o: {}, n: 0 }; }
        const l = level(call.probe.st, call.probe.o); call.probe.n = l > 0.06 ? call.probe.n + 1 : Math.max(0, call.probe.n - 1);
        if (call.probe.n >= 3 && !call.banners.muted && now - (call.mutedHushed || 0) > 20000) { call.banners.muted = now; drawSoon(); }
      }
      if (call.banners.muted && (call.me.mic || now - call.banners.muted > 6000)) { call.banners.muted = 0; drawSoon(); }
    }, 150);
  }
  const dominant = () => { let best = null, ts = 0; for (const [ep, at] of Object.entries(call.spoke)) if (ep !== call.ep && at > ts && call.peers.has(ep)) { best = ep; ts = at; } return best; };

  // ---------- network quality (getStats every 3 s) + heartbeat ----------
  const bars = (q) => (!q ? 0 : q.rtt > 400 || q.loss > 8 || q.jitter > 80 ? 1 : q.rtt > 200 || q.loss > 3 || q.jitter > 40 ? 2 : 3);
  async function sampleStats() {
    if (!call) return; let poorOut = 0, n = 0;
    for (const p of call.peers.values()) {
      let rep; try { rep = await p.pc.getStats(); } catch { continue; } if (!call) return;
      let rtt = null, lost = 0, recv = 0, jit = 0, outLoss = 0, outRtt = null;
      rep.forEach((s) => {
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime * 1000;
        else if (s.type === 'inbound-rtp' && s.kind === 'audio') { lost += Math.max(0, s.packetsLost || 0); recv += s.packetsReceived || 0; jit = Math.max(jit, (s.jitter || 0) * 1000); }
        else if (s.type === 'remote-inbound-rtp') { outLoss = Math.max(outLoss, (s.fractionLost || 0) * 100); if (s.roundTripTime != null) outRtt = Math.max(outRtt || 0, s.roundTripTime * 1000); }
      });
      const pv = p.qPrev || { lost: 0, recv: 0 }, dl = lost - pv.lost, dr = recv - pv.recv; p.qPrev = { lost, recv };
      p.q = { rtt: rtt == null ? outRtt || 0 : rtt, loss: dl + dr > 0 ? (dl / (dl + dr)) * 100 : 0, jitter: jit, outLoss, outRtt: outRtt || 0 };
      if (X.fakeQuality) Object.assign(p.q, X.fakeQuality);
      if (p.pc.connectionState === 'connected') { n++; call.q.n++; call.q.rtt += p.q.rtt; call.q.loss += p.q.loss; call.q.jitter += p.q.jitter; if (p.q.outLoss > 5 || p.q.outRtt > 400 || (X.fakeQuality && bars(p.q) === 1)) poorOut++; }
    }
    const poor = n > 0 && poorOut * 2 >= n; call.netPoorN = poor ? (call.netPoorN || 0) + 1 : 0;
    const show = call.netPoorN >= 2 && !call.netHushed; if (!!call.banners.net !== show) { call.banners.net = show; }
    sendWant(); drawSoon();
  }
  function startTimers() {
    call.statsTimer = setInterval(sampleStats, 3000);
    call.aliveTimer = setInterval(() => { if (call) LC.api('/api/call/alive', { chan: call.chan, ep: call.ep }).catch((e) => { if (e.status === 400) rejoin(); }); }, 10000);
  }
  // large meetings: ask only for the cameras this device shows (saves everyone's bandwidth)
  function computeWant() {
    if (call.noIncoming) return [];
    const others = (state().endpoints || []).filter((e) => e.ep !== call.ep && (!e.companion || e.cam));
    if (others.length <= 8) return null;
    return order().filter((ep) => ep !== call.ep).slice(0, call.view === 'large' ? 16 : 9);
  }
  function sendWant() { if (!call) return; const w = computeWant(), k = JSON.stringify(w); if (k === call.wantKey) return; call.wantKey = k; call.want = w; syncMedia(); }

  // ---------- tiles ----------
  const signers = () => new Set(LC.prefs().signers || []);
  // display order: sign language interpreters, spotlight, pinned, people talking, everyone else; you last
  function order() {
    const st = state(), sg = signers(), spot = st.spotlight ? epOfUid(st.spotlight) : null;
    const list = (st.endpoints || []).map((e) => e.ep).filter((ep) => { if (ep === call.ep) return false; const e = epInfo(ep); return !(e && e.companion && !e.cam); });
    const rank = (ep) => (sg.has(uidOf(ep)) ? 0 : ep === spot ? 1 : ep === call.pin ? 2 : 3);
    list.sort((a, b) => rank(a) - rank(b) || (call.spoke[b] || 0) - (call.spoke[a] || 0) || list.indexOf(a) - list.indexOf(b));
    return [...list, call.ep];
  }
  function tileFor(ep) {
    let tile = call.tiles.get(ep); if (tile) return tile;
    const vid = el('video', { autoplay: true, playsinline: true, muted: true }); vid.muted = true;
    tile = el('div', { class: 'tile' + (ep === call.ep ? ' local' : ''), 'data-ep': ep, 'data-id': uidOf(ep) }, vid, el('div', { class: 'tav' }), el('div', { class: 'tlabel' }), el('div', { class: 'cl-tbadges' }), el('span', { class: 'cl-bars', role: 'img' }, el('i'), el('i'), el('i')));
    call.tiles.set(ep, tile); return tile;
  }
  function updateTile(ep) {
    const tile = tileFor(ep), local = ep === call.ep, p = call.peers.get(ep), md = mediaOfEp(ep) || {}, uid = uidOf(ep), u = S.users.get(uid), vid = tile.querySelector('video'), st = state();
    let stream = null, camOn = false;
    if (local) { const v = call.camOut || call.local.getVideoTracks()[0]; if (v && call.me.cam) { if (!call.selfView || call.selfView.getVideoTracks()[0] !== v) call.selfView = new MediaStream([v]); stream = call.selfView; camOn = true; } }
    else if (p) { const v = p.cam.getVideoTracks()[0]; stream = p.cam; camOn = !!v && v.readyState === 'live' && !v.muted && (md ? md.cam !== false : true) && !call.noIncoming; }
    if (camOn && vid.srcObject !== stream) { vid.srcObject = stream; vid.play().catch(() => {}); }
    tile.classList.toggle('novideo', !camOn); tile.classList.toggle('cl-nomirror', local && LC.ui.clMirror === false); tile.classList.toggle('cl-signer', signers().has(uid));
    const tav = tile.querySelector('.tav'); if (!tav.firstChild || tav.dataset.av !== String((u && u.avatar) || '') + (u && u.color)) { tav.replaceChildren(LC.avatar(u, 'xl', false)); tav.dataset.av = String((u && u.avatar) || '') + (u && u.color); }
    const conn = !local && (!p || !['connected', 'completed'].includes(p.pc.iceConnectionState)), hn = (st.hands || []).indexOf(uid) + 1, comp = md.companion, name = local ? t('you') : LC.uname(uid);
    tile.querySelector('.tlabel').replaceChildren(...[md.mic === false && !comp ? LC.icon('mic_off', { cls: 'tmute', label: t('muted') }) : null, el('span', { text: name + (comp ? ' · ' + t('cl_companion') : '') }),
      md.hand && hn ? el('span', { class: 'cl-handn', title: t('cl_handN', { n: hn }) }, LC.icon('hand_right', { filled: true, cls: 'thand', label: t('cl_handN', { n: hn }) }), el('b', { text: String(hn), 'aria-hidden': 'true' })) : null,
      conn ? el('span', { class: 'tconn', text: t('connecting') }) : null].filter(Boolean));
    tile.classList.toggle('hand', !!md.hand);
    const held = (st.held || []).includes(uid), spot = st.spotlight === uid && !comp, pinned = call.pin === ep;
    tile.querySelector('.cl-tbadges').replaceChildren(...[held ? el('span', { class: 'cl-badge' }, LC.icon('call_pause'), t('cl_onHold')) : null, spot ? el('span', { class: 'cl-badge' }, LC.icon('person_star'), t('cl_spotlight')) : null, pinned ? el('span', { class: 'cl-badge' }, LC.icon('pin', { filled: true }), t('cl_pinForMe')) : null, signers().has(uid) ? el('span', { class: 'cl-badge' }, LC.icon('hand_wave'), t('cl_signer')) : null].filter(Boolean));
    const q = local ? null : p && p.q, b = local ? 0 : bars(q), bx = tile.querySelector('.cl-bars'); bx.className = 'cl-bars q' + b; bx.classList.toggle('hidden', local || !q);
    bx.setAttribute('aria-label', t('cl_network', { q: b === 3 ? t('cl_netGood') : b === 2 ? t('cl_netFair') : t('cl_netBad') })); bx.title = q ? `${Math.round(q.rtt)} ms · ${q.loss.toFixed(1)}% · ${Math.round(q.jitter)} ms` : '';
    let more = tile.querySelector('.tmore'); if (!more) { more = LC.ibtn('more_horizontal', '', (e) => tileMenu(e.currentTarget, ep), { cls: 'icon tmore', menu: true }); tile.append(more); }
    more.setAttribute('aria-label', t('cl_moreFor', { name: local ? t('you') : LC.uname(uid) })); more.title = more.getAttribute('aria-label'); more.dataset.k = 'tile:' + ep;
  }
  function screenBox(sharer) {
    const p = [...call.peers.values()].find((x) => x.uid === sharer && x.screen && x.screen.getVideoTracks()[0] && x.screen.getVideoTracks()[0].readyState === 'live' && !x.screen.getVideoTracks()[0].muted) || [...call.peers.values()].find((x) => x.uid === sharer && x.screen);
    if (!call.screenVid) { call.screenVid = el('video', { autoplay: true, playsinline: true, muted: true }); call.screenVid.muted = true; }
    if (p && p.screen && call.screenVid.srcObject !== p.screen) { call.screenVid.srcObject = p.screen; call.screenVid.play().catch(() => {}); }
    return call.screenVid;
  }

  // ---------- the meeting window ----------
  const ctl = (key, icon, label, fn, o = {}) => el('button', { class: 'cbtn' + (o.on ? ' on' : '') + (o.off ? ' off' : '') + (o.cls ? ' ' + o.cls : ''), title: label, 'aria-label': label, 'aria-pressed': o.pressed === undefined ? null : String(!!o.pressed), 'aria-haspopup': o.menu ? 'menu' : null, 'data-k': key, onclick: fn, type: 'button' }, LC.icon(icon, { filled: !!o.on }), el('span', { class: 'clabel', text: o.text || label }));
  const caret = (key, label, fn) => el('button', { class: 'cbtn caret', title: label, 'aria-label': label, 'aria-haspopup': 'menu', 'data-k': key, onclick: fn, type: 'button' }, LC.icon('chevron_down'));
  function contentOf(st) {
    const sh = st.share, sharer = st.sharing && st.participants.includes(st.sharing) ? st.sharing : null; if (!sharer) return null;
    const kind = (sh && sh.kind) || 'screen'; if (kind === 'screen' && sharer === S.me.id && !call.screen) return null;
    return { kind, sharer, mine: sharer === S.me.id, share: sh || { kind: 'screen' } };
  }
  function presentBox(c, st) {
    const box = el('div', { class: 'present', 'data-kind': c.kind });
    if (c.kind === 'screen' && c.mine) {
      box.append(el('div', { class: 'selfshare' }, el('button', { class: 'primary danger withicon', 'data-k': 'stopshare', onclick: () => stopScreen() }, LC.icon('share_screen_stop'), t('stopShare')), LC.icon('share_screen_start', { cls: 'big' }), el('h2', { text: t('youArePresenting') }), el('p', { text: t('youArePresentingHelp') })));
      for (const f of X.selfShare) { try { f(box.firstChild, st, c); } catch (e) { console.error(e); } }
      return box;
    }
    if (c.kind === 'screen') box.append(screenBox(c.sharer));
    else if (X.content[c.kind]) { try { X.content[c.kind](box, st, c); } catch (e) { console.error('share content', e); } }
    box.append(el('div', { class: 'plabel' }, LC.icon('share_screen_start'), el('span', { text: c.mine ? t('youArePresenting') : t('isPresenting', { name: LC.uname(c.sharer) }) })), LC.ibtn('full_screen_maximize', t('fullScreen'), () => fullscreen(box), { cls: 'icon pfull' }));
    for (const f of X.decorate) { try { f(box, st, c); } catch (e) { console.error(e); } }
    return box;
  }
  function pager(total, per) {
    const pages = Math.max(1, Math.ceil(total / per)); call.page = Math.min(call.page, pages - 1); if (pages < 2) return null;
    return el('div', { class: 'cl-pager' }, LC.ibtn('chevron_left', t('cl_prevPage'), () => { call.page = Math.max(0, call.page - 1); sendWant(); drawUi(); }, { disabled: call.page === 0 }), el('span', { text: t('cl_page', { n: call.page + 1, m: pages }) }), LC.ibtn('chevron_right', t('cl_nextPage'), () => { call.page = Math.min(pages - 1, call.page + 1); sendWant(); drawUi(); }, { disabled: call.page >= pages - 1 }));
  }
  function stageNode(st) {
    const hideSelf = !!LC.ui.clHideSelf, all = order(), eps = all.filter((ep) => !(hideSelf && ep === call.ep)), c = contentOf(st), view = call.view;
    for (const ep of all) updateTile(ep);
    for (const [ep, tile] of call.tiles) if (!all.includes(ep)) { tile.remove(); call.tiles.delete(ep); }
    const spot = st.spotlight ? epOfUid(st.spotlight) : null, focus = spot || call.pin;
    if (c) {
      const box = presentBox(c, st);
      if (view === 'content') return el('div', { class: 'stage presenting cl-contentonly' }, box);
      return el('div', { class: 'stage presenting' }, box, el('div', { class: 'film' }, eps.slice(0, 12).map(tileFor)));
    }
    if (view === 'together' && eps.length) {
      const rows = []; const per = eps.length <= 4 ? 4 : eps.length <= 10 ? 5 : 7; for (let i = 0; i < eps.length; i += per) rows.push(eps.slice(i, i + per));
      return el('div', { class: 'stage cl-together' }, el('div', { class: 'cl-scene' }, rows.map((r, i) => el('div', { class: 'cl-row', style: `--n:${r.length};--k:${i}` }, r.map((ep) => el('div', { class: 'cl-seat' }, tileFor(ep)))))));
    }
    if ((focus && eps.includes(focus)) || view === 'speaker') {
      const main = focus && eps.includes(focus) ? focus : dominant() || eps.find((x) => x !== call.ep) || eps[0];
      if (!main) return el('div', { class: 'stage gallery' });
      return el('div', { class: 'stage cl-speakerview' }, el('div', { class: 'cl-main' }, tileFor(main)), el('div', { class: 'film cl-strip' }, eps.filter((x) => x !== main).slice(0, 8).map(tileFor)));
    }
    if (eps.length === 2 && view !== 'large' && eps.includes(call.ep)) return el('div', { class: 'stage duo' }, tileFor(eps.find((x) => x !== call.ep)), tileFor(call.ep));
    const per = view === 'large' ? 49 : 9, pg = pager(eps.length, per), shown = eps.slice(call.page * per, call.page * per + per), sg = shown.filter((ep) => signers().has(uidOf(ep))).length;
    const n = shown.length + sg * 3, cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : n <= 36 ? 6 : 7, rows = Math.max(1, Math.ceil(n / cols));
    return el('div', { class: 'stage gallery cl-grid' + (view === 'large' ? ' cl-large' : ''), style: `--cols:${cols};--rows:${rows}` }, shown.map(tileFor), pg);
  }
  function bannerNodes(st) {
    const out = [], b = call.banners, close = (k) => LC.ibtn('dismiss', t('cl_dismiss'), () => { b[k] = 0; if (k === 'net') call.netHushed = true; if (k === 'muted') call.mutedHushed = Date.now(); if (k === 'rec') call.recSeen = st.rec && st.rec.started; drawUi(); }, { cls: 'icon sm' });
    const bn = (k, icon, text, ...acts) => el('div', { class: 'cl-banner' + (k === 'net' || k === 'noAnswer' ? ' warn' : ''), role: 'status', 'data-b': k }, LC.icon(icon), el('span', { class: 'grow', text }), ...acts, close(k));
    if (b.muted && !call.me.mic) out.push(bn('muted', 'mic_off', t('cl_youreMuted'), el('button', { class: 'secondary sm', 'data-k': 'b-unmute', text: t('cl_unmute'), onclick: () => { b.muted = 0; toggleMic(); } })));
    if (call.ptt) out.push(el('div', { class: 'cl-banner ptt', role: 'status' }, LC.icon('mic', { filled: true }), el('span', { text: t('cl_ptt') })));
    if (b.net) out.push(bn('net', 'wifi_warning', t('cl_netPoor')));
    if (st.rec && call.recSeen !== st.rec.started) out.push(bn('rec', 'record', st.rec.by === S.me.id ? t('cl_recBy', { name: t('you') }) + ' · ' + t('cl_recNotice') : t('cl_recBy', { name: LC.uname(st.rec.by) }) + ' · ' + t('cl_recNotice')));
    const heldBy = (st.held || []).filter((u) => u !== S.me.id); if (heldBy.length && st.participants.length === 2) out.push(el('div', { class: 'cl-banner', role: 'status' }, LC.icon('call_pause'), el('span', { text: t('cl_heldYou', { name: LC.uname(heldBy[0]) }) })));
    if (st.consult && st.consult.by !== S.me.id) out.push(el('div', { class: 'cl-banner', role: 'status' }, LC.icon('call_pause'), el('span', { text: t('cl_consulting', { name: LC.uname(st.consult.by) }) })));
    if (st.consultOf && st.consultOf.by === S.me.id) out.push(el('div', { class: 'cl-banner', role: 'status' }, LC.icon('call_transfer'), el('span', { class: 'grow', text: t('cl_xferBanner', { to: LC.uname(st.consultOf.to), other: LC.uname(st.consultOf.other) }) }),
      el('button', { class: 'primary sm', 'data-k': 'b-xfer', text: t('cl_completeXfer'), onclick: () => LC.api('/api/call/transfer', { chan: call.chan, ep: call.ep, complete: true }).then(() => endLocal()).catch((e) => LC.toast(e.message)) }),
      el('button', { class: 'secondary sm', 'data-k': 'b-back', text: t('cl_backTo', { name: LC.uname(st.consultOf.other) }), onclick: () => LC.api('/api/call/consult', { chan: call.chan, ep: call.ep, cancel: true }).catch((e) => LC.toast(e.message)) })));
    if (st.parked) out.push(el('div', { class: 'cl-banner', role: 'status' }, LC.icon('call_park'), el('span', { text: t('cl_parkedBy', { name: LC.uname(st.parked.by), code: st.parked.code }) })));
    if (b.noAnswer && st.participants.length === 1) {
      const n = b.noAnswer, name = LC.uname(n.to), key = { declined: 'cl_declined', busy: 'cl_busy', dnd: 'cl_dnd', offline: 'cl_offline', always: 'cl_always' }[n.reason] || 'cl_noAnswer';
      out.push(bn('noAnswer', 'call_missed', t(key, { name }), n.voicemail && !call.companion ? el('button', { class: 'primary sm withicon', 'data-k': 'b-vm', onclick: () => voicemailFlow(n.to) }, LC.icon('voicemail'), t('cl_leaveVm')) : null,
        el('button', { class: 'secondary sm', 'data-k': 'b-again', text: t('cl_callAgain'), onclick: () => { b.noAnswer = null; ringPeople([n.to]); drawUi(); } }), el('button', { class: 'secondary sm danger', 'data-k': 'b-hang', text: t('cl_hangUp'), onclick: () => LC.leaveCall() })));
    }
    for (const f of X.banners) { try { const n = f(st); if (n) out.push(n); } catch (e) { console.error(e); } }
    return out;
  }
  function headNode(st) {
    const me = call.me, c = contentOf(st), sharingMe = !!(c && c.mine) || !!call.screen, rec = st.rec, ext = extPanels();
    const controls = el('div', { class: 'ccontrols', role: 'toolbar', 'aria-label': t('callControls') },
      ctl('chat', 'chat', t('cl_meetingChat'), () => LC.callApi.setPanel('chat'), { on: call.panel === 'chat', pressed: call.panel === 'chat', text: t('tabChat') }),
      ctl('people', 'people', t('participants'), () => LC.callApi.setPanel('people'), { on: call.panel === 'people', pressed: call.panel === 'people', text: t('people') }),
      ctl('hand', 'hand_right', me.hand ? t('lowerHand') : t('raiseHand'), toggleHand, { on: me.hand, pressed: me.hand, text: t('raise') }),
      ctl('react', 'emoji', t('react'), (e) => reactMenu(e.currentTarget), { text: t('react'), menu: true }),
      ctl('view', 'grid', t('cl_view'), (e) => viewMenu(e.currentTarget), { text: t('cl_view'), menu: true, cls: 'cl-phhide' }),
      ...ext.map((p) => ctl('x:' + p.key, p.icon, p.label, () => LC.callApi.setPanel(p.key), { on: call.panel === p.key, pressed: call.panel === p.key, text: p.short || p.label })),
      ...LC.extItems(LC.ext.callToolbar || [], LC.callApi),
      ctl('more', 'more_horizontal', t('moreOptions'), (e) => moreMenu(e.currentTarget), { text: t('more'), menu: true }),
      el('span', { class: 'csep', 'aria-hidden': 'true' }),
      el('div', { class: 'sharegroup cl-split' }, ctl('cam', me.cam ? 'video' : 'video_off', me.cam ? t('turnCameraOff') : t('turnCameraOn'), toggleCam, { pressed: me.cam, off: !me.cam, text: t('camera') }), caret('camx', t('cl_camMenu'), (e) => camMenu(e.currentTarget))),
      call.companion ? null : el('div', { class: 'sharegroup cl-split' }, ctl('mic', me.mic ? 'mic' : 'mic_off', me.mic ? t('mute') : t('unmuteMic'), toggleMic, { pressed: me.mic, off: !me.mic, text: t('mic') }), caret('micx', t('cl_micMenu'), (e) => micMenu(e.currentTarget))),
      canShare() || X.shareMenu ? el('div', { class: 'sharegroup' + (sharingMe ? ' live' : '') }, ctl('share', sharingMe ? 'share_screen_stop' : 'share_screen_start', sharingMe ? t('stopShare') : t('shareScreen'), (e) => (sharingMe ? stopAnyShare() : canShare() ? startScreen() : X.shareMenu && X.shareMenu(e.currentTarget)), { on: sharingMe, text: sharingMe ? t('stopShareShort') : t('share') }),
        el('button', { class: 'cbtn caret', title: t('shareOptions'), 'aria-label': t('shareOptions'), 'aria-haspopup': 'dialog', 'data-k': 'sharex', type: 'button', onclick: (e) => (X.shareMenu ? X.shareMenu(e.currentTarget) : LC.native && LC.native.screens ? sharePicker() : startScreen()) }, LC.icon('chevron_down'))) : null,
      el('div', { class: 'cl-leavegroup' }, el('button', { class: 'leave', onclick: () => LC.leaveCall(), title: t('leaveCall'), 'aria-label': t('leaveCall'), 'data-k': 'leave', type: 'button' }, LC.icon('call_end', { filled: true }), el('span', { text: t('leave') })),
        isOrg() && st.participants.length > 1 ? el('button', { class: 'leave cl-leavecaret', title: t('cl_leaveMenu'), 'aria-label': t('cl_leaveMenu'), 'aria-haspopup': 'menu', 'data-k': 'leavex', type: 'button', onclick: (e) => LC.menu(e.currentTarget, [{ icon: 'call_end', label: t('leave'), fn: () => LC.leaveCall() }, { icon: 'people_team', label: t('cl_endMeeting'), danger: true, fn: endForAll }]) }, LC.icon('chevron_down')) : null));
    const title = el('div', { class: 'ctitle' }, LC.ibtn('arrow_minimize', t('minimize'), () => setMini(true), { cls: 'icon cmin' }),
      el('div', { class: 'ctname' }, el('b', { text: LC.chanInfo(call.chan).title }), el('span', { class: 'cl-sub' }, el('span', { class: 'ctimer', id: 'callTimer' }), rec ? el('span', { class: 'cl-recpill' }, el('span', { class: 'cl-recdot', 'aria-hidden': 'true' }), t('cl_recording')) : null, st.locked ? el('span', { class: 'cl-pill' }, LC.icon('lock_closed'), t('cl_locked')) : null)));
    return { title, controls };
  }
  function drawUi() {
    const ui = $('#callUI'); if (!call) { ui.className = 'callui hidden'; ui.replaceChildren(); ui.removeAttribute('style'); return; }
    const st = state(), act = document.activeElement, focusKey = act && ui.contains(act) && act.dataset ? act.dataset.k : null;
    if (call.mini) { drawMini(ui, st); return; }
    if (!call.dom || !ui.contains(call.dom.body)) {
      call.dom = { head: el('div', { class: 'cbar' }), banners: el('div', { class: 'cl-banners', 'aria-live': 'polite' }), body: el('div', { class: 'cbody' }), stage: null, side: null, sideKey: null };
      if (!call.rlayer) call.rlayer = el('div', { class: 'rlayer', 'aria-hidden': 'true' });
      ui.replaceChildren(call.dom.head, call.dom.body, call.rlayer); call.dom.body.append(call.dom.banners);
    }
    const { title, controls } = headNode(st); call.dom.head.replaceChildren(title, controls);
    call.dom.banners.replaceChildren(...bannerNodes(st));
    const stage = call.held ? el('div', { class: 'stage cl-heldstage' }, el('div', { class: 'cl-held' }, LC.icon('call_pause', { cls: 'big' }), el('h2', { text: t('cl_youOnHold') }), el('button', { class: 'primary withicon', 'data-k': 'resume', onclick: () => setHold(false) }, LC.icon('play'), t('cl_resume')))) : stageNode(st);
    if (call.dom.stage) call.dom.stage.replaceWith(stage); else call.dom.body.prepend(stage); call.dom.stage = stage;
    const side = sideNode(st); if (call.dom.side !== side) { if (call.dom.side) call.dom.side.remove(); if (side) call.dom.body.append(side); call.dom.side = side; }
    ui.className = 'callui' + (call.screen || (st.sharing === S.me.id) ? ' cl-sharing' : ''); ui.removeAttribute('style'); ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', t('callWindow'));
    if (focusKey && !ui.contains(document.activeElement)) { const n = ui.querySelector(`[data-k="${CSS.escape(focusKey)}"]`); if (n) n.focus(); }
    LC.emitLocal('call:drawn', { ui, stage, controls }); tickTimer();
  }
  function drawMini(ui, st) {
    const me = call.me, c = contentOf(st), focus = c && !c.mine && c.kind === 'screen' ? el('div', { class: 'present' }, screenBox(c.sharer)) : tileFor(dominant() || order().find((x) => x !== call.ep) || call.ep);
    if (focus.classList.contains('tile')) updateTile(focus.dataset.ep);
    if (!call.rlayer) call.rlayer = el('div', { class: 'rlayer', 'aria-hidden': 'true' });
    ui.replaceChildren(el('div', { class: 'minibox', role: 'region', 'aria-label': t('callInProgress') }, el('div', { class: 'minititle' }, LC.icon(call.mode === 'video' ? 'video' : 'call', { filled: true }), el('span', { class: 'grow', text: LC.chanInfo(call.chan).title }), st.rec ? el('span', { class: 'cl-recdot', title: t('cl_recording') }) : null, el('span', { class: 'ctimer', id: 'callTimer' })), focus,
      el('div', { class: 'minibar' }, call.companion ? null : LC.ibtn(me.mic ? 'mic' : 'mic_off', me.mic ? t('mute') : t('unmuteMic'), toggleMic, { cls: 'cbtn sm' + (me.mic ? '' : ' off') }), LC.ibtn(me.cam ? 'video' : 'video_off', me.cam ? t('turnCameraOff') : t('turnCameraOn'), toggleCam, { cls: 'cbtn sm' + (me.cam ? '' : ' off') }),
        LC.ibtn('arrow_maximize', t('openCall'), () => setMini(false), { cls: 'cbtn sm' }), LC.ibtn('call_end', t('leaveCall'), () => LC.leaveCall(), { cls: 'leave sm', filled: true }))), call.rlayer);
    call.dom = null; ui.className = 'callui mini'; if (call.miniPos) Object.assign(ui.style, call.miniPos); dragMini(ui); tickTimer();
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
  const tickTimer = () => { const n = $('#callTimer'); if (n && call) n.textContent = fmtDur(Date.now() - call.t0); };
  setInterval(tickTimer, 1000);
  const fullscreen = (node) => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (node && node.requestFullscreen) node.requestFullscreen().catch(() => {}); };

  // ---------- side panels ----------
  // LC.ext.callPanels: { key, icon, label, short?, order, when?(callApi), render(host, callApi) } -> toolbar button + side panel
  const extPanels = () => (LC.ext.callPanels || []).filter((p) => { try { return !p.when || p.when(LC.callApi); } catch { return false; } }).sort((a, b) => (a.order || 50) - (b.order || 50));
  const panelHead = (label, key) => el('div', { class: 'row-between' }, el('h2', { text: label }), LC.ibtn('dismiss', t('close'), () => LC.callApi.setPanel(key)));
  function sideNode(st) {
    const key = call.panel; if (!key) return null;
    const xp = extPanels().find((p) => p.key === key);
    if (xp) { const side = el('div', { class: 'cside', role: 'group', 'aria-label': xp.label }, panelHead(xp.label, xp.key)); try { xp.render(side, LC.callApi); } catch (e) { console.error('call panel', e); } return side; }
    if (key === 'chat') return chatPanel();
    const own = X.panels[key]; if (own) { const side = el('div', { class: 'cside', role: 'group', 'aria-label': own.label() }, panelHead(own.label(), key)); try { own.render(side, st); } catch (e) { console.error(e); } return side; }
    if (key === 'people') return peoplePanel(st);
    if (key === 'info') return infoPanel(st);
    if (key === 'devices') return devicePanel();
    call.panel = null; return null;
  }
  const roleLabel = (r) => t('cl_' + r);
  function personMenu(anchor, uid) {
    const st = state(), md = (st.media || {})[uid] || {}, mine = uid === S.me.id, mod = isMod(), org = isOrg(), role = roleOf(uid), ep = epOfUid(uid), allow = (st.allow || {})[uid] || {};
    const act = (action, extra) => LC.api('/api/call/admin', { chan: call.chan, ep: call.ep, action, uid, ...extra }).catch((e) => LC.toast(e.message));
    LC.menu(anchor, [
      ep ? { icon: call.pin === ep ? 'pin_off' : 'pin', label: call.pin === ep ? t('cl_unpin') : t('cl_pinForMe'), fn: () => LC.callApi.pin(uid) } : null,
      mod ? { icon: 'person_star', label: st.spotlight === uid ? t('cl_unspotlight') : t('cl_spotlight'), fn: () => act('spotlight', { uid: st.spotlight === uid ? '' : uid }) } : null,
      mod && !mine && md.mic !== false ? { icon: 'mic_off', label: t('cl_muteThem'), fn: () => act('mute') } : null,
      mod && !mine && md.cam ? { icon: 'video_off', label: t('cl_camOffThem'), fn: () => act('camoff') } : null,
      mod && !mine && st.hardMute && role === 'attendee' ? { icon: allow.mic ? 'mic_prohibited' : 'mic', label: allow.mic ? t('cl_disableMic') : t('cl_allowMic'), fn: () => act('allowmic', { value: !allow.mic }) } : null,
      mod && !mine && st.noCams && role === 'attendee' ? { icon: allow.cam ? 'video_prohibited' : 'video', label: allow.cam ? t('cl_disableCam') : t('cl_allowCam'), fn: () => act('allowcam', { value: !allow.cam }) } : null,
      mod && md.hand ? { icon: 'hand_right_off', label: t('cl_lowerHand'), fn: () => act('lowerhand') } : null,
      org ? 'sep' : null, ...(org ? ['organizer', 'presenter', 'attendee'].filter((r) => r !== role).map((r) => ({ icon: r === 'organizer' ? 'crown' : r === 'presenter' ? 'presenter' : 'person', label: t('cl_makeRole', { role: roleLabel(r).toLowerCase() }), fn: () => act('role', { value: r }) })) : []),
      mod && !mine && (org || role !== 'organizer') ? 'sep' : null, mod && !mine && (org || role !== 'organizer') ? { icon: 'person_delete', label: t('cl_removeThem'), danger: true, fn: () => act('remove') } : null,
      !mod ? { icon: 'info', label: roleLabel(role), disabled: true } : null,
    ]);
  }
  function tileMenu(anchor, ep) { personMenu(anchor, uidOf(ep)); }
  function meetingOptionsMenu(anchor) {
    const st = state(), act = (action, value) => LC.api('/api/call/admin', { chan: call.chan, ep: call.ep, action, value }).catch((e) => LC.toast(e.message)), org = isOrg();
    LC.menu(anchor, [
      org ? { icon: st.locked ? 'lock_open' : 'lock_closed', label: st.locked ? t('cl_unlock') : t('cl_lock'), fn: () => act('lock', !st.locked) } : null,
      { label: t('cl_hardMute'), checked: !!st.hardMute, fn: () => act('hardmute', !st.hardMute) }, { label: t('cl_noCams'), checked: !!st.noCams, fn: () => act('nocams', !st.noCams) },
      (st.hands || []).length ? { icon: 'hand_right_off', label: t('cl_lowerAll'), fn: () => act('lowerhands') } : null,
      org ? 'sep' : null, ...(org ? ['everyone', 'organizers', 'nobody'].map((v) => ({ label: t('cl_whoRecords') + ': ' + t('cl_rec' + v[0].toUpperCase() + v.slice(1)), checked: st.recPolicy === v, fn: () => act('recpolicy', v) })) : []),
      org ? { label: t('cl_autoRec'), checked: !!st.autoRec, fn: () => act('autorec', !st.autoRec) } : null,
      org ? 'sep' : null, org ? { icon: 'people_team', label: t('cl_endMeeting'), danger: true, fn: endForAll } : null,
    ]);
  }
  async function endForAll() { if (!(await LC.confirm(t('cl_endConfirm'), { danger: true, ok: t('cl_endForAll') }))) return; try { await LC.api('/api/call/admin', { chan: call.chan, ep: call.ep, action: 'end' }); endLocal(); } catch (e) { LC.toast(e.message); } }
  function chatMembers() { const c = S.channels.get(call.chan); if (call.chan.startsWith('dm:')) return call.chan.split(':').slice(1); if (c && c.members) return c.members; return [...S.users.values()].filter((u) => !u.removed && !u.deleted).map((u) => u.id); }
  function peoplePanel(st) {
    const ids = [S.me.id, ...st.participants.filter((x) => x !== S.me.id)], hands = st.hands || [], mod = isMod(), comp = (uid) => (st.endpoints || []).some((e) => e.uid === uid && e.companion);
    const row = (uid) => {
      const md = (st.media || {})[uid] || {}, hn = hands.indexOf(uid) + 1, role = roleOf(uid);
      return el('div', { class: 'prow' }, LC.avatar(S.users.get(uid), 'sm', false), el('span', { class: 'grow cl-pname' }, el('span', { text: uid === S.me.id ? `${LC.uname(uid)} (${t('you')})` : LC.uname(uid) }), role !== 'presenter' ? el('small', { class: 'cl-role', text: roleLabel(role) }) : null, comp(uid) ? el('small', { class: 'cl-role', text: t('cl_companion') }) : null, (st.held || []).includes(uid) ? el('small', { class: 'cl-role', text: t('cl_onHold') }) : null),
        hn ? el('span', { class: 'cl-handn', title: t('cl_handN', { n: hn }) }, LC.icon('hand_right', { filled: true, cls: 'thand', label: t('cl_handN', { n: hn }) }), el('b', { text: String(hn), 'aria-hidden': 'true' })) : null,
        LC.icon(md.cam ? 'video' : 'video_off', { label: md.cam ? t('cameraOn') : t('cameraOff') }), LC.icon(md.mic === false ? 'mic_off' : 'mic', { label: md.mic === false ? t('muted') : t('micOn') }),
        el('button', { class: 'icon', 'aria-label': t('cl_moreFor', { name: LC.uname(uid) }), title: t('cl_moreFor', { name: LC.uname(uid) }), 'aria-haspopup': 'menu', 'data-k': 'p:' + uid, type: 'button', onclick: (e) => personMenu(e.currentTarget, uid) }, LC.icon('more_horizontal')));
    };
    const inCall = new Set(st.participants), ringing = new Set(st.ringing || []), others = chatMembers().filter((id) => !inCall.has(id) && S.users.get(id) && !S.users.get(id).removed).slice(0, 40);
    const ordered = [...ids.filter((x) => hands.includes(x)).sort((a, b) => hands.indexOf(a) - hands.indexOf(b)), ...ids.filter((x) => !hands.includes(x))];
    return el('div', { class: 'cside', role: 'group', 'aria-label': t('participants') }, panelHead(`${t('participants')} (${ids.length})`, 'people'),
      el('div', { class: 'cl-pacts' }, mod && ids.length > 1 ? el('button', { class: 'secondary sm withicon', 'data-k': 'muteall', onclick: () => LC.api('/api/call/admin', { chan: call.chan, ep: call.ep, action: 'muteall' }).catch((e) => LC.toast(e.message)) }, LC.icon('mic_off'), t('cl_muteAll')) : null,
        mod ? el('button', { class: 'secondary sm withicon', 'aria-haspopup': 'menu', 'data-k': 'mopts', onclick: (e) => meetingOptionsMenu(e.currentTarget) }, LC.icon('settings'), t('cl_meetingOptions')) : null,
        el('button', { class: 'secondary sm withicon', 'data-k': 'addp', onclick: () => addPeopleDialog() }, LC.icon('person_add'), t('cl_addPeople'))),
      el('h3', { class: 'cl-h3', text: t('cl_inMeeting', { n: ids.length }) }), ...ordered.map(row),
      others.length ? el('h3', { class: 'cl-h3', text: t('cl_othersInChat') }) : null,
      ...others.map((uid) => el('div', { class: 'prow' }, LC.avatar(S.users.get(uid), 'sm', true), el('span', { class: 'grow', text: LC.uname(uid) }), ringing.has(uid) ? el('small', { class: 'cl-role', text: t('cl_ringing') }) : el('button', { class: 'secondary sm withicon', 'data-k': 'ring:' + uid, 'aria-label': t('cl_ring') + ' ' + LC.uname(uid), onclick: () => ringPeople([uid]) }, LC.icon('call'), t('cl_ring')))),
      el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => LC.inviteDialog() }, LC.icon('person_add'), t('invite'))));
  }
  async function ringPeople(uids) {
    if (!call || !uids || !uids.length) return;
    try { const r = await LC.api('/api/call/ring', { chan: call.chan, ep: call.ep, users: uids }); LC.toast(t('cl_ringSent', { name: uids.map(LC.uname).join(', ') }), { ms: 2500 }); return r; } catch (e) { LC.toast(e.message); }
  }
  function addPeopleDialog() {
    const st = state(), inCall = new Set(st.participants), picks = new Set(), q = el('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search') }), list = el('div', { class: 'people cl-pick' });
    const pool = () => (call.chan.startsWith('dm:') ? [...S.users.values()].map((u) => u.id) : chatMembers()).filter((id) => !inCall.has(id) && id !== S.me.id && S.users.get(id) && !S.users.get(id).removed && !S.users.get(id).deleted);
    const draw = () => list.replaceChildren(...pool().filter((id) => LC.uname(id).toLowerCase().includes(q.value.toLowerCase())).map((id) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: picks.has(id), onchange: (e) => (e.target.checked ? picks.add(id) : picks.delete(id)) }), LC.avatar(S.users.get(id), 'sm', true), LC.uname(id))));
    q.addEventListener('input', draw); draw();
    LC.modal([el('h2', {}, LC.icon('person_add'), ' ' + t('cl_addPeople')), el('p', { class: 'muted small', text: t('cl_addPeopleHelp') }), q, list, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('cl_ring'), onclick: () => { if (!picks.size) return; LC.closeModal(); ringPeople([...picks]); } }))]);
  }
  function infoPanel(st) {
    const link = st.meeting ? location.origin + '/#meet=' + encodeURIComponent(st.meeting) : '';
    const dur = el('span', { class: 'ctimer' }); const tick = () => { if (!dur.isConnected || !call) return clearInterval(h); dur.textContent = fmtDur(Date.now() - call.t0); }; const h = setInterval(tick, 1000); tick();
    return el('div', { class: 'cside', role: 'group', 'aria-label': t('cl_meetingInfo') }, panelHead(t('cl_meetingInfo'), 'info'),
      el('div', { class: 'cl-info' }, el('h3', { text: LC.chanInfo(call.chan).title }), el('p', {}, LC.icon('person'), ' ' + t('cl_startedBy', { name: LC.uname(st.by) })), el('p', {}, LC.icon('clock'), ' ' + t('cl_startedAt', { time: LC.fmtTime(call.t0) }) + ' · ', dur),
        el('p', {}, LC.icon('people'), ' ' + t('cl_peopleN', { n: st.participants.length })), el('p', {}, LC.icon(st.mode === 'video' ? 'video' : 'call'), ' ' + (st.mode === 'video' ? t('videoCall') : t('voiceCall'))), el('p', {}, LC.icon('shield_person'), ' ' + t('cl_yourRole', { role: roleLabel(roleOf(S.me.id)) })),
        st.locked ? el('p', {}, LC.icon('lock_closed'), ' ' + t('cl_locked')) : null, st.rec ? el('p', {}, LC.icon('record'), ' ' + t('cl_recBy', { name: LC.uname(st.rec.by) })) : null,
        link ? el('div', { class: 'cl-link' }, el('b', { text: t('cl_meetingLink') }), el('code', { text: link }), el('button', { class: 'secondary sm', text: t('copy'), onclick: async (e) => { await LC.copy(link); e.target.textContent = t('copied'); } })) : null,
        el('button', { class: 'secondary sm withicon', onclick: () => { setMini(true); LC.openChat(call.chan); } }, LC.icon('chat'), t('cl_openChatMain'))));
  }
  // the meeting chat: the call chat's messages and a box to send (kept between redraws so typing is never interrupted)
  let chatBox = null;
  function chatPanel() {
    if (chatBox && chatBox.chan === call.chan) return chatBox.node;
    const list = el('div', { class: 'cl-chatlist', role: 'log', 'aria-label': t('cl_meetingChat'), tabindex: '0' }), chan = call.chan;
    LC.composers.call ||= LC.makeComposer({ chan: () => (call ? call.chan : S.chan), thread: () => null, compact: true, noFocus: true });
    const node = el('div', { class: 'cside cl-chatside', role: 'group', 'aria-label': t('cl_meetingChat') }, panelHead(t('cl_meetingChat'), 'chat'), list, el('div', { class: 'cl-chatcomposer' }, LC.composers.call.el));
    chatBox = { chan, node, list, msgs: [] }; LC.composers.call.refresh();
    const render = () => { let prev = null; list.replaceChildren(...chatBox.msgs.filter((m) => !m.thread).slice(-150).map((m) => { const grouped = !!prev && !prev.system && !m.system && prev.from === m.from && m.ts - prev.ts < 300000; prev = m; return LC.msgEl(m, { grouped }); })); list.scrollTop = list.scrollHeight; };
    chatBox.render = render;
    LC.api('/api/messages?chan=' + encodeURIComponent(chan)).then((d) => { if (chatBox && chatBox.chan === chan) { chatBox.msgs = d.messages; render(); } }).catch(() => {});
    return node;
  }
  LC.on('message', (m) => { if (chatBox && m.chan === chatBox.chan && !chatBox.msgs.some((x) => x.id === m.id)) { chatBox.msgs.push(m); chatBox.render(); } });
  LC.on('update', (m) => { if (chatBox && m.chan === chatBox.chan) { const i = chatBox.msgs.findIndex((x) => x.id === m.id); if (i >= 0) { chatBox.msgs[i] = m; chatBox.render(); } } });
  LC.on('purge', (e) => { if (chatBox && e.chan === chatBox.chan) { const g = new Set(e.ids); chatBox.msgs = chatBox.msgs.filter((m) => !g.has(m.id)); chatBox.render(); } });
  function devicePanel() {
    const side = el('div', { class: 'cside', role: 'group', 'aria-label': t('cl_deviceSettings') }, panelHead(t('cl_deviceSettings'), 'devices'));
    navigator.mediaDevices.enumerateDevices().catch(() => []).then((devs) => {
      const pick = (kind, key, label) => { const list = devs.filter((d) => d.kind === kind); if (!list.length) return null; const s = el('select', { 'aria-label': label, onchange: (e) => switchDevice(key, e.target.value) }, el('option', { value: '', text: t('systemDefault') }), list.map((d, i) => el('option', { value: d.deviceId, text: d.label || `${label} ${i + 1}` }))); s.value = LC.ui[key] || ''; return el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), s); };
      const noise = el('select', { 'aria-label': t('cl_noise'), onchange: (e) => setAudioMode({ clNoise: e.target.value }) }, ['auto', 'high', 'low', 'off'].map((v) => el('option', { value: v, text: t('cl_noise' + v[0].toUpperCase() + v.slice(1)) }))); noise.value = LC.ui.clNoise || 'auto'; noise.disabled = !!LC.ui.clMusic;
      side.append(pick('audioinput', 'micId', t('microphone')) || '', pick('videoinput', 'camId', t('camera')) || '', 'setSinkId' in HTMLMediaElement.prototype ? pick('audiooutput', 'speakerId', t('speaker')) || '' : '',
        el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cl_noise') }), noise, el('span', { class: 'muted small', text: t('cl_noiseHelp') })),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!LC.ui.clMusic, onchange: (e) => setAudioMode({ clMusic: e.target.checked }) }), el('span', {}, t('cl_music'), el('small', { class: 'muted', text: ' — ' + t('cl_musicHelp') }))));
    });
    return side;
  }
  async function setAudioMode(patch) { LC.setUi(patch); if (!call || call.companion) return drawSoon(); await switchDevice('micId', LC.ui.micId || ''); for (const p of call.peers.values()) tune(p); drawSoon(); }

  // ---------- controls ----------
  function setMicTrack(on) { if (!call) return; const a = call.local.getAudioTracks()[0]; if (a) a.enabled = on; call.me.mic = !!a && on; syncMedia(); drawSoon(); }
  async function toggleMic() {
    if (!call || call.companion) return; const a = call.local.getAudioTracks()[0], st = state(), allow = (st.allow || {})[S.me.id] || {};
    if (!call.me.mic && st.hardMute && roleOf(S.me.id) === 'attendee' && !allow.mic) return LC.toast(t('cl_hardMuted'));
    if (!a) { try { const s = await getMic(LC.ui.micId); s.getAudioTracks().forEach((x) => call.local.addTrack(x)); call.me.mic = true; remix(); updateSenders(); } catch { return LC.toast(t('micDenied')); } }
    else { a.enabled = !a.enabled; call.me.mic = a.enabled; }
    syncMedia(); drawUi();
  }
  async function toggleCam() {
    if (!call) return; const st = state(), allow = (st.allow || {})[S.me.id] || {};
    if (call.me.cam) { call.local.getVideoTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); call.me.cam = false; applyCamFx(); updateSenders(); }
    else {
      if (st.noCams && roleOf(S.me.id) === 'attendee' && !allow.cam) return LC.toast(t('cl_noCamsMsg'));
      try { const s = await getCam(LC.ui.camId); s.getVideoTracks().forEach((x) => call.local.addTrack(x)); call.me.cam = true; applyCamFx(); updateSenders(); } catch { return LC.toast(t('noCamera')); }
    }
    syncMedia(); drawUi();
  }
  // background effects / filters: LC._cx.camPipe(track) -> { track, stop } (calls-effects.js)
  function applyCamFx() {
    if (!call) return; if (call.camFx) { try { call.camFx.stop(); } catch {} call.camFx = null; } call.camOut = null;
    const raw = call.local.getVideoTracks()[0]; if (!raw || !call.me.cam || !X.camPipe) return;
    try { const r = X.camPipe(raw); if (r && r.track) { call.camFx = r; call.camOut = r.track; } } catch (e) { console.error('effects', e); }
  }
  function toggleHand() { if (!call) return; call.me.hand = !call.me.hand; syncMedia(); drawUi(); }
  async function setHold(on) {
    if (!call || call.held === on) return; call.held = on;
    for (const p of call.peers.values()) { setSenders(p); applyVolume(p); }
    LC.api('/api/call/hold', { chan: call.chan, ep: call.ep, on }).catch(() => {}); drawUi();
  }
  function setView(v) { if (!call) return; call.view = v; call.page = 0; LC.setUi({ clView: v }); sendWant(); drawUi(); }
  function reactMenu(anchor) { LC.menu(anchor, ['👍', '❤️', '😂', '👏', '😮', '🎉'].map((e) => ({ icon: e, label: t('reactWith', { e }), fn: () => LC.api('/api/call/react', { chan: call.chan, ep: call.ep, emoji: e }).catch(() => {}) }))); }
  LC.on('callreact', (r) => {
    if (!call || r.chan !== call.chan || !call.rlayer) return;
    const b = el('div', { class: 'floatr', style: { left: 8 + Math.random() * 74 + '%' } }, el('span', { class: 'fe', text: r.emoji }), el('span', { class: 'fn', text: LC.uname(r.from) }));
    call.rlayer.append(b); setTimeout(() => b.remove(), 3600);
  });
  function viewMenu(anchor) {
    const c = !!contentOf(state()), v = call.view;
    LC.menu(anchor, [
      { icon: 'grid', label: t('cl_gallery'), checked: v === 'auto' || v === 'gallery', fn: () => setView('gallery') }, { icon: 'grid_dots', label: t('cl_largeGallery'), checked: v === 'large', fn: () => setView('large') },
      { icon: 'person_voice', label: t('cl_speaker'), checked: v === 'speaker', fn: () => setView('speaker') }, { icon: 'people_audience', label: t('cl_together'), checked: v === 'together', fn: () => setView('together') },
      { icon: 'share_screen_start', label: t('cl_focusContent'), checked: v === 'content', disabled: !c, fn: () => setView('content') }, 'sep',
      { icon: 'eye_off', label: LC.ui.clHideSelf ? t('cl_showSelf') : t('cl_hideSelf'), fn: () => { LC.setUi({ clHideSelf: !LC.ui.clHideSelf }); drawUi(); } },
      { icon: 'flip_horizontal', label: t('cl_mirror'), checked: LC.ui.clMirror !== false, fn: () => { LC.setUi({ clMirror: LC.ui.clMirror === false }); drawUi(); } },
      { icon: 'video_off', label: t('cl_noIncoming'), checked: !!call.noIncoming, fn: () => { call.noIncoming = !call.noIncoming; sendWant(); drawUi(); } },
    ]);
  }
  function camMenu(anchor) { LC.menu(anchor, [LC.callEffects ? { icon: 'video_background_effect', label: t('cl_effects'), fn: () => LC.callApi.setPanel('effects') } : null, { icon: 'video_settings', label: t('cl_deviceSettings'), fn: () => LC.callApi.setPanel('devices') }, { icon: 'video_off', label: t('cl_noIncoming'), checked: !!call.noIncoming, fn: () => { call.noIncoming = !call.noIncoming; sendWant(); drawUi(); } }]); }
  function micMenu(anchor) {
    const n = LC.ui.clNoise || 'auto';
    LC.menu(anchor, [...['auto', 'high', 'low', 'off'].map((v) => ({ label: t('cl_noise') + ': ' + t('cl_noise' + v[0].toUpperCase() + v.slice(1)), checked: !LC.ui.clMusic && n === v, disabled: !!LC.ui.clMusic, fn: () => setAudioMode({ clNoise: v }) })), 'sep',
      { icon: 'music_note_2', label: t('cl_music'), checked: !!LC.ui.clMusic, fn: () => setAudioMode({ clMusic: !LC.ui.clMusic }) }, { icon: 'mic_settings', label: t('cl_deviceSettings'), fn: () => LC.callApi.setPanel('devices') }]);
  }
  function moreMenu(anchor) {
    const st = state(), extra = LC.extItems(LC.ext.callMore || [], LC.callApi), dm = call.chan.startsWith('dm:'), two = st.participants.length === 2;
    LC.menu(anchor, [
      { icon: 'info', label: t('cl_meetingInfo'), fn: () => LC.callApi.setPanel('info') }, { icon: 'settings', label: t('deviceSettings'), fn: () => LC.callApi.setPanel('devices') },
      LC.callEffects ? { icon: 'video_background_effect', label: t('cl_effects'), fn: () => LC.callApi.setPanel('effects') } : null,
      isMod() ? { icon: 'people_settings', label: t('cl_meetingOptions'), fn: () => meetingOptionsMenu(anchor) } : null, 'sep',
      ...X.moreItems.flatMap((f) => { try { return f(st) || []; } catch (e) { console.error(e); return []; } }),
      { icon: 'hand_right', label: call.me.hand ? t('lowerHand') : t('raiseHand'), fn: toggleHand }, { icon: 'emoji', label: t('react'), fn: () => reactMenu(anchor) },
      { icon: 'call_pause', label: call.held ? t('cl_resume') : t('cl_hold'), fn: () => setHold(!call.held) },
      { icon: 'person_add', label: t('cl_addPeople'), fn: () => addPeopleDialog() },
      dm && two ? { icon: 'call_transfer', label: t('cl_transfer') + '…', fn: () => transferDialog() } : null,
      st.participants.length > 1 ? { icon: 'call_park', label: t('cl_park'), fn: () => parkCall() } : null, 'sep',
      { icon: 'grid', label: t('cl_view') + '…', fn: () => viewMenu(anchor) },
      { icon: document.fullscreenElement ? 'full_screen_minimize' : 'full_screen_maximize', label: document.fullscreenElement ? t('exitFullScreen') : t('fullScreen'), fn: () => fullscreen($('#callUI')) }, { icon: 'arrow_minimize', label: t('minimize'), fn: () => setMini(true) },
      { icon: 'chat', label: t('cl_openChatMain'), fn: () => { setMini(true); LC.openChat(call.chan); } }, ...(extra.length ? ['sep', ...extra] : []),
    ]);
  }
  function transferDialog() {
    const st = state(), other = st.participants.find((x) => x !== S.me.id), q = el('input', { type: 'search', placeholder: t('search'), 'aria-label': t('cl_transferTo') }), list = el('div', { class: 'results', role: 'listbox', 'aria-label': t('cl_transferTo') }); let pick = null;
    const go = async (consult) => { if (!pick) return; LC.closeModal(); try { if (consult) await LC.api('/api/call/consult', { chan: call.chan, ep: call.ep, to: pick }); else { await LC.api('/api/call/transfer', { chan: call.chan, ep: call.ep, to: pick }); endLocal(); } } catch (e) { LC.toast(e.message); } };
    const draw = () => list.replaceChildren(...[...S.users.values()].filter((u) => u.id !== S.me.id && u.id !== other && !u.removed && !u.deleted && LC.uname(u.id).toLowerCase().includes(q.value.toLowerCase())).slice(0, 30).map((u) => el('button', { class: 'hit' + (pick === u.id ? ' on' : ''), role: 'option', 'aria-selected': String(pick === u.id), onclick: () => { pick = u.id; draw(); } }, LC.avatar(u, 'sm', true), el('span', { text: ' ' + LC.uname(u.id) }))));
    q.addEventListener('input', draw); draw();
    LC.modal([el('h2', {}, LC.icon('call_transfer'), ' ' + t('cl_transfer') + ' · ' + LC.uname(other)), q, list, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'secondary', text: t('cl_consultFirst'), onclick: () => go(true) }), el('button', { class: 'primary', text: t('cl_transferNow'), onclick: () => go(false) }))]);
  }
  async function parkCall() {
    try { const r = await LC.api('/api/call/park', { chan: call.chan, ep: call.ep }); endLocal(true); LC.modal([el('h2', {}, LC.icon('call_park'), ' ' + t('cl_parked')), el('p', { text: t('cl_parkedHelp') }), el('div', { class: 'cl-code', text: r.code }), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('done'), onclick: LC.closeModal }))]); }
    catch (e) { LC.toast(e.message); }
  }
  async function switchDevice(key, id) {
    LC.setUi({ [key]: id }); if (!call) return;
    try {
      if (key === 'micId' && !call.companion) { const tr = (await getMic(id)).getAudioTracks()[0]; call.local.getAudioTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); tr.enabled = call.me.mic; call.local.addTrack(tr); remix(); }
      else if (key === 'camId' && call.me.cam) { const tr = (await getCam(id)).getVideoTracks()[0]; call.local.getVideoTracks().forEach((x) => { x.stop(); call.local.removeTrack(x); }); call.local.addTrack(tr); applyCamFx(); }
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
  // o: { pick: { id, audio } (desktop app), surface: 'monitor' | 'window' | 'browser', sound, video (optimize for video), mode }
  async function startScreen(o = {}) {
    if (!call) return; if (!canShare()) return LC.needSecure();
    if (!isMod()) return LC.toast(t('cl_onlyPresenters'));
    const sound = o.sound !== undefined ? o.sound : !!LC.ui.clShareSound, video = o.video !== undefined ? o.video : !!LC.ui.clShareVideo;
    try {
      const pick = o.pick || null;
      if (LC.native && LC.native.pickScreen) LC.native.pickScreen(pick ? pick.id : 'auto', !!(pick ? pick.audio : sound));
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: o.surface || 'monitor', frameRate: video ? { ideal: 30, max: 30 } : { ideal: 15, max: 30 } }, audio: !!(pick ? pick.audio : sound), selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include', systemAudio: 'include', preferCurrentTab: false });
      const tr = s.getVideoTracks()[0]; if (!tr || !call) return stopStream(s);
      try { tr.contentHint = video ? 'motion' : 'detail'; } catch {}
      if (call.screen) stopScreen(true, true);
      call.screen = s; call.paused = false; call.shareInfo = { pick, sound, video, surface: (tr.getSettings && tr.getSettings().displaySurface) || o.surface || 'monitor' }; tr.onended = () => stopScreen();
      if (X.screenPipe) { try { const r = X.screenPipe(tr); if (r && r.track) { call.scrFx = r; call.scrOut = r.track; } } catch (e) { console.error(e); } }
      remix(); updateSenders();
      await LC.api('/api/call/share', { chan: call.chan, ep: call.ep, on: true, kind: 'screen', sound: !!s.getAudioTracks()[0], video, mode: o.mode || (call.scrFx && call.scrFx.mode) || 'content' }).catch((e) => LC.toast(e.message));
      for (const f of X.onShare) { try { f(true, call.shareInfo); } catch (e) { console.error(e); } }
      drawUi();
    } catch (e) { if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') LC.toast(t('captureDenied')); }
  }
  function stopScreen(silent, keepState) {
    if (!call || !call.screen) return; stopStream(call.screen); call.screen = null; call.paused = false;
    if (call.scrFx) { try { call.scrFx.stop(); } catch {} call.scrFx = null; } call.scrOut = null; remix(); updateSenders();
    if (!silent) LC.api('/api/call/share', { chan: call.chan, ep: call.ep, on: false }).catch(() => {});
    if (!keepState) for (const f of X.onShare) { try { f(false); } catch (e) { console.error(e); } }
    drawUi();
  }
  // stop whatever you present (screen, whiteboard or slides)
  function stopAnyShare() { if (!call) return; if (call.screen) return stopScreen(); LC.api('/api/call/share', { chan: call.chan, ep: call.ep, on: false }).catch(() => {}); for (const f of X.onShare) { try { f(false); } catch (e) { console.error(e); } } }
  async function sharePicker() {
    let list = []; try { list = await LC.native.screens(); } catch {}
    const audio = el('input', { type: 'checkbox' });
    const card = (s) => el('button', { class: 'srccard', onclick: () => { LC.closeModal(); startScreen({ pick: { id: s.id, audio: audio.checked } }); } }, s.thumb ? el('img', { src: s.thumb, alt: '' }) : el('div', { class: 'srcph' }, LC.icon(s.kind === 'screen' ? 'desktop' : 'window')), el('span', { text: s.name || t('entireScreen') }));
    const screens = list.filter((s) => s.kind === 'screen'), wins = list.filter((s) => s.kind === 'window');
    LC.modal([el('h2', {}, LC.icon('share_screen_start'), ' ' + t('shareContent')), el('h3', {}, LC.icon('desktop'), ' ' + t('screens')), el('div', { class: 'srcgrid' }, screens.map(card)), wins.length ? el('h3', {}, LC.icon('window'), ' ' + t('windows')) : null, wins.length ? el('div', { class: 'srcgrid' }, wins.map(card)) : null,
      LC.native.platform === 'win32' ? el('label', { class: 'check' }, audio, ' ' + t('includeSound')) : null, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))], { wide: true });
  }

  // ---------- incoming call ----------
  function stopRing() { clearInterval(ringTimer); ringTimer = null; RT.stop(); if (ringBox) { ringBox.remove(); ringBox = null; } }
  LC.on('callringstop', (e) => { if (ringBox && ringBox.dataset.chan === e.chan) stopRing(); });
  LC.on('callring', (r) => {
    if ((call && call.chan === r.chan) || (LC.ringAllowed ? !LC.ringAllowed(r) : S.me.presence === 'dnd') || (LC.isMuted(r.chan) && !r.parked)) return; stopRing();
    const u = S.users.get(r.from), video = r.call.mode === 'video', i = LC.chanInfo(r.chan), fwd = r.fwd || r.xfer;
    const accept = (mode) => async () => { stopRing(); if (call) await LC.leaveCall(); await LC.openChat(r.chan); LC.joinCall(r.chan, mode); };
    const decline = () => { stopRing(); LC.api('/api/call/decline', { chan: r.chan }).catch(() => {}); };
    const note = r.parked ? t('cl_incomingParked') : r.consult ? t('cl_incomingConsult', { name: LC.uname(r.from) }) : r.xfer ? t('cl_incomingXfer', { name: LC.uname(r.xfer) }) : r.fwd ? t('cl_incomingFwd', { name: LC.uname(r.fwd) }) : r.add ? t('cl_incomingAdd', { name: LC.uname(r.from) }) : '';
    ringBox = el('div', { class: 'ringbox', 'data-chan': r.chan, role: 'alertdialog', 'aria-label': t('incomingCallTitle') },
      el('div', { class: 'ringhead' }, LC.avatar(u, 'lg', false), el('div', { class: 'grow' }, el('b', { text: LC.uname(r.from) }), el('div', { class: 'small muted', text: (video ? t('incomingVideo') : t('incomingVoice')) + (i.kind === 'dm' ? '' : ' · ' + i.title) }),
        note ? el('div', { class: 'small cl-ringnote', text: note }) : null, call ? el('div', { class: 'small cl-ringnote', text: t('cl_callWaiting') }) : null)),
      el('div', { class: 'ringacts' }, video ? el('button', { class: 'ring-ok', title: t('acceptVideo'), 'aria-label': t('acceptVideo'), onclick: accept('video') }, LC.icon('video', { filled: true })) : null,
        el('button', { class: 'ring-ok', title: t('acceptAudio'), 'aria-label': t('acceptAudio'), onclick: accept('voice') }, LC.icon('call', { filled: true })),
        el('button', { class: 'ring-no', title: t('decline'), 'aria-label': t('decline'), onclick: decline }, LC.icon('call_end', { filled: true }))));
    document.body.append(ringBox); const p = cprefs(); RT.loop(fwd ? p.ringtoneFwd || 'chimes' : p.ringtone || 'classic');
    let n = 0; ringTimer = setInterval(() => { if (++n > 9) stopRing(); }, 3500);
    if (LC.native && !LC.visible()) LC.native.notify(t('incomingCallTitle'), `${LC.uname(r.from)} · ${i.title}`, r.chan);
    else if (!LC.native && 'Notification' in window && Notification.permission === 'granted' && !LC.visible()) { try { new Notification(t('incomingCallTitle'), { body: `${LC.uname(r.from)} · ${i.title}`, tag: 'call:' + r.chan }); } catch {} }
  });

  // ---------- voicemail: record up to 2 minutes for someone who didn't answer ----------
  async function voicemailFlow(to) {
    let greeting = ''; try { greeting = (await LC.api('/api/voicemail/greeting?to=' + encodeURIComponent(to))).greeting; } catch {}
    const src = call && call.local.getAudioTracks()[0]; let stream;
    if (src) { const c = src.clone(); c.enabled = true; stream = new MediaStream([c]); } else { try { stream = await getMic(LC.ui.micId); } catch { return LC.toast(t('cl_vmNoMic')); } }
    const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
    if (!window.MediaRecorder) return LC.toast(t('cl_vmNoMic'));
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt, audioBitsPerSecond: 32000 } : undefined), chunks = [], t0 = Date.now(), timer = el('b', { class: 'ctimer', text: '0:00' }); let cancelled = false, h;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finish = (send) => { cancelled = !send; clearInterval(h); try { rec.stop(); } catch {} };
    rec.onstop = async () => {
      stream.getTracks().forEach((x) => x.stop()); LC.closeModal(); if (cancelled || !chunks.length) return;
      const type = rec.mimeType || mt || 'audio/webm', ext = /mp4/.test(type) ? 'm4a' : 'weba', dur = Math.round((Date.now() - t0) / 1000);
      try { const up = await LC.upload(new Blob(chunks, { type }), `voicemail-${Date.now()}.${ext}`).promise; await LC.api('/api/voicemail/leave', { to, chan: call ? call.chan : LC.dmId(S.me.id, to), file: up.id, dur }); LC.toast(t('cl_vmSent', { name: LC.uname(to) })); if (call) LC.leaveCall(); } catch (e) { LC.toast(e.message); }
    };
    LC.modal([el('h2', {}, LC.icon('voicemail'), ' ' + t('cl_vmFor', { name: LC.uname(to) })), greeting ? el('blockquote', { class: 'cl-greeting' }, el('small', { class: 'muted', text: t('cl_vmGreeting') }), el('div', { text: greeting })) : null,
      el('p', { class: 'cl-vmrec' }, el('span', { class: 'cl-recdot', 'aria-hidden': 'true' }), ' ' + t('cl_vmRecording') + ' ', timer),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => finish(false) }), el('button', { class: 'primary', text: t('cl_vmSend'), onclick: () => finish(true) }))], { onClose: () => { if (rec.state === 'recording') finish(false); } });
    LC.playSound('ping'); setTimeout(() => { if (rec.state === 'inactive') { rec.start(1000); h = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = fmtDur(s * 1000); if (s >= 120) finish(true); }, 500); } }, 450);
  }
  LC.leaveVoicemail = voicemailFlow;

  // ---------- leaving, rating ----------
  function endLocal(quiet) {
    if (!call) return; const was = call; clearInterval(call.levelTimer); clearInterval(call.statsTimer); clearInterval(call.aliveTimer); RT.stop();
    for (const f of X.onEnd) { try { f(was); } catch (e) { console.error(e); } }
    for (const ep of [...call.peers.keys()]) dropPeer(ep);
    stopStream(call.local); if (call.screen) stopStream(call.screen); if (call.mixed) { try { call.mixed.ctx.close(); } catch {} } if (call.camFx) { try { call.camFx.stop(); } catch {} } if (call.scrFx) { try { call.scrFx.stop(); } catch {} } if (call.probe) call.probe.track.stop();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const chan = call.chan, q = call.q, id = call.id, long = Date.now() - call.joinedAt > 20000, peers = !call.wasAlone; call = null; chatBox = null; drawUi(); LC.renderCallBar(); if (S.chan && LC.renderHeader) LC.renderHeader();
    if (q.n && id) LC.api('/api/callx/quality', { id, rtt: q.rtt / q.n, loss: q.loss / q.n, jitter: q.jitter / q.n }).catch(() => {});
    LC.emitLocal('call:left', { chan });
    if (!quiet && long && peers && id && cprefs().askRating !== false) askRating(id);
  }
  LC.leaveCall = async () => { if (!call) return; const chan = call.chan, ep = call.ep; endLocal(); LC.api('/api/call/leave', { chan, ep }).catch(() => {}); LC.playSound('pop'); };
  window.addEventListener('beforeunload', () => { if (call && navigator.sendBeacon) navigator.sendBeacon('/api/call/leave?token=' + encodeURIComponent(S.token), new Blob([JSON.stringify({ chan: call.chan, ep: call.ep })], { type: 'application/json' })); });
  function askRating(id) {
    document.querySelectorAll('.cl-rate').forEach((x) => x.remove()); let stars = 0; const issues = new Set();
    const starRow = el('div', { class: 'cl-stars', role: 'group', 'aria-label': t('cl_rateTitle') }), iss = el('div', { class: 'cl-issues hidden' }), submit = el('button', { class: 'primary sm', text: t('cl_submit'), disabled: true });
    const drawStars = () => starRow.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { class: 'icon cl-star' + (n <= stars ? ' on' : ''), type: 'button', 'aria-label': t(n === 1 ? 'cl_star' : 'cl_stars', { n }), 'aria-pressed': String(n === stars), onclick: () => { stars = n; submit.disabled = false; iss.classList.toggle('hidden', n > 3); drawStars(); } }, LC.icon('star', { filled: n <= stars }))));
    iss.append(el('div', { class: 'small', text: t('cl_issues') }), ...['audio', 'video', 'screen', 'echo', 'dropped', 'other'].map((k) => el('label', { class: 'check' }, el('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? issues.add(k) : issues.delete(k)) }), ' ' + t('cl_issue_' + k))));
    const card = el('div', { class: 'cl-rate', role: 'dialog', 'aria-label': t('cl_rateTitle') }, el('b', { text: t('cl_rateTitle') }), starRow, iss, el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('cl_notNow'), onclick: () => card.remove() }), submit));
    submit.onclick = () => { LC.api('/api/callx/rate', { id, stars, issues: [...issues] }).then(() => LC.toast(t('cl_thanks'), { ms: 1800 })).catch((e) => LC.toast(e.message)); card.remove(); };
    drawStars(); document.body.append(card); setTimeout(() => card.remove(), 90000);
  }

  // ---------- keyboard: Teams shortcuts + hold Ctrl+Space to talk while muted ----------
  // Ctrl+Shift+M mute, Ctrl+Shift+O camera, Ctrl+Shift+K raise hand, Ctrl+Shift+H leave, Ctrl+Shift+E share, Ctrl+Space push to talk
  const typing = (e) => { const n = e.target; return n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)); };
  document.addEventListener('keydown', (e) => {
    if (!call) return;
    if (e.code === 'Space' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) { e.preventDefault(); if (!e.repeat && !call.me.mic && !call.companion && !call.ptt) { call.ptt = true; const a = call.local.getAudioTracks()[0]; if (a) { a.enabled = true; call.me.mic = true; syncMedia(); } drawUi(); } return; }
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return; const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); toggleMic(); } else if (k === 'o') { e.preventDefault(); toggleCam(); } else if (k === 'k') { e.preventDefault(); toggleHand(); } else if (k === 'h') { e.preventDefault(); LC.leaveCall(); }
    else if (k === 'e' && !typing(e)) { e.preventDefault(); if (call.screen) stopScreen(); else startScreen(); }
  });
  document.addEventListener('keyup', (e) => { if (call && call.ptt && (e.code === 'Space' || e.key === 'Control' || e.key === 'Meta')) { call.ptt = false; const a = call.local.getAudioTracks()[0]; if (a) a.enabled = false; call.me.mic = false; syncMedia(); drawUi(); } });
  window.addEventListener('blur', () => { if (call && call.ptt) { call.ptt = false; const a = call.local.getAudioTracks()[0]; if (a) a.enabled = false; call.me.mic = false; syncMedia(); drawUi(); } });

  // ---------- internals shared with the other calls-*.js files ----------
  const X = (LC._cx = {
    get call() { return call; }, state, epInfo, uidOf, mediaOfEp, roleOf, isOrg, isMod, drawSoon, redraw: () => drawUi(), updateSenders, setSenders, tune, order, dominant, tileFor, updateTile, screenBox, contentOf,
    startScreen, stopScreen, stopAnyShare, sharePicker, applyCamFx, setHold, switchDevice, getMic, getCam, fmtDur, endLocal, bars, setView, ringPeople, voicemail: voicemailFlow, EP,
    content: {},        // kind -> (box, state, content) renders shared content on the stage (whiteboard, PDF)
    decorate: [],       // (presentBox, state, content) overlays on shared content (zoom, annotations, paused)
    selfShare: [],      // (selfSharePanel, state, content) extras in "You're presenting"
    banners: [],        // (state) => node | null
    moreItems: [],      // (state) => [menu items] for "More"
    panels: {},         // key -> { label(), render(host, state) } built-in side panels (effects)
    onState: [], onCmd: [], onEnd: [], onShare: [],
    camPipe: null,      // (cameraTrack) => { track, stop } (calls-effects.js)
    screenPipe: null,   // (screenTrack) => { track, stop, mode } (calls-share.js presenter modes)
    shareMenu: null,    // (anchor) => void : the share tray (calls-share.js)
    fakeQuality: null,  // tests: force network numbers
  });
})();
