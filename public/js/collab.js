'use strict';
// Per-chat tabs: Files, shared Notes, Calendar. The apps area's files replace the Whiteboard (apps-board.js) and the To-dos
// (apps-tasks.js, a task board) and add more tabs; LC.renderTab draws whichever tab is open ("type:id" = one of several tabs of a kind).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const C = (LC.collab = { chan: null, data: null });
  const fail = (e) => LC.toast(e.message);
  const pad = (n) => String(n).padStart(2, '0');
  const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  LC.renderTab = async (tab) => {
    const host = $('#tabView'); if (host._apLeave) { const f = host._apLeave; host._apLeave = null; try { f(); } catch {} } if (tab === 'chat') return;
    const [type, id] = tab.split(':'), ext = LC.ext.tabs.find((x) => x.key === type && (id ? x.multi : !x.when || x.when(S.chan)));
    if (ext) { host.replaceChildren(); try { return await ext.render(host, S.chan, id && LC.apps ? LC.apps.inst(S.chan, tab) : null); } catch (e) { return host.replaceChildren(el('p', { class: 'err pad', text: e.message })); } }
    host.replaceChildren(el('p', { class: 'muted pad', text: t('loading') })); const chan = S.chan;
    try {
      if (tab === 'files') return renderFiles(host, chan);
      if (C.chan !== chan || !C.data || tab === 'notes') { C.data = await LC.api('/api/collab?chan=' + encodeURIComponent(chan)); C.chan = chan; }
      if (S.chan !== chan || S.tab !== tab) return;
      const draw = { notes: renderNotes, calendar: renderCalendar }[tab]; if (draw) draw(host); else host.replaceChildren(el('p', { class: 'muted pad', text: t('loading') }));
    } catch (e) { host.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  };
  const writable = () => { const c = S.channels.get(S.chan); return !(S.me.mutedUntil > Date.now()) && !(c && c.readonly && !LC.isAdmin()); };

  // ---------- files ----------
  async function renderFiles(host, chan) {
    let kind = 'all', files = [], more = true; const list = el('div', { class: 'filegrid' }), btn = el('button', { class: 'more', text: t('loadMore'), onclick: () => load(false) });
    const sel = el('select', { 'aria-label': t('filterFiles'), onchange: (e) => { kind = e.target.value; load(true); } }, ...[['all', 'filesAll'], ['image', 'filesImages'], ['media', 'filesMedia'], ['doc', 'filesDocs']].map(([v, k]) => el('option', { value: v, text: t(k) })));
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('folder'), ' ' + t('tabFiles')), sel), list, btn);
    async function load(reset) {
      if (reset) { files = []; more = true; list.replaceChildren(); }
      const before = files.length ? files[files.length - 1].seq : ''; const d = await LC.api(`/api/files?chan=${encodeURIComponent(chan)}&kind=${kind}${before ? '&before=' + before : ''}`).catch((e) => { fail(e); return { files: [] }; });
      files = files.concat(d.files); more = d.files.length >= 60;
      for (const f of d.files) list.append(el('div', { class: 'fcard' }, LC.isImage(f.name) ? el('button', { class: 'thumb', 'aria-label': f.name, onclick: () => LC.openLightbox(files.filter((x) => LC.isImage(x.name)), files.filter((x) => LC.isImage(x.name)).findIndex((x) => x.id === f.id)) }, el('img', { src: LC.fileUrl(f, true), alt: f.name, loading: 'lazy' })) : el('div', { class: 'thumb ico' + (LC.extOf(f.name) === 'pdf' ? ' pdf' : '') }, LC.icon(LC.extOf(f.name) === 'pdf' ? 'document_pdf' : /^(zip|rar|7z|gz|tar)$/.test(LC.extOf(f.name)) ? 'folder_zip' : 'document')), el('div', { class: 'fmeta' }, el('b', { text: f.name, title: f.name }), el('small', { text: `${LC.fmtSize(f.size)} · ${LC.uname(f.from)} · ${LC.fmtDateTime(f.ts)}` }), el('div', {}, LC.extOf(f.name) === 'pdf' ? el('button', { class: 'secondary sm', text: t('view'), onclick: () => LC.openPdf(f) }) : null, el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download') }), el('button', { class: 'secondary sm', text: t('showInChat'), onclick: () => { LC.setTab('chat'); LC.jumpToMessage(chan, f.msg); } })))));
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
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('note'), ' ' + t('tabNotes')), status), banner, ta); setStatus();
    C.onNote = (n) => { if (n.chan !== S.chan || S.tab !== 'notes') return; if (!dirty) { note = n.note; C.data.note = note; ta.value = note.text; setStatus(); } else if (n.note.by !== S.me.id) { banner.replaceChildren(el('span', { text: t('notesConflict', { name: LC.uname(n.note.by) }) }), el('button', { class: 'secondary sm', text: t('loadTheirs'), onclick: () => { note = n.note; ta.value = note.text; dirty = false; banner.classList.add('hidden'); setStatus(); } })); banner.classList.remove('hidden'); } };
  }

  // ---------- calendar ----------
  let calMonth = new Date(); calMonth.setDate(1);
  function renderCalendar(host) {
    const events = C.data.events, can = writable(), y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = new Date();
    const dayEvents = (d) => events.filter((e) => { const s = new Date(e.start); return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d; });
    const grid = el('div', { class: 'calgrid' }, ...['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => el('div', { class: 'dow', text: new Date(2024, 0, 1 + i).toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { weekday: 'short' }) || d })), ...Array(startDow).fill(0).map(() => el('div', { class: 'day empty' })), ...Array.from({ length: days }, (_, i) => { const d = i + 1, ev = dayEvents(d), isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d; return el('button', { class: 'day' + (isToday ? ' today' : '') + (ev.length ? ' has' : ''), 'aria-label': `${d} ${first.toLocaleDateString(undefined, { month: 'long' })}${ev.length ? ', ' + ev.length : ''}`, onclick: () => eventDialog(null, new Date(y, m, d, 18, 0).getTime()) }, el('span', { text: d }), ev.length ? el('i', { class: 'evdot', text: ev.length > 1 ? ev.length : '' }) : null); }));
    const upcoming = events.filter((e) => e.start > Date.now() - 3600000).slice(0, 30), past = events.filter((e) => e.start <= Date.now() - 3600000).slice(-5).reverse();
    const row = (e) => el('div', { class: 'evrow' }, el('div', { class: 'evdate' }, el('b', { text: new Date(e.start).getDate() }), el('small', { text: new Date(e.start).toLocaleDateString(undefined, { month: 'short' }) })), el('div', { class: 'grow' }, el('b', { text: e.title }), el('div', { class: 'muted small' }, LC.fmtDateTime(e.start), e.remind ? [' · ', LC.icon('alert'), ' ' + t('remindBefore', { n: e.remind })] : null, ' · ' + LC.uname(e.by)), e.notes ? el('div', { class: 'small', text: e.notes }) : null), can && (e.by === S.me.id || LC.isAdmin()) ? el('button', { class: 'secondary sm', text: t('edit'), onclick: () => eventDialog(e) }) : null);
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('calendar_ltr'), ' ' + t('tabCalendar')), el('div', { class: 'calnav' }, LC.ibtn('chevron_left', t('prev'), () => { calMonth = new Date(y, m - 1, 1); renderCalendar(host); }), el('b', { text: first.toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { month: 'long', year: 'numeric' }) }), LC.ibtn('chevron_right', t('next'), () => { calMonth = new Date(y, m + 1, 1); renderCalendar(host); })), can ? el('button', { class: 'primary sm withicon', onclick: () => eventDialog(null) }, LC.icon('add'), t('addEvent')) : null), grid, el('h3', { text: t('upcoming') }), ...(upcoming.length ? upcoming.map(row) : [el('p', { class: 'muted', text: t('noEvents') })]), past.length ? el('h3', { text: t('past') }) : null, ...past.map(row));
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
  const again = (tab) => { if (S.tab === tab && !LC.ext.tabs.some((x) => x.key === tab)) renderCalendar($('#tabView')); };
  LC.on('note', (n) => { if (n.chan === C.chan && C.data) C.data.note = n.note; if (C.onNote) C.onNote(n); });
  LC.on('board', () => { if (C.data) C.chan = null; }); // the whiteboard keeps its own copy (apps-board.js); reload next time
  LC.on('todos', (e) => { if (e.chan === C.chan && C.data) C.data.todos = e.todos; });
  LC.on('events', (e) => { if (e.chan === C.chan && C.data) { C.data.events = e.events; again('calendar'); } });
  LC.on('init', () => { C.chan = null; C.data = null; });
})();
