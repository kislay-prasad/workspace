'use strict';
// Calendar (section 12): one calendar across all chats (app bar → Calendar) and each chat's Calendar tab. Day, work week,
// week and month views; all-day and repeating events; time zones (+ a second time-zone column); drag to move and resize;
// colour categories; Accept / Tentative / Decline; Join; scheduling assistant (free/busy); .ics export and import.
// Meetings (meetings area) appear next to events when LC.meetings and /api/meetings exist. Server: lib/routes-calendar.js.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), CC = LC.calcore;
  const CAL = (LC.calendar = {});
  LC.addEvents('fl_events', 'fl_calprefs');
  LC.addStrings('en', {
    fl_cal: 'Calendar', fl_today: 'Today', fl_prevRange: 'Previous', fl_nextRange: 'Next', fl_pickDate: 'Go to a date', fl_view: 'Calendar view', fl_vDay: 'Day', fl_vWorkweek: 'Work week', fl_vWeek: 'Week', fl_vMonth: 'Month',
    fl_newEvent: 'New event', fl_newMeeting: 'New meeting', fl_allDay: 'All day', fl_more: '+{n} more', fl_upcoming: 'Upcoming', fl_noUpcoming: 'Nothing coming up. Select Add event to plan something.', fl_calMore: 'More calendar options',
    fl_eTitle: 'Add a title', fl_eChat: 'Chat', fl_eStart: 'Start', fl_eEnd: 'End', fl_eDate: 'date', fl_eTime: 'time', fl_eTz: 'Time zone', fl_eRepeat: 'Repeat', fl_eLocation: 'Add a location', fl_eOnline: 'Online: join with this chat’s call', fl_eNotes: 'Add details for the event',
    fl_eCat: 'Category (only you see it)', fl_none: 'None', fl_rNone: 'Does not repeat', fl_rDaily: 'Every day', fl_rWeekdays: 'Every weekday (Mon–Fri)', fl_rWeekly: 'Every week', fl_rMonthly: 'Every month', fl_rYearly: 'Every year', fl_rEvery: 'Repeat every', fl_rDays: 'day(s)', fl_rWeeks: 'week(s)', fl_rMonths: 'month(s)', fl_rYears: 'year(s)', fl_rOn: 'On',
    fl_rEnds: 'Ends', fl_rNever: 'Never', fl_rOnDate: 'On a date', fl_rAfter: 'After', fl_rTimesLabel: 'times', fl_rEveryN: 'Every {n} {unit}', fl_rOnDays: 'on {days}', fl_rUntil: 'until {date}', fl_rTimes: '{n} times', fl_rMonthDay: 'on day {d}', fl_series: 'Editing the whole series.',
    fl_saveEvent: 'Save', fl_editEvent: 'Edit event', fl_deleteEvent: 'Delete event', fl_confirmDelEvent: 'Delete “{title}”?', fl_delOcc: 'Delete this occurrence', fl_delSeries: 'Delete the series', fl_confirmDelSeries: 'Delete every occurrence of “{title}”?', fl_moveSeries: 'Move every occurrence of this series?',
    fl_accept: 'Accept', fl_tentative: 'Tentative', fl_decline: 'Decline', fl_accepted: 'Accepted', fl_tentativeL: 'Tentative', fl_declined: 'Declined', fl_noReply: 'No response yet', fl_responses: 'Responses', fl_join: 'Join', fl_openChat: 'Open chat', fl_openMeeting: 'Meeting details', fl_categorize: 'Categorize',
    fl_in: 'In {chat}', fl_by: 'By {name}', fl_organizer: 'Organizer: {name}', fl_yourTz: 'Your time zone', fl_tz2: 'Second time zone', fl_tz2Pick: 'Show a second time zone', fl_tz2None: 'No second time zone', fl_categories: 'Categories', fl_catHelp: 'Name the colours the way you use them. Only you see these names and the colours you give events.',
    fl_cat_red: 'Red category', fl_cat_orange: 'Orange category', fl_cat_yellow: 'Yellow category', fl_cat_green: 'Green category', fl_cat_blue: 'Blue category', fl_cat_purple: 'Purple category',
    fl_export: 'Export calendar (.ics)', fl_exportChat: 'Export this chat’s events (.ics)', fl_import: 'Import an .ics file…', fl_importInto: 'Import events into', fl_imported: 'Imported {n} event(s).', fl_importPartial: '{n} repeat rule(s) were too complex and were imported as single events.',
    fl_assistant: 'Scheduling assistant', fl_findTime: 'Find a time when people are free', fl_people: 'People', fl_day: 'Day', fl_show: 'Show', fl_busy: 'Busy', fl_tentBusy: 'Tentative', fl_free: 'Free', fl_everyone: 'All selected', fl_pickSlot: 'Pick a free time, then schedule.', fl_schedule: 'Schedule',
    fl_noPeople: 'Pick at least one person.', fl_meeting: 'Meeting', fl_now: 'Now', fl_noEventsDay: 'No events', fl_calendars: 'Calendars', fl_meetings: 'Meetings', fl_hideCal: 'Show {name}', fl_cantMove: 'Only the person who added this event (or an admin) can move it.', fl_evMoved: 'Event moved.',
    fl_ra_yes: '{name} accepted “{title}”', fl_ra_maybe: '{name} might come to “{title}”', fl_ra_no: '{name} declined “{title}”', fl_week: 'Week {n}', fl_wkShort: 'W', fl_minRemind: '{n} min before', fl_remindDay: '1 day before', fl_remindHour: '1 hour before', fl_noRemind: 'No reminder', fl_reminder: 'Reminder',
  });
  LC.addStrings('hi', { fl_cal: 'कैलेंडर', fl_today: 'आज', fl_vDay: 'दिन', fl_vWorkweek: 'कार्य सप्ताह', fl_vWeek: 'सप्ताह', fl_vMonth: 'महीना', fl_newEvent: 'नया इवेंट', fl_newMeeting: 'नई मीटिंग', fl_allDay: 'पूरा दिन', fl_accept: 'स्वीकारें', fl_tentative: 'शायद', fl_decline: 'अस्वीकारें', fl_join: 'जुड़ें', fl_upcoming: 'आने वाले', fl_saveEvent: 'सहेजें', fl_eTitle: 'शीर्षक जोड़ें' });
  LC.addStrings('es', { fl_cal: 'Calendario', fl_today: 'Hoy', fl_vDay: 'Día', fl_vWorkweek: 'Semana laboral', fl_vWeek: 'Semana', fl_vMonth: 'Mes', fl_newEvent: 'Nuevo evento', fl_newMeeting: 'Nueva reunión', fl_allDay: 'Todo el día', fl_accept: 'Aceptar', fl_tentative: 'Provisional', fl_decline: 'Rechazar', fl_join: 'Unirse', fl_upcoming: 'Próximos', fl_saveEvent: 'Guardar', fl_eTitle: 'Agregar un título' });

  const MIN = 6e4, DAY = 864e5, HH = 48; // pixels per hour
  const fail = (e) => LC.toast(e.message || String(e));
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  const PHONE = () => matchMedia('(max-width: 760px)').matches;
  const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monOf = (d) => addDays(sod(d), -((new Date(d).getDay() + 6) % 7));
  const dk = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
  const isToday = (d) => dk(d) === dk(new Date());
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmt = (ts, o) => new Date(ts).toLocaleString(lang(), o);
  const fTime = (ts) => LC.fmtTime(ts);
  const fDay = (ts) => fmt(ts, { weekday: 'short', month: 'short', day: 'numeric' });
  let prefs = { cats: {}, catOf: {}, tz2: '', view: '' };
  const CATS = [['red', '#d13438'], ['orange', '#ca5010'], ['yellow', '#b38f00'], ['green', '#498205'], ['blue', '#0078d4'], ['purple', '#8764b8']];
  const catColor = (c) => (CATS.find((x) => x[0] === c) || [])[1] || '';
  const catName = (c) => prefs.cats[c] || t('fl_cat_' + c);
  const itemKey = (it) => (it.kind === 'meeting' ? 'm:' + it.id : `e:${it.chan}/${it.id}`);
  const catOf = (it) => prefs.catOf[itemKey(it)] || '';
  const hidden = () => new Set(LC.ls.get('fl_calhide', []));
  const chatTitle = (chan) => (chan ? LC.chanInfo(chan).title : '');
  LC.on('init', (d) => { if (d.flCal) prefs = d.flCal; });
  LC.on('fl_calprefs', (p) => { prefs = p; redrawAll(); });
  const savePrefs = (patch) => LC.api('/api/calendar/prefs', patch).then((p) => { prefs = p; redrawAll(); }).catch(fail);

  // ---------- data: events (+ meetings) as display items ----------
  let meetingsApi = true;
  async function fetchMeetings(from, to) {
    if (!LC.meetings || !meetingsApi) return [];
    try { return (await LC.api(`/api/meetings?from=${from}&to=${to}`)).meetings || []; } catch (e) { if (e.status === 404) meetingsApi = false; return []; }
  }
  const evItem = (e) => ({ kind: 'event', key: `${e.chan}|${e.id}|${e.occ}`, id: e.id, chan: e.chan, occ: e.occ, title: e.title, start: e.start, end: e.end, allDay: !!e.allDay, utcDay: !!e.allDay, tz: e.tz, location: e.location, online: e.online, notes: e.notes, rsvp: (e.rsvp || {})[S.me.id] || '', rsvps: e.rsvp || {}, repeat: e.repeat, series: e.series, canEdit: e.canEdit, by: e.by, remind: e.remind });
  const mtItem = (m) => ({ kind: 'meeting', key: `m|${m.id}|${m.occurrence}`, id: m.id, chan: m.chan, occ: m.occurrence, title: m.title, start: m.start, end: m.end, allDay: !!m.allDay, utcDay: false, location: m.location || '', online: true, live: !!m.live, rsvp: m.rsvp || '', isOrganizer: !!m.isOrganizer, organizer: m.organizer, repeat: m.repeat });
  const longOrAllDay = (it) => it.allDay || it.end - it.start >= DAY;
  function daysOf(it, from, to) { // local dates (midnight) the item covers inside [from, to)
    const out = []; let a, b;
    if (it.allDay && it.utcDay) { const s = new Date(it.start), e = new Date(it.end); a = new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()); b = new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()); }
    else { a = sod(it.start); b = addDays(sod(Math.max(it.start, it.end - 1)), 1); }
    for (let d = a; d < b && out.length < 400; d = addDays(d, 1)) if (d >= from && d < to) out.push(d);
    return out;
  }
  const timeRange = (it) => (it.allDay ? t('fl_allDay') : `${fTime(it.start)} – ${fTime(it.end)}`);
  const adDays = (it) => daysOf(it, new Date(0), new Date(8.64e15));
  const whenText = (it) => {
    if (it.allDay) { const ds = adDays(it); return (ds.length > 1 ? `${fDay(ds[0])} – ${fDay(ds[ds.length - 1])}` : fDay(ds[0] || it.start)) + ' · ' + t('fl_allDay'); }
    return `${fDay(it.start)} · ${fTime(it.start)} – ${sod(it.start).getTime() === sod(it.end - 1).getTime() ? fTime(it.end) : fDay(it.end) + ' ' + fTime(it.end)}`;
  };
  const joinable = (it) => (it.kind === 'meeting' || it.online) && Date.now() >= it.start - 15 * MIN && Date.now() < it.end;
  CAL.join = (it) => { if (it.kind === 'meeting' && LC.meetings && LC.meetings.join) return LC.meetings.join(it.id); if (it.chan && LC.startCall) return LC.startCall(it.chan, 'video'); };
  function repeatText(r, start) {
    if (!r || !r.freq) return ''; const n = r.interval || 1, dn = (d) => new Date(2024, 0, 1 + ((d + 6) % 7)).toLocaleDateString(lang(), { weekday: 'short' });
    let s = r.freq === 'weekdays' ? t('fl_rWeekdays') : n === 1 ? t({ daily: 'fl_rDaily', weekly: 'fl_rWeekly', monthly: 'fl_rMonthly', yearly: 'fl_rYearly' }[r.freq]) : t('fl_rEveryN', { n, unit: t({ daily: 'fl_rDays', weekly: 'fl_rWeeks', monthly: 'fl_rMonths', yearly: 'fl_rYears' }[r.freq]) });
    if (r.freq === 'weekly' && r.days && r.days.length) s += ' ' + t('fl_rOnDays', { days: r.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(dn).join(', ') });
    if (r.freq === 'monthly' && start) s += ' ' + t('fl_rMonthDay', { d: new Date(start).getDate() });
    if (r.count) s += ' · ' + t('fl_rTimes', { n: r.count }); else if (r.until) s += ' · ' + t('fl_rUntil', { date: fDay(r.until) });
    return s;
  }

  // ---------- a calendar view (the app's main area, or a chat's tab) ----------
  const VIEWS = [['day', 'fl_vDay', 'calendar_day'], ['workweek', 'fl_vWorkweek', 'calendar_work_week'], ['week', 'fl_vWeek', 'calendar_week_numbers'], ['month', 'fl_vMonth', 'calendar_month']];
  const live = new Set(); // mounted views
  function redrawAll() { for (const v of [...live]) { if (!v.root.isConnected) { live.delete(v); continue; } v.draw(); } }
  function mount(host, o = {}) {
    const lsKey = o.chan ? 'fl_calview_tab' : 'fl_calview';
    const st = { view: LC.ls.get(lsKey, null) || (o.chan ? 'month' : prefs.view || (PHONE() ? 'day' : 'workweek')), date: sod(new Date()), items: [], loadedKey: '', loading: false };
    if (PHONE() && !o.chan && (st.view === 'week' || st.view === 'workweek')) st.view = 'day';
    const root = el('div', { class: 'fl-cal' + (o.chan ? ' in-tab' : ''), 'data-view': st.view, 'data-chan': o.chan || '' });
    const v = { root, st, o, draw, reload: () => load(true), goto: (d) => { st.date = sod(d); load(); } };
    host.replaceChildren(root); live.add(v);
    function range() {
      const d = sod(st.date);
      if (st.view === 'day') return [d, addDays(d, 1)];
      if (st.view === 'workweek') { const m = monOf(d); return [m, addDays(m, 5)]; }
      if (st.view === 'week') { const m = monOf(d); return [m, addDays(m, 7)]; }
      const m = monOf(new Date(d.getFullYear(), d.getMonth(), 1)); return [m, addDays(m, 42)];
    }
    async function load(force) { // the visible range (+ for a chat tab, the next 60 days for its Upcoming list)
      const [from, to] = range(), hr = Math.floor(Date.now() / 3600000) * 3600000, ranges = [[from.getTime(), to.getTime()], ...(o.chan ? [[hr - 3600000, hr + 60 * DAY]] : [])], key = ranges.map((r) => r.join('-')).join('|');
      if (!force && key === st.loadedKey) return draw();
      st.loading = true;
      try {
        const got = await Promise.all(ranges.map(async ([a, b]) => { const [ev, ms] = await Promise.all([LC.api(`/api/calendar?from=${a}&to=${b}${o.chan ? '&chan=' + encodeURIComponent(o.chan) : ''}`), fetchMeetings(a, b)]); return [...ev.events.map(evItem), ...ms.filter((m) => !o.chan || m.chan === o.chan).map(mtItem)]; }));
        const all = new Map(); for (const it of got.flat()) all.set(it.key, it);
        st.items = [...all.values()].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)); st.loadedKey = key;
      } catch (e) { st.error = e.message; }
      st.loading = false; if (root.isConnected) draw(); else live.delete(v);
      if (!o.chan && S.app === 'calendar') LC.renderNav();
    }
    const visibleItems = () => { const h = o.chan ? new Set() : hidden(); return st.items.filter((it) => !(it.kind === 'meeting' ? h.has('meetings') : h.has(it.chan))); };
    function title() {
      const [from, to] = range(), last = addDays(to, -1);
      if (st.view === 'day') return fmt(from, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      if (st.view === 'month') return fmt(st.date, { month: 'long', year: 'numeric' });
      return from.getMonth() === last.getMonth() ? `${fmt(from, { month: 'long', day: 'numeric' })} – ${last.getDate()}, ${last.getFullYear()}` : `${fmt(from, { month: 'short', day: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    function step(n) { const d = new Date(st.date); if (st.view === 'day') d.setDate(d.getDate() + n); else if (st.view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + n); } else d.setDate(d.getDate() + 7 * n); st.date = sod(d); load(); }
    function toolbar() {
      const pick = (e) => { // like Teams' month drop-down: a date picker
        const inp = el('input', { type: 'date', value: ymd(st.date), 'aria-label': t('fl_pickDate'), class: 'fl-datepick' });
        const go = () => { if (!inp.value) return; const [y, m, d] = inp.value.split('-').map(Number); LC.closeModal(); st.date = new Date(y, m - 1, d); load(); };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } });
        LC.modal([el('h2', {}, LC.icon('calendar_ltr'), ' ' + t('fl_pickDate')), inp, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('go'), onclick: go }))], { label: t('fl_pickDate') }); void e;
      };
      const date = el('button', { class: 'fl-caltitle', 'aria-haspopup': 'dialog', title: t('fl_pickDate'), onclick: pick }, el('span', { text: title() }), LC.icon('chevron_down'));
      const viewSel = el('select', { class: 'fl-viewsel', 'aria-label': t('fl_view'), onchange: (e) => { st.view = e.target.value; LC.ls.set(lsKey, st.view); root.dataset.view = st.view; load(); } }, VIEWS.map(([k, l]) => el('option', { value: k, text: t(l) }))); viewSel.value = st.view;
      const canAdd = !o.chan || canWrite(o.chan);
      return el('div', { class: 'fl-calbar', role: 'toolbar', 'aria-label': t('fl_cal') },
        el('button', { class: 'secondary sm withicon fl-todaybtn', onclick: () => { st.date = sod(new Date()); load(); } }, LC.icon('calendar_today'), el('span', { text: t('fl_today') })),
        LC.ibtn('chevron_left', t('fl_prevRange'), () => step(-1)), LC.ibtn('chevron_right', t('fl_nextRange'), () => step(1)),
        el('h2', { class: 'fl-calh' }, date), el('span', { class: 'sr-only', 'aria-live': 'polite', text: title() }), el('span', { class: 'grow' }), viewSel,
        canAdd ? el('button', { class: (o.chan ? 'primary' : 'secondary') + ' sm withicon', onclick: () => newItem({ kind: 'event' }) }, LC.icon('calendar_add'), el('span', { text: o.chan ? t('addEvent') : t('fl_newEvent') })) : null,
        !o.chan ? el('button', { class: 'primary sm withicon', onclick: () => newItem({ kind: 'meeting' }) }, LC.icon(LC.hasIcon('video_person') ? 'video_person' : 'video'), el('span', { text: t('fl_newMeeting') })) : null,
        LC.ibtn('more_horizontal', t('fl_calMore'), (e) => moreMenu(e.currentTarget, o.chan), { menu: true }));
    }
    function draw() {
      if (!root.isConnected && st.loadedKey) { live.delete(v); return; }
      if (st.dragging) { st.pending = true; return; } // never redraw under the pointer (live updates wait until the drag ends)
      const [from, to] = range(), body = st.view === 'month' ? monthView(from, to) : weekView(from, to), was = root.querySelector('.fl-wkscroll'), same = st.drawn === st.view + from.getTime();
      const keep = was && same ? was.scrollTop : null; st.drawn = st.view + from.getTime();
      root.dataset.view = st.view;
      root.replaceChildren(...[toolbar(), st.error ? el('p', { class: 'err', text: st.error }) : null, body, o.chan ? agenda() : null].filter(Boolean));
      st.error = '';
      if (st.view !== 'month') { const sc = root.querySelector('.fl-wkscroll'); if (sc) { const h = new Date().getHours(); sc.scrollTop = keep !== null ? keep : (isRangeToday(from, to) && h >= 16 ? h - 3 : 7.5) * HH; } }
    }
    const done = () => { st.dragging = false; if (st.pending) { st.pending = false; setTimeout(draw, 0); } };
    const isRangeToday = (from, to) => Date.now() >= from.getTime() && Date.now() < to.getTime();
    // ----- new items (button, or click-and-drag on an empty slot) -----
    function newItem(p) {
      const s = p.start || (() => { const d = new Date(st.date); const now = new Date(); d.setHours(isToday(d) ? now.getHours() + 1 : 9, 0, 0, 0); return d.getTime(); })(), e = p.end || s + 30 * MIN;
      if (p.kind === 'meeting' && LC.meetings && LC.meetings.schedule) return LC.meetings.schedule({ start: s, end: e, chan: o.chan || undefined, invitees: p.invitees, allDay: p.allDay || undefined });
      eventDialog(null, { start: s, end: e, allDay: !!p.allDay, chan: o.chan || p.chan || null, fixedChan: !!o.chan });
    }
    function slotMenu(anchor, s, e, allDay) {
      if (o.chan || !(LC.meetings && LC.meetings.schedule)) return newItem({ kind: 'event', start: s, end: e, allDay });
      LC.menu(anchor, [{ icon: 'video', label: t('fl_newMeeting'), fn: () => newItem({ kind: 'meeting', start: s, end: e, allDay }) }, { icon: 'calendar_add', label: t('fl_newEvent'), fn: () => newItem({ kind: 'event', start: s, end: e, allDay }) }]);
    }
    // ----- day / work week / week -----
    function weekView(from, to) {
      const days = []; for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
      const items = visibleItems(), tz2 = prefs.tz2 && prefs.tz2 !== myTz() ? prefs.tz2 : '', cols = days.length;
      const zoneLabel = (tz) => { const off = CC.offset(Date.now(), tz) / 3600000; return 'UTC' + (off >= 0 ? '+' : '−') + Math.abs(off).toString().replace('.5', ':30').replace('.75', ':45'); };
      const head = el('div', { class: 'fl-wkhead', style: `--cols:${cols}` }, el('div', { class: 'fl-corner' + (tz2 ? ' two' : '') }, tz2 ? [el('span', { text: zoneLabel(tz2), title: tz2 }), el('span', { text: zoneLabel(myTz()), title: myTz() })] : null),
        ...days.map((d) => el('button', { class: 'fl-dayhead' + (isToday(d) ? ' today' : ''), 'aria-label': fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }), onclick: () => { st.view = 'day'; st.date = d; LC.ls.set(lsKey, 'day'); load(); } }, el('span', { class: 'fl-dnum', text: d.getDate() }), el('span', { class: 'fl-dname', text: fmt(d, { weekday: cols > 1 ? 'short' : 'long' }) }))));
      const adItems = items.filter(longOrAllDay), timed = items.filter((it) => !longOrAllDay(it));
      const adRow = el('div', { class: 'fl-allday' + (tz2 ? ' two' : ''), style: `--cols:${cols}` }, el('div', { class: 'fl-corner small', text: t('fl_allDay') }), ...days.map((d) => {
        const cell = el('div', { class: 'fl-adcell', 'data-day': dk(d), onclick: (e) => { if (e.target === cell && (!o.chan || canWrite(o.chan))) slotMenu(e, Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + DAY, true); } });
        for (const it of adItems) if (daysOf(it, d, addDays(d, 1)).length) cell.append(chip(it, d));
        return cell;
      }));
      const gutter = (tz) => el('div', { class: 'fl-gutter' + (tz ? ' tz2' : '') }, Array.from({ length: 24 }, (_, h) => { const at = new Date(days[0]); at.setHours(h, 0, 0, 0); const lbl = tz ? CC.wall(at.getTime(), tz) : null; return el('div', { class: 'fl-hour', style: `top:${h * HH}px` }, h === 0 && !tz ? '' : el('span', { text: tz ? `${lbl.h}:${pad(lbl.mi)}` : fmt(at, { hour: 'numeric' }) })); }));
      const grid = el('div', { class: 'fl-wkgrid', style: `--cols:${cols};height:${24 * HH}px` }, tz2 ? gutter(tz2) : null, gutter(null), ...days.map((d) => dayCol(d, timed)));
      return el('div', { class: 'fl-wk' + (tz2 ? ' two' : '') }, head, adRow, el('div', { class: 'fl-wkscroll' }, grid));
    }
    function layout(segs) { // side by side when events overlap
      segs.sort((a, b) => a.s - b.s || b.e - a.e); const out = []; let cluster = [], end = -1;
      const flush = () => { const cols = []; for (const g of cluster) { let c = cols.findIndex((x) => x <= g.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = g.e; g.col = c; } for (const g of cluster) g.cols = cols.length; out.push(...cluster); cluster = []; };
      for (const g of segs) { if (cluster.length && g.s >= end) { flush(); end = -1; } cluster.push(g); end = Math.max(end, g.e); }
      if (cluster.length) flush(); return out;
    }
    function dayCol(d, timed) {
      const d0 = d.getTime(), d1 = addDays(d, 1).getTime(), segs = [];
      for (const it of timed) { const s = Math.max(it.start, d0), e = Math.min(Math.max(it.end, it.start + 15 * MIN), d1); if (e > s) segs.push({ it, s, e: Math.max(e, s + 22 * MIN), realE: e }); }
      const col = el('div', { class: 'fl-col' + (isToday(d) ? ' today' : '') + ([0, 6].includes(d.getDay()) ? ' weekend' : ''), 'data-day': dk(d), 'aria-label': fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }), role: 'group' });
      for (const g of layout(segs)) col.append(block(g, d0));
      if (isToday(d)) { const m = (Date.now() - d0) / MIN; col.append(el('div', { class: 'fl-nowline', style: `top:${(m / 60) * HH}px`, title: t('fl_now'), 'aria-hidden': 'true' })); }
      if (!o.chan || canWrite(o.chan)) slotSelect(col, d0);
      return col;
    }
    function slotSelect(col, d0) { // click or drag on an empty part of a day: new event / meeting with that time
      col.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target !== col || e.pointerType === 'touch') return;
        const r = col.getBoundingClientRect(), at = (y) => Math.max(0, Math.min(48, Math.floor(((y - r.top) / HH) * 2))), a = at(e.clientY); let b = a;
        const sel = el('div', { class: 'fl-sel' }); col.append(sel);
        const paint = () => { const lo = Math.min(a, b), hi = Math.max(a, b) + 1; sel.style.top = (lo * HH) / 2 + 'px'; sel.style.height = ((hi - lo) * HH) / 2 + 'px'; sel.textContent = `${fTime(d0 + lo * 30 * MIN)} – ${fTime(d0 + hi * 30 * MIN)}`; };
        paint(); st.dragging = true;
        const mv = (ev) => { b = Math.min(47, at(ev.clientY)); paint(); };
        const upf = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); window.removeEventListener('pointercancel', upf); done(); const lo = Math.min(a, b), hi = Math.max(a, b) + 1; const s = new Date(d0); s.setMinutes(lo * 30); const en = new Date(d0); en.setMinutes(hi * 30); setTimeout(() => sel.remove(), 400); if (ev.type === 'pointerup') slotMenu({ x: ev.clientX, y: ev.clientY }, s.getTime(), en.getTime(), false); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upf); window.addEventListener('pointercancel', upf);
      });
    }
    const colorOf = (it) => catColor(catOf(it));
    function block(g, d0) {
      const it = g.it, top = ((g.s - d0) / MIN / 60) * HH, h = Math.max(20, ((g.e - g.s) / MIN / 60) * HH - 2), c = colorOf(it), can = it.kind === 'event' && it.canEdit;
      const b = el('div', { class: `fl-ev${it.kind === 'meeting' ? ' mt' : ''}${it.rsvp === 'maybe' ? ' tent' : ''}${it.rsvp === 'no' ? ' declined' : ''}${can ? ' can' : ''}${h < 34 ? ' short' : ''}`, role: 'button', tabindex: '0', 'data-key': it.key,
        'aria-label': `${it.title}, ${timeRange(it)}${it.location ? ', ' + it.location : ''}${it.chan && !o.chan ? ', ' + chatTitle(it.chan) : ''}`,
        style: `top:${top}px;height:${h}px;left:calc(${(g.col * 100) / g.cols}% + 2px);width:calc(${100 / g.cols}% - 5px)${c ? ';--c:' + c : ''}`,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); peek(it, b); } } },
        el('div', { class: 'fl-evt' }, it.kind === 'meeting' || it.online ? LC.icon('video', { cls: 'fl-evi' }) : it.repeat ? LC.icon('arrow_repeat_all', { cls: 'fl-evi' }) : null, el('span', { text: it.title })),
        h >= 34 ? el('div', { class: 'fl-evs', text: `${fTime(it.start)} – ${fTime(it.end)}${it.location ? ' · ' + it.location : ''}${!o.chan && it.chan && it.kind === 'event' ? ' · ' + chatTitle(it.chan) : ''}` }) : null,
        joinable(it) && h >= 44 ? el('button', { class: 'primary sm fl-evjoin', text: t('fl_join'), 'aria-label': t('fl_join') + ' ' + it.title, onclick: (e) => { e.stopPropagation(); CAL.join(it); } }) : null,
        can && g.realE >= it.end ? el('div', { class: 'fl-resize', 'aria-hidden': 'true' }) : null);
      dragTimed(b, it, g);
      return b;
    }
    function dragTimed(b, it, g) {
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const resize = e.target.classList.contains('fl-resize'), can = it.kind === 'event' && it.canEdit && e.pointerType !== 'touch';
        const x0 = e.clientX, y0 = e.clientY; let moved = false, dMin = 0, dDay = 0;
        const cols = [...root.querySelectorAll('.fl-col')], rects = cols.map((c) => c.getBoundingClientRect()), c0 = cols.indexOf(b.parentElement), h0 = b.offsetHeight;
        st.dragging = true; if (e.pointerType !== 'touch') e.preventDefault(); // touch: let the page scroll
        const mv = (ev) => {
          const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return; if (!can) return;
          moved = true; b.classList.add('fl-dragging'); dMin = Math.round(((dy / HH) * 60) / 15) * 15;
          if (resize) { b.style.height = Math.max(18, h0 + (dMin / 60) * HH) + 'px'; return; }
          const ci = rects.findIndex((r) => ev.clientX >= r.left && ev.clientX < r.right); if (ci >= 0) dDay = ci - c0;
          b.style.transform = `translate(${rects[c0 + dDay] ? rects[c0 + dDay].left - rects[c0].left : 0}px, ${(dMin / 60) * HH}px)`;
        };
        const upf = async (ev) => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); window.removeEventListener('pointercancel', upf); done();
          if (ev.type !== 'pointerup') return draw();
          if (!moved) return peek(it, b);
          if (!dMin && !dDay) { b.style.transform = ''; b.classList.remove('fl-dragging'); return; }
          const s = new Date(it.start); s.setDate(s.getDate() + (resize ? 0 : dDay)); const ns = resize ? it.start : s.getTime() + dMin * MIN, ne = resize ? Math.max(it.start + 15 * MIN, it.end + dMin * MIN) : ns + (it.end - it.start);
          await moveItem(it, ns, ne); draw();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upf); window.addEventListener('pointercancel', upf);
      });
    }
    async function moveItem(it, ns, ne) { // ns/ne: new times of this occurrence; a series moves by the same amount
      if (!it.canEdit) return LC.toast(t('fl_cantMove'));
      let start = ns, end = ne;
      if (it.repeat) { if (!(await LC.confirm(t('fl_moveSeries')))) return; start = it.series.start + (ns - it.start); end = start + (ne - ns); }
      try { await LC.api('/api/event', { chan: it.chan, op: 'move', id: it.id, start, end }); LC.sr(t('fl_evMoved')); await load(true); } catch (e) { fail(e); }
    }
    function chip(it, d) { // all-day / long items, and items in the month view
      const c = colorOf(it), can = it.kind === 'event' && it.canEdit, startsHere = !longOrAllDay(it) || (adDays(it)[0] || d).getTime() === d.getTime() || d.getDay() === 1;
      const n = el('div', { class: `fl-chip-ev${it.allDay || longOrAllDay(it) ? ' ad' : ''}${it.kind === 'meeting' ? ' mt' : ''}${it.rsvp === 'maybe' ? ' tent' : ''}${it.rsvp === 'no' ? ' declined' : ''}`, role: 'button', tabindex: '0', 'data-key': it.key, draggable: can && !matchMedia('(pointer:coarse)').matches ? 'true' : null,
        'aria-label': `${it.title}, ${it.allDay ? t('fl_allDay') : timeRange(it)}`, style: c ? `--c:${c}` : null, onclick: (e) => { e.stopPropagation(); peek(it, n); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); peek(it, n); } } },
        !it.allDay && st.view === 'month' ? el('span', { class: 'fl-chipt', text: fTime(it.start) }) : null, el('span', { class: 'fl-chipn', text: startsHere ? it.title : '…' + it.title }));
      if (can) n.addEventListener('dragstart', (e) => { dragItem = { it, from: d }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.title); } catch {} });
      return n;
    }
    let dragItem = null;
    function dropDay(cell, d) {
      cell.addEventListener('dragover', (e) => { if (dragItem) { e.preventDefault(); cell.classList.add('fl-over'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('fl-over'));
      cell.addEventListener('drop', async (e) => {
        cell.classList.remove('fl-over'); if (!dragItem) return; e.preventDefault(); const { it, from } = dragItem; dragItem = null;
        const days = Math.round((d - from) / DAY); if (!days) return;
        const s = new Date(it.start); if (it.utcDay) s.setUTCDate(s.getUTCDate() + days); else s.setDate(s.getDate() + days);
        await moveItem(it, s.getTime(), s.getTime() + (it.end - it.start)); draw();
      });
    }
    // ----- month -----
    function monthView(from, to) {
      const items = visibleItems(), month = st.date.getMonth(), maxChips = PHONE() ? 2 : 3;
      const head = el('div', { class: 'fl-mhead' }, Array.from({ length: 7 }, (_, i) => el('div', { class: 'fl-mdow', text: fmt(addDays(from, i), { weekday: PHONE() ? 'narrow' : 'short' }) })));
      const cells = [];
      for (let d = from; d < to; d = addDays(d, 1)) {
        const its = items.filter((it) => daysOf(it, d, addDays(d, 1)).length), dd = d;
        const cell = el('div', { class: 'fl-mcell' + (d.getMonth() !== month ? ' other' : '') + (isToday(d) ? ' today' : ''), 'data-day': dk(d) },
          el('button', { class: 'fl-mday', 'aria-label': fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }) + (its.length ? `, ${its.length}` : ''), onclick: () => { st.view = 'day'; st.date = dd; LC.ls.set(lsKey, 'day'); load(); } }, String(d.getDate())),
          ...its.slice(0, maxChips).map((it) => chip(it, dd)), its.length > maxChips ? el('button', { class: 'link fl-mmore', text: t('fl_more', { n: its.length - maxChips }), onclick: () => { st.view = 'day'; st.date = dd; load(); } }) : null);
        if (!o.chan || canWrite(o.chan)) cell.addEventListener('dblclick', (e) => { if (e.target === cell) { const s = new Date(dd); s.setHours(9, 0, 0, 0); slotMenu(e, s.getTime(), s.getTime() + 30 * MIN, false); } });
        dropDay(cell, dd); cells.push(cell);
      }
      return el('div', { class: 'fl-month calgrid' }, head, el('div', { class: 'fl-mgrid' }, cells));
    }
    // ----- a chat tab's list of what's coming -----
    function agenda() {
      const now = Date.now(), up = st.items.filter((it) => it.end > now - 3600000).slice(0, 40);
      return el('section', { class: 'fl-agenda', 'aria-label': t('fl_upcoming') }, el('h3', { text: t('fl_upcoming') }), up.length ? up.map((it) => el('div', { class: 'evrow fl-evrow', style: colorOf(it) ? `--c:${colorOf(it)}` : null },
        el('div', { class: 'evdate' }, el('b', { text: (it.utcDay ? new Date(it.start).getUTCDate() : new Date(it.start).getDate()) }), el('small', { text: fmt(it.utcDay ? adDays(it)[0] || it.start : it.start, { month: 'short' }) })),
        el('div', { class: 'grow' }, el('button', { class: 'link fl-agt', text: it.title, onclick: (e) => peek(it, e.currentTarget) }), el('div', { class: 'muted small' }, whenText(it), it.repeat ? [' · ', LC.icon('arrow_repeat_all'), ' ' + repeatText(it.repeat, it.series && it.series.start)] : null, it.remind ? [' · ', LC.icon('alert'), ' ' + remindLabel(it.remind)] : null, it.kind === 'event' ? ' · ' + LC.uname(it.by) : ''), it.location ? el('div', { class: 'small', text: it.location }) : null),
        joinable(it) ? el('button', { class: 'primary sm', text: t('fl_join'), onclick: () => CAL.join(it) }) : null,
        it.kind === 'event' && it.canEdit ? el('button', { class: 'secondary sm', text: t('edit'), 'aria-label': t('edit') + ' ' + it.title, onclick: () => eventDialog(it) }) : null)) : el('p', { class: 'muted', text: t('fl_noUpcoming') }));
    }
    v.newItem = newItem; v.load = load;
    load();
    return v;
  }
  const remindLabel = (n) => (n >= 1440 ? t('fl_remindDay') : n >= 60 ? t('fl_remindHour') : t('fl_minRemind', { n }));
  function canWrite(chan) { const c = S.channels.get(chan); return !!S.me && !(S.me.mutedUntil > Date.now()) && !(c && c.readonly && !LC.isAdmin()); }

  // ---------- the peek card (click an event) ----------
  let peekBox = null, peekFrom = null;
  function closePeek() { if (!peekBox) return; peekBox.remove(); peekBox = null; document.removeEventListener('mousedown', outside, true); if (peekFrom && peekFrom.isConnected) try { peekFrom.focus(); } catch {} peekFrom = null; }
  const outside = (e) => { if (peekBox && !peekBox.contains(e.target) && !e.target.closest('#menu, .modal')) closePeek(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && peekBox && $('#menu').classList.contains('hidden')) { e.stopPropagation(); closePeek(); } }, true);
  function peek(it, anchor) {
    closePeek(); peekFrom = anchor; const c = catColor(catOf(it)), me = S.me.id;
    const rsvpBtns = (cur, send) => el('div', { class: 'fl-rsvp', role: 'group', 'aria-label': t('fl_responses') }, [['yes', 'fl_accept', 'calendar_checkmark'], ['maybe', 'fl_tentative', 'calendar_question_mark'], ['no', 'fl_decline', 'calendar_cancel']].map(([v, k, ic]) => el('button', { class: 'secondary sm withicon' + (cur === v ? ' on' : ''), 'aria-pressed': String(cur === v), onclick: () => send(cur === v && it.kind === 'event' ? '' : v) }, LC.icon(ic), el('span', { text: t(k) }))));
    const send = async (v) => { try { if (it.kind === 'meeting') await LC.api('/api/meetings/rsvp', { id: it.id, rsvp: v || 'yes', response: v || 'yes' }); else await LC.api('/api/calendar/rsvp', { chan: it.chan, id: it.id, rsvp: v }); it.rsvp = v; closePeek(); reloadAll(); } catch (e) { fail(e); } };
    const resp = it.kind === 'event' ? Object.entries(it.rsvps || {}) : [];
    const people = (v) => resp.filter(([, r]) => r === v).map(([id]) => LC.uname(id));
    const tzNote = it.kind === 'event' && !it.allDay && it.tz && it.tz !== myTz() ? (() => { const w1 = CC.wall(it.start, it.tz), w2 = CC.wall(it.end, it.tz); return `${pad(w1.h)}:${pad(w1.mi)} – ${pad(w2.h)}:${pad(w2.mi)} ${it.tz.replace(/_/g, ' ')}`; })() : '';
    const del = (e) => {
      if (!it.repeat) return LC.confirm(t('fl_confirmDelEvent', { title: it.title }), { danger: true, ok: t('delete') }).then((ok) => ok && LC.api('/api/event', { chan: it.chan, op: 'del', id: it.id }).then(() => { closePeek(); reloadAll(); }).catch(fail));
      LC.menu(e.currentTarget, [{ icon: 'delete', label: t('fl_delOcc'), fn: () => LC.api('/api/event', { chan: it.chan, op: 'delocc', id: it.id, occ: it.occ }).then(() => { closePeek(); reloadAll(); }).catch(fail) },
        { icon: 'delete', danger: true, label: t('fl_delSeries'), fn: async () => { if (await LC.confirm(t('fl_confirmDelSeries', { title: it.title }), { danger: true, ok: t('delete') })) LC.api('/api/event', { chan: it.chan, op: 'del', id: it.id }).then(() => { closePeek(); reloadAll(); }).catch(fail); } }]);
    };
    const categorize = (e) => LC.menu(e.currentTarget, [...CATS.map(([k, col]) => ({ icon: el('span', { class: 'fl-swatch', style: `background:${col}` }), label: catName(k), checked: catOf(it) === k, fn: () => savePrefs({ cat: { key: itemKey(it), color: k } }) })), 'sep', { icon: 'dismiss', label: t('fl_none'), fn: () => savePrefs({ cat: { key: itemKey(it), color: '' } }) }]);
    const box = el('div', { class: 'fl-peek', role: 'dialog', 'aria-label': it.title, style: c ? `--c:${c}` : null },
      el('div', { class: 'fl-peekhead' }, el('span', { class: 'fl-peekbar', 'aria-hidden': 'true' }), el('h2', { text: it.title }), LC.ibtn('dismiss', t('close'), closePeek)),
      el('div', { class: 'fl-peekrow' }, LC.icon('clock'), el('div', {}, el('div', { text: whenText(it) }), tzNote ? el('div', { class: 'muted small', text: tzNote }) : null, it.repeat ? el('div', { class: 'muted small' }, LC.icon('arrow_repeat_all'), ' ' + repeatText(it.repeat, it.series ? it.series.start : it.start)) : null)),
      it.chan ? el('div', { class: 'fl-peekrow' }, LC.icon('chat'), el('button', { class: 'link', text: t('fl_in', { chat: chatTitle(it.chan) }), onclick: () => { closePeek(); LC.openChat(it.chan); } })) : null,
      it.location ? el('div', { class: 'fl-peekrow' }, LC.icon('location'), el('span', { text: it.location })) : null,
      el('div', { class: 'fl-peekrow' }, LC.icon('person'), el('span', { text: it.kind === 'meeting' ? t('fl_organizer', { name: LC.uname(it.organizer) }) : t('fl_by', { name: LC.uname(it.by) }) })),
      it.notes ? el('div', { class: 'fl-peeknotes', text: it.notes }) : null,
      it.kind === 'event' && resp.length ? el('div', { class: 'fl-peekresp' }, [['yes', 'fl_accepted'], ['maybe', 'fl_tentativeL'], ['no', 'fl_declined']].filter(([v]) => people(v).length).map(([v, k]) => el('div', { class: 'small' }, el('b', { text: `${t(k)} (${people(v).length}): ` }), people(v).join(', ')))) : null,
      (it.kind === 'meeting' ? !it.isOrganizer : it.by !== me) ? rsvpBtns(it.rsvp, send) : null,
      el('div', { class: 'fl-peekacts' },
        joinable(it) || it.kind === 'meeting' || it.online ? el('button', { class: 'primary sm withicon', onclick: () => { closePeek(); CAL.join(it); } }, LC.icon('video'), el('span', { text: t('fl_join') })) : null,
        it.kind === 'meeting' && LC.meetings && LC.meetings.open ? el('button', { class: 'secondary sm', text: t('fl_openMeeting'), onclick: () => { closePeek(); LC.meetings.open(it.id); } }) : null,
        it.kind === 'event' && it.canEdit ? el('button', { class: 'secondary sm withicon', onclick: () => { closePeek(); eventDialog(it); } }, LC.icon('edit'), el('span', { text: t('edit') })) : null,
        it.kind === 'event' && it.canEdit ? el('button', { class: 'secondary sm danger withicon', 'aria-haspopup': it.repeat ? 'menu' : null, onclick: del }, LC.icon('delete'), el('span', { text: t('delete') })) : null,
        el('button', { class: 'secondary sm withicon', 'aria-haspopup': 'menu', onclick: categorize }, LC.icon('tag'), el('span', { text: t('fl_categorize') }))));
    document.body.append(box); peekBox = box;
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }, w = box.offsetWidth, h = box.offsetHeight;
    let x = r.right + 8; if (x + w > innerWidth - 8) x = r.left - w - 8; if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left));
    let y = Math.max(8, Math.min(innerHeight - h - 8, r.top)); if (PHONE()) { x = 8; y = Math.max(8, innerHeight - h - 8); }
    box.style.left = x + 'px'; box.style.top = y + 'px';
    setTimeout(() => { document.addEventListener('mousedown', outside, true); const f = box.querySelector('.fl-peekacts button, .fl-rsvp button, button'); if (f) f.focus(); }, 0);
  }
  CAL.peek = peek;
  function reloadAll() { for (const v of [...live]) { if (!v.root.isConnected) { live.delete(v); continue; } v.reload(); } }

  // ---------- new / edit event ----------
  let zones = null;
  // browsers list some zones under their old names (Asia/Calcutta): show the names people know today
  const MODERN = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'Atlantic/Faeroe': 'Atlantic/Faroe', 'America/Godthab': 'America/Nuuk', 'Pacific/Truk': 'Pacific/Chuuk', 'Pacific/Ponape': 'Pacific/Pohnpei' };
  const zoneList = () => { if (zones) return zones; let z = []; try { z = Intl.supportedValuesOf('timeZone').map((x) => (MODERN[x] && CC.validTz(MODERN[x]) ? MODERN[x] : x)); } catch {} if (!z.length) z = ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Asia/Kolkata', 'Asia/Tokyo', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney']; zones = [...new Set([myTz(), 'UTC', ...z])].filter((x) => CC.validTz(x)).map((tz) => { const off = CC.offset(Date.now(), tz) / 60000, s = off < 0 ? '−' : '+', a = Math.abs(off); return { tz, off, label: `(UTC${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}) ${tz.replace(/_/g, ' ')}` }; }).sort((a, b) => a.off - b.off || a.tz.localeCompare(b.tz)); return zones; };
  function writableChats() {
    const out = []; for (const c of S.channels.values()) if (canWrite(c.id)) out.push([c.id, chatTitle(c.id)]);
    const ce = LC.chatEntries ? LC.chatEntries() : null; if (ce) { if (ce.self) out.push([ce.self.id, chatTitle(ce.self.id)]); for (const e of ce.people) if (S.last[e.id]) out.push([e.id, chatTitle(e.id)]); }
    return out.sort((a, b) => (a[0] === 'general' ? -1 : b[0] === 'general' ? 1 : a[1].localeCompare(b[1])));
  }
  function eventDialog(it, p = {}) {
    const edit = !!it, tz0 = edit ? it.tz || myTz() : myTz(), allDay0 = edit ? it.allDay : !!p.allDay;
    const s0 = edit ? it.series.start : p.start, e0 = edit ? it.series.end : p.end;
    const wallOf = (ts, tz, ad) => (ad ? CC.wall(ts, 'UTC') : CC.wall(ts, tz)), dstr = (w) => `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`, tstr = (w) => `${pad(w.h)}:${pad(w.mi)}`;
    const ws = wallOf(s0, tz0, allDay0), we = wallOf(allDay0 ? e0 - DAY : e0, tz0, allDay0);
    const title = el('input', { value: edit ? it.title : '', maxlength: 100, placeholder: t('fl_eTitle'), 'aria-label': t('fl_eTitle'), class: 'fl-etitle', required: true });
    const chats = writableChats(), chatSel = el('select', { 'aria-label': t('fl_eChat') }, chats.map(([id, n]) => el('option', { value: id, text: n }))); chatSel.value = edit ? it.chan : p.chan || (S.chan && canWrite(S.chan) ? S.chan : 'general'); if (!chatSel.value && chats[0]) chatSel.value = chats[0][0];
    const allDay = el('input', { type: 'checkbox', checked: allDay0 });
    const sd = el('input', { type: 'date', value: dstr(ws), 'aria-label': t('fl_eStart') + ' ' + t('fl_eDate'), required: true }), stt = el('input', { type: 'time', value: tstr(ws), step: 300, 'aria-label': t('fl_eStart') + ' ' + t('fl_eTime') });
    const ed = el('input', { type: 'date', value: dstr(we), 'aria-label': t('fl_eEnd') + ' ' + t('fl_eDate') }), ett = el('input', { type: 'time', value: tstr(we), step: 300, 'aria-label': t('fl_eEnd') + ' ' + t('fl_eTime') });
    const tzSel = el('select', { 'aria-label': t('fl_eTz') }, zoneList().map((z) => el('option', { value: z.tz, text: z.label }))); tzSel.value = tz0;
    const r0 = (edit && it.repeat) || null, rep = el('select', { 'aria-label': t('fl_eRepeat') }, [['', 'fl_rNone'], ['daily', 'fl_rDaily'], ['weekdays', 'fl_rWeekdays'], ['weekly', 'fl_rWeekly'], ['monthly', 'fl_rMonthly'], ['yearly', 'fl_rYearly']].map(([v, k]) => el('option', { value: v, text: t(k) }))); rep.value = r0 ? r0.freq : '';
    const every = el('input', { type: 'number', min: 1, max: 99, value: r0 ? r0.interval || 1 : 1, class: 'fl-num', 'aria-label': t('fl_rEvery') }), unit = el('span', { class: 'muted' });
    let days = new Set(r0 && r0.days ? r0.days : []);
    const dayBox = el('div', { class: 'fl-days', role: 'group', 'aria-label': t('fl_rOn') });
    const drawDays = () => dayBox.replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => el('button', { type: 'button', class: 'fl-daybtn' + (days.has(d) ? ' on' : ''), 'aria-pressed': String(days.has(d)), 'aria-label': new Date(2024, 0, ((d + 6) % 7) + 1).toLocaleDateString(lang(), { weekday: 'long' }), text: new Date(2024, 0, ((d + 6) % 7) + 1).toLocaleDateString(lang(), { weekday: 'narrow' }), onclick: () => { if (days.has(d)) days.delete(d); else days.add(d); drawDays(); } })));
    const ends = el('select', { 'aria-label': t('fl_rEnds') }, [['never', 'fl_rNever'], ['on', 'fl_rOnDate'], ['after', 'fl_rAfter']].map(([v, k]) => el('option', { value: v, text: t(k) }))); ends.value = r0 && r0.count ? 'after' : r0 && r0.until ? 'on' : 'never';
    const until = el('input', { type: 'date', 'aria-label': t('fl_rOnDate'), value: r0 && r0.until ? ymd(new Date(r0.until)) : '' }), count = el('input', { type: 'number', min: 1, max: 999, value: r0 && r0.count ? r0.count : 10, class: 'fl-num', 'aria-label': t('fl_rTimesLabel') });
    const repBox = el('div', { class: 'fl-repbox' });
    const sync = () => {
      const f = rep.value, ad = allDay.checked; stt.classList.toggle('hidden', ad); ett.classList.toggle('hidden', ad); tzSel.closest('.field').classList.toggle('hidden', ad);
      if (f === 'weekly' && !days.size && sd.value) { const [y, m, d] = sd.value.split('-').map(Number); days.add(new Date(y, m - 1, d).getDay()); }
      unit.textContent = t({ daily: 'fl_rDays', weekly: 'fl_rWeeks', monthly: 'fl_rMonths', yearly: 'fl_rYears' }[f] || 'fl_rDays'); drawDays();
      repBox.replaceChildren(...(f ? [f !== 'weekdays' ? el('label', { class: 'fl-inline' }, t('fl_rEvery') + ' ', every, ' ', unit) : null, f === 'weekly' ? dayBox : null, el('label', { class: 'fl-inline' }, t('fl_rEnds') + ' ', ends, ' ', ends.value === 'on' ? until : null, ends.value === 'after' ? [count, ' ' + t('fl_rTimesLabel')] : null)].filter(Boolean) : []));
    };
    rep.addEventListener('change', sync); ends.addEventListener('change', sync); allDay.addEventListener('change', sync);
    sd.addEventListener('change', () => { if (!ed.value || ed.value < sd.value) ed.value = sd.value; });
    const loc = el('input', { value: edit ? it.location || '' : '', maxlength: 200, placeholder: t('fl_eLocation'), 'aria-label': t('fl_eLocation') });
    const online = el('input', { type: 'checkbox', checked: edit ? !!it.online : false });
    const rem = el('select', { 'aria-label': t('fl_reminder') }, [[0, t('fl_noRemind')], [5, t('fl_minRemind', { n: 5 })], [15, t('fl_minRemind', { n: 15 })], [30, t('fl_minRemind', { n: 30 })], [60, t('fl_remindHour')], [1440, t('fl_remindDay')]].map(([v, l]) => el('option', { value: v, text: l }))); rem.value = String(edit ? it.remind || 0 : 15); if (!rem.value) rem.value = '15';
    const cat = el('select', { 'aria-label': t('fl_eCat') }, el('option', { value: '', text: t('fl_none') }), CATS.map(([k]) => el('option', { value: k, text: catName(k) }))); cat.value = edit ? catOf(it) : '';
    const notes = el('textarea', { rows: 3, maxlength: 2000, placeholder: t('fl_eNotes'), 'aria-label': t('fl_eNotes') }); notes.value = edit ? it.notes || '' : '';
    const field = (label, ...kids) => el('div', { class: 'field fl-field' }, el('span', { class: 'flabel', text: label }), el('div', { class: 'fl-fieldrow' }, ...kids));
    const save = async () => {
      if (!title.value.trim()) { title.focus(); return LC.toast(t('fl_eTitle')); }
      const ad = allDay.checked, tz = tzSel.value || myTz(), [y1, m1, d1] = sd.value.split('-').map(Number), [y2, m2, d2] = (ed.value || sd.value).split('-').map(Number);
      let start, end;
      if (ad) { start = Date.UTC(y1, m1 - 1, d1); end = Date.UTC(y2, m2 - 1, d2) + DAY; }
      else { const [h1, n1] = (stt.value || '09:00').split(':').map(Number), [h2, n2] = (ett.value || stt.value || '09:30').split(':').map(Number); start = CC.fromWall(y1, m1 - 1, d1, h1, n1, tz); end = CC.fromWall(y2, m2 - 1, d2, h2, n2, tz); if (end <= start) end = start + 30 * MIN; }
      let repeat = null;
      if (rep.value) { repeat = { freq: rep.value, interval: Number(every.value) || 1 }; if (rep.value === 'weekly') repeat.days = [...days]; if (ends.value === 'after') repeat.count = Number(count.value) || 1; else if (ends.value === 'on' && until.value) { const [y, m, d] = until.value.split('-').map(Number); repeat.until = ad ? Date.UTC(y, m - 1, d) + DAY - 1 : CC.fromWall(y, m - 1, d, 23, 59, tz); } }
      const body = { chan: edit ? it.chan : p.fixedChan ? p.chan : chatSel.value, op: edit ? 'edit' : 'add', id: edit ? it.id : undefined, title: title.value.trim(), start, end, allDay: ad, tz, repeat, location: loc.value, online: online.checked, remind: Number(rem.value), notes: notes.value };
      try {
        const r = await LC.api('/api/event', body); LC.closeModal();
        const key = `e:${body.chan}/${edit ? it.id : r.id}`; if ((cat.value || '') !== (prefs.catOf[key] || '')) savePrefs({ cat: { key, color: cat.value } });
        reloadAll();
      } catch (e) { fail(e); }
    };
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon(edit ? 'calendar_edit' : 'calendar_add'), ' ' + (edit ? t('fl_editEvent') : t('fl_newEvent'))), LC.ibtn('dismiss', t('close'), LC.closeModal)),
      edit && it.repeat ? el('p', { class: 'muted small', text: t('fl_series') }) : null,
      el('form', { class: 'fl-eform', onsubmit: (e) => { e.preventDefault(); save(); } }, title,
        !edit && !p.fixedChan ? field(t('fl_eChat'), chatSel) : null,
        el('label', { class: 'check fl-check-ad' }, allDay, ' ' + t('fl_allDay')),
        field(t('fl_eStart'), sd, stt), field(t('fl_eEnd'), ed, ett), field(t('fl_eTz'), tzSel), field(t('fl_eRepeat'), rep), repBox,
        field(t('fl_eLocation'), loc), el('label', { class: 'check' }, online, ' ' + t('fl_eOnline')), field(t('fl_reminder'), rem), field(t('fl_eCat'), cat), notes,
        el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'submit', class: 'primary', text: t('fl_saveEvent') })))], { wide: true, label: edit ? t('fl_editEvent') : t('fl_newEvent') });
    sync(); title.focus();
  }
  CAL.newEvent = (p = {}) => eventDialog(null, { start: p.start || Date.now() + 3600000, end: p.end || (p.start || Date.now() + 3600000) + 30 * MIN, chan: p.chan, allDay: p.allDay });

  // ---------- more: export / import / categories / second time zone / scheduling assistant ----------
  function moreMenu(anchor, chan) {
    LC.menu(anchor, [
      { icon: 'calendar_person', label: t('fl_assistant'), fn: () => assistant() },
      'sep',
      { icon: 'arrow_export', label: chan ? t('fl_exportChat') : t('fl_export'), fn: () => { const a = el('a', { href: `/api/calendar/ics?token=${encodeURIComponent(S.token)}${chan ? '&chan=' + encodeURIComponent(chan) : ''}`, download: '' }); document.body.append(a); a.click(); a.remove(); } },
      !chan || canWrite(chan) ? { icon: 'arrow_import', label: t('fl_import'), fn: () => importIcs(chan) } : null,
      'sep',
      { icon: 'tag', label: t('fl_categories'), fn: () => categoriesDialog() },
      { icon: 'globe_clock', label: t('fl_tz2'), fn: () => tz2Dialog() },
    ]);
  }
  function importIcs(chan) {
    const inp = el('input', { type: 'file', accept: '.ics,text/calendar', class: 'hidden' }); document.body.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return; if (f.size > 1200000) return LC.toast(t('fl_tooBig', { name: f.name, n: 1 }));
      const text = await f.text(), go = async (c) => { try { const r = await LC.api('/api/calendar/import', { chan: c, ics: text, tz: myTz() }); LC.toast(t('fl_imported', { n: r.added }) + (r.partial ? ' ' + t('fl_importPartial', { n: r.partial }) : ''), { ms: 6000 }); reloadAll(); } catch (e) { fail(e); } };
      if (chan) return go(chan);
      const sel = el('select', { 'aria-label': t('fl_importInto') }, writableChats().map(([id, n]) => el('option', { value: id, text: n }))); sel.value = S.chan && canWrite(S.chan) ? S.chan : 'general';
      LC.modal([el('h2', {}, LC.icon('arrow_import'), ' ' + t('fl_import')), el('p', { class: 'muted small', text: f.name }), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('fl_importInto') }), sel), el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('fl_import').replace('…', ''), onclick: () => { LC.closeModal(); go(sel.value); } }))], { label: t('fl_import') });
    });
    inp.click();
  }
  function categoriesDialog() {
    const inputs = CATS.map(([k, c]) => [k, el('input', { value: prefs.cats[k] || '', placeholder: t('fl_cat_' + k), maxlength: 40, 'aria-label': t('fl_cat_' + k) }), c]);
    LC.modal([el('h2', {}, LC.icon('tag'), ' ' + t('fl_categories')), el('p', { class: 'muted small', text: t('fl_catHelp') }), ...inputs.map(([, inp, c]) => el('div', { class: 'fl-catrow' }, el('span', { class: 'fl-swatch big', style: `background:${c}`, 'aria-hidden': 'true' }), inp)),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('save'), onclick: () => { const cats = {}; for (const [k, inp] of inputs) if (inp.value.trim()) cats[k] = inp.value.trim(); LC.closeModal(); savePrefs({ cats }); } }))], { label: t('fl_categories') });
  }
  function tz2Dialog() {
    const sel = el('select', { 'aria-label': t('fl_tz2Pick') }, el('option', { value: '', text: t('fl_tz2None') }), zoneList().map((z) => el('option', { value: z.tz, text: z.label }))); sel.value = prefs.tz2 || '';
    LC.modal([el('h2', {}, LC.icon('globe_clock'), ' ' + t('fl_tz2')), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('fl_tz2Pick') }), sel), el('p', { class: 'muted small', text: t('fl_yourTz') + ': ' + myTz() }),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('save'), onclick: () => { LC.closeModal(); savePrefs({ tz2: sel.value }); } }))], { label: t('fl_tz2') });
  }
  // scheduling assistant: busy blocks for the people you pick, on one day
  function assistant(pre = {}) {
    const picked = new Set(pre.people || [S.me.id]), q = el('input', { type: 'search', placeholder: t('search'), 'aria-label': t('fl_people') });
    const day = el('input', { type: 'date', value: ymd(pre.date || new Date()), 'aria-label': t('fl_day') }), list = el('div', { class: 'fl-ppl' }), grid = el('div', { class: 'fl-fb', 'aria-live': 'polite' });
    let sel = null; const H0 = 7, H1 = 21, SLOTS = (H1 - H0) * 2;
    const people = () => [...S.users.values()].filter((u) => !u.removed && !u.deleted).sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || LC.uname(a.id).localeCompare(LC.uname(b.id)));
    const drawList = () => list.replaceChildren(...people().filter((u) => !q.value || LC.uname(u.id).toLowerCase().includes(q.value.toLowerCase())).slice(0, 60).map((u) => el('label', { class: 'fl-pick' }, el('input', { type: 'checkbox', checked: picked.has(u.id), onchange: (e) => { if (e.target.checked) picked.add(u.id); else picked.delete(u.id); show(); } }), LC.avatar(u, 'sm', false), el('span', { text: LC.uname(u.id) + (u.id === S.me.id ? ' (' + t('you') + ')' : '') }))));
    q.addEventListener('input', drawList);
    const schedBtn = el('button', { class: 'primary', text: t('fl_schedule'), disabled: true, onclick: () => { if (!sel) return; LC.closeModal(); const inv = [...picked].filter((x) => x !== S.me.id); if (LC.meetings && LC.meetings.schedule) LC.meetings.schedule({ start: sel[0], end: sel[1], invitees: inv }); else CAL.newEvent({ start: sel[0], end: sel[1] }); } });
    async function show() {
      if (!picked.size) return grid.replaceChildren(el('p', { class: 'muted', text: t('fl_noPeople') }));
      const [y, m, d] = day.value.split('-').map(Number), d0 = new Date(y, m - 1, d).getTime(), from = d0 + H0 * 3600000, to = d0 + H1 * 3600000, ids = [...picked];
      let busy; try { busy = (await LC.api(`/api/freebusy?users=${ids.join(',')}&from=${d0}&to=${d0 + DAY}`)).busy; } catch (e) { return grid.replaceChildren(el('p', { class: 'err', text: e.message })); }
      const slotBusy = (list, i) => { const s = from + i * 30 * MIN, e = s + 30 * MIN; return list.find((b) => b.start < e && b.end > s); };
      const head = el('div', { class: 'fl-fbrow fl-fbhead' }, el('div', { class: 'fl-fbname' }), Array.from({ length: SLOTS }, (_, i) => el('div', { class: 'fl-fbslot', text: i % 2 ? '' : String(new Date(from + i * 30 * MIN).getHours()) })));
      const rows = ids.map((id) => el('div', { class: 'fl-fbrow' }, el('div', { class: 'fl-fbname', text: LC.uname(id) }), Array.from({ length: SLOTS }, (_, i) => { const b = slotBusy(busy[id] || [], i); return el('div', { class: 'fl-fbslot' + (b ? (b.tentative ? ' tent' : ' busy') : ''), title: b ? (b.title || t('fl_busy')) + ' · ' + fTime(b.start) + '–' + fTime(b.end) : t('fl_free') }); })));
      const all = el('div', { class: 'fl-fbrow fl-fball' }, el('div', { class: 'fl-fbname', text: t('fl_everyone') }), Array.from({ length: SLOTS }, (_, i) => { const free = ids.every((id) => !slotBusy(busy[id] || [], i)), s = from + i * 30 * MIN; return el('button', { class: 'fl-fbslot' + (free ? ' free' : ' busy') + (sel && s >= sel[0] && s < sel[1] ? ' picked' : ''), 'aria-label': `${fTime(s)} ${free ? t('fl_free') : t('fl_busy')}`, onclick: () => { sel = [s, s + 60 * MIN]; schedBtn.disabled = false; show(); } }); }));
      grid.replaceChildren(el('div', { class: 'fl-fbgrid', role: 'group', 'aria-label': t('fl_findTime') }, head, ...rows, all), el('p', { class: 'muted small', text: sel ? `${fDay(sel[0])} · ${fTime(sel[0])} – ${fTime(sel[1])}` : t('fl_pickSlot') }));
    }
    day.addEventListener('change', () => { sel = null; schedBtn.disabled = true; show(); });
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('calendar_person'), ' ' + t('fl_assistant')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted small', text: t('fl_findTime') }),
      el('div', { class: 'fl-assist' }, el('div', { class: 'fl-assistl' }, q, list), el('div', { class: 'fl-assistr' }, el('label', { class: 'fl-inline' }, t('fl_day') + ' ', day), grid)),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), schedBtn)], { wide: true, label: t('fl_assistant') });
    drawList(); show();
  }
  CAL.assistant = assistant;

  // ---------- the Calendar app (app bar) and its side column ----------
  let appView = null;
  function miniMonth() {
    const st = appView ? appView.st : { date: sod(new Date()) }; let m = new Date((st.mini || st.date).getFullYear(), (st.mini || st.date).getMonth(), 1);
    const box = el('div', { class: 'fl-mini' });
    const draw = () => {
      const from = monOf(m), days = Array.from({ length: 42 }, (_, i) => addDays(from, i)), has = new Set(appView ? appView.st.items.flatMap((it) => daysOf(it, from, addDays(from, 42)).map(dk)) : []);
      box.replaceChildren(el('div', { class: 'fl-minihead' }, el('b', { text: fmt(m, { month: 'long', year: 'numeric' }) }), LC.ibtn('chevron_left', t('fl_prevRange'), () => { m = new Date(m.getFullYear(), m.getMonth() - 1, 1); if (appView) appView.st.mini = m; draw(); }), LC.ibtn('chevron_right', t('fl_nextRange'), () => { m = new Date(m.getFullYear(), m.getMonth() + 1, 1); if (appView) appView.st.mini = m; draw(); })),
        el('div', { class: 'fl-minigrid', role: 'group', 'aria-label': fmt(m, { month: 'long', year: 'numeric' }) }, Array.from({ length: 7 }, (_, i) => el('span', { class: 'fl-minidow', 'aria-hidden': 'true', text: fmt(addDays(from, i), { weekday: 'narrow' }) })),
          days.map((d) => el('button', { class: 'fl-miniday' + (d.getMonth() !== m.getMonth() ? ' other' : '') + (isToday(d) ? ' today' : '') + (appView && dk(d) === dk(appView.st.date) ? ' on' : '') + (has.has(dk(d)) ? ' has' : ''), 'aria-label': fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }), text: String(d.getDate()), onclick: () => { if (appView) appView.goto(d); LC.menuToggle(false); } }))));
    };
    draw(); return box;
  }
  function renderCalNav(nav) {
    const h = hidden(), items = appView ? appView.st.items : [], chats = [...new Set(items.filter((it) => it.kind === 'event').map((it) => it.chan))];
    const toggle = (k, label, color) => el('label', { class: 'fl-calitem' }, el('input', { type: 'checkbox', checked: !h.has(k), 'aria-label': t('fl_hideCal', { name: label }), onchange: (e) => { const x = hidden(); if (e.target.checked) x.delete(k); else x.add(k); LC.ls.set('fl_calhide', [...x]); if (appView) appView.draw(); } }), el('span', { class: 'fl-caldot', style: color ? `background:${color}` : null, 'aria-hidden': 'true' }), el('span', { class: 'name', text: label }));
    nav.replaceChildren(el('div', { class: 'fl-calnav' }, miniMonth(), el('div', { class: 'sec' }, el('span', { class: 'sectitle', text: t('fl_calendars') })),
      LC.meetings ? toggle('meetings', t('fl_meetings'), 'var(--brand)') : null, ...chats.map((c) => toggle(c, chatTitle(c), ''))));
  }
  LC.ext.panes.calendar = { icon: 'calendar_ltr', label: () => t('fl_cal'), title: () => t('fl_cal'), order: 40, render: renderCalNav, main: (host) => { appView = mount(host, {}); } };
  CAL.open = (date, chan) => { LC.setPane('calendar'); if (appView && date) appView.goto(new Date(date)); void chan; };

  // ---------- each chat's Calendar tab ----------
  let tabView = null;
  LC.ext.tabs.push({ key: 'calendar', icon: 'calendar_ltr', label: () => t('tabCalendar'), order: 50, render: (host, chan) => { tabView = mount(host, { chan }); } });
  // routes-collab.js still redraws its old calendar into #tabView on its 'events' event (todo reminders send one):
  // this handler runs after it and puts the current calendar back
  LC.on('events', () => { const host = $('#tabView'); for (const v of [tabView, appView]) if (v && !v.root.isConnected && host && ((v === appView && S.app === 'calendar') || (v === tabView && !S.app && S.tab === 'calendar' && S.chan === v.o.chan))) { host.replaceChildren(v.root); live.add(v); } });
  const refresh = LC.debounce((chan) => { for (const v of [...live]) { if (!v.root.isConnected) { live.delete(v); continue; } if (!chan || !v.o.chan || v.o.chan === chan) v.reload(); } }, 300);
  LC.on('fl_events', (e) => refresh(e.chan));
  LC.on('mt_meeting', () => refresh(null));
  LC.on('reminder', () => refresh(null));
  setInterval(() => { if (document.visibilityState === 'visible' && [...live].some((v) => v.root.isConnected)) redrawAll(); }, 60000); // the "now" line and Join buttons
  setInterval(() => { if (document.visibilityState === 'visible' && [...live].some((v) => v.root.isConnected && !v.o.chan)) refresh(null); }, 300000);

  // ---------- activity items: "Bob accepted Movie night" ----------
  LC.ext.activityTypes = LC.ext.activityTypes || {};
  LC.ext.activityTypes.event = { icon: 'calendar_ltr', filter: 'meeting', text: (a) => t('fl_ra_' + (a.rsvp || 'yes'), { name: a.from ? LC.uname(a.from) : '', title: a.title || '' }), open: (a) => CAL.open(a.start, a.chan) };
})();
