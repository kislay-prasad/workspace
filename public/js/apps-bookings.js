'use strict';
// Bookings: appointment pages with services (name, length), staff and their weekly hours; anyone in the session books a free
// slot with a staff member; bookings lists for staff and customers; cancel / reschedule.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_bookings: 'Bookings', ap_bookingsDesc: 'Let people book time with you or your team: services, staff, opening hours.', ap_newPage: 'New booking page', ap_pageName: 'Name', ap_book: 'Book', ap_bookIt: 'Book this time', ap_booked: 'Booked: {what} on {when}.',
    ap_service: 'Service', ap_services: 'Services', ap_staff: 'Staff', ap_anyone: 'Anyone available', ap_minutes: '{n} min', ap_pickDay: 'Day', ap_freeTimes: 'Free times', ap_noTimes: 'No free times on this day.', ap_note: 'Note for the staff member (optional)',
    ap_myBookings: 'My bookings', ap_staffBookings: 'Bookings with me', ap_allBookings: 'Bookings', ap_settings: 'Settings', ap_cancelBooking: 'Cancel booking', ap_confirmCancelBooking: 'Cancel “{what}” on {when}?', ap_reschedule: 'Reschedule', ap_moving: 'Pick a new time for “{what}”.',
    ap_hours: 'Opening hours', ap_closed: 'Closed', ap_addService: 'Add service', ap_addStaff: 'Add staff', ap_duration: 'Length (minutes)', ap_timezone: 'Time zone', ap_slotStep: 'Times every', ap_window: 'Bookable days ahead', ap_delPage: 'Delete booking page',
    ap_confirmDelPage: 'Delete “{name}”? Upcoming bookings are canceled.', ap_noPages: 'No booking pages yet', ap_noPagesHelp: 'Make a booking page with your services and opening hours; anyone here can then book a time.', ap_noBookings: 'No bookings.', ap_with: 'with {name}',
    ap_customer: 'Customer', ap_canceledBy: 'Canceled', ap_past: 'Past', ap_timesIn: 'Times are shown in your time zone ({tz}).', ap_bookingsFor: 'Book with {name}',
  });
  LC.addStrings('hi', { ap_bookings: 'बुकिंग', ap_book: 'बुक करें', ap_myBookings: 'मेरी बुकिंग' });
  LC.addStrings('es', { ap_bookings: 'Reservas', ap_book: 'Reservar', ap_myBookings: 'Mis reservas' });
  const DAY = 86400000, WD = [1, 2, 3, 4, 5, 6, 0];
  const myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  // the page's own time zone decides opening hours (the server checks with the same rules)
  const fmts = new Map(), fmt = (tz) => { if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' })); return fmts.get(tz); };
  const wall = (tz, ts) => { const p = {}; for (const x of fmt(tz).formatToParts(new Date(ts))) p[x.type] = x.value; return { y: +p.year, m: +p.month, d: +p.day, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), min: (+p.hour % 24) * 60 + +p.minute, s: +p.second }; };
  const offset = (tz, ts) => { const w = wall(tz, ts); return Math.round((Date.UTC(w.y, w.m - 1, w.d, 0, w.min, w.s) - Math.floor(ts / 1000) * 1000) / 60000); };
  const fromWall = (tz, y, m, d, min) => { const g = Date.UTC(y, m - 1, d, 0, min), f = g - offset(tz, g) * 60000; return g - offset(tz, f) * 60000; };
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, toMin = (s) => { const [h, m] = String(s || '').split(':').map(Number); return h * 60 + (m || 0); };
  const svcName = (p, id) => ((Array.isArray(p.services) && p.services.find((s) => s.id === id)) || {}).name || '';
  function slots(p, svc, staffIds, dayTs) { // free start times on one day of the page's calendar → [{ ts, staff }]
    const w = wall(p.tz, dayTs + 12 * 3600000), out = new Map(), now = Date.now();
    for (const uid of staffIds) {
      const st = p.staffHours.find((x) => x.uid === uid); if (!st) continue;
      for (const [s, e] of st.hours[w.wd] || []) for (let m = s; m + svc.dur <= e; m += p.step) {
        const ts = fromWall(p.tz, w.y, w.m, w.d, m), end = ts + svc.dur * 60000;
        if (ts < now + 60000 || ts > now + p.window * DAY || out.has(ts)) continue;
        if (p.busy.some((b) => b.staff === uid && b.start < end && b.end > ts)) continue;
        out.set(ts, uid);
      }
    }
    return [...out].sort((a, b) => a[0] - b[0]).map(([ts, staff]) => ({ ts, staff }));
  }
  function bookView(box, p, move) { // move = an existing booking being rescheduled
    const B = { svc: move ? move.svc : p.services[0] && p.services[0].id, staff: move ? move.staff : '', day: A.dayStart(Date.now()), slot: null };
    const draw = () => {
      const svc = p.services.find((s) => s.id === B.svc), staffIds = B.staff ? [B.staff] : p.staffHours.map((s) => s.uid), days = Array.from({ length: Math.min(p.window, 14) }, (_, i) => A.addDays(A.dayStart(Date.now()), i));
      const list = svc ? slots(p, svc, staffIds, B.day) : [], note = el('input', { maxlength: 500, placeholder: t('ap_note'), 'aria-label': t('ap_note') });
      A.put(box, 
        move ? el('p', { class: 'notice', text: t('ap_moving', { what: svcName(p, move.svc) }) }) : null,
        el('h3', { text: t('ap_service') }), el('div', { class: 'ap-svcs', role: 'radiogroup', 'aria-label': t('ap_service') }, ...p.services.map((s) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(s.id === B.svc), class: 'ap-svc' + (s.id === B.svc ? ' on' : ''), disabled: !!move && s.id !== move.svc, onclick: () => { B.svc = s.id; B.slot = null; draw(); } }, el('b', { text: s.name }), el('span', { class: 'muted small', text: t('ap_minutes', { n: s.dur }) + (s.desc ? ' · ' + s.desc : '') })))),
        el('h3', { text: t('ap_staff') }), A.select([['', t('ap_anyone')], ...p.staffHours.map((s) => [s.uid, LC.uname(s.uid)])], B.staff, (v) => { B.staff = v; B.slot = null; draw(); }, t('ap_staff')),
        el('h3', { text: t('ap_pickDay') }), el('div', { class: 'ap-days', role: 'radiogroup', 'aria-label': t('ap_pickDay') }, ...days.map((d) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(d === B.day), class: 'ap-day' + (d === B.day ? ' on' : ''), onclick: () => { B.day = d; B.slot = null; draw(); } }, el('span', { class: 'small', text: A.fmtDay(d, { weekday: 'short' }) }), el('b', { text: new Date(d).getDate() })))),
        el('h3', { text: t('ap_freeTimes') }), el('p', { class: 'muted small', text: t('ap_timesIn', { tz: myTz }) }),
        list.length ? el('div', { class: 'ap-slots', role: 'radiogroup', 'aria-label': t('ap_freeTimes') }, ...list.map((s) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(!!B.slot && B.slot.ts === s.ts), class: 'ap-slot' + (B.slot && B.slot.ts === s.ts ? ' on' : ''), onclick: () => { B.slot = s; draw(); }, title: LC.uname(s.staff) }, A.hm(s.ts)))) : el('p', { class: 'muted', text: t('ap_noTimes') }),
        B.slot ? el('div', { class: 'ap-bookbar' }, el('span', { class: 'grow' }, el('b', { text: svcName(p, B.svc) }), ' · ' + LC.fmtDateTime(B.slot.ts) + ' · ' + t('ap_with', { name: LC.uname(B.slot.staff) })), move ? null : note,
          el('button', { class: 'primary', text: move ? t('ap_reschedule') : t('ap_bookIt'), onclick: async () => {
            const r = move ? await A.call('/api/ap/book/move', { id: p.id, bid: move.id, start: B.slot.ts, staff: B.slot.staff }) : await A.call('/api/ap/book', { id: p.id, svc: B.svc, staff: B.slot.staff, start: B.slot.ts, note: note.value });
            if (r) { LC.toast(t('ap_booked', { what: svcName(p, B.svc), when: LC.fmtDateTime(B.slot.ts) })); if (move && LC.closeModal) LC.closeModal(); LC.emitLocal('ap:bookings', { id: p.id }); }
          } })) : null);
    };
    draw();
  }
  function bookingRow(p, b, o = {}) {
    const past = b.end < Date.now(), can = b.status === 'booked' && !past;
    return el('div', { class: 'ap-bkrow' + (b.status !== 'booked' ? ' canceled' : '') + (past ? ' past' : '') }, el('div', { class: 'ap-bkwhen' }, el('b', { text: A.fmtDay(b.start, { day: 'numeric', month: 'short' }) }), el('span', { text: A.hm(b.start) + '–' + A.hm(b.end) })),
      el('div', { class: 'grow' }, el('b', { text: svcName(p, b.svc) || b.svcName || '' }), el('div', { class: 'muted small', text: [o.page ? b.pageName : '', o.staffView ? t('ap_customer') + ': ' + LC.uname(b.by) : t('ap_with', { name: LC.uname(b.staff) }), b.status !== 'booked' ? t('ap_canceledBy') : ''].filter(Boolean).join(' · ') }), b.note ? el('div', { class: 'small', text: '“' + b.note + '”' }) : null),
      can ? el('button', { class: 'secondary sm', text: t('ap_reschedule'), onclick: async () => { const d = await LC.api('/api/ap/booking?id=' + (b.page || p.id)).catch(A.fail); if (!d) return; const box = el('div', { class: 'ap-book' }); A.modal(t('ap_reschedule'), 'calendar_edit', box, null); bookView(box, d.page, b); } }) : null,
      can ? el('button', { class: 'secondary sm ap-danger', text: t('ap_cancelBooking'), onclick: async () => { if (await LC.confirm(t('ap_confirmCancelBooking', { what: svcName(p, b.svc) || b.svcName, when: LC.fmtDateTime(b.start) }), { danger: true, ok: t('ap_cancelBooking') })) { if (await A.call('/api/ap/book/cancel', { id: b.page || p.id, bid: b.id })) LC.emitLocal('ap:bookings', {}); } } }) : null);
  }
  function settingsView(box, p) {
    const S2 = { name: p ? p.name : '', desc: p ? p.desc : '', color: p ? p.color : '#038387', tz: p ? p.tz : myTz, step: p ? p.step : 30, window: p ? p.window : 60, services: p ? p.services.map((s) => ({ ...s })) : [{ name: '', dur: 30, desc: '' }], staff: p ? p.staffHours.map((s) => ({ uid: s.uid, hours: JSON.parse(JSON.stringify(s.hours)) })) : [{ uid: S.me.id, hours: { 1: [[540, 1020]], 2: [[540, 1020]], 3: [[540, 1020]], 4: [[540, 1020]], 5: [[540, 1020]] } }] };
    const inp = (key, attrs) => { const i = el('input', { value: S2[key], ...attrs }); i.addEventListener('input', () => { S2[key] = attrs.type === 'number' ? Number(i.value) : i.value; }); return i; };
    const tzs = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [myTz, 'UTC']; } })();
    const svcBox = el('div', { class: 'ap-svcedit' }), staffBox = el('div', { class: 'ap-staffedit' });
    const drawSvc = () => A.put(svcBox, ...S2.services.map((s, i) => el('div', { class: 'ap-optrow' }, (() => { const n = el('input', { value: s.name, maxlength: 80, placeholder: t('ap_service'), 'aria-label': t('ap_service') + ' ' + (i + 1) }); n.addEventListener('input', () => { s.name = n.value; }); return n; })(), (() => { const n = el('input', { type: 'number', min: 5, max: 480, step: 5, value: s.dur, class: 'ap-num', 'aria-label': t('ap_duration') }); n.addEventListener('input', () => { s.dur = Number(n.value); }); return n; })(), (() => { const n = el('input', { value: s.desc || '', maxlength: 300, placeholder: t('ap_description'), 'aria-label': t('ap_description') }); n.addEventListener('input', () => { s.desc = n.value; }); return n; })(), LC.ibtn('delete', t('ap_remove'), () => { S2.services.splice(i, 1); drawSvc(); }, { disabled: S2.services.length <= 1 }))), el('button', { type: 'button', class: 'link', text: t('ap_addService'), onclick: () => { S2.services.push({ name: '', dur: 30, desc: '' }); drawSvc(); } }));
    const drawStaff = () => A.put(staffBox, ...S2.staff.map((st, i) => el('div', { class: 'ap-staffcard' }, el('div', { class: 'ap-row' }, LC.avatar(S.users.get(st.uid), 'sm'), el('b', { class: 'grow', text: LC.uname(st.uid) }), LC.ibtn('delete', t('ap_remove') + ': ' + LC.uname(st.uid), () => { S2.staff.splice(i, 1); drawStaff(); }, { disabled: S2.staff.length <= 1 })),
      el('div', { class: 'ap-hours' }, ...WD.map((wd) => { const r = (st.hours[wd] || [])[0], on = !!r; return el('div', { class: 'ap-hrow' }, el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: on, onchange: (e) => { st.hours[wd] = e.target.checked ? [[540, 1020]] : []; drawStaff(); } }), el('span', { text: A.fmtDay(A.addDays(A.weekStart(Date.now()), (wd + 6) % 7), { weekday: 'long' }) })),
        on ? el('span', { class: 'ap-row' }, el('input', { type: 'time', value: hm(r[0]), 'aria-label': t('ap_starts'), onchange: (e) => { r[0] = toMin(e.target.value); } }), '–', el('input', { type: 'time', value: hm(r[1]), 'aria-label': t('ap_ends'), onchange: (e) => { r[1] = toMin(e.target.value); } })) : el('span', { class: 'muted small', text: t('ap_closed') })); })))),
      A.peoplePick({ people: A.everyone().filter((u) => !S2.staff.some((s) => s.uid === u.id)), label: t('ap_addStaff'), placeholder: t('ap_addStaff'), multi: false, onChange: (v) => { if (v[0]) { S2.staff.push({ uid: v[0], hours: { 1: [[540, 1020]], 2: [[540, 1020]], 3: [[540, 1020]], 4: [[540, 1020]], 5: [[540, 1020]] } }); drawStaff(); } } }));
    drawSvc(); drawStaff();
    A.put(box, A.field(t('ap_pageName'), inp('name', { maxlength: 80 })), A.field(t('ap_description'), inp('desc', { maxlength: 1000 })),
      el('div', { class: 'ap-row' }, A.field(t('ap_timezone'), A.select(tzs.map((z) => [z, z]), S2.tz, (v) => { S2.tz = v; }, t('ap_timezone'))), A.field(t('ap_slotStep'), A.select([[15, t('ap_minutes', { n: 15 })], [30, t('ap_minutes', { n: 30 })], [60, t('ap_minutes', { n: 60 })]], S2.step, (v) => { S2.step = Number(v); }, t('ap_slotStep'))), A.field(t('ap_window'), inp('window', { type: 'number', min: 1, max: 180, class: 'ap-num' }))),
      el('h3', { text: t('ap_services') }), svcBox, el('h3', { text: t('ap_staff') + ' · ' + t('ap_hours') }), staffBox,
      el('div', { class: 'acts' }, p ? el('button', { class: 'secondary ap-danger', text: t('ap_delPage'), onclick: async () => { if (await LC.confirm(t('ap_confirmDelPage', { name: p.name }), { danger: true, ok: t('ap_delete') })) { if (await A.call('/api/ap/booking/delete', { id: p.id })) { V.page = null; LC.openApp('ap_bookings'); LC.renderNav(); } } } }) : null,
        el('button', { class: 'primary', text: t('ap_save'), onclick: async () => { const r = await A.call('/api/ap/booking/save', { id: p && p.id, ...S2, services: S2.services.filter((s) => s.name.trim()) }); if (r) { V.page = r.page.id; V.view = 'book'; LC.openApp('ap_bookings'); LC.renderNav(); } } })));
  }
  // ---------- the app ----------
  const V = { page: null, view: 'book', pages: [] };
  async function pageView(host, id) {
    const root = el('div', { class: 'ap-page' }); A.put(host, root);
    const load = async () => {
      let p; try { p = (await LC.api('/api/ap/booking?id=' + id)).page; } catch (e) { return A.put(root, el('p', { class: 'err', text: e.message })); }
      const isStaff = p.staff.includes(S.me.id), views = [['book', t('ap_book'), 'calendar_add'], ...(isStaff || p.canEdit ? [['list', t('ap_allBookings'), 'text_bullet_list_ltr']] : []), ...(p.canEdit ? [['settings', t('ap_settings'), 'settings']] : [])];
      if (!views.some((v) => v[0] === V.view)) V.view = 'book';
      const box = el('div', { class: 'ap-book' });
      A.put(root, el('div', { class: 'ap-lhead' }, el('span', { class: 'ap-navic', style: { background: p.color }, 'aria-hidden': 'true' }, LC.icon('calendar_checkmark')), el('div', { class: 'grow' }, el('h2', { text: p.name }), p.desc ? el('div', { class: 'muted small', text: p.desc }) : null)),
        el('div', { class: 'ap-tbar' }, A.seg(views, V.view, (v) => { V.view = v; load(); }, p.name)), box);
      if (V.view === 'book') bookView(box, p);
      else if (V.view === 'list') { const up = p.bookings.filter((b) => b.end >= Date.now()).sort((a, b) => a.start - b.start), past = p.bookings.filter((b) => b.end < Date.now()).sort((a, b) => b.start - a.start).slice(0, 30); A.put(box, ...(up.length ? up.map((b) => bookingRow(p, b, { staffView: true })) : [el('p', { class: 'muted', text: t('ap_noBookings') })]), past.length ? el('h3', { text: t('ap_past') }) : null, ...past.map((b) => bookingRow(p, b, { staffView: true }))); }
      else settingsView(box, p);
    };
    A.on('ap_bookings', (e) => { if (!e.id || e.id === id) { if (V.view !== 'settings') load(); } }, root); A.on('ap:bookings', () => { if (V.view !== 'settings') load(); }, root); load();
  }
  async function mine(host) {
    const root = el('div', { class: 'ap-page' }); A.put(host, root);
    const load = async () => {
      let d; try { d = await LC.api('/api/ap/bookings'); } catch (e) { return A.put(root, el('p', { class: 'err', text: e.message })); }
      V.pages = d.pages; const pageOf = (b) => d.pages.find((p) => p.id === b.page) || { id: b.page, services: [] };
      const up = (list) => list.filter((b) => b.end >= Date.now() && b.status === 'booked').sort((a, b) => a.start - b.start);
      A.put(root, el('h2', { class: 'ap-sub', text: t('ap_myBookings') }), ...(up(d.mine).length ? up(d.mine).map((b) => bookingRow(pageOf(b), b, { page: true })) : [el('p', { class: 'muted', text: t('ap_noBookings') })]),
        d.staffOf.length ? el('h2', { class: 'ap-sub', text: t('ap_staffBookings') }) : null, ...up(d.staffOf).map((b) => bookingRow(pageOf(b), b, { page: true, staffView: true })),
        el('h2', { class: 'ap-sub', text: t('ap_bookings') }), d.pages.length ? el('div', { class: 'ap-lcards' }, ...d.pages.map((p) => el('button', { type: 'button', class: 'ap-lcard', onclick: () => { V.page = p.id; V.view = 'book'; LC.openApp('ap_bookings'); LC.renderNav(); } }, el('span', { class: 'ap-navic', style: { background: p.color }, 'aria-hidden': 'true' }, LC.icon('calendar_checkmark')), el('span', { class: 'grow' }, el('b', { text: p.name }), el('span', { class: 'muted small', text: t('ap_bookingsFor', { name: p.staff.map(LC.uname).join(', ') }) }))))) : A.empty('calendar_checkmark', t('ap_noPages'), t('ap_noPagesHelp')));
    };
    A.on('ap_bookings', load, root); A.on('ap:bookings', load, root); load();
  }
  A.app({ key: 'ap_bookings', icon: 'calendar_checkmark', color: '#ca5010', name: () => t('ap_bookings'), desc: () => t('ap_bookingsDesc'), order: 80,
    pane: {
      async render(nav) {
        const item = (label, icon, on, fn, color) => el('button', { class: 'ap-navitem' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null, onclick: fn }, color ? el('i', { class: 'ap-ldot', style: { background: color } }) : LC.icon(icon), el('span', { class: 'grow', text: label }));
        A.put(nav, item(t('ap_myBookings'), 'person', !V.page, () => { V.page = null; LC.openApp('ap_bookings'); LC.renderNav(); }), el('div', { class: 'ap-navsec', text: t('ap_bookings') }));
        try { const d = await LC.api('/api/ap/bookings'); V.pages = d.pages; nav.append(...d.pages.map((p) => item(p.name, '', V.page === p.id, () => { V.page = p.id; V.view = 'book'; LC.openApp('ap_bookings'); LC.renderNav(); }, p.color))); } catch {}
        nav.append(el('div', { class: 'pad' }, el('button', { class: 'secondary sm withicon', onclick: () => { V.page = 'new'; LC.openApp('ap_bookings'); LC.renderNav(); } }, LC.icon('add'), el('span', { text: t('ap_newPage') }))));
      },
      main(host) { if (V.page === 'new') { const box = el('div', { class: 'ap-book' }); A.put(host, el('div', { class: 'ap-page' }, el('h2', { text: t('ap_newPage') }), box)); settingsView(box, null); } else if (V.page) pageView(host, V.page); else mine(host); },
    } });
  A.openers.bookings = (a) => { V.page = (a.ref && a.ref.id) || null; V.view = 'list'; A.openApp('ap_bookings'); };
})();
