'use strict';
// Tasks board (like Planner) on the chat's Tasks tab: buckets, cards with labels, assignees, dates, priority, progress,
// notes, checklist, comments and attachments; Board / List / Charts views; filter and group by; drag cards between
// buckets. The "Tasks" app in the app bar lists everything assigned to me in every chat.
(() => {
  const LC = window.LC, { el, S, $ } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_tasks: 'Tasks', ap_tasksDesc: 'A task board for this chat: buckets, cards, assignees, due dates, checklists and charts.', ap_myTasks: 'My tasks', ap_myTasksDesc: 'Everything assigned to you in every chat, in one list.',
    ap_board: 'Board', ap_list: 'List', ap_charts: 'Charts', ap_addTask: 'Add a task', ap_addTaskTo: 'Add a task to {name}', ap_taskName: 'Task name', ap_bucket: 'Bucket', ap_buckets: 'Buckets', ap_newBucket: 'Add new bucket', ap_bucketName: 'Bucket name',
    ap_delBucket: 'Delete bucket', ap_confirmDelBucket: 'Delete the bucket “{name}”? Its tasks move to the first bucket.', ap_completedN: 'Completed tasks ({n})', ap_progress: 'Progress', ap_priority: 'Priority', ap_start: 'Start date', ap_due: 'Due date', ap_labels: 'Labels', ap_notes: 'Notes', ap_checklist: 'Checklist',
    ap_addItem: 'Add an item', ap_comments: 'Comments', ap_addComment: 'Type your comment here', ap_post: 'Post', ap_attachments: 'Attachments', ap_addLink: 'Add link', ap_attachFile: 'Attach file', ap_linkUrl: 'Web address', ap_linkName: 'Text to show',
    ap_p_notstarted: 'Not started', ap_p_inprogress: 'In progress', ap_p_completed: 'Completed', ap_pr_urgent: 'Urgent', ap_pr_important: 'Important', ap_pr_medium: 'Medium', ap_pr_low: 'Low', ap_late: 'Late', ap_noDate: 'No date', ap_thisWeek: 'This week', ap_nextWeek: 'Next week', ap_later: 'Later',
    ap_markDone: 'Mark complete', ap_markUndone: 'Mark incomplete', ap_moveTo: 'Move to {name}', ap_openTask: 'Open', ap_delTask: 'Delete task', ap_confirmDelTask: 'Delete the task “{name}”?', ap_editLabels: 'Edit labels', ap_labelN: 'Label {n}', ap_noTasks: 'No tasks yet', ap_noTasksHelp: 'Add a task above, or drag cards between buckets to show progress.',
    ap_nothingMatches: 'No tasks match the filters.', ap_assignedTo: 'Assigned to', ap_status: 'Status', ap_members: 'Members', ap_createdBy: 'Created by {name} · {when}', ap_moreOpts: 'More options for {name}', ap_showOnCard: 'Show on card', ap_plan: 'Plan', ap_plans: 'Plans',
    ap_active: 'Active', ap_all: 'All', ap_noMyTasks: 'Nothing assigned to you', ap_noMyTasksHelp: 'When someone assigns you a task in any chat, it shows up here.', ap_dueWhen: 'Due {when}', ap_keyword: 'Filter by keyword', ap_filterN: 'Filter ({n})', ap_checkN: '{a} of {b}', ap_moveCard: 'Move task',
    ap_taskBoard: 'Task board', ap_dropHere: 'Drop here',
  });
  LC.addStrings('hi', { ap_tasks: 'काम', ap_myTasks: 'मेरे काम', ap_board: 'बोर्ड', ap_list: 'सूची', ap_charts: 'चार्ट', ap_addTask: 'काम जोड़ें', ap_bucket: 'बकेट', ap_progress: 'प्रगति', ap_priority: 'प्राथमिकता', ap_due: 'नियत तारीख', ap_checklist: 'चेकलिस्ट', ap_comments: 'टिप्पणियाँ', ap_p_notstarted: 'शुरू नहीं', ap_p_inprogress: 'जारी', ap_p_completed: 'पूरा', ap_late: 'देर से', ap_markDone: 'पूरा करें' });
  LC.addStrings('es', { ap_tasks: 'Tareas', ap_myTasks: 'Mis tareas', ap_board: 'Panel', ap_list: 'Lista', ap_charts: 'Gráficos', ap_addTask: 'Agregar tarea', ap_bucket: 'Depósito', ap_progress: 'Progreso', ap_priority: 'Prioridad', ap_due: 'Fecha de vencimiento', ap_checklist: 'Lista de comprobación', ap_comments: 'Comentarios', ap_p_notstarted: 'No iniciada', ap_p_inprogress: 'En curso', ap_p_completed: 'Completada', ap_late: 'Atrasada', ap_markDone: 'Marcar como completada' });

  const PRIO = ['urgent', 'important', 'medium', 'low'], PROG = ['notstarted', 'inprogress', 'completed'];
  const PRIO_ICON = { urgent: 'alert_urgent', important: 'important', medium: '', low: 'arrow_down' }, PROG_ICON = { notstarted: 'circle', inprogress: 'circle_half_fill', completed: 'checkmark_circle' };
  const STATUS_COLORS = { notstarted: '#8a8886', inprogress: '#0078d4', late: '#d13438', completed: '#498205' };
  const LABEL_NAMES = ['Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Lavender', 'Gray'];
  const P = { chan: null, plan: null, tasks: [], loaded: false, view: LC.ls.get('ap_tview', 'board'), group: 'bucket', filter: {}, sort: ['order', 1], hideDone: LC.ls.get('ap_thide', {}), host: null };
  const norm = (x, plan) => {
    if (!Array.isArray(x.assignees)) x.assignees = x.assignee ? [x.assignee] : [];
    if (!plan.buckets.some((b) => b.id === x.bucket)) x.bucket = plan.buckets[0].id;
    if (typeof x.order !== 'number') x.order = -(x.ts || 0) / 1e6;
    x.progress = x.done ? 'completed' : x.progress === 'inprogress' ? 'inprogress' : 'notstarted';
    if (!PRIO.includes(x.priority)) x.priority = 'medium';
    for (const k of ['labels', 'checklist', 'comments', 'links', 'files']) if (!Array.isArray(x[k])) x[k] = [];
    return x;
  };
  const late = (x) => !x.done && x.due && x.due < A.dayStart(Date.now());
  const labelName = (l, i) => l.name || t('ap_labelN', { n: (P.plan ? P.plan.labels.indexOf(l) : i) + 1 }) + ' · ' + LABEL_NAMES[(Number(l.id.slice(1)) - 1) % 10];
  const call = (op, body) => A.call('/api/ap/task', { chan: P.chan, op, ...body });
  const planCall = (op, body) => A.call('/api/ap/plan', { chan: P.chan, op, ...body });

  async function load(chan) {
    const d = await LC.api('/api/ap/tasks?chan=' + encodeURIComponent(chan));
    P.chan = chan; P.plan = d.plan; P.tasks = d.tasks.map((x) => norm(x, d.plan)); P.loaded = true; return d;
  }
  const upsert = (x) => { if (!P.plan) return; norm(x, P.plan); const i = P.tasks.findIndex((y) => y.id === x.id); if (i >= 0) P.tasks[i] = x; else P.tasks.push(x); };
  let drawQ = false; const redraw = () => { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; if (P.host && P.host.isConnected && S.tab === 'todos' && S.chan === P.chan) draw(); }); };
  LC.on('ap_task', (e) => { if (e.chan !== P.chan) return; if (e.del) P.tasks = P.tasks.filter((x) => x.id !== e.del); for (const x of e.tasks || (e.task ? [e.task] : [])) upsert(x); redraw(); refreshDetails(); });
  LC.on('ap_plan', (e) => { if (e.chan !== P.chan) return; P.plan = e.plan; P.tasks.forEach((x) => norm(x, P.plan)); redraw(); refreshDetails(); });
  LC.on('todos', (e) => { if (e.chan !== P.chan || !P.plan) return; P.tasks = e.todos.map((x) => norm(x, P.plan)); redraw(); });
  LC.on('init', () => { P.chan = null; P.loaded = false; });

  // ---------- filters / grouping ----------
  const DUE = [['late', 'ap_late'], ['today', 'ap_today'], ['tomorrow', 'ap_tomorrow'], ['week', 'ap_thisWeek'], ['next', 'ap_nextWeek'], ['later', 'ap_later'], ['none', 'ap_noDate']];
  const dueKey = (x) => { if (!x.due) return 'none'; const d = A.dayStart(x.due), today = A.dayStart(Date.now()), ws = A.weekStart(Date.now()); if (!x.done && d < today) return 'late'; if (d === today) return 'today'; if (d === A.addDays(today, 1)) return 'tomorrow'; if (d < A.addDays(ws, 7)) return 'week'; if (d < A.addDays(ws, 14)) return 'next'; return 'later'; };
  const nFilters = () => Object.values(P.filter).filter((v) => (Array.isArray(v) ? v.length : !!v)).length;
  const passes = (x) => {
    const f = P.filter;
    if (f.q && !(x.text + ' ' + x.notes).toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.due && f.due.length && !f.due.includes(dueKey(x))) return false;
    if (f.prio && f.prio.length && !f.prio.includes(x.priority)) return false;
    if (f.prog && f.prog.length && !f.prog.includes(x.progress)) return false;
    if (f.labels && f.labels.length && !x.labels.some((l) => f.labels.includes(l))) return false;
    if (f.who && f.who.length && !(x.assignees.some((u) => f.who.includes(u)) || (f.who.includes('') && !x.assignees.length))) return false;
    return true;
  };
  const people = () => A.members(P.chan);
  function groups() { // [{ key, label, color?, drop: (task) => set | null, items }]
    const list = P.tasks.filter(passes), g = P.group, mk = (key, label, match, set, extra) => ({ key, label, items: list.filter(match), set, ...extra });
    if (g === 'bucket') return P.plan.buckets.map((b) => mk(b.id, b.name, (x) => x.bucket === b.id, null, { bucket: b }));
    if (g === 'progress') return PROG.map((p) => mk(p, t('ap_p_' + p), (x) => x.progress === p, { progress: p }, { icon: PROG_ICON[p] }));
    if (g === 'priority') return PRIO.map((p) => mk(p, t('ap_pr_' + p), (x) => x.priority === p, { priority: p }, { icon: PRIO_ICON[p] }));
    if (g === 'due') return DUE.map(([k, l]) => mk(k, t(l), (x) => dueKey(x) === k, null));
    if (g === 'labels') return [...P.plan.labels.map((l, i) => mk(l.id, labelName(l, i), (x) => x.labels.includes(l.id), null, { color: l.color })), mk('', t('ap_none'), (x) => !x.labels.length, null)];
    if (g === 'who') return [mk('', t('ap_unassigned'), (x) => !x.assignees.length, { assignees: [] }), ...people().map((u) => mk(u.id, LC.uname(u.id), (x) => x.assignees.includes(u.id), { assignees: [u.id] }, { user: u }))];
    return [];
  }

  // ---------- small pieces ----------
  const prioIcon = (x) => (PRIO_ICON[x.priority] ? el('span', { class: 'ap-prio p-' + x.priority, title: t('ap_pr_' + x.priority) }, LC.icon(PRIO_ICON[x.priority], { filled: x.priority !== 'low', label: t('ap_priority') + ': ' + t('ap_pr_' + x.priority) })) : null);
  const dueChip = (x) => (x.due ? el('span', { class: 'ap-chip' + (late(x) ? ' late' : x.done ? ' done' : ''), title: t('ap_due') + ': ' + LC.fmtDateTime(x.due) }, LC.icon('calendar_ltr'), A.fmtDue(x.due)) : null);
  const labelChips = (x) => (x.labels.length && P.plan ? el('div', { class: 'ap-clabels' }, ...x.labels.map((id) => { const l = P.plan.labels.find((y) => y.id === id); return l ? el('span', { class: 'ap-label', style: '--lc:' + l.color, text: l.name || ' ', title: labelName(l), 'aria-label': labelName(l) }) : null; })) : null);
  const completeBox = (x, can) => el('input', { type: 'checkbox', class: 'ap-round', checked: !!x.done, disabled: !can, 'aria-label': (x.done ? t('ap_markUndone') : t('ap_markDone')) + ': ' + x.text, title: x.done ? t('ap_markUndone') : t('ap_markDone'), onclick: (e) => e.stopPropagation(), onchange: () => setDone(x, !x.done) });
  const setDone = (x, done) => { x.done = done; x.progress = done ? 'completed' : 'notstarted'; redraw(); return call('update', { id: x.id, set: { progress: x.progress } }); };
  function cardMenu(anchor, x) {
    const can = A.writable(P.chan);
    LC.menu(anchor, [{ icon: 'open', label: t('ap_openTask'), fn: () => details(x.id) },
      { icon: x.done ? 'arrow_undo' : 'checkmark_circle', label: x.done ? t('ap_markUndone') : t('ap_markDone'), fn: () => setDone(x, !x.done), disabled: !can }, 'sep',
      ...P.plan.buckets.filter((b) => b.id !== x.bucket).map((b) => ({ icon: 'arrow_right', label: t('ap_moveTo', { name: b.name }), fn: () => call('move', { id: x.id, bucket: b.id }), disabled: !can })), 'sep',
      ...PRIO.map((p) => ({ label: t('ap_pr_' + p), checked: x.priority === p, fn: () => call('update', { id: x.id, set: { priority: p } }), disabled: !can })), 'sep',
      { icon: 'delete', label: t('ap_delTask'), danger: true, disabled: !can || !(x.by === S.me.id || LC.isAdmin()), fn: async () => { if (await LC.confirm(t('ap_confirmDelTask', { name: x.text }), { danger: true, ok: t('ap_delete') })) call('del', { id: x.id }); } }]);
  }
  function card(x, can) {
    const ck = x.checklist.filter((c) => c.done).length;
    const n = el('div', { class: 'ap-card todo' + (x.done ? ' done' : '') + (late(x) ? ' late' : ''), role: 'listitem', 'data-id': x.id, draggable: can ? 'true' : null },
      labelChips(x),
      el('div', { class: 'ap-ctitle' }, completeBox(x, can), el('button', { type: 'button', class: 'ap-copen', onclick: () => details(x.id) }, el('span', { class: 'grow', text: x.text })),
        LC.ibtn('more_horizontal', t('ap_moreOpts', { name: x.text }), (e) => cardMenu(e.currentTarget, x), { cls: 'icon ap-ckebab', menu: true })),
      x.progress === 'inprogress' || PRIO_ICON[x.priority] || x.due || x.checklist.length || x.comments.length || x.links.length || x.files.length || x.assignees.length ? el('div', { class: 'ap-cmeta' }, x.progress === 'inprogress' ? el('span', { class: 'ap-prog', title: t('ap_p_inprogress') }, LC.icon('circle_half_fill', { label: t('ap_p_inprogress') })) : null, prioIcon(x), dueChip(x),
        x.checklist.length ? el('span', { class: 'ap-chip', title: t('ap_checklist') }, LC.icon('task_list_square_ltr'), `${ck}/${x.checklist.length}`) : null,
        x.comments.length ? el('span', { class: 'ap-chip', title: t('ap_comments') }, LC.icon('comment'), String(x.comments.length)) : null,
        x.links.length + x.files.length ? el('span', { class: 'ap-chip', title: t('ap_attachments') }, LC.icon('attach'), String(x.links.length + x.files.length)) : null,
        el('span', { class: 'grow' }), x.assignees.length ? A.avatars(x.assignees, 3) : null) : null);
    if (can) { n.addEventListener('dragstart', (e) => { drag = x.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); n.classList.add('dragging'); }); n.addEventListener('dragend', () => { drag = null; n.classList.remove('dragging'); document.querySelectorAll('.ap-drop').forEach((z) => z.classList.remove('ap-drop')); }); }
    return n;
  }
  let drag = null;
  function dropZone(zone, g) { // drag a card into a column (and in front of another card)
    zone.addEventListener('dragover', (e) => { if (!drag || (P.group !== 'bucket' && !g.set)) return; e.preventDefault(); zone.classList.add('ap-drop'); });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('ap-drop'); });
    zone.addEventListener('drop', (e) => {
      if (!drag) return; e.preventDefault(); zone.classList.remove('ap-drop'); const id = drag; drag = null; const x = P.tasks.find((y) => y.id === id); if (!x) return;
      if (P.group === 'bucket') {
        const cards = [...zone.querySelectorAll('.ap-card:not(.dragging)')].filter((c) => !c.classList.contains('done')), before = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        x.bucket = g.key; const col = P.tasks.filter((y) => y.bucket === g.key && y !== x).sort((a, b) => a.order - b.order), i = before ? col.findIndex((y) => y.id === before.dataset.id) : col.length; col.splice(i < 0 ? col.length : i, 0, x); col.forEach((y, k) => { y.order = k; }); redraw();
        call('move', { id, bucket: g.key, before: before ? before.dataset.id : undefined });
      } else if (g.set) { Object.assign(x, g.set); if (g.set.progress) x.done = g.set.progress === 'completed'; redraw(); call('update', { id, set: g.set }); }
    });
  }

  // ---------- views ----------
  function quickAdd(bucketId) {
    const can = A.writable(P.chan), inp = el('input', { placeholder: t('ap_addTask'), maxlength: 255, 'aria-label': t('ap_taskName'), disabled: !can }), due = A.dateInput(0, t('ap_due')), who = A.peoplePick({ people: people(), label: t('ap_assign'), disabled: !can });
    const bucket = A.select(P.plan.buckets.map((b) => [b.id, b.name]), bucketId || P.plan.buckets[0].id, null, t('ap_bucket')); bucket.disabled = !can;
    const form = el('form', { class: 'addform ap-quickadd', onsubmit: async (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return inp.focus(); inp.value = ''; const r = await call('add', { title: v, bucket: bucket.value, due: due.value ? A.fromDay(due.value) + 17 * 3600000 : 0, assignees: who.get() }); if (r) { upsert(r.task); due.value = ''; who.set([]); draw(); const n = P.host && P.host.querySelector('.ap-quickadd input'); if (n) n.focus(); } } },
      inp, bucket, due, who, el('button', { type: 'submit', class: 'primary', disabled: !can }, LC.icon('add'), el('span', { text: t('ap_add') })));
    return form;
  }
  function boardView(can) {
    const box = el('div', { class: 'ap-boardcols', role: 'region', 'aria-label': t('ap_taskBoard') });
    for (const g of groups()) {
      const open = g.items.filter((x) => !x.done).sort((a, b) => a.order - b.order || a.ts - b.ts), done = g.items.filter((x) => x.done).sort((a, b) => (b.doneTs || b.ts) - (a.doneTs || a.ts)), hide = !!P.hideDone[P.chan + ':' + g.key];
      const list = el('div', { class: 'ap-cards', role: 'list', 'aria-label': g.label }, ...open.map((x) => card(x, can)));
      const head = el('div', { class: 'ap-colhead' }, g.color ? el('i', { class: 'ap-ldot', style: { background: g.color } }) : null, g.user ? LC.avatar(g.user, 'xs') : g.icon ? LC.icon(g.icon) : null, el('h3', { text: g.label }), el('span', { class: 'ap-count', text: String(open.length) }),
        g.bucket && can ? LC.ibtn('more_horizontal', t('ap_more') + ': ' + g.label, (e) => bucketMenu(e.currentTarget, g.bucket), { menu: true }) : null);
      const col = el('section', { class: 'ap-col', 'data-group': g.key, 'aria-label': g.label }, head,
        g.bucket && can ? el('button', { type: 'button', class: 'ap-addcard', onclick: () => addInline(col, g.bucket) }, LC.icon('add'), el('span', { text: t('ap_addTask') })) : null, list,
        done.length ? el('button', { type: 'button', class: 'ap-showdone', 'aria-expanded': String(!hide), onclick: () => { P.hideDone[P.chan + ':' + g.key] = !hide; LC.ls.set('ap_thide', P.hideDone); draw(); } }, LC.icon(hide ? 'chevron_right' : 'chevron_down'), el('span', { text: t('ap_completedN', { n: done.length }) })) : null,
        done.length && !hide ? el('div', { class: 'ap-cards', role: 'list', 'aria-label': t('ap_completedN', { n: done.length }) }, ...done.map((x) => card(x, can))) : null);
      dropZone(col, g); box.append(col);
    }
    if (P.group === 'bucket' && can) box.append(el('div', { class: 'ap-col ap-newcol' }, el('button', { type: 'button', class: 'ap-addcard', onclick: async () => { const n = await LC.prompt(t('ap_newBucket'), { max: 60, placeholder: t('ap_bucketName') }); if (n && n.trim()) { const r = await planCall('addbucket', { name: n }); if (r) { P.plan = r.plan; draw(); } } } }, LC.icon('add'), el('span', { text: t('ap_newBucket') }))));
    return box;
  }
  function addInline(col, bucket) {
    const inp = el('input', { placeholder: t('ap_taskName'), maxlength: 255, 'aria-label': t('ap_addTaskTo', { name: bucket.name }) }), due = A.dateInput(0, t('ap_due')), who = A.peoplePick({ people: people(), label: t('ap_assign') });
    const f = el('form', { class: 'ap-inlineadd', onsubmit: async (e) => { e.preventDefault(); if (!inp.value.trim()) return; const r = await call('add', { title: inp.value, bucket: bucket.id, due: due.value ? A.fromDay(due.value) + 17 * 3600000 : 0, assignees: who.get() }); if (r) { upsert(r.task); draw(); } } },
      inp, el('div', { class: 'ap-row' }, due, who), el('div', { class: 'ap-row' }, el('button', { type: 'submit', class: 'primary sm', text: t('ap_addTask') }), el('button', { type: 'button', class: 'secondary sm', text: t('ap_cancel'), onclick: () => f.remove() })));
    f.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); f.remove(); } });
    col.querySelector('.ap-addcard').after(f); inp.focus();
  }
  function bucketMenu(anchor, b) {
    const i = P.plan.buckets.indexOf(b);
    LC.menu(anchor, [{ icon: 'edit', label: t('ap_rename'), fn: async () => { const n = await LC.prompt(t('ap_rename'), { value: b.name, max: 60 }); if (n && n.trim()) { const r = await planCall('rename', { id: b.id, name: n }); if (r) { P.plan = r.plan; draw(); } } } },
      { icon: 'arrow_left', label: t('ap_moveLeft'), disabled: i <= 0, fn: async () => { const r = await planCall('movebucket', { id: b.id, to: i - 1 }); if (r) { P.plan = r.plan; draw(); } } },
      { icon: 'arrow_right', label: t('ap_moveRight'), disabled: i >= P.plan.buckets.length - 1, fn: async () => { const r = await planCall('movebucket', { id: b.id, to: i + 1 }); if (r) { P.plan = r.plan; draw(); } } }, 'sep',
      { icon: 'delete', label: t('ap_delBucket'), danger: true, disabled: P.plan.buckets.length <= 1, fn: async () => { if (await LC.confirm(t('ap_confirmDelBucket', { name: b.name }), { danger: true, ok: t('ap_delete') })) { const r = await planCall('delbucket', { id: b.id }); if (r) { P.plan = r.plan; P.tasks.forEach((x) => norm(x, P.plan)); draw(); } } } }]);
  }
  const COLS = [['text', 'ap_title'], ['bucket', 'ap_bucket'], ['progress', 'ap_progress'], ['priority', 'ap_priority'], ['due', 'ap_due'], ['who', 'ap_assignedTo'], ['labels', 'ap_labels']];
  const sortVal = (x, k) => (k === 'bucket' ? P.plan.buckets.findIndex((b) => b.id === x.bucket) : k === 'progress' ? PROG.indexOf(x.progress) : k === 'priority' ? PRIO.indexOf(x.priority) : k === 'due' ? x.due || 9e15 : k === 'who' ? (x.assignees[0] ? LC.uname(x.assignees[0]) : '~') : k === 'labels' ? x.labels.join() : k === 'text' ? x.text.toLowerCase() : x.order);
  function listView(can) {
    const [sk, sd] = P.sort, sorter = (a, b) => { const va = sortVal(a, sk), vb = sortVal(b, sk); return (va < vb ? -1 : va > vb ? 1 : 0) * sd; };
    const head = el('tr', {}, el('th', { class: 'ap-cbcol' }, el('span', { class: 'sr-only', text: t('ap_markDone') })), ...COLS.map(([k, l]) => el('th', { 'aria-sort': sk === k ? (sd > 0 ? 'ascending' : 'descending') : null }, el('button', { type: 'button', class: 'ap-sortbtn', onclick: () => { P.sort = [k, sk === k ? -sd : 1]; draw(); } }, t(l), sk === k ? LC.icon(sd > 0 ? 'arrow_up' : 'arrow_down') : null))));
    const body = el('tbody');
    for (const g of groups()) {
      if (!g.items.length && P.group !== 'bucket') continue;
      if (P.group) body.append(el('tr', { class: 'ap-grow' }, el('th', { colspan: COLS.length + 1, scope: 'colgroup' }, g.label, el('span', { class: 'ap-count', text: String(g.items.length) }))));
      for (const x of [...g.items].sort(sorter)) body.append(el('tr', { class: 'todo' + (x.done ? ' done' : '') + (late(x) ? ' late' : ''), 'data-id': x.id }, el('td', {}, completeBox(x, can)), el('td', {}, el('button', { type: 'button', class: 'link ap-tlink', text: x.text, onclick: () => details(x.id) })),
        el('td', { text: (P.plan.buckets.find((b) => b.id === x.bucket) || {}).name || '' }), el('td', {}, LC.icon(PROG_ICON[x.progress], { cls: 'ap-pi ' + x.progress }), ' ' + t('ap_p_' + x.progress)), el('td', {}, prioIcon(x), ' ' + t('ap_pr_' + x.priority)),
        el('td', {}, dueChip(x)), el('td', {}, x.assignees.length ? A.avatars(x.assignees, 4) : el('span', { class: 'muted', text: '—' })), el('td', {}, labelChips(x))));
    }
    return el('div', { class: 'tablewrap ap-tablewrap' }, el('table', { class: 'table ap-tlist' }, el('thead', {}, head), body));
  }
  function chartsView() {
    const list = P.tasks.filter(passes), status = (x) => (x.done ? 'completed' : late(x) ? 'late' : x.progress), parts = (items) => ['notstarted', 'inprogress', 'late', 'completed'].map((s) => ({ value: items.filter((x) => status(x) === s).length, color: STATUS_COLORS[s], name: s === 'late' ? t('ap_late') : t('ap_p_' + s) }));
    const box = (title, node) => el('div', { class: 'ap-chartbox' }, el('h3', { text: title }), node);
    return el('div', { class: 'ap-charts' },
      box(t('ap_status'), A.donut(['notstarted', 'inprogress', 'late', 'completed'].map((s) => ({ label: s === 'late' ? t('ap_late') : t('ap_p_' + s), value: list.filter((x) => status(x) === s).length, color: STATUS_COLORS[s] })), { center: t('ap_tasks'), label: t('ap_status') })),
      box(t('ap_buckets'), A.bars(P.plan.buckets.map((b) => ({ label: b.name, parts: parts(list.filter((x) => x.bucket === b.id)) })), { label: t('ap_buckets') })),
      box(t('ap_priority'), A.bars(PRIO.map((p) => ({ label: t('ap_pr_' + p), parts: parts(list.filter((x) => x.priority === p)) })), { label: t('ap_priority') })),
      box(t('ap_members'), A.bars([...people().filter((u) => list.some((x) => x.assignees.includes(u.id))).map((u) => ({ label: LC.uname(u.id), parts: parts(list.filter((x) => x.assignees.includes(u.id))) })), { label: t('ap_unassigned'), parts: parts(list.filter((x) => !x.assignees.length)) }], { label: t('ap_members') })),
      el('ul', { class: 'ap-legend ap-legend-row' }, ...['notstarted', 'inprogress', 'late', 'completed'].map((s) => el('li', {}, el('i', { style: { background: STATUS_COLORS[s] } }), el('span', { text: s === 'late' ? t('ap_late') : t('ap_p_' + s) })))));
  }
  function filterPop(anchor) {
    const f = P.filter, check = (key, opts) => el('fieldset', { class: 'ap-fset' }, el('legend', { text: opts.title }), ...opts.items.map(([v, label, color]) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: (f[key] || []).includes(v), onchange: (e) => { f[key] = e.target.checked ? [...(f[key] || []), v] : (f[key] || []).filter((y) => y !== v); draw(); } }), color ? el('i', { class: 'ap-ldot', style: { background: color } }) : null, el('span', { text: label }))));
    const q = el('input', { type: 'search', value: f.q || '', placeholder: t('ap_keyword'), 'aria-label': t('ap_keyword'), oninput: LC.debounce((e) => { f.q = e.target.value; draw(); }, 250) });
    A.pop(anchor, el('div', { class: 'ap-filters' }, q, el('div', { class: 'ap-fcols' },
      check('due', { title: t('ap_due'), items: DUE.map(([k, l]) => [k, t(l)]) }), check('prio', { title: t('ap_priority'), items: PRIO.map((p) => [p, t('ap_pr_' + p)]) }), check('prog', { title: t('ap_progress'), items: PROG.map((p) => [p, t('ap_p_' + p)]) }),
      check('labels', { title: t('ap_labels'), items: P.plan.labels.map((l, i) => [l.id, labelName(l, i), l.color]) }), check('who', { title: t('ap_assignedTo'), items: [['', t('ap_unassigned')], ...people().map((u) => [u.id, LC.uname(u.id)])] })),
    el('button', { class: 'secondary sm', text: t('ap_clearFilter'), onclick: () => { P.filter = {}; A.closePop(); draw(); } })), { label: t('ap_filter') });
  }
  function labelsDialog() {
    const rows = P.plan.labels.map((l, i) => { const inp = el('input', { value: l.name, maxlength: 40, placeholder: LABEL_NAMES[i], 'aria-label': t('ap_labelN', { n: i + 1 }) }); inp.addEventListener('change', () => planCall('label', { id: l.id, name: inp.value }).then((r) => { if (r) { P.plan = r.plan; draw(); } })); return el('div', { class: 'ap-lrow' }, el('span', { class: 'ap-label', style: '--lc:' + l.color }, LABEL_NAMES[i]), inp); });
    A.modal(t('ap_editLabels'), 'tag', rows, [el('button', { class: 'primary', text: t('ap_done'), onclick: LC.closeModal })], { wide: false });
  }
  function draw() {
    const host = P.host; if (!host || !P.plan) return; const can = A.writable(P.chan), sc = host.querySelector('.ap-tbody'), keep = sc ? [sc.scrollLeft, sc.scrollTop] : null, f = document.activeElement, fk = f && host.contains(f) ? (f.closest('[data-id]') || {}).dataset : null;
    const nf = nFilters();
    const bar = el('div', { class: 'ap-tbar' },
      A.seg([['board', t('ap_board'), 'board'], ['list', t('ap_list'), 'text_bullet_list_ltr'], ['charts', t('ap_charts'), 'data_pie']], P.view, (v) => { P.view = v; LC.ls.set('ap_tview', v); draw(); }, t('ap_tasks')),
      el('span', { class: 'grow' }),
      el('label', { class: 'ap-inline' }, el('span', { class: 'small muted', text: t('ap_groupBy') }), A.select([['bucket', t('ap_bucket')], ['who', t('ap_assignedTo')], ['progress', t('ap_progress')], ['due', t('ap_due')], ['priority', t('ap_priority')], ['labels', t('ap_labels')]], P.group, (v) => { P.group = v; draw(); }, t('ap_groupBy'))),
      el('button', { type: 'button', class: 'secondary sm withicon' + (nf ? ' on' : ''), 'aria-haspopup': 'dialog', onclick: (e) => filterPop(e.currentTarget) }, LC.icon('filter'), el('span', { text: nf ? t('ap_filterN', { n: nf }) : t('ap_filter') })),
      LC.ibtn('more_horizontal', t('ap_more'), (e) => LC.menu(e.currentTarget, [{ icon: 'tag', label: t('ap_editLabels'), fn: labelsDialog, disabled: !can }, { icon: 'arrow_download', label: t('ap_exportCsv'), fn: exportCsv }]), { menu: true }));
    const body = el('div', { class: 'ap-tbody' + (P.view === 'board' ? ' board' : '') }, P.view === 'list' ? listView(can) : P.view === 'charts' ? chartsView() : boardView(can));
    const none = !P.tasks.length ? A.empty('task_list_ltr', t('ap_noTasks'), t('ap_noTasksHelp')) : !P.tasks.some(passes) ? el('p', { class: 'muted pad', text: t('ap_nothingMatches') }) : null;
    A.put(host, el('div', { class: 'ap-tasks' }, A.head('task_list_ltr', t('ap_tasks'), el('span', { class: 'muted small', text: t('tasksLeft', { n: P.tasks.filter((x) => !x.done).length }) })), can ? quickAdd() : el('p', { class: 'notice', text: t('ap_readonly') }), bar, none && P.view !== 'board' ? none : null, body, none && P.view === 'board' && !P.tasks.length ? none : null));
    const nb = host.querySelector('.ap-tbody'); if (keep && nb) { nb.scrollLeft = keep[0]; nb.scrollTop = keep[1]; }
    if (fk && fk.id) { const again = host.querySelector(`[data-id="${fk.id}"] .ap-copen, [data-id="${fk.id}"] .ap-tlink`); if (again) again.focus(); }
  }
  function exportCsv() {
    const rows = [[t('ap_title'), t('ap_bucket'), t('ap_progress'), t('ap_priority'), t('ap_start'), t('ap_due'), t('ap_assignedTo'), t('ap_labels'), t('ap_notes'), t('ap_checklist')]];
    for (const x of P.tasks) rows.push([x.text, (P.plan.buckets.find((b) => b.id === x.bucket) || {}).name || '', t('ap_p_' + x.progress), t('ap_pr_' + x.priority), x.start ? A.dayKey(x.start) : '', x.due ? A.dayKey(x.due) : '', x.assignees.map(LC.uname).join('; '), x.labels.map((id) => { const l = P.plan.labels.find((y) => y.id === id); return l ? labelName(l) : ''; }).join('; '), x.notes, x.checklist.map((c) => (c.done ? '[x] ' : '[ ] ') + c.text).join('; ')]);
    A.saveCsv(rows, A.chatTitle(P.chan) + ' tasks');
  }

  // ---------- task details (also opened from My tasks and from activity) ----------
  let D = null; // { id, chan, node }
  function refreshDetails() { if (!D || !D.node.isConnected) { D = null; return; } const a = document.activeElement; if (a && D.node.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') { D.stale = true; return; } renderDetails(); }
  async function details(id, chan) {
    chan = chan || P.chan;
    if (chan !== P.chan || !P.plan) { try { await load(chan); } catch (e) { return A.fail(e); } }
    if (!P.tasks.some((x) => x.id === id)) return LC.toast(t('ap_noTasks'));
    D = { id, chan, node: el('div', { class: 'ap-details' }) };
    LC.modal(D.node, { wide: true, label: t('ap_tasks'), onClose: () => { D = null; if (P.onClose) P.onClose(); } }); renderDetails();
    const f = D.node.querySelector('.ap-dtitle'); if (f) f.focus();
  }
  A.taskDetails = details;
  function renderDetails() {
    const x = P.tasks.find((y) => y.id === D.id); if (!x) { LC.closeModal(); return; }
    const can = A.writable(D.chan), set = (o) => call('update', { id: x.id, set: o }).then((r) => { if (r) { upsert(r.task); redraw(); } });
    const title = el('input', { class: 'ap-dtitle', value: x.text, maxlength: 255, 'aria-label': t('ap_taskName'), disabled: !can });
    title.addEventListener('change', () => { if (title.value.trim() && title.value !== x.text) set({ title: title.value }); });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });
    const who = A.peoplePick({ people: people(), value: x.assignees, label: t('ap_assignedTo'), disabled: !can, onChange: (v) => set({ assignees: v }) });
    const labels = el('div', { class: 'ap-dlabels' }, ...x.labels.map((id) => { const l = P.plan.labels.find((y) => y.id === id); return l ? el('span', { class: 'ap-label big', style: '--lc:' + l.color }, el('span', { text: labelName(l) }), can ? el('button', { type: 'button', class: 'ap-lx', 'aria-label': t('ap_remove') + ': ' + labelName(l), onclick: () => set({ labels: x.labels.filter((y) => y !== id) }) }, LC.icon('dismiss')) : null) : null; }),
      can ? el('button', { type: 'button', class: 'secondary sm withicon', 'aria-haspopup': 'menu', onclick: (e) => LC.menu(e.currentTarget, P.plan.labels.map((l, i) => ({ label: labelName(l, i), checked: x.labels.includes(l.id), fn: () => set({ labels: x.labels.includes(l.id) ? x.labels.filter((y) => y !== l.id) : [...x.labels, l.id] }) })).concat(['sep', { icon: 'edit', label: t('ap_editLabels'), fn: labelsDialog }])) }, LC.icon('tag'), el('span', { text: t('ap_labels') })) : null);
    const sel = (opts, v, f, label) => { const s = A.select(opts, v, f, label); s.disabled = !can; return A.field(label, s); };
    const date = (v, label, key) => { const i = A.dateInput(v, label); i.disabled = !can; i.addEventListener('change', () => set({ [key]: i.value ? A.fromDay(i.value) + (key === 'due' ? 17 : 9) * 3600000 : 0 })); return A.field(label, i); };
    const notes = el('textarea', { rows: 3, maxlength: 10000, 'aria-label': t('ap_notes'), disabled: !can }); notes.value = x.notes; notes.addEventListener('change', () => set({ notes: notes.value }));
    const ck = el('div', { class: 'ap-checklist' }, ...x.checklist.map((c, i) => el('div', { class: 'ap-ckrow' + (c.done ? ' done' : '') },
      el('input', { type: 'checkbox', checked: c.done, disabled: !can, 'aria-label': c.text, onchange: () => call('check', { id: x.id, act: 'toggle', item: c.id }) }),
      (() => { const i2 = el('input', { class: 'ap-ckin', value: c.text, maxlength: 300, 'aria-label': t('ap_checklist') + ' ' + (i + 1), disabled: !can }); i2.addEventListener('change', () => call('check', { id: x.id, act: 'edit', item: c.id, text: i2.value })); return i2; })(),
      can ? LC.ibtn('arrow_up', t('ap_moveLeft'), () => call('check', { id: x.id, act: 'move', item: c.id, to: i - 1 }), { disabled: i === 0 }) : null,
      can ? LC.ibtn('delete', t('ap_delete') + ': ' + c.text, () => call('check', { id: x.id, act: 'del', item: c.id })) : null)));
    const newItem = el('input', { placeholder: t('ap_addItem'), maxlength: 300, 'aria-label': t('ap_addItem'), disabled: !can });
    newItem.addEventListener('keydown', (e) => { if (e.key === 'Enter' && newItem.value.trim()) { e.preventDefault(); const v = newItem.value; newItem.value = ''; call('check', { id: x.id, act: 'add', text: v }).then(() => { const n = D && D.node.querySelector('input[aria-label="' + t('ap_addItem') + '"]'); if (n) n.focus(); }); } });
    const atts = el('div', { class: 'ap-atts' }, ...x.links.map((l) => el('div', { class: 'ap-att' }, LC.icon('link'), el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.name }), can ? LC.ibtn('dismiss', t('ap_remove') + ': ' + l.name, () => call('attach', { id: x.id, del: l.id })) : null)),
      ...x.files.map((f) => el('div', { class: 'ap-att' }, LC.icon('document'), el('a', { href: LC.fileUrl(f), download: f.name, text: f.name }), el('span', { class: 'muted small', text: LC.fmtSize(f.size) }), can ? LC.ibtn('dismiss', t('ap_remove') + ': ' + f.name, () => call('attach', { id: x.id, del: f.id })) : null)));
    const fileIn = el('input', { type: 'file', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const up = await LC.upload(f, f.name).promise; await call('attach', { id: x.id, file: { id: up.id } }); } catch (er) { A.fail(er); } } });
    const comment = el('textarea', { rows: 2, maxlength: 2000, placeholder: t('ap_addComment'), 'aria-label': t('ap_addComment'), disabled: !can });
    const comments = el('div', { class: 'ap-comments' }, ...[...x.comments].reverse().map((c) => el('div', { class: 'ap-comment' }, LC.avatar(S.users.get(c.by), 'sm'), el('div', { class: 'grow' }, el('div', { class: 'ap-cmhead' }, el('b', { text: LC.uname(c.by) }), el('time', { class: 'muted small', text: LC.fmtDateTime(c.ts) }), c.by === S.me.id || LC.isAdmin() ? LC.ibtn('delete', t('ap_delete'), () => call('comment', { id: x.id, del: c.id })) : null), el('div', { class: 'ap-cmtext', text: c.text })))));
    A.put(D.node, 
      el('div', { class: 'row-between' }, el('div', { class: 'ap-dtop' }, completeBox(x, can), title), LC.ibtn('dismiss', t('ap_close'), LC.closeModal)),
      el('div', { class: 'ap-dsub muted small' }, el('span', { text: t('ap_inChat', { where: A.chatTitle(D.chan) }) }), ' · ', el('span', { text: t('ap_createdBy', { name: LC.uname(x.by), when: LC.fmtDateTime(x.ts) }) })),
      el('div', { class: 'ap-row ap-dwho' }, who, labels),
      el('div', { class: 'ap-grid3' }, sel(P.plan.buckets.map((b) => [b.id, b.name]), x.bucket, (v) => call('move', { id: x.id, bucket: v }), t('ap_bucket')), sel(PROG.map((p) => [p, t('ap_p_' + p)]), x.progress, (v) => set({ progress: v }), t('ap_progress')), sel(PRIO.map((p) => [p, t('ap_pr_' + p)]), x.priority, (v) => set({ priority: v }), t('ap_priority')),
        date(x.start, t('ap_start'), 'start'), date(x.due, t('ap_due'), 'due')),
      A.field(t('ap_notes'), notes),
      el('h3', {}, t('ap_checklist'), x.checklist.length ? el('span', { class: 'ap-count', text: t('ap_checkN', { a: x.checklist.filter((c) => c.done).length, b: x.checklist.length }) }) : null), ck, can ? newItem : null,
      el('h3', { text: t('ap_attachments') }), atts, can ? el('div', { class: 'ap-row' }, el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => linkDialog(x) }, LC.icon('link'), el('span', { text: t('ap_addLink') })), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => fileIn.click() }, LC.icon('attach'), el('span', { text: t('ap_attachFile') })), fileIn) : null,
      el('h3', { text: t('ap_comments') }), can ? el('div', { class: 'ap-cmnew' }, comment, el('button', { type: 'button', class: 'primary sm', text: t('ap_post'), onclick: async () => { const v = comment.value.trim(); if (!v) return; comment.value = ''; await call('comment', { id: x.id, text: v }); } })) : null, comments,
      el('div', { class: 'acts' }, can && (x.by === S.me.id || LC.isAdmin()) ? el('button', { class: 'secondary danger', text: t('ap_delTask'), onclick: async () => { if (await LC.confirm(t('ap_confirmDelTask', { name: x.text }), { danger: true, ok: t('ap_delete') })) { await call('del', { id: x.id }); LC.closeModal(); } } }) : null, el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })));
    D.stale = false;
  }
  document.addEventListener('focusout', (e) => { if (D && D.stale && D.node.contains(e.target)) setTimeout(() => { if (D && D.stale && !(document.activeElement && D.node.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) renderDetails(); }, 50); });
  async function linkDialog(x) {
    const url = await LC.prompt(t('ap_linkUrl'), { value: 'https://', max: 1000 }); if (!url || !/^https?:\/\/\S+/i.test(url.trim())) return;
    const name = await LC.prompt(t('ap_linkName'), { value: '', max: 120 }); await call('attach', { id: x.id, url: url.trim(), name: name || '' });
  }

  // ---------- the Tasks tab ----------
  A.tab({ key: 'todos', icon: 'task_list_ltr', label: () => t('tabTodos'), desc: () => t('ap_tasksDesc'), order: 27,
    async render(host, chan) {
      P.host = host; A.put(host, el('p', { class: 'muted pad', text: t('ap_loading') }));
      try { await load(chan); } catch (e) { return A.put(host, el('p', { class: 'err pad', text: e.message })); }
      if (S.chan !== chan) return; draw();
    } });

  // ---------- the Tasks app (app bar): my tasks everywhere ----------
  const M = { tasks: [], plans: [], show: 'active', group: 'due', host: null };
  async function loadMine() { const d = await LC.api('/api/ap/mytasks'); M.tasks = d.tasks; M.plans = d.plans; }
  function drawMine() {
    const host = M.host; if (!host || !host.isConnected) return;
    const list = M.tasks.filter((x) => (M.show === 'active' ? !x.done : M.show === 'done' ? x.done : true)).map((x) => ({ ...x, late: !x.done && x.due && x.due < A.dayStart(Date.now()) }));
    const groupsOf = M.group === 'plan' ? [...new Set(list.map((x) => x.chan))].map((c) => ({ label: A.chatTitle(c), items: list.filter((x) => x.chan === c) }))
      : M.group === 'priority' ? PRIO.map((p) => ({ label: t('ap_pr_' + p), items: list.filter((x) => x.priority === p) }))
        : DUE.map(([k, l]) => ({ label: t(l), items: list.filter((x) => dueKey(x) === k) }));
    const row = (x) => el('div', { class: 'ap-mrow todo' + (x.done ? ' done' : '') + (x.late ? ' late' : ''), role: 'listitem', 'data-id': x.id },
      el('input', { type: 'checkbox', class: 'ap-round', checked: !!x.done, 'aria-label': (x.done ? t('ap_markUndone') : t('ap_markDone')) + ': ' + x.text, onchange: async () => { x.done = !x.done; drawMine(); await A.call('/api/ap/task', { chan: x.chan, op: 'update', id: x.id, set: { progress: x.done ? 'completed' : 'notstarted' } }); refreshMine(); } }),
      el('button', { type: 'button', class: 'ap-mopen', onclick: () => details(x.id, x.chan) }, el('span', { class: 'ap-mtitle', text: x.text }), el('span', { class: 'muted small', text: A.chatTitle(x.chan) + (x.bucketName ? ' · ' + x.bucketName : '') })),
      x.labelDefs && x.labelDefs.length ? el('span', { class: 'ap-clabels' }, ...x.labelDefs.map((l) => el('span', { class: 'ap-label', style: '--lc:' + l.color, text: l.name || ' ', title: l.name })) ) : null,
      prioIcon(x), x.progress === 'inprogress' ? LC.icon('circle_half_fill', { label: t('ap_p_inprogress') }) : null, dueChip(x));
    A.put(host, el('div', { class: 'ap-page' },
      el('div', { class: 'ap-tbar' }, A.seg([['active', t('ap_active')], ['done', t('ap_p_completed')], ['all', t('ap_all')]], M.show, (v) => { M.show = v; drawMine(); }, t('ap_myTasks')), el('span', { class: 'grow' }),
        el('label', { class: 'ap-inline' }, el('span', { class: 'small muted', text: t('ap_groupBy') }), A.select([['due', t('ap_due')], ['plan', t('ap_plan')], ['priority', t('ap_priority')]], M.group, (v) => { M.group = v; drawMine(); }, t('ap_groupBy')))),
      list.length ? el('div', { class: 'ap-mlist' }, ...groupsOf.filter((g) => g.items.length).map((g) => el('section', { class: 'ap-mgroup', 'aria-label': g.label }, el('h3', {}, g.label, el('span', { class: 'ap-count', text: String(g.items.length) })), el('div', { role: 'list' }, ...g.items.sort((a, b) => (a.due || 9e15) - (b.due || 9e15)).map(row)))))
        : A.empty('task_list_ltr', t('ap_noMyTasks'), t('ap_noMyTasksHelp'))));
  }
  const refreshMine = LC.debounce(async () => { if (!M.host || !M.host.isConnected) return; try { await loadMine(); drawMine(); if (S.pane === 'ap_tasks') LC.renderNav(); } catch {} }, 300);
  LC.on('ap_task', () => { if (S.app === 'ap_tasks') refreshMine(); });
  A.app({ key: 'ap_tasks', icon: 'clipboard_task_list_ltr', color: '#038387', name: () => t('ap_tasks'), desc: () => t('ap_myTasksDesc'), long: () => t('ap_myTasksDesc') + ' ' + t('ap_tasksDesc'), tab: 'todos', order: 70,
    pane: {
      render(nav) {
        const item = (label, icon, on, fn, n) => el('button', { class: 'ap-navitem' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null, onclick: fn }, LC.icon(icon), el('span', { class: 'grow', text: label }), n ? el('span', { class: 'ap-count', text: String(n) }) : null);
        A.put(nav, item(t('ap_myTasks'), 'person', true, () => LC.openApp('ap_tasks'), M.tasks.filter((x) => !x.done).length), el('div', { class: 'ap-navsec', text: t('ap_plans') }),
          ...M.plans.map((p) => item(A.chatTitle(p.chan), 'task_list_ltr', false, async () => { await LC.openChat(p.chan); LC.setTab('todos'); }, p.open)));
      },
      async main(host) { M.host = host; P.onClose = () => refreshMine(); A.put(host, el('p', { class: 'muted pad', text: t('ap_loading') })); try { await loadMine(); } catch (e) { return A.put(host, el('p', { class: 'err pad', text: e.message })); } drawMine(); LC.renderNav(); },
    } });
  A.openers.tasks = async (a) => { const id = a.ref && a.ref.id; if (a.chan) { await LC.openChat(a.chan); LC.setTab('todos'); if (id) setTimeout(() => details(id, a.chan), 150); } };
})();
