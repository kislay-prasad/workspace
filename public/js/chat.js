'use strict';
// Chat UI: sidebar, header/tabs, message list (paging, jump, unread divider), threads, search, quick switcher, shortcuts.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const caches = new Map(); // chan -> Map(id -> {sig, node})
  let loadingOlder = false, loadingNewer = false, stick = true, threadMsgs = [], threadCache = new Map(), navQueued = false, booted = false;

  const raf = (fn) => requestAnimationFrame(fn);
  LC.renderNav = () => { if (navQueued) return; navQueued = true; raf(() => { navQueued = false; renderNavNow(); }); };

  // ---------- app bar (left rail) + chat list ----------
  const PHONE = () => matchMedia('(max-width: 760px)').matches;
  // phones show either the chat list (Teams-style bottom bar) or one conversation; the visible one is the page's main region
  const menuToggle = (open) => { $('#app').classList.toggle('list-mode', !!open); const side = $('#sidebar'); side.setAttribute('role', open && PHONE() ? 'main' : 'complementary'); if (open) LC.renderNav(); };
  LC.menuToggle = menuToggle;
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  LC.shortTime = (ts) => { const d = new Date(ts), n = new Date(); if (d.toDateString() === n.toDateString()) return LC.fmtTime(ts); const days = (n - d) / 86400000; return days < 6 ? d.toLocaleDateString(lang(), { weekday: 'short' }) : d.toLocaleDateString(lang(), { day: 'numeric', month: 'numeric' }); };
  // Left app bar. Every item is a "pane" in LC.ext.panes: render(nav) draws the list column; an optional
  // main(host) takes over the big right-hand area like Teams' Calendar (see docs/EXTENDING.md).
  const lbl = (x) => (typeof x === 'function' ? x() : x);
  const paneList = () => Object.entries(LC.ext.panes).map(([key, p]) => ({ key, ...p })).filter((p) => !p.hidden || !p.hidden()).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  LC.setPane = (pane) => {
    const p = LC.ext.panes[pane]; if (!p) return;
    if (p.action) return p.action(); // e.g. Settings, Manage: open a dialog instead of a list
    S.pane = pane; if (PHONE()) menuToggle(true);
    if (p.main) LC.openApp(pane); else if (S.app) LC.closeApp();
    renderRail(); renderNavNow();
  };
  function renderRail() {
    const rail = $('#rail'); if (!rail || !S.me) return;
    const item = (p) => { const active = S.pane === p.key && !p.action, n = p.badge ? p.badge() || 0 : 0, label = lbl(p.label);
      return el('button', { class: 'rbtn' + (active ? ' on' : ''), 'data-pane': p.key, 'aria-current': active ? 'page' : null, 'aria-label': label + (n ? ` (${n})` : ''), title: label, onclick: () => LC.setPane(p.key) },
        el('span', { class: 'rico' }, LC.icon(p.icon, { filled: active }), n ? el('span', { class: 'rbadge' + (p.live ? ' live' : ''), text: n > 99 ? '99+' : String(n) }) : null), el('span', { class: 'rlabel', text: label })); };
    const all = paneList();
    rail.replaceChildren(el('div', { class: 'rtop' }, ...all.filter((p) => !p.bottom).map(item)), el('div', { class: 'rbottom' }, ...all.filter((p) => p.bottom).map(item)));
    for (const f of LC.ext.rail) { try { f(rail); } catch (e) { console.error('rail hook', e); } }
  }
  LC.renderRail = renderRail;
  // a pane with main(host) shows in the big area instead of a conversation (Teams' Calendar, Files...)
  LC.openApp = (key) => {
    const p = LC.ext.panes[key]; if (!p || !p.main) return;
    if (S.thread) LC.closeThread(); S.app = key; $('#main').classList.add('app-mode');
    $('#title').textContent = lbl(p.title || p.label); $('#topic').replaceChildren(p.subtitle ? lbl(p.subtitle) : ''); $('#headAvatar').replaceChildren(el('div', { class: 'av tile appicon', 'aria-hidden': 'true' }, LC.icon(p.icon, { filled: true })));
    $('#headActions').replaceChildren(...(p.headerActions ? p.headerActions() : [])); $('#tabs').replaceChildren(); $('#callBar').classList.add('hidden');
    $('#chatView').classList.add('hidden'); const host = $('#tabView'); host.classList.remove('hidden'); host.replaceChildren(); menuToggle(false);
    try { p.main(host); } catch (e) { host.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  };
  LC.closeApp = () => { if (!S.app) return; S.app = null; $('#main').classList.remove('app-mode'); };
  // the chat list itself (entries, rows, sections, filters, menus) lives in chatux-list.js
  const briefOf = (m) => { const o = { id: m.id, from: m.from || null, ts: m.ts, text: m.deleted ? '' : String(m.text || '').slice(0, 140), system: m.system || undefined, kind: m.kind, deleted: m.deleted || undefined };
    if (!m.deleted) { if (m.files && m.files.length) o.file = m.files[0].name; if (m.poll) o.poll = m.poll.q; if (m.game) o.game = true; if (m.subject) o.subject = m.subject; if (m.sticker) o.sticker = m.sticker.c || 1; if (m.praise) o.praise = m.praise.b; if (m.announce) o.announce = m.announce.title; if (m.location) o.location = 1; if (m.priority) o.priority = m.priority; if (m.gif) o.gif = 1; if (m.meme) o.meme = 1; }
    return o; };
  LC.briefOf = briefOf;
  const emptyState = (icon, text) => el('div', { class: 'empty' }, LC.icon(icon, { cls: 'big' }), el('p', { text }));
  function renderNavNow() {
    const nav = $('#nav'); if (!nav || !S.me) return; const scroll = nav.scrollTop;
    renderRail(); renderMe(); LC.updateBadge();
    const pane = LC.ext.panes[S.pane] || LC.ext.panes.chat;
    $('#sideTitle').textContent = lbl(pane.label);
    $('#sideActions').replaceChildren(...(pane.actions ? pane.actions() : []));
    if (pane.keepScroll) { try { return pane.render(nav, scroll); } catch (e) { console.error('pane render', e); return nav.replaceChildren(el('p', { class: 'err pad', text: e.message })); } } // the chat list redraws in place
    nav.replaceChildren(); try { return pane.render ? pane.render(nav) : null; } catch (e) { return nav.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  }
  async function renderActivity(nav) {
    nav.replaceChildren(el('p', { class: 'muted small pad', text: t('loading') }));
    try {
      const { results } = await LC.api('/api/search?has=mention'); if (S.pane !== 'activity') return;
      nav.replaceChildren(...(results.length ? results.slice(0, 80).map((m) => el('button', { class: 'act' + ((S.unread[m.chan] || 0) && m.seq > (S.read[m.chan] || 0) ? ' unread' : ''), onclick: () => LC.jumpToMessage(m.chan, m.id) }, LC.avatar(S.users.get(m.from), '', false),
        el('span', { class: 'itext' }, el('span', { class: 'irow' }, el('b', { class: 'name', text: LC.uname(m.from) }), el('time', { class: 'itime', text: LC.shortTime(m.ts) })), el('span', { class: 'small muted', text: t('mentionedIn', { where: LC.chanInfo(m.chan).title }) }), el('span', { class: 'prev', text: LC.snippet(m) })))) : [emptyState('alert', t('noActivity'))]));
    } catch (e) { nav.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  }
  function renderCalls(nav) {
    const live = Object.entries(S.calls), people = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed && !u.deleted).sort((a, b) => ((b.presence !== 'offline') - (a.presence !== 'offline')) || LC.uname(a.id).localeCompare(LC.uname(b.id)));
    const head = (label) => el('div', { class: 'sec' }, el('span', { class: 'sectitle', text: label }));
    nav.replaceChildren(head(t('activeCalls')), ...(live.length ? live.map(([chan, c]) => el('div', { class: 'callrow' }, el('span', { class: 'livecall' }, LC.icon(c.mode === 'video' ? 'video' : 'call', { filled: true })), el('span', { class: 'itext' }, el('b', { class: 'name', text: LC.chanInfo(chan).title }), el('span', { class: 'prev', text: c.participants.map(LC.uname).join(', ') })),
      LC.inCall() && LC.callChan() === chan ? el('button', { class: 'secondary sm', text: t('openCall'), onclick: () => LC.showCall() }) : el('button', { class: 'primary sm', text: t('joinCall'), onclick: async () => { await LC.openChat(chan); LC.joinCall(chan); } }))) : [el('p', { class: 'muted small pad', text: t('noActiveCalls') })]),
    head(t('people')), ...people.map((u) => { const dm = LC.dmId(S.me.id, u.id); return el('div', { class: 'callrow' }, LC.avatar(u, '', true), el('span', { class: 'itext' }, el('b', { class: 'name', text: LC.uname(u.id) }), el('span', { class: 'prev', text: t(u.presence) })), LC.ibtn('video', t('videoCallWith', { name: LC.uname(u.id) }), async () => { await LC.openChat(dm); LC.startCall(dm, 'video'); }), LC.ibtn('call', t('voiceCallWith', { name: LC.uname(u.id) }), async () => { await LC.openChat(dm); LC.startCall(dm, 'voice'); })); }),
    ...(people.length ? [] : [el('div', { class: 'empty small', text: t('nobodyYet') })]));
  }
  async function renderSaved(nav) {
    const ids = LC.prefs().saved || []; if (!ids.length) return nav.replaceChildren(emptyState('bookmark', t('noSaved')));
    nav.replaceChildren(el('p', { class: 'muted small pad', text: t('loading') }));
    try {
      const { messages } = await LC.api('/api/messages/byids', { ids }); if (S.pane !== 'saved') return;
      nav.replaceChildren(...(messages.length ? messages.sort((a, b) => b.ts - a.ts).map((m) => el('div', { class: 'act' }, el('button', { class: 'plain actmain', onclick: () => LC.jumpToMessage(m.chan, m.id) }, LC.avatar(S.users.get(m.from), '', false), el('span', { class: 'itext' }, el('span', { class: 'irow' }, el('b', { class: 'name', text: LC.uname(m.from) }), el('time', { class: 'itime', text: LC.shortTime(m.ts) })), el('span', { class: 'small muted', text: LC.chanInfo(m.chan).title }), el('span', { class: 'prev', text: LC.snippet(m) }))),
        LC.ibtn('bookmark_off', t('unsave'), () => LC.setPrefs({ saved: (LC.prefs().saved || []).filter((x) => x !== m.id) }).then(() => renderSaved(nav))))) : [emptyState('bookmark', t('noSaved'))]));
    } catch (e) { nav.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  }
  Object.assign(LC.ext.panes, {
    activity: { icon: 'alert', label: () => t('railActivity'), order: 10, badge: () => Object.values(S.mentions).reduce((a, b) => a + b, 0), render: renderActivity,
      actions: () => [LC.ibtn('mail_read', t('markAllRead'), () => Object.keys(S.unread).filter((c) => S.unread[c] || S.mentions[c]).forEach((c) => LC.api('/api/read', { chan: c })))] },
    chat: { icon: 'chat', label: () => t('railChat'), order: 20, badge: () => LC.totalUnread(), keepScroll: true, render: (nav, scroll) => LC.renderChats(nav, scroll),
      actions: () => (LC.chatListActions ? LC.chatListActions() : [LC.ibtn('filter', t('quickSwitcher'), () => LC.quickSwitch()), LC.ibtn('compose', t('newChannel'), () => LC.newChannelDialog())]) },
    calls: { icon: 'call', label: () => t('railCalls'), order: 60, badge: () => Object.keys(S.calls).length, live: true, render: renderCalls },
    saved: { icon: 'bookmark', label: () => t('savedMsgs'), order: 80, render: renderSaved },
    manage: { icon: 'shield_person', label: () => t('railManage'), order: 900, bottom: true, hidden: () => !LC.isAdmin(), badge: () => S.pendingReqs.length, action: () => LC.adminPanel() },
    settings: { icon: 'settings', label: () => t('settings'), order: 950, bottom: true, action: () => LC.settingsPanel() },
  });
  function renderMe() {
    const box = $('#meBox'); if (!box || !S.me) return; const m = S.me;
    box.replaceChildren(el('button', { class: 'meb', onclick: (e) => LC.profileMenu(e.currentTarget), 'aria-label': t('myStatus') + ': ' + m.name, title: m.name + ' · ' + (m.statusText || t(m.presence === 'invisible' ? 'invisible' : m.presence)), 'aria-haspopup': 'menu' }, LC.avatar(m, '', true)));
  }
  function presenceMenu(anchor) {
    const set = (state) => LC.api('/api/presence', { state }).catch((e) => LC.toast(e.message)), cur = S.me.presence;
    LC.menu(anchor, [{ icon: 'person', label: S.me.name + (S.me.statusText ? ' — ' + S.me.statusText : ''), disabled: true }, 'sep',
      { icon: 'presence_available', iconCls: 'p-online', label: t('online'), checked: cur === 'auto', fn: () => set('auto') }, { icon: 'presence_away', iconCls: 'p-away', label: t('away'), checked: cur === 'away', fn: () => set('away') },
      { icon: 'presence_dnd', iconCls: 'p-dnd', label: t('dnd'), checked: cur === 'dnd', fn: () => set('dnd') }, { icon: 'presence_offline', iconCls: 'p-offline', label: t('invisible'), checked: cur === 'invisible', fn: () => set('invisible') }, 'sep',
      { icon: 'person_edit', label: t('editProfile'), fn: () => LC.settingsPanel('profile') }, { icon: 'settings', label: t('settings'), fn: () => LC.settingsPanel() }, ...LC.extItems(LC.ext.profileMenu),
      { icon: 'sign_out', label: t('signOut'), fn: async () => { if (await LC.confirm(t('confirmSignOut'))) LC.signOut('manual'); } }]);
  }
  LC.profileMenu = presenceMenu; // replaceable (people/status features)
  LC.toggleFavorite = (uid) => { const f = LC.prefs().favorites || []; LC.setPrefs({ favorites: f.includes(uid) ? f.filter((x) => x !== uid) : [...f, uid] }); };
  LC.nicknameDialog = async (uid) => { const cur = (LC.prefs().nicknames || {})[uid] || '', v = await LC.prompt(t('nicknameFor', { name: LC.realName(uid) }), { value: cur, max: 24, placeholder: t('nicknameHint') }); if (v === null) return; const n = { ...(LC.prefs().nicknames || {}) }; if (v.trim()) n[uid] = v.trim(); else delete n[uid]; LC.setPrefs({ nicknames: n }); };
  LC.userMenu = (anchor, uid) => {
    const u = S.users.get(uid); if (!u) return; const me = uid === S.me.id, dm = LC.dmId(S.me.id, uid);
    LC.menu(anchor, [me ? { icon: 'person_edit', label: t('editProfile'), fn: () => LC.settingsPanel('profile') } : { icon: 'chat', label: t('messageUser', { name: LC.uname(uid) }), fn: () => LC.openChat(dm) },
      !me ? { icon: 'video', label: t('videoCall'), fn: async () => { await LC.openChat(dm); LC.startCall(dm, 'video'); } } : null, !me ? { icon: 'call', label: t('voiceCall'), fn: async () => { await LC.openChat(dm); LC.startCall(dm, 'voice'); } } : null,
      !me ? { icon: 'tag', label: t('setNickname'), fn: () => LC.nicknameDialog(uid) } : null, !me ? { icon: 'star', label: (LC.prefs().favorites || []).includes(uid) ? t('unfavorite') : t('favorite'), fn: () => LC.toggleFavorite(uid) } : null,
      !me && LC.isAdmin() ? 'sep' : null, !me && LC.isAdmin() ? { icon: 'shield_person', label: t('manageUser'), fn: () => LC.adminPanel('people', uid) } : null,
      u.statusText ? 'sep' : null, u.statusText ? { icon: u.statusEmoji || 'comment', label: u.statusText, disabled: true } : null, ...LC.extItems(LC.ext.userMenu, uid)]);
  };

  // ---------- header, tabs ----------
  const TABS = [['chat', 'chat', 'tabChat'], ['files', 'folder', 'tabFiles'], ['notes', 'note', 'tabNotes'], ['board', 'whiteboard', 'tabBoard'], ['todos', 'task_list_ltr', 'tabTodos'], ['calendar', 'calendar_ltr', 'tabCalendar']];
  LC.tabsFor = (chan) => {
    const ext = LC.ext.tabs.filter((x) => !x.when || x.when(chan)), keys = new Set(ext.map((x) => x.key));
    return [...TABS.filter(([k]) => !keys.has(k)).map(([key, icon, lab], i) => ({ key, icon, label: t(lab), order: i * 10 })), ...ext.map((x) => ({ ...x, label: lbl(x.label) }))].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  };
  function renderHeader() {
    const i = LC.chanInfo(S.chan); if (!S.chan || S.app) return;
    $('#title').textContent = LC.chatTitle ? LC.chatTitle(S.chan) : i.title; $('#headAvatar').replaceChildren(LC.chatLead(S.chan)); const topic = $('#topic');
    if (LC.isSelfChat && LC.isSelfChat(S.chan)) topic.replaceChildren(t('cx_notesToSelf'));
    else if (i.kind === 'dm') { const u = i.peer; topic.replaceChildren(u ? (u.presence !== 'offline' ? t(u.presence) : u.lastSeen ? t('lastSeen', { when: LC.fmtDateTime(u.lastSeen) }) : t('offline')) + (u.statusText ? ' · ' + (u.statusEmoji || '') + ' ' + u.statusText : '') : ''); }
    else if (i.c && i.c.members) topic.replaceChildren(t('peopleCount', { n: i.c.members.length }) + ' · ' + i.c.members.map(LC.uname).join(', '));
    else { const bits = []; if (i.topic) bits.push(i.topic); if (i.c && i.c.readonly) bits.push(el('span', { class: 'tbit' }, LC.icon('megaphone'), t('announcements'))); if (i.c && i.c.slow) bits.push(el('span', { class: 'tbit' }, LC.icon('animal_turtle'), t('slowMode', { n: i.c.slow }))); if (i.c && i.c.ttl) bits.push(el('span', { class: 'tbit' }, LC.icon('timer'), LC.ttlLabel(i.c.ttl))); topic.replaceChildren(...bits.flatMap((b, k) => (k ? [' · ', b] : [b]))); }
    const acts = $('#headActions'), live = S.calls[S.chan], group = !!(i.c && LC.isGroupChat && LC.isGroupChat(i.c));
    acts.replaceChildren(
      el('div', { class: 'callgroup' + (live ? ' live' : ''), role: 'group', 'aria-label': t('call') }, LC.ibtn('video', live ? t('joinCall') : t('videoCall'), () => (live ? LC.joinCall(S.chan, 'video') : LC.startCall(S.chan, 'video')), { cls: 'icon cg' }), LC.ibtn('call', live ? t('joinCall') : t('voiceCall'), () => (live ? LC.joinCall(S.chan, 'voice') : LC.startCall(S.chan, 'voice')), { cls: 'icon cg' })),
      ...LC.extItems(LC.ext.headerActions, S.chan),
      ...(group ? [el('button', { type: 'button', class: 'secondary sm withicon cx-peoplebtn', title: t('cx_members', { n: i.c.members.length }), 'aria-label': t('cx_members', { n: i.c.members.length }), onclick: () => LC.chatInfo(S.chan) }, LC.icon('people'), el('span', { text: String(i.c.members.length) }))] : []),
      LC.ibtn('search', t('searchInChat') + ' (Ctrl+F)', () => (LC.openFind ? LC.openFind() : LC.openSearch({ chan: S.chan }))), LC.ibtn('pin', t('pinnedMsgs'), () => LC.pinnedList()), LC.ibtn('info', t('chatInfo'), () => LC.chatInfo(S.chan)),
      LC.ibtn('more_horizontal', t('moreOptions'), (e) => LC.menu(e.currentTarget, [{ icon: 'calendar_arrow_right', label: t('jumpToDate'), fn: () => jumpDateMenu() },
        group && LC.renameChat ? { icon: 'rename', label: t('cx_renameChat'), fn: () => LC.renameChat(S.chan) } : null, group && LC.pickChatPicture ? { icon: 'image_edit', label: t('cx_changePic'), fn: () => LC.pickChatPicture(S.chan) } : null,
        { icon: 'chat_multiple', label: t('chatOptions'), fn: () => LC.chatMenu(e.target.closest('button') || $('#headActions'), S.chan) }, ...LC.extItems(LC.ext.headerMenu, S.chan)]), { menu: true }));
    LC.renderCallBar && LC.renderCallBar();
  }
  LC.renderHeader = renderHeader;
  function jumpDateMenu() {
    const inp = el('input', { type: 'date', 'aria-label': t('jumpToDate') }); LC.modal([el('h2', {}, LC.icon('calendar_arrow_right'), ' ' + t('jumpToDate')), inp, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('go'), onclick: () => { if (!inp.value) return; LC.closeModal(); LC.jumpToDate(new Date(inp.value + 'T00:00:00').getTime()); } }))]);
  }
  function renderTabs() {
    if (S.app) return; const box = $('#tabs'); box.replaceChildren(...LC.tabsFor(S.chan).map(({ key: k, icon: ic, label }) => el('button', { class: 'tab' + (S.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(S.tab === k), 'data-tab': k, onclick: () => LC.setTab(k) }, LC.icon(ic, { filled: S.tab === k }), el('span', { text: label }))));
  }
  LC.setTab = (tab) => {
    S.tab = tab; renderTabs(); const chat = tab === 'chat'; $('#chatView').classList.toggle('hidden', !chat); $('#tabView').classList.toggle('hidden', chat);
    if (chat) { renderMessages('keep'); } else LC.renderTab && LC.renderTab(tab);
    if (!chat && S.thread) LC.closeThread();
  };

  // ---------- opening chats / windows ----------
  async function fetchWindow(chan, q) { const d = await LC.api('/api/messages?chan=' + encodeURIComponent(chan) + (q || '')); return d; }
  async function ensureWindow(chan) {
    if (S.win[chan] && S.win[chan].loaded) return S.win[chan];
    try { const d = await fetchWindow(chan); S.win[chan] = { msgs: d.messages, older: d.older, newer: d.newer, loaded: true }; }
    catch (e) { S.win[chan] = { msgs: [], older: false, newer: false, loaded: true, error: e.message }; }
    return S.win[chan];
  }
  LC.openChat = async (chan, o = {}) => {
    if (!chan || !(chan.startsWith('dm:') ? S.users.has(LC.peerOf(chan)) : S.channels.has(chan))) chan = 'general';
    if (S.app) { LC.closeApp(); if (LC.ext.panes[S.pane] && LC.ext.panes[S.pane].main) S.pane = 'chat'; }
    const changed = S.chan !== chan; S.chan = chan; LC.ls.set('lc_chan', chan);
    if (changed) { LC.closeThread(); S.tab = 'chat'; S.readAt[chan] = S.read[chan] ?? 0; stick = true; if (S.cx) S.cx.keepUnread = null; }
    LC.emitLocal('cx:chat', { chan, changed });
    menuToggle(false); renderHeader(); renderTabs(); LC.renderNav();
    $('#chatView').classList.toggle('hidden', S.tab !== 'chat'); $('#tabView').classList.toggle('hidden', S.tab === 'chat');
    if (changed) LC.composers.main.refresh(); renderTyping();
    if (S.tab !== 'chat') return LC.renderTab && LC.renderTab(S.tab);
    const w = await ensureWindow(chan); if (S.chan !== chan) return;
    if (o.from) await loadAround(chan, o.from); else if (w.newer && changed) { const d = await fetchWindow(chan); S.win[chan] = { msgs: d.messages, older: d.older, newer: false, loaded: true }; }
    renderMessages(o.focusId ? 'keep' : 'bottom'); if (o.focusId) flashMessage(o.focusId);
    if (LC.visible() || S.unread[chan] || (S.cx && S.cx.unread[chan])) LC.markRead(chan); if (!matchMedia('(pointer:coarse)').matches && !o.noFocus) LC.composers.main.focus();
  };
  async function loadAround(chan, ts) { const d = await fetchWindow(chan, '&from=' + ts + '&limit=60'); S.win[chan] = { msgs: d.messages, older: d.older, newer: d.newer, loaded: true }; }
  LC.markRead = (chan, force) => {
    chan ||= S.chan; if (!chan || !S.me) return; const flagged = !!(S.cx && S.cx.unread[chan]), had = S.unread[chan] || S.mentions[chan] || flagged;
    if (S.cx && S.cx.keepUnread === chan && !force) return; // you just marked this chat unread while looking at it
    if (!had && !force && !(S.chan === chan && S.win[chan] && S.win[chan].msgs.length)) return;
    S.unread[chan] = 0; S.mentions[chan] = 0; if (flagged) delete S.cx.unread[chan]; LC.api('/api/read', { chan }).catch(() => {}); LC.renderNav();
  };
  LC.jumpToDate = async (ts) => { const chan = S.chan; try { await loadAround(chan, ts); renderMessages('top'); } catch (e) { LC.toast(e.message); } };
  // o.q: also highlight these words in the conversation (search results, find in chat)
  LC.jumpToMessage = async (chan, id, o = {}) => {
    if (S.chan !== chan || S.tab !== 'chat') await LC.openChat(chan, { noFocus: true });
    if (o.q !== undefined) LC.highlightQuery = o.q;
    const w = S.win[chan]; let found = w && w.msgs.find((m) => m.id === id);
    if (!found) { try { const r = await LC.api('/api/messages/byids', { ids: [id] }), m = r.messages[0]; if (!m) return LC.toast(t('msgGone')); if (m.thread) { const root = (await LC.api('/api/messages/byids', { ids: [m.thread] })).messages[0]; if (root) { await LC.openThread(root); return flashMessage(id, '#threadMsgs'); } } await loadAround(chan, m.ts); renderMessages('keep'); } catch (e) { return LC.toast(e.message); } }
    flashMessage(id);
  };
  const flashMessage = (id, where = '#msgs') => raf(() => { const n = $(where) && $(where).querySelector(`[data-id="${id}"]`); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1800); } });
  LC.flashMessage = flashMessage;
  async function loadOlder() {
    const w = S.win[S.chan]; if (!w || !w.older || loadingOlder || !w.msgs.length) return; loadingOlder = true; const box = $('#msgs'), h = box.scrollHeight, chan = S.chan;
    try { const d = await fetchWindow(chan, '&before=' + w.msgs[0].seq); if (S.chan === chan) { w.msgs = d.messages.concat(w.msgs); w.older = d.older; renderMessages('anchor', h); } } catch (e) { LC.toast(e.message); } loadingOlder = false;
  }
  async function loadNewer() {
    const w = S.win[S.chan]; if (!w || !w.newer || loadingNewer || !w.msgs.length) return; loadingNewer = true; const chan = S.chan;
    try { const d = await fetchWindow(chan, '&after=' + w.msgs[w.msgs.length - 1].seq); if (S.chan === chan) { w.msgs = w.msgs.concat(d.messages); w.newer = d.newer; renderMessages('keep'); } } catch (e) { LC.toast(e.message); } loadingNewer = false;
  }
  async function toLatest() { const chan = S.chan, d = await fetchWindow(chan); S.win[chan] = { msgs: d.messages, older: d.older, newer: false, loaded: true }; renderMessages('bottom'); }

  // ---------- message list ----------
  function renderMessages(mode = 'keep', anchorH) {
    const box = $('#msgs'); if (!box || !S.chan || S.tab !== 'chat') return; const w = S.win[S.chan]; if (!w) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140; let cache = caches.get(S.chan); if (!cache) caches.set(S.chan, cache = new Map());
    const nodes = [], list = w.msgs, lastMineId = [...list].reverse().find((m) => m.from === S.me.id && !m.deleted && !m.thread);
    if (w.error) nodes.push(el('div', { class: 'empty' }, LC.icon('lock_closed', { cls: 'big' }), el('div', { text: w.error })));
    if (w.older) nodes.push(el('button', { class: 'more', text: t('loadEarlier'), onclick: loadOlder }));
    if (!list.length && !w.error) nodes.push(el('div', { class: 'empty hello' }, LC.chatLead(S.chan, 'xl'), el('h2', { text: LC.chanInfo(S.chan).title }), el('div', { class: 'muted', text: t('noMessages') })));
    let prev = null, day = '', divider = false; const readAt = S.readAt[S.chan] ?? Infinity, post = !!(LC.isPostsChat && LC.isPostsChat(S.chan)); box.classList.toggle('cx-posts', post);
    for (const m of list) {
      const d = new Date(m.ts).toDateString(); if (d !== day) { nodes.push(el('div', { class: 'daysep' }, el('span', { text: LC.dayLabel(m.ts) }))); day = d; prev = null; }
      if (!divider && m.seq > readAt && m.from && m.from !== S.me.id && !m.deleted) { divider = true; nodes.push(el('div', { class: 'unreadsep', id: 'unreadSep', role: 'separator' }, el('span', { text: t('newMessages') }))); prev = null; }
      const grouped = !post && !!prev && !prev.system && !m.system && !prev.deleted && !m.deleted && prev.from === m.from && m.ts - prev.ts < 300000 && !m.reply && !m.fwd && !prev.poll && !prev.game && !m.priority && !m.subject && !m.announce && !prev.announce;
      const o = { grouped, lastMine: !!lastMineId && lastMineId.id === m.id, post: post && !m.system, open: post && !!S.cx && S.cx.openPosts.has(m.id) }, sig = LC.msgSig(m, o), c = cache.get(m.id);
      let node; if (c && c.sig === sig) node = c.node; else { node = LC.msgEl(m, o); cache.set(m.id, { sig, node }); }
      nodes.push(node); prev = m;
    }
    if (w.newer) nodes.push(el('button', { class: 'more', text: t('loadNewer'), onclick: loadNewer }));
    for (const ob of S.outbox.filter((x) => x.body.chan === S.chan)) nodes.push(el('div', { class: 'msg pending mine' }, el('div', { class: 'gut' }), el('div', { class: 'body' }, el('div', { class: 'txt', text: ob.body.text || t('attachment') }), el('div', { class: 'small muted' }, t('notSent') + ' ', el('button', { class: 'link', text: t('retry'), onclick: () => LC.outboxFlush() }), ' · ', el('button', { class: 'link', text: t('discard'), onclick: () => { S.outbox = S.outbox.filter((x) => x !== ob); LC.ls.set('lc_outbox', S.outbox); renderMessages('keep'); } })))));
    for (const k of [...cache.keys()]) if (!list.some((m) => m.id === k)) cache.delete(k);
    box.replaceChildren(...nodes); LC.measureClamps && LC.measureClamps(box); LC.emitLocal('cx:drawn', box);
    if (mode === 'bottom' || (mode === 'near' && near)) { box.scrollTop = box.scrollHeight; stick = true; }
    else if (mode === 'anchor') box.scrollTop += box.scrollHeight - anchorH; else if (mode === 'top') box.scrollTop = 0;
    updateToBottom();
  }
  LC.renderMessages = renderMessages; LC.renderOutbox = () => renderMessages('keep');
  const updateToBottom = () => { const box = $('#msgs'), w = S.win[S.chan], far = box.scrollHeight - box.scrollTop - box.clientHeight > 320; $('#toBottom').classList.toggle('hidden', !(far || (w && w.newer))); };
  document.addEventListener('DOMContentLoaded', () => {
    const box = $('#msgs');
    box.addEventListener('scroll', () => { stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80; updateToBottom(); if (box.scrollTop < 100) loadOlder(); if (stick) { const w = S.win[S.chan]; if (w && w.newer) loadNewer(); } if (stick && LC.visible()) LC.markRead(S.chan); }, { passive: true });
    box.addEventListener('load', () => { if (stick) box.scrollTop = box.scrollHeight; }, true);
    $('#toBottom').addEventListener('click', async () => { const w = S.win[S.chan]; if (w && w.newer) await toLatest(); else { box.scrollTop = box.scrollHeight; } });
  });

  // ---------- typing ----------
  function renderTyping() {
    const line = $('#typing'); if (!line) return; const now = Date.now(), tp = S.typing[S.chan] || {};
    const names = Object.entries(tp).filter(([, v]) => now - v.ts < 3500 && !v.thread).map(([id]) => LC.uname(id));
    line.textContent = names.length ? (names.length > 2 ? t('severalTyping') : names.join(' & ') + ' ' + (names.length > 1 ? t('areTyping') : t('isTyping'))) : '';
    const tl = $('#threadTyping'); if (tl && S.thread) { const n = Object.entries(tp).filter(([, v]) => now - v.ts < 3500 && v.thread === S.thread.id).map(([id]) => LC.uname(id)); tl.textContent = n.length ? n.join(' & ') + ' ' + t('isTyping') : ''; }
  }
  setInterval(renderTyping, 1200);
  LC.on('typing', (e) => { if (e.user === S.me.id) return; (S.typing[e.chan] ||= {})[e.user] = { ts: Date.now(), thread: e.thread }; renderTyping(); setTimeout(renderTyping, 3700); });

  // ---------- threads ----------
  LC.openThread = async (m) => {
    if (m.thread) { const r = (await LC.api('/api/messages/byids', { ids: [m.thread] })).messages[0]; if (r) m = r; }
    if (S.chan !== m.chan) await LC.openChat(m.chan);
    S.thread = { chan: m.chan, id: m.id }; threadCache = new Map(); const panel = $('#threadPanel'); $('#app').classList.add('with-thread'); panel.classList.remove('hidden');
    panel.replaceChildren(el('div', { class: 'thread-head' }, el('b', {}, LC.icon('comment'), ' ' + t('thread')), LC.ibtn('dismiss', t('close'), LC.closeThread)), el('div', { class: 'msgs thread-msgs', id: 'threadMsgs' }), el('div', { id: 'threadTyping', class: 'typing' }), el('div', { id: 'threadComposer' }));
    $('#threadComposer').append(LC.composers.thread.el); LC.composers.thread.refresh();
    try { const d = await LC.api(`/api/thread?chan=${encodeURIComponent(m.chan)}&id=${m.id}`); threadMsgs = [d.root, ...d.messages]; } catch (e) { LC.toast(e.message); return LC.closeThread(); }
    renderThread(true); LC.composers.thread.focus(); LC.emitLocal('cx:thread', { id: m.id, chan: m.chan });
  };
  LC.closeThread = () => { if (!S.thread) return; S.thread = null; threadMsgs = []; $('#threadPanel').classList.add('hidden'); $('#threadPanel').replaceChildren(); $('#app').classList.remove('with-thread'); };
  function renderThread(bottom) {
    const box = $('#threadMsgs'); if (!box || !S.thread) return; const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120; const nodes = []; let prev = null;
    threadMsgs.forEach((m, i) => {
      const grouped = i > 1 && !!prev && prev.from === m.from && m.ts - prev.ts < 300000 && !m.deleted && !prev.deleted, o = { grouped, thread: true }, sig = LC.msgSig(m, o), c = threadCache.get(m.id);
      let node; if (c && c.sig === sig) node = c.node; else { node = LC.msgEl(m, o); threadCache.set(m.id, { sig, node }); }
      nodes.push(node); if (i === 0) nodes.push(el('div', { class: 'daysep' }, el('span', { text: t('replies', { n: threadMsgs.length - 1 }) }))); prev = m;
    });
    box.replaceChildren(...nodes); LC.measureClamps && LC.measureClamps(box); LC.emitLocal('cx:drawn', box); if (bottom || near) box.scrollTop = box.scrollHeight;
  }

  // ---------- incoming events ----------
  const chatVisible = (m) => S.chan === m.chan && S.tab === 'chat' && LC.visible() && (!m.thread || (S.thread && S.thread.id === m.thread));
  LC.on('message', (m) => {
    const mine = m.from === S.me.id; if (!m.thread) S.last[m.chan] = briefOf(m);
    if (m.thread) { if (S.thread && S.thread.id === m.thread && !threadMsgs.some((x) => x.id === m.id)) { threadMsgs.push(m); renderThread(false); } }
    else { const w = S.win[m.chan]; if (w && w.loaded && !w.newer && !w.msgs.some((x) => x.id === m.id)) w.msgs.push(m); }
    if (m.from && S.typing[m.chan]) delete S.typing[m.chan][m.from];
    if (m.chan === S.chan && S.tab === 'chat' && !m.thread) renderMessages(mine ? 'bottom' : 'near');
    if (m.from && !mine) {
      if (chatVisible(m)) { setTimeout(() => LC.markRead(m.chan, true), 400); }
      else { S.unread[m.chan] = (S.unread[m.chan] || 0) + 1; if (LC.mentionsMe(m)) S.mentions[m.chan] = (S.mentions[m.chan] || 0) + 1; }
      if (LC.shouldAlert(m) && !chatVisible(m)) LC.alertMessage(m); else if (chatVisible(m) && !m.thread) LC.sr(`${LC.uname(m.from)}: ${LC.snippet(m)}`);
    }
    renderTyping(); LC.renderNav();
  });
  LC.alertMessage = (m) => {
    const np = LC.prefs().notif || {}; if (np.sound !== false) LC.playSound();
    const title = LC.uname(m.from) + (m.chan.startsWith('dm:') ? '' : ' · ' + LC.chanInfo(m.chan).title), body = np.previews === false ? t('newMessage') : LC.snippet(m) || t('newMessage');
    if (np.desktop === false) return;
    if (LC.native) LC.native.notify(title, body, m.chan); else if ('Notification' in window && Notification.permission === 'granted' && !LC.visible()) { try { const n = new Notification(title, { body, tag: m.chan }); n.onclick = () => { window.focus(); LC.openChat(m.chan); }; } catch {} }
  };
  if (LC.native && LC.native.onOpenChat) LC.native.onOpenChat((chan) => LC.openChat(chan));
  LC.on('update', (m) => {
    if (S.last[m.chan] && S.last[m.chan].id === m.id) { S.last[m.chan] = briefOf(m); LC.renderNav(); }
    if (S.cx && m.threadCount && S.cx.follows.has(m.id)) { const old = S.cx.threads[m.id]; S.cx.threads[m.id] = { n: m.threadCount, chan: m.chan }; if (!old || old.n !== m.threadCount) LC.renderNav(); }
    const w = S.win[m.chan]; if (w) { const i = w.msgs.findIndex((x) => x.id === m.id); if (i >= 0) w.msgs[i] = m; }
    if (m.chan === S.chan && S.tab === 'chat') renderMessages('keep');
    if (S.thread) { const i = threadMsgs.findIndex((x) => x.id === m.id); if (i >= 0) { threadMsgs[i] = m; renderThread(false); } }
  });
  LC.on('purge', (e) => {
    const gone = new Set(e.ids), w = S.win[e.chan]; if (S.last[e.chan] && gone.has(S.last[e.chan].id)) { const rest = w && w.msgs.filter((m) => !gone.has(m.id) && !m.thread); if (rest && rest.length) S.last[e.chan] = briefOf(rest[rest.length - 1]); else delete S.last[e.chan]; LC.renderNav(); } if (w) w.msgs = w.msgs.filter((m) => !gone.has(m.id));
    if (e.chan === S.chan && S.tab === 'chat') renderMessages('keep'); if (S.thread && (gone.has(S.thread.id))) LC.closeThread(); else if (S.thread) { threadMsgs = threadMsgs.filter((m) => !gone.has(m.id)); renderThread(false); }
  });
  LC.on('seen', (e) => { ((S.peers[e.chan] ||= {})[e.user] ||= { seen: 0, delivered: 0 }).seen = e.seq; if (e.chan === S.chan) renderMessages('keep'); });
  LC.on('delivered', (e) => { if (e.user === S.me.id) return; const p = ((S.peers[e.chan] ||= {})[e.user] ||= { seen: 0, delivered: 0 }); p.delivered = Math.max(p.delivered, e.seq); if (e.chan === S.chan) renderMessages('keep'); });
  LC.on('readstate', (e) => { S.read[e.chan] = e.seq; if (!(chatVisible({ chan: e.chan }) === false && false)) { S.unread[e.chan] = 0; S.mentions[e.chan] = 0; LC.renderNav(); } });
  LC.on('channel', () => { LC.renderNav(); if (S.chan) renderHeader(); });
  LC.on('user', () => { LC.renderNav(); if (S.chan) { renderHeader(); if (S.tab === 'chat') renderMessages('keep'); } });
  LC.on('me', () => { LC.renderNav(); if (S.chan) renderHeader(); });
  LC.on('meta', (m) => { $('#brandName').textContent = m.name; $('#brand').title = m.name; });
  LC.on('settings', () => LC.renderNav());
  const leave = (e) => { if (S.chan === e.id) { LC.toast(t('chatRemoved')); LC.openChat('general'); } LC.renderNav(); };
  LC.on('channel_removed', leave); LC.on('channel_deleted', leave);
  LC.on('dmttl', () => renderHeader());
  LC.on('reminder', (r) => { LC.toast(t('reminder') + ': ' + r.text, { ms: 10000 }); LC.playSound('ping'); if (LC.native && !LC.visible()) LC.native.notify(t('reminder'), r.text, r.chan); });
  LC.on('schedulefail', (e) => LC.toast(t('scheduleFailed', { why: e.error })));
  LC.on('joinrequest', (r) => {
    if (!LC.isAdmin()) return; LC.renderNav(); LC.playSound('ping');
    LC.toast(t('wantsToJoin', { name: r.name }) + (r.existing ? ' ' + t('existingAcct') : ''), { ms: 12000, action: { label: t('review'), fn: () => LC.adminPanel('requests') } });
    if (LC.native && !LC.visible()) LC.native.notify(t('joinRequest'), t('wantsToJoin', { name: r.name }), null);
  });
  LC.on('joindecided', () => LC.renderNav());
  LC.on('init', (d) => {
    if (LC.cxInit) LC.cxInit(d);
    $('#app').classList.remove('hidden'); $('#brandName').textContent = S.chatName; $('#brand').title = S.chatName; LC.banner(null);
    const want = S.chan || LC.ls.get('lc_chan') || 'general'; S.chan = null; caches.clear(); S.readAt = {};
    const first = !booted, wasList = $('#app').classList.contains('list-mode'); booted = true; // phones start on the chat list; a reconnect keeps whatever was open
    const link = LC.takeHashLink ? LC.takeHashLink() : null; // #m=<chan>/<id>: open that message
    LC.openChat(link ? link.chan : want).then(() => { if (PHONE()) menuToggle(link ? false : first || wasList); if (link) LC.jumpToMessage(link.chan, link.id); }); LC.updateBadge(); startIdle();
  });
  LC.on('lang', () => { renderTabs(); if (S.chan) renderHeader(); LC.renderNav(); });
  LC.on('callstate', () => { renderRail(); if (S.pane === 'calls') LC.renderNav(); if (S.chan) renderHeader(); });
  window.addEventListener('focus', () => { if (S.chan && (S.unread[S.chan] || S.mentions[S.chan])) LC.markRead(S.chan); if (S.native) void 0; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.chan && S.unread[S.chan]) LC.markRead(S.chan); });

  // ---------- idle presence ----------
  let lastAct = Date.now(), idle = false, idleStarted = false;
  function startIdle() {
    if (idleStarted) return; idleStarted = true;
    const act = () => { lastAct = Date.now(); if (idle) { idle = false; LC.api('/api/presence', { idle: false }).catch(() => {}); } };
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'focus']) window.addEventListener(ev, act, { passive: true });
    setInterval(() => { if (!idle && Date.now() - lastAct > 300000 && S.me && S.me.presence === 'auto') { idle = true; LC.api('/api/presence', { idle: true }).catch(() => {}); } }, 30000);
  }

  // ---------- search: LC.openSearch, the search box, find in chat (Ctrl+F) live in chatux-search.js ----------

  // ---------- pinned list, history, seen-by, forward ----------
  LC.pinnedList = async () => {
    const out = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('searching') })); LC.modal([el('h2', {}, LC.icon('pin'), ' ' + t('pinnedMsgs')), out, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
    try { const { results } = await LC.api('/api/search?has=pin&chan=' + encodeURIComponent(S.chan)); out.replaceChildren(...(results.length ? results.map((m) => el('div', { class: 'hit row-between' }, el('button', { class: 'plain', onclick: () => { LC.closeModal(); LC.jumpToMessage(m.chan, m.id); } }, el('small', { text: `${LC.uname(m.from)} · ${LC.fmtDateTime(m.ts)}` }), el('div', { text: LC.snippet(m) })), LC.canPin(m) ? el('button', { class: 'secondary sm', text: t('unpin'), onclick: () => LC.api('/api/pin', { id: m.id }).then(() => LC.pinnedList()) }) : null)) : [el('p', { class: 'muted', text: t('noPins') })])); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };
  LC.showHistory = async (m) => { try { const { versions } = await LC.api('/api/msg/history?id=' + m.id); LC.modal([el('h2', {}, LC.icon('history'), ' ' + t('editHistory')), ...versions.map((v, i) => el('div', { class: 'ver' }, el('small', { class: 'muted', text: (i === 0 ? t('original') : v.current ? t('current') : t('edit') + ' ' + i) + ' · ' + LC.fmtDateTime(v.ts) }), el('div', { class: 'txt' }, LC.renderText(v.text || '')))), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]); } catch (e) { LC.toast(e.message); } };
  LC.showSeenBy = async (m) => {
    try {
      const { users } = await LC.api(`/api/seenby?chan=${encodeURIComponent(m.chan)}&seq=${m.seq}`); const info = m.chan.startsWith('dm:') ? LC.tickState(m) : '';
      LC.modal([el('h2', {}, LC.icon('eye'), ' ' + t('seenByMenu')), info ? el('p', { text: t('tick_' + info) }) : null, users.length ? el('ul', { class: 'plainlist' }, users.map((id) => el('li', {}, LC.avatar(S.users.get(id), 'sm', false), ' ' + LC.uname(id)))) : el('p', { class: 'muted', text: t('seenNobody') }), el('p', { class: 'muted small', text: t('seenNote') }), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]);
    } catch (e) { LC.toast(e.message); }
  };
  LC.forwardDialog = (m) => {
    const q = el('input', { placeholder: t('searchChats'), 'aria-label': t('searchChats') }), list = el('div', { class: 'results' });
    const items = () => { const e = LC.chatEntries(); return [...e.chans.map((x) => ({ id: x.id, label: LC.chanInfo(x.id).title })), { id: e.self.id, label: '@ ' + LC.entryName(e.self) }, ...e.people.map((x) => ({ id: x.id, label: '@ ' + LC.uname(x.u.id) }))]; };
    const draw = () => list.replaceChildren(...items().filter((i) => i.label.toLowerCase().includes(q.value.toLowerCase())).map((i) => el('button', { class: 'hit', text: i.label, onclick: async () => { try { await LC.api('/api/forward', { id: m.id, chan: i.id }); LC.closeModal(); LC.toast(t('forwardedTo', { where: i.label })); } catch (e) { LC.toast(e.message); } } }))); q.addEventListener('input', draw); draw();
    LC.modal([el('h2', {}, LC.icon('arrow_forward'), ' ' + t('forward')), q, list, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))]);
  };

  // ---------- quick switcher + shortcuts ----------
  LC.quickSwitch = () => {
    const q = el('input', { placeholder: t('switchTo'), 'aria-label': t('switchTo'), autofocus: true }), list = el('div', { class: 'results qs', role: 'listbox' }); let sel = 0, shown = [];
    const e = LC.chatEntries(), all = [...e.chans.map((x) => ({ id: x.id, label: LC.chanInfo(x.id).title, un: S.unread[x.id] || 0 })), { id: e.self.id, label: LC.entryName(e.self), un: 0, u: e.self.u }, ...e.people.map((x) => ({ id: x.id, label: LC.uname(x.u.id), un: S.unread[x.id] || 0, u: x.u }))];
    const draw = () => { const f = q.value.trim().toLowerCase(); shown = all.filter((i) => i.label.toLowerCase().includes(f)).sort((a, b) => (b.un > 0) - (a.un > 0)).slice(0, 12); sel = Math.min(sel, Math.max(0, shown.length - 1)); list.replaceChildren(...shown.map((i, n) => el('button', { class: 'hit' + (n === sel ? ' on' : ''), role: 'option', onclick: () => { LC.closeModal(); LC.openChat(i.id); } }, i.u ? LC.avatar(i.u, 'sm', true) : null, el('span', { text: i.label }), i.un ? el('span', { class: 'badge', text: i.un }) : null))); };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; draw(); ev.preventDefault(); } else if (ev.key === 'Enter' && shown[sel]) { LC.closeModal(); LC.openChat(shown[sel].id); } });
    LC.modal([el('h2', {}, LC.icon('filter'), ' ' + t('quickSwitcher')), q, list]); draw();
  };
  LC.shortcutsHelp = () => LC.modal([el('h2', {}, LC.icon('keyboard'), ' ' + t('shortcuts')), el('table', { class: 'kb' }, ...[['Ctrl/⌘ + K', 'scQuick'], ['Ctrl/⌘ + E', 'scFocusSearch'], ['Alt + ↑ / ↓', 'scPrev'], ['Ctrl/⌘ + Shift + F', 'scSearch'], ['Ctrl/⌘ + F', 'cx_scFind'], ['Ctrl/⌘ + /', 'scHelp'], ['↑ (empty box)', 'scEditLast'], ['Enter / Shift+Enter', 'scSend'], ['Ctrl/⌘ + Enter', 'cx_scCtrlEnter'], ['Ctrl/⌘ + Shift + X', 'cx_scFormat'], ['Ctrl/⌘ + B / I / U', 'cx_scBIU'], ['Esc', 'scClose'], ['@  :', 'scAuto'], ['/', 'cx_scSlash']].map(([k, d]) => el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: t(d) })))), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]);
  document.addEventListener('keydown', (e) => {
    if (!S.me || !$('#app') || $('#app').classList.contains('hidden')) return; const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); LC.quickSwitch(); }
    else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); if (PHONE()) LC.openSearch({}); else $('#search').focus(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); LC.openSearch({ chan: S.chan }); }
    else if (mod && e.key === '/') { e.preventDefault(); LC.shortcutsHelp(); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const ids = [...$('#nav').querySelectorAll('.item')].map((n) => n.dataset.chan), i = ids.indexOf(S.chan); if (ids.length) LC.openChat(ids[(i + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length]); }
  });

  // ---------- drag & drop onto the chat ----------
  document.addEventListener('DOMContentLoaded', () => {
    const main = $('#main'); let n = 0; const drop = $('#drop');
    main.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { n++; drop.classList.remove('hidden'); } });
    main.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; drop.classList.add('hidden'); } });
    main.addEventListener('dragover', (e) => e.preventDefault());
    main.addEventListener('drop', (e) => { e.preventDefault(); n = 0; drop.classList.add('hidden'); if (S.tab === 'chat') (S.thread && e.target.closest('#threadPanel') ? LC.composers.thread : LC.composers.main).addDropped(e.dataTransfer); });
    $('#menuBtn').append(LC.icon('arrow_left')); $('#menuBtn').addEventListener('click', () => menuToggle(true));
    $('#toBottom').append(LC.icon('arrow_down')); $('#searchIcon').append(LC.icon('search')); $('#searchBtn').append(LC.icon('search')); $('#searchBtn').addEventListener('click', () => LC.openSearch({}));
    $('#inviteIcon').append(LC.icon('person_add')); $('#gearBtn').append(LC.icon('more_horizontal'));
    $('#composerHost').append((LC.composers.main = LC.makeComposer({ chan: () => S.chan, thread: () => null })).el);
    LC.composers.thread = LC.makeComposer({ chan: () => S.chan, thread: () => (S.thread ? S.thread.id : null), compact: true, noFocus: false });
    $('#inviteBtn').addEventListener('click', () => LC.inviteDialog());
    $('#gearBtn').addEventListener('click', (e) => LC.mainMenu(e.currentTarget));
  });
})();
