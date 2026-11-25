'use strict';
// People area (docs/features-people.md): presence look, the status panel under your picture (status, duration, status message,
// work location, out of office), profile details in Settings, the Privacy tab (blocked people, priority access), the strip above
// the message box (the other person's status message / out of office / Do not disturb), blocked people's messages in groups.
// The contact card and People pane live in people-card.js; Activity and notification rules in people-activity.js.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addEvents('ppactdel');
  LC.addStrings('en', {
    // presence (the bare state names are also used by core screens: t(user.presence))
    busy: 'Busy', brb: 'Be right back', meeting: 'In a meeting', presenting: 'Presenting', oof: 'Out of office',
    pp_st_online: 'Available', pp_st_busy: 'Busy', pp_st_dnd: 'Do not disturb', pp_st_brb: 'Be right back', pp_st_away: 'Away', pp_st_offline: 'Offline', pp_st_invisible: 'Appear offline',
    pp_st_call: 'In a call', pp_st_meeting: 'In a meeting', pp_st_presenting: 'Presenting', pp_st_oof: 'Out of office',
    pp_set_online: 'Available', pp_set_busy: 'Busy', pp_set_dnd: 'Do not disturb', pp_set_brb: 'Be right back', pp_set_away: 'Appear away', pp_set_invisible: 'Appear offline', pp_set_auto: 'Automatic (reset status)',
    pp_myStatus: 'Your status', pp_changeStatus: 'Change your status', pp_reset: 'Reset status', pp_duration: 'Duration', pp_durationTitle: 'Status duration', pp_status: 'Status', pp_resetAfter: 'Reset status after',
    pp_d30m: '30 minutes', pp_d1h: '1 hour', pp_d2h: '2 hours', pp_d4h: '4 hours', pp_dToday: 'Today', pp_dWeek: 'This week', pp_dCustom: 'Custom', pp_dNever: 'Never', pp_until: 'until {when}', pp_pickTime: 'Date and time',
    pp_statusMsg: 'Set status message', pp_statusMsgTitle: 'Status message', pp_statusMsgPh: "What's happening? Let people know.", pp_showWhenMsg: 'Show when people message me', pp_clearAfter: 'Clear status message after',
    pp_clearMsg: 'Clear message', pp_done: 'Done', pp_emojiQuick: 'Status emoji', pp_noEmoji: 'No emoji', pp_chars: '{n}/280',
    pp_workLoc: 'Work location', pp_wlOffice: 'In the office', pp_wlRemote: 'Remote', pp_wlCustom: 'Somewhere else…', pp_wlClear: 'Clear work location', pp_wlPrompt: 'Where are you working from?', pp_wlNone: 'Not set',
    pp_oof: 'Schedule out of office', pp_oofTitle: 'Out of office', pp_oofOn: 'Turn on out of office', pp_oofMsg: 'Out of office message', pp_oofMsgPh: "I'm away until Monday. For urgent things, message Ana.",
    pp_oofPeriod: 'Only during a time period', pp_oofStart: 'Start', pp_oofEnd: 'End', pp_oofReply: 'Reply automatically when someone messages me 1:1 (once a day per person)', pp_oofHelp: 'People see your message on your contact card and above the message box when they write to you.',
    pp_oofIsOn: 'Out of office is on', pp_oofUntil: 'Out of office until {when}', pp_oofFrom: 'Out of office from {when}', pp_oofOff: 'Off', pp_oofNeedsEnd: 'Pick an end after the start.',
    pp_editProfile: 'Edit profile', pp_signOut: 'Sign out',
    // profile settings
    pp_aboutMe: 'Contact info and work', pp_jobTitle: 'Job title', pp_department: 'Department', pp_office: 'Office location', pp_pronouns: 'Pronouns', pp_email: 'Email', pp_phone: 'Phone',
    pp_reportsTo: 'Reports to', pp_nobody: 'Nobody', pp_timeZone: 'Time zone', pp_tzAuto: 'Automatic ({tz})', pp_saveDetails: 'Save details', pp_detailsHelp: 'Everyone in this session can see these on your contact card. All of them are optional.',
    pp_namePron: 'Name pronunciation', pp_recHint: 'Record yourself saying your name (up to 10 seconds) so people know how to say it.', pp_record: 'Record', pp_stop: 'Stop', pp_play: 'Play', pp_rerecord: 'Record again', pp_delRec: 'Delete recording',
    pp_recording: 'Recording… {s} s', pp_recSaved: 'Recording saved', pp_noRec: 'No recording yet.', pp_hasRec: 'Your recording is ready.', pp_playName: 'Play name pronunciation',
    // privacy
    pp_privacy: 'Privacy', pp_blockedPeople: 'Blocked people', pp_blockHelp: "People you block can't message or call you 1:1, they see you as offline, and their messages in group chats are hidden for you.",
    pp_noBlocked: "You haven't blocked anyone.", pp_blockWho: 'Block someone…', pp_block: 'Block', pp_unblock: 'Unblock', pp_confirmBlock: "Block {name}? They won't be able to message or call you 1:1.",
    pp_priorityAccess: 'Priority access', pp_priorityHelp: 'Messages and calls from these people still notify you when your status is Do not disturb.', pp_noPriority: 'Nobody has priority access yet.',
    pp_addWho: 'Add someone…', pp_add: 'Add', pp_remove: 'Remove', pp_blockedMsg: 'Message from someone you blocked', pp_show: 'Show', pp_youBlocked: "You blocked {name}. They can't message or call you.",
    pp_autoReply: 'Automatic reply', pp_bnOof: '{name} is out of office', pp_bnOofUntil: '{name} is out of office until {when}', pp_bnDnd: "{name}'s status is Do not disturb. They'll see your message, but may not be notified.",
    pp_bnPresenting: '{name} is presenting right now. They may not see your message until later.', pp_bnStatus: "{name}'s status message", pp_dismiss: 'Dismiss',
  });
  LC.addStrings('hi', {
    busy: 'व्यस्त', brb: 'अभी आता हूँ', meeting: 'मीटिंग में', presenting: 'प्रस्तुत कर रहे हैं', oof: 'कार्यालय से बाहर',
    pp_st_online: 'उपलब्ध', pp_st_busy: 'व्यस्त', pp_st_dnd: 'परेशान न करें', pp_st_brb: 'अभी आता हूँ', pp_st_away: 'दूर', pp_st_offline: 'ऑफ़लाइन', pp_st_invisible: 'ऑफ़लाइन दिखें',
    pp_st_call: 'कॉल पर', pp_st_meeting: 'मीटिंग में', pp_st_presenting: 'प्रस्तुत कर रहे हैं', pp_st_oof: 'कार्यालय से बाहर',
    pp_set_online: 'उपलब्ध', pp_set_busy: 'व्यस्त', pp_set_dnd: 'परेशान न करें', pp_set_brb: 'अभी आता हूँ', pp_set_away: 'दूर दिखें', pp_set_invisible: 'ऑफ़लाइन दिखें', pp_reset: 'स्थिति रीसेट करें', pp_duration: 'अवधि',
    pp_statusMsg: 'स्थिति संदेश सेट करें', pp_statusMsgTitle: 'स्थिति संदेश', pp_showWhenMsg: 'जब लोग मुझे संदेश भेजें तब दिखाएँ', pp_clearAfter: 'स्थिति संदेश इसके बाद हटाएँ', pp_workLoc: 'कार्य स्थान', pp_wlOffice: 'कार्यालय में', pp_wlRemote: 'रिमोट',
    pp_oof: 'कार्यालय से बाहर शेड्यूल करें', pp_oofTitle: 'कार्यालय से बाहर', pp_editProfile: 'प्रोफ़ाइल संपादित करें', pp_jobTitle: 'पद', pp_department: 'विभाग', pp_reportsTo: 'किसे रिपोर्ट करते हैं', pp_privacy: 'गोपनीयता', pp_block: 'ब्लॉक करें', pp_unblock: 'अनब्लॉक करें',
    pp_priorityAccess: 'प्राथमिकता पहुँच', pp_blockedPeople: 'ब्लॉक किए गए लोग', pp_autoReply: 'स्वचालित उत्तर', pp_show: 'दिखाएँ', pp_dismiss: 'हटाएँ',
  });
  LC.addStrings('es', {
    busy: 'Ocupado', brb: 'Vuelvo enseguida', meeting: 'En una reunión', presenting: 'Presentando', oof: 'Fuera de la oficina',
    pp_st_online: 'Disponible', pp_st_busy: 'Ocupado', pp_st_dnd: 'No molestar', pp_st_brb: 'Vuelvo enseguida', pp_st_away: 'Ausente', pp_st_offline: 'Desconectado', pp_st_invisible: 'Aparecer desconectado',
    pp_st_call: 'En una llamada', pp_st_meeting: 'En una reunión', pp_st_presenting: 'Presentando', pp_st_oof: 'Fuera de la oficina',
    pp_set_online: 'Disponible', pp_set_busy: 'Ocupado', pp_set_dnd: 'No molestar', pp_set_brb: 'Vuelvo enseguida', pp_set_away: 'Aparecer como ausente', pp_set_invisible: 'Aparecer desconectado', pp_reset: 'Restablecer estado', pp_duration: 'Duración',
    pp_statusMsg: 'Establecer mensaje de estado', pp_statusMsgTitle: 'Mensaje de estado', pp_showWhenMsg: 'Mostrar cuando me envíen mensajes', pp_clearAfter: 'Borrar el mensaje de estado después de', pp_workLoc: 'Lugar de trabajo', pp_wlOffice: 'En la oficina', pp_wlRemote: 'En remoto',
    pp_oof: 'Programar fuera de la oficina', pp_oofTitle: 'Fuera de la oficina', pp_editProfile: 'Editar perfil', pp_jobTitle: 'Puesto', pp_department: 'Departamento', pp_reportsTo: 'Depende de', pp_privacy: 'Privacidad', pp_block: 'Bloquear', pp_unblock: 'Desbloquear',
    pp_priorityAccess: 'Acceso prioritario', pp_blockedPeople: 'Personas bloqueadas', pp_autoReply: 'Respuesta automática', pp_show: 'Mostrar', pp_dismiss: 'Descartar',
  });

  const PP = (LC.people = LC.people || {});
  const fail = (e) => LC.toast(e.message || String(e));
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  const field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  const check = (label, checked, onchange) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!checked, onchange }), el('span', { text: label }));
  const sel = (opts, value, label, onchange) => { const s = el('select', { 'aria-label': label, onchange }, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = String(value); return s; };
  const others = () => [...S.users.values()].filter((u) => S.me && u.id !== S.me.id && !u.removed && !u.deleted).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id)));
  PP.others = others;

  // ---------- presence look ----------
  const ST_KEY = { online: 'pp_st_online', busy: 'pp_st_busy', dnd: 'pp_st_dnd', brb: 'pp_st_brb', away: 'pp_st_away', offline: 'pp_st_offline', invisible: 'pp_st_invisible', call: 'pp_st_call', meeting: 'pp_st_meeting', presenting: 'pp_st_presenting', oof: 'pp_st_oof' };
  Object.assign(LC.PRES_ICON, { online: 'presence_available', busy: 'presence_busy', dnd: 'presence_dnd', brb: 'presence_away', away: 'presence_away', call: 'presence_busy', meeting: 'presence_busy', presenting: 'presence_dnd', oof: 'presence_oof', offline: 'presence_offline', invisible: 'presence_offline' });
  LC.presenceLabel = (p) => t(ST_KEY[p] || 'pp_st_offline');
  // every picture of a person carries data-uid, so the contact card can open from it anywhere (messages, lists, meetings)
  const avatar0 = LC.avatar;
  LC.avatar = (u, cls, dot) => { const n = avatar0(u, cls, dot); if (u && u.id) n.dataset.uid = u.id; return n; };
  const MANUAL = ['online', 'busy', 'dnd', 'brb', 'away', 'invisible'];
  PP.choices = () => [['auto', t('pp_set_auto')], ...MANUAL.map((s) => [s, t('pp_set_' + s)])]; // used by Settings › Profile "Status"
  PP.stateIcon = (s) => LC.icon(LC.PRES_ICON[s === 'auto' ? 'online' : s] || 'presence_offline', { cls: 'p-' + s });

  // ---------- time helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  PP.toInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  PP.endOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  PP.endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return PP.endOfDay(d); };
  PP.until = (k, custom) => ({ '30m': Date.now() + 1800e3, '1h': Date.now() + 3600e3, '2h': Date.now() + 7200e3, '4h': Date.now() + 14400e3, today: PP.endOfDay(), week: PP.endOfWeek(), custom: custom ? new Date(custom).getTime() || 0 : 0 }[k] || 0);
  PP.when = (ts) => { const d = new Date(ts), n = new Date(); return d.toDateString() === n.toDateString() ? LC.fmtTime(ts) : d.toLocaleString(lang(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  PP.whenDay = (ts) => new Date(ts).toLocaleDateString(lang(), { weekday: 'short', month: 'short', day: 'numeric' });
  const durationSelect = (label, withNever) => sel([...(withNever ? [['never', t('pp_dNever')]] : []), ['30m', t('pp_d30m')], ['1h', t('pp_d1h')], ['2h', t('pp_d2h')], ...(withNever ? [['4h', t('pp_d4h')]] : []), ['today', t('pp_dToday')], ['week', t('pp_dWeek')], ['custom', t('pp_dCustom')]], withNever ? 'never' : '1h', label);

  // ---------- server calls ----------
  PP.setPresence = (state, until) => LC.api('/api/presence', { state, until: until || 0 }).catch(fail);
  PP.savePrefs = (patch) => LC.api('/api/people/prefs', patch).then((r) => { if (S.me && r.prefs) S.me.prefs = r.prefs; return r; }).catch((e) => { fail(e); throw e; });
  PP.isBlocked = (id) => !!id && (LC.prefs().blocked || []).includes(id);
  PP.hasPriority = (id) => !!id && (LC.prefs().priority || []).includes(id);
  PP.block = async (id) => { if (!(await LC.confirm(t('pp_confirmBlock', { name: LC.uname(id) }), { danger: true, ok: t('pp_block') }))) return; return PP.savePrefs({ blocked: [...new Set([...(LC.prefs().blocked || []), id])] }); };
  PP.unblock = (id) => PP.savePrefs({ blocked: (LC.prefs().blocked || []).filter((x) => x !== id) });
  PP.togglePriority = (id) => PP.savePrefs({ priority: PP.hasPriority(id) ? (LC.prefs().priority || []).filter((x) => x !== id) : [...(LC.prefs().priority || []), id] });
  PP.voiceUrl = (u) => `/api/people/voice?id=${encodeURIComponent(u.id)}&v=${u.voice}&token=${encodeURIComponent(S.token)}`;
  let player = null;
  PP.playName = (u) => { if (!u || !u.voice) return; try { if (player) player.pause(); player = new Audio(PP.voiceUrl(u)); player.play().catch(() => LC.toast(t('pp_noRec'))); } catch {} };
  PP.statusLine = (u) => { // "Busy · until 4:30 PM" for your own status
    const set = u.presenceSet || 'auto', label = LC.presenceLabel(u.presence === 'invisible' ? 'invisible' : u.presence);
    return set !== 'auto' && u.presenceUntil ? label + ' · ' + t('pp_until', { when: PP.when(u.presenceUntil) }) : label;
  };

  // ---------- popover (status panel, contact card) ----------
  let pop = null; // { box, anchor, o }
  PP.popOpen = () => (pop ? { box: pop.box, o: pop.o, anchor: pop.anchor } : null);
  PP.closePop = (restore) => { if (!pop) return; const p = pop; pop = null; p.box.remove(); if (p.o.onClose) p.o.onClose(); if (restore && p.anchor && p.anchor.focus && document.contains(p.anchor)) p.anchor.focus({ preventScroll: true }); };
  PP.place = (box, anchor, o = {}) => {
    if (innerWidth <= 700) { box.classList.add('sheet'); return; }
    box.classList.remove('sheet'); const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: 60, bottom: 60 };
    const w = box.offsetWidth, h = box.offsetHeight;
    let left = o.align === 'right' ? r.right - w : o.side ? r.right + 8 : r.left, top = o.side ? r.top - 20 : r.bottom + 6;
    if (o.side && left + w > innerWidth - 8) left = r.left - w - 8;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    if (top + h > innerHeight - 8) top = o.side ? innerHeight - h - 8 : r.top - h - 6;
    box.style.left = left + 'px'; box.style.top = Math.max(8, top) + 'px';
  };
  PP.pop = (anchor, content, o = {}) => {
    PP.closePop();
    const box = el('div', { class: 'pp-pop ' + (o.cls || ''), role: 'dialog', 'aria-label': o.label || '', tabindex: '-1' }, content);
    document.body.append(box); pop = { box, anchor, o }; PP.place(box, anchor, o);
    if (o.focus !== false) { const f = box.querySelector(o.focusSel || 'button:not([disabled]), [href], input, select, textarea'); (f || box).focus({ preventScroll: true }); }
    return box;
  };
  document.addEventListener('mousedown', (e) => { if (pop && !pop.box.contains(e.target) && !(pop.anchor && pop.anchor.contains && pop.anchor.contains(e.target)) && !e.target.closest('#menu, .modal.top')) PP.closePop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop && $('#menu').classList.contains('hidden') && !$('.modal.top')) { e.stopPropagation(); e.preventDefault(); PP.closePop(true); } }, true);
  window.addEventListener('resize', () => { if (pop) PP.place(pop.box, pop.anchor, pop.o); });

  // ---------- the status panel under your picture ----------
  function statusPanel(anchor) {
    let showStates = false, showWork = false;
    const close = () => PP.closePop(true), act = (fn) => () => { PP.closePop(); fn(); };
    const row = (icon, label, fn, o = {}) => el('button', { type: 'button', class: 'pp-row' + (o.cls ? ' ' + o.cls : ''), onclick: fn, 'aria-expanded': o.expanded === undefined ? null : String(o.expanded), 'aria-pressed': o.pressed === undefined ? null : String(o.pressed) },
      el('span', { class: 'pp-ri' }, typeof icon === 'string' ? LC.icon(icon) : icon), el('span', { class: 'pp-rl' }, el('span', { text: label }), o.sub ? el('span', { class: 'pp-rs', text: o.sub }) : null), o.chev ? LC.icon(o.chev, { cls: 'pp-chev' }) : o.pressed ? LC.icon('checkmark', { cls: 'pp-chev' }) : null);
    const draw = () => {
      const me = S.me; if (!me) return close(); const set = me.presenceSet || 'auto', wl = me.workLoc, oof = me.oofSettings;
      const body = [el('div', { class: 'pp-mehead' }, LC.avatar(me, 'lg', true), el('div', { class: 'pp-meid' }, el('b', { text: me.name }), me.jobTitle ? el('span', { class: 'muted small', text: me.jobTitle }) : null, me.statusText ? el('span', { class: 'pp-memsg small', text: (me.statusEmoji ? me.statusEmoji + ' ' : '') + me.statusText }) : null)),
        row(PP.stateIcon(me.presence === 'invisible' ? 'invisible' : me.presence), PP.statusLine(me), () => { showStates = !showStates; draw(); }, { chev: showStates ? 'chevron_up' : 'chevron_down', expanded: showStates, cls: 'pp-cur' })];
      if (showStates) body.push(el('div', { class: 'pp-sub', role: 'group', 'aria-label': t('pp_changeStatus') }, ...MANUAL.map((s) => row(PP.stateIcon(s), t('pp_set_' + s), act(() => PP.setPresence(s)), { pressed: set === s })),
        row('timer', t('pp_duration'), act(durationDialog)), row('arrow_reset', t('pp_reset'), act(() => PP.setPresence('auto')))));
      body.push(el('hr'), row('edit', me.statusText ? t('pp_statusMsgTitle') : t('pp_statusMsg'), act(statusDialog), { sub: me.statusText ? (me.statusEmoji ? me.statusEmoji + ' ' : '') + me.statusText + (me.statusUntil ? ' · ' + t('pp_until', { when: PP.when(me.statusUntil) }) : '') : '' }),
        row(wl && wl.kind === 'office' ? 'building' : wl ? 'home' : 'location', t('pp_workLoc'), () => { showWork = !showWork; draw(); }, { sub: wl ? (wl.kind === 'custom' ? wl.text : t(wl.kind === 'office' ? 'pp_wlOffice' : 'pp_wlRemote')) : t('pp_wlNone'), chev: showWork ? 'chevron_up' : 'chevron_down', expanded: showWork }));
      if (showWork) body.push(el('div', { class: 'pp-sub', role: 'group', 'aria-label': t('pp_workLoc') },
        row('building', t('pp_wlOffice'), act(() => setWork('office')), { pressed: !!wl && wl.kind === 'office' }), row('home', t('pp_wlRemote'), act(() => setWork('remote')), { pressed: !!wl && wl.kind === 'remote' }),
        row('location', t('pp_wlCustom'), act(async () => { const v = await LC.prompt(t('pp_wlPrompt'), { value: wl && wl.kind === 'custom' ? wl.text : '', max: 60 }); if (v && v.trim()) setWork('custom', v.trim()); }), { pressed: !!wl && wl.kind === 'custom' }),
        wl ? row('dismiss', t('pp_wlClear'), act(() => setWork(''))) : null));
      body.push(row('airplane_take_off', t('pp_oof'), act(oofDialog), { sub: oof && oof.on ? (me.oof ? (oof.to ? t('pp_oofUntil', { when: PP.whenDay(oof.to) }) : t('pp_oofIsOn')) : oof.from ? t('pp_oofFrom', { when: PP.whenDay(oof.from) }) : t('pp_oofIsOn')) : '' }),
        el('hr'), row('person_edit', t('pp_editProfile'), act(() => LC.settingsPanel('profile'))), row('settings', t('settings'), act(() => LC.settingsPanel())),
        ...LC.extItems(LC.ext.profileMenu).filter((x) => x && x !== 'sep').map((it) => row(it.icon || 'circle', it.label, act(() => it.fn && it.fn()), { cls: it.danger ? 'danger' : '' })),
        row('sign_out', t('signOut'), act(async () => { if (await LC.confirm(t('confirmSignOut'))) LC.signOut('manual'); })));
      const focusIdx = box && box.contains(document.activeElement) ? [...box.querySelectorAll('button')].indexOf(document.activeElement) : -1;
      box.replaceChildren(...body.filter(Boolean)); PP.place(box, anchor, { align: 'right' });
      if (focusIdx >= 0) { const b = box.querySelectorAll('button')[focusIdx]; if (b) b.focus(); }
    };
    const box = PP.pop(anchor, [], { cls: 'pp-me', label: t('pp_myStatus'), align: 'right', focus: false }); draw();
    const cur = box.querySelector('.pp-cur'); if (cur) cur.focus();
    box.addEventListener('keydown', (e) => { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const bs = [...box.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); e.preventDefault(); });
    panelRedraw = () => { if (pop && pop.box === box) draw(); };
  }
  let panelRedraw = null;
  LC.on('me', () => panelRedraw && panelRedraw()); LC.on('user', (u) => { if (panelRedraw && S.me && u.id === S.me.id) panelRedraw(); });
  LC.profileMenu = statusPanel; // the picture in the top bar
  const setWork = (kind, text) => LC.api('/api/people/worklocation', { kind, text: text || '' }).catch(fail);

  // ---------- dialogs ----------
  function durationDialog() {
    const set = (S.me && S.me.presenceSet) || 'auto', st = sel(MANUAL.map((s) => [s, t('pp_set_' + s)]), set === 'auto' ? 'busy' : set, t('pp_status')), dur = durationSelect(t('pp_resetAfter'), false);
    const when = el('input', { type: 'datetime-local', 'aria-label': t('pp_pickTime'), value: PP.toInput(Date.now() + 3600e3) }), whenF = field(t('pp_pickTime'), when); whenF.classList.add('hidden');
    dur.addEventListener('change', () => whenF.classList.toggle('hidden', dur.value !== 'custom'));
    LC.modal([el('h2', {}, LC.icon('timer'), ' ' + t('pp_durationTitle')), field(t('pp_status'), st), field(t('pp_resetAfter'), dur), whenF,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('pp_done'), onclick: async () => {
        const until = PP.until(dur.value, when.value); if (!until || until < Date.now() + 30000) return LC.toast(t('pickFuture'));
        LC.closeModal(); PP.setPresence(st.value, until);
      } }))], { label: t('pp_durationTitle') });
  }
  const EMO = ['📅', '🏠', '🚗', '🤒', '🌴', '🎧', '🍔', '✈️', '🎉', '💬'];
  function statusDialog() {
    const me = S.me; let emoji = me.statusEmoji || '';
    const text = el('textarea', { rows: 3, maxlength: 280, placeholder: t('pp_statusMsgPh'), 'aria-label': t('pp_statusMsgTitle') }); text.value = me.statusText || '';
    const count = el('span', { class: 'muted small pp-count', 'aria-live': 'polite', text: t('pp_chars', { n: text.value.length }) }); text.addEventListener('input', () => { count.textContent = t('pp_chars', { n: text.value.length }); });
    const show = el('input', { type: 'checkbox', checked: !!me.statusShowSet }), clear = durationSelect(t('pp_clearAfter'), true);
    const when = el('input', { type: 'datetime-local', 'aria-label': t('pp_pickTime'), value: PP.toInput(me.statusUntil || Date.now() + 86400e3) }), whenF = field(t('pp_pickTime'), when);
    if (me.statusUntil) clear.value = 'custom'; whenF.classList.toggle('hidden', clear.value !== 'custom'); clear.addEventListener('change', () => whenF.classList.toggle('hidden', clear.value !== 'custom'));
    const emos = el('div', { class: 'pp-emos', role: 'group', 'aria-label': t('pp_emojiQuick') });
    const drawEmo = () => emos.replaceChildren(el('button', { type: 'button', class: 'pp-emo' + (!emoji ? ' on' : ''), 'aria-pressed': String(!emoji), title: t('pp_noEmoji'), 'aria-label': t('pp_noEmoji'), onclick: () => { emoji = ''; drawEmo(); } }, LC.icon('dismiss')),
      ...[...new Set([...(emoji && !EMO.includes(emoji) ? [emoji] : []), ...EMO])].map((e) => el('button', { type: 'button', class: 'pp-emo' + (emoji === e ? ' on' : ''), 'aria-pressed': String(emoji === e), 'aria-label': e, text: e, onclick: () => { emoji = e; drawEmo(); } })));
    drawEmo();
    const save = (clearAll) => { const until = clearAll ? 0 : clear.value === 'never' ? 0 : PP.until(clear.value, when.value); if (!clearAll && clear.value !== 'never' && until < Date.now() + 30000) return LC.toast(t('pickFuture')); LC.closeModal(); LC.api('/api/people/status', clearAll ? { text: '', emoji: '', until: 0 } : { text: text.value, emoji, show: show.checked, until }).catch(fail); };
    LC.modal([el('h2', {}, LC.icon('edit'), ' ' + t('pp_statusMsgTitle')), emos, text, count, el('label', { class: 'check' }, show, el('span', { text: t('pp_showWhenMsg') })), field(t('pp_clearAfter'), clear), whenF,
      el('button', { type: 'button', class: 'link pp-linkbtn', text: t('pp_oof'), onclick: () => { LC.closeModal(); oofDialog(); } }),
      el('div', { class: 'acts' }, me.statusText ? el('button', { class: 'secondary', text: t('pp_clearMsg'), onclick: () => save(true) }) : null, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('pp_done'), onclick: () => save(false) }))], { label: t('pp_statusMsgTitle') });
  }
  function oofDialog() {
    const o = (S.me && S.me.oofSettings) || {}, on = el('input', { type: 'checkbox', checked: !!o.on }), msg = el('textarea', { rows: 4, maxlength: 1000, placeholder: t('pp_oofMsgPh'), 'aria-label': t('pp_oofMsg') }); msg.value = o.message || '';
    const period = el('input', { type: 'checkbox', checked: !!(o.from || o.to) }), from = el('input', { type: 'datetime-local', value: PP.toInput(o.from || Date.now()), 'aria-label': t('pp_oofStart') }), to = el('input', { type: 'datetime-local', value: PP.toInput(o.to || PP.endOfDay(new Date(Date.now() + 86400e3))), 'aria-label': t('pp_oofEnd') });
    const reply = el('input', { type: 'checkbox', checked: o.reply !== undefined ? !!o.reply : true }), times = el('div', { class: 'rowline pp-times' }, field(t('pp_oofStart'), from), field(t('pp_oofEnd'), to));
    const sync = () => { times.classList.toggle('hidden', !period.checked); for (const x of [msg, period, from, to, reply]) x.disabled = !on.checked; }; on.addEventListener('change', sync); period.addEventListener('change', sync); sync();
    LC.modal([el('h2', {}, LC.icon('airplane_take_off'), ' ' + t('pp_oofTitle')), el('p', { class: 'muted small', text: t('pp_oofHelp') }), el('label', { class: 'check' }, on, el('span', { text: t('pp_oofOn') })),
      field(t('pp_oofMsg'), msg), el('label', { class: 'check' }, reply, el('span', { text: t('pp_oofReply') })), el('label', { class: 'check' }, period, el('span', { text: t('pp_oofPeriod') })), times,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('save'), onclick: async () => {
        const f = period.checked ? new Date(from.value).getTime() || 0 : 0, e = period.checked ? new Date(to.value).getTime() || 0 : 0; if (period.checked && e && f && e <= f) return LC.toast(t('pp_oofNeedsEnd'));
        try { await LC.api('/api/people/oof', { on: on.checked, message: msg.value, from: f, to: e, reply: reply.checked }); LC.closeModal(); LC.toast(t('saved'), { ms: 1500 }); } catch (x) { fail(x); }
      } }))], { label: t('pp_oofTitle') });
  }
  Object.assign(PP, { statusDialog, oofDialog, durationDialog, statusPanel });

  // ---------- strip above the message box: the person you write to is away / busy / has a status message ----------
  const dismissed = new Set();
  LC.ext.composerBanner.push((chan) => {
    if (!S.me || !chan || !chan.startsWith('dm:')) return null;
    const id = LC.peerOf(chan), u = S.users.get(id); if (!u || id === S.me.id || u.deleted) return null; const name = LC.uname(id);
    const strip = (icon, text, extra, key) => {
      if (key && dismissed.has(chan + '|' + key)) return null;
      return el('div', { class: 'pp-cbanner', role: 'note' }, el('span', { class: 'pp-cbi' }, icon), el('div', { class: 'pp-cbt' }, el('span', { text }), extra || null),
        key ? LC.ibtn('dismiss', t('pp_dismiss'), () => { dismissed.add(chan + '|' + key); for (const c of Object.values(LC.composers || {})) c.renderBanner && c.renderBanner(); }, { cls: 'icon pp-cbx' }) : null);
    };
    if (PP.isBlocked(id)) return strip(LC.icon('person_prohibited'), t('pp_youBlocked', { name }), el('button', { class: 'link', text: t('pp_unblock'), onclick: () => PP.unblock(id) }));
    if (u.oof) return strip(LC.icon('presence_oof', { cls: 'p-oof' }), u.oof.to ? t('pp_bnOofUntil', { name, when: PP.when(u.oof.to) }) : t('pp_bnOof', { name }), u.oof.message ? el('q', { class: 'pp-cbq', text: u.oof.message }) : null, 'oof:' + (u.oof.message || '') + (u.oof.to || ''));
    if (u.statusShow && u.statusText) return strip(u.statusEmoji ? el('span', { class: 'pp-cbemo', text: u.statusEmoji }) : LC.icon('comment'), t('pp_bnStatus', { name }) + ':', el('q', { class: 'pp-cbq', text: u.statusText }), 'st:' + u.statusText);
    if (u.presence === 'dnd') return strip(LC.icon('presence_dnd', { cls: 'p-dnd' }), t('pp_bnDnd', { name }), null, 'dnd');
    if (u.presence === 'presenting') return strip(LC.icon('presence_dnd', { cls: 'p-dnd' }), t('pp_bnPresenting', { name }), null, 'presenting');
    return null;
  });

  // ---------- blocked people's messages in group chats are folded; automatic replies are labelled ----------
  const shown = new Set(), msgEl0 = LC.msgEl, msgSig0 = LC.msgSig;
  const folded = (m) => !!m && !!m.from && !m.system && !m.deleted && m.chan && !m.chan.startsWith('dm:') && PP.isBlocked(m.from) && !shown.has(m.id);
  LC.msgEl = (m, o = {}) => {
    if (!folded(m)) return msgEl0(m, o);
    const node = el('div', { class: 'msg pp-folded', 'data-id': m.id, 'data-seq': m.seq }, el('div', { class: 'gut' }), el('div', { class: 'bwrap' }, el('div', { class: 'body bubble pp-foldbody' }, LC.icon('person_prohibited'), el('span', { text: t('pp_blockedMsg') }),
      el('button', { class: 'link', text: t('pp_show'), onclick: () => { shown.add(m.id); node.replaceWith(msgEl0(m, o)); } }))));
    return node;
  };
  LC.msgSig = (m, o) => msgSig0(m, o) + (folded(m) ? '|pp-folded' : '');
  let blockedSig = '';
  LC.on('init', () => { blockedSig = (LC.prefs().blocked || []).join(); });
  LC.on('me', () => { const b = (LC.prefs().blocked || []).join(); if (b !== blockedSig) { blockedSig = b; if (S.chan && S.tab === 'chat' && LC.renderMessages) LC.renderMessages('keep'); for (const c of Object.values(LC.composers || {})) c.renderBanner && c.renderBanner(); } });
  LC.ext.msgParts.push((m) => (m.autoReply ? el('div', { class: 'pp-autoreply small' }, LC.icon('presence_oof', { cls: 'p-oof' }), el('span', { text: t('pp_autoReply') })) : null));

  // ---------- going Away after 5 minutes without activity (only when the status is automatic) ----------
  let lastAct = Date.now(), idleSent = false;
  const active = () => { lastAct = Date.now(); if (idleSent) { idleSent = false; LC.api('/api/presence', { idle: false }).catch(() => {}); } };
  for (const ev of ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'wheel', 'focus']) window.addEventListener(ev, active, { passive: true, capture: true });
  PP.idleAfter = 300000;
  setInterval(() => { if (!S.me || !S.token || idleSent || (S.me.presenceSet || 'auto') !== 'auto' || Date.now() - lastAct < PP.idleAfter) return; idleSent = true; LC.api('/api/presence', { idle: true }).catch(() => { idleSent = false; }); }, 15000);
  LC.on('init', () => { idleSent = false; lastAct = Date.now(); });

  // ---------- your time zone is filled in automatically unless you chose one ----------
  PP.myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
  LC.on('init', () => { const tz = PP.myTz(), me = S.me; if (tz && me && !me.tzManual && me.tz !== tz) setTimeout(() => LC.api('/api/people/profile', { tz }).catch(() => {}), 800); });

  // ---------- Settings › Profile: details, reports-to, time zone, name recording ----------
  function profileSection() {
    const me = S.me, inp = (k, max, type, extra) => el('input', { value: me[k] || '', maxlength: max, type: type || 'text', 'aria-label': t('pp_' + k), ...(extra || {}) });
    const f = { jobTitle: inp('jobTitle', 80), department: inp('department', 80), office: inp('office', 80), pronouns: inp('pronouns', 40, 'text', { list: 'ppPronouns' }), email: inp('email', 120, 'email', { autocomplete: 'email' }), phone: inp('phone', 32, 'tel', { autocomplete: 'tel' }) };
    const mgr = sel([['', t('pp_nobody')], ...others().map((u) => [u.id, LC.uname(u.id)])], me.manager || '', t('pp_reportsTo'));
    let zones = []; try { zones = Intl.supportedValuesOf('timeZone'); } catch {} const auto = PP.myTz(); if (me.tz && !zones.includes(me.tz)) zones.unshift(me.tz);
    const tz = sel([['', t('pp_tzAuto', { tz: auto || 'UTC' })], ...zones.map((z) => [z, z.replace(/_/g, ' ')])], me.tzManual ? me.tz || '' : '', t('pp_timeZone'));
    const save = async () => {
      const b = { manager: mgr.value, tz: tz.value || auto, tzManual: !!tz.value }; for (const [k, n] of Object.entries(f)) b[k] = n.value;
      try { await LC.api('/api/people/profile', b); LC.toast(t('saved'), { ms: 1500 }); } catch (e) { fail(e); }
    };
    return el('div', { class: 'pp-settings' }, el('h3', {}, LC.icon('contact_card'), ' ' + t('pp_aboutMe')), el('p', { class: 'muted small', text: t('pp_detailsHelp') }),
      el('div', { class: 'pp-grid' }, field(t('pp_jobTitle'), f.jobTitle), field(t('pp_department'), f.department), field(t('pp_office'), f.office), field(t('pp_pronouns'), f.pronouns), field(t('pp_email'), f.email), field(t('pp_phone'), f.phone), field(t('pp_reportsTo'), mgr), field(t('pp_timeZone'), tz)),
      el('datalist', { id: 'ppPronouns' }, ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'].map((v) => el('option', { value: v }))),
      el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('pp_saveDetails'), onclick: save })), recorderBlock());
  }
  function recorderBlock() {
    const me = S.me, state = el('span', { class: 'muted small', 'aria-live': 'polite', text: me.voice ? t('pp_hasRec') : t('pp_noRec') }), box = el('div', { class: 'rowline pp-rec' });
    let rec = null;
    const draw = () => { const v = (S.me || {}).voice; box.replaceChildren(rec ? LC.btn('record_stop', t('pp_stop'), () => rec && rec.stop(), 'secondary') : LC.btn('mic', v ? t('pp_rerecord') : t('pp_record'), start, 'secondary'), v && !rec ? LC.btn('speaker_2', t('pp_play'), () => PP.playName(S.me), 'secondary') : null, v && !rec ? LC.btn('delete', t('pp_delRec'), () => LC.api('/api/people/voice/delete', {}).then(() => { S.me.voice = 0; state.textContent = t('pp_noRec'); draw(); }).catch(fail), 'secondary') : null, state); };
    async function start() {
      if (!LC.canRecord()) return LC.needSecure();
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return LC.toast(t('micDenied')); }
      const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((x) => MediaRecorder.isTypeSupported(x));
      const r = new MediaRecorder(stream, { ...(mt ? { mimeType: mt } : {}), audioBitsPerSecond: 32000 }), chunks = [], t0 = Date.now();
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const tick = setInterval(() => { const s = Math.min(10, Math.floor((Date.now() - t0) / 1000)); state.textContent = t('pp_recording', { s }); if (Date.now() - t0 >= 10000 && r.state !== 'inactive') r.stop(); }, 200);
      r.onstop = async () => {
        clearInterval(tick); stream.getTracks().forEach((x) => x.stop()); rec = null; const type = (r.mimeType || mt || 'audio/webm').split(';')[0], blob = new Blob(chunks, { type });
        try { const res = await fetch('/api/people/voice', { method: 'POST', headers: { 'x-token': S.token, 'content-type': type }, body: blob }), d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || res.statusText); S.me.voice = d.voice; state.textContent = t('pp_recSaved'); } catch (e) { fail(e); state.textContent = t('pp_noRec'); }
        draw();
      };
      rec = { stop: () => { if (r.state !== 'inactive') r.stop(); } }; r.start(250); draw();
    }
    draw(); return el('div', {}, el('h3', {}, LC.icon('speaker_2'), ' ' + t('pp_namePron')), el('p', { class: 'muted small', text: t('pp_recHint') }), box);
  }
  LC.ext.settingsSections.push({ tab: 'profile', order: 10, render: profileSection });

  // ---------- Settings › Privacy: blocked people and priority access ----------
  function personList(ids, empty, button) {
    const list = ids.map((id) => S.users.get(id)).filter(Boolean);
    if (!list.length) return el('p', { class: 'muted small', text: empty });
    return el('ul', { class: 'pp-plist' }, list.map((u) => el('li', { class: 'rowline' }, LC.avatar(u, 'sm', true), el('span', { class: 'grow', text: LC.uname(u.id) }), button(u))));
  }
  function adder(label, exclude, action, cls) {
    const pick = sel([['', label], ...others().filter((u) => !exclude.includes(u.id)).map((u) => [u.id, LC.uname(u.id)])], '', label);
    return el('div', { class: 'rowline' }, pick, el('button', { class: 'secondary sm ' + (cls || ''), text: cls ? t('pp_block') : t('pp_add'), onclick: () => pick.value && action(pick.value) }));
  }
  function privacyTab() {
    const p = LC.prefs(), blocked = p.blocked || [], prio = p.priority || [], again = () => LC.settingsPanel('privacy');
    return el('div', { class: 'pp-settings' },
      el('h3', {}, LC.icon('person_prohibited'), ' ' + t('pp_blockedPeople')), el('p', { class: 'muted small', text: t('pp_blockHelp') }),
      personList(blocked, t('pp_noBlocked'), (u) => el('button', { class: 'secondary sm', text: t('pp_unblock'), onclick: () => PP.unblock(u.id).then(again) })),
      adder(t('pp_blockWho'), blocked, (id) => PP.block(id).then(again), 'danger'),
      el('h3', {}, LC.icon('person_star'), ' ' + t('pp_priorityAccess')), el('p', { class: 'muted small', text: t('pp_priorityHelp') }),
      personList(prio, t('pp_noPriority'), (u) => el('button', { class: 'secondary sm', text: t('pp_remove'), onclick: () => PP.togglePriority(u.id).then(again) })),
      adder(t('pp_addWho'), prio, (id) => PP.togglePriority(id).then(again)));
  }
  LC.ext.settingsTabs.push({ key: 'privacy', icon: 'shield_lock', label: () => t('pp_privacy'), order: 60, render: privacyTab });
})();
