'use strict';
// Shifts: a work schedule per chat (people × days of the week), open shifts people can request, copy last week, "My shifts",
// clock in / clock out with a time report. The schedule's owner and admins edit; everyone in the chat views and requests.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_shifts: 'Shifts', ap_shiftsDesc: 'Work schedules: who works when, open shifts, clocking in and out.', ap_myShifts: 'My shifts', ap_schedules: 'Schedules', ap_newSchedule: 'New schedule', ap_createSchedule: 'Create a schedule for this chat', ap_noSchedule: 'No schedule yet',
    ap_noScheduleHelp: 'Make a weekly schedule of shifts for the people in this chat. You edit it; they see it, ask for open shifts and clock in.', ap_openShifts: 'Open shifts', ap_addShift: 'Add shift', ap_editShift: 'Edit shift', ap_shift: 'Shift', ap_copyWeek: 'Copy last week',
    ap_copied: '{n} shifts copied from last week.', ap_nothingToCopy: 'Last week has no shifts.', ap_requests: 'Requests', ap_requestsN: 'Requests ({n})', ap_noRequests: 'No requests waiting.', ap_requestShift: 'Ask for this shift', ap_asked: 'Asked', ap_decline: 'Decline',
    ap_clockIn: 'Clock in', ap_clockOut: 'Clock out', ap_clockedIn: 'Clocked in {time}', ap_timeReport: 'Time report', ap_hoursN: '{n} h', ap_total: 'Total', ap_person: 'Person', ap_starts: 'Starts', ap_ends: 'Ends', ap_label: 'Label', ap_color: 'Colour', ap_openShift: 'Open shift (anyone can ask)',
    ap_delShift: 'Delete shift', ap_delSchedule: 'Delete schedule', ap_confirmDelSchedule: 'Delete this schedule with all its shifts and time records?', ap_prevWeek: 'Previous week', ap_nextWeek2: 'Next week', ap_thisWeek2: 'This week', ap_inProgress: 'in progress', ap_noShifts: 'No shifts coming up.',
    ap_hoursWeek: 'This week: {n} h', ap_pickChatSchedule: 'Pick the chat whose people work the shifts', ap_scheduleOf: 'Schedule: {where}', ap_requestedBy: 'Asked by {name}', ap_upcoming: 'Coming up',
  });
  LC.addStrings('hi', { ap_shifts: 'शिफ़्ट', ap_myShifts: 'मेरी शिफ़्ट', ap_clockIn: 'क्लॉक इन', ap_clockOut: 'क्लॉक आउट', ap_openShifts: 'खुली शिफ़्ट' });
  LC.addStrings('es', { ap_shifts: 'Turnos', ap_myShifts: 'Mis turnos', ap_clockIn: 'Fichar entrada', ap_clockOut: 'Fichar salida', ap_openShifts: 'Turnos abiertos' });
  const COLORS = ['#5b5fc7', '#038387', '#ca5010', '#c239b3', '#498205', '#0078d4', '#986f0b', '#d13438'];
  const DAY = 86400000, hours = (ms) => Math.round((ms / 3600000) * 10) / 10;
  const range = (x) => `${A.hm(x.start)}–${A.hm(x.end)}`;
  const dur = (c) => (c.out || Date.now()) - c.in;

  function shiftDialog(chan, data, x, preset) {
    const isNew = !x; x = x || { uid: preset.uid || '', start: preset.day + 9 * 3600000, end: preset.day + 17 * 3600000, label: '', color: COLORS[0], notes: '' };
    const who = A.select([['', t('ap_openShift')], ...data.people.map((id) => [id, LC.uname(id)])], x.uid, null, t('ap_person'));
    const day = el('input', { type: 'date', value: A.dayKey(x.start), 'aria-label': t('ap_date') }), st = el('input', { type: 'time', value: A.hm(x.start), 'aria-label': t('ap_starts') }), en = el('input', { type: 'time', value: A.hm(x.end), 'aria-label': t('ap_ends') });
    const label = el('input', { value: x.label, maxlength: 60, placeholder: t('ap_label'), 'aria-label': t('ap_label') }), notes = el('textarea', { rows: 2, maxlength: 500, 'aria-label': t('ap_notes') }); notes.value = x.notes || '';
    let color = x.color; const sw = el('div', { class: 'ap-swatches', role: 'radiogroup', 'aria-label': t('ap_color') });
    const drawSw = () => A.put(sw, ...COLORS.map((c) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(c === color), 'aria-label': t('ap_color') + ' ' + c, class: 'swatch' + (c === color ? ' on' : ''), style: { background: c }, onclick: () => { color = c; drawSw(); } })));
    drawSw();
    const save = async () => {
      const base = A.fromDay(day.value), [sh, sm] = st.value.split(':').map(Number), [eh, em] = en.value.split(':').map(Number); if (!base || Number.isNaN(sh) || Number.isNaN(eh)) return LC.toast(t('ap_starts'));
      const s = new Date(base); s.setHours(sh, sm, 0, 0); const e = new Date(base); e.setHours(eh, em, 0, 0); if (e <= s) e.setDate(e.getDate() + 1);
      const shift = { uid: who.value, start: s.getTime(), end: e.getTime(), label: label.value, color, notes: notes.value };
      if (await A.call('/api/ap/shift', isNew ? { chan, op: 'add', shift } : { chan, op: 'edit', id: x.id, shift })) LC.closeModal();
    };
    A.modal(isNew ? t('ap_addShift') : t('ap_editShift'), 'person_clock', [A.field(t('ap_person'), who), el('div', { class: 'ap-row' }, A.field(t('ap_date'), day), A.field(t('ap_starts'), st), A.field(t('ap_ends'), en)), A.field(t('ap_label'), label), A.field(t('ap_color'), sw), A.field(t('ap_notes'), notes)],
      [!isNew ? el('button', { class: 'secondary danger', text: t('ap_delShift'), onclick: async () => { if (await A.call('/api/ap/shift', { chan, op: 'del', id: x.id })) LC.closeModal(); } }) : null, el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_save'), onclick: save })], { wide: false });
  }
  function shiftInfo(chan, data, x) {
    const asked = data.reqs.some((r) => r.shift === x.id && r.by === S.me.id && r.status === 'pending');
    A.modal(x.label || t('ap_shift'), 'person_clock', [el('p', {}, el('b', { text: A.fmtDay(x.start, { weekday: 'long', day: 'numeric', month: 'long' }) }), ' · ' + range(x)), el('p', { text: x.uid ? LC.uname(x.uid) : t('ap_openShifts') }), x.notes ? el('p', { class: 'ap-pre', text: x.notes }) : null],
      [!x.uid && A.writable(chan) ? el('button', { class: 'primary', text: asked ? t('ap_asked') : t('ap_requestShift'), disabled: asked, onclick: async () => { if (await A.call('/api/ap/shift/request', { chan, id: x.id })) LC.closeModal(); } }) : null, el('button', { class: 'secondary', text: t('ap_close'), onclick: LC.closeModal })], { wide: false });
  }
  function requestsDialog(chan, data) {
    const pend = data.reqs.filter((r) => r.status === 'pending'), sh = (id) => data.shifts.find((x) => x.id === id);
    A.modal(t('ap_requests'), 'people_queue', pend.length ? pend.map((r) => { const x = sh(r.shift); return el('div', { class: 'ap-reqrow' }, LC.avatar(S.users.get(r.by), 'sm'), el('div', { class: 'grow' }, el('b', { text: LC.uname(r.by) }), el('div', { class: 'muted small', text: x ? A.fmtDay(x.start) + ' · ' + range(x) + (x.label ? ' · ' + x.label : '') : '' })), el('button', { class: 'primary sm', text: t('ap_approve'), onclick: async () => { if (await A.call('/api/ap/shift/decide', { chan, req: r.id, approve: true })) LC.closeModal(); } }), el('button', { class: 'secondary sm', text: t('ap_decline'), onclick: async () => { if (await A.call('/api/ap/shift/decide', { chan, req: r.id, approve: false })) LC.closeModal(); } })); }) : [el('p', { class: 'muted', text: t('ap_noRequests') })],
      [el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })], { wide: false });
  }
  function reportDialog(chan, data, from, to) {
    const ids = [...new Set(data.clock.map((c) => c.uid))], rows = [[t('ap_person'), t('ap_clockIn'), t('ap_clockOut'), t('ap_hoursN', { n: '' }).trim()]];
    const blocks = ids.map((uid) => { const list = data.clock.filter((c) => c.uid === uid).sort((a, b) => a.in - b.in), total = list.reduce((a, c) => a + dur(c), 0); for (const c of list) rows.push([LC.uname(uid), LC.fmtDateTime(c.in), c.out ? LC.fmtDateTime(c.out) : t('ap_inProgress'), hours(dur(c))]);
      return el('section', { class: 'ap-rep' }, el('div', { class: 'ap-row' }, LC.avatar(S.users.get(uid), 'sm'), el('b', { class: 'grow', text: LC.uname(uid) }), el('b', { text: t('ap_total') + ': ' + t('ap_hoursN', { n: hours(total) }) })),
        el('table', { class: 'table' }, el('tbody', {}, ...list.map((c) => el('tr', {}, el('td', { text: LC.fmtDateTime(c.in) }), el('td', { text: c.out ? LC.fmtTime(c.out) : t('ap_inProgress') }), el('td', { text: t('ap_hoursN', { n: hours(dur(c)) }) })))))); });
    A.modal(t('ap_timeReport') + ' · ' + A.fmtDay(from) + ' – ' + A.fmtDay(to - 1), 'clock', blocks.length ? blocks : [el('p', { class: 'muted', text: '—' })], [el('button', { class: 'secondary withicon', onclick: () => A.saveCsv(rows, A.chatTitle(chan) + ' time report') }, LC.icon('arrow_download'), el('span', { text: t('ap_exportCsv') })), el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })]);
  }
  // ---------- one schedule (week grid) ----------
  function scheduleView(host, chan) {
    const V = { ws: A.weekStart(Date.now()), data: null }; const root = el('div', { class: 'ap-page ap-sched' }); A.put(host, root);
    const load = async () => { try { const d = await LC.api(`/api/ap/shifts?chan=${encodeURIComponent(chan)}&from=${V.ws}&to=${A.addDays(V.ws, 7)}`); V.data = d.schedule; V.canCreate = d.canCreate; draw(); } catch (e) { A.put(root, el('p', { class: 'err', text: e.message })); } };
    A.on('ap_shifts', (e) => { if (e.chan === chan) load(); }, root);
    const tick = setInterval(() => { if (!root.isConnected) return clearInterval(tick); const b = root.querySelector('.ap-clockbtn [data-t]'); if (b && V.data && V.data.open) b.textContent = t('ap_clockedIn', { time: fmtDur(Date.now() - V.data.open.in) }); }, 30000);
    async function copyWeek() {
      const d = await LC.api(`/api/ap/shifts?chan=${encodeURIComponent(chan)}&from=${A.addDays(V.ws, -7)}&to=${V.ws}`).catch(A.fail); if (!d) return;
      const prev = d.schedule.shifts.filter((x) => x.start >= A.addDays(V.ws, -7) && x.start < V.ws); if (!prev.length) return LC.toast(t('ap_nothingToCopy'));
      const shifts = prev.map((x) => ({ uid: x.uid, start: A.addDays(x.start, 7), end: A.addDays(x.end, 7), label: x.label, color: x.color, notes: x.notes }));
      if (await A.call('/api/ap/shift', { chan, op: 'addmany', shifts })) LC.toast(t('ap_copied', { n: shifts.length }));
    }
    function draw() {
      const d = V.data;
      if (!d) return A.put(root, A.empty('person_clock', t('ap_noSchedule'), t('ap_noScheduleHelp'), V.canCreate ? el('button', { class: 'primary', text: t('ap_createSchedule'), onclick: async () => { if (await A.call('/api/ap/shifts/create', { chan })) load(); } }) : null));
      const days = Array.from({ length: 7 }, (_, i) => A.addDays(V.ws, i)), today = A.dayStart(Date.now()), edit = d.canEdit && A.writable(chan), pend = d.reqs.filter((r) => r.status === 'pending').length;
      const chip = (x) => el('button', { type: 'button', class: 'ap-shift' + (x.uid ? '' : ' open'), style: '--sc:' + x.color, onclick: () => (edit ? shiftDialog(chan, d, x) : shiftInfo(chan, d, x)), 'aria-label': `${x.uid ? LC.uname(x.uid) : t('ap_openShifts')}, ${A.fmtDay(x.start)} ${range(x)} ${x.label || ''}` }, el('b', { text: range(x) }), x.label ? el('span', { text: x.label }) : null, !x.uid && d.reqs.some((r) => r.shift === x.id && r.status === 'pending' && (edit || r.by === S.me.id)) ? el('span', { class: 'ap-shreq', text: edit ? t('ap_requests') : t('ap_asked') }) : null);
      const cell = (uid, day) => { const list = d.shifts.filter((x) => x.uid === uid && x.start >= day && x.start < A.addDays(day, 1)).sort((a, b) => a.start - b.start); return el('td', { class: 'ap-scell' + (day === today ? ' today' : '') }, ...list.map(chip), edit ? el('button', { type: 'button', class: 'ap-sadd', 'aria-label': t('ap_addShift') + ': ' + (uid ? LC.uname(uid) : t('ap_openShifts')) + ', ' + A.fmtDay(day), onclick: () => shiftDialog(chan, d, null, { uid, day }) }, LC.icon('add')) : null); };
      const weekH = (uid) => hours(d.shifts.filter((x) => x.uid === uid && x.start >= V.ws && x.start < A.addDays(V.ws, 7)).reduce((a, x) => a + (x.end - x.start), 0));
      const head = el('tr', {}, el('th', { scope: 'col', class: 'ap-sperson', text: t('ap_person') }), ...days.map((day) => el('th', { scope: 'col', class: day === today ? 'today' : '' }, el('span', { class: 'ap-sdow', text: A.fmtDay(day, { weekday: 'short' }) }), el('span', { class: 'ap-sdnum', text: new Date(day).getDate() }))));
      const rows = [el('tr', { class: 'ap-sopen' }, el('th', { scope: 'row', class: 'ap-sperson' }, el('div', { class: 'ap-sp' }, LC.icon('people_queue'), el('span', { text: t('ap_openShifts') }))), ...days.map((day) => cell('', day))),
        ...d.people.map((uid) => el('tr', {}, el('th', { scope: 'row', class: 'ap-sperson' }, el('div', { class: 'ap-sp' }, LC.avatar(S.users.get(uid), 'sm', true), el('span', { class: 'grow' }, el('span', { text: LC.uname(uid) }), el('span', { class: 'muted small', text: t('ap_hoursN', { n: weekH(uid) }) })))), ...days.map((day) => cell(uid, day))))];
      A.put(root, 
        el('div', { class: 'ap-tbar' }, LC.ibtn('chevron_left', t('ap_prevWeek'), () => { V.ws = A.addDays(V.ws, -7); load(); }), el('button', { class: 'secondary sm', text: t('ap_thisWeek2'), onclick: () => { V.ws = A.weekStart(Date.now()); load(); } }), LC.ibtn('chevron_right', t('ap_nextWeek2'), () => { V.ws = A.addDays(V.ws, 7); load(); }),
          el('b', { class: 'ap-srange', text: A.fmtDay(V.ws, { day: 'numeric', month: 'short' }) + ' – ' + A.fmtDay(A.addDays(V.ws, 6), { day: 'numeric', month: 'short', year: 'numeric' }) }), el('span', { class: 'grow' }),
          A.writable(chan) && d.people.includes(S.me.id) ? el('span', { class: 'ap-clockbtn' }, el('button', { class: (d.open ? 'secondary' : 'primary') + ' sm withicon', onclick: async () => { if (await A.call('/api/ap/clock', { chan, act: d.open ? 'out' : 'in' })) load(); } }, LC.icon('clock'), el('span', { text: d.open ? t('ap_clockOut') : t('ap_clockIn') })), d.open ? el('span', { class: 'muted small', 'data-t': '1', text: t('ap_clockedIn', { time: fmtDur(Date.now() - d.open.in) }) }) : null) : null,
          edit ? el('button', { class: 'secondary sm withicon', onclick: () => shiftDialog(chan, d, null, { uid: '', day: Math.max(V.ws, today) }) }, LC.icon('add'), el('span', { text: t('ap_addShift') })) : null,
          edit ? el('button', { class: 'secondary sm withicon', onclick: copyWeek }, LC.icon('copy'), el('span', { text: t('ap_copyWeek') })) : null,
          edit ? el('button', { class: 'secondary sm withicon' + (pend ? ' on' : ''), onclick: () => requestsDialog(chan, d) }, LC.icon('people_queue'), el('span', { text: pend ? t('ap_requestsN', { n: pend }) : t('ap_requests') })) : null,
          el('button', { class: 'secondary sm withicon', onclick: () => reportDialog(chan, d, V.ws, A.addDays(V.ws, 7)) }, LC.icon('data_bar_vertical'), el('span', { text: t('ap_timeReport') })),
          d.canEdit ? LC.ibtn('more_horizontal', t('ap_more'), (e) => LC.menu(e.currentTarget, [{ icon: 'delete', label: t('ap_delSchedule'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmDelSchedule'), { danger: true, ok: t('ap_delete') })) { if (await A.call('/api/ap/shifts/delete', { chan })) load(); } } }]), { menu: true }) : null),
        el('div', { class: 'tablewrap ap-sgridw' }, el('table', { class: 'ap-sgrid', 'aria-label': t('ap_scheduleOf', { where: A.chatTitle(chan) }) }, el('thead', {}, head), el('tbody', {}, ...rows))));
    }
    load();
  }
  const fmtDur = (ms) => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

  // ---------- My shifts (the app) ----------
  async function myShifts(host) {
    const root = el('div', { class: 'ap-page' }); A.put(host, root);
    const load = async () => {
      let d; try { d = await LC.api(`/api/ap/myshifts?from=${A.dayStart(Date.now())}&to=${A.addDays(A.dayStart(Date.now()), 28)}`); } catch (e) { return A.put(root, el('p', { class: 'err', text: e.message })); }
      const ws = A.weekStart(Date.now()), weekMs = d.shifts.filter((x) => x.start >= ws && x.start < A.addDays(ws, 7)).reduce((a, x) => a + (x.end - x.start), 0), open = d.clock.filter((c) => !c.out);
      const byDay = new Map(); for (const x of d.shifts.sort((a, b) => a.start - b.start)) { const k = A.dayKey(x.start); (byDay.get(k) || byDay.set(k, []).get(k)).push(x); }
      A.put(root, 
        el('div', { class: 'ap-row' }, el('b', { text: t('ap_hoursWeek', { n: hours(weekMs) }) }), el('span', { class: 'grow' }), ...d.schedules.map((s) => { const o = open.find((c) => c.chan === s.chan); return el('button', { class: (o ? 'secondary' : 'primary') + ' sm withicon', onclick: async () => { if (await A.call('/api/ap/clock', { chan: s.chan, act: o ? 'out' : 'in' })) load(); } }, LC.icon('clock'), el('span', { text: (o ? t('ap_clockOut') : t('ap_clockIn')) + (d.schedules.length > 1 ? ' · ' + A.chatTitle(s.chan) : '') })); })),
        el('h3', { text: t('ap_upcoming') }), byDay.size ? el('div', { class: 'ap-mylist' }, ...[...byDay].map(([k, list]) => el('section', { class: 'ap-myday' }, el('h4', { text: A.fmtDay(A.fromDay(k), { weekday: 'long', day: 'numeric', month: 'long' }) }), ...list.map((x) => el('div', { class: 'ap-myshift', style: '--sc:' + x.color }, el('b', { text: range(x) }), el('span', { class: 'grow', text: x.label || t('ap_shift') }), el('button', { class: 'link', text: A.chatTitle(x.chan), onclick: () => { V2.chan = x.chan; LC.openApp('ap_shifts'); LC.renderNav(); } })))))) : el('p', { class: 'muted', text: t('ap_noShifts') }),
        el('h3', { text: t('ap_openShifts') }), d.open.length ? el('div', { class: 'ap-mylist' }, ...d.open.sort((a, b) => a.start - b.start).map((x) => el('div', { class: 'ap-myshift open', style: '--sc:' + x.color }, el('b', { text: A.fmtDay(x.start) + ' · ' + range(x) }), el('span', { class: 'grow', text: (x.label || t('ap_shift')) + ' · ' + A.chatTitle(x.chan) }), el('button', { class: 'secondary sm', text: x.asked ? t('ap_asked') : t('ap_requestShift'), disabled: x.asked, onclick: async () => { if (await A.call('/api/ap/shift/request', { chan: x.chan, id: x.id })) load(); } })))) : el('p', { class: 'muted', text: '—' }));
    };
    A.on('ap_shifts', load, root); load();
  }
  A.tab({ key: 'ap_shifts', icon: 'person_clock', label: () => t('ap_shifts'), desc: () => t('ap_shiftsDesc'), order: 66, optIn: true, render: (host, chan) => scheduleView(host, chan) });
  const V2 = { chan: null, schedules: [] };
  A.app({ key: 'ap_shifts', icon: 'person_clock', color: '#498205', name: () => t('ap_shifts'), desc: () => t('ap_shiftsDesc'), tab: 'ap_shifts', order: 78,
    pane: {
      async render(nav) {
        const item = (label, icon, on, fn) => el('button', { class: 'ap-navitem' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null, onclick: fn }, LC.icon(icon), el('span', { class: 'grow', text: label }));
        A.put(nav, item(t('ap_myShifts'), 'person', !V2.chan, () => { V2.chan = null; LC.openApp('ap_shifts'); LC.renderNav(); }), el('div', { class: 'ap-navsec', text: t('ap_schedules') }));
        try { const d = await LC.api(`/api/ap/myshifts?from=${Date.now()}&to=${Date.now() + DAY}`); V2.schedules = d.schedules; nav.append(...d.schedules.map((s) => item(A.chatTitle(s.chan), 'calendar_week_numbers', V2.chan === s.chan, () => { V2.chan = s.chan; LC.openApp('ap_shifts'); LC.renderNav(); }))); } catch {}
        nav.append(el('div', { class: 'pad' }, el('button', { class: 'secondary sm withicon', onclick: newSchedule }, LC.icon('add'), el('span', { text: t('ap_newSchedule') }))));
      },
      main(host) { if (V2.chan) scheduleView(host, V2.chan); else myShifts(host); },
    } });
  function newSchedule() {
    const sel = A.select([['', t('ap_pickChat')], ...A.allChats().filter((c) => !V2.schedules.some((s) => s.chan === c.id)).map((c) => [c.id, c.label])], '', null, t('ap_pickChat'));
    A.modal(t('ap_newSchedule'), 'person_clock', [el('p', { class: 'muted', text: t('ap_pickChatSchedule') }), A.field(t('ap_pickChat'), sel)], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_newSchedule'), onclick: async () => { if (!sel.value) return; if (await A.call('/api/ap/shifts/create', { chan: sel.value })) { LC.closeModal(); V2.chan = sel.value; LC.openApp('ap_shifts'); LC.renderNav(); } } })], { wide: false });
  }
  A.openers.shifts = (a) => { V2.chan = a.chan || null; A.openApp('ap_shifts'); };
  LC.addStrings('en', { ap_date: 'Date' });
})();
