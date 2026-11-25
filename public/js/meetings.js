'use strict';
// Meetings (sections 18, 21, 23): scheduling, invitations + RSVP, meeting link / ID + passcode, before-you-join screen,
// lobby, reminders, join/leave sounds, the Meet pane, meeting chats. Engagement (Q&A, polls, notes, rooms, recap) is in
// meetings-engage.js and webinars (view-only, registration, interpreters) in meetings-webinar.js.
// Public API (docs/EXTENDING.md "Meetings"): LC.meetings.schedule(prefill), .open(id), .join(id) — keep them stable.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addEvents('mt_meeting', 'mt_lobby', 'mt_knock', 'mt_admitted', 'mt_denied', 'mt_reminder', 'mt_qa', 'mt_agenda', 'mt_rooms', 'mt_move', 'mt_announce', 'mt_reg');
  LC.addStrings('en', {
    mt_rail: 'Meet', mt_meetNow: 'Meet now', mt_schedule: 'Schedule a meeting', mt_joinWithId: 'Join with a meeting ID', mt_newMeeting: 'New meeting', mt_editMeeting: 'Edit meeting',
    mt_title: 'Add a title', mt_titleLabel: 'Title', mt_required: 'Required attendees', mt_optional: 'Optional attendees', mt_addOptional: 'Add optional attendees', mt_addPeople: 'Type a name', mt_remove: 'Remove {name}',
    mt_date: 'Date', mt_startTime: 'Start', mt_endTime: 'End', mt_allDay: 'All day', mt_repeat: 'Repeat', mt_rNone: 'Does not repeat', mt_rDaily: 'Every day', mt_rWeekdays: 'Every weekday (Mon–Fri)',
    mt_rWeekly: 'Every week on {day}', mt_rMonthly: 'Every month on day {n}', mt_rCustom: 'Custom…', mt_every: 'Repeat every', mt_unitDay: 'day(s)', mt_unitWeek: 'week(s)', mt_unitMonth: 'month(s)', mt_until: 'Until (optional)',
    mt_where: 'Where', mt_newChat: 'A new meeting chat', mt_location: 'Location (optional)', mt_details: 'Details for the attendees', mt_options: 'Meeting options', mt_lobbyQ: 'Who can bypass the lobby?',
    mt_lEveryone: 'Everyone', mt_lMembers: 'People in this session', mt_lInvited: 'People I invited', mt_lOrganizer: 'Only me', mt_presentQ: 'Who can present?', mt_pEveryone: 'Everyone', mt_pSpecific: 'Specific people', mt_pOrganizer: 'Only me',
    mt_presenters: 'Presenters', mt_chatQ: 'Meeting chat', mt_chatOn: 'On', mt_chatOff: 'Off', mt_chatDuring: 'Only during the meeting', mt_qaOpt: 'Q&A', mt_soundsOpt: 'Play a sound when people join or leave', mt_recordOpt: 'Allow recording',
    mt_viewOnly: 'Attendees can only watch (webinar)', mt_viewOnlyHelp: 'Only presenters can talk, share and use their camera. How many people can watch depends on the presenters’ upload speed (up to {n}).',
    mt_regOn: 'Require registration', mt_regEmail: 'Ask for an email address', mt_regNotes: 'Ask for notes', mt_regQuestion: 'Your own question (optional)', mt_regApprove: 'I approve each registration',
    mt_interp: 'Language interpretation', mt_interpHelp: 'Interpreters speak in their language; listeners pick a language and hear the interpreter at full volume and the original quietly.', mt_addInterp: 'Add interpreter', mt_language: 'Language',
    mt_send: 'Send', mt_sendUpdate: 'Send update', mt_saveTemplate: 'Save as template', mt_template: 'Template', mt_noTemplate: 'No template', mt_templateName: 'Template name', mt_templateSaved: 'Template saved', mt_deleteTemplate: 'Delete template',
    mt_tStandup: 'Stand-up', mt_t1on1: '1:1', mt_tReview: 'Review', mt_tWebinar: 'Webinar', mt_myTemplates: 'My templates', mt_builtIn: 'Built-in',
    mt_scheduled: 'Meeting scheduled', mt_updated: 'Meeting updated', mt_cancelMeeting: 'Cancel meeting', mt_cancelOcc: 'Cancel this occurrence', mt_cancelSeries: 'Cancel the whole series', mt_cancelNote: 'Message for the attendees (optional)', mt_cancelled: 'Cancelled', mt_wasCancelled: 'This meeting was cancelled.',
    mt_join: 'Join', mt_joinNow: 'Join now', mt_copyLink: 'Copy link', mt_linkCopied: 'Meeting link copied', mt_copyInfo: 'Copy join info', mt_meetingId: 'Meeting ID', mt_passcode: 'Passcode', mt_link: 'Meeting link', mt_openChat: 'Open the meeting chat',
    mt_accept: 'Accept', mt_tentative: 'Tentative', mt_decline: 'Decline', mt_rsvpYes: 'Accepted', mt_rsvpMaybe: 'Tentative', mt_rsvpNo: 'Declined', mt_rsvpNone: 'No response', mt_tracking: 'Tracking', mt_organizer: 'Organizer', mt_presenter: 'Presenter', mt_attendee: 'Attendee',
    mt_responses: '{yes} accepted · {maybe} tentative · {no} declined · {none} no response', mt_youOrganize: "You're the organizer", mt_byOrganizer: 'Organizer: {name}', mt_attendees: 'Attendees', mt_sessions: 'Past meetings', mt_attendance: 'Attendance', mt_recap: 'Recap',
    mt_live: 'In progress', mt_startsIn: 'Starts in {n} min', mt_now: 'Now', mt_today: 'Today', mt_upcoming: 'Upcoming', mt_recent: 'Recent meetings', mt_noUpcoming: 'No meetings coming up. Schedule one, or meet right now.', mt_noRecent: 'Meetings you join show up here with their recap.',
    mt_prejoinHelp: 'Choose your video and audio options', mt_camOff: 'Your camera is turned off', mt_camera: 'Camera', mt_mic: 'Microphone', mt_speaker: 'Speaker', mt_effects: 'Background effects', mt_computerAudio: 'Computer audio', mt_noAudio: "Don't use audio",
    mt_companion: 'Companion mode', mt_companionHelp: 'Join on a second device without audio, e.g. to show your phone camera or follow the chat.', mt_addDevice: 'Add a device', mt_addDeviceHelp: 'Scan this with your phone to join this meeting there as a companion device. The code signs your phone in as you, works once and expires in 2 minutes.',
    mt_noMedia: 'Camera and microphone are not available here.', mt_lobbyWait: 'Someone in the meeting will let you in soon', mt_lobbyHelp: 'Please wait. The organizer or a presenter is admitting people.', mt_leaveLobby: 'Leave',
    mt_denied: 'Sorry, you were not let into the meeting.', mt_admitted: 'You were let in.', mt_lobbyTitle: 'Lobby', mt_waitingN: '{n} people waiting in the lobby', mt_waiting1: '{name} is waiting in the lobby', mt_admit: 'Admit', mt_admitAll: 'Admit all', mt_deny: 'Deny', mt_viewLobby: 'View lobby',
    mt_knock: '{name} is waiting in the lobby of “{title}”', mt_guestPill: 'Guest', mt_invitedPill: 'Invited',
    mt_soon: '“{title}” starts in {n} min', mt_starting: 'Meeting is starting', mt_dismiss: 'Dismiss', mt_reminderTitle: 'Meeting reminder',
    mt_settings: 'Meetings', mt_setPrejoin: 'Show the “before you join” screen', mt_setPrejoinMeetings: 'For meetings', mt_setPrejoinAll: 'For every call', mt_setSounds: 'Play a sound when people join or leave a meeting', mt_setRing: 'Ring when a meeting I accepted starts', mt_setReminders: 'Remind me 15 minutes before a meeting',
    mt_reqMeeting: 'Wants to join the meeting “{title}”', mt_reqSection: 'Joining for a meeting', mt_reqToast: '{name} wants to join for the meeting “{title}”', mt_guestNote: "You're joining a meeting. Once the host lets you in, you'll go straight to it.",
    mt_details2: 'Details', mt_qaTab: 'Q&A', mt_inviteCard: 'Meeting invitation', mt_updateCard: 'Meeting updated', mt_cancelCard: 'Meeting cancelled', mt_occCancelled: 'This occurrence was cancelled: {when}', mt_viewDetails: 'View details',
    mt_meet: 'Meet', mt_scheduleWith: 'Schedule a meeting', mt_meetingIn: 'Meeting in {name}', mt_alreadyIn: "You're already in a call.", mt_needTitle: 'Give the meeting a title.', mt_needTime: 'Pick when the meeting starts and ends.',
    mt_cantJoinYet: 'This meeting is not available.', mt_joinIdHelp: 'Type the meeting ID and the passcode from the invitation.', mt_notFound: 'That meeting was not found.', mt_role: 'Role: {role}', mt_webinar: 'Webinar', mt_repeatSeries: 'Series',
    mt_regLink: 'Registration link', mt_registrations: 'Registrations', mt_regPending: '{n} waiting for approval', mt_meetingChat: 'Meeting chat', mt_inMeeting: 'In a meeting', mt_edit: 'Edit', mt_seriesNote: 'Changes apply to the whole series.',
    mt_dayNames: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat', mt_minutes: '{n} min', mt_hours: '{h} h {m} min', mt_close: 'Close', mt_open: 'Open',
  });
  LC.addStrings('hi', {
    mt_rail: 'मीट', mt_meetNow: 'अभी मीटिंग करें', mt_schedule: 'मीटिंग शेड्यूल करें', mt_joinWithId: 'मीटिंग ID से जुड़ें', mt_newMeeting: 'नई मीटिंग', mt_join: 'जुड़ें', mt_joinNow: 'अभी जुड़ें', mt_accept: 'स्वीकार करें', mt_tentative: 'शायद', mt_decline: 'अस्वीकार करें',
    mt_copyLink: 'लिंक कॉपी करें', mt_meetingId: 'मीटिंग ID', mt_passcode: 'पासकोड', mt_lobbyWait: 'मीटिंग में कोई आपको जल्द ही अंदर आने देगा', mt_leaveLobby: 'छोड़ें', mt_admit: 'अंदर आने दें', mt_admitAll: 'सबको अंदर आने दें', mt_deny: 'मना करें',
    mt_starting: 'मीटिंग शुरू हो रही है', mt_dismiss: 'खारिज करें', mt_prejoinHelp: 'अपने वीडियो और ऑडियो विकल्प चुनें', mt_camOff: 'आपका कैमरा बंद है', mt_send: 'भेजें', mt_titleLabel: 'शीर्षक', mt_details2: 'विवरण', mt_recap: 'सारांश', mt_upcoming: 'आने वाली', mt_today: 'आज', mt_settings: 'मीटिंग',
  });
  LC.addStrings('es', {
    mt_rail: 'Reunirse', mt_meetNow: 'Reunirse ahora', mt_schedule: 'Programar una reunión', mt_joinWithId: 'Unirse con un id. de reunión', mt_newMeeting: 'Nueva reunión', mt_join: 'Unirse', mt_joinNow: 'Unirse ahora', mt_accept: 'Aceptar', mt_tentative: 'Provisional', mt_decline: 'Rechazar',
    mt_copyLink: 'Copiar vínculo', mt_meetingId: 'Id. de reunión', mt_passcode: 'Código de acceso', mt_lobbyWait: 'Alguien de la reunión te dejará entrar pronto', mt_leaveLobby: 'Salir', mt_admit: 'Admitir', mt_admitAll: 'Admitir a todos', mt_deny: 'Denegar',
    mt_starting: 'La reunión está empezando', mt_dismiss: 'Descartar', mt_prejoinHelp: 'Elige tus opciones de vídeo y audio', mt_camOff: 'La cámara está apagada', mt_send: 'Enviar', mt_titleLabel: 'Título', mt_details2: 'Detalles', mt_recap: 'Resumen', mt_upcoming: 'Próximas', mt_today: 'Hoy', mt_settings: 'Reuniones',
  });

  // ---------- shared state + helpers (also used by meetings-engage.js and meetings-webinar.js) ----------
  const MT = (LC.mt = { cache: new Map(), upcoming: [], lobby: new Map(), reqs: {}, cards: new Map(), info: null });
  const DAY = 86400000, MIN = 60000;
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  const pad = (n) => String(n).padStart(2, '0');
  const dayNames = () => t('mt_dayNames').split(',');
  MT.fmtDay = (ts) => new Date(ts).toLocaleDateString(lang(), { weekday: 'short', month: 'short', day: 'numeric' });
  MT.fmtRange = (s, e, allDay) => { if (allDay) return MT.fmtDay(s) + ' · ' + t('mt_allDay'); const same = new Date(s).toDateString() === new Date(e - 1).toDateString(); return `${MT.fmtDay(s)} · ${LC.fmtTime(s)} – ${same ? '' : MT.fmtDay(e) + ' '}${LC.fmtTime(e)}`; };
  MT.dur = (ms) => { const m = Math.round(ms / MIN); return m < 60 ? t('mt_minutes', { n: m }) : t('mt_hours', { h: Math.floor(m / 60), m: m % 60 }); };
  MT.repeatText = (r, start) => {
    if (!r) return ''; const d = new Date(start), days = dayNames();
    let s = r.freq === 'daily' ? (r.interval > 1 ? `${t('mt_every')} ${r.interval} ${t('mt_unitDay')}` : t('mt_rDaily'))
      : r.freq === 'weekly' ? ((r.days || []).join() === '1,2,3,4,5' && r.interval === 1 ? t('mt_rWeekdays') : (r.interval > 1 ? `${t('mt_every')} ${r.interval} ${t('mt_unitWeek')}: ` : '') + (r.interval > 1 ? (r.days && r.days.length ? r.days : [d.getDay()]).map((x) => days[x]).join(', ') : t('mt_rWeekly', { day: (r.days && r.days.length ? r.days : [d.getDay()]).map((x) => days[x]).join(', ') })))
        : r.interval > 1 ? `${t('mt_every')} ${r.interval} ${t('mt_unitMonth')}` : t('mt_rMonthly', { n: d.getDate() });
    if (r.until) s += ' · ' + t('mt_until').replace(/\s*\(.*\)/, '') + ' ' + new Date(r.until).toLocaleDateString(lang());
    return s;
  };
  MT.fmtCode = (c) => String(c || '').replace(/(\d{3})(?=\d)/g, '$1 ');
  MT.base = async () => { // the address other people use: a LAN address when this page runs on the host itself
    if (!/^(localhost|127\.|\[?::1)/.test(location.hostname)) return location.origin;
    try { MT.info ||= await LC.api('/api/info'); const u = MT.info.urls && MT.info.urls[0]; if (u) return (MT.info.https && u.secureUrl) || u.url; } catch {}
    return location.origin;
  };
  MT.link = async (id) => (await MT.base()) + '/#meet=' + id;
  const inflight = new Map();
  MT.get = (id, fresh) => {
    if (!fresh && MT.cache.has(id)) return Promise.resolve(MT.cache.get(id)); if (inflight.has(id)) return inflight.get(id);
    const p = LC.api('/api/meetings/get?id=' + encodeURIComponent(id)).then(({ meeting }) => { MT.cache.set(id, meeting); return meeting; }).finally(() => inflight.delete(id));
    inflight.set(id, p); return p;
  };
  MT.call = () => (LC.inCall() ? S.calls[LC.callChan()] || null : null);
  MT.callMeeting = () => { const c = MT.call(); return (c && c.meeting) || null; };
  MT.myRole = () => { const c = MT.call(); return (c && c.roles && c.roles[S.me.id]) || 'attendee'; };
  MT.isOrgOf = (id) => { const m = MT.cache.get(id); return !!m && m.organizer === S.me.id; };
  MT.fail = (e) => LC.toast(e.message || String(e));
  MT.put = (node, ...kids) => node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); // replaceChildren() would print "null"
  const put = MT.put;
  MT.add = (node, ...kids) => node.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  MT.field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  MT.select = (opts, value, label, onchange) => { const s = el('select', { 'aria-label': label, onchange: onchange ? (e) => onchange(e.target.value) : null }, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = String(value); return s; };
  MT.check = (label, checked, onchange) => { const i = el('input', { type: 'checkbox', checked: !!checked, onchange: onchange ? (e) => onchange(e.target.checked) : null }); return { el: el('label', { class: 'check' }, i, el('span', { text: label })), input: i }; };
  const media = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  const toInputDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toInputTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const people = () => [...S.users.values()].filter((u) => !u.removed && !u.deleted);

  // ---------- live updates ----------
  const changed = () => { if (S.pane === 'meet') LC.renderNav(); for (const f of MT.onChange || []) { try { f(); } catch (e) { console.error(e); } } };
  MT.onChange = [];
  LC.on('mt_meeting', (e) => { if (e.gone) MT.cache.delete(e.id); else MT.cache.set(e.id, e.meeting); refreshCards(e.id); refreshUpcoming(); changed(); });
  let upTimer = null;
  const refreshUpcoming = () => { clearTimeout(upTimer); upTimer = setTimeout(loadUpcoming, 250); };
  async function loadUpcoming() { const now = Date.now(); try { const { meetings } = await LC.api(`/api/meetings?from=${now - 12 * 3600000}&to=${now + 21 * DAY}`); MT.upcoming = meetings; changed(); } catch {} }
  LC.on('init', (d) => { MT.cache.clear(); MT.reqs = d.mtReqs || {}; MT.lobby = new Map((d.mtLobby || []).map((l) => [l.meeting, l])); loadUpcoming(); });
  setInterval(() => { if (S.me && S.pane === 'meet') LC.renderNav(); }, 60000);

  // ---------- people picker ----------
  let pid = 0;
  MT.picker = ({ label, selected = [], exclude = () => [], onChange }) => {
    const sel = new Set(selected), id = 'mtp' + ++pid, chips = el('div', { class: 'mt-chips' }), list = el('div', { class: 'mt-sugg hidden', role: 'listbox', id, 'aria-label': label });
    const input = el('input', { type: 'text', placeholder: t('mt_addPeople'), 'aria-label': label, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list' });
    let shown = [], idx = 0;
    const drawChips = () => chips.replaceChildren(...[...sel].map((uid) => el('span', { class: 'mt-chip' }, LC.avatar(S.users.get(uid), 'sm', false), el('span', { text: LC.uname(uid) }), LC.ibtn('dismiss', t('mt_remove', { name: LC.uname(uid) }), () => { sel.delete(uid); drawChips(); onChange && onChange(); input.focus(); }, { cls: 'icon mt-x' }))));
    const close = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const draw = () => {
      const q = input.value.trim().toLowerCase(), ex = new Set(exclude()); shown = people().filter((u) => u.id !== S.me.id && !sel.has(u.id) && !ex.has(u.id) && (!q || u.name.toLowerCase().includes(q) || LC.uname(u.id).toLowerCase().includes(q))).slice(0, 8);
      if (!shown.length || document.activeElement !== input) return close(); idx = Math.min(idx, shown.length - 1);
      list.replaceChildren(...shown.map((u, i) => el('div', { class: 'mt-opt' + (i === idx ? ' on' : ''), role: 'option', id: id + '-' + i, 'aria-selected': String(i === idx), onmousedown: (e) => { e.preventDefault(); pick(i); } }, LC.avatar(u, 'sm', true), el('span', { text: LC.uname(u.id) }))));
      list.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-activedescendant', id + '-' + idx);
    };
    const pick = (i) => { const u = shown[i]; if (!u) return; sel.add(u.id); input.value = ''; idx = 0; drawChips(); close(); onChange && onChange(); };
    input.addEventListener('input', () => { idx = 0; draw(); }); input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!shown.length) return draw(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (!list.classList.contains('hidden') && shown[idx]) { pick(idx); e.preventDefault(); } }
      else if (e.key === 'Escape' && !list.classList.contains('hidden')) { close(); e.stopPropagation(); }
      else if (e.key === 'Backspace' && !input.value && sel.size) { sel.delete([...sel].pop()); drawChips(); onChange && onChange(); }
    });
    drawChips();
    return { el: el('div', { class: 'mt-picker' }, chips, el('div', { class: 'mt-pickin' }, input, list)), get: () => [...sel], set: (ids) => { sel.clear(); ids.forEach((x) => sel.add(x)); drawChips(); }, has: (x) => sel.has(x), input };
  };

  // ---------- templates ----------
  const BUILTIN = () => [
    { id: 'b-standup', name: t('mt_tStandup'), titlePrefix: t('mt_tStandup'), duration: 15, lobby: 'members', options: { chat: 'on', qa: false, sounds: false } },
    { id: 'b-1on1', name: t('mt_t1on1'), titlePrefix: t('mt_t1on1'), duration: 30, lobby: 'invited', options: { chat: 'on', qa: false, record: false } },
    { id: 'b-review', name: t('mt_tReview'), titlePrefix: t('mt_tReview'), duration: 60, lobby: 'members', options: { chat: 'on', qa: true, record: true } },
    { id: 'b-webinar', name: t('mt_tWebinar'), titlePrefix: t('mt_tWebinar'), duration: 60, lobby: 'everyone', options: { viewOnly: true, present: 'specific', qa: true, chat: 'off', sounds: false, registration: { on: true, email: true, notes: false, question: '', approve: true } } },
  ];

  // ---------- "New meeting" form ----------
  const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'];
  function repeatKey(r, start) {
    if (!r) return 'none'; const wd = new Date(start).getDay(), days = (r.days || []).join();
    if (r.interval === 1 && !r.until) { if (r.freq === 'daily') return 'daily'; if (r.freq === 'monthly') return 'monthly'; if (r.freq === 'weekly' && days === '1,2,3,4,5') return 'weekdays'; if (r.freq === 'weekly' && (!days || days === String(wd))) return 'weekly'; }
    return 'custom';
  }
  LC.meetings = LC.meetings || {};
  LC.meetings.schedule = async (prefill = {}, editing = null) => {
    let templates = []; if (!editing) { try { templates = (await LC.api('/api/meetings/templates')).templates; } catch {} }
    const m = editing || {}, now = Date.now(), slot = Math.ceil((now + 5 * MIN) / (30 * MIN)) * 30 * MIN;
    const s0 = prefill.start || m.start || slot, e0 = prefill.end || m.end || s0 + 30 * MIN, opts0 = { ...(m.options || {}) };
    const title = el('input', { value: prefill.title || m.title || '', maxlength: 120, placeholder: t('mt_title'), 'aria-label': t('mt_titleLabel'), class: 'mt-title', required: true });
    const optIds = new Set(m.optional || []), inv0 = prefill.invitees || m.invitees || [];
    const req = MT.picker({ label: t('mt_required'), selected: inv0.filter((x) => !optIds.has(x) && !(m.presenters || []).includes(x)), exclude: () => opt.get() });
    const opt = MT.picker({ label: t('mt_optional'), selected: [...optIds], exclude: () => req.get() });
    const optWrap = el('div', { class: optIds.size ? '' : 'hidden' }, MT.field(t('mt_optional'), opt.el));
    const date = el('input', { type: 'date', value: toInputDate(s0), 'aria-label': t('mt_date'), required: true }), st = el('input', { type: 'time', value: toInputTime(s0), 'aria-label': t('mt_startTime'), step: 300 }), en = el('input', { type: 'time', value: toInputTime(e0), 'aria-label': t('mt_endTime'), step: 300 });
    const allDay = MT.check(t('mt_allDay'), prefill.allDay || m.allDay, () => syncAllDay());
    const syncAllDay = () => { st.disabled = en.disabled = allDay.input.checked; };
    const days = dayNames(), wdOf = () => new Date(date.value + 'T12:00').getDay(), dom = () => new Date(date.value + 'T12:00').getDate();
    const rep = el('select', { 'aria-label': t('mt_repeat'), onchange: () => syncRepeat() });
    const fillRep = () => { const v = rep.value; rep.replaceChildren(...REPEATS.map((k) => el('option', { value: k, text: k === 'none' ? t('mt_rNone') : k === 'daily' ? t('mt_rDaily') : k === 'weekdays' ? t('mt_rWeekdays') : k === 'weekly' ? t('mt_rWeekly', { day: days[wdOf()] }) : k === 'monthly' ? t('mt_rMonthly', { n: dom() }) : t('mt_rCustom') }))); rep.value = v || 'none'; };
    fillRep(); rep.value = repeatKey(m.repeat, s0);
    const every = el('input', { type: 'number', min: 1, max: 99, value: (m.repeat && m.repeat.interval) || 1, 'aria-label': t('mt_every'), class: 'mt-num' });
    const unit = MT.select([['daily', t('mt_unitDay')], ['weekly', t('mt_unitWeek')], ['monthly', t('mt_unitMonth')]], (m.repeat && m.repeat.freq) || 'weekly', t('mt_every'), () => syncRepeat());
    const dayBoxes = days.map((d, i) => { const c = el('input', { type: 'checkbox', checked: m.repeat && m.repeat.days ? m.repeat.days.includes(i) : i === new Date(s0).getDay(), 'aria-label': d }); return { c, i, el: el('label', { class: 'mt-day' }, c, el('span', { text: d })) }; });
    const until = el('input', { type: 'date', value: m.repeat && m.repeat.until ? toInputDate(m.repeat.until) : '', 'aria-label': t('mt_until') });
    const custom = el('div', { class: 'mt-custom' }, el('div', { class: 'rowline' }, el('span', { text: t('mt_every') }), every, unit), el('div', { class: 'mt-days' }, dayBoxes.map((d) => d.el)));
    const untilWrap = MT.field(t('mt_until'), until);
    const syncRepeat = () => { custom.classList.toggle('hidden', rep.value !== 'custom'); dayBoxes.forEach((d) => d.el.classList.toggle('hidden', unit.value !== 'weekly')); untilWrap.classList.toggle('hidden', rep.value === 'none'); };
    date.addEventListener('change', () => fillRep());
    const chans = [...S.channels.values()].filter((c) => !['meeting', 'breakout'].includes(c.kind) && !c.id.startsWith('dm:'));
    const where = MT.select([['', t('mt_newChat')], ...chans.map((c) => [c.id, (c.members ? '' : '# ') + c.name])], prefill.chan || (editing ? (editing.chatKind === 'meeting' ? '' : editing.chan) : ''), t('mt_where'));
    if (editing) where.disabled = true;
    const loc = el('input', { value: m.location || '', maxlength: 120, 'aria-label': t('mt_location'), placeholder: t('mt_location') }), details = el('textarea', { rows: 4, maxlength: 4000, 'aria-label': t('mt_details'), placeholder: t('mt_details') }); details.value = prefill.details || m.details || '';
    // options
    const lobbySel = MT.select([['', t('mt_lMembers') + ' (' + t('mt_builtIn').toLowerCase() + ')'], ['everyone', t('mt_lEveryone')], ['members', t('mt_lMembers')], ['invited', t('mt_lInvited')], ['organizer', t('mt_lOrganizer')]], m.lobby || '', t('mt_lobbyQ'));
    const presSel = MT.select([['everyone', t('mt_pEveryone')], ['specific', t('mt_pSpecific')], ['organizer', t('mt_pOrganizer')]], opts0.present || 'everyone', t('mt_presentQ'), () => syncPres());
    const pres = MT.picker({ label: t('mt_presenters'), selected: m.presenters || [] }), presWrap = MT.field(t('mt_presenters'), pres.el);
    const syncPres = () => presWrap.classList.toggle('hidden', presSel.value !== 'specific' && !viewOnly.input.checked);
    const chatSel = MT.select([['on', t('mt_chatOn')], ['off', t('mt_chatOff')], ['during', t('mt_chatDuring')]], opts0.chat || 'on', t('mt_chatQ'));
    const qa = MT.check(t('mt_qaOpt'), opts0.qa !== false), sounds = MT.check(t('mt_soundsOpt'), opts0.sounds !== false), record = MT.check(t('mt_recordOpt'), opts0.record !== false);
    const viewOnly = MT.check(t('mt_viewOnly'), opts0.viewOnly, () => { syncPres(); regBox.classList.toggle('hidden', !viewOnly.input.checked); });
    const reg0 = opts0.registration || {}, regOn = MT.check(t('mt_regOn'), reg0.on, () => regMore.classList.toggle('hidden', !regOn.input.checked));
    const regEmail = MT.check(t('mt_regEmail'), reg0.email !== false), regNotes = MT.check(t('mt_regNotes'), reg0.notes), regApprove = MT.check(t('mt_regApprove'), reg0.approve !== false), regQ = el('input', { maxlength: 200, value: reg0.question || '', 'aria-label': t('mt_regQuestion'), placeholder: t('mt_regQuestion') });
    const regMore = el('div', { class: 'mt-indent' + (reg0.on ? '' : ' hidden') }, regEmail.el, regNotes.el, regQ, regApprove.el);
    const regBox = el('div', { class: 'mt-indent' + (opts0.viewOnly ? '' : ' hidden') }, el('p', { class: 'muted small', text: t('mt_viewOnlyHelp', { n: Math.min(Number((S.settings.meetingRules || {}).maxPeople) || 30, 60) }) }), regOn.el, regMore);
    const interp = (opts0.interp || []).map((x) => ({ ...x })), interpList = el('div', { class: 'mt-interp' });
    const drawInterp = () => interpList.replaceChildren(...interp.map((row, i) => el('div', { class: 'rowline' }, MT.select([['', '—'], ...people().map((u) => [u.id, LC.uname(u.id)])], row.uid || '', t('mt_interp'), (v) => { row.uid = v; }), el('input', { value: row.lang || '', maxlength: 30, placeholder: t('mt_language'), 'aria-label': t('mt_language'), oninput: (e) => { row.lang = e.target.value; } }), LC.ibtn('delete', t('mt_remove', { name: row.lang || '' }), () => { interp.splice(i, 1); drawInterp(); }))), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { interp.push({ uid: '', lang: '' }); drawInterp(); } }, LC.icon('add'), t('mt_addInterp')));
    drawInterp();
    const optBox = el('details', { class: 'mt-opts', open: !!editing && false }, el('summary', {}, LC.icon('settings'), ' ' + t('mt_options')),
      el('div', { class: 'mt-grid2' }, MT.field(t('mt_lobbyQ'), lobbySel), MT.field(t('mt_presentQ'), presSel), MT.field(t('mt_chatQ'), chatSel)), presWrap, qa.el, sounds.el, record.el, viewOnly.el, regBox,
      el('h3', {}, LC.icon('translate'), ' ' + t('mt_interp')), el('p', { class: 'muted small', text: t('mt_interpHelp') }), interpList);
    // template picker
    const tplSel = editing ? null : MT.select([['', t('mt_noTemplate')], ...BUILTIN().map((x) => [x.id, x.name]), ...templates.map((x) => ['u-' + x.id, '★ ' + x.name])], '', t('mt_template'), (v) => applyTpl(v));
    const applyTpl = (v) => {
      const tp = [...BUILTIN(), ...templates.map((x) => ({ ...x, id: 'u-' + x.id }))].find((x) => x.id === v); if (!tp) return;
      if (tp.titlePrefix && !title.value.trim().startsWith(tp.titlePrefix)) title.value = tp.titlePrefix + (title.value.trim() ? ': ' + title.value.trim() : '');
      const s = new Date(`${date.value}T${st.value || '09:00'}`).getTime(); if (s) en.value = toInputTime(s + tp.duration * MIN);
      lobbySel.value = tp.lobby || ''; const o = tp.options || {};
      if (o.present) presSel.value = o.present; if (o.chat) chatSel.value = o.chat; qa.input.checked = o.qa !== false; sounds.input.checked = o.sounds !== false; record.input.checked = o.record !== false; viewOnly.input.checked = !!o.viewOnly;
      const r = o.registration || {}; regOn.input.checked = !!r.on; regEmail.input.checked = r.email !== false; regNotes.input.checked = !!r.notes; regApprove.input.checked = r.approve !== false; regQ.value = r.question || '';
      regBox.classList.toggle('hidden', !viewOnly.input.checked); regMore.classList.toggle('hidden', !regOn.input.checked); syncPres(); if (o.viewOnly) optBox.open = true;
    };
    const err = el('div', { class: 'err', role: 'alert' });
    const collect = () => {
      const ttl = title.value.trim(); if (!ttl) throw new Error(t('mt_needTitle'));
      let s, e; if (allDay.input.checked) { s = new Date(date.value + 'T00:00').getTime(); e = s + DAY; } else { s = new Date(`${date.value}T${st.value}`).getTime(); e = new Date(`${date.value}T${en.value}`).getTime(); if (e <= s) e += DAY; }
      if (!s || !e) throw new Error(t('mt_needTime'));
      const k = rep.value, wd = new Date(s).getDay();
      let repeat = k === 'none' ? null : k === 'daily' ? { freq: 'daily', interval: 1 } : k === 'weekdays' ? { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] } : k === 'weekly' ? { freq: 'weekly', interval: 1, days: [wd] } : k === 'monthly' ? { freq: 'monthly', interval: 1 } : { freq: unit.value, interval: Math.max(1, Math.min(99, Number(every.value) || 1)), days: unit.value === 'weekly' ? dayBoxes.filter((d) => d.c.checked).map((d) => d.i) : [] };
      if (repeat && until.value) repeat.until = new Date(until.value + 'T23:59').getTime();
      const optional = opt.get(), invitees = [...new Set([...req.get(), ...optional])];
      return { title: ttl, start: s, end: e, allDay: allDay.input.checked, tz: tzName(), repeat, invitees, optional, presenters: presSel.value === 'specific' || viewOnly.input.checked ? pres.get() : [], chan: where.value, location: loc.value, details: details.value, lobby: lobbySel.value,
        options: { present: presSel.value, chat: chatSel.value, qa: qa.input.checked, sounds: sounds.input.checked, record: record.input.checked, viewOnly: viewOnly.input.checked, registration: { on: viewOnly.input.checked && regOn.input.checked, email: regEmail.input.checked, notes: regNotes.input.checked, question: regQ.value, approve: regApprove.input.checked }, interp: interp.filter((x) => x.uid && x.lang.trim()) } };
    };
    const go = async (ev) => {
      ev.preventDefault(); err.textContent = ''; let b; try { b = collect(); } catch (x) { err.textContent = x.message; return; }
      try {
        const r = editing ? await LC.api('/api/meetings/update', { id: editing.id, ...b, chan: undefined }) : await LC.api('/api/meetings/create', b);
        MT.cache.set(r.meeting.id, r.meeting); refreshUpcoming(); LC.closeModal(); LC.toast(editing ? t('mt_updated') : t('mt_scheduled'), { action: { label: t('mt_viewDetails'), fn: () => LC.meetings.open(r.meeting.id) } });
        if (prefill.onDone) prefill.onDone(r.meeting);
      } catch (x) { err.textContent = x.message; }
    };
    const saveTpl = async () => {
      const name = await LC.prompt(t('mt_templateName'), { max: 40, value: title.value.split(':')[0].trim() }); if (!name) return; let b; try { b = collect(); } catch { b = { start: 0, end: 30 * MIN, options: {}, lobby: lobbySel.value }; }
      try { await LC.api('/api/meetings/templates', { op: 'save', name, titlePrefix: title.value.split(':')[0].trim(), duration: Math.round((b.end - b.start) / MIN) || 30, lobby: b.lobby, options: b.options }); LC.toast(t('mt_templateSaved'), { ms: 1600 }); } catch (x) { MT.fail(x); }
    };
    const toggleOpt = el('button', { type: 'button', class: 'link mt-optlink', text: t('mt_addOptional'), onclick: (e) => { optWrap.classList.remove('hidden'); e.currentTarget.remove(); opt.input.focus(); } });
    LC.modal(el('form', { class: 'mt-form', onsubmit: go }, el('div', { class: 'row-between' }, el('h2', {}, LC.icon(editing ? 'calendar_edit' : 'calendar_add'), ' ' + (editing ? t('mt_editMeeting') : t('mt_newMeeting'))), tplSel ? el('div', { class: 'mt-tpl' }, tplSel) : null),
      title, MT.field(t('mt_required'), req.el), optIds.size ? null : toggleOpt, optWrap,
      el('div', { class: 'mt-when' }, MT.field(t('mt_date'), date), MT.field(t('mt_startTime'), st), MT.field(t('mt_endTime'), en), el('div', { class: 'mt-allday' }, allDay.el)),
      el('div', { class: 'mt-grid2' }, MT.field(t('mt_repeat'), rep), untilWrap), custom, editing && editing.repeat ? el('p', { class: 'muted small', text: t('mt_seriesNote') }) : null,
      el('div', { class: 'mt-grid2' }, MT.field(t('mt_where'), where), MT.field(t('mt_location'), loc)), MT.field(t('mt_details'), details), optBox, err,
      el('div', { class: 'acts mt-acts' }, !editing ? el('button', { type: 'button', class: 'secondary withicon mt-left', onclick: saveTpl }, LC.icon('save'), el('span', { text: t('mt_saveTemplate') })) : null, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'submit', class: 'primary withicon' }, LC.icon('send'), el('span', { text: editing ? t('mt_sendUpdate') : t('mt_send') })))), { wide: true, label: editing ? t('mt_editMeeting') : t('mt_newMeeting') });
    syncAllDay(); syncRepeat(); syncPres(); setTimeout(() => title.focus(), 40);
  };
  LC.meetings.edit = async (id) => { try { const m = await MT.get(id, true); LC.meetings.schedule({}, m); } catch (e) { MT.fail(e); } };

  // ---------- meeting details ----------
  const rsvpLabel = (r) => (r === 'yes' ? t('mt_rsvpYes') : r === 'maybe' ? t('mt_rsvpMaybe') : r === 'no' ? t('mt_rsvpNo') : t('mt_rsvpNone'));
  MT.rsvpBar = (m, after) => {
    if (!m.invited && !m.member) return null; if (m.isOrganizer) return el('span', { class: 'pill mt-orgpill', text: t('mt_youOrganize') });
    const send = (r) => LC.api('/api/meetings/rsvp', { id: m.id, rsvp: r }).then(() => { m.myRsvp = r; MT.cache.set(m.id, { ...m }); refreshCards(m.id); after && after(); }).catch(MT.fail);
    return el('div', { class: 'mt-rsvp', role: 'group', 'aria-label': t('mt_tracking') }, [['yes', 'checkmark', t('mt_accept')], ['maybe', 'question_circle', t('mt_tentative')], ['no', 'dismiss', t('mt_decline')]].map(([r, ic, lab]) => el('button', { type: 'button', class: 'secondary sm withicon' + (m.myRsvp === r ? ' on' : ''), 'aria-pressed': String(m.myRsvp === r), onclick: () => send(r) }, LC.icon(ic), el('span', { text: lab }))));
  };
  MT.joinInfo = (m, link) => el('div', { class: 'mt-joininfo' },
    el('div', { class: 'addr' }, el('code', { class: 'mt-linktext', text: link }), el('button', { type: 'button', class: 'secondary sm withicon', onclick: async () => { LC.toast((await LC.copy(link)) ? t('mt_linkCopied') : t('copyFailed'), { ms: 1600 }); } }, LC.icon('link'), el('span', { text: t('mt_copyLink') }))),
    m.code ? el('div', { class: 'mt-idrow' }, el('span', {}, el('span', { class: 'muted', text: t('mt_meetingId') + ': ' }), el('b', { class: 'mt-code', text: MT.fmtCode(m.code) })), el('span', {}, el('span', { class: 'muted', text: t('mt_passcode') + ': ' }), el('b', { class: 'mt-pass', text: m.passcode })),
      el('button', { type: 'button', class: 'secondary sm withicon', onclick: async () => { const ok = await LC.copy(`${m.title}\n${t('mt_link')}: ${link}\n${t('mt_meetingId')}: ${MT.fmtCode(m.code)}\n${t('mt_passcode')}: ${m.passcode}`); LC.toast(ok ? t('copied') : t('copyFailed'), { ms: 1400 }); } }, LC.icon('copy'), el('span', { text: t('mt_copyInfo') }))) : null);
  MT.whenText = (m) => [MT.fmtRange(m.next && m.repeat ? m.next : m.start, (m.next && m.repeat ? m.next : m.start) + (m.end - m.start), m.allDay), m.repeat ? MT.repeatText(m.repeat, m.start) : ''].filter(Boolean).join(' · ');
  LC.meetings.open = async (id) => {
    let m; try { m = await MT.get(id, true); } catch (e) { return MT.fail(e); }
    const link = await MT.link(m.id), see = !!m.code, body = [];
    const head = el('div', { class: 'mt-dhead' }, el('div', { class: 'mt-dicon', 'aria-hidden': 'true' }, LC.icon('calendar_ltr', { filled: true })), el('div', { class: 'grow' },
      el('h2', { class: 'mt-dtitle' }, el('span', { text: m.title }), m.cancelled ? el('span', { class: 'pill late', text: t('mt_cancelled') }) : null, m.webinar ? el('span', { class: 'pill', text: t('mt_webinar') }) : null, m.live ? el('span', { class: 'pill mt-livepill', text: t('mt_live') }) : null),
      el('div', { class: 'muted', text: MT.whenText(m) }), m.location ? el('div', { class: 'small', text: m.location }) : null, el('div', { class: 'small muted', text: m.isOrganizer ? t('mt_youOrganize') : t('mt_byOrganizer', { name: LC.uname(m.organizer) }) })));
    body.push(el('div', { class: 'row-between' }, head, LC.ibtn('dismiss', t('close'), LC.closeModal)));
    if (!m.cancelled) body.push(el('div', { class: 'acts mt-dacts' },
      el('button', { type: 'button', class: 'primary withicon', onclick: () => { LC.closeModal(); LC.meetings.join(m.id); } }, LC.icon('video'), el('span', { text: t('mt_join') })),
      see && m.member ? el('button', { type: 'button', class: 'secondary withicon', onclick: () => { LC.closeModal(); LC.openChat(m.chan); } }, LC.icon('chat'), el('span', { text: t('mt_meetingChat') })) : null,
      m.isOrganizer ? el('button', { type: 'button', class: 'secondary withicon', onclick: () => LC.meetings.edit(m.id) }, LC.icon('edit'), el('span', { text: t('mt_edit') })) : null,
      m.isOrganizer || LC.isAdmin() && see ? el('button', { type: 'button', class: 'secondary danger withicon', onclick: () => cancelDialog(m) }, LC.icon('calendar_cancel'), el('span', { text: t('mt_cancelMeeting') })) : null));
    const rb = !m.cancelled && !m.isOrganizer && MT.rsvpBar(m, () => LC.meetings.open(m.id)); if (rb) body.push(rb);
    if (see) body.push(el('h3', {}, LC.icon('link'), ' ' + t('mt_link')), MT.joinInfo(m, link));
    if (m.details) body.push(el('h3', { text: t('mt_details2') }), el('div', { class: 'mt-detailstext' }, LC.renderText(m.details)));
    if (see) {
      const row = (uid, extra) => el('div', { class: 'mt-person' }, LC.avatar(S.users.get(uid), 'sm', true), el('span', { class: 'grow', text: LC.uname(uid) }), extra);
      const list = [row(m.organizer, el('span', { class: 'pill', text: t('mt_organizer') })), ...m.invitees.map((uid) => row(uid, el('span', { class: 'mt-pills' }, (m.presenters || []).includes(uid) ? el('span', { class: 'pill', text: t('mt_presenter') }) : null, (m.optional || []).includes(uid) ? el('span', { class: 'pill', text: t('mt_optional').split(' ')[0] }) : null, m.rsvp ? el('span', { class: 'pill mt-r-' + (m.rsvp[uid] || 'none'), text: rsvpLabel(m.rsvp[uid]) }) : null)))];
      body.push(el('h3', {}, LC.icon('people'), ' ' + (m.rsvp ? t('mt_tracking') : t('mt_attendees')) + ` (${m.invitees.length + 1})`), m.counts && m.isOrganizer ? el('p', { class: 'muted small', text: t('mt_responses', m.counts) }) : null, el('div', { class: 'mt-people' }, list));
      if (m.sessions && m.sessions.length) body.push(el('h3', {}, LC.icon('history'), ' ' + t('mt_sessions')), el('div', { class: 'mt-sessions' }, m.sessions.slice(0, 10).map((s) => el('div', { class: 'mt-session' }, el('span', { class: 'grow' }, el('b', { text: MT.fmtDay(s.start) + ' ' + LC.fmtTime(s.start) }), el('span', { class: 'muted small', text: ' · ' + (s.end ? MT.dur(s.end - s.start) : t('mt_live')) + ' · ' + t('peopleCount', { n: s.people }) })),
        el('button', { type: 'button', class: 'secondary sm', text: t('mt_recap'), onclick: () => MT.recap && MT.recap(m.id, s.occ) }), m.isOrganizer ? el('button', { type: 'button', class: 'secondary sm', text: t('mt_attendance'), onclick: () => MT.attendance && MT.attendance(m.id, s.occ) }) : null))));
      for (const f of MT.detailParts || []) { try { const n = f(m, link); if (n) body.push(n); } catch (e) { console.error(e); } }
    }
    LC.modal(body, { wide: true, label: m.title });
  };
  async function cancelDialog(m) {
    const note = el('textarea', { rows: 2, maxlength: 300, placeholder: t('mt_cancelNote'), 'aria-label': t('mt_cancelNote') });
    const go = (occ) => LC.api('/api/meetings/cancel', { id: m.id, occurrence: occ, message: note.value }).then(() => { LC.closeModal(); refreshUpcoming(); LC.toast(t('mt_cancelled'), { ms: 1600 }); }).catch(MT.fail);
    LC.modal([el('h2', {}, LC.icon('calendar_cancel'), ' ' + t('mt_cancelMeeting')), el('p', { class: 'muted', text: m.title + ' · ' + MT.whenText(m) }), note,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: () => LC.meetings.open(m.id) }), m.repeat && m.next ? el('button', { type: 'button', class: 'secondary danger', text: t('mt_cancelOcc'), onclick: () => go(m.next) }) : null, el('button', { type: 'button', class: 'primary danger', text: m.repeat ? t('mt_cancelSeries') : t('mt_cancelMeeting'), onclick: () => go(undefined) }))]);
  }

  // ---------- joining: before-you-join screen, lobby ----------
  let pendingJoin = null; // set by LC.meetings.join, picked up by the beforeCall hook for the call it starts
  MT.moving = null;       // breakout room moves skip the screens
  const stopStream = (s) => s && s.getTracks().forEach((x) => x.stop());
  // resolves { micId, camId, cam, muted, companion? } or null (cancelled)
  MT.prejoin = (o) => new Promise((resolve) => {
    const prev = document.activeElement; let stream = null, camOn = o.companion ? false : LC.ui.mtCam !== false, micOn = !o.companion && LC.ui.mtMic !== false, mode = o.companion ? 'companion' : 'computer', ac = null, raf = 0, done = false;
    const video = el('video', { autoplay: true, playsinline: true, muted: true, class: 'mt-pv' }); video.muted = true;
    const meter = el('div', { class: 'mt-meter', 'aria-hidden': 'true' }, el('i')), av = el('div', { class: 'mt-pvav' }, LC.avatar(S.me, 'xl', false), el('span', { text: t('mt_camOff') }));
    const camSel = el('select', { 'aria-label': t('mt_camera') }), micSel = el('select', { 'aria-label': t('mt_mic') }), spkSel = el('select', { 'aria-label': t('mt_speaker') });
    const camBtn = el('button', { type: 'button', class: 'mt-switch', role: 'switch', 'aria-label': t('mt_camera') }), micBtn = el('button', { type: 'button', class: 'mt-switch', role: 'switch', 'aria-label': t('mt_mic') });
    // background effects: the calls area's picker (LC.callEffects); the preview shows the chosen effect
    const fxHost = el('div', { class: 'mt-fxhost hidden', role: 'group', 'aria-label': t('mt_effects') });
    const fx = LC.callEffects && LC.callEffects.picker ? el('button', { type: 'button', class: 'secondary sm withicon', 'aria-expanded': 'false', onclick: () => { const open = !fxHost.classList.toggle('hidden'); fx.setAttribute('aria-expanded', String(open)); if (open && !fxHost.firstChild) { try { LC.callEffects.picker(fxHost, {}); } catch (e) { console.error(e); } } } }, LC.icon('video_background_effect'), el('span', { text: t('mt_effects') })) : null;
    let fxp = null;
    const applyFx = () => {
      if (fxp) { try { fxp.stop(); } catch {} fxp = null; } const v = stream && stream.getVideoTracks()[0];
      if (v && LC.callEffects && LC.callEffects.process) { try { fxp = LC.callEffects.process(v); } catch { fxp = null; } }
      video.srcObject = v ? new MediaStream([fxp && fxp.track ? fxp.track : v]) : stream || null; if (video.srcObject) video.play().catch(() => {});
    };
    MT.prejoinFx = applyFx;
    const status = el('div', { class: 'mt-status', role: 'status', 'aria-live': 'polite' });
    const modeBtn = (k, ic, label, help) => el('button', { type: 'button', class: 'mt-mode', 'data-mode': k, 'aria-pressed': String(mode === k), onclick: () => { mode = k; if (k !== 'computer') { micOn = false; if (k === 'companion') camOn = false; } else micOn = true; sync(); } }, LC.icon(ic), el('span', { class: 'grow' }, el('b', { text: label }), help ? el('small', { class: 'muted', text: help }) : null));
    const modes = el('div', { class: 'mt-modes', role: 'group', 'aria-label': t('mt_computerAudio') }, modeBtn('computer', 'speaker_2', t('mt_computerAudio')), modeBtn('none', 'speaker_mute', t('mt_noAudio')), modeBtn('companion', 'phone_laptop', t('mt_companion'), t('mt_companionHelp')));
    const joinBtn = el('button', { type: 'button', class: 'primary mt-joinbtn', text: t('mt_joinNow'), onclick: () => finish(true) }), cancelBtn = el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: () => finish(false) });
    const waitBox = el('div', { class: 'mt-wait hidden', role: 'status', 'aria-live': 'polite' }, el('div', { class: 'spinner', 'aria-hidden': 'true' }), el('h3', { text: t('mt_lobbyWait') }), el('p', { class: 'muted small', text: t('mt_lobbyHelp') }), el('button', { type: 'button', class: 'secondary', text: t('mt_leaveLobby'), onclick: () => { if (box._onLeave) box._onLeave(); } }));
    const controls = el('div', { class: 'mt-pvbar' }, el('label', { class: 'mt-tog' }, LC.icon('video'), camBtn), fx, el('span', { class: 'grow' }));
    const box = el('div', { class: 'mt-prejoin', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mtPjTitle' },
      el('div', { class: 'mt-pjcard' }, el('div', { class: 'mt-pjhead' }, el('h2', { id: 'mtPjTitle', text: o.title || t('mt_newMeeting') }), el('p', { class: 'muted', text: t('mt_prejoinHelp') })),
        el('div', { class: 'mt-pjbody' }, el('div', { class: 'mt-pvcol' }, el('div', { class: 'mt-pvbox' }, el('div', { class: 'mt-pvstage' }, video, av), controls), fxHost),
          el('div', { class: 'mt-pjside' }, modes, el('div', { class: 'mt-audio' }, el('div', { class: 'mt-microw' }, el('label', { class: 'mt-tog' }, LC.icon('mic'), micBtn), meter), MT.field(t('mt_mic'), micSel), 'setSinkId' in HTMLMediaElement.prototype ? MT.field(t('mt_speaker'), spkSel) : null, MT.field(t('mt_camera'), camSel)),
            o.meeting && MT.addDevice ? el('button', { type: 'button', class: 'link mt-adddev', onclick: () => MT.addDevice(o.meeting.id) }, LC.icon('phone'), ' ' + t('mt_addDevice')) : null)),
        status, waitBox, el('div', { class: 'acts mt-pjacts' }, cancelBtn, joinBtn)));
    const sync = () => {
      camBtn.setAttribute('aria-checked', String(camOn)); micBtn.setAttribute('aria-checked', String(micOn)); micBtn.disabled = mode !== 'computer'; camBtn.disabled = mode === 'companion' && false;
      for (const b of modes.querySelectorAll('.mt-mode')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      const v = stream && stream.getVideoTracks()[0], a = stream && stream.getAudioTracks()[0]; if (a) a.enabled = micOn && mode === 'computer';
      av.classList.toggle('hidden', !!(camOn && v)); video.classList.toggle('hidden', !(camOn && v)); box.querySelector('.mt-audio').classList.toggle('dim', mode !== 'computer');
    };
    camBtn.onclick = () => {
      camOn = !camOn; LC.setUi({ mtCam: camOn });
      if (!camOn && stream) for (const v of stream.getVideoTracks()) { v.stop(); stream.removeTrack(v); } // the camera light goes off, like in a call
      if (camOn && !(stream && stream.getVideoTracks()[0])) openMedia(); else sync();
    };
    micBtn.onclick = () => { micOn = !micOn; LC.setUi({ mtMic: micOn }); sync(); };
    let opening = false, again = false;
    const gum = (a, v) => {
      const audio = a ? { deviceId: micSel.value ? { exact: micSel.value } : undefined, echoCancellation: true, noiseSuppression: true } : false, video2 = v ? { deviceId: camSel.value ? { exact: camSel.value } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } : false;
      return navigator.mediaDevices.getUserMedia({ audio, video: video2 }).catch(() => (a && v ? navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => navigator.mediaDevices.getUserMedia({ video: true })) : navigator.mediaDevices.getUserMedia({ audio: !!a, video: !!v })));
    };
    async function openMedia() {
      if (!media()) { status.textContent = t('mt_noMedia'); return; }
      if (opening) { again = true; return; } opening = true;
      stopStream(stream); stream = null; const wantV = camOn;
      try { stream = await gum(true, wantV); } catch { stream = null; status.textContent = t('micDenied'); }
      if (done) { stopStream(stream); return; }
      if (wantV && !(stream && stream.getVideoTracks()[0])) { camOn = false; status.textContent = t('noCamera'); }
      applyFx(); await fillDevices(); meterOn();
      opening = false; if (again) { again = false; openMedia(); } else sync();
    }
    async function fillDevices() {
      const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const fill = (s, kind, key, label) => { const cur = s.value || LC.ui[key] || ''; s.replaceChildren(el('option', { value: '', text: t('systemDefault') }), ...devs.filter((d) => d.kind === kind).map((d, i) => el('option', { value: d.deviceId, text: d.label || `${label} ${i + 1}` }))); s.value = [...s.options].some((x) => x.value === cur) ? cur : ''; };
      fill(camSel, 'videoinput', 'camId', t('mt_camera')); fill(micSel, 'audioinput', 'micId', t('mt_mic')); fill(spkSel, 'audiooutput', 'speakerId', t('mt_speaker'));
    }
    camSel.onchange = () => { LC.setUi({ camId: camSel.value }); openMedia(); }; micSel.onchange = () => { LC.setUi({ micId: micSel.value }); openMedia(); }; spkSel.onchange = () => LC.setUi({ speakerId: spkSel.value });
    function meterOn() {
      cancelAnimationFrame(raf); const a = stream && stream.getAudioTracks()[0]; if (!a) { meter.firstChild.style.width = '0'; return; }
      try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(new MediaStream([a])).connect(an); const buf = new Uint8Array(an.fftSize);
        const loop = () => { an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; } meter.firstChild.style.width = (micOn ? Math.min(100, Math.sqrt(sum / buf.length) * 400) : 0) + '%'; raf = requestAnimationFrame(loop); }; loop(); } catch {}
    }
    const keys = (e) => { if (e.key === 'Escape' && !box.classList.contains('waiting')) { e.stopPropagation(); finish(false); } else if (e.key === 'Tab') { const f = [...box.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled])')].filter((x) => x.offsetParent !== null); if (!f.length) return; if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); } } };
    box.addEventListener('keydown', keys);
    function cleanup() { if (done && !box.isConnected) return; done = true; if (MT.prejoinFx === applyFx) MT.prejoinFx = null; if (fxp) { try { fxp.stop(); } catch {} } cancelAnimationFrame(raf); stopStream(stream); try { ac && ac.close(); } catch {} box.remove(); if (prev && prev.focus) try { prev.focus(); } catch {} }
    function finish(ok) {
      if (!ok) { cleanup(); return resolve(null); }
      const opts = { micId: micSel.value || LC.ui.micId || '', camId: camSel.value || LC.ui.camId || '', cam: !!camOn, muted: !micOn || mode !== 'computer' }; // a companion may share its camera (e.g. a phone)
      if (mode === 'companion') opts.companion = true;
      if (o.keepOpen) { joinBtn.disabled = true; resolve({ opts, ui: { box, waiting: (onLeave) => { box.classList.add('waiting'); box._onLeave = onLeave; waitBox.classList.remove('hidden'); joinBtn.classList.add('hidden'); cancelBtn.classList.add('hidden'); modes.classList.add('hidden'); waitBox.querySelector('button').focus(); }, close: cleanup } }); }
      else { cleanup(); resolve({ opts }); }
    }
    document.body.append(box); sync(); if (media()) openMedia(); else status.textContent = t('mt_noMedia');
    setTimeout(() => joinBtn.focus(), 30);
  });
  LC.on('call:effects', () => { if (MT.prejoinFx) MT.prejoinFx(); }); // LC.callEffects.set() fires it (docs/features-calls.md)
  // waits in the lobby; resolves true when admitted, false when denied / left
  function lobbyWait(m, ui) {
    return new Promise((resolve) => {
      let settled = false; const done = (v) => { if (settled) return; settled = true; MT.waiting = null; resolve(v); };
      MT.waiting = { id: m.id, admitted: () => done(true), denied: (why) => { LC.toast(why === 'cancelled' ? t('mt_wasCancelled') : t('mt_denied'), { ms: 6000 }); done(false); } };
      ui.waiting(() => { LC.api('/api/meetings/lobby', { id: m.id, op: 'leave' }).catch(() => {}); done(false); });
    });
  }
  LC.on('mt_admitted', (e) => { if (e.channel) S.channels.set(e.channel.id, e.channel); if (MT.waiting && MT.waiting.id === e.meeting) { LC.toast(t('mt_admitted'), { ms: 2000 }); MT.waiting.admitted(); } });
  LC.on('mt_denied', (e) => { if (MT.waiting && MT.waiting.id === e.meeting) MT.waiting.denied(e.reason); });
  LC.on('init', () => { if (MT.waiting) LC.api('/api/meetings/join', { id: MT.waiting.id }).then((r) => { if (!r.lobby && MT.waiting) MT.waiting.admitted(); }).catch(() => {}); }); // back after a reconnect: knock again
  // pre-join + server join (+ lobby). Returns the beforeCall options or null.
  async function enter(m, o = {}) {
    const ch = await MT.prejoin({ title: m.title, meeting: m, companion: o.companion, keepOpen: true }); if (!ch) return null;
    try {
      let r = await LC.api('/api/meetings/join', { id: m.id });
      if (r.lobby) { if (!(await lobbyWait(m, ch.ui))) { ch.ui.close(); return null; } r = await LC.api('/api/meetings/join', { id: m.id }); if (r.lobby) { ch.ui.close(); return null; } }
      if (r.channel) S.channels.set(r.channel.id, r.channel);
      ch.ui.close(); return { ...ch.opts, mtMeeting: m.id, chan: r.chan };
    } catch (e) { ch.ui.close(); MT.fail(e); return null; }
  }
  LC.meetings.join = async (id, o = {}) => {
    if (!media()) return LC.needSecure();
    let m; try { m = await MT.get(id, true); } catch (e) { return MT.fail(e); }
    if (m.cancelled) return LC.toast(t('mt_wasCancelled'));
    if (LC.inCall()) { if (LC.callChan() === m.chan) return LC.showCall(); return LC.toast(t('mt_alreadyIn')); }
    const opts = await enter(m, o); if (!opts) return;
    const chan = opts.chan; delete opts.chan; pendingJoin = { chan, opts, at: Date.now() };
    await LC.openChat(chan); if (S.calls[chan]) LC.joinCall(chan, 'video'); else LC.startCall(chan, 'video');
  };
  // which meeting a call in this chat belongs to (call state, the meeting chat, or a channel meeting happening now)
  MT.meetingFor = (chan) => {
    const c = S.calls[chan], ch = S.channels.get(chan); if (c && c.meeting) return c.meeting; if (ch && ch.meeting) return ch.meeting;
    const now = Date.now(), hit = MT.upcoming.find((x) => x.chan === chan && x.start - 15 * MIN <= now && x.end > now); return hit ? hit.id : null;
  };
  LC.ext.beforeCall.push(async ({ chan, mode }) => {
    void mode;
    if (pendingJoin && pendingJoin.chan === chan && Date.now() - pendingJoin.at < 120000) { const o = pendingJoin.opts; pendingJoin = null; return o; }
    if (MT.moving && MT.moving.chan === chan) { const o = MT.moving.opts; MT.moving = null; return o; }
    const ch = S.channels.get(chan); if (ch && ch.kind === 'breakout') return { mtMeeting: ch.meeting };
    const id = MT.meetingFor(chan);
    if (id) { let m = null; try { m = await MT.get(id, true); } catch {} if (m && !m.cancelled) { const o = await enter(m); if (o) delete o.chan; return o || false; } }
    if (LC.ui.mtPrejoin === 'all') { const ch2 = await MT.prejoin({ title: LC.chanInfo(chan).title }); return ch2 ? ch2.opts : false; }
    return undefined;
  });

  // ---------- organizers: the lobby (toolbar panel + banner in the meeting window + toasts) ----------
  const lobbyFor = (id) => MT.lobby.get(id) || { waiting: [] };
  MT.admit = (id, uid, op = 'admit') => LC.api('/api/meetings/lobby', { id, uid, op }).then((r) => { const l = MT.lobby.get(id); if (l) { l.waiting = r.waiting; } LC.callApi && LC.callApi.redraw(); }).catch(MT.fail);
  LC.on('mt_lobby', (e) => { MT.lobby.set(e.meeting, e); if (LC.callApi) LC.callApi.redraw(); for (const f of MT.onLobby || []) f(e); });
  LC.on('mt_knock', (e) => {
    if (MT.callMeeting() === e.meeting) { LC.playSound('ping'); return; }
    LC.toast(t('mt_knock', { name: e.name, title: e.title }), { ms: 15000, action: { label: t('mt_admit'), fn: () => MT.admit(e.meeting, e.uid) } }); LC.playSound('ping');
    if (LC.native && !LC.visible()) LC.native.notify(t('mt_lobbyTitle'), t('mt_knock', { name: e.name, title: e.title }), e.chan);
  });
  MT.onLobby = [];
  const lobbyPanel = (host) => {
    const id = MT.callMeeting(), l = lobbyFor(id);
    MT.add(host, el('p', { class: 'muted small', text: t('mt_waitingN', { n: l.waiting.length }) }), ...l.waiting.map((w) => el('div', { class: 'prow mt-lrow' }, LC.avatar(S.users.get(w.uid) || { name: w.name, color: '#888' }, 'sm', false), el('span', { class: 'grow' }, el('span', { text: w.name }), w.guest ? el('span', { class: 'pill', text: t('mt_guestPill') }) : null, w.invited ? el('span', { class: 'pill', text: t('mt_invitedPill') }) : null),
      el('button', { type: 'button', class: 'secondary sm', text: t('mt_deny'), 'aria-label': t('mt_deny') + ' ' + w.name, onclick: () => MT.admit(id, w.uid, 'deny') }), el('button', { type: 'button', class: 'primary sm', text: t('mt_admit'), 'aria-label': t('mt_admit') + ' ' + w.name, onclick: () => MT.admit(id, w.uid) }))),
    l.waiting.length > 1 ? el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary sm', text: t('mt_admitAll'), onclick: () => MT.admit(id, '', 'admitAll') })) : null);
  };
  LC.ext.callPanels.push({ key: 'mtlobby', icon: 'people_queue', label: t('mt_lobbyTitle'), short: t('mt_lobbyTitle'), order: 5, when: () => { const id = MT.callMeeting(); return !!id && lobbyFor(id).waiting.length > 0; }, render: lobbyPanel });
  // the meeting window keeps its DOM between draws: the banner is updated in place (and removed when nobody waits)
  LC.on('call:drawn', ({ ui }) => {
    const id = MT.callMeeting(), l = id ? lobbyFor(id) : { waiting: [] }, old = ui.querySelector('.mt-lobbybar'), show = l.waiting.length && !(LC.callApi.panel && LC.callApi.panel() === 'mtlobby');
    const sig = show ? JSON.stringify(l.waiting.map((w) => w.uid)) : ''; if (old && old.dataset.sig === sig) return; if (old) old.remove(); if (!show) return;
    const text = l.waiting.length === 1 ? t('mt_waiting1', { name: l.waiting[0].name }) : t('mt_waitingN', { n: l.waiting.length });
    ui.append(el('div', { class: 'mt-lobbybar', role: 'status', 'data-sig': sig }, LC.icon('people_queue'), el('span', { class: 'grow', text: text }), l.waiting.length === 1 ? el('button', { type: 'button', class: 'primary sm', text: t('mt_admit'), onclick: () => MT.admit(id, l.waiting[0].uid) }) : el('button', { type: 'button', class: 'primary sm', text: t('mt_admitAll'), onclick: () => MT.admit(id, '', 'admitAll') }), el('button', { type: 'button', class: 'secondary sm', text: t('mt_viewLobby'), onclick: () => LC.callApi.setPanel('mtlobby') })));
  });

  // ---------- reminders: toast 15 minutes before, a ring when it starts ----------
  let ringBox = null, ringTimer = null;
  const stopRing = () => { clearInterval(ringTimer); ringTimer = null; if (ringBox) { ringBox.remove(); ringBox = null; } };
  LC.on('mt_reminder', (r) => {
    if (LC.callChan() === r.chan && LC.inCall()) return;
    if (r.kind === 'soon') {
      if (LC.ui.mtRemind === false) return; const n = Math.max(1, Math.round((r.start - Date.now()) / MIN));
      LC.toast(t('mt_soon', { title: r.title, n }), { ms: 15000, action: { label: t('mt_join'), fn: () => LC.meetings.join(r.id) } });
      if (LC.native && !LC.visible()) LC.native.notify(t('mt_reminderTitle'), t('mt_soon', { title: r.title, n }), r.chan);
      return;
    }
    if (LC.ui.mtRing === false) return; stopRing();
    ringBox = el('div', { class: 'ringbox mt-ring', role: 'alertdialog', 'aria-label': t('mt_starting') }, el('div', { class: 'ringhead' }, el('div', { class: 'mt-ringicon', 'aria-hidden': 'true' }, LC.icon('calendar_ltr', { filled: true })), el('div', { class: 'grow' }, el('b', { text: r.title }), el('div', { class: 'small muted', text: t('mt_starting') + ' · ' + LC.fmtTime(r.start) }))),
      el('div', { class: 'ringacts mt-ringacts' }, el('button', { type: 'button', class: 'secondary sm', text: t('mt_dismiss'), onclick: stopRing }), el('button', { type: 'button', class: 'primary sm withicon', onclick: () => { stopRing(); LC.meetings.join(r.id); } }, LC.icon('video'), el('span', { text: t('mt_join') }))));
    document.body.append(ringBox); const quiet = S.me.presence === 'dnd';
    if (!quiet) { LC.playSound('ring'); let n = 0; ringTimer = setInterval(() => { if (++n > 3) { clearInterval(ringTimer); return; } LC.playSound('ring'); }, 3500); }
    setTimeout(() => { if (ringBox) stopRing(); }, 60000);
    if (LC.native && !LC.visible()) LC.native.notify(t('mt_starting'), r.title, r.chan);
  });

  // ---------- join / leave sounds (from the callstate events) ----------
  let lastParts = null, chimeCtx = null;
  const chime = (up) => { MT.chimes = (MT.chimes || 0) + 1; try { chimeCtx ||= new (window.AudioContext || window.webkitAudioContext)(); const c = chimeCtx, f = up ? [660, 880] : [880, 587]; f.forEach((hz, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(0.05, c.currentTime + i * 0.13); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.13 + 0.25); o.connect(g); g.connect(c.destination); o.start(c.currentTime + i * 0.13); o.stop(c.currentTime + i * 0.13 + 0.3); }); } catch {} };
  MT.chime = chime;
  LC.on('callstate', (e) => {
    if (!LC.inCall() || e.chan !== LC.callChan()) { if (!LC.inCall()) lastParts = null; return; } if (!e.call) { lastParts = null; return; }
    const now = new Set(e.call.participants), on = LC.ui.mtSounds !== false && (!e.call.mt || e.call.mt.sounds !== false) && e.call.participants.length <= 40;
    if (lastParts && on) { const joined = [...now].some((x) => !lastParts.has(x) && x !== S.me.id), left = [...lastParts].some((x) => !now.has(x) && x !== S.me.id); if (joined) chime(true); else if (left) chime(false); }
    lastParts = now;
  });
  LC.on('call:left', () => { lastParts = null; });

  // ---------- invitation cards in the meeting chat ----------
  function refreshCards(id) { const set = MT.cards.get(id); if (!set) return; for (const n of [...set]) { if (!n.isConnected && set.size > 50) { set.delete(n); continue; } drawCard(n, id); } }
  function drawCard(node, id) {
    const m = MT.cache.get(id), kind = node.dataset.kind, occ = Number(node.dataset.occ) || 0;
    if (!m) { node.replaceChildren(el('div', { class: 'muted small', text: t('loading') })); MT.get(id).then(() => drawCard(node, id)).catch(() => node.replaceChildren(el('div', { class: 'muted small', text: t('mt_notFound') }))); return; }
    const when = occ ? MT.fmtRange(occ, occ + (m.end - m.start), m.allDay) : MT.whenText(m);
    const head = el('div', { class: 'mt-chead' }, el('div', { class: 'mt-cicon' + (kind === 'cancel' ? ' x' : ''), 'aria-hidden': 'true' }, LC.icon(kind === 'cancel' ? 'calendar_cancel' : 'calendar_ltr', { filled: kind !== 'cancel' })),
      el('div', { class: 'grow' }, el('div', { class: 'small muted', text: kind === 'cancel' ? (occ ? t('mt_occCancelled', { when: '' }).replace(/:\s*$/, '') : t('mt_cancelCard')) : kind === 'update' ? t('mt_updateCard') : t('mt_inviteCard') }), el('b', { class: 'mt-ctitle', text: m.title }), el('div', { class: 'small', text: when })));
    const acts = [];
    if (kind !== 'cancel' && !m.cancelled) {
      acts.push(el('button', { type: 'button', class: 'primary sm withicon', onclick: () => LC.meetings.join(m.id) }, LC.icon('video'), el('span', { text: t('mt_join') })));
      const rb = MT.rsvpBar(m); if (rb) acts.push(rb);
    }
    acts.push(el('button', { type: 'button', class: 'link', text: t('mt_viewDetails'), onclick: () => LC.meetings.open(m.id) }));
    put(node, head, node.dataset.note ? el('p', { class: 'small mt-cnote', text: node.dataset.note }) : null, m.isOrganizer && m.counts && kind !== 'cancel' ? el('div', { class: 'small muted', text: t('mt_responses', m.counts) }) : null, el('div', { class: 'mt-cacts' }, acts));
  }
  LC.ext.msgParts.push((m) => {
    if (!m.mtCard || !m.mtCard.meeting) return null; const id = m.mtCard.meeting;
    const node = el('div', { class: 'mt-card', 'data-kind': m.mtCard.kind || 'invite', 'data-occ': m.mtCard.occ || '', 'data-note': m.mtCard.note || '' });
    let set = MT.cards.get(id); if (!set) MT.cards.set(id, set = new Set()); set.add(node); drawCard(node, id); return node;
  });

  // ---------- the Meet pane (left app bar) ----------
  let recent = null, recentAt = 0;
  async function renderMeetPane(nav) {
    const now = Date.now(), up = MT.upcoming.filter((x) => x.end > now);
    const big = (icon, label, fn, cls) => el('button', { type: 'button', class: 'mt-bigbtn ' + (cls || ''), onclick: fn }, LC.icon(icon), el('span', { text: label }));
    const row = (x) => {
      const live = x.live, soon = !live && x.start - now < 15 * MIN && x.start > now, going = x.start <= now && x.end > now;
      return el('div', { class: 'mt-row' + (live ? ' live' : '') }, el('button', { type: 'button', class: 'mt-rowmain', onclick: () => LC.meetings.open(x.id) },
        el('div', { class: 'mt-rtime' }, el('b', { text: x.allDay ? t('mt_allDay') : LC.fmtTime(x.start) }), el('small', { text: x.allDay ? '' : LC.fmtTime(x.end) })),
        el('span', { class: 'itext' }, el('span', { class: 'name', text: x.title }), el('span', { class: 'prev', text: (live ? t('mt_live') + ' · ' : soon ? t('mt_startsIn', { n: Math.max(1, Math.round((x.start - now) / MIN)) }) + ' · ' : '') + (x.isOrganizer ? t('mt_youOrganize') : rsvpLabel(x.rsvp)) })),
        x.repeat ? LC.icon('arrow_repeat_all', { cls: 'mt-repicon', label: t('mt_repeatSeries') }) : null),
        live || soon || going ? el('button', { type: 'button', class: 'primary sm', text: t('mt_join'), 'aria-label': t('mt_join') + ' ' + x.title, onclick: () => LC.meetings.join(x.id) }) : null);
    };
    const groups = new Map(); for (const x of up.slice(0, 60)) { const k = new Date(x.start).toDateString() === new Date().toDateString() ? t('mt_today') : MT.fmtDay(x.start); (groups.get(k) || groups.set(k, []).get(k)).push(x); }
    nav.replaceChildren(el('div', { class: 'mt-paneacts' }, big('video', t('mt_meetNow'), () => LC.meetings.meetNow(), 'primary'), big('calendar_add', t('mt_schedule'), () => LC.meetings.schedule()), big('number_symbol', t('mt_joinWithId'), () => LC.meetings.joinWithId())),
      el('div', { class: 'sec' }, el('span', { class: 'sectitle', text: t('mt_upcoming') })), ...(up.length ? [...groups].flatMap(([k, list]) => [el('div', { class: 'cat', text: k }), ...list.map(row)]) : [el('p', { class: 'muted small pad', text: t('mt_noUpcoming') })]),
      el('div', { class: 'sec' }, el('span', { class: 'sectitle', text: t('mt_recent') })), el('div', { class: 'mt-recent' }, el('p', { class: 'muted small pad', text: recent && !recent.length ? t('mt_noRecent') : t('loading') })));
    if (!recent || Date.now() - recentAt > 30000) { try { recent = (await LC.api('/api/meetings/recent')).recent; recentAt = Date.now(); } catch { recent = []; } }
    const box = nav.querySelector('.mt-recent'); if (!box || S.pane !== 'meet') return;
    box.replaceChildren(...(recent.length ? recent.slice(0, 15).map((r) => el('div', { class: 'mt-row' }, el('button', { type: 'button', class: 'mt-rowmain', onclick: () => MT.recap && MT.recap(r.id, r.occ) }, el('div', { class: 'mt-rtime' }, el('b', { text: new Date(r.start).getDate() }), el('small', { text: new Date(r.start).toLocaleDateString(lang(), { month: 'short' }) })), el('span', { class: 'itext' }, el('span', { class: 'name', text: r.title }), el('span', { class: 'prev', text: LC.fmtTime(r.start) + (r.end ? ' · ' + MT.dur(r.end - r.start) : ' · ' + t('mt_live')) + ' · ' + t('peopleCount', { n: r.people }) })), LC.icon('clipboard_task', { cls: 'mt-repicon', label: t('mt_recap') })))) : [el('p', { class: 'muted small pad', text: t('mt_noRecent') })]));
  }
  LC.ext.panes.meet = { icon: 'video_person', label: () => t('mt_rail'), order: 45, render: renderMeetPane, badge: () => new Set(MT.upcoming.filter((x) => x.live).map((x) => x.id)).size,
    actions: () => [LC.ibtn('number_symbol', t('mt_joinWithId'), () => LC.meetings.joinWithId()), LC.ibtn('calendar_add', t('mt_schedule'), () => LC.meetings.schedule())] };
  const nowish = (x) => { const n = Date.now(); return n >= x.start - 30 * MIN && n < x.end + 60 * MIN; };
  LC.on('callstate', (e) => { if (MT.upcoming.some((x) => x.chan === e.chan)) { for (const x of MT.upcoming) if (x.chan === e.chan) x.live = !!(e.call && e.call.meeting === x.id) && nowish(x); if (S.pane === 'meet') LC.renderNav(); } });

  // ---------- Meet now / join with an ID ----------
  LC.meetings.meetNow = async (chan) => {
    if (LC.inCall()) return LC.toast(t('mt_alreadyIn'));
    const c = chan && S.channels.get(chan), title = c ? t('mt_meetingIn', { name: c.name }) : t('mt_meetingIn', { name: S.me.name });
    try { const r = await LC.api('/api/meetings/create', { instant: true, title, chan: c && !['meeting', 'breakout'].includes(c.kind) ? chan : '', tz: tzName() }); MT.cache.set(r.meeting.id, r.meeting); LC.meetings.join(r.meeting.id); } catch (e) { MT.fail(e); }
  };
  LC.meetings.joinWithId = () => {
    const code = el('input', { inputmode: 'numeric', maxlength: 20, placeholder: '123 456 789 012', 'aria-label': t('mt_meetingId'), autocomplete: 'off' }), pass = el('input', { maxlength: 20, placeholder: t('mt_passcode'), 'aria-label': t('mt_passcode'), autocomplete: 'off' }), err = el('div', { class: 'err', role: 'alert' });
    const go = async (e) => { e.preventDefault(); err.textContent = ''; try { const r = await LC.api('/api/meetings/lookup', { code: code.value, passcode: pass.value }); MT.cache.set(r.id, r.meeting); LC.closeModal(); LC.meetings.join(r.id); } catch (x) { err.textContent = x.message; } };
    LC.modal(el('form', { onsubmit: go }, el('h2', {}, LC.icon('number_symbol'), ' ' + t('mt_joinWithId')), el('p', { class: 'muted small', text: t('mt_joinIdHelp') }), MT.field(t('mt_meetingId'), code), MT.field(t('mt_passcode'), pass), err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'submit', class: 'primary', text: t('mt_join') }))));
  };

  // ---------- chat header: Meet (now / schedule), meeting chats get Details + Recap tabs ----------
  const kindOf = (chan) => { if (!chan || chan.startsWith('dm:')) return 'dm'; const c = S.channels.get(chan); return c ? c.kind || (c.members ? 'group' : 'channel') : ''; };
  const prefillFor = (chan) => { const k = kindOf(chan), c = S.channels.get(chan); if (k === 'dm') return { invitees: LC.peerOf(chan) === S.me.id ? [] : [LC.peerOf(chan)] }; if (c && c.members) return { invitees: c.members.filter((x) => x !== S.me.id), chan: k === 'group' ? chan : '' }; return { chan }; };
  LC.ext.headerActions.push((chan) => {
    const k = kindOf(chan);
    if (k === 'meeting') { const c = S.channels.get(chan); return [LC.ibtn('calendar_ltr', t('mt_viewDetails'), () => LC.meetings.open(c.meeting), { cls: 'icon mt-hdetails' })]; }
    if (k === 'breakout' || k === 'dm') return [];
    return [el('button', { type: 'button', class: 'secondary sm withicon mt-meetbtn', 'aria-haspopup': 'menu', title: t('mt_meet'), onclick: (e) => LC.menu(e.currentTarget, [{ icon: 'video', label: t('mt_meetNow'), fn: () => LC.meetings.meetNow(chan) }, { icon: 'calendar_add', label: t('mt_schedule'), fn: () => LC.meetings.schedule(prefillFor(chan)) }]) }, LC.icon('video_person'), el('span', { class: 'mt-meetlbl', text: t('mt_meet') }), LC.icon('chevron_down', { cls: 'mt-caret' }))];
  });
  LC.ext.headerMenu.push((chan) => (['meeting', 'breakout'].includes(kindOf(chan)) ? [] : [{ icon: 'calendar_add', label: t('mt_scheduleWith'), fn: () => LC.meetings.schedule(prefillFor(chan)) }]));
  LC.ext.chatMenu.push((e) => (e && e.c && e.c.kind === 'meeting' ? [{ icon: 'calendar_ltr', label: t('mt_viewDetails'), fn: () => LC.meetings.open(e.c.meeting) }] : []));
  const isMeetingChat = (chan) => kindOf(chan) === 'meeting';
  LC.ext.tabs.push({ key: 'mtdetails', icon: 'calendar_ltr', label: () => t('mt_details2'), order: 1, when: isMeetingChat, render: async (host, chan) => {
    const id = S.channels.get(chan).meeting; host.replaceChildren(el('p', { class: 'muted', text: t('loading') }));
    let m; try { m = await MT.get(id, true); } catch (e) { return host.replaceChildren(el('p', { class: 'err', text: e.message })); }
    const link = await MT.link(id); if (S.chan !== chan) return;
    put(host, el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('calendar_ltr'), ' ' + m.title), el('div', { class: 'acts' }, !m.cancelled ? el('button', { type: 'button', class: 'primary withicon', onclick: () => LC.meetings.join(id) }, LC.icon('video'), el('span', { text: t('mt_join') })) : el('span', { class: 'pill late', text: t('mt_cancelled') }), el('button', { type: 'button', class: 'secondary withicon', onclick: () => LC.meetings.open(id) }, LC.icon('open'), el('span', { text: t('mt_viewDetails') })), m.isOrganizer && !m.cancelled ? el('button', { type: 'button', class: 'secondary withicon', onclick: () => LC.meetings.edit(id) }, LC.icon('edit'), el('span', { text: t('mt_edit') })) : null)),
      el('p', { class: 'muted', text: MT.whenText(m) }), m.location ? el('p', { text: m.location }) : null, MT.rsvpBar(m, () => LC.renderTab && LC.renderTab('mtdetails')), el('h3', { text: t('mt_link') }), MT.joinInfo(m, link), m.details ? el('div', { class: 'mt-detailstext' }, LC.renderText(m.details)) : null,
      MT.agendaView ? MT.agendaView(id) : null);
  } });
  LC.on('mt_meeting', (e) => { if (S.tab === 'mtdetails' && S.chan && (S.channels.get(S.chan) || {}).meeting === e.id && LC.renderTab) LC.renderTab('mtdetails'); });

  // ---------- settings ----------
  LC.ext.settingsTabs.push({ key: 'meetings', icon: 'video_person', label: () => t('mt_settings'), order: 35, render: () => {
    const sel = MT.select([['meetings', t('mt_setPrejoinMeetings')], ['all', t('mt_setPrejoinAll')]], LC.ui.mtPrejoin || 'meetings', t('mt_setPrejoin'), (v) => LC.setUi({ mtPrejoin: v }));
    return el('div', {}, MT.field(t('mt_setPrejoin'), sel), MT.check(t('mt_setSounds'), LC.ui.mtSounds !== false, (v) => { LC.setUi({ mtSounds: v }); if (v) chime(true); }).el, MT.check(t('mt_setRing'), LC.ui.mtRing !== false, (v) => LC.setUi({ mtRing: v })).el, MT.check(t('mt_setReminders'), LC.ui.mtRemind !== false, (v) => LC.setUi({ mtRemind: v })).el);
  } });

  // ---------- the host's approval prompt says which meeting a newcomer wants ----------
  LC.on('joinrequest', (r) => { if (!r.meeting || !LC.isAdmin()) return; MT.reqs[r.id] = { meeting: r.meeting, title: r.meetingTitle }; LC.toast(t('mt_reqToast', { name: r.name, title: r.meetingTitle || '' }), { ms: 12000, action: { label: t('review'), fn: () => LC.adminPanel('requests') } }); });
  LC.on('joindecided', (r) => { delete MT.reqs[r.id]; });
  LC.ext.adminSections.push({ tab: 'requests', order: 5, render: () => {
    const list = (S.pendingReqs || []).filter((r) => MT.reqs[r.id] || r.meeting); if (!list.length) return null;
    return el('div', { class: 'mt-reqs' }, el('h3', {}, LC.icon('video_person'), ' ' + t('mt_reqSection')), ...list.map((r) => el('div', { class: 'req' }, el('div', { class: 'grow' }, el('b', { text: r.name }), el('div', { class: 'muted small', text: t('mt_reqMeeting', { title: (MT.reqs[r.id] || {}).title || r.meetingTitle || '' }) })))));
  } });

  // ---------- deep links: #meet=<id> (also for people who still have to join the session), #register=<id> ----------
  const parseLink = (h) => { const q = new URLSearchParams(String(h || '').replace(/^#/, '').replace(/^.*?(?=(meet|register)=)/, '')); const meet = q.get('meet'), reg = q.get('register'); return /^[a-f0-9]{16}$/.test(meet || '') ? { meet, companion: q.get('companion') === '1' } : /^[a-f0-9]{16}$/.test(reg || '') ? { register: reg } : null; };
  const atLoad = parseLink(location.hash);
  if (atLoad) {
    LC.ls.set('mt_link', { ...atLoad, at: Date.now() });
    if (!S.token && atLoad.meet) { fetch('/api/meetings/intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: S.deviceId, meeting: atLoad.meet }) }).catch(() => {}); }
    document.addEventListener('DOMContentLoaded', () => { if (S.token) return; const f = $('#loginForm'), w = $('#waiting .card'); for (const host of [f, w]) if (host) host.insertBefore(el('p', { class: 'hostnote mt-guestnote', text: t('mt_guestNote') }), host.querySelector('button')); });
  }
  const clearHash = () => { if (parseLink(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
  function handleLink(l) { if (!l) return; setTimeout(() => { if (l.register) LC.meetings.register ? LC.meetings.register(l.register) : null; else LC.meetings.join(l.meet, { companion: l.companion }); }, 400); }
  LC.on('init', () => { const l = LC.ls.get('mt_link'); LC.ls.del('mt_link'); clearHash(); if (l && Date.now() - (l.at || 0) < 3600000) handleLink(l); });
  window.addEventListener('hashchange', () => { const l = parseLink(location.hash); if (l && S.me) { clearHash(); handleLink(l); } });
})();
