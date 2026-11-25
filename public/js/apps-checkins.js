'use strict';
// Daily check-ins: questions asked in a chat on chosen days at a set time ("What did you do yesterday? Today? Blockers?").
// At that time everyone gets a prompt (activity + a card in the chat); answers are collected into a daily summary.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_checkins: 'Check-ins', ap_checkinsDesc: 'Daily stand-up questions on a schedule, with a summary of everyone’s answers.', ap_newCheckin: 'New check-in', ap_editCheckin: 'Edit check-in', ap_checkinTitle: 'Name', ap_questions: 'Questions', ap_addQuestion: 'Add question',
    ap_days: 'Days', ap_time: 'Time', ap_active: 'On', ap_paused: 'Paused', ap_askNow: 'Ask now', ap_answer: 'Answer', ap_editAnswer: 'Edit my answer', ap_summary: 'Summary', ap_answeredN: '{n} of {m} answered', ap_notYet: 'Not answered yet', ap_delCheckin: 'Delete check-in',
    ap_confirmDelCheckin: 'Delete the check-in “{name}” and its answers?', ap_noCheckins: 'No check-ins yet', ap_noCheckinsHelp: 'Ask the same questions every working day and see everyone’s answers in one place.', ap_q1: 'What did you do yesterday?', ap_q2: 'What will you do today?', ap_q3: 'Anything blocking you?',
    ap_defaultCheckin: 'Daily stand-up', ap_checkinCard: 'Check-in', ap_sentAnswer: 'Thanks! Your answers were sent.', ap_noRuns: 'Nothing asked yet. The first prompt comes on the next chosen day at the set time, or select “Ask now”.', ap_everyDay: 'Every day', ap_weekdays: 'Monday to Friday', ap_atTime: '{days} at {time}', ap_youAnsweredShort: 'You answered',
  });
  LC.addStrings('hi', { ap_checkins: 'चेक-इन', ap_answer: 'जवाब दें', ap_summary: 'सारांश' });
  LC.addStrings('es', { ap_checkins: 'Seguimientos', ap_answer: 'Responder', ap_summary: 'Resumen' });
  const WD = [1, 2, 3, 4, 5, 6, 0], myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const dayName = (wd, style = 'short') => A.fmtDay(A.addDays(A.weekStart(Date.now()), (wd + 6) % 7), { weekday: style });
  const when = (c) => t('ap_atTime', { days: c.days.length === 7 ? t('ap_everyDay') : c.days.join() === '1,2,3,4,5' ? t('ap_weekdays') : WD.filter((d) => c.days.includes(d)).map((d) => dayName(d)).join(', '), time: c.time });
  const dayLabel = (day) => A.fmtDay(A.fromDay(day), { weekday: 'long', day: 'numeric', month: 'long' });

  function editDialog(chan, c) {
    const title = el('input', { value: c ? c.title : t('ap_defaultCheckin'), maxlength: 120, 'aria-label': t('ap_checkinTitle') }), qs = c ? [...c.qs] : [t('ap_q1'), t('ap_q2'), t('ap_q3')], qbox = el('div', { class: 'ap-opts' });
    let days = c ? [...c.days] : [1, 2, 3, 4, 5]; const time = el('input', { type: 'time', value: c ? c.time : '09:30', 'aria-label': t('ap_time') }), active = el('input', { type: 'checkbox', checked: c ? c.active : true });
    const drawQ = () => A.put(qbox, ...qs.map((q, i) => el('div', { class: 'ap-optrow' }, (() => { const n = el('input', { value: q, maxlength: 300, 'aria-label': t('ap_question') + ' ' + (i + 1) }); n.addEventListener('input', () => { qs[i] = n.value; }); return n; })(), LC.ibtn('dismiss', t('ap_remove'), () => { qs.splice(i, 1); drawQ(); }, { disabled: qs.length <= 1 }))), qs.length < 10 ? el('button', { type: 'button', class: 'link', text: t('ap_addQuestion'), onclick: () => { qs.push(''); drawQ(); } }) : null);
    const dbox = el('div', { class: 'ap-dayspick', role: 'group', 'aria-label': t('ap_days') });
    const drawD = () => A.put(dbox, ...WD.map((d) => el('button', { type: 'button', class: 'ap-daypick' + (days.includes(d) ? ' on' : ''), 'aria-pressed': String(days.includes(d)), 'aria-label': dayName(d, 'long'), onclick: () => { days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; drawD(); } }, dayName(d).slice(0, 2))));
    drawQ(); drawD();
    A.modal(c ? t('ap_editCheckin') : t('ap_newCheckin'), 'people_checkmark', [A.field(t('ap_checkinTitle'), title), el('h3', { text: t('ap_questions') }), qbox, A.field(t('ap_days'), dbox), el('div', { class: 'ap-row' }, A.field(t('ap_time'), time), el('label', { class: 'check' }, active, t('ap_active'))), el('p', { class: 'muted small', text: myTz })],
      [c ? el('button', { class: 'secondary ap-danger', text: t('ap_delCheckin'), onclick: async () => { if (await LC.confirm(t('ap_confirmDelCheckin', { name: c.title }), { danger: true, ok: t('ap_delete') })) { if (await A.call('/api/ap/checkin', { chan, op: 'del', id: c.id })) LC.closeModal(); } } }) : null,
        el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_save'), onclick: async () => { if (await A.call('/api/ap/checkin', { chan, op: c ? 'edit' : 'add', id: c && c.id, title: title.value, qs: qs.filter((q) => q.trim()), days, time: time.value, tz: myTz, active: active.checked })) LC.closeModal(); } })], { wide: false });
  }
  A.answerCheckin = async (chan, id, day) => {
    let d; try { d = await LC.api('/api/ap/checkins?chan=' + encodeURIComponent(chan)); } catch (e) { return A.fail(e); }
    const c = d.list.find((x) => x.id === id); if (!c) return LC.toast(t('ap_noCheckins'));
    const run = c.runs.find((r) => r.day === day) || c.runs[0]; if (!run) return LC.toast(t('ap_noRuns'));
    const mine = run.ans[S.me.id], boxes = c.qs.map((q, i) => { const ta = el('textarea', { rows: 2, maxlength: 2000, 'aria-label': q }); ta.value = mine ? mine.a[i] || '' : ''; return { q, ta }; });
    A.modal(c.title + ' · ' + dayLabel(run.day), 'people_checkmark', boxes.map(({ q, ta }) => A.field(q, ta)), [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_submit'), onclick: async () => { if (await A.call('/api/ap/checkin/answer', { chan, id, day: run.day, a: boxes.map((b) => b.ta.value) })) { LC.closeModal(); LC.toast(t('ap_sentAnswer')); } } })], { wide: false });
    setTimeout(() => boxes[0] && boxes[0].ta.focus(), 40);
  };
  function summary(c, run, people) {
    const answered = people.filter((u) => run.ans[u]), missing = people.filter((u) => !run.ans[u]);
    return el('div', { class: 'ap-cisum' }, el('div', { class: 'ap-row' }, el('b', { text: dayLabel(run.day) }), el('span', { class: 'ap-pill' + (answered.length === people.length ? ' ok' : ''), text: t('ap_answeredN', { n: answered.length, m: people.length }) })),
      answered.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'table ap-citable' }, el('thead', {}, el('tr', {}, el('th', { text: t('ap_person') }), ...c.qs.map((q) => el('th', { text: q })))), el('tbody', {}, ...answered.map((u) => el('tr', {}, el('th', { scope: 'row' }, el('span', { class: 'ap-lperson' }, LC.avatar(S.users.get(u), 'xs'), el('span', { text: LC.uname(u) }))), ...c.qs.map((_, i) => el('td', { class: 'ap-pre', text: run.ans[u].a[i] || '—' }))))))) : null,
      missing.length ? el('p', { class: 'muted small', text: t('ap_notYet') + ': ' + missing.map(LC.uname).join(', ') }) : null);
  }
  async function summaryDialog(chan, id, day) {
    let d; try { d = await LC.api('/api/ap/checkins?chan=' + encodeURIComponent(chan)); } catch (e) { return A.fail(e); }
    const c = d.list.find((x) => x.id === id), run = c && (c.runs.find((r) => r.day === day) || c.runs[0]); if (!run) return LC.toast(t('ap_noRuns'));
    A.modal(t('ap_summary') + ': ' + c.title, 'people_checkmark', [summary(c, run, d.people)], [el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })]);
  }
  A.tab({ key: 'ap_checkins', icon: 'people_checkmark', label: () => t('ap_checkins'), desc: () => t('ap_checkinsDesc'), order: 68, optIn: true,
    async render(host, chan) {
      const root = el('div', { class: 'ap-page' }), pick = {}; A.put(host, root);
      const load = async () => {
        let d; try { d = await LC.api('/api/ap/checkins?chan=' + encodeURIComponent(chan)); } catch (e) { return A.put(root, el('p', { class: 'err', text: e.message })); }
        const can = d.canAdd;
        A.put(root, A.head('people_checkmark', t('ap_checkins'), can ? el('button', { class: 'primary sm withicon', onclick: () => editDialog(chan, null) }, LC.icon('add'), el('span', { text: t('ap_newCheckin') })) : null),
          ...(d.list.length ? d.list.map((c) => { const run = c.runs.find((r) => r.day === pick[c.id]) || c.runs[0], mineOk = c.by === S.me.id || A.isManager(chan);
            return el('section', { class: 'ap-cicard' }, el('div', { class: 'ap-row' }, el('div', { class: 'grow' }, el('h3', { text: c.title }), el('div', { class: 'muted small', text: when(c) + ' · ' + (c.active ? t('ap_active') : t('ap_paused')) + ' · ' + c.qs.length + ' ' + t('ap_questions').toLowerCase() })),
              run ? el('button', { class: 'primary sm', text: run.ans[S.me.id] ? t('ap_editAnswer') : t('ap_answer'), onclick: () => A.answerCheckin(chan, c.id, run.day) }) : null,
              can && mineOk ? el('button', { class: 'secondary sm', text: t('ap_askNow'), onclick: () => A.call('/api/ap/checkin', { chan, op: 'run', id: c.id }) }) : null, can && mineOk ? LC.ibtn('edit', t('ap_editCheckin'), () => editDialog(chan, c)) : null),
              c.runs.length ? el('div', { class: 'ap-row' }, el('span', { class: 'small muted', text: t('ap_summary') }), A.select(c.runs.map((r) => [r.day, dayLabel(r.day)]), run.day, (v) => { pick[c.id] = v; load(); }, t('ap_summary'))) : el('p', { class: 'muted small', text: t('ap_noRuns') }),
              run ? summary(c, run, d.people) : null); }) : [A.empty('people_checkmark', t('ap_noCheckins'), t('ap_noCheckinsHelp'), can ? el('button', { class: 'primary', text: t('ap_newCheckin'), onclick: () => editDialog(chan, null) }) : null)]));
      };
      A.on('ap_checkins', (e) => { if (e.chan === chan) load(); }, root); load();
    } });
  A.card('checkin', (m) => {
    const c = m.apCard;
    return el('div', { class: 'ap-mcard ap-cicardmsg', role: 'group', 'aria-label': t('ap_checkinCard') + ': ' + c.title },
      el('div', { class: 'ap-mchead' }, el('span', { class: 'ap-mcicon', 'aria-hidden': 'true' }, LC.icon('people_checkmark')), el('div', { class: 'grow' }, el('div', { class: 'ap-mckind', text: t('ap_checkinCard') + ' · ' + dayLabel(c.day) }), el('b', { class: 'ap-mctitle', text: c.title }))),
      el('div', { class: 'muted small', text: t('ap_answeredN', { n: c.n, m: c.of }) }),
      el('div', { class: 'ap-mcacts' }, el('button', { class: 'primary sm', text: t('ap_answer'), onclick: () => A.answerCheckin(m.chan, c.id, c.day) }), el('button', { class: 'secondary sm', text: t('ap_summary'), onclick: () => summaryDialog(m.chan, c.id, c.day) })));
  });
  A.app({ key: 'ap_checkinsapp', icon: 'people_checkmark', color: '#986f0b', name: () => t('ap_checkins'), desc: () => t('ap_checkinsDesc'), tab: 'ap_checkins' });
  A.openers.checkins = async (a) => { if (a.chan) { if (a.msg) await LC.jumpToMessage(a.chan, a.msg); if (a.ref) A.answerCheckin(a.chan, a.ref.id, a.ref.day); } };
})();
