'use strict';
// Meetings — webinars and big events (section 23) and language interpretation (section 21):
// registration page (#register=<id>) with the organizer's approval, presenters vs. audience (attendees only watch; the calls
// area enforces it with hard mute / no cameras / presenter-only sharing on the call this area marks), interpreter audio.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), MT = LC.mt;
  LC.addStrings('en', {
    mt_register: 'Register', mt_regTitle: 'Register for this event', mt_regName: 'Your name', mt_regEmail2: 'Email', mt_regNotes2: 'Notes for the organizer', mt_regDone: 'Thanks! The organizer will confirm your registration.', mt_regApproved: "You're registered. Join from here when it starts.",
    mt_regDeclined: 'The organizer declined this registration.', mt_regStatus: 'Status', mt_regClosed: 'Registration for this event is closed.', mt_regPendingPill: 'Waiting', mt_regApprovedPill: 'Approved', mt_regDeclinedPill: 'Declined', mt_approve: 'Approve', mt_approveAll: 'Approve all', mt_noRegs: 'No registrations yet.',
    mt_copyRegLink: 'Copy registration link', mt_regLinkCopied: 'Registration link copied', mt_attendeeNote: "You're an attendee: you can watch, react, raise your hand and ask in Q&A. The organizer can let you speak.",
    mt_langTitle: 'Language interpretation', mt_original: 'Original audio', mt_listenIn: 'Listen in {lang}', mt_youInterpret: 'You interpret into {lang}. People who pick it hear you; everyone else hears the original.', mt_interpreters: 'Interpreters', mt_saveInterp: 'Save interpreters', mt_langSaved: 'Interpreters saved',
    mt_a_invite: 'invited you to “{title}”', mt_a_update: 'updated “{title}”', mt_a_time: 'changed the time of “{title}”', mt_a_cancel: 'cancelled “{title}”', mt_a_removed: 'removed you from “{title}”', mt_a_start: '“{title}” is starting now', mt_a_rsvp_yes: 'accepted “{title}”',
    mt_a_rsvp_maybe: 'tentatively accepted “{title}”', mt_a_rsvp_no: 'declined “{title}”', mt_a_reg: 'registered for “{title}”', mt_a_regok: 'approved your registration for “{title}”', mt_a_regno: 'declined your registration for “{title}”', mt_a_meeting: 'Meeting update',
  });
  LC.addStrings('hi', { mt_register: 'पंजीकरण करें', mt_regTitle: 'इस कार्यक्रम के लिए पंजीकरण करें', mt_approve: 'स्वीकृत करें', mt_langTitle: 'भाषा अनुवाद', mt_original: 'मूल ऑडियो', mt_a_invite: 'ने आपको “{title}” में आमंत्रित किया', mt_a_start: '“{title}” अभी शुरू हो रही है' });
  LC.addStrings('es', { mt_register: 'Registrarse', mt_regTitle: 'Regístrate en este evento', mt_approve: 'Aprobar', mt_langTitle: 'Interpretación de idiomas', mt_original: 'Audio original', mt_a_invite: 'te invitó a “{title}”', mt_a_start: '“{title}” empieza ahora' });
  const fail = MT.fail;

  // ---------- activity feed (people area): how meeting items read and where they open ----------
  LC.ext.activityTypes = LC.ext.activityTypes || {};
  LC.ext.activityTypes.meeting = { icon: 'calendar_ltr', filter: 'meeting',
    text: (a) => { const k = a.kind === 'rsvp' ? 'rsvp_' + (a.rsvp || 'yes') : a.kind, s = k ? t('mt_a_' + k, { title: a.title || '' }) : ''; return s && !s.startsWith('mt_a_') ? s : a.title || a.text || t('mt_a_meeting'); },
    open: (a) => { const id = a.meeting || a.ref; if (!id || !LC.meetings) return; if (a.kind === 'start') return LC.meetings.join(id); if (a.kind === 'reg' && MT.registrations) return MT.registrations(id); return LC.meetings.open(id); } };

  // ---------- registration page (#register=<id>): people still need the host's approval to join the session itself ----------
  LC.meetings.register = async (id) => {
    let f; try { f = await LC.api('/api/meetings/register?id=' + encodeURIComponent(id)); } catch (e) { return fail(e); }
    const mine = f.mine, name = el('input', { maxlength: 60, value: (mine && mine.name) || S.me.name, 'aria-label': t('mt_regName'), required: true }), email = el('input', { type: 'email', maxlength: 120, value: (mine && mine.email) || '', 'aria-label': t('mt_regEmail2') });
    const notes = el('textarea', { rows: 3, maxlength: 500, 'aria-label': t('mt_regNotes2') }), answer = el('textarea', { rows: 2, maxlength: 500, 'aria-label': f.fields.question || '' }); notes.value = (mine && mine.notes) || ''; answer.value = (mine && mine.answer) || '';
    const err = el('div', { class: 'err', role: 'alert' }), when = MT.fmtRange(f.start, f.end, false) + (f.repeat ? ' · ' + MT.repeatText(f.repeat, f.start) : '');
    const status = mine ? (mine.status === 'approved' ? t('mt_regApproved') : mine.status === 'declined' ? t('mt_regDeclined') : t('mt_regDone')) : '';
    const go = async (e) => { e.preventDefault(); err.textContent = ''; try { const r = await LC.api('/api/meetings/register', { id, name: name.value, email: email.value, notes: notes.value, answer: answer.value }); LC.closeModal(); LC.toast(r.status === 'approved' ? t('mt_regApproved') : t('mt_regDone'), { ms: 6000 }); if (r.status === 'approved') LC.meetings.register(id); } catch (x) { err.textContent = x.message; } };
    const approved = mine && mine.status === 'approved';
    LC.modal(el('form', { class: 'mt-regform', onsubmit: go }, el('div', { class: 'mt-reghero' }, LC.icon('person_board', { cls: 'big' }), el('div', {}, el('h2', { text: f.title }), el('p', { class: 'muted', text: when }), el('p', { class: 'small muted', text: t('mt_byOrganizer', { name: LC.uname(f.organizer) }) }))),
      f.details ? el('div', { class: 'mt-detailstext' }, LC.renderText(f.details)) : null, status ? el('p', { class: 'notice', role: 'status', text: status }) : null,
      !f.open && !approved ? el('p', { class: 'muted', text: t('mt_regClosed') }) : null,
      f.open && !approved ? el('div', {}, el('h3', { text: t('mt_regTitle') }), MT.field(t('mt_regName'), name), f.fields.email ? MT.field(t('mt_regEmail2'), email) : null, f.fields.notes ? MT.field(t('mt_regNotes2'), notes) : null, f.fields.question ? MT.field(f.fields.question, answer) : null) : null, err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('close'), onclick: LC.closeModal }), approved || f.invited ? el('button', { type: 'button', class: 'primary withicon', onclick: () => { LC.closeModal(); LC.meetings.join(id); } }, LC.icon('video'), el('span', { text: t('mt_join') })) : f.open ? el('button', { type: 'submit', class: 'primary', text: mine ? t('save') : t('mt_register') }) : null)), { label: t('mt_regTitle') });
  };
  MT.registrations = async (id) => {
    let r, m; try { [r, m] = await Promise.all([LC.api('/api/meetings/registrations?id=' + id), MT.get(id)]); } catch (e) { return fail(e); }
    const decide = (b) => LC.api('/api/meetings/registrations', { id, ...b }).then(() => MT.registrations(id)).catch(fail);
    const pill = (s) => el('span', { class: 'pill' + (s === 'approved' ? ' mt-ok' : s === 'declined' ? ' late' : ''), text: s === 'approved' ? t('mt_regApprovedPill') : s === 'declined' ? t('mt_regDeclinedPill') : t('mt_regPendingPill') });
    const pending = r.registrations.filter((x) => x.status === 'pending').length, link = (await MT.base()) + '/#register=' + id;
    LC.modal([el('div', { class: 'row-between mt-regsdlg', 'data-id': id }, el('h2', {}, LC.icon('form'), ' ' + t('mt_registrations') + ' · ' + m.title), LC.ibtn('dismiss', t('close'), LC.closeModal)),
      el('div', { class: 'addr' }, el('code', { class: 'mt-linktext', text: link }), el('button', { type: 'button', class: 'secondary sm withicon', onclick: async () => LC.toast((await LC.copy(link)) ? t('mt_regLinkCopied') : t('copyFailed'), { ms: 1500 }) }, LC.icon('link'), el('span', { text: t('mt_copyRegLink') }))),
      r.registrations.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'table mt-regs' }, el('thead', {}, el('tr', {}, [t('col_person'), t('mt_regEmail2'), t('mt_regNotes2'), t('mt_regStatus'), t('col_actions')].map((h) => el('th', { text: h })))), el('tbody', {}, r.registrations.map((x) => el('tr', {}, el('td', {}, el('b', { text: x.name }), x.answer ? el('div', { class: 'small muted', text: x.answer }) : null), el('td', { text: x.email || '' }), el('td', { class: 'small', text: x.notes || '' }), el('td', {}, pill(x.status)),
        el('td', { class: 'mt-regacts' }, x.status !== 'approved' ? el('button', { type: 'button', class: 'primary sm', text: t('mt_approve'), 'aria-label': t('mt_approve') + ' ' + x.name, onclick: () => decide({ op: 'approve', rid: x.id }) }) : null, x.status !== 'declined' ? el('button', { type: 'button', class: 'secondary sm', text: t('mt_decline'), 'aria-label': t('mt_decline') + ' ' + x.name, onclick: () => decide({ op: 'decline', rid: x.id }) }) : null)))))) : el('p', { class: 'muted', text: t('mt_noRegs') }),
      el('div', { class: 'acts' }, pending > 1 ? el('button', { type: 'button', class: 'primary', text: t('mt_approveAll') + ` (${pending})`, onclick: () => decide({ op: 'approve', all: true }) }) : null, el('button', { type: 'button', class: 'secondary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
  };
  LC.on('mt_reg', (e) => { const dlg = document.querySelector('#modal .mt-regsdlg'); if (dlg && dlg.dataset.id === e.meeting) MT.registrations(e.meeting); });
  MT.detailParts = MT.detailParts || [];
  MT.detailParts.push((m) => {
    if (!m.isOrganizer || !m.options || !m.options.registration || !m.options.registration.on) return null;
    return el('div', {}, el('h3', {}, LC.icon('form'), ' ' + t('mt_registrations')), el('div', { class: 'acts mt-left' }, el('button', { type: 'button', class: 'secondary withicon', onclick: () => MT.registrations(m.id) }, LC.icon('form'), el('span', { text: t('mt_registrations') })), el('button', { type: 'button', class: 'secondary withicon', onclick: async () => LC.toast((await LC.copy((await MT.base()) + '/#register=' + m.id)) ? t('mt_regLinkCopied') : t('copyFailed'), { ms: 1500 }) }, LC.icon('link'), el('span', { text: t('mt_copyRegLink') }))));
  });

  // ---------- attendees in a webinar: a short note in the meeting window (the calls area does the enforcing) ----------
  LC.on('call:drawn', ({ ui }) => {
    const c = MT.call(); if (!c || !c.mt || !c.mt.viewOnly || MT.myRole() !== 'attendee') return; const d = LC.callApi.data(); if (d.mtNoteShown) return;
    const n = el('div', { class: 'mt-attnote', role: 'status' }, LC.icon('info'), el('span', { class: 'grow', text: t('mt_attendeeNote') }), LC.ibtn('dismiss', t('close'), () => { d.mtNoteShown = true; n.remove(); }));
    ui.append(n);
  });

  // ---------- language interpretation: listeners pick a language; interpreters' audio goes only to their listeners ----------
  const langOf = () => LC.callApi.data().mtLang || '';
  function applyAudio() {
    const c = MT.call(); if (!c || !LC.callApi.setVolume) return; const interp = (c.mt && c.mt.interp) || [], mineI = interp.find((i) => i.uid === S.me.id), lang = langOf();
    const want = (uid) => { const i = interp.find((x) => x.uid === uid); if (mineI) return i ? 0 : 1; if (i) return lang && i.lang === lang ? 1 : 0; return lang ? 0.2 : 1; };
    for (const uid of c.participants) if (uid !== S.me.id) { const v = want(uid); if (LC.callApi.volume(uid) !== v) LC.callApi.setVolume(uid, v); }
  }
  LC.on('callstate', (e) => { if (LC.inCall() && e.chan === LC.callChan()) setTimeout(applyAudio, 0); });
  LC.on('call:joined', () => setTimeout(applyAudio, 300));
  MT.langDialog = () => {
    const c = MT.call(); if (!c) return; const interp = (c.mt && c.mt.interp) || [], mineI = interp.find((i) => i.uid === S.me.id), langs = [...new Set(interp.map((i) => i.lang))], cur = langOf(), id = c.meeting;
    const pick = (v) => { LC.callApi.data().mtLang = v; applyAudio(); LC.closeModal(); };
    const opts = [['', t('mt_original')], ...langs.map((l) => [l, t('mt_listenIn', { lang: l })])];
    const body = [el('div', { class: 'row-between' }, el('h2', {}, LC.icon('translate'), ' ' + t('mt_langTitle')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted small', text: t('mt_interpHelp') })];
    if (mineI) body.push(el('p', { class: 'notice', text: t('mt_youInterpret', { lang: mineI.lang }) }));
    else body.push(el('div', { class: 'mt-langs', role: 'radiogroup', 'aria-label': t('mt_langTitle') }, opts.map(([v, l]) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'mtlang', checked: cur === v, onchange: () => pick(v) }), el('span', { text: l })))));
    if (c.mt && c.mt.organizer === S.me.id) {
      const rows = interp.map((x) => ({ ...x })), list = el('div', {});
      const draw = () => list.replaceChildren(...rows.map((row, i) => el('div', { class: 'rowline' }, MT.select([['', '—'], ...[...S.users.values()].filter((u) => !u.removed && !u.deleted).map((u) => [u.id, LC.uname(u.id)])], row.uid, t('mt_interpreters'), (v) => { row.uid = v; }), el('input', { value: row.lang, maxlength: 30, 'aria-label': t('mt_language'), placeholder: t('mt_language'), oninput: (e) => { row.lang = e.target.value; } }), LC.ibtn('delete', t('delete'), () => { rows.splice(i, 1); draw(); }))), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { rows.push({ uid: '', lang: '' }); draw(); } }, LC.icon('add'), t('mt_addInterp')));
      draw(); body.push(el('h3', {}, LC.icon('people'), ' ' + t('mt_interpreters')), list, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary', text: t('mt_saveInterp'), onclick: () => LC.api('/api/meetings/update', { id, options: { interp: rows.filter((x) => x.uid && x.lang.trim()) } }).then(() => { LC.closeModal(); LC.toast(t('mt_langSaved'), { ms: 1500 }); }).catch(fail) })));
    }
    LC.modal(body);
  };
  LC.ext.callMore.push(() => { const c = MT.call(); if (!c || !c.meeting) return []; const has = c.mt && c.mt.interp && c.mt.interp.length; return has || (c.mt && c.mt.organizer === S.me.id) ? [{ icon: 'translate', label: t('mt_langTitle'), fn: () => MT.langDialog() }] : []; });
})();
