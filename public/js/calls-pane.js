'use strict';
// Calls area: the Calls pane (make a call, pick up a parked call, calls going on now, speed dial, contact groups; history with
// All / Missed / Incoming / Outgoing and Call back; voicemail) and two Settings tabs: "Calls" (forwarding, voicemail greeting,
// ringtones, record automatically, rating) and "Devices" (camera with live preview, microphone with a level meter, speaker
// with a test sound, noise suppression, music mode, video effects, and a test call that records 5 seconds and plays them back).
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), X = LC._cx;
  LC.addStrings('en', {
    cl_history: 'History', cl_voicemail: 'Voicemail', cl_all: 'All', cl_missed: 'Missed', cl_incoming: 'Incoming', cl_outgoing: 'Outgoing', cl_callBack: 'Call back', cl_callBackN: 'Call back {name}', cl_noHistory: 'No calls yet.',
    cl_noVoicemail: 'No voicemail. When someone can’t reach you, their message shows up here.', cl_markHeard: 'Mark as heard', cl_markUnheard: 'Mark as not heard', cl_deleteVm: 'Delete voicemail', cl_vmFrom: 'Voicemail from {name}', cl_unheard: 'New',
    cl_makeCall: 'Make a call', cl_typeName: 'Type a name', cl_pickup: 'Pick up a parked call', cl_pickupCode: 'Parked call code', cl_pickupBtn: 'Pick up', cl_speedDial: 'Speed dial', cl_editSpeed: 'Edit speed dial', cl_speedEmpty: 'Add the people you call most.',
    cl_contactGroups: 'Contact groups', cl_groupsEmpty: 'No contact groups yet.', cl_makeGroups: 'Make groups in People', cl_callGroup: 'Call {name}', cl_videoGroup: 'Video call {name}', cl_activeNow: 'Calls going on now', cl_dur: '{d}', cl_inChat: 'Open the chat',
    cl_settingsCalls: 'Calls', cl_settingsDevices: 'Devices', cl_forwarding: 'Call forwarding', cl_fwdAlways: 'Forward my calls', cl_fwdUnanswered: 'If I don’t answer (after 30 seconds) or decline', cl_fwdBusy: 'If I’m already in a call',
    cl_fwdOff: 'Off (ring me)', cl_fwdVoicemail: 'Voicemail', cl_fwdPerson: 'Someone else…', cl_fwdNothing: 'Nothing (missed call)', cl_fwdWho: 'Forward to', cl_fwdHelp: 'Applies to 1:1 calls. Forwarded calls ring with your “forwarded” ringtone on their side.',
    cl_greeting: 'Voicemail greeting', cl_greetingHelp: 'People see this before they leave you a voicemail.', cl_greetingPh: 'Hi, it’s me. Leave a message and I’ll call you back.', cl_ringtones: 'Ringtones', cl_ringNormal: 'Calls for me', cl_ringFwd: 'Forwarded and transferred calls',
    cl_preview: 'Play', cl_tone_classic: 'Classic', cl_tone_chimes: 'Chimes', cl_tone_marimba: 'Marimba', cl_tone_bright: 'Bright', cl_tone_pulse: 'Soft pulse', cl_tone_retro: 'Retro phone', cl_tone_none: 'Silent', cl_meetings: 'Meetings',
    cl_autoRecord: 'Record my meetings automatically', cl_autoRecordHelp: 'Starts recording when a call you organize has someone else in it (if recording is allowed).', cl_askRating: 'Ask me to rate call quality after calls', cl_saved: 'Saved',
    cl_camPreview: 'Camera preview', cl_micLevel: 'Microphone level', cl_testSound: 'Play a test sound', cl_testCall: 'Make a test call', cl_testCallHelp: 'Records 5 seconds from your microphone, then plays them back on your speaker.', cl_testRec: 'Recording… speak now ({n})',
    cl_testPlay: 'Playing back what you said', cl_testDone: 'Test call finished', cl_noDevices: 'No camera or microphone found.', cl_effectsBtn: 'Video effects…',
  });
  LC.addStrings('hi', { cl_history: 'इतिहास', cl_voicemail: 'वॉइसमेल', cl_missed: 'छूटी हुई', cl_callBack: 'वापस कॉल करें', cl_speedDial: 'स्पीड डायल', cl_settingsCalls: 'कॉल', cl_settingsDevices: 'डिवाइस', cl_testCall: 'टेस्ट कॉल करें' });
  LC.addStrings('es', { cl_history: 'Historial', cl_voicemail: 'Buzón de voz', cl_missed: 'Perdidas', cl_callBack: 'Devolver la llamada', cl_speedDial: 'Marcado rápido', cl_settingsCalls: 'Llamadas', cl_settingsDevices: 'Dispositivos', cl_testCall: 'Hacer una llamada de prueba' });
  const fail = (e) => LC.toast(e.message);
  const prefs = () => (LC.callPrefs ? LC.callPrefs() : {});
  const people = () => [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed && !u.deleted);
  const call = (chan, mode) => async () => { await LC.openChat(chan); LC.startCall(chan, mode); };
  const fmt = (ms) => (X ? X.fmtDur(ms) : Math.round(ms / 1000) + 's');

  // ---------- badge: missed calls + new voicemail ----------
  let missed = 0, vms = null, unheard = 0, hist = null, filter = 'all', tab = 'history';
  async function counts() { try { const [a, v] = await Promise.all([LC.api('/api/activity?type=missedCall&unread=1&limit=100'), LC.api('/api/voicemail')]); missed = a.items.length; vms = v.voicemail; unheard = v.unheard; } catch {} LC.renderRail && LC.renderRail(); if (S.app === 'calls') drawMain(); }
  LC.on('init', () => { hist = null; counts(); });
  LC.on('activity', (a) => { if (a.type === 'missedCall' || a.type === 'voicemail') { counts(); hist = null; } });
  LC.on('activityread', () => counts());
  LC.on('voicemail', () => counts()); LC.on('voicemailstate', () => counts());
  LC.on('callstate', (e) => { if (!e.call) hist = null; if (S.pane === 'calls' && !S.app) LC.renderNav(); else if (S.app === 'calls' && !e.call) loadHistory(); });

  // ---------- the list column ----------
  function sec(label, ...acts) { return el('div', { class: 'sec' }, el('h2', { class: 'sectitle', text: label }), ...acts); }
  const callBtns = (name, chan) => [LC.ibtn('video', t('videoCallWith', { name }), call(chan, 'video')), LC.ibtn('call', t('voiceCallWith', { name }), call(chan, 'voice'))];
  function personRow(u) { const dm = LC.dmId(S.me.id, u.id); return el('div', { class: 'callrow' }, LC.avatar(u, '', true), el('span', { class: 'itext' }, el('b', { class: 'name', text: LC.uname(u.id) }), el('span', { class: 'prev', text: LC.presenceLabel ? LC.presenceLabel(u.presence) : t(u.presence) })), ...callBtns(LC.uname(u.id), dm)); }
  function renderNav(nav) {
    const q = el('input', { type: 'search', class: 'cl-dial', placeholder: t('cl_typeName'), 'aria-label': t('cl_makeCall') }), found = el('div', { class: 'cl-found' });
    q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); found.replaceChildren(...(v ? people().filter((u) => LC.uname(u.id).toLowerCase().includes(v)).slice(0, 6).map(personRow) : [])); });
    const code = el('input', { class: 'cl-code-in', inputmode: 'numeric', maxlength: 3, placeholder: '123', 'aria-label': t('cl_pickupCode'), pattern: '[0-9]*' });
    const pick = async (e) => { e.preventDefault(); try { const r = await LC.api('/api/call/pickup', { code: code.value.trim() }); code.value = ''; await LC.openChat(r.chan); LC.joinCall(r.chan, r.mode); } catch (x) { fail(x); } };
    const live = Object.entries(S.calls), sd = (prefs().speedDial || []).map((id) => S.users.get(id)).filter(Boolean), groups = Array.isArray(LC.prefs().contactGroups) ? LC.prefs().contactGroups : [];
    nav.replaceChildren(...[
      sec(t('cl_makeCall')), el('div', { class: 'cl-navbox' }, q, found),
      sec(t('cl_pickup')), el('form', { class: 'cl-navbox cl-pickup', onsubmit: pick }, code, el('button', { class: 'primary sm', type: 'submit', text: t('cl_pickupBtn') })),
      live.length ? sec(t('cl_activeNow')) : null, ...live.map(([chan, c]) => el('div', { class: 'callrow' }, el('span', { class: 'livecall' }, LC.icon(c.mode === 'video' ? 'video' : 'call', { filled: true })), el('span', { class: 'itext' }, el('b', { class: 'name', text: LC.chanInfo(chan).title }), el('span', { class: 'prev', text: c.participants.map(LC.uname).join(', ') + (c.parked ? ' · ' + t('cl_parkedBy', { name: LC.uname(c.parked.by), code: c.parked.code }) : '') })),
        LC.inCall() && LC.callChan() === chan ? el('button', { class: 'secondary sm', text: t('openCall'), onclick: () => LC.showCall() }) : el('button', { class: 'primary sm', text: t('joinCall'), onclick: async () => { await LC.openChat(chan); LC.joinCall(chan); } }))),
      sec(t('cl_speedDial'), LC.ibtn('edit', t('cl_editSpeed'), editSpeed, { cls: 'icon plus' })), ...(sd.length ? sd.map(personRow) : [el('p', { class: 'muted small pad', text: t('cl_speedEmpty') })]),
      sec(t('cl_contactGroups')), ...(groups.length ? groups.map(groupRow) : [el('div', { class: 'pad' }, el('p', { class: 'muted small', text: t('cl_groupsEmpty') }), LC.ext.panes.people ? el('button', { class: 'link', text: t('cl_makeGroups'), onclick: () => LC.setPane('people') }) : null)]),
      sec(t('people')), ...people().sort((a, b) => ((b.presence !== 'offline') - (a.presence !== 'offline')) || LC.uname(a.id).localeCompare(LC.uname(b.id))).map(personRow)].filter(Boolean));
  }
  function groupRow(g) {
    const ids = (g.members || []).filter((id) => S.users.has(id) && id !== S.me.id), go = (mode) => async () => {
      const want = [...new Set([S.me.id, ...ids])].sort().join(',');
      let c = [...S.channels.values()].find((x) => x.members && [...x.members].sort().join(',') === want);
      if (!c) { try { c = await LC.api('/api/channel', { name: String(g.name || 'Group').slice(0, 30), members: ids }); S.channels.set(c.id, c); } catch (e) { return fail(e); } }
      await LC.openChat(c.id); LC.startCall(c.id, mode);
    };
    return el('div', { class: 'callrow' }, el('div', { class: 'av tile group', 'aria-hidden': 'true' }, LC.icon('people_team', { filled: true })), el('span', { class: 'itext' }, el('b', { class: 'name', text: g.name }), el('span', { class: 'prev', text: ids.map(LC.uname).join(', ') })),
      LC.ibtn('video', t('cl_videoGroup', { name: g.name }), go('video'), { disabled: !ids.length }), LC.ibtn('call', t('cl_callGroup', { name: g.name }), go('voice'), { disabled: !ids.length }));
  }
  function editSpeed() {
    const cur = new Set(prefs().speedDial || []);
    LC.modal([el('h2', {}, LC.icon('star'), ' ' + t('cl_editSpeed')), el('div', { class: 'people cl-pick' }, people().map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: cur.has(u.id), onchange: (e) => (e.target.checked ? cur.add(u.id) : cur.delete(u.id)) }), LC.avatar(u, 'sm', true), LC.uname(u.id)))),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('save'), onclick: () => LC.setCallPrefs({ speedDial: [...cur] }).then(() => { LC.closeModal(); LC.renderNav(); }).catch(() => {}) }))]);
  }

  // ---------- the big area: history and voicemail ----------
  let mainHost = null;
  async function loadHistory() { try { hist = (await LC.api('/api/callx/history?f=' + filter)).calls; } catch (e) { hist = []; } if (S.app === 'calls') drawMain(); }
  function drawMain() {
    const host = mainHost; if (!host || !host.isConnected || S.app !== 'calls') return;
    const tabBtn = (k, label, n) => el('button', { class: 'tab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; drawMain(); if (k === 'history' && missed) LC.api('/api/activity/read', { all: true, types: ['missedCall'] }).catch(() => {}); } }, el('span', { text: label }), n ? el('span', { class: 'badge mention', text: String(n) }) : null);
    const head = el('div', { class: 'cl-mainhead' }, el('div', { class: 'tabs cl-tabs', role: 'tablist', 'aria-label': t('railCalls') }, tabBtn('history', t('cl_history'), missed), tabBtn('voicemail', t('cl_voicemail'), unheard)));
    let body;
    if (tab === 'history') {
      const chips = el('div', { class: 'cl-chips', role: 'group', 'aria-label': t('cl_history') }, ['all', 'missed', 'incoming', 'outgoing'].map((f) => el('button', { class: 'cl-chip' + (filter === f ? ' on' : ''), 'aria-pressed': String(filter === f), onclick: () => { filter = f; hist = null; loadHistory(); drawMain(); } }, t('cl_' + f))));
      if (!hist) loadHistory();
      body = el('div', {}, chips, hist ? (hist.length ? el('ul', { class: 'cl-hist', 'aria-label': t('cl_history') }, hist.map(histRow)) : LC.emptyState ? LC.emptyState('history', t('cl_noHistory')) : el('p', { class: 'muted', text: t('cl_noHistory') })) : el('p', { class: 'muted pad', text: t('loading') }));
    } else body = vms === null ? el('p', { class: 'muted pad', text: t('loading') }) : vms.length ? el('ul', { class: 'cl-hist', 'aria-label': t('cl_voicemail') }, vms.map(vmRow)) : LC.emptyState ? LC.emptyState('voicemail', t('cl_noVoicemail')) : el('p', { class: 'muted', text: t('cl_noVoicemail') });
    host.replaceChildren(el('div', { class: 'cl-callsmain' }, head, body));
  }
  function histRow(e) {
    const i = LC.chanInfo(e.chan), dur = e.end ? fmt(e.end - e.start) : e.live ? t('cl_activeNow') : '', kind = e.missed ? 'missed' : e.dir === 'out' ? 'outgoing' : 'incoming';
    return el('li', { class: 'cl-hrow' + (e.missed ? ' missed' : '') }, LC.chatLead ? LC.chatLead(e.chan) : LC.avatar(i.peer), el('span', { class: 'itext' }, el('b', { class: 'name', text: i.title }),
      el('span', { class: 'prev' }, LC.icon(e.missed ? 'call_missed' : e.dir === 'out' ? 'call_outbound' : 'call_inbound', { cls: 'cl-hico' }), ' ' + t('cl_' + kind) + ' · ' + (e.mode === 'video' ? t('videoCall') : t('voiceCall')) + (dur && !e.missed ? ' · ' + dur : ''))),
      el('time', { class: 'itime', text: LC.shortTime(e.start), title: LC.fmtDateTime(e.start) }),
      LC.ibtn(e.mode === 'video' ? 'video' : 'call', t('cl_callBackN', { name: i.title }), call(e.chan, e.mode)), LC.ibtn('chat', t('cl_inChat'), () => LC.openChat(e.chan)));
  }
  function vmRow(v) {
    const name = LC.uname(v.from), audio = el('audio', { controls: true, preload: 'none', src: `/api/voicemail/audio?id=${encodeURIComponent(v.id)}&token=${encodeURIComponent(S.token)}`, 'aria-label': t('cl_vmFrom', { name }) });
    audio.addEventListener('play', () => { if (!v.heard) LC.api('/api/voicemail/heard', { id: v.id }).catch(() => {}); });
    return el('li', { class: 'cl-hrow cl-vmrow' + (v.heard ? '' : ' unheard') }, LC.avatar(S.users.get(v.from), '', false), el('span', { class: 'itext' }, el('b', { class: 'name' }, name, v.heard ? null : el('span', { class: 'cl-new', text: t('cl_unheard') })), el('span', { class: 'prev', text: LC.fmtDateTime(v.ts) + ' · ' + fmt(v.dur * 1000) }), audio),
      LC.ibtn(v.heard ? 'mail_read' : 'checkmark', v.heard ? t('cl_markUnheard') : t('cl_markHeard'), () => LC.api('/api/voicemail/heard', { id: v.id, heard: !v.heard }).catch(fail)),
      LC.ibtn('call', t('cl_callBackN', { name }), call(LC.dmId(S.me.id, v.from), 'voice')), LC.ibtn('delete', t('cl_deleteVm'), async () => { if (await LC.confirm(t('cl_deleteVm') + '?', { danger: true, ok: t('delete') })) LC.api('/api/voicemail/delete', { id: v.id }).catch(fail); }));
  }
  const pane = {
    icon: 'call', label: () => t('railCalls'), order: 60, render: renderNav,
    main: (host) => { mainHost = host; hist = null; drawMain(); if (tab === 'history' && missed) LC.api('/api/activity/read', { all: true, types: ['missedCall'] }).catch(() => {}); },
    badge: () => missed + unheard || Object.keys(S.calls).length,
    get live() { return !(missed + unheard) && Object.keys(S.calls).length > 0; },
    actions: () => [LC.ibtn('star', t('cl_editSpeed'), editSpeed)],
  };
  LC.ext.panes.calls = pane;
  LC.on('lang', () => { if (S.app === 'calls') drawMain(); });

  // ---------- Settings › Calls ----------
  const field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  const save = (patch) => LC.setCallPrefs(patch).then(() => LC.toast(t('cl_saved'), { ms: 1200 })).catch(() => {});
  function fwdField(key, label, opts) {
    const f = (prefs().forward || {}), cur = f[key] || (key === 'always' ? 'off' : 'voicemail'), isPerson = cur !== 'off' && cur !== 'voicemail';
    const who = el('select', { 'aria-label': t('cl_fwdWho') + ' · ' + label, class: isPerson ? '' : 'hidden', onchange: () => commit() }, people().map((u) => el('option', { value: u.id, text: LC.uname(u.id) }))); if (isPerson) who.value = cur;
    const sel = el('select', { 'aria-label': label, onchange: () => { who.classList.toggle('hidden', sel.value !== 'person'); commit(); } }, opts.map(([v, l]) => el('option', { value: v, text: l }))); sel.value = isPerson ? 'person' : cur;
    const commit = () => { const val = sel.value === 'person' ? who.value : sel.value; if (sel.value === 'person' && !who.value) return; save({ forward: { ...(prefs().forward || {}), [key]: val } }); };
    return field(label, el('div', { class: 'rowline' }, sel, who));
  }
  function tonePick(key, label, dflt) {
    const s = el('select', { 'aria-label': label, onchange: () => { LC.ringtones.play(s.value); save({ [key]: s.value }); } }, LC.ringtones.names.map((n) => el('option', { value: n, text: t('cl_tone_' + n) }))); s.value = prefs()[key] || dflt;
    return field(label, el('div', { class: 'rowline' }, s, el('button', { class: 'secondary sm withicon', type: 'button', onclick: () => LC.ringtones.play(s.value) }, LC.icon('play'), t('cl_preview'))));
  }
  const toggle = (label, on, fn, hint) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!on, onchange: (e) => fn(e.target.checked) }), el('span', {}, label, hint ? el('small', { class: 'muted', text: ' — ' + hint }) : null));
  function callsTab() {
    const p = prefs(), greet = el('textarea', { rows: 2, maxlength: 200, placeholder: t('cl_greetingPh'), 'aria-label': t('cl_greeting') }); greet.value = p.greeting || '';
    return el('div', { class: 'cl-settings' },
      el('h3', { text: t('cl_forwarding') }), el('p', { class: 'muted small', text: t('cl_fwdHelp') }),
      fwdField('always', t('cl_fwdAlways'), [['off', t('cl_fwdOff')], ['voicemail', t('cl_fwdVoicemail')], ['person', t('cl_fwdPerson')]]),
      fwdField('unanswered', t('cl_fwdUnanswered'), [['voicemail', t('cl_fwdVoicemail')], ['person', t('cl_fwdPerson')], ['off', t('cl_fwdNothing')]]),
      fwdField('busy', t('cl_fwdBusy'), [['voicemail', t('cl_fwdVoicemail')], ['person', t('cl_fwdPerson')], ['off', t('cl_fwdNothing')]]),
      el('h3', { text: t('cl_greeting') }), field(t('cl_greeting'), greet, t('cl_greetingHelp')), el('div', { class: 'acts' }, el('button', { class: 'primary sm', type: 'button', text: t('save'), onclick: () => save({ greeting: greet.value }) })),
      el('h3', { text: t('cl_ringtones') }), tonePick('ringtone', t('cl_ringNormal'), 'classic'), tonePick('ringtoneFwd', t('cl_ringFwd'), 'chimes'),
      el('h3', { text: t('cl_meetings') }), toggle(t('cl_autoRecord'), p.autoRecord, (v) => save({ autoRecord: v }), t('cl_autoRecordHelp')), toggle(t('cl_askRating'), p.askRating !== false, (v) => save({ askRating: v })));
  }

  // ---------- Settings › Devices ----------
  function wavChime() { // a short two-note chime as a WAV file, so it can play on the chosen speaker
    const rate = 22050, n = Math.round(rate * 1.2), buf = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); buf.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); w(36, 'data'); buf.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const tt = i / rate, f = tt < 0.5 ? 880 : 1318.5, a = Math.exp(-4 * (tt % 0.6)) * 0.35; buf.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * f * tt) * a * 32767), true); }
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function devicesTab() {
    const box = el('div', { class: 'cl-settings cl-devices' }), video = el('video', { class: 'cl-campreview', autoplay: true, playsinline: true, muted: true, 'aria-label': t('cl_camPreview') }), meter = el('div', { class: 'cl-meter', role: 'meter', 'aria-label': t('cl_micLevel'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, el('i'));
    video.muted = true; let cam = null, mic = null, fx = null, ac = null, an = null, raf = 0;
    const stopAll = () => { cancelAnimationFrame(raf); if (fx) { fx.stop(); fx = null; } for (const s of [cam, mic]) if (s) s.getTracks().forEach((x) => x.stop()); cam = mic = null; if (ac) { ac.close().catch(() => {}); ac = null; } };
    const startCam = async () => { if (fx) { fx.stop(); fx = null; } if (cam) cam.getTracks().forEach((x) => x.stop()); cam = null; try { cam = await LC.callDevices.getCam(LC.ui.camId); if (!box.isConnected && box.dataset.on) return stopAll(); fx = LC.callEffects ? LC.callEffects.process(cam.getVideoTracks()[0]) : null; video.srcObject = new MediaStream([fx ? fx.track : cam.getVideoTracks()[0]]); video.play().catch(() => {}); } catch { video.replaceWith(el('p', { class: 'muted', text: t('noCamera') })); } };
    const startMic = async () => {
      if (mic) mic.getTracks().forEach((x) => x.stop()); try { mic = await LC.callDevices.getMic(LC.ui.micId); } catch { return; }
      try { ac ||= new AudioContext(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(mic).connect(an); } catch { return; }
      const buf = new Uint8Array(an.fftSize), loop = () => { if (!box.isConnected && box.dataset.on) return stopAll(); an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d; } const lvl = Math.min(100, Math.round(Math.sqrt(s / buf.length) * 300)); meter.firstChild.style.width = lvl + '%'; meter.setAttribute('aria-valuenow', String(lvl)); raf = requestAnimationFrame(loop); }; loop();
    };
    const sel = (kind, key, label, devs, after) => { const list = devs.filter((d) => d.kind === kind); const s = el('select', { 'aria-label': label, onchange: (e) => { LC.setUi({ [key]: e.target.value }); if (X && X.call) X.switchDevice(key, e.target.value); after && after(); } }, el('option', { value: '', text: t('systemDefault') }), list.map((d, i) => el('option', { value: d.deviceId, text: d.label || `${label} ${i + 1}` }))); s.value = LC.ui[key] || ''; return field(label, s); };
    const testSound = () => { const a = new Audio(wavChime()); if (LC.ui.speakerId && a.setSinkId) a.setSinkId(LC.ui.speakerId).catch(() => {}); a.play().catch(() => {}); };
    const status = el('p', { class: 'muted small', role: 'status' });
    const testCall = async (e) => {
      const btn = e.currentTarget; if (!window.MediaRecorder) return; btn.disabled = true;
      let s; try { s = await LC.callDevices.getMic(LC.ui.micId); } catch { btn.disabled = false; return fail(new Error(t('micDenied'))); }
      const rec = new MediaRecorder(s), chunks = []; rec.ondataavailable = (x) => x.data.size && chunks.push(x.data);
      let n = 5; status.textContent = t('cl_testRec', { n }); const h = setInterval(() => { n--; if (n > 0) status.textContent = t('cl_testRec', { n }); }, 1000);
      rec.onstop = () => { clearInterval(h); s.getTracks().forEach((x) => x.stop()); const a = new Audio(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }))); a.dataset.testcall = '1'; if (LC.ui.speakerId && a.setSinkId) a.setSinkId(LC.ui.speakerId).catch(() => {}); status.textContent = t('cl_testPlay'); box.dataset.testcall = String(chunks.reduce((x, c) => x + c.size, 0)); a.onended = () => { status.textContent = t('cl_testDone'); btn.disabled = false; }; a.play().catch(() => { status.textContent = t('cl_testDone'); btn.disabled = false; }); };
      rec.start(500); setTimeout(() => { try { rec.stop(); } catch {} }, 5000);
    };
    navigator.mediaDevices.enumerateDevices().catch(() => []).then((devs) => {
      const noise = el('select', { 'aria-label': t('cl_noise'), onchange: (e) => { LC.setUi({ clNoise: e.target.value }); startMic(); } }, ['auto', 'high', 'low', 'off'].map((v) => el('option', { value: v, text: t('cl_noise' + v[0].toUpperCase() + v.slice(1)) }))); noise.value = LC.ui.clNoise || 'auto';
      const fxBtn = LC.callEffects ? el('button', { class: 'secondary sm withicon', type: 'button', onclick: () => { const h = el('div', { class: 'cl-fxsettings' }); fxBtn.replaceWith(h); LC.callEffects.picker(h, {}); } }, LC.icon('video_background_effect'), t('cl_effectsBtn')) : null;
      box.append(el('h3', { text: t('camera') }), sel('videoinput', 'camId', t('camera'), devs, startCam), el('div', { class: 'cl-camwrap' }, video), fxBtn,
        el('h3', { text: t('microphone') }), sel('audioinput', 'micId', t('microphone'), devs, startMic), field(t('cl_micLevel'), meter), field(t('cl_noise'), noise, t('cl_noiseHelp')),
        toggle(t('cl_music'), LC.ui.clMusic, (v) => { LC.setUi({ clMusic: v }); startMic(); }, t('cl_musicHelp')),
        'setSinkId' in HTMLMediaElement.prototype ? el('h3', { text: t('speaker') }) : null, 'setSinkId' in HTMLMediaElement.prototype ? sel('audiooutput', 'speakerId', t('speaker'), devs) : null,
        el('div', { class: 'rowline' }, el('button', { class: 'secondary sm withicon', type: 'button', onclick: testSound }, LC.icon('speaker_2'), t('cl_testSound'))),
        el('h3', { text: t('cl_testCall') }), el('p', { class: 'muted small', text: t('cl_testCallHelp') }), el('div', { class: 'rowline' }, el('button', { class: 'primary sm withicon', type: 'button', 'data-testcall': '1', onclick: testCall }, LC.icon('call'), t('cl_testCall'))), status);
      box.dataset.on = '1'; startCam(); startMic();
    });
    const watch = setInterval(() => { if (box.dataset.on && !box.isConnected) { clearInterval(watch); stopAll(); } }, 800);
    return box;
  }
  LC.ext.settingsTabs.push({ key: 'calls', icon: 'call', label: () => t('cl_settingsCalls'), order: 35, render: callsTab }, { key: 'devices', icon: 'video_settings', label: () => t('cl_settingsDevices'), order: 36, render: devicesTab });
})();
