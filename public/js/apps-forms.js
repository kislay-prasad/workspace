'use strict';
// Forms: surveys and quizzes (choice, multiple choice, text, rating, date, Likert, ranking) shared in a chat as a card that
// people fill in from the chat; one response per person or several, anonymous, close / reopen, results with charts, CSV.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_forms: 'Forms', ap_formsDesc: 'Surveys and quizzes people fill in right from the chat, with results and charts.', ap_newForm: 'New form', ap_editForm: 'Edit form', ap_formTitle: 'Form title', ap_formDesc: 'Description (optional)', ap_question: 'Question',
    ap_q_choice: 'Choice', ap_q_multi: 'Multiple choice', ap_q_text: 'Text', ap_q_rating: 'Rating', ap_q_date: 'Date', ap_q_likert: 'Likert', ap_q_ranking: 'Ranking', ap_addQ: 'Add a question', ap_required: 'Required', ap_option: 'Option {n}', ap_addOption: 'Add option',
    ap_longAnswer: 'Long answer', ap_levels: 'Levels', ap_stars: 'Stars', ap_numbers: 'Numbers', ap_statements: 'Statements', ap_statementN: 'Statement {n}', ap_scale: 'Choices', ap_correct: 'Correct answer', ap_points: 'Points',
    ap_anon: 'Anonymous responses (names are not recorded)', ap_multiResp: 'People can respond more than once', ap_showRes: 'Show the results to people who respond', ap_saveShare: 'Save and share in this chat', ap_shareIn: 'Share in a chat',
    ap_fillIn: 'Fill in', ap_editResp: 'Edit my response', ap_another: 'Submit another', ap_results: 'Results', ap_responsesN: '{n} responses', ap_responses1: '1 response', ap_submit: 'Submit', ap_thanks: 'Thanks! Your response was sent.', ap_score: 'Score: {got} of {max}',
    ap_closeForm: 'Close the form', ap_reopenForm: 'Reopen the form', ap_formClosed: 'Closed', ap_formClosedHelp: 'This form no longer accepts responses.', ap_delForm: 'Delete form', ap_confirmDelForm: 'Delete the form “{name}” and all its responses?', ap_clearResp: 'Delete all responses',
    ap_confirmClearResp: 'Delete all responses to “{name}”?', ap_quiz: 'Quiz', ap_survey: 'Survey', ap_avg: 'Average {n}', ap_noResp: 'No responses yet.', ap_myForms: 'My forms', ap_sharedForms: 'Shared with me', ap_noForms: 'No forms here yet', ap_noFormsHelp: 'Make a survey or a quiz; it goes into the chat as a card people fill in.',
    ap_answered: 'You responded', ap_answerReq: 'Please answer “{q}”.', ap_rankHelp: 'Use the arrows to put them in order (first = best).', ap_anonymous: 'Anonymous', ap_formCard: 'Form', ap_questionsN: '{n} questions', ap_avgScore: 'Average score {n}', ap_latestAnswers: 'Latest answers',
    ap_formMenu: 'Form options', ap_up: 'Move up', ap_down: 'Move down', ap_delQ: 'Delete question',
  });
  LC.addStrings('hi', { ap_forms: 'फ़ॉर्म', ap_newForm: 'नया फ़ॉर्म', ap_fillIn: 'भरें', ap_results: 'परिणाम', ap_submit: 'जमा करें', ap_thanks: 'धन्यवाद! आपका जवाब भेज दिया गया।' });
  LC.addStrings('es', { ap_forms: 'Formularios', ap_newForm: 'Nuevo formulario', ap_fillIn: 'Responder', ap_results: 'Resultados', ap_submit: 'Enviar', ap_thanks: '¡Gracias! Se envió tu respuesta.' });
  const TYPES = ['choice', 'multi', 'text', 'rating', 'date', 'likert', 'ranking'], TICON = { choice: 'checkmark_circle', multi: 'checkbox_checked', text: 'text_t', rating: 'star', date: 'calendar_ltr', likert: 'table', ranking: 'arrow_sort' };
  const rid = () => Math.random().toString(36).slice(2, 7);
  const respN = (n) => (n === 1 ? t('ap_responses1') : t('ap_responsesN', { n }));

  // ---------- builder ----------
  function newQ(type) { const q = { id: rid(), type, text: '', req: false }; if (['choice', 'multi', 'ranking'].includes(type)) q.opts = [{ id: rid(), t: '' }, { id: rid(), t: '' }]; if (type === 'rating') { q.max = 5; q.stars = true; } if (type === 'likert') { q.rows = [{ id: rid(), t: '' }]; q.cols = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((x) => ({ id: rid(), t: x })); } return q; }
  A.editForm = (form, chan) => {
    const F = form ? JSON.parse(JSON.stringify(form)) : { title: '', desc: '', qs: [newQ('choice')], anon: false, multi: false, showResults: false };
    const title = el('input', { value: F.title, maxlength: 200, placeholder: t('ap_formTitle'), 'aria-label': t('ap_formTitle'), class: 'ap-ftitle' }), desc = el('textarea', { rows: 2, maxlength: 2000, placeholder: t('ap_formDesc'), 'aria-label': t('ap_formDesc') }); desc.value = F.desc || '';
    const box = el('div', { class: 'ap-qlist' });
    const optList = (q, key, label, quiz) => el('div', { class: 'ap-opts' }, ...q[key].map((o, i) => el('div', { class: 'ap-optrow' },
      quiz ? el('input', { type: q.type === 'choice' ? 'radio' : 'checkbox', name: 'cor-' + q.id, checked: (q.correct || []).includes(o.id), 'aria-label': t('ap_correct') + ': ' + (o.t || label + ' ' + (i + 1)), title: t('ap_correct'), onchange: (e) => { q.correct = q.type === 'choice' ? (e.target.checked ? [o.id] : []) : e.target.checked ? [...(q.correct || []), o.id] : (q.correct || []).filter((x) => x !== o.id); } }) : null,
      (() => { const inp = el('input', { value: o.t, maxlength: 200, placeholder: t(label === 'st' ? 'ap_statementN' : 'ap_option', { n: i + 1 }), 'aria-label': t(label === 'st' ? 'ap_statementN' : 'ap_option', { n: i + 1 }) }); inp.addEventListener('input', () => { o.t = inp.value; }); return inp; })(),
      q[key].length > 1 ? LC.ibtn('dismiss', t('ap_remove'), () => { q[key].splice(i, 1); draw(); }) : null)),
      q[key].length < 30 ? el('button', { type: 'button', class: 'link', text: t('ap_addOption'), onclick: () => { q[key].push({ id: rid(), t: '' }); draw(); setTimeout(() => { const ins = box.querySelectorAll(`[data-q="${q.id}"] .ap-optrow input:not([type])`); if (ins.length) ins[ins.length - 1].focus(); }, 0); } }) : null);
    function qCard(q, i) {
      const text = el('input', { value: q.text, maxlength: 500, placeholder: t('ap_question') + ' ' + (i + 1), 'aria-label': t('ap_question') + ' ' + (i + 1), class: 'ap-qtext' }); text.addEventListener('input', () => { q.text = text.value; });
      const type = A.select(TYPES.map((x) => [x, t('ap_q_' + x)]), q.type, (v) => { const n = newQ(v); Object.assign(q, { type: v, opts: n.opts || q.opts, rows: n.rows, cols: n.cols, max: n.max, stars: n.stars }); if (!['choice', 'multi', 'ranking'].includes(v)) delete q.opts; delete q.correct; draw(); }, t('ap_question') + ' ' + (i + 1));
      const extra = [];
      if (q.opts) extra.push(optList(q, 'opts', 'opt', q.type !== 'ranking'));
      if (q.type === 'text') extra.push(el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!q.long, onchange: (e) => { q.long = e.target.checked; } }), t('ap_longAnswer')));
      if (q.type === 'rating') extra.push(el('div', { class: 'ap-row' }, A.field(t('ap_levels'), A.select([3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, String(n)]), q.max, (v) => { q.max = Number(v); }, t('ap_levels'))), A.field(t('ap_q_rating'), A.select([['1', t('ap_stars')], ['0', t('ap_numbers')]], q.stars === false ? '0' : '1', (v) => { q.stars = v === '1'; }, t('ap_q_rating')))));
      if (q.type === 'likert') extra.push(el('div', { class: 'ap-row ap-top' }, el('div', { class: 'grow' }, el('b', { class: 'small', text: t('ap_statements') }), optList(q, 'rows', 'st')), el('div', { class: 'grow' }, el('b', { class: 'small', text: t('ap_scale') }), optList(q, 'cols', 'opt'))));
      if (q.correct && q.correct.length || (q.opts && q.type !== 'ranking')) extra.push(el('label', { class: 'ap-inline small' }, t('ap_points'), el('input', { type: 'number', min: 0, max: 100, value: q.pts ?? 1, class: 'ap-num', onchange: (e) => { q.pts = Number(e.target.value) || 0; } })));
      return el('div', { class: 'ap-qcard', 'data-q': q.id }, el('div', { class: 'ap-qhead' }, el('span', { class: 'ap-qnum', text: String(i + 1) }), LC.icon(TICON[q.type]), type, el('span', { class: 'grow' }),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!q.req, onchange: (e) => { q.req = e.target.checked; } }), t('ap_required')),
        LC.ibtn('arrow_up', t('ap_up'), () => { F.qs.splice(i, 1); F.qs.splice(i - 1, 0, q); draw(); }, { disabled: i === 0 }), LC.ibtn('arrow_down', t('ap_down'), () => { F.qs.splice(i, 1); F.qs.splice(i + 1, 0, q); draw(); }, { disabled: i === F.qs.length - 1 }),
        LC.ibtn('delete', t('ap_delQ'), () => { F.qs.splice(i, 1); draw(); }, { disabled: F.qs.length <= 1 })), text, ...extra);
    }
    const draw = () => A.put(box, ...F.qs.map(qCard));
    const adders = el('div', { class: 'ap-qadd' }, el('span', { class: 'small muted', text: t('ap_addQ') }), ...TYPES.map((ty) => el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { if (F.qs.length >= 50) return; F.qs.push(newQ(ty)); draw(); setTimeout(() => { const all = box.querySelectorAll('.ap-qtext'); all[all.length - 1].focus(); }, 0); } }, LC.icon(TICON[ty]), el('span', { text: t('ap_q_' + ty) }))));
    const opt = (key, label) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!F[key], onchange: (e) => { F[key] = e.target.checked; } }), label);
    const save = async (share) => {
      F.title = title.value; F.desc = desc.value; const body = { id: form && form.id, title: F.title, desc: F.desc, qs: F.qs.map((q) => ({ ...q, opts: q.opts && q.opts.filter((o) => o.t.trim()), rows: q.rows && q.rows.filter((o) => o.t.trim()), cols: q.cols && q.cols.filter((o) => o.t.trim()) })), anon: F.anon, multi: F.multi, showResults: F.showResults };
      const r = await A.call('/api/ap/form/save', body); if (!r) return;
      if (share && chan) { const p = await A.call('/api/ap/form/post', { id: r.form.id, chan }); if (!p) return; }
      LC.closeModal(); LC.emitLocal('ap:forms', {});
    };
    draw();
    A.modal(form ? t('ap_editForm') : t('ap_newForm'), 'form', [title, desc, el('div', { class: 'ap-fopts' }, opt('anon', t('ap_anon')), opt('multi', t('ap_multiResp')), opt('showResults', t('ap_showRes'))), box, adders],
      [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), chan && !form ? el('button', { class: 'secondary', text: t('ap_save'), onclick: () => save(false) }) : null, el('button', { class: 'primary', text: chan && !form ? t('ap_saveShare') : t('ap_save'), onclick: () => save(!!chan && !form) })]);
    LC.focusSoon(title);
  };

  // ---------- fill in ----------
  function answerControl(q, cur, set) {
    const name = 'q-' + q.id + '-' + rid();
    if (q.type === 'choice') return el('div', { class: 'ap-achoices', role: 'radiogroup', 'aria-label': q.text }, ...q.opts.map((o) => el('label', { class: 'check' }, el('input', { type: 'radio', name, checked: cur === o.id, onchange: () => set(o.id) }), o.t)));
    if (q.type === 'multi') { let v = Array.isArray(cur) ? [...cur] : []; return el('div', { class: 'ap-achoices', role: 'group', 'aria-label': q.text }, ...q.opts.map((o) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: v.includes(o.id), onchange: (e) => { v = e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id); set(v); } }), o.t))); }
    if (q.type === 'text') { const i = el(q.long ? 'textarea' : 'input', { maxlength: 4000, rows: q.long ? 4 : null, 'aria-label': q.text }); i.value = cur || ''; i.addEventListener('input', () => set(i.value)); return i; }
    if (q.type === 'date') { const i = el('input', { type: 'date', value: cur || '', 'aria-label': q.text }); i.addEventListener('change', () => set(i.value)); return i; }
    if (q.type === 'rating') {
      const g = el('div', { class: 'ap-rating' + (q.stars === false ? ' nums' : ''), role: 'radiogroup', 'aria-label': q.text });
      const draw = (v) => A.put(g, ...Array.from({ length: q.max }, (_, i) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(v === i + 1), 'aria-label': `${i + 1} / ${q.max}`, class: v >= i + 1 ? 'on' : '', onclick: () => { set(i + 1); draw(i + 1); } }, q.stars === false ? String(i + 1) : LC.icon('star', { filled: v >= i + 1 }))));
      draw(cur || 0); return g;
    }
    if (q.type === 'likert') { const v = { ...(cur || {}) }; return el('div', { class: 'tablewrap' }, el('table', { class: 'table ap-likert' }, el('thead', {}, el('tr', {}, el('th', { text: '' }), ...q.cols.map((c) => el('th', { text: c.t })))), el('tbody', {}, ...q.rows.map((r) => { const nm = name + r.id; return el('tr', {}, el('th', { scope: 'row', text: r.t }), ...q.cols.map((c) => el('td', {}, el('input', { type: 'radio', name: nm, checked: v[r.id] === c.id, 'aria-label': `${r.t}: ${c.t}`, onchange: () => { v[r.id] = c.id; set({ ...v }); } })))); })))); }
    if (q.type === 'ranking') {
      let order = Array.isArray(cur) && cur.length === q.opts.length ? [...cur] : q.opts.map((o) => o.id); const box = el('ol', { class: 'ap-rank' });
      const draw = () => A.put(box, ...order.map((id, i) => el('li', {}, el('span', { class: 'grow', text: (q.opts.find((o) => o.id === id) || {}).t }), LC.ibtn('arrow_up', t('ap_up'), () => { order.splice(i, 1); order.splice(i - 1, 0, id); set([...order]); draw(); box.querySelectorAll('button')[Math.max(0, (i - 1) * 2)].focus(); }, { disabled: i === 0 }), LC.ibtn('arrow_down', t('ap_down'), () => { order.splice(i, 1); order.splice(i + 1, 0, id); set([...order]); draw(); }, { disabled: i === order.length - 1 }))));
      draw(); set([...order]); return el('div', {}, el('p', { class: 'muted small', text: t('ap_rankHelp') }), box);
    }
    return null;
  }
  A.fillForm = async (id) => {
    let f; try { f = (await LC.api('/api/ap/form?id=' + id)).form; } catch (e) { return A.fail(e); }
    if (f.closed) return A.modal(f.title, 'form', [el('p', { text: t('ap_formClosedHelp') })], [f.canResults ? el('button', { class: 'secondary', text: t('ap_results'), onclick: () => A.formResults(id) }) : null, el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })], { wide: false });
    const mine = !f.multi && f.mine.length ? f.mine[0] : null, ans = mine ? JSON.parse(JSON.stringify(mine.a)) : {};
    const qs = f.qs.map((q, i) => el('fieldset', { class: 'ap-fq' }, el('legend', {}, el('span', { class: 'ap-qnum', text: String(i + 1) }), q.text, q.req ? el('span', { class: 'ap-req', 'aria-label': t('ap_required'), title: t('ap_required'), text: ' *' }) : null), answerControl(q, ans[q.id], (v) => { ans[q.id] = v; })));
    const submit = async () => {
      for (const q of f.qs) { const v = ans[q.id]; if (q.req && (v === undefined || v === '' || (Array.isArray(v) && !v.length) || (q.type === 'likert' && !Object.keys(v || {}).length))) return LC.toast(t('ap_answerReq', { q: q.text })); }
      const r = await A.call('/api/ap/form/respond', { id, a: ans, rid: mine ? mine.id : undefined }); if (!r) return;
      const quiz = r.score && r.score.max ? el('p', { class: 'ap-score', text: t('ap_score', r.score) }) : null;
      A.modal(f.title, 'form', [el('div', { class: 'ap-thanks' }, LC.icon('checkmark_circle', { filled: true }), el('p', { text: t('ap_thanks') })), quiz, ...(quiz ? r.form.qs.filter((q) => q.correct).map((q) => el('p', { class: 'small' }, el('b', { text: q.text + ': ' }), q.correct.map((c) => (q.opts.find((o) => o.id === c) || {}).t).join(', '))) : [])],
        [r.form.canResults ? el('button', { class: 'secondary', text: t('ap_results'), onclick: () => A.formResults(id) }) : null, el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })], { wide: false });
    };
    A.modal(f.title, 'form', [f.desc ? el('p', { class: 'ap-fdesc', text: f.desc }) : null, f.anon ? el('p', { class: 'muted small' }, LC.icon('eye_off'), ' ' + t('ap_anon')) : null, ...qs], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_submit'), onclick: submit })]);
  };

  // ---------- results ----------
  const optText = (q, id) => ((q.opts || []).find((o) => o.id === id) || {}).t || '';
  const answerText = (q, v) => (v === undefined ? '' : q.type === 'choice' ? optText(q, v) : q.type === 'multi' ? v.map((x) => optText(q, x)).join('; ') : q.type === 'ranking' ? v.map((x) => optText(q, x)).join(' > ') : q.type === 'likert' ? q.rows.filter((r) => v[r.id]).map((r) => r.t + ': ' + ((q.cols.find((c) => c.id === v[r.id]) || {}).t || '')).join('; ') : String(v));
  function summaryOf(q, rs) {
    const vals = rs.map((r) => r.a[q.id]).filter((v) => v !== undefined), n = vals.length;
    const head = el('div', { class: 'ap-qsumhead' }, el('b', { text: q.text }), el('span', { class: 'muted small', text: respN(n) }));
    if (q.type === 'choice' || q.type === 'multi') return [head, A.bars(q.opts.map((o, i) => ({ label: o.t, value: vals.filter((v) => (Array.isArray(v) ? v.includes(o.id) : v === o.id)).length, color: (q.correct || []).includes(o.id) ? '#498205' : A.PALETTE[i % A.PALETTE.length] })), { label: q.text })];
    if (q.type === 'rating') { const avg = n ? (vals.reduce((a, b) => a + b, 0) / n).toFixed(1) : '–'; return [head, el('p', { class: 'ap-bignum', text: t('ap_avg', { n: avg }) }), A.bars(Array.from({ length: q.max }, (_, i) => ({ label: q.stars === false ? String(i + 1) : '★'.repeat(i + 1), value: vals.filter((v) => v === i + 1).length, color: '#e3b200' })), { label: q.text })]; }
    if (q.type === 'likert') return [head, A.bars(q.rows.map((r) => ({ label: r.t, parts: q.cols.map((c, i) => ({ value: vals.filter((v) => v[r.id] === c.id).length, color: ['#d13438', '#ca5010', '#8a8886', '#038387', '#498205', '#0078d4', '#5b5fc7', '#c239b3', '#986f0b', '#69797e'][Math.round(i * (q.cols.length > 5 ? 1 : 4 / Math.max(1, q.cols.length - 1)))], name: c.t })) })), { label: q.text }), el('ul', { class: 'ap-legend ap-legend-row' }, ...q.cols.map((c, i) => el('li', {}, el('i', { style: { background: ['#d13438', '#ca5010', '#8a8886', '#038387', '#498205', '#0078d4', '#5b5fc7', '#c239b3', '#986f0b', '#69797e'][Math.round(i * (q.cols.length > 5 ? 1 : 4 / Math.max(1, q.cols.length - 1)))] } }), el('span', { text: c.t }))))];
    if (q.type === 'ranking') return [head, A.bars(q.opts.map((o, i) => ({ label: o.t, value: vals.reduce((a, v) => a + (v.length - v.indexOf(o.id)), 0), color: A.PALETTE[i % A.PALETTE.length] })).sort((a, b) => b.value - a.value), { label: q.text })];
    if (q.type === 'date') { const c = {}; for (const v of vals) c[v] = (c[v] || 0) + 1; return [head, A.bars(Object.entries(c).sort().slice(0, 20).map(([d, k]) => ({ label: A.fmtDay(A.fromDay(d), { day: 'numeric', month: 'short', year: 'numeric' }), value: k, color: '#0078d4' })), { label: q.text })]; }
    return [head, el('ul', { class: 'ap-answers' }, ...rs.filter((r) => r.a[q.id] !== undefined).slice(-50).reverse().map((r) => el('li', {}, r.by ? el('b', { text: LC.uname(r.by) + ': ' }) : null, String(r.a[q.id]))))];
  }
  function csv(f) {
    const rows = [['#', 'Time', ...(f.anon ? [] : ['Name']), ...f.qs.map((q) => q.text), ...(f.quiz ? ['Score'] : [])]];
    f.responses.forEach((r, i) => rows.push([i + 1, new Date(r.ts).toISOString(), ...(f.anon ? [] : [r.by ? LC.uname(r.by) : '']), ...f.qs.map((q) => answerText(q, r.a[q.id])), ...(f.quiz ? [r.score ? r.score.got : ''] : [])]));
    A.saveCsv(rows, f.title + ' responses');
  }
  A.formResults = async (id) => {
    let f; try { f = (await LC.api('/api/ap/form?id=' + id)).form; } catch (e) { return A.fail(e); }
    if (!f.canResults) return A.fillForm(id);
    const rs = f.responses || [], avg = f.quiz && rs.length ? (rs.reduce((a, r) => a + ((r.score && r.score.got) || 0), 0) / rs.length).toFixed(1) : null;
    const body = [el('div', { class: 'ap-row' }, el('span', { class: 'ap-pill' + (f.closed ? ' closed' : '') , text: f.closed ? t('ap_formClosed') : f.quiz ? t('ap_quiz') : t('ap_survey') }), el('b', { text: respN(rs.length) }), avg !== null ? el('span', { text: t('ap_avgScore', { n: avg }) }) : null, f.anon ? el('span', { class: 'muted small' }, LC.icon('eye_off'), ' ' + t('ap_anonymous')) : null),
      rs.length ? el('div', { class: 'ap-qsums' }, ...f.qs.map((q) => el('section', { class: 'ap-qsum' }, ...summaryOf(q, rs)))) : el('p', { class: 'muted', text: t('ap_noResp') })];
    A.modal(t('ap_results') + ': ' + f.title, 'data_bar_vertical', body, [f.canEdit ? el('button', { class: 'secondary withicon', onclick: () => csv(f) }, LC.icon('arrow_download'), el('span', { text: t('ap_exportCsv') })) : null, f.canEdit ? formMenuBtn(f) : null, el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })]);
  };
  const formMenuBtn = (f) => el('button', { class: 'secondary withicon', 'aria-haspopup': 'menu', onclick: (e) => formMenu(e.currentTarget, f) }, LC.icon('more_horizontal'), el('span', { text: t('ap_more') }));
  async function formMenu(anchor, f) {
    LC.menu(anchor, [{ icon: 'edit', label: t('ap_editForm'), fn: async () => { const d = await LC.api('/api/ap/form?id=' + f.id).catch(A.fail); if (d) A.editForm(d.form); } },
      { icon: f.closed ? 'arrow_undo' : 'lock_closed', label: f.closed ? t('ap_reopenForm') : t('ap_closeForm'), fn: () => A.call('/api/ap/form/close', { id: f.id, closed: !f.closed }).then(() => LC.emitLocal('ap:forms', {})) },
      { icon: 'arrow_download', label: t('ap_exportCsv'), fn: async () => { const d = await LC.api('/api/ap/form?id=' + f.id).catch(A.fail); if (d) csv(d.form); } },
      { icon: 'share_ios', label: t('ap_shareIn'), fn: () => shareDialog(f) }, 'sep',
      { icon: 'broom', label: t('ap_clearResp'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmClearResp', { name: f.title }), { danger: true, ok: t('ap_delete') })) A.call('/api/ap/form/clear', { id: f.id }).then(() => LC.emitLocal('ap:forms', {})); } },
      { icon: 'delete', label: t('ap_delForm'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmDelForm', { name: f.title }), { danger: true, ok: t('ap_delete') })) { await A.call('/api/ap/form/delete', { id: f.id }); LC.closeModal(); LC.emitLocal('ap:forms', {}); } } }]);
  }
  function shareDialog(f) {
    const sel = A.select([['', t('ap_pickChat')], ...A.allChats().map((c) => [c.id, c.label])], '', null, t('ap_pickChat'));
    A.modal(t('ap_shareIn'), 'share_ios', [A.field(t('ap_pickChat'), sel)], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_shareIn'), onclick: async () => { if (!sel.value) return; if (await A.call('/api/ap/form/post', { id: f.id, chan: sel.value })) { LC.closeModal(); LC.toast(t('ap_addedTo', { where: A.chatTitle(sel.value) })); } } })], { wide: false });
  }

  // ---------- the card in the chat ----------
  A.card('form', (m) => {
    const c = m.apCard, owner = m.from === S.me.id || LC.isAdmin();
    if (c.deleted) return el('div', { class: 'ap-mcard ap-fcard gone' }, LC.icon('form'), el('span', { class: 'muted', text: t('ap_delForm') + ' ✓' }));
    return el('div', { class: 'ap-mcard ap-fcard', role: 'group', 'aria-label': t('ap_formCard') + ': ' + c.title },
      el('div', { class: 'ap-mchead' }, el('span', { class: 'ap-mcicon', 'aria-hidden': 'true' }, LC.icon('form')), el('div', { class: 'grow' }, el('div', { class: 'ap-mckind', text: c.quiz ? t('ap_quiz') : t('ap_formCard') }), el('b', { class: 'ap-mctitle', text: c.title })), c.closed ? el('span', { class: 'ap-pill closed', text: t('ap_formClosed') }) : null),
      c.desc ? el('p', { class: 'ap-mcdesc', text: c.desc }) : null,
      el('div', { class: 'muted small', text: [t('ap_questionsN', { n: c.qn }), respN(c.n)].join(' · ') }),
      el('div', { class: 'ap-mcacts' }, !c.closed ? el('button', { class: 'primary sm', text: t('ap_fillIn'), onclick: () => A.fillForm(c.id) }) : null, el('button', { class: 'secondary sm', text: t('ap_results'), onclick: () => A.formResults(c.id) }),
        owner ? LC.ibtn('more_horizontal', t('ap_formMenu'), (e) => formMenu(e.currentTarget, { id: c.id, title: c.title, closed: c.closed }), { menu: true }) : null));
  });
  LC.ext.composerMore.push((composer) => (composer.cfg && composer.cfg.chan() && A.writable(composer.cfg.chan()) && !A.guest() ? [{ icon: 'form', label: t('ap_newForm') + '…', fn: () => A.editForm(null, composer.cfg.chan()) }] : []));

  // ---------- lists of forms: the chat tab and the app ----------
  function formRow(f) {
    return el('div', { class: 'ap-frow' }, el('span', { class: 'ap-mcicon', 'aria-hidden': 'true' }, LC.icon('form')), el('div', { class: 'grow' }, el('b', { text: f.title }), el('div', { class: 'muted small', text: [f.quiz ? t('ap_quiz') : t('ap_survey'), t('ap_questionsN', { n: f.qn }), respN(f.n), A.fmtDay(f.updated)].join(' · ') })),
      f.closed ? el('span', { class: 'ap-pill closed', text: t('ap_formClosed') }) : f.answered ? el('span', { class: 'ap-pill ok', text: t('ap_answered') }) : null,
      !f.closed ? el('button', { class: 'secondary sm', text: f.answered ? t('ap_editResp') : t('ap_fillIn'), onclick: () => A.fillForm(f.id) }) : null, el('button', { class: 'secondary sm', text: t('ap_results'), onclick: () => A.formResults(f.id) }),
      f.mine || LC.isAdmin() ? LC.ibtn('more_horizontal', t('ap_formMenu'), (e) => formMenu(e.currentTarget, f), { menu: true }) : null);
  }
  A.tab({ key: 'ap_forms', icon: 'form', label: () => t('ap_forms'), desc: () => t('ap_formsDesc'), order: 60, optIn: true,
    async render(host, chan) {
      const box = el('div', { class: 'ap-flist' });
      const load = async () => { try { const d = await LC.api('/api/ap/forms?chan=' + encodeURIComponent(chan)); A.put(box, ...(d.forms.length ? d.forms.map(formRow) : [A.empty('form', t('ap_noForms'), t('ap_noFormsHelp'))])); } catch (e) { A.put(box, el('p', { class: 'err', text: e.message })); } };
      A.put(host, el('div', { class: 'ap-page' }, A.head('form', t('ap_forms'), A.writable(chan) && !A.guest() ? el('button', { class: 'primary sm withicon', onclick: () => A.editForm(null, chan) }, LC.icon('add'), el('span', { text: t('ap_newForm') })) : null), box));
      A.on('ap:forms', load, box); A.on('update', (m) => { if (m.chan === chan && m.apCard && m.apCard.kind === 'form') load(); }, box); load();
    } });
  A.app({ key: 'ap_forms', icon: 'form', color: '#038387', name: () => t('ap_forms'), desc: () => t('ap_formsDesc'), tab: 'ap_forms', order: 72,
    pane: {
      render(nav) { A.put(nav, el('button', { class: 'ap-navitem on', 'aria-current': 'page', onclick: () => LC.openApp('ap_forms') }, LC.icon('form'), el('span', { class: 'grow', text: t('ap_forms') })), A.guest() ? null : el('div', { class: 'pad' }, el('button', { class: 'primary sm withicon', onclick: () => A.editForm(null, null) }, LC.icon('add'), el('span', { text: t('ap_newForm') })))); },
      async main(host) {
        const mine = el('div', { class: 'ap-flist' }), shared = el('div', { class: 'ap-flist' });
        const load = async () => { try { const d = await LC.api('/api/ap/forms'); const a = d.forms.filter((f) => f.mine), b = d.forms.filter((f) => !f.mine); A.put(mine, ...(a.length ? a.map(formRow) : [el('p', { class: 'muted', text: t('ap_noFormsHelp') })])); A.put(shared, ...(b.length ? b.map(formRow) : [el('p', { class: 'muted', text: '—' })])); } catch (e) { A.put(mine, el('p', { class: 'err', text: e.message })); } };
        A.put(host, el('div', { class: 'ap-page' }, A.guest() ? null : el('div', { class: 'ap-row' }, el('button', { class: 'primary sm withicon', onclick: () => A.editForm(null, null) }, LC.icon('add'), el('span', { text: t('ap_newForm') }))), el('h2', { class: 'ap-sub', text: t('ap_myForms') }), mine, el('h2', { class: 'ap-sub', text: t('ap_sharedForms') }), shared));
        A.on('ap:forms', load, mine); load();
      },
    } });
  A.openers.forms = async (a) => { if (a.chan && a.msg) { await LC.jumpToMessage(a.chan, a.msg); } if (a.ref && a.ref.id) A.fillForm(a.ref.id); };
})();
