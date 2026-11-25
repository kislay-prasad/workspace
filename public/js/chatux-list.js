'use strict';
// Chat list (chatux area): Teams-style list with filter chips, your own sections (drag and drop), drafts, notes to self,
// meeting chats, chats marked unread, deleted 1:1 chats, group pictures, "New chat" with a To: box, group chat info.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_filterChats: 'Filter chats', cx_filterByName: 'Filter by name', cx_fUnread: 'Unread', cx_fChats: 'Chats', cx_fChannels: 'Channels', cx_fMeetings: 'Meetings', cx_fMuted: 'Muted', cx_fDrafts: 'Drafts',
    cx_noFilterResults: 'Nothing matches this filter.', cx_clearFilter: 'Clear filter', cx_draft: 'Draft:', cx_newChat: 'New chat', cx_to: 'To:', cx_toPh: 'Enter a name', cx_groupNameOpt: 'Group name (optional)',
    cx_firstMsg: 'Type your first message (optional)', cx_startChat: 'Start chat', cx_addSomeone: 'Add at least one person.', cx_removePerson: 'Remove {name}', cx_suggestions: 'Suggestions', cx_moreChatOpts: 'More chat list options',
    cx_newSection: 'New section', cx_sectionName: 'Section name', cx_renameSection: 'Rename section', cx_deleteSection: 'Delete section', cx_confirmDeleteSection: 'Delete the section “{name}”? Its chats go back to the list.',
    cx_sectionOptions: 'Section options', cx_moveTo: 'Move to…', cx_moveToPinned: 'Pinned', cx_removeFromSection: 'Remove from section', cx_markRead: 'Mark as read', cx_leaveChat: 'Leave chat', cx_confirmLeaveChat: 'Leave this chat? You will stop getting its messages.',
    cx_deleteChat: 'Delete chat', cx_confirmHideChat: 'Delete this chat? It disappears from your list and its history is removed for you. The other person keeps their copy. It comes back if a new message arrives.',
    cx_deleteForAll: 'Delete chat for everyone', cx_confirmDeleteGroup: 'Delete “{name}” for everyone? All its messages and files are removed. This can’t be undone.', cx_renameChat: 'Rename chat', cx_chatName: 'Chat name', cx_changePic: 'Change picture', cx_removePic: 'Remove picture',
    cx_picFailed: "Couldn't use that picture.", cx_groupInfo: 'Group chat', cx_members: 'Members ({n})', cx_addPeople: 'Add people', cx_pickPeople: 'Choose people to add', cx_histLabel: 'Chat history they can see', cx_histNone: "Don't include chat history",
    cx_histDays: 'Include history from the past number of days:', cx_histDaysN: 'Number of days', cx_histAll: 'Include all chat history', cx_creator: 'Created the chat', cx_followed: 'Followed threads', cx_meetingChat: 'Meeting chat', cx_moveUpSec: 'Move section up', cx_moveDownSec: 'Move section down',
    cx_dragHint: 'Drag chats here', cx_options: 'Options', cx_peopleN: '{n} people', cx_noOneToAdd: 'Everyone is already here.',
  });
  LC.addStrings('hi', { cx_fUnread: 'अपठित', cx_fChats: 'चैट', cx_fChannels: 'चैनल', cx_fMeetings: 'मीटिंग', cx_fMuted: 'म्यूट', cx_fDrafts: 'ड्राफ़्ट', cx_draft: 'ड्राफ़्ट:', cx_newChat: 'नई चैट', cx_to: 'प्रति:', cx_startChat: 'चैट शुरू करें', cx_newSection: 'नया सेक्शन', cx_leaveChat: 'चैट छोड़ें', cx_deleteChat: 'चैट हटाएँ', cx_addPeople: 'लोगों को जोड़ें', cx_filterChats: 'चैट फ़िल्टर करें' });
  LC.addStrings('es', { cx_filterChats: 'Filtrar chats', cx_filterByName: 'Filtrar por nombre', cx_fUnread: 'No leídos', cx_fChats: 'Chats', cx_fChannels: 'Canales', cx_fMeetings: 'Reuniones', cx_fMuted: 'Silenciados', cx_fDrafts: 'Borradores', cx_draft: 'Borrador:', cx_newChat: 'Nuevo chat', cx_to: 'Para:', cx_toPh: 'Escribe un nombre', cx_groupNameOpt: 'Nombre del grupo (opcional)', cx_startChat: 'Iniciar chat', cx_newSection: 'Nueva sección', cx_moveTo: 'Mover a…', cx_markRead: 'Marcar como leído', cx_leaveChat: 'Salir del chat', cx_deleteChat: 'Eliminar chat', cx_renameChat: 'Cambiar nombre del chat', cx_changePic: 'Cambiar imagen', cx_addPeople: 'Agregar personas', cx_histNone: 'No incluir el historial del chat', cx_histAll: 'Incluir todo el historial del chat', cx_followed: 'Conversaciones seguidas' });

  const cx = () => S.cx;
  const lbl = (x) => (typeof x === 'function' ? x() : x);
  const fail = (e) => LC.toast(e.message || String(e));
  const typeOf = (c) => (c.kind === 'meeting' ? 'meeting' : c.members && (!c.kind || c.kind === 'group') ? 'group' : 'channel');
  const draftOf = (id) => { const v = LC.ls.get('lc_draft:' + id + ':', ''); return typeof v === 'string' ? v.trim() : ''; };
  const isHidden = (id) => { const h = cx().hidden[id]; return !!h && !(S.last[id] && S.last[id].ts > h); };
  const lastTs = (e) => (S.last[e.id] ? S.last[e.id].ts : 0);

  // ---------- entries: { id, kind: 'dm'|'group'|'channel' (as before), type: 'self'|'dm'|'group'|'meeting'|'channel', c?, u? } ----------
  function chatEntries() {
    const prefs = LC.prefs(), pinned = prefs.pinnedChats || [], archived = new Set(prefs.archived || []);
    const chans = [...S.channels.values()].map((c) => ({ id: c.id, kind: c.members ? 'group' : 'channel', type: typeOf(c), c, team: !!c.team }));
    const people = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed && !u.deleted).map((u) => ({ id: LC.dmId(S.me.id, u.id), kind: 'dm', type: 'dm', u }));
    const self = { id: LC.dmId(S.me.id, S.me.id), kind: 'dm', type: 'self', u: S.users.get(S.me.id) || S.me, self: true };
    const all = new Map([...chans, self, ...people].map((e) => [e.id, e]));
    for (const e of all.values()) e.hidden = (e.kind === 'dm') && isHidden(e.id);
    return { all, pinned: pinned.map((id) => all.get(id)).filter(Boolean), archived, chans, people, self };
  }
  LC.chatEntries = chatEntries;
  const entryName = (e) => (e.self ? `${LC.uname(S.me.id)} ${t('cx_you')}` : e.kind === 'dm' ? LC.uname(e.u.id) : e.c.name);
  LC.entryName = entryName;

  // ---------- the picture in front of a chat: person, group (picture or icon), meeting (calendar), channel tile ----------
  const PALETTE = ['#5b5fc7', '#038387', '#c239b3', '#ca5010', '#498205', '#0078d4', '#986f0b', '#d13438', '#4f6bed', '#7a5af5'];
  const colorOf = (id) => PALETTE[[...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  LC.chatPicUrl = (c) => `/api/chatux/chat/picture?chan=${encodeURIComponent(c.id)}&v=${c.chatPic}&token=${encodeURIComponent(S.token)}`;
  LC.chatLead = (id, size = '') => {
    const i = LC.chanInfo(id);
    if (i.kind === 'dm') return LC.avatar(i.peer, size, !LC.isSelfChat(id));
    const c = i.c || {}, type = c.id ? typeOf(c) : 'channel';
    if (c.chatPic) return el('div', { class: 'av tile group ' + size, 'aria-hidden': 'true', style: `background:${colorOf(id)}` }, el('img', { src: LC.chatPicUrl(c), alt: '' }));
    if (type === 'meeting') return el('div', { class: 'av tile cx-meet ' + size, 'aria-hidden': 'true' }, LC.icon('calendar_ltr', { filled: true }));
    if (i.kind === 'group') return el('div', { class: 'av tile group ' + size, 'aria-hidden': 'true', style: `background:${colorOf(id)}` }, LC.icon('people_team', { filled: true }));
    return el('div', { class: 'av tile ' + size, 'aria-hidden': 'true', style: `background:${colorOf(id)}`, text: ((c.name) || '#').trim()[0].toUpperCase() });
  };

  // ---------- one row ----------
  function previewOf(chan) {
    const m = S.last[chan]; if (!m) return '';
    if (m.deleted) return t('deleted'); if (m.system) return LC.sysText(m).text;
    const who = m.from === S.me.id ? t('you') + ': ' : m.from && !chan.startsWith('dm:') ? LC.uname(m.from).split(' ')[0] + ': ' : '';
    const body = m.text ? LC.plain(m.text) : m.announce ? t('cx_annPrev', { t: m.announce }) : m.sticker ? (typeof m.sticker === 'string' ? m.sticker : t('cx_stickerPrev')) : m.praise ? t('cx_praisePrev') : m.location ? t('cx_locPrev')
      : m.poll ? t('pollPreview', { q: m.poll }) : m.game ? t('ttt') : m.gif ? t('cx_gifPrev') : m.meme ? t('cx_memePrev') : m.file ? t('filePreview', { name: m.file }) : '';
    return who + (m.subject ? m.subject + (body ? ' — ' : '') : '') + body;
  }
  let dragId = null;
  function navItem(e, o = {}) {
    const id = e.id, un = S.unread[id] || 0, mn = S.mentions[id] || 0, flagged = !!cx().unread[id], muted = LC.isMuted(id), last = S.last[id], draft = S.chan === id && LC.composers.main ? '' : draftOf(id);
    const hide = !!LC.prefs().hidePreviews, name = entryName(e);
    const fallback = e.kind === 'dm' ? (e.self ? t('cx_notesToSelf') : e.u.statusText ? (e.u.statusEmoji || '') + ' ' + e.u.statusText : t(e.u.presence)) : e.type === 'meeting' ? t('cx_meetingChat') : e.type === 'channel' ? e.c.topic || '' : '';
    const prevNode = draft ? el('span', { class: 'prev cx-draft' }, LC.icon('edit', { cls: 'cx-pencil' }), el('b', { text: t('cx_draft') + ' ' }), draft.split('\n')[0].slice(0, 80)) : hide && last ? null : el('span', { class: 'prev', text: previewOf(id) || fallback });
    const badge = mn ? el('span', { class: 'badge mention', text: '@' + mn, 'aria-label': t('unreadMentions', { n: mn }) }) : un && !muted ? el('span', { class: 'badge', text: un > 99 ? '99+' : un, 'aria-label': t('unreadMsgs', { n: un }) }) : un || flagged ? el('span', { class: 'dotmark' + (flagged ? ' cx-flag' : ''), role: 'img', 'aria-label': flagged ? t('cx_markUnread') : t('unreadMsgs', { n: un }) }) : null;
    const main = el('button', { class: 'itemmain', 'aria-current': S.chan === id ? 'page' : null, onclick: () => LC.openChat(id) }, LC.chatLead(id),
      el('span', { class: 'itext' },
        el('span', { class: 'irow' }, el('span', { class: 'name', text: name }), o.fav ? LC.icon('star', { filled: true, cls: 'fav', label: t('favorite') }) : null, last ? el('time', { class: 'itime', text: LC.shortTime(last.ts) }) : null),
        el('span', { class: 'irow' }, prevNode || el('span', { class: 'prev' }), muted ? LC.icon('alert_off', { cls: 'mutedmark', label: t('muted') }) : null, badge)));
    const row = el('div', { class: 'item' + (S.chan === id ? ' active' : '') + (un || flagged ? ' unread' : '') + (muted ? ' muted' : '') + (hide ? ' cx-nopreview' : ''), 'data-chan': id, draggable: o.drag ? 'true' : null, oncontextmenu: (ev) => { ev.preventDefault(); chatMenu({ x: ev.clientX, y: ev.clientY }, e); } },
      main, el('button', { class: 'kebab', 'aria-label': t('chatOptions'), title: t('chatOptions'), 'aria-haspopup': 'menu', onclick: (ev) => { ev.stopPropagation(); chatMenu(ev.currentTarget, e); } }, LC.icon('more_horizontal')));
    if (o.drag) {
      row.addEventListener('dragstart', (ev) => { dragId = id; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', entryName(e)); } catch {} row.classList.add('cx-dragging'); });
      row.addEventListener('dragend', () => { dragId = null; row.classList.remove('cx-dragging'); LC.$$('.cx-dropover').forEach((n) => n.classList.remove('cx-dropover')); });
    }
    if (o.dropSec) dropTarget(row, o.dropSec, id);
    return row;
  }
  LC.navItem = navItem;
  function dropTarget(node, sec, before) {
    node.addEventListener('dragover', (ev) => { if (!dragId || dragId === before) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; node.classList.add('cx-dropover'); });
    node.addEventListener('dragleave', () => node.classList.remove('cx-dropover'));
    node.addEventListener('drop', (ev) => { if (!dragId) return; ev.preventDefault(); node.classList.remove('cx-dropover'); const id = dragId; dragId = null; moveChat(id, sec, before || null); });
  }
  const collapsed = () => LC.ls.get('lc_collapsed', {});
  const section = (key, label, action, o = {}) => {
    const shut = !!collapsed()[key], n = el('div', { class: 'sec' + (o.drop ? ' cx-dropsec' : ''), 'data-sec': key }, el('button', { class: 'sectoggle', 'aria-expanded': String(!shut), onclick: () => { const c = collapsed(); c[key] = !shut; LC.ls.set('lc_collapsed', c); LC.renderNav(); } }, LC.icon(shut ? 'chevron_right' : 'chevron_down'), el('span', { text: label })), action || null);
    if (o.drop) dropTarget(n, o.drop, null);
    return n;
  };
  LC.navSection = section;
  const emptyState = (icon, text) => el('div', { class: 'empty' }, LC.icon(icon, { cls: 'big' }), el('p', { text }));
  LC.emptyState = emptyState;

  // ---------- moving chats between Pinned, your sections and the rest (drag and drop, or the chat menu) ----------
  const prefsCopy = () => { const p = LC.prefs(); return { pinnedChats: [...(p.pinnedChats || [])], chatSections: (p.chatSections || []).map((s) => ({ ...s, chats: [...(s.chats || [])] })), archived: [...(p.archived || [])] }; };
  const savePrefs = (patch) => { Object.assign(S.me.prefs, patch); LC.renderNav(); return LC.setPrefs(patch); };
  function moveChat(id, target, before) {
    const p = prefsCopy(), out = (list) => list.filter((x) => x !== id), put = (list) => { const i = before ? list.indexOf(before) : -1; list.splice(i < 0 ? list.length : i, 0, id); return list; };
    p.pinnedChats = out(p.pinnedChats); for (const s of p.chatSections) s.chats = out(s.chats); p.archived = out(p.archived);
    if (target === 'pinned') put(p.pinnedChats);
    else if (target === 'archived') p.archived.push(id);
    else if (target.startsWith('cx:')) { const s = p.chatSections.find((x) => 'cx:' + x.id === target); if (s) put(s.chats); }
    savePrefs(p);
  }
  LC.moveChat = moveChat;
  const newSectionId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
  async function newSection(withChat) {
    const name = await LC.prompt(t('cx_newSection'), { placeholder: t('cx_sectionName'), max: 40 }); if (!name || !name.trim()) return;
    const p = prefsCopy(), s = { id: newSectionId(), name: name.trim().slice(0, 40), chats: [] }; p.chatSections.push(s);
    if (withChat) { p.pinnedChats = p.pinnedChats.filter((x) => x !== withChat); for (const x of p.chatSections) x.chats = x.chats.filter((c) => c !== withChat); s.chats.push(withChat); }
    savePrefs(p);
  }
  LC.newChatSection = newSection;
  function sectionMenu(anchor, s, i, n) {
    const p = prefsCopy(), move = (d) => { const [x] = p.chatSections.splice(i, 1); p.chatSections.splice(i + d, 0, x); savePrefs({ chatSections: p.chatSections }); };
    LC.menu(anchor, [
      { icon: 'rename', label: t('cx_renameSection'), fn: async () => { const v = await LC.prompt(t('cx_renameSection'), { value: s.name, max: 40 }); if (v && v.trim()) { p.chatSections[i].name = v.trim(); savePrefs({ chatSections: p.chatSections }); } } },
      i > 0 ? { icon: 'arrow_up', label: t('cx_moveUpSec'), fn: () => move(-1) } : null, i < n - 1 ? { icon: 'arrow_down', label: t('cx_moveDownSec'), fn: () => move(1) } : null, 'sep',
      { icon: 'delete', label: t('cx_deleteSection'), danger: true, fn: async () => { if (await LC.confirm(t('cx_confirmDeleteSection', { name: s.name }), { danger: true, ok: t('delete') })) { p.chatSections.splice(i, 1); savePrefs({ chatSections: p.chatSections }); } } },
    ]);
  }

  // ---------- filters (chips at the top of the list) ----------
  const FILTERS = [['unread', 'cx_fUnread'], ['chats', 'cx_fChats'], ['channels', 'cx_fChannels'], ['meetings', 'cx_fMeetings'], ['muted', 'cx_fMuted'], ['drafts', 'cx_fDrafts']];
  const view = { filter: '', query: '', box: false };
  LC.setChatFilter = (f) => { view.filter = view.filter === f ? '' : f; LC.renderNav(); };
  const matches = (e, f) => {
    if (f === 'unread') return !!(S.unread[e.id] || S.mentions[e.id] || cx().unread[e.id]);
    if (f === 'chats') return e.type === 'dm' || e.type === 'self' || e.type === 'group';
    if (f === 'channels') return e.type === 'channel'; if (f === 'meetings') return e.type === 'meeting';
    if (f === 'muted') return LC.isMuted(e.id); if (f === 'drafts') return !!draftOf(e.id) && S.chan !== e.id;
    return true;
  };
  function filterBar(nav) {
    const chips = el('div', { class: 'cx-chips', role: 'group', 'aria-label': t('cx_filterChats') }, FILTERS.map(([k, s]) => el('button', { type: 'button', class: 'cx-chip' + (view.filter === k ? ' on' : ''), 'aria-pressed': String(view.filter === k), onclick: () => LC.setChatFilter(k) }, t(s))));
    const bar = el('div', { class: 'cx-filterbar' });
    if (view.box) {
      const inp = el('input', { type: 'search', class: 'cx-filterin', placeholder: t('cx_filterByName'), 'aria-label': t('cx_filterByName'), value: view.query, oninput: (ev) => { view.query = ev.target.value; const pos = ev.target.selectionStart; renderChats(nav, 0); const n = $('.cx-filterin'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, onkeydown: (ev) => { if (ev.key === 'Escape') { view.query = ''; view.box = false; LC.renderNav(); } } });
      bar.append(inp);
    }
    bar.append(chips); return bar;
  }
  function filtered(nav, E) {
    const q = view.query.trim().toLowerCase();
    let list = [...E.all.values()].filter((e) => !e.hidden && (!e.team || E.pinned.includes(e)) && matches(e, view.filter));
    if (!q && view.filter !== 'muted' && view.filter !== 'drafts') list = list.filter((e) => e.kind !== 'dm' || S.last[e.id] || e.self);
    if (q) list = list.filter((e) => entryName(e).toLowerCase().includes(q) || (e.c && e.c.members && e.type === 'group' && e.c.members.some((i) => LC.uname(i).toLowerCase().includes(q))));
    list.sort((a, b) => lastTs(b) - lastTs(a) || entryName(a).localeCompare(entryName(b)));
    for (const e of list) nav.append(navItem(e));
    if (!list.length) nav.append(el('div', { class: 'empty small' }, el('p', { text: t('cx_noFilterResults') }), el('button', { type: 'button', class: 'secondary sm', text: t('cx_clearFilter'), onclick: () => { view.filter = ''; view.query = ''; LC.renderNav(); } })));
  }

  // ---------- the list ----------
  function renderChats(nav, scroll) {
    nav.replaceChildren();
    const E = chatEntries(), prefs = LC.prefs(), favs = new Set(prefs.favorites || []), shut = collapsed(), secs = prefs.chatSections || [];
    nav.append(filterBar(nav));
    if (view.filter || view.query.trim()) { filtered(nav, E); nav.scrollTop = scroll || 0; return; }
    const placed = new Set([...E.pinned.map((e) => e.id), ...secs.flatMap((s) => s.chats || []), ...E.archived]);
    const free = (e) => !placed.has(e.id) && !e.hidden, fav = (e) => e.kind === 'dm' && !e.self && favs.has(e.u.id), item = (e, o = {}) => navItem(e, { fav: fav(e), drag: true, ...o });
    // followed threads with new replies
    const nThreads = LC.followedFresh ? LC.followedFresh() : 0;
    if (cx().follows.size) nav.append(el('button', { type: 'button', class: 'act cx-threadsrow' + (nThreads ? ' unread' : ''), onclick: () => LC.openFollowed && LC.openFollowed() }, el('span', { class: 'av tile cx-thr', 'aria-hidden': 'true' }, LC.icon('comment_multiple')), el('span', { class: 'itext' }, el('span', { class: 'name', text: t('cx_followed') })), nThreads ? el('span', { class: 'badge', text: nThreads, 'aria-label': t('cx_newRepliesLong', { n: nThreads }) }) : null));
    if (free(E.self)) nav.append(item(E.self, { dropSec: 'recent' }));
    if (E.pinned.length) { nav.append(section('pinned', t('pinnedChats'), null, { drop: 'pinned' })); if (!shut.pinned) E.pinned.filter((e) => !e.hidden).forEach((e) => nav.append(item(e, { dropSec: 'pinned' }))); }
    secs.forEach((s, i) => {
      const key = 'cx:' + s.id, list = (s.chats || []).map((id) => E.all.get(id)).filter((e) => e && !e.hidden);
      nav.append(section(key, s.name, LC.ibtn('more_horizontal', t('cx_sectionOptions'), (ev) => sectionMenu(ev.currentTarget, s, i, secs.length), { cls: 'icon plus', menu: true }), { drop: key }));
      if (!shut[key]) { list.forEach((e) => nav.append(item(e, { dropSec: key }))); if (!list.length) { const hint = el('div', { class: 'cx-emptysec', text: t('cx_dragHint') }); dropTarget(hint, key, null); nav.append(hint); } }
    });
    nav.append(section('channels', t('channels'), LC.ibtn('add', t('newChannel'), () => LC.newChannelDialog(), { cls: 'icon plus' }), { drop: 'recent' }));
    if (!shut.channels) {
      const pubs = E.chans.filter((e) => e.type === 'channel' && !e.team && free(e)), byName = (a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.c.name.localeCompare(b.c.name));
      const cats = new Map(); for (const e of pubs) (cats.get(e.c.category || '') || cats.set(e.c.category || '', []).get(e.c.category || '')).push(e);
      for (const [cat, list] of [...cats].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])))) { if (cat) nav.append(el('div', { class: 'cat', text: cat })); list.sort(byName).forEach((e) => nav.append(item(e))); }
    }
    // recent chats (group chats, meeting chats and people you have talked to), newest first, like Teams
    const recent = [...E.chans.filter((e) => (e.type === 'group' || e.type === 'meeting') && !e.team), ...E.people.filter((e) => S.last[e.id])].filter(free)
      .sort((a, b) => lastTs(b) - lastTs(a) || entryName(a).localeCompare(entryName(b)));
    if (recent.length) { nav.append(section('recent', t('recentChats'), null, { drop: 'recent' })); if (!shut.recent) recent.forEach((e) => nav.append(item(e))); }
    const ppl = E.people.filter((e) => free(e) && !S.last[e.id]).sort((a, b) => (favs.has(b.u.id) - favs.has(a.u.id)) || ((b.u.presence !== 'offline') - (a.u.presence !== 'offline')) || LC.uname(a.u.id).localeCompare(LC.uname(b.u.id)));
    nav.append(section('people', t('people'))); if (!shut.people) ppl.forEach((e) => nav.append(item(e)));
    if (E.people.length === 0) nav.append(el('div', { class: 'empty small', text: t('nobodyYet') }));
    const arch = [...E.archived].map((id) => E.all.get(id)).filter((e) => e && !e.hidden);
    if (arch.length) { nav.append(section('archived', t('archived') + ` (${arch.length})`, null, { drop: 'archived' })); if (!shut.archived) arch.forEach((e) => nav.append(item(e))); }
    nav.scrollTop = scroll || 0;
  }
  LC.renderChats = renderChats;
  // header buttons of the chat list: filter, new chat, more
  LC.chatListActions = () => [
    LC.ibtn('filter', t('cx_filterByName'), () => { view.box = !view.box; if (!view.box) view.query = ''; LC.renderNav(); if (view.box) setTimeout(() => { const n = $('.cx-filterin'); if (n) n.focus(); }, 30); }, { pressed: view.box }),
    LC.ibtn('compose', t('cx_newChat'), () => LC.newChatDialog()),
    LC.ibtn('more_horizontal', t('cx_moreChatOpts'), (ev) => LC.menu(ev.currentTarget, [{ icon: 'compose', label: t('cx_newChat'), fn: () => LC.newChatDialog() }, { icon: 'people_team', label: t('newChannel'), fn: () => LC.newChannelDialog() }, { icon: 'folder_add', label: t('cx_newSection'), fn: () => newSection() }, 'sep', { icon: 'comment_multiple', label: t('cx_followed'), fn: () => LC.openFollowed && LC.openFollowed() }, { icon: 'filter', label: t('quickSwitcher'), fn: () => LC.quickSwitch() }, { icon: 'mail_read', label: t('markAllRead'), fn: () => LC.markAllRead() }]), { menu: true }),
  ];
  LC.markAllRead = () => { for (const c of new Set([...Object.keys(S.unread).filter((c) => S.unread[c] || S.mentions[c]), ...Object.keys(cx().unread)])) LC.api('/api/read', { chan: c }).catch(() => {}); };

  // ---------- chat menu (⋯ on a row, right click, header) ----------
  function chatMenu(anchor, e) {
    const prefs = LC.prefs(), id = e.id, pinned = prefs.pinnedChats || [], isPin = pinned.includes(id), arch = (prefs.archived || []).includes(id), muted = LC.isMuted(id), idx = pinned.indexOf(id), c = e.c;
    const secs = prefs.chatSections || [], inSec = secs.find((s) => (s.chats || []).includes(id)), unread = !!(S.unread[id] || S.mentions[id] || cx().unread[id]);
    const setMute = (ms) => LC.setPrefs({ muted: { ...(prefs.muted || {}), [id]: ms === true ? true : Date.now() + ms } }), unmute = () => { const m = { ...(prefs.muted || {}) }; delete m[id]; LC.setPrefs({ muted: m }); };
    const moveBy = (d) => { const a = [...pinned]; a.splice(idx, 1); a.splice(idx + d, 0, id); LC.setPrefs({ pinnedChats: a }); };
    const secMove = (d) => { const p = prefsCopy(), s = p.chatSections.find((x) => x.id === inSec.id), i = s.chats.indexOf(id); s.chats.splice(i, 1); s.chats.splice(i + d, 0, id); savePrefs({ chatSections: p.chatSections }); };
    const group = c && LC.isGroupChat(c), manage = c && (LC.isAdmin() || c.by === S.me.id), secI = inSec ? inSec.chats.indexOf(id) : -1;
    LC.menu(anchor, [
      { icon: isPin ? 'pin_off' : 'pin', label: isPin ? t('unpinChat') : t('pinChat'), fn: () => (isPin ? LC.setPrefs({ pinnedChats: pinned.filter((x) => x !== id) }) : moveChat(id, 'pinned')) },
      isPin && idx > 0 ? { icon: 'arrow_up', label: t('moveUp'), fn: () => moveBy(-1) } : null, isPin && idx < pinned.length - 1 ? { icon: 'arrow_down', label: t('moveDown'), fn: () => moveBy(1) } : null,
      inSec && secI > 0 ? { icon: 'arrow_up', label: t('moveUp'), fn: () => secMove(-1) } : null, inSec && secI < inSec.chats.length - 1 ? { icon: 'arrow_down', label: t('moveDown'), fn: () => secMove(1) } : null,
      { icon: 'folder_add', label: t('cx_moveTo'), fn: () => LC.menu(anchor, [{ icon: 'pin', label: t('cx_moveToPinned'), fn: () => moveChat(id, 'pinned') }, ...secs.map((s) => ({ icon: 'folder', label: s.name, checked: s === inSec, fn: () => moveChat(id, 'cx:' + s.id) })), { icon: 'add', label: t('cx_newSection') + '…', fn: () => newSection(id) }, inSec || isPin ? { icon: 'dismiss', label: t('cx_removeFromSection'), fn: () => moveChat(id, 'recent') } : null]) }, 'sep',
      unread ? { icon: 'mail_read', label: t('cx_markRead'), fn: () => LC.api('/api/read', { chan: id }).catch(fail) } : { icon: 'mail_unread', label: t('cx_markUnread'), fn: () => LC.markChatUnread(id) },
      muted ? { icon: 'alert', label: t('unmute'), fn: unmute } : null, !muted ? { icon: 'alert_off', label: t('mute1h'), fn: () => setMute(3600e3) } : null, !muted ? { icon: 'alert_off', label: t('mute8h'), fn: () => setMute(8 * 3600e3) } : null, !muted ? { icon: 'alert_off', label: t('muteForever'), fn: () => setMute(true) } : null, 'sep',
      { icon: arch ? 'archive_arrow_back' : 'archive', label: arch ? t('unarchive') : t('archive'), fn: () => (arch ? LC.setPrefs({ archived: (prefs.archived || []).filter((x) => x !== id) }) : moveChat(id, 'archived')) },
      e.kind === 'dm' && !e.self ? 'sep' : null, e.kind === 'dm' && !e.self ? { icon: 'star', label: (prefs.favorites || []).includes(e.u.id) ? t('unfavorite') : t('favorite'), fn: () => LC.toggleFavorite(e.u.id) } : null, e.kind === 'dm' && !e.self ? { icon: 'tag', label: t('setNickname'), fn: () => LC.nicknameDialog(e.u.id) } : null,
      group ? 'sep' : null, group ? { icon: 'rename', label: t('cx_renameChat'), fn: () => renameChat(c) } : null, group ? { icon: 'image_edit', label: t('cx_changePic'), fn: () => pickPicture(c) } : null, group && manage ? { icon: 'person_add', label: t('cx_addPeople'), fn: () => groupInfo(id, true) } : null,
      e.kind !== 'dm' ? { icon: 'info', label: t('chatInfo'), fn: () => LC.chatInfo(id) } : null, ...LC.extItems(LC.ext.chatMenu, e),
      group || e.kind === 'dm' ? 'sep' : null,
      group ? { icon: 'arrow_exit', label: t('cx_leaveChat'), danger: true, fn: () => leaveChat(c) } : null,
      group && manage ? { icon: 'delete', label: t('cx_deleteForAll'), danger: true, fn: () => deleteGroup(c) } : null,
      e.kind === 'dm' ? { icon: 'delete', label: t('cx_deleteChat'), danger: true, fn: () => hideChat(id) } : null,
    ]);
  }
  LC.chatMenu = (anchor, id) => { const e = chatEntries().all.get(id); if (e) chatMenu(anchor, e); };
  LC.markChatUnread = (id) => { cx().unread[id] = Date.now(); if (S.chan === id) cx().keepUnread = id; LC.renderNav(); LC.updateBadge(); LC.api('/api/chatux/unread', { chan: id }).catch(fail); };
  async function hideChat(id) { if (!(await LC.confirm(t('cx_confirmHideChat'), { danger: true, ok: t('delete') }))) return; try { await LC.api('/api/chatux/chat/hide', { chan: id }); delete S.win[id]; cx().hidden[id] = Date.now(); if (S.chan === id) LC.openChat('general'); LC.renderNav(); } catch (e) { fail(e); } }
  async function leaveChat(c) { if (!(await LC.confirm(t('cx_confirmLeaveChat'), { danger: true, ok: t('leave') }))) return; LC.api('/api/channel/members', { id: c.id, remove: [S.me.id] }).then(() => LC.closeModal()).catch(fail); }
  async function deleteGroup(c) { if (!(await LC.confirm(t('cx_confirmDeleteGroup', { name: c.name }), { danger: true, ok: t('delete') }))) return; LC.api('/api/channel/delete', { id: c.id }).then(() => LC.closeModal()).catch(fail); }
  async function renameChat(c) { const v = await LC.prompt(t('cx_renameChat'), { value: c.name, max: 30, placeholder: t('cx_chatName') }); if (v === null || !v.trim() || v.trim() === c.name) return; LC.api('/api/channel/update', { id: c.id, name: v.trim() }).catch(fail); }
  LC.renameChat = (chan) => { const c = S.channels.get(chan); if (c) renameChat(c); };
  // group picture: any image, cropped to a 128 px square, sent as a small data URL
  async function pictureData(file) {
    const bmp = await createImageBitmap(file), cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), s = Math.max(128 / bmp.width, 128 / bmp.height);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.drawImage(bmp, (128 - bmp.width * s) / 2, (128 - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    for (const q of [0.88, 0.75, 0.6]) { const d = cv.toDataURL('image/jpeg', q); if (d.length < 120000) return d; } throw new Error(t('cx_picFailed'));
  }
  function pickPicture(c, after) {
    const inp = el('input', { type: 'file', accept: 'image/*', class: 'hidden' }); document.body.append(inp);
    inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); if (!f) return; try { const data = await pictureData(f); const r = await LC.api('/api/chatux/chat/picture', { chan: c.id, data }); S.channels.set(c.id, r.channel); LC.renderNav(); if (S.chan === c.id) LC.renderHeader(); if (after) after(); } catch (e) { fail(e.message ? e : new Error(t('cx_picFailed'))); } });
    inp.click();
  }
  LC.pickChatPicture = (chan) => { const c = S.channels.get(chan); if (c) pickPicture(c); };

  // ---------- group chat info (any member: picture, name; creator/admins: people, timer, delete) ----------
  const ttlOptions = () => [[0, t('off')], [60, '1 min'], [300, '5 min'], [3600, '1 h'], [86400, '1 ' + t('day')], [604800, '1 ' + t('week')], [2592000, '30 ' + t('days')]];
  function peoplePicker(candidates, label) { // chips + checkbox list with a name filter
    const picked = new Set(), q = el('input', { type: 'search', placeholder: t('cx_toPh'), 'aria-label': label }), list = el('div', { class: 'people cx-people', role: 'group', 'aria-label': label });
    const draw = () => list.replaceChildren(...candidates.filter((u) => LC.uname(u.id).toLowerCase().includes(q.value.trim().toLowerCase())).map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: picked.has(u.id), onchange: (e) => (e.target.checked ? picked.add(u.id) : picked.delete(u.id)) }), LC.avatar(u, 'sm', true), LC.uname(u.id))));
    q.addEventListener('input', draw); draw(); return { el: el('div', { class: 'cx-picker' }, q, list), picked };
  }
  function historyChoice() {
    const days = el('input', { type: 'number', min: 1, max: 3650, value: 7, class: 'cx-days', 'aria-label': t('cx_histDaysN') });
    const r = (v, text, extra) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'cxHist', value: v, checked: v === 'none' }), el('span', { text }), extra || null);
    const box = el('fieldset', { class: 'cx-fieldset' }, el('legend', { text: t('cx_histLabel') }), r('none', t('cx_histNone')), r('days', t('cx_histDays'), days), r('all', t('cx_histAll')));
    return { el: box, value: () => { const v = (box.querySelector('input[name=cxHist]:checked') || {}).value || 'none'; return v === 'days' ? Math.max(1, Math.min(3650, Math.round(Number(days.value) || 1))) : v; } };
  }
  function groupInfo(chan, focusAdd) {
    const c = S.channels.get(chan); if (!c) return;
    const manage = LC.isAdmin() || c.by === S.me.id, nm = el('input', { value: c.name, maxlength: 30, 'aria-label': t('cx_chatName') }), reopen = () => groupInfo(chan);
    const body = [el('div', { class: 'cx-ghead' }, LC.chatLead(chan, 'lg'), el('div', { class: 'cx-gtitle' }, el('h2', { text: c.name, style: { margin: 0 } }), el('div', { class: 'muted small', text: t('cx_peopleN', { n: c.members.length }) })),
      el('div', { class: 'cx-gacts' }, el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => pickPicture(c, reopen) }, LC.icon('image_edit'), t('cx_changePic')), c.chatPic ? el('button', { type: 'button', class: 'secondary sm', text: t('cx_removePic'), onclick: () => LC.api('/api/chatux/chat/picture', { chan, data: '' }).then((r) => { S.channels.set(chan, r.channel); reopen(); }).catch(fail) }) : null)),
    el('div', { class: 'rowline' }, el('label', { class: 'field grow' }, el('span', { class: 'flabel', text: t('cx_chatName') }), nm), el('button', { type: 'button', class: 'primary sm', text: t('rename'), onclick: () => { if (nm.value.trim() && nm.value.trim() !== c.name) LC.api('/api/channel/update', { id: chan, name: nm.value.trim() }).then(() => LC.toast(t('saved'), { ms: 1200 })).catch(fail); } }))];
    body.push(el('h3', { text: t('cx_members', { n: c.members.length }) }), el('ul', { class: 'plainlist cx-members' }, c.members.map((id) => el('li', {}, LC.avatar(S.users.get(id), 'sm', true), el('span', { class: 'grow', text: LC.uname(id) + (id === S.me.id ? ' ' + t('cx_you') : '') }), id === c.by ? el('span', { class: 'pill', text: t('cx_creator') }) : null,
      manage && id !== S.me.id ? el('button', { type: 'button', class: 'secondary sm', text: t('remove'), 'aria-label': t('remove') + ' ' + LC.uname(id), onclick: async () => { if (await LC.confirm(t('confirmRemoveMember', { name: LC.uname(id) }))) LC.api('/api/channel/members', { id: chan, remove: [id] }).then(reopen).catch(fail); } }) : null))));
    if (manage) {
      const cand = [...S.users.values()].filter((u) => !u.removed && !u.deleted && !c.members.includes(u.id));
      if (cand.length) {
        const pp = peoplePicker(cand, t('cx_pickPeople')), hist = historyChoice();
        body.push(el('h3', { text: t('cx_addPeople') }), pp.el, hist.el, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary', text: t('add'), onclick: () => { if (!pp.picked.size) return LC.toast(t('cx_addSomeone')); LC.api('/api/channel/members', { id: chan, add: [...pp.picked], history: hist.value() }).then(reopen).catch(fail); } })));
      } else body.push(el('p', { class: 'muted small', text: t('cx_noOneToAdd') }));
      const ttl = el('select', { 'aria-label': t('disappearing'), onchange: (e) => LC.api('/api/channel/update', { id: chan, ttl: Number(e.target.value) }).catch(fail) }, ttlOptions().map(([v, l]) => el('option', { value: v, text: l }))); ttl.value = String(c.ttl || 0);
      body.push(el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('disappearing') }), ttl, el('span', { class: 'muted small', text: t('disappearingHelp') })));
    }
    body.push(el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary withicon', onclick: async () => { if (await LC.confirm(t('confirmDeleteMine'), { danger: true, ok: t('delete') })) LC.api('/api/chat/clear', { chan, scope: 'mine' }).then((r) => LC.toast(t('cleanupDone', { n: r.removed }), { ms: 2000 })).catch(fail); } }, LC.icon('broom'), t('deleteMyMsgs')),
      el('button', { type: 'button', class: 'secondary danger withicon', onclick: () => leaveChat(c) }, LC.icon('arrow_exit'), t('cx_leaveChat')),
      manage ? el('button', { type: 'button', class: 'secondary danger withicon', onclick: () => deleteGroup(c) }, LC.icon('delete'), t('cx_deleteForAll')) : null),
    el('div', { class: 'acts' }, el('button', { type: 'button', class: 'primary', text: t('close'), onclick: LC.closeModal })));
    LC.modal(body, { wide: true, label: t('cx_groupInfo') });
    if (focusAdd) setTimeout(() => { const n = $('.modal .cx-picker input'); if (n) n.focus(); }, 60);
  }
  LC.groupInfo = groupInfo;
  const coreInfo = LC.chatInfo;
  LC.chatInfo = (chan) => { const c = S.channels.get(chan); return c && LC.isGroupChat(c) ? groupInfo(chan) : coreInfo(chan); };

  // ---------- New chat: a To: box (one person = their chat, several = a group chat, nobody = notes to self) ----------
  LC.newChatDialog = (pre = {}) => {
    const picked = (pre.people || []).filter((id) => S.users.has(id)), people = () => [...S.users.values()].filter((u) => !u.removed && !u.deleted);
    const chips = el('div', { class: 'cx-tochips' }), inp = el('input', { class: 'cx-toin', placeholder: t('cx_toPh'), 'aria-label': t('cx_to') + ' ' + t('cx_toPh'), role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'cxToList', 'aria-autocomplete': 'list', autocomplete: 'off' });
    const sug = el('div', { class: 'cx-sug hidden', id: 'cxToList', role: 'listbox', 'aria-label': t('cx_suggestions') }), gname = el('input', { maxlength: 30, placeholder: t('cx_groupNameOpt'), 'aria-label': t('cx_groupNameOpt') });
    const first = el('textarea', { rows: 2, maxlength: 8000, placeholder: t('cx_firstMsg'), 'aria-label': t('cx_firstMsg'), spellcheck: 'true' }), err = el('div', { class: 'err', role: 'alert' }), nameRow = el('div', { class: 'hidden' }, gname);
    let sel = 0, shown = [];
    const drawChips = () => { chips.replaceChildren(...picked.map((id) => el('span', { class: 'cx-tochip' }, LC.avatar(S.users.get(id), 'sm', false), el('span', { text: id === S.me.id ? LC.uname(id) + ' ' + t('cx_you') : LC.uname(id) }), LC.ibtn('dismiss', t('cx_removePerson', { name: LC.uname(id) }), () => { picked.splice(picked.indexOf(id), 1); drawChips(); drawSug(); inp.focus(); }))), inp); nameRow.classList.toggle('hidden', picked.filter((x) => x !== S.me.id).length < 2); };
    const drawSug = () => {
      const q = inp.value.trim().toLowerCase(); shown = q ? people().filter((u) => !picked.includes(u.id) && (LC.uname(u.id).toLowerCase().includes(q) || u.name.toLowerCase().includes(q))).slice(0, 8) : [];
      sel = Math.min(sel, Math.max(0, shown.length - 1)); sug.classList.toggle('hidden', !shown.length); inp.setAttribute('aria-expanded', String(!!shown.length));
      sug.replaceChildren(...shown.map((u, i) => el('div', { class: 'cx-opt' + (i === sel ? ' on' : ''), role: 'option', id: 'cxTo-' + i, 'aria-selected': String(i === sel), onmousedown: (e) => { e.preventDefault(); pick(u.id); } }, LC.avatar(u, 'sm', true), el('span', { text: u.id === S.me.id ? LC.uname(u.id) + ' ' + t('cx_you') : LC.uname(u.id) }), u.statusText ? el('small', { class: 'muted', text: u.statusText }) : null)));
      if (shown.length) inp.setAttribute('aria-activedescendant', 'cxTo-' + sel); else inp.removeAttribute('aria-activedescendant');
    };
    const pick = (id) => { if (!picked.includes(id)) picked.push(id); inp.value = ''; sel = 0; drawChips(); drawSug(); inp.focus(); };
    inp.addEventListener('input', () => { sel = 0; drawSug(); });
    inp.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; drawSug(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); pick(shown[sel].id); }
      else if (e.key === 'Backspace' && !inp.value && picked.length) { picked.pop(); drawChips(); }
    });
    inp.addEventListener('blur', () => setTimeout(() => sug.classList.add('hidden'), 150));
    const go = async (ev) => {
      ev.preventDefault(); err.textContent = ''; const others = picked.filter((x) => x !== S.me.id);
      if (!picked.length) { err.textContent = t('cx_addSomeone'); return inp.focus(); }
      try {
        let chan;
        if (others.length >= 2) { // reuse a group chat with exactly these people (Teams does the same) unless a different name was asked for
          const want = new Set([S.me.id, ...others]), name = gname.value.trim();
          const same = [...S.channels.values()].find((c) => LC.isGroupChat(c) && c.members.length === want.size && c.members.every((i) => want.has(i)) && (!name || c.name === name));
          chan = same ? same.id : (await LC.api('/api/chatux/chat/new', { members: others, name })).chan;
          if (!same) { const r = await LC.api('/api/channel/update', { id: chan, name: name || undefined }).catch(() => null); void r; }
        } else chan = (await LC.api('/api/chatux/chat/new', { members: others })).chan;
        delete S.cx.hidden[chan]; LC.closeModal();
        const txt = first.value.trim(); if (txt) await LC.api('/api/send', { chan, text: first.value }).catch(fail);
        LC.openChat(chan);
      } catch (x) { err.textContent = x.message; }
    };
    LC.modal(el('form', { class: 'cx-newchat', onsubmit: go }, el('h2', {}, LC.icon('compose'), ' ' + t('cx_newChat')), el('div', { class: 'cx-to' }, el('span', { class: 'cx-tolabel', text: t('cx_to') }), chips, sug), nameRow, first, err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'submit', class: 'primary', text: t('cx_startChat') }))), { label: t('cx_newChat') });
    drawChips(); setTimeout(() => inp.focus(), 40);
  };

  // drafts: refresh the list when a draft starts or ends
  let hadDraft = new Set();
  LC.on('cx:draft', () => { const now = new Set(Object.keys(localStorage).filter((k) => /^lc_draft:[^:]+(?::[^:]*)*:$/.test(k))); if (now.size !== hadDraft.size || [...now].some((k) => !hadDraft.has(k))) { hadDraft = now; LC.renderNav(); } });
  void lbl;
})();
