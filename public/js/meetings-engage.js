'use strict';
// Meetings — engagement and follow-up (section 21): Q&A, polls (the chat's poll messages, with a vote pop-up),
// notes + agenda, breakout rooms, attendance report, recap. Each one is a meeting-window side panel
// (LC.ext.callPanels) and/or a "More" item (LC.ext.callMore), and is also reachable from the meeting chat.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), MT = LC.mt;
  LC.addStrings('en', {
    mt_qa: 'Q&A', mt_ask: 'Ask a question', mt_askPh: 'Type your question', mt_anon: 'Post anonymously', mt_post: 'Post', mt_top: 'Top', mt_recentQ: 'Recent', mt_anonymous: 'Anonymous', mt_upvote: 'Upvote', mt_upvoted: 'Upvoted',
    mt_reply: 'Reply', mt_replyPh: 'Write a reply', mt_markAnswered: 'Mark as answered', mt_unmarkAnswered: 'Mark as not answered', mt_answered: 'Answered', mt_pin: 'Pin', mt_unpin: 'Unpin', mt_pinned: 'Pinned', mt_dismissQ: 'Dismiss', mt_restoreQ: 'Restore', mt_dismissed: 'Dismissed', mt_deleteQ: 'Delete',
    mt_noQuestions: 'No questions yet. Ask the first one.', mt_qaOff: 'Q&A is off for this meeting.', mt_votesN: '{n} votes',
    mt_polls: 'Polls', mt_newPoll: 'New poll', mt_launch: 'Launch', mt_noPolls: 'No polls yet. Create one and everyone in the meeting gets it.', mt_pollQ: 'Question', mt_pollOpt: 'Option {n}', mt_multi: 'Allow more than one answer', mt_vote: 'Vote', mt_pollPop: 'New poll', mt_closePoll: 'Close poll', mt_closed: 'Closed', mt_pollNeeds: 'A poll needs a question and two options.',
    mt_notes: 'Notes', mt_agenda: 'Agenda', mt_addAgenda: 'Add an agenda item', mt_mins: 'min', mt_sharedNotes: 'Meeting notes', mt_notesPh: 'Take notes everyone in the meeting can see and edit', mt_moveUp: 'Move up', mt_moveDown: 'Move down', mt_noAgenda: 'No agenda yet.', mt_savedBy: 'Saved · {name}', mt_saving: 'Saving…', mt_conflict: '{name} changed the notes. Showing their version.',
    mt_rooms: 'Rooms', mt_roomsTitle: 'Breakout rooms', mt_roomsN: 'Number of rooms', mt_auto: 'Assign people automatically', mt_manual: 'Let me assign people', mt_createRooms: 'Create rooms', mt_openRooms: 'Open rooms', mt_closeRooms: 'Close rooms', mt_roomsOpen: 'Rooms are open',
    mt_roomsClosed: 'Rooms are closed', mt_closesIn: 'Closes in {t}', mt_timer: 'Time limit', mt_noLimit: 'No time limit', mt_announce: 'Make an announcement', mt_announcePh: 'Message to every room', mt_sendAnn: 'Send', mt_reassign: 'Reassign automatically', mt_deleteRooms: 'Delete rooms',
    mt_unassigned: 'Not assigned', mt_moveTo: 'Move {name} to', mt_joinRoom: 'Join room', mt_rename: 'Rename', mt_roomName: 'Room name', mt_youInRoom: "You're in {room}", mt_goRoom: 'Go to my room', mt_backMain: 'Back to the main meeting', mt_movedTo: 'Moving you to {room}…',
    mt_movedBack: 'Rooms closed. Back to the main meeting…', mt_assigned: "You've been assigned to {room}", mt_announcement: 'Announcement', mt_roomsHelp: 'Split the meeting into smaller groups. When you open the rooms, everyone moves into their room automatically and comes back when the rooms close.',
    mt_info: 'Meeting info', mt_optionsTitle: 'Meeting options', mt_attReport: 'Attendance report', mt_csv: 'Download CSV', mt_firstJoin: 'First join', mt_lastLeave: 'Last leave', mt_inMeetingTime: 'Time in meeting', mt_stillHere: 'still here', mt_noAttendance: 'Nobody has joined yet.',
    mt_recapTitle: 'Recap', mt_duration: 'Duration', mt_messagesDuring: 'Chat during the meeting', mt_filesShared: 'Files shared', mt_recordings: 'Recordings', mt_noRecap: 'The recap appears here after the meeting starts.', mt_nothing: 'Nothing here.', mt_attendeesN: '{n} attendees', mt_session: 'Meeting',
    mt_addDeviceTitle: 'Add a device', mt_optSaved: 'Meeting options saved', mt_roles: 'Roles', mt_makePresenter: 'Make a presenter', mt_makeAttendee: 'Make an attendee', mt_noOneHere: 'Nobody else is in the meeting.',
  });
  LC.addStrings('hi', { mt_qa: 'प्रश्नोत्तर', mt_ask: 'प्रश्न पूछें', mt_post: 'पोस्ट करें', mt_polls: 'पोल', mt_notes: 'नोट्स', mt_agenda: 'एजेंडा', mt_rooms: 'रूम', mt_roomsTitle: 'ब्रेकआउट रूम', mt_recapTitle: 'सारांश', mt_attReport: 'उपस्थिति रिपोर्ट', mt_vote: 'वोट करें', mt_info: 'मीटिंग जानकारी' });
  LC.addStrings('es', { mt_qa: 'Preguntas y respuestas', mt_ask: 'Hacer una pregunta', mt_post: 'Publicar', mt_polls: 'Encuestas', mt_notes: 'Notas', mt_agenda: 'Agenda', mt_rooms: 'Salas', mt_roomsTitle: 'Salas para grupos', mt_recapTitle: 'Resumen', mt_attReport: 'Informe de asistencia', mt_vote: 'Votar', mt_info: 'Información de la reunión' });

  const mid = () => MT.callMeeting(), mtOf = () => { const c = MT.call(); return (c && c.mt) || {}; };
  const isOrg = (id) => { const c = MT.call(); return !!(c && c.mt && c.mt.organizer === S.me.id) || MT.isOrgOf(id); };
  const canMod = () => ['organizer', 'presenter'].includes(MT.myRole());
  const fail = MT.fail;
  const store = () => LC.callApi.data();
  // a panel body that survives the meeting window's redraws, so typing, focus and scrolling are kept
  function mount(host, root) {
    const old = root.parentElement, top = old ? old.scrollTop : 0, a = document.activeElement, inside = a && root.contains(a), sel = inside && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    host.append(root); queueMicrotask(() => { host.scrollTop = top; if (inside && a.isConnected) { try { a.focus({ preventScroll: true }); if (sel) a.setSelectionRange(sel[0], sel[1]); } catch {} } });
  }
  const persistent = (key, build) => { const d = store(); return (d[key] ||= build()); };
  const ago = (ts) => LC.ago(ts);

  // ---------- Q&A (call panel + meeting chat tab) ----------
  function qaView(id, o = {}) {
    let sort = 'top', items = [], mod = false, on = true, loading = false;
    const text = el('textarea', { rows: 2, maxlength: 500, placeholder: t('mt_askPh'), 'aria-label': t('mt_ask') }), anon = MT.check(t('mt_anon'), false), list = el('div', { class: 'mt-qlist', 'aria-live': 'polite' });
    const segs = el('div', { class: 'mt-seg', role: 'group', 'aria-label': t('mt_qa') }, ['top', 'recent'].map((k) => el('button', { type: 'button', class: 'mt-segb', 'data-k': k, 'aria-pressed': String(sort === k), onclick: () => { sort = k; draw(); } }, el('span', { text: k === 'top' ? t('mt_top') : t('mt_recentQ') }))));
    const op = (body) => LC.api('/api/meetings/qa', { id, ...body }).then(load).catch(fail);
    const ask = el('form', { class: 'mt-ask', onsubmit: (e) => { e.preventDefault(); if (!text.value.trim()) return; op({ op: 'ask', text: text.value, anon: anon.input.checked }); text.value = ''; } }, text, el('div', { class: 'row-between' }, anon.el, el('button', { type: 'submit', class: 'primary sm', text: t('mt_post') })));
    const item = (q) => {
      const rep = el('form', { class: 'mt-replyform hidden', onsubmit: (e) => { e.preventDefault(); const v = e.target.querySelector('input').value; if (v.trim()) op({ op: 'reply', qid: q.id, text: v }); } }, el('input', { maxlength: 500, placeholder: t('mt_replyPh'), 'aria-label': t('mt_replyPh') }), el('button', { type: 'submit', class: 'secondary sm', text: t('mt_reply') }));
      const modMenu = (e) => LC.menu(e.currentTarget, [{ icon: 'checkmark_circle', label: q.answered ? t('mt_unmarkAnswered') : t('mt_markAnswered'), fn: () => op({ op: 'answer', qid: q.id }) }, { icon: q.pinned ? 'pin_off' : 'pin', label: q.pinned ? t('mt_unpin') : t('mt_pin'), fn: () => op({ op: 'pin', qid: q.id }) }, { icon: 'eye_off', label: q.dismissed ? t('mt_restoreQ') : t('mt_dismissQ'), fn: () => op({ op: 'dismiss', qid: q.id }) }, 'sep', { icon: 'delete', label: t('mt_deleteQ'), danger: true, fn: () => op({ op: 'delete', qid: q.id }) }]);
      return el('div', { class: 'mt-q' + (q.answered ? ' answered' : '') + (q.pinned ? ' pinned' : '') + (q.dismissed ? ' dismissed' : ''), 'data-q': q.id },
        el('div', { class: 'mt-qhead' }, q.anon ? el('div', { class: 'av sm mt-anonav', 'aria-hidden': 'true' }, LC.icon('person')) : LC.avatar(S.users.get(q.by), 'sm', false), el('b', { text: q.anon ? t('mt_anonymous') + (q.mine ? ` (${t('you')})` : '') : LC.uname(q.by) }), el('span', { class: 'muted small', text: ago(q.ts) }),
          q.pinned ? el('span', { class: 'pill' }, LC.icon('pin'), t('mt_pinned')) : null, q.answered ? el('span', { class: 'pill mt-ok' }, LC.icon('checkmark'), t('mt_answered')) : null, q.dismissed ? el('span', { class: 'pill', text: t('mt_dismissed') }) : null),
        el('div', { class: 'mt-qtext', text: q.text }),
        q.replies.length ? el('div', { class: 'mt-replies' }, q.replies.map((r) => el('div', { class: 'mt-replyrow' }, el('b', { text: LC.uname(r.by) }), el('span', { text: ' ' + r.text })))) : null,
        el('div', { class: 'mt-qacts' }, el('button', { type: 'button', class: 'mt-vote' + (q.voted ? ' on' : ''), 'aria-pressed': String(q.voted), 'aria-label': (q.voted ? t('mt_upvoted') : t('mt_upvote')) + ' · ' + q.votes, onclick: () => op({ op: 'vote', qid: q.id }) }, LC.icon('thumb_like', { filled: q.voted }), el('span', { text: String(q.votes) })),
          el('button', { type: 'button', class: 'link', text: t('mt_reply'), onclick: () => { rep.classList.toggle('hidden'); rep.querySelector('input').focus(); } }),
          mod ? LC.ibtn('more_horizontal', t('moreOptions'), modMenu, { menu: true }) : q.mine ? LC.ibtn('delete', t('mt_deleteQ'), () => op({ op: 'delete', qid: q.id })) : null), rep);
    };
    function draw() {
      for (const b of segs.children) b.setAttribute('aria-pressed', String(b.dataset.k === sort));
      ask.classList.toggle('hidden', !on); const live = items.filter((q) => !q.dismissed), gone = items.filter((q) => q.dismissed);
      live.sort((a, b) => (b.pinned - a.pinned) || (sort === 'top' ? b.votes - a.votes || b.ts - a.ts : b.ts - a.ts));
      list.replaceChildren(...(!on ? [el('p', { class: 'muted small', text: t('mt_qaOff') })] : []), ...(live.length ? live.map(item) : [el('p', { class: 'muted small', text: loading ? t('loading') : t('mt_noQuestions') })]), ...(gone.length && mod ? [el('h3', { text: t('mt_dismissed') }), ...gone.map(item)] : []));
    }
    async function load() { loading = true; try { const r = await LC.api('/api/meetings/qa?id=' + id); items = r.items; mod = r.moderator; on = r.on; } catch (e) { list.replaceChildren(el('p', { class: 'err', text: e.message })); return; } loading = false; draw(); }
    const root = el('div', { class: 'mt-qa' + (o.wide ? ' wide' : '') }, ask, segs, list);
    root.refresh = load; load(); return root;
  }
  LC.on('mt_qa', (e) => { for (const n of document.querySelectorAll('.mt-qa')) if (n._mt === e.meeting && n.refresh) n.refresh(); const d = LC.inCall() && store(); if (d && d.mtqa && mid() === e.meeting) d.mtqa.refresh(); });
  LC.ext.callPanels.push({ key: 'mtqa', icon: 'chat_bubbles_question', label: t('mt_qa'), short: t('mt_qa'), order: 20, when: () => !!mid() && mtOf().qa !== false, render: (host) => { const id = mid(); mount(host, persistent('mtqa', () => Object.assign(qaView(id), { _mt: id }))); } });
  LC.ext.tabs.push({ key: 'mtqa', icon: 'chat_bubbles_question', label: () => t('mt_qa'), order: 3, when: (chan) => { const c = S.channels.get(chan); const m = c && c.kind === 'meeting' && MT.cache.get(c.meeting); return !!(c && c.kind === 'meeting' && (!m || !m.options || m.options.qa !== false)); }, render: (host, chan) => { const id = S.channels.get(chan).meeting; host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('chat_bubbles_question'), ' ' + t('mt_qa'))), Object.assign(qaView(id, { wide: true }), { _mt: id })); } });

  // ---------- polls: the chat's poll messages; everyone in the meeting gets a pop-up to vote ----------
  const pollBox = (m, o = {}) => {
    const p = m.poll, total = p.options.reduce((a, x) => a + x.v.length, 0), voted = p.options.some((x) => x.v.includes(S.me.id)), show = !p.quiz || p.closed || voted;
    return el('div', { class: 'mt-poll' + (p.closed ? ' closed' : ''), role: 'group', 'aria-label': p.q }, el('div', { class: 'mt-pq' }, LC.icon(p.quiz ? 'lightbulb' : 'poll'), el('b', { text: p.q }), p.closed ? el('span', { class: 'pill', text: t('mt_closed') }) : null),
      p.options.map((x, i) => { const pct = total ? Math.round((x.v.length / total) * 100) : 0, mine = x.v.includes(S.me.id);
        return el('button', { type: 'button', class: 'mt-popt' + (mine ? ' mine' : ''), disabled: p.closed || (p.quiz && voted), 'aria-pressed': String(mine), onclick: () => LC.api('/api/poll/vote', { id: m.id, option: i }).then(() => o.onVote && o.onVote()).catch(fail) }, show ? el('span', { class: 'mt-pbar', style: { width: pct + '%' } }) : null, el('span', { class: 'mt-pt' }, mine ? LC.icon('checkmark') : null, x.t), show ? el('span', { class: 'mt-pc', text: `${x.v.length} · ${pct}%` }) : null); }),
      el('div', { class: 'row-between small muted' }, el('span', { text: t('mt_votesN', { n: total }) }), !p.closed && (m.from === S.me.id || LC.isAdmin()) ? el('button', { type: 'button', class: 'link', text: t('mt_closePoll'), onclick: () => LC.api('/api/poll/close', { id: m.id }).catch(fail) }) : null));
  };
  function pollsView(chan) {
    let polls = null; const list = el('div', { class: 'mt-plist' }), form = el('form', { class: 'mt-pform hidden' });
    const q = el('input', { maxlength: 200, placeholder: t('mt_pollQ'), 'aria-label': t('mt_pollQ') }), opts = [1, 2, 3, 4].map((n) => el('input', { maxlength: 100, placeholder: t('mt_pollOpt', { n }), 'aria-label': t('mt_pollOpt', { n }) })), multi = MT.check(t('mt_multi'), false);
    form.append(q, ...opts, multi.el, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary sm', text: t('cancel'), onclick: () => form.classList.add('hidden') }), el('button', { type: 'submit', class: 'primary sm', text: t('mt_launch') })));
    form.onsubmit = (e) => { e.preventDefault(); const o = opts.map((x) => x.value.trim()).filter(Boolean); if (!q.value.trim() || o.length < 2) return LC.toast(t('mt_pollNeeds')); LC.api('/api/send', { chan, text: '', poll: { q: q.value, options: o, multi: multi.input.checked } }).then(() => { q.value = ''; opts.forEach((x) => { x.value = ''; }); form.classList.add('hidden'); }).catch(fail); };
    const draw = () => list.replaceChildren(...(!polls ? [el('p', { class: 'muted small', text: t('loading') })] : polls.length ? polls.map((m) => pollBox(m)) : [el('p', { class: 'muted small', text: t('mt_noPolls') })]));
    const load = async () => { try { polls = (await LC.api(`/api/search?has=poll&chan=${encodeURIComponent(chan)}`)).results; } catch { polls = []; } draw(); };
    const root = el('div', { class: 'mt-polls' }, el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { form.classList.remove('hidden'); q.focus(); } }, LC.icon('add'), el('span', { text: t('mt_newPoll') })), form, list);
    root.chan = chan; root.update = (m) => { if (!polls) return; const i = polls.findIndex((x) => x.id === m.id); if (i >= 0) polls[i] = m; else if (m.poll) polls.unshift(m); draw(); };
    load(); return root;
  }
  LC.ext.callPanels.push({ key: 'mtpolls', icon: 'poll', label: t('mt_polls'), short: t('mt_polls'), order: 22, when: () => !!mid(), render: (host) => mount(host, persistent('mtpolls', () => pollsView(LC.callChan()))) });
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  function pollPopup(m) {
    closePop(); const done = () => { setTimeout(closePop, 2500); };
    pop = el('div', { class: 'mt-pollpop', role: 'dialog', 'aria-label': t('mt_pollPop') }, el('div', { class: 'row-between' }, el('b', {}, LC.icon('poll'), ' ' + t('mt_pollPop') + ' · ' + LC.uname(m.from)), LC.ibtn('dismiss', t('mt_dismiss'), closePop)), pollBox(m, { onVote: done }));
    pop.dataset.id = m.id; document.body.append(pop); const b = pop.querySelector('.mt-popt'); if (b) b.focus();
  }
  LC.on('message', (m) => {
    if (!m.poll || !LC.inCall() || m.chan !== LC.callChan()) return; const d = store(); if (d.mtpolls) d.mtpolls.update(m);
    if (m.from !== S.me.id && !m.poll.closed) pollPopup(m);
  });
  LC.on('update', (m) => { if (!m.poll || !LC.inCall() || m.chan !== LC.callChan()) return; const d = store(); if (d.mtpolls) d.mtpolls.update(m); if (pop && pop.dataset.id === m.id) { const box = pop.querySelector('.mt-poll'); if (box) box.replaceWith(pollBox(m, { onVote: () => setTimeout(closePop, 2500) })); if (m.poll.closed) setTimeout(closePop, 2500); } });
  LC.on('call:left', closePop);

  // ---------- notes: agenda + the meeting chat's shared note (stored by the apps area: /api/collab, /api/note) ----------
  function notesView(id, chan) {
    let agenda = [], note = { text: '', v: 0 }, dirty = false, saving = false;
    const alist = el('div', { class: 'mt-agenda' }), aText = el('input', { maxlength: 200, placeholder: t('mt_addAgenda'), 'aria-label': t('mt_addAgenda') }), aMin = el('input', { type: 'number', min: 0, max: 480, placeholder: t('mt_mins'), 'aria-label': t('mt_mins'), class: 'mt-num' });
    const ta = el('textarea', { class: 'mt-notearea', rows: 8, placeholder: t('mt_notesPh'), 'aria-label': t('mt_sharedNotes') }), status = el('span', { class: 'muted small' });
    const op = (b) => LC.api('/api/meetings/agenda', { id, ...b }).then((r) => { agenda = r.agenda; drawA(); }).catch(fail);
    const drawA = () => alist.replaceChildren(...(agenda.length ? agenda.map((a, i) => el('div', { class: 'mt-aitem' + (a.done ? ' done' : '') }, el('input', { type: 'checkbox', checked: a.done, 'aria-label': a.text, onchange: () => op({ op: 'toggle', aid: a.id }) }), el('span', { class: 'grow', text: a.text }), a.mins ? el('span', { class: 'pill', text: a.mins + ' ' + t('mt_mins') }) : null,
      i > 0 ? LC.ibtn('arrow_up', t('mt_moveUp'), () => op({ op: 'move', aid: a.id, by: -1 })) : null, i < agenda.length - 1 ? LC.ibtn('arrow_down', t('mt_moveDown'), () => op({ op: 'move', aid: a.id, by: 1 })) : null, LC.ibtn('delete', t('delete'), () => op({ op: 'del', aid: a.id })))) : [el('p', { class: 'muted small', text: t('mt_noAgenda') })]));
    const setStatus = () => { status.textContent = note.v ? t('mt_savedBy', { name: LC.uname(note.by) }) : ''; };
    const save = LC.debounce(async () => {
      if (saving) return save(); saving = true; status.textContent = t('mt_saving');
      try { const r = await LC.api('/api/note', { chan, text: ta.value, v: note.v }); note = r.note; dirty = false; setStatus(); }
      catch (e) { if (e.status === 409 && e.data && e.data.note) { note = e.data.note; ta.value = note.text; dirty = false; LC.toast(t('mt_conflict', { name: LC.uname(note.by) }), { ms: 4000 }); setStatus(); } else fail(e); }
      saving = false;
    }, 900);
    ta.addEventListener('input', () => { dirty = true; status.textContent = t('typing'); save(); });
    const root = el('div', { class: 'mt-notes' }, el('h3', {}, LC.icon('text_bullet_list_ltr'), ' ' + t('mt_agenda')), alist, el('form', { class: 'mt-aform', onsubmit: (e) => { e.preventDefault(); if (!aText.value.trim()) return; op({ op: 'add', text: aText.value, mins: Number(aMin.value) || 0 }); aText.value = ''; aMin.value = ''; } }, aText, aMin, el('button', { type: 'submit', class: 'secondary sm', text: t('add') })),
      el('div', { class: 'row-between' }, el('h3', {}, LC.icon('note'), ' ' + t('mt_sharedNotes')), status), ta);
    root.setAgenda = (a) => { agenda = a; drawA(); }; root.onNote = (n) => { if (n.chan !== chan) return; if (!dirty) { note = n.note; ta.value = note.text; setStatus(); } };
    LC.api('/api/meetings/agenda?id=' + id).then((r) => { agenda = r.agenda; drawA(); }).catch(() => drawA());
    LC.api('/api/collab?chan=' + encodeURIComponent(chan)).then((r) => { note = r.note || note; if (!dirty) ta.value = note.text || ''; setStatus(); }).catch(() => {});
    return root;
  }
  LC.ext.callPanels.push({ key: 'mtnotes', icon: 'note_edit', label: t('mt_notes'), short: t('mt_notes'), order: 24, when: () => !!mid(), render: (host) => mount(host, persistent('mtnotes', () => notesView(mid(), LC.callChan()))) });
  LC.on('mt_agenda', (e) => { const d = LC.inCall() && store(); if (d && d.mtnotes && mid() === e.meeting) d.mtnotes.setAgenda(e.agenda); });
  LC.on('note', (n) => { const d = LC.inCall() && store(); if (d && d.mtnotes) d.mtnotes.onNote(n); });

  // ---------- breakout rooms ----------
  MT.rooms = new Map(); // meetingId -> state
  const roomsOf = (id) => MT.rooms.get(id) || { open: false, rooms: [] };
  const fmtLeft = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const loadRooms = (id) => LC.api('/api/meetings/rooms?id=' + id).then((r) => { MT.rooms.set(id, r.state); LC.callApi.redraw(); }).catch(() => {});
  LC.on('mt_rooms', (e) => { MT.rooms.set(e.meeting, e.state); if (LC.inCall()) LC.callApi.redraw(); });
  LC.on('call:joined', () => { const id = mid(); if (id) loadRooms(id); });
  const roomOp = (id, b) => LC.api('/api/meetings/rooms', { id, ...b }).then((r) => { MT.rooms.set(id, r.state); LC.callApi.redraw(); return r; }).catch(fail);
  function roomsPanel(host) {
    const id = mid(), st = roomsOf(id), org = isOrg(id), chan = LC.callChan(), inRoom = (S.channels.get(chan) || {}).kind === 'breakout', mine = st.rooms.find((r) => r.members.includes(S.me.id));
    const d = store(); if (!d.mtRoomsAsked) { d.mtRoomsAsked = true; loadRooms(id); }
    if (st.open && st.closesAt) host.append(el('p', { class: 'mt-timer', role: 'timer', 'aria-live': 'off', text: t('mt_closesIn', { t: fmtLeft(st.closesAt - Date.now()) }) }));
    if (!org) {
      host.append(el('p', { class: 'muted small', text: st.open ? t('mt_roomsOpen') : t('mt_roomsClosed') }));
      if (mine && st.open) host.append(el('p', { text: t('mt_youInRoom', { room: mine.name }) }), el('div', { class: 'acts' }, inRoom ? el('button', { type: 'button', class: 'secondary sm', text: t('mt_backMain'), onclick: () => MT.moveTo(MT.cache.get(id) ? MT.cache.get(id).chan : (S.channels.get(chan) || {}).parent) }) : el('button', { type: 'button', class: 'primary sm', text: t('mt_goRoom'), onclick: () => MT.moveTo(mine.chan) })));
      return;
    }
    if (!st.rooms.length) {
      const n = el('input', { type: 'number', min: 1, max: 20, value: 2, 'aria-label': t('mt_roomsN'), class: 'mt-num' }); let auto = true;
      const r1 = el('input', { type: 'radio', name: 'mtauto', checked: true, onchange: () => { auto = true; } }), r2 = el('input', { type: 'radio', name: 'mtauto', onchange: () => { auto = false; } });
      host.append(el('p', { class: 'muted small', text: t('mt_roomsHelp') }), MT.field(t('mt_roomsN'), n), el('label', { class: 'check' }, r1, el('span', { text: t('mt_auto') })), el('label', { class: 'check' }, r2, el('span', { text: t('mt_manual') })), el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary sm', text: t('mt_createRooms'), onclick: () => roomOp(id, { op: 'create', n: Number(n.value) || 2, auto }) })));
      return;
    }
    const assigned = new Set(st.rooms.flatMap((r) => r.members)), here = (MT.call() || { participants: [] }).participants.filter((u) => u !== S.me.id && !assigned.has(u));
    const mover = (uid, cur) => MT.select([['-1', t('mt_unassigned')], ...st.rooms.map((r, i) => [String(i), r.name])], String(cur), t('mt_moveTo', { name: LC.uname(uid) }), (v) => roomOp(id, { op: 'assign', assign: { [uid]: Number(v) } }));
    host.append(el('p', { class: 'mt-rstate' + (st.open ? ' on' : '') }, LC.icon(st.open ? 'door_arrow_right' : 'door'), ' ' + (st.open ? t('mt_roomsOpen') : t('mt_roomsClosed'))),
      ...st.rooms.map((r, i) => el('div', { class: 'mt-room' }, el('div', { class: 'row-between' }, el('b', { text: `${r.name} (${r.members.length})` }), el('span', {}, LC.ibtn('edit', t('mt_rename') + ' ' + r.name, async () => { const v = await LC.prompt(t('mt_roomName'), { value: r.name, max: 40 }); if (v && v.trim()) roomOp(id, { op: 'rename', room: i, name: v }); }), st.open ? el('button', { type: 'button', class: 'secondary sm', text: t('mt_joinRoom'), 'aria-label': t('mt_joinRoom') + ' ' + r.name, onclick: () => MT.moveTo(r.chan) }) : null)),
        r.live.length ? el('div', { class: 'small mt-live' }, LC.icon('circle', { filled: true }), ' ' + r.live.map(LC.uname).join(', ')) : null, ...r.members.map((uid) => el('div', { class: 'mt-rp' }, LC.avatar(S.users.get(uid), 'sm', false), el('span', { class: 'grow', text: LC.uname(uid) }), mover(uid, i))))),
      here.length ? el('div', { class: 'mt-room' }, el('b', { text: `${t('mt_unassigned')} (${here.length})` }), ...here.map((uid) => el('div', { class: 'mt-rp' }, LC.avatar(S.users.get(uid), 'sm', false), el('span', { class: 'grow', text: LC.uname(uid) }), mover(uid, -1)))) : null);
    if (!st.open) {
      const timer = MT.select([['0', t('mt_noLimit')], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['30', '30 min'], ['60', '60 min']], '0', t('mt_timer'));
      host.append(MT.field(t('mt_timer'), timer), el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary sm', text: t('mt_reassign'), onclick: () => roomOp(id, { op: 'auto' }) }), el('button', { type: 'button', class: 'secondary sm danger', text: t('mt_deleteRooms'), onclick: () => roomOp(id, { op: 'delete' }) }), el('button', { type: 'button', class: 'primary sm', text: t('mt_openRooms'), onclick: () => roomOp(id, { op: 'open', minutes: Number(timer.value) }) })));
    } else {
      const ann = persistent('mtAnn', () => { const i = el('input', { maxlength: 300, placeholder: t('mt_announcePh'), 'aria-label': t('mt_announce') }); return el('form', { class: 'mt-annform', onsubmit: (e) => { e.preventDefault(); if (!i.value.trim()) return; roomOp(id, { op: 'announce', text: i.value }).then(() => { i.value = ''; }); } }, i, el('button', { type: 'submit', class: 'secondary sm', text: t('mt_sendAnn') })); });
      const timer = MT.select([['', t('mt_timer')], ['0', t('mt_noLimit')], ['1', '1 min'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['30', '30 min']], '', t('mt_timer'), (v) => v !== '' && roomOp(id, { op: 'timer', minutes: Number(v) }));
      const annWrap = el('div', {}); mount(annWrap, ann);
      host.append(el('h3', {}, LC.icon('megaphone'), ' ' + t('mt_announce')), annWrap, MT.field(t('mt_timer'), timer), el('div', { class: 'acts' }, inRoom ? el('button', { type: 'button', class: 'secondary sm', text: t('mt_backMain'), onclick: () => MT.moveTo((S.channels.get(chan) || {}).parent) }) : null, el('button', { type: 'button', class: 'primary sm danger', text: t('mt_closeRooms'), onclick: () => roomOp(id, { op: 'close' }) })));
    }
  }
  LC.ext.callPanels.push({ key: 'mtrooms', icon: 'people_audience', label: t('mt_roomsTitle'), short: t('mt_rooms'), order: 26, when: () => { const id = mid(); if (!id) return false; return isOrg(id) || roomsOf(id).open || (S.channels.get(LC.callChan()) || {}).kind === 'breakout'; }, render: roomsPanel });
  setInterval(() => { const id = LC.inCall() && mid(); if (id && roomsOf(id).open && roomsOf(id).closesAt && LC.callApi.panel() === 'mtrooms') { const n = document.querySelector('#callUI .mt-timer'); if (n) n.textContent = t('mt_closesIn', { t: fmtLeft(roomsOf(id).closesAt - Date.now()) }); } }, 1000);
  // moving between the main meeting and a room: leave one call, join the other without the screens in between
  const waitChan = async (chan) => { for (let i = 0; i < 40 && !S.channels.has(chan); i++) await new Promise((r) => setTimeout(r, 100)); return S.channels.has(chan); };
  MT.moveTo = async (chan) => {
    if (!chan) return; if (LC.callChan() === chan) return LC.showCall();
    const me = LC.callApi.me || { cam: false, mic: true }; MT.moving = { chan, opts: { cam: !!me.cam, muted: !me.mic } };
    if (LC.inCall()) await LC.leaveCall();
    if (!(await waitChan(chan))) { MT.moving = null; return; }
    await LC.openChat(chan); if (S.calls[chan]) LC.joinCall(chan, 'video'); else LC.startCall(chan, 'video');
  };
  LC.on('mt_move', (e) => {
    const cur = LC.inCall() ? LC.callChan() : null, ch = cur && S.channels.get(cur), inMain = cur && (S.calls[cur] || {}).meeting === e.meeting && !(ch && ch.kind === 'breakout'), inRoom = ch && ch.kind === 'breakout' && ch.meeting === e.meeting;
    if (e.reason === 'open') { if (inMain || inRoom) { LC.toast(t('mt_movedTo', { room: e.name || '' }), { ms: 3000 }); MT.moveTo(e.to); } else LC.toast(t('mt_assigned', { room: e.name || '' }), { ms: 15000, action: { label: t('mt_join'), fn: () => MT.moveTo(e.to) } }); }
    else if (inRoom) { LC.toast(t('mt_movedBack'), { ms: 3000 }); MT.moveTo(e.to); }
  });
  LC.on('mt_announce', (e) => { LC.toast((e.warn ? '' : t('mt_announcement') + ' · ' + LC.uname(e.from) + ': ') + e.text, { ms: 10000 }); LC.playSound('ping'); });

  // ---------- attendance report + recap ----------
  const fmtMs = (ms) => MT.dur(ms);
  MT.attendance = async (id, occ) => {
    let r; try { r = await LC.api(`/api/meetings/attendance?id=${id}&occ=${encodeURIComponent(occ)}`); } catch (e) { return fail(e); }
    const csv = async () => { try { const res = await fetch(`/api/meetings/attendance?id=${id}&occ=${encodeURIComponent(occ)}&format=csv`, { headers: { 'x-token': S.token } }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText); const b = await res.blob(), a = el('a', { href: URL.createObjectURL(b), download: 'attendance.csv' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch (e) { fail(e); } };
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('people'), ' ' + t('mt_attReport')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted', text: MT.fmtDay(r.start) + ' ' + LC.fmtTime(r.start) + (r.end ? ' – ' + LC.fmtTime(r.end) + ' · ' + fmtMs(r.end - r.start) : ' · ' + t('mt_live')) }),
      r.people.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'table mt-att' }, el('thead', {}, el('tr', {}, [t('col_person'), t('mt_firstJoin'), t('mt_lastLeave'), t('mt_inMeetingTime')].map((h) => el('th', { text: h })))), el('tbody', {}, r.people.map((p) => el('tr', {}, el('td', {}, el('div', { class: 'rowline' }, LC.avatar(S.users.get(p.uid), 'sm', false), el('span', { text: p.name }))), el('td', { text: LC.fmtTime(p.first) }), el('td', { text: p.here ? t('mt_stillHere') : LC.fmtTime(p.last) }), el('td', { text: fmtMs(p.ms) })))))) : el('p', { class: 'muted', text: t('mt_noAttendance') }),
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary withicon', onclick: csv }, LC.icon('arrow_download'), el('span', { text: t('mt_csv') })), el('button', { type: 'button', class: 'primary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
  };
  async function recapContent(id, occ, onPick) {
    const r = await LC.api(`/api/meetings/recap?id=${id}${occ ? '&occ=' + encodeURIComponent(occ) : ''}`), m = await MT.get(id).catch(() => null), org = m && m.isOrganizer;
    const sec = (icon, title, nodes) => el('section', { class: 'mt-rsec' }, el('h3', {}, LC.icon(icon), ' ' + title), ...(nodes.length ? nodes : [el('p', { class: 'muted small', text: t('mt_nothing') })]));
    const pick = r.sessions.length > 1 ? MT.select(r.sessions.map((s) => [s.occ, MT.fmtDay(s.start) + ' ' + LC.fmtTime(s.start)]), r.occ, t('mt_session'), (v) => onPick(v)) : null;
    const note = el('div', { class: 'mt-recapnote' }); LC.api('/api/collab?chan=' + encodeURIComponent(m ? m.chan : '')).then((c) => { note.replaceChildren(c.note && c.note.text ? el('div', { class: 'mt-detailstext' }, LC.renderText(c.note.text)) : el('p', { class: 'muted small', text: t('mt_nothing') })); }).catch(() => note.replaceChildren(el('p', { class: 'muted small', text: t('mt_nothing') })));
    if (!r.sessions.length) return [el('p', { class: 'muted', text: t('mt_noRecap') })];
    return [el('div', { class: 'mt-rhead' }, el('div', {}, el('b', { text: MT.fmtDay(r.start) + ' · ' + LC.fmtTime(r.start) }), el('div', { class: 'muted small', text: (r.ongoing ? t('mt_live') : t('mt_duration') + ': ' + fmtMs(r.duration)) + ' · ' + t('mt_attendeesN', { n: r.attendees }) })), pick, org ? el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => MT.attendance(id, r.occ) }, LC.icon('people'), el('span', { text: t('mt_attReport') })) : null),
      ...(r.recordings.length ? [sec('record', t('mt_recordings'), r.recordings.flatMap((x) => (x.files || []).map((f) => el('div', { class: 'mt-rec' }, el('video', { src: LC.fileUrl(f, true), controls: true, preload: 'metadata', 'aria-label': f.name }), el('a', { href: LC.fileUrl(f), download: f.name, text: f.name })))))] : []),
      sec('people', t('mt_attendance'), [el('div', { class: 'mt-chips' }, r.attendance.map((p) => el('span', { class: 'mt-chip' }, LC.avatar(S.users.get(p.uid), 'sm', false), el('span', { text: p.name + (p.ms !== undefined ? ' · ' + fmtMs(p.ms) : '') }))))]),
      sec('text_bullet_list_ltr', t('mt_agenda'), r.agenda.map((a) => el('div', { class: 'mt-aitem' + (a.done ? ' done' : '') }, LC.icon(a.done ? 'checkmark_circle' : 'circle'), el('span', { text: a.text })))),
      sec('note', t('mt_sharedNotes'), [note]),
      sec('chat_bubbles_question', t('mt_qa'), r.qa.map((q) => el('div', { class: 'mt-q' + (q.answered ? ' answered' : '') }, el('div', { class: 'mt-qhead' }, el('b', { text: q.anon ? t('mt_anonymous') : LC.uname(q.by) }), el('span', { class: 'muted small', text: t('mt_votesN', { n: q.votes }) }), q.answered ? el('span', { class: 'pill mt-ok', text: t('mt_answered') }) : null), el('div', { text: q.text }), ...q.replies.map((x) => el('div', { class: 'mt-replyrow small' }, el('b', { text: LC.uname(x.by) }), ' ' + x.text))))),
      sec('poll', t('mt_polls'), r.polls.map((m2) => pollBox(m2))),
      sec('folder', t('mt_filesShared'), r.files.map((f) => el('div', { class: 'mt-file' }, LC.icon('document'), el('a', { href: LC.fileUrl(f), download: f.name, text: f.name }), el('span', { class: 'muted small', text: LC.fmtSize(f.size || 0) + ' · ' + LC.uname(f.from) })))),
      sec('chat', t('mt_messagesDuring'), r.messages.slice(-60).map((x) => el('div', { class: 'mt-rmsg' }, el('b', { text: LC.uname(x.from) }), el('span', { class: 'muted small', text: ' ' + LC.fmtTime(x.ts) + ' ' }), el('div', { text: LC.snippet(x) }))))];
  }
  MT.recap = async (id, occ) => {
    const box = el('div', { class: 'mt-recap' }, el('p', { class: 'muted', text: t('loading') }));
    const draw = async (o) => { try { box.replaceChildren(...(await recapContent(id, o, draw))); } catch (e) { box.replaceChildren(el('p', { class: 'err', text: e.message })); } };
    const m = await MT.get(id).catch(() => null);
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('clipboard_task'), ' ' + t('mt_recapTitle') + (m ? ' · ' + m.title : '')), LC.ibtn('dismiss', t('close'), LC.closeModal)), box], { wide: true }); draw(occ);
  };
  LC.ext.tabs.push({ key: 'mtrecap', icon: 'clipboard_task', label: () => t('mt_recapTitle'), order: 2, when: (chan) => (S.channels.get(chan) || {}).kind === 'meeting', render: async (host, chan) => {
    const id = S.channels.get(chan).meeting, box = el('div', { class: 'mt-recap' }, el('p', { class: 'muted', text: t('loading') }));
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('clipboard_task'), ' ' + t('mt_recapTitle'))), box);
    const draw = async (o) => { try { box.replaceChildren(...(await recapContent(id, o, draw))); } catch (e) { box.replaceChildren(el('p', { class: 'err', text: e.message })); } }; draw();
  } });

  // ---------- meeting info, options, roles, add a device (the meeting window's "More" menu) ----------
  MT.addDevice = async (id) => {
    let code, info; try { code = (await LC.api('/api/handoff', {})).code; info = await LC.api('/api/info'); } catch (e) { return fail(e); }
    const u = info.urls && info.urls[0], base = u ? (info.https && u.secureUrl) || u.url : location.origin, url = `${base}/#h=${code}&meet=${id}&companion=1`;
    const qr = el('div', { class: 'qr', role: 'img', 'aria-label': t('mt_addDeviceTitle') }); try { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr.append(new DOMParser().parseFromString(q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }), 'image/svg+xml').documentElement); } catch {}
    LC.modal([el('h2', {}, LC.icon('phone_laptop'), ' ' + t('mt_addDeviceTitle')), el('p', { class: 'muted small', text: t('mt_addDeviceHelp') }), qr, el('div', { class: 'addr' }, el('code', { class: 'mt-linktext', text: url })), el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary', text: t('done'), onclick: LC.closeModal }))]);
  };
  MT.infoDialog = async (id) => {
    let m; try { m = await MT.get(id, true); } catch (e) { return fail(e); } const link = await MT.link(id);
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('info'), ' ' + t('mt_info')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('b', { text: m.title }), el('p', { class: 'muted', text: MT.whenText(m) }), m.code ? MT.joinInfo(m, link) : null, el('p', { class: 'small', text: t('mt_role', { role: t('mt_' + (MT.myRole() === 'organizer' ? 'organizer' : MT.myRole() === 'presenter' ? 'presenter' : 'attendee')) }) }),
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary withicon', onclick: () => MT.addDevice(id) }, LC.icon('phone_laptop'), el('span', { text: t('mt_addDevice') })), el('button', { type: 'button', class: 'secondary', text: t('mt_viewDetails'), onclick: () => LC.meetings.open(id) }), el('button', { type: 'button', class: 'primary', text: t('done'), onclick: LC.closeModal }))]);
  };
  MT.optionsDialog = async (id) => {
    let m; try { m = await MT.get(id, true); } catch (e) { return fail(e); } const o = m.options || {};
    const lobby = MT.select([['', t('mt_lMembers')], ['everyone', t('mt_lEveryone')], ['members', t('mt_lMembers')], ['invited', t('mt_lInvited')], ['organizer', t('mt_lOrganizer')]], m.lobby || '', t('mt_lobbyQ'));
    const present = MT.select([['everyone', t('mt_pEveryone')], ['specific', t('mt_pSpecific')], ['organizer', t('mt_pOrganizer')]], o.present || 'everyone', t('mt_presentQ'));
    const chat = MT.select([['on', t('mt_chatOn')], ['off', t('mt_chatOff')], ['during', t('mt_chatDuring')]], o.chat || 'on', t('mt_chatQ'));
    const qa = MT.check(t('mt_qaOpt'), o.qa !== false), sounds = MT.check(t('mt_soundsOpt'), o.sounds !== false), viewOnly = MT.check(t('mt_viewOnly'), o.viewOnly), record = MT.check(t('mt_recordOpt'), o.record !== false);
    const parts = ((S.calls[m.chan] || {}).participants || []).filter((u) => u !== m.organizer), roles = (S.calls[m.chan] || {}).roles || {};
    const roleRows = parts.length ? parts.map((uid) => el('div', { class: 'mt-person' }, LC.avatar(S.users.get(uid), 'sm', false), el('span', { class: 'grow', text: LC.uname(uid) }), MT.select([['presenter', t('mt_presenter')], ['attendee', t('mt_attendee')]], roles[uid] || 'attendee', t('mt_roles') + ' · ' + LC.uname(uid), (v) => LC.api('/api/meetings/role', { id, uid, role: v }).catch(fail)))) : [el('p', { class: 'muted small', text: t('mt_noOneHere') })];
    const save = () => LC.api('/api/meetings/update', { id, lobby: lobby.value, options: { present: present.value, chat: chat.value, qa: qa.input.checked, sounds: sounds.input.checked, viewOnly: viewOnly.input.checked, record: record.input.checked } }).then(() => { LC.closeModal(); LC.toast(t('mt_optSaved'), { ms: 1500 }); }).catch(fail);
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('settings'), ' ' + t('mt_optionsTitle')), LC.ibtn('dismiss', t('close'), LC.closeModal)), MT.field(t('mt_lobbyQ'), lobby), MT.field(t('mt_presentQ'), present), MT.field(t('mt_chatQ'), chat), qa.el, sounds.el, record.el, viewOnly.el,
      el('h3', {}, LC.icon('people'), ' ' + t('mt_roles')), ...roleRows, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('save'), onclick: save }))], { wide: true });
  };
  LC.ext.callMore.push(() => {
    const id = mid(); if (!id) return [];
    const occ = mtOf().occ, org = isOrg(id);
    return [{ icon: 'info', label: t('mt_info'), fn: () => MT.infoDialog(id) }, org ? { icon: 'settings', label: t('mt_optionsTitle'), fn: () => MT.optionsDialog(id) } : null, org && occ ? { icon: 'people', label: t('mt_attReport'), fn: () => MT.attendance(id, occ) } : null, { icon: 'clipboard_task', label: t('mt_recapTitle'), fn: () => MT.recap(id, occ) }, { icon: 'phone_laptop', label: t('mt_addDevice'), fn: () => MT.addDevice(id) }].filter(Boolean);
  });
})();
