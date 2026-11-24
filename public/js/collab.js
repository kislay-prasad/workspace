'use strict';
// Per-chat tabs: Files, shared Notes, Whiteboard, To-dos, Calendar.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const C = (LC.collab = { chan: null, data: null }); let boardApi = null;
  const fail = (e) => LC.toast(e.message);
  const pad = (n) => String(n).padStart(2, '0');
  const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  LC.renderTab = async (tab) => {
    const host = $('#tabView'); boardApi = null; if (tab === 'chat') return;
    host.replaceChildren(el('p', { class: 'muted pad', text: t('loading') })); const chan = S.chan;
    try {
      if (tab === 'files') return renderFiles(host, chan);
      if (C.chan !== chan || !C.data || tab === 'notes') { C.data = await LC.api('/api/collab?chan=' + encodeURIComponent(chan)); C.chan = chan; }
      if (S.chan !== chan || S.tab !== tab) return;
      ({ notes: renderNotes, board: renderBoard, todos: renderTodos, calendar: renderCalendar })[tab](host);
    } catch (e) { host.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  };
  const writable = () => { const c = S.channels.get(S.chan); return !(S.me.mutedUntil > Date.now()) && !(c && c.readonly && !LC.isAdmin()); };

  // ---------- files ----------
  async function renderFiles(host, chan) {
    let kind = 'all', files = [], more = true; const list = el('div', { class: 'filegrid' }), btn = el('button', { class: 'more', text: t('loadMore'), onclick: () => load(false) });
    const sel = el('select', { 'aria-label': t('filterFiles'), onchange: (e) => { kind = e.target.value; load(true); } }, ...[['all', 'filesAll'], ['image', 'filesImages'], ['media', 'filesMedia'], ['doc', 'filesDocs']].map(([v, k]) => el('option', { value: v, text: t(k) })));
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', { text: '📁 ' + t('tabFiles') }), sel), list, btn);
    async function load(reset) {
      if (reset) { files = []; more = true; list.replaceChildren(); }
      const before = files.length ? files[files.length - 1].seq : ''; const d = await LC.api(`/api/files?chan=${encodeURIComponent(chan)}&kind=${kind}${before ? '&before=' + before : ''}`).catch((e) => { fail(e); return { files: [] }; });
      files = files.concat(d.files); more = d.files.length >= 60;
      for (const f of d.files) list.append(el('div', { class: 'fcard' }, LC.isImage(f.name) ? el('button', { class: 'thumb', 'aria-label': f.name, onclick: () => LC.openLightbox(files.filter((x) => LC.isImage(x.name)), files.filter((x) => LC.isImage(x.name)).findIndex((x) => x.id === f.id)) }, el('img', { src: LC.fileUrl(f, true), alt: f.name, loading: 'lazy' })) : el('div', { class: 'thumb ico', text: LC.extOf(f.name) === 'pdf' ? '📕' : '📄' }), el('div', { class: 'fmeta' }, el('b', { text: f.name, title: f.name }), el('small', { text: `${LC.fmtSize(f.size)} · ${LC.uname(f.from)} · ${LC.fmtDateTime(f.ts)}` }), el('div', {}, LC.extOf(f.name) === 'pdf' ? el('button', { class: 'secondary sm', text: t('view'), onclick: () => LC.openPdf(f) }) : null, el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download') }), el('button', { class: 'secondary sm', text: t('showInChat'), onclick: () => { LC.setTab('chat'); LC.jumpToMessage(chan, f.msg); } })))));
      if (reset && !files.length) list.append(el('p', { class: 'muted pad', text: t('noFiles') })); btn.classList.toggle('hidden', !more);
    }
    load(true);
  }

  // ---------- notes ----------
  function renderNotes(host) {
    let note = C.data.note, dirty = false, saving = false; const ta = el('textarea', { class: 'notearea', value: note.text, placeholder: t('notesPlaceholder'), 'aria-label': t('tabNotes'), disabled: !writable() }), status = el('span', { class: 'muted small' }), banner = el('div', { class: 'notice hidden' });
    const setStatus = () => { status.textContent = note.v ? t('notesSaved', { name: LC.uname(note.by), when: LC.ago(note.ts) }) : t('notesEmpty'); };
    const save = async (force) => {
      if (saving) return; saving = true; status.textContent = t('saving');
      try { const r = await LC.api('/api/note', { chan: S.chan, text: ta.value, v: force ? force.v : note.v }); note = r.note; C.data.note = note; dirty = false; banner.classList.add('hidden'); setStatus(); }
      catch (e) { if (e.status === 409 && e.data && e.data.note) { const theirs = e.data.note; banner.replaceChildren(el('span', { text: t('notesConflict', { name: LC.uname(theirs.by) }) }), el('button', { class: 'secondary sm', text: t('loadTheirs'), onclick: () => { note = theirs; C.data.note = theirs; ta.value = theirs.text; dirty = false; banner.classList.add('hidden'); setStatus(); } }), el('button', { class: 'secondary sm', text: t('keepMine'), onclick: () => save(theirs) })); banner.classList.remove('hidden'); status.textContent = ''; } else fail(e); }
      saving = false;
    };
    const deb = LC.debounce(() => save(), 900); ta.addEventListener('input', () => { dirty = true; status.textContent = t('typing'); deb(); });
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', { text: '📝 ' + t('tabNotes') }), status), banner, ta); setStatus();
    C.onNote = (n) => { if (n.chan !== S.chan || S.tab !== 'notes') return; if (!dirty) { note = n.note; C.data.note = note; ta.value = note.text; setStatus(); } else if (n.note.by !== S.me.id) { banner.replaceChildren(el('span', { text: t('notesConflict', { name: LC.uname(n.note.by) }) }), el('button', { class: 'secondary sm', text: t('loadTheirs'), onclick: () => { note = n.note; ta.value = note.text; dirty = false; banner.classList.add('hidden'); setStatus(); } })); banner.classList.remove('hidden'); } };
  }

  // ---------- whiteboard ----------
  function renderBoard(host) {
    const COLORS = ['#111111', '#d13438', '#ca5010', '#e3b200', '#498205', '#0078d4', '#7a5af5', '#e3008c'];
    let color = COLORS[0], size = 4, erase = false, drawing = null, strokes = [...C.data.board]; const cv = el('canvas', { class: 'boardcv', width: 1000, height: 700, 'aria-label': t('tabBoard') }), g = cv.getContext('2d'), live = new Map();
    const paint = (s) => { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s.w * 1.4; g.globalCompositeOperation = s.c === 'erase' ? 'destination-out' : 'source-over'; g.strokeStyle = s.c === 'erase' ? '#000' : s.c; g.beginPath(); const p = s.pts; g.moveTo(p[0], p[1]); if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); g.restore(); };
    const redraw = () => { g.clearRect(0, 0, 1000, 700); strokes.forEach(paint); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 700)]; };
    const can = writable(); let lastSent = 0, sentIdx = 0, sid = '';
    const flushLive = (force) => { if (!drawing || drawing.pts.length - sentIdx < 4 && !force) return; const seg = { c: drawing.c, w: drawing.w, pts: drawing.pts.slice(Math.max(0, sentIdx - 2)) }; sentIdx = drawing.pts.length; if (seg.pts.length >= 2) LC.api('/api/board/live', { chan: S.chan, sid, seg }).catch(() => {}); };
    cv.addEventListener('pointerdown', (e) => { if (!can || e.button > 0) return; cv.setPointerCapture(e.pointerId); sid = Math.random().toString(36).slice(2, 10); sentIdx = 0; drawing = { c: erase ? 'erase' : color, w: erase ? size * 3 : size, pts: pos(e) }; paint({ ...drawing, pts: [...drawing.pts] }); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e), n = drawing.pts.length, a = drawing.pts[n - 2], b = drawing.pts[n - 1]; if (Math.abs(p[0] - a) + Math.abs(p[1] - b) < 2) return; paint({ c: drawing.c, w: drawing.w, pts: [a, b, p[0], p[1]] }); drawing.pts.push(p[0], p[1]); if (drawing.pts.length > 3900) finish(); else if (Date.now() - lastSent > 120) { lastSent = Date.now(); flushLive(); } });
    const finish = () => { if (!drawing) return; const s = drawing; drawing = null; flushLive(true); LC.api('/api/board/stroke', { chan: S.chan, stroke: { c: s.c, w: s.w, pts: s.pts } }).catch(fail); };
    cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', finish);
    const tool = (label, fn, on) => el('button', { class: 'secondary sm' + (on ? ' on' : ''), text: label, onclick: fn });
    const bar = el('div', { class: 'boardbar' }); const drawBar = () => bar.replaceChildren(...COLORS.map((c) => el('button', { class: 'swatch' + (!erase && color === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { color = c; erase = false; drawBar(); } })), el('select', { 'aria-label': t('brushSize'), onchange: (e) => { size = Number(e.target.value); } }, [2, 4, 8, 14, 24].map((n) => el('option', { value: n, text: n + ' px', selected: n === size }))), tool('🧽 ' + t('eraser'), () => { erase = !erase; drawBar(); }, erase), tool('↶ ' + t('undo'), () => LC.api('/api/board/undo', { chan: S.chan }).catch(fail)), tool('🗑 ' + t('clear'), async () => { if (await LC.confirm(t('confirmClearBoard'), { danger: true })) LC.api('/api/board/clear', { chan: S.chan }).catch(fail); }), tool('⬇ PNG', () => { const o = document.createElement('canvas'); o.width = 1000; o.height = 700; const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1000, 700); x.drawImage(cv, 0, 0); const a = el('a', { href: o.toDataURL('image/png'), download: 'whiteboard.png' }); a.click(); }));
    drawBar(); host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', { text: '🎨 ' + t('tabBoard') })), can ? bar : el('p', { class: 'notice', text: t('boardReadOnly') }), el('div', { class: 'boardwrap' }, cv)); redraw();
    boardApi = {
      event(e) { if (e.chan !== S.chan) return; if (e.op === 'add') { if (!strokes.some((s) => s.id === e.stroke.id)) strokes.push(e.stroke); redraw(); } else if (e.op === 'del') { strokes = strokes.filter((s) => s.id !== e.id); redraw(); } else if (e.op === 'clear') { strokes = []; redraw(); } C.data.board = strokes; },
      live(e) { if (e.chan !== S.chan || e.by === S.me.id) return; paint(e.seg); },
    };
  }

  // ---------- to-dos ----------
  function renderTodos(host) {
    const todos = C.data.todos, can = writable(), text = el('input', { placeholder: t('newTask'), maxlength: 200, 'aria-label': t('newTask') }), due = el('input', { type: 'datetime-local', 'aria-label': t('dueDate') });
    const c = S.channels.get(S.chan), people = [...S.users.values()].filter((u) => !u.removed && (S.chan.startsWith('dm:') ? S.chan.includes(u.id) : !c || !c.members || c.members.includes(u.id))), who = el('select', { 'aria-label': t('assignTo') }, el('option', { value: '', text: t('unassigned') }), people.map((u) => el('option', { value: u.id, text: LC.uname(u.id) })));
    const op = (body) => LC.api('/api/todo', { chan: S.chan, ...body }).catch(fail);
    const add = (e) => { e.preventDefault(); if (!text.value.trim()) return; op({ op: 'add', text: text.value, assignee: who.value, due: due.value ? new Date(due.value).getTime() : 0 }); text.value = ''; due.value = ''; };
    const open = todos.filter((x) => !x.done), done = todos.filter((x) => x.done);
    const item = (x) => el('div', { class: 'todo' + (x.done ? ' done' : '') }, el('input', { type: 'checkbox', checked: x.done, disabled: !can, 'aria-label': x.text, onchange: () => op({ op: 'toggle', id: x.id }) }), el('span', { class: 'grow' }, x.text, x.assignee ? el('span', { class: 'pill', text: '@' + LC.uname(x.assignee) }) : null, x.due ? el('span', { class: 'pill' + (!x.done && x.due < Date.now() ? ' late' : ''), text: '⏰ ' + LC.fmtDateTime(x.due) }) : null), (x.by === S.me.id || LC.isAdmin()) && can ? el('button', { class: 'icon', text: '🗑', 'aria-label': t('delete'), onclick: () => op({ op: 'del', id: x.id }) }) : null);
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', { text: '✅ ' + t('tabTodos') }), el('span', { class: 'muted small', text: t('tasksLeft', { n: open.length }) })), can ? el('form', { class: 'addform', onsubmit: add }, text, who, due, el('button', { class: 'primary', type: 'submit', text: t('add') })) : el('p', { class: 'notice', text: t('boardReadOnly') }), ...open.map(item), done.length ? el('h3', { text: t('completed') }) : null, ...done.map(item), !todos.length ? el('p', { class: 'empty', text: t('noTasks') }) : null);
  }

  // ---------- calendar ----------
  let calMonth = new Date(); calMonth.setDate(1);
  function renderCalendar(host) {
    const events = C.data.events, can = writable(), y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = new Date();
    const dayEvents = (d) => events.filter((e) => { const s = new Date(e.start); return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d; });
    const grid = el('div', { class: 'calgrid' }, ...['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => el('div', { class: 'dow', text: new Date(2024, 0, 1 + i).toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { weekday: 'short' }) || d })), ...Array(startDow).fill(0).map(() => el('div', { class: 'day empty' })), ...Array.from({ length: days }, (_, i) => { const d = i + 1, ev = dayEvents(d), isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d; return el('button', { class: 'day' + (isToday ? ' today' : '') + (ev.length ? ' has' : ''), 'aria-label': `${d} ${first.toLocaleDateString(undefined, { month: 'long' })}${ev.length ? ', ' + ev.length : ''}`, onclick: () => eventDialog(null, new Date(y, m, d, 18, 0).getTime()) }, el('span', { text: d }), ev.length ? el('i', { class: 'evdot', text: ev.length > 1 ? ev.length : '' }) : null); }));
    const upcoming = events.filter((e) => e.start > Date.now() - 3600000).slice(0, 30), past = events.filter((e) => e.start <= Date.now() - 3600000).slice(-5).reverse();
    const row = (e) => el('div', { class: 'evrow' }, el('div', { class: 'evdate' }, el('b', { text: new Date(e.start).getDate() }), el('small', { text: new Date(e.start).toLocaleDateString(undefined, { month: 'short' }) })), el('div', { class: 'grow' }, el('b', { text: e.title }), el('div', { class: 'muted small', text: LC.fmtDateTime(e.start) + (e.remind ? ' · ⏰ ' + t('remindBefore', { n: e.remind }) : '') + ' · ' + LC.uname(e.by) }), e.notes ? el('div', { class: 'small', text: e.notes }) : null), can && (e.by === S.me.id || LC.isAdmin()) ? el('button', { class: 'secondary sm', text: t('edit'), onclick: () => eventDialog(e) }) : null);
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', { text: '📅 ' + t('tabCalendar') }), el('div', { class: 'calnav' }, el('button', { class: 'icon', text: '‹', 'aria-label': t('prev'), onclick: () => { calMonth = new Date(y, m - 1, 1); renderCalendar(host); } }), el('b', { text: first.toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { month: 'long', year: 'numeric' }) }), el('button', { class: 'icon', text: '›', 'aria-label': t('next'), onclick: () => { calMonth = new Date(y, m + 1, 1); renderCalendar(host); } })), can ? el('button', { class: 'primary sm', text: '＋ ' + t('addEvent'), onclick: () => eventDialog(null) }) : null), grid, el('h3', { text: t('upcoming') }), ...(upcoming.length ? upcoming.map(row) : [el('p', { class: 'muted', text: t('noEvents') })]), past.length ? el('h3', { text: t('past') }) : null, ...past.map(row));
  }
  function eventDialog(ev, startTs) {
    const title = el('input', { value: ev ? ev.title : '', maxlength: 100, placeholder: t('eventTitle'), 'aria-label': t('eventTitle') }), start = el('input', { type: 'datetime-local', value: localInput(ev ? ev.start : startTs || Date.now() + 3600000), 'aria-label': t('starts') }), end = el('input', { type: 'datetime-local', value: ev && ev.end ? localInput(ev.end) : '', 'aria-label': t('ends') }), notes = el('textarea', { rows: 2, maxlength: 300, placeholder: t('notesOptional') }, ev ? ev.notes : ''); notes.value = ev ? ev.notes : '';
    const rem = el('select', { 'aria-label': t('remind') }, [[0, t('noReminder')], [5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 h'], [1440, '1 ' + t('day')]].map(([v, l]) => el('option', { value: v, text: l })));
    rem.value = String(ev ? ev.remind || 0 : 10);
    const go = () => { const body = { chan: S.chan, op: ev ? 'edit' : 'add', id: ev && ev.id, title: title.value, start: new Date(start.value).getTime(), end: end.value ? new Date(end.value).getTime() : 0, remind: Number(rem.value), notes: notes.value }; LC.api('/api/event', body).then(() => LC.closeModal()).catch(fail); };
    LC.modal([el('h2', { text: ev ? t('editEvent') : t('addEvent') }), title, el('label', { class: 'field' }, t('starts'), start), el('label', { class: 'field' }, t('ends') + ' (' + t('optional') + ')', end), el('label', { class: 'field' }, t('remind'), rem), notes,
      el('div', { class: 'acts' }, ev ? el('button', { class: 'secondary danger', text: t('delete'), onclick: () => LC.api('/api/event', { chan: S.chan, op: 'del', id: ev.id }).then(() => LC.closeModal()).catch(fail) }) : null, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('save'), onclick: go }))]);
  }

  // ---------- live updates ----------
  const again = (tab) => { if (S.tab === tab) { const host = $('#tabView'); ({ todos: renderTodos, calendar: renderCalendar })[tab](host); } };
  LC.on('note', (n) => { if (n.chan === C.chan && C.data) C.data.note = n.note; if (C.onNote) C.onNote(n); });
  LC.on('board', (e) => { if (e.chan === C.chan && C.data && !boardApi) { if (e.op === 'add') C.data.board.push(e.stroke); else if (e.op === 'clear') C.data.board = []; else if (e.op === 'del') C.data.board = C.data.board.filter((s) => s.id !== e.id); } if (boardApi && S.tab === 'board') boardApi.event(e); });
  LC.on('boardlive', (e) => { if (boardApi && S.tab === 'board') boardApi.live(e); });
  LC.on('todos', (e) => { if (e.chan === C.chan && C.data) { C.data.todos = e.todos; again('todos'); } });
  LC.on('events', (e) => { if (e.chan === C.chan && C.data) { C.data.events = e.events; again('calendar'); } });
  LC.on('init', () => { C.chan = null; C.data = null; });
})();
