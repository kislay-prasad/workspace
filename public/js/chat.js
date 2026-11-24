'use strict';
// Chat UI: sidebar, header/tabs, message list (paging, jump, unread divider), threads, search, quick switcher, shortcuts.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const caches = new Map(); // chan -> Map(id -> {sig, node})
  let loadingOlder = false, loadingNewer = false, stick = true, threadMsgs = [], threadCache = new Map(), navQueued = false;

  const raf = (fn) => requestAnimationFrame(fn);
  LC.renderNav = () => { if (navQueued) return; navQueued = true; raf(() => { navQueued = false; renderNavNow(); }); };

  // ---------- sidebar ----------
  const menuToggle = (open) => { $('#sidebar').classList.toggle('open', open); $('#scrim').classList.toggle('open', open); };
  LC.menuToggle = menuToggle;
  function chatEntries() {
    const prefs = LC.prefs(), pinned = prefs.pinnedChats || [], archived = new Set(prefs.archived || []);
    const chans = [...S.channels.values()].map((c) => ({ id: c.id, kind: c.members ? 'group' : 'channel', c })), people = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed).map((u) => ({ id: LC.dmId(S.me.id, u.id), kind: 'dm', u }));
    const all = new Map([...chans, ...people].map((e) => [e.id, e]));
    return { all, pinned: pinned.map((id) => all.get(id)).filter(Boolean), archived, chans, people };
  }
  function navItem(e, o = {}) {
    const id = e.id, un = S.unread[id] || 0, mn = S.mentions[id] || 0, muted = LC.isMuted(id);
    const lead = e.kind === 'dm' ? LC.avatar(e.u, 'sm', true) : el('span', { class: 'hash', text: e.kind === 'group' ? '🔒' : '#' });
    const name = e.kind === 'dm' ? LC.uname(e.u.id) : e.c.name;
    const status = e.kind === 'dm' && (e.u.statusEmoji || e.u.statusText) ? el('span', { class: 'st', text: e.u.statusEmoji || '💬', title: e.u.statusText }) : null;
    const main = el('button', { class: 'itemmain', 'aria-current': S.chan === id ? 'page' : null, onclick: () => LC.openChat(id) },
      lead, el('span', { class: 'name', text: name }), status, o.fav ? el('span', { class: 'fav', text: '⭐', 'aria-label': t('favorite') }) : null, muted ? el('span', { class: 'mutedmark', text: '🔕', 'aria-label': t('muted') }) : null,
      mn ? el('span', { class: 'badge mention', text: '@' + mn, 'aria-label': t('unreadMentions', { n: mn }) }) : un && !muted ? el('span', { class: 'badge', text: un > 99 ? '99+' : un, 'aria-label': t('unreadMsgs', { n: un }) }) : un ? el('span', { class: 'dotmark', 'aria-label': t('unreadMsgs', { n: un }) }) : null);
    const node = el('div', { class: 'item' + (S.chan === id ? ' active' : '') + (un ? ' unread' : '') + (muted ? ' muted' : ''), 'data-chan': id, oncontextmenu: (ev) => { ev.preventDefault(); chatMenu({ x: ev.clientX, y: ev.clientY }, e); } },
      main, el('button', { class: 'kebab', 'aria-label': t('chatOptions'), 'aria-haspopup': 'menu', text: '⋯', onclick: (ev) => { ev.stopPropagation(); chatMenu(ev.currentTarget, e); } }));
    return node;
  }
  function renderNavNow() {
    const nav = $('#nav'); if (!nav || !S.me) return; const scroll = nav.scrollTop; nav.replaceChildren();
    const { pinned, archived, chans, people } = chatEntries(), prefs = LC.prefs(), favs = new Set(prefs.favorites || []), pinSet = new Set(pinned.map((e) => e.id));
    const section = (label, action) => el('div', { class: 'sec' }, el('span', { text: label }), action || null);
    if (pinned.length) { nav.append(section(t('pinnedChats'))); pinned.forEach((e) => nav.append(navItem(e, { fav: e.kind === 'dm' && favs.has(e.u.id) }))); }
    const rest = (e) => !pinSet.has(e.id) && !archived.has(e.id);
    nav.append(section(t('channels'), el('button', { class: 'plus', text: '+', title: t('newChannel'), 'aria-label': t('newChannel'), onclick: () => LC.newChannelDialog() })));
    const pubs = chans.filter((e) => e.kind === 'channel' && rest(e)), byName = (a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.c.name.localeCompare(b.c.name));
    const cats = new Map(); for (const e of pubs) (cats.get(e.c.category || '') || cats.set(e.c.category || '', []).get(e.c.category || '')).push(e);
    for (const [cat, list] of [...cats].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])))) { if (cat) nav.append(el('div', { class: 'cat', text: cat })); list.sort(byName).forEach((e) => nav.append(navItem(e))); }
    const groups = chans.filter((e) => e.kind === 'group' && rest(e)).sort(byName); if (groups.length) { nav.append(section(t('groups'))); groups.forEach((e) => nav.append(navItem(e))); }
    const ppl = people.filter(rest).sort((a, b) => (favs.has(b.u.id) - favs.has(a.u.id)) || ((b.u.presence !== 'offline') - (a.u.presence !== 'offline')) || LC.uname(a.u.id).localeCompare(LC.uname(b.u.id)));
    nav.append(section(t('people'))); ppl.forEach((e) => nav.append(navItem(e, { fav: favs.has(e.u.id) })));
    if (S.users.size <= 1) nav.append(el('div', { class: 'empty small', text: t('nobodyYet') }));
    const arch = [...archived].map((id) => chatEntries().all.get(id)).filter(Boolean);
    if (arch.length) { const open = LC.ls.get('lc_archopen', false); nav.append(el('button', { class: 'sec toggle', onclick: () => { LC.ls.set('lc_archopen', !open); LC.renderNav(); }, 'aria-expanded': open }, el('span', { text: (open ? '▾ ' : '▸ ') + t('archived') + ` (${arch.length})` }))); if (open) arch.forEach((e) => nav.append(navItem(e))); }
    nav.scrollTop = scroll; renderMe(); LC.updateBadge();
  }
  function renderMe() {
    const box = $('#meBox'); if (!box) return; const m = S.me, pc = S.pendingReqs.length;
    box.replaceChildren(el('button', { class: 'meb', onclick: (e) => presenceMenu(e.currentTarget), 'aria-label': t('myStatus'), 'aria-haspopup': 'menu' }, LC.avatar(m, '', true), el('span', { class: 'mi' }, el('b', { text: m.name }), el('small', { text: (m.statusEmoji ? m.statusEmoji + ' ' : '') + (m.statusText || t(m.presence === 'invisible' ? 'invisible' : m.presence)) }))),
      LC.isAdmin() ? el('button', { class: 'icon adminbtn', title: t('manage'), 'aria-label': t('manage') + (pc ? ` (${pc})` : ''), onclick: () => LC.adminPanel(), text: '🛡' }, pc ? el('span', { class: 'badge', text: pc }) : null) : null);
  }
  function presenceMenu(anchor) {
    const set = (state) => LC.api('/api/presence', { state }).catch((e) => LC.toast(e.message)), cur = S.me.presence;
    LC.menu(anchor, [{ icon: '🟢', label: t('online'), checked: cur === 'auto', fn: () => set('auto') }, { icon: '🟡', label: t('away'), checked: cur === 'away', fn: () => set('away') }, { icon: '🔴', label: t('dnd'), checked: cur === 'dnd', fn: () => set('dnd') }, { icon: '⚫', label: t('invisible'), checked: cur === 'invisible', fn: () => set('invisible') }, 'sep', { icon: '✎', label: t('editProfile'), fn: () => LC.settingsPanel('profile') }]);
  }
  function chatMenu(anchor, e) {
    const prefs = LC.prefs(), id = e.id, pinned = prefs.pinnedChats || [], isPin = pinned.includes(id), arch = (prefs.archived || []).includes(id), muted = LC.isMuted(id), idx = pinned.indexOf(id);
    const setMute = (ms) => LC.setPrefs({ muted: { ...(prefs.muted || {}), [id]: ms === true ? true : Date.now() + ms } }), unmute = () => { const m = { ...(prefs.muted || {}) }; delete m[id]; LC.setPrefs({ muted: m }); };
    const moveBy = (d) => { const a = [...pinned]; a.splice(idx, 1); a.splice(idx + d, 0, id); LC.setPrefs({ pinnedChats: a }); };
    LC.menu(anchor, [
      { icon: '📌', label: isPin ? t('unpinChat') : t('pinChat'), fn: () => LC.setPrefs({ pinnedChats: isPin ? pinned.filter((x) => x !== id) : [...pinned, id] }) },
      isPin && idx > 0 ? { icon: '⬆', label: t('moveUp'), fn: () => moveBy(-1) } : null, isPin && idx < pinned.length - 1 ? { icon: '⬇', label: t('moveDown'), fn: () => moveBy(1) } : null, 'sep',
      muted ? { icon: '🔔', label: t('unmute'), fn: unmute } : null, !muted ? { icon: '🔕', label: t('mute1h'), fn: () => setMute(3600e3) } : null, !muted ? { icon: '🔕', label: t('mute8h'), fn: () => setMute(8 * 3600e3) } : null, !muted ? { icon: '🔕', label: t('muteForever'), fn: () => setMute(true) } : null, 'sep',
      { icon: arch ? '📤' : '🗄', label: arch ? t('unarchive') : t('archive'), fn: () => LC.setPrefs({ archived: arch ? (prefs.archived || []).filter((x) => x !== id) : [...(prefs.archived || []), id] }) },
      (S.unread[id] || 0) ? { icon: '✔', label: t('markRead'), fn: () => LC.api('/api/read', { chan: id }) } : null,
      e.kind === 'dm' ? 'sep' : null, e.kind === 'dm' ? { icon: '⭐', label: (prefs.favorites || []).includes(e.u.id) ? t('unfavorite') : t('favorite'), fn: () => LC.toggleFavorite(e.u.id) } : null, e.kind === 'dm' ? { icon: '🏷', label: t('setNickname'), fn: () => LC.nicknameDialog(e.u.id) } : null,
      e.kind !== 'dm' ? { icon: 'ⓘ', label: t('chatInfo'), fn: () => LC.chatInfo(id) } : null,
    ]);
  }
  LC.toggleFavorite = (uid) => { const f = LC.prefs().favorites || []; LC.setPrefs({ favorites: f.includes(uid) ? f.filter((x) => x !== uid) : [...f, uid] }); };
  LC.nicknameDialog = async (uid) => { const cur = (LC.prefs().nicknames || {})[uid] || '', v = await LC.prompt(t('nicknameFor', { name: LC.realName(uid) }), { value: cur, max: 24, placeholder: t('nicknameHint') }); if (v === null) return; const n = { ...(LC.prefs().nicknames || {}) }; if (v.trim()) n[uid] = v.trim(); else delete n[uid]; LC.setPrefs({ nicknames: n }); };
  LC.userMenu = (anchor, uid) => {
    const u = S.users.get(uid); if (!u) return; const me = uid === S.me.id;
    LC.menu(anchor, [me ? { icon: '✎', label: t('editProfile'), fn: () => LC.settingsPanel('profile') } : { icon: '💬', label: t('messageUser', { name: LC.uname(uid) }), fn: () => LC.openChat(LC.dmId(S.me.id, uid)) },
      !me ? { icon: '🏷', label: t('setNickname'), fn: () => LC.nicknameDialog(uid) } : null, !me ? { icon: '⭐', label: (LC.prefs().favorites || []).includes(uid) ? t('unfavorite') : t('favorite'), fn: () => LC.toggleFavorite(uid) } : null,
      !me && LC.isAdmin() ? 'sep' : null, !me && LC.isAdmin() ? { icon: '🛡', label: t('manageUser'), fn: () => LC.adminPanel('people', uid) } : null,
      u.statusText ? 'sep' : null, u.statusText ? { icon: u.statusEmoji || '💬', label: u.statusText, disabled: true } : null]);
  };

  // ---------- header, tabs ----------
  const TABS = [['chat', '💬', 'tabChat'], ['files', '📁', 'tabFiles'], ['notes', '📝', 'tabNotes'], ['board', '🎨', 'tabBoard'], ['todos', '✅', 'tabTodos'], ['calendar', '📅', 'tabCalendar']];
  function renderHeader() {
    const i = LC.chanInfo(S.chan); if (!S.chan) return;
    $('#title').textContent = i.title; const topic = $('#topic');
    if (i.kind === 'dm') { const u = i.peer; topic.textContent = u ? (u.presence !== 'offline' ? t(u.presence) : u.lastSeen ? t('lastSeen', { when: LC.fmtDateTime(u.lastSeen) }) : t('offline')) + (u.statusText ? ' · ' + (u.statusEmoji || '') + ' ' + u.statusText : '') : ''; }
    else if (i.c && i.c.members) topic.textContent = i.c.members.map(LC.uname).join(', '); else topic.textContent = [i.topic, i.c && i.c.readonly ? '📢 ' + t('announcements') : '', i.c && i.c.slow ? '🐢 ' + t('slowMode', { n: i.c.slow }) : '', i.c && i.c.ttl ? '⏱ ' + LC.ttlLabel(i.c.ttl) : ''].filter(Boolean).join(' · ');
    const acts = $('#headActions'), call = S.calls[S.chan], cb = (ic, label, fn) => el('button', { class: 'icon', title: label, 'aria-label': label, text: ic, onclick: fn });
    acts.replaceChildren(cb('📞', t('voiceCall'), () => LC.startCall(S.chan, 'voice')), cb('📹', t('videoCall'), () => LC.startCall(S.chan, 'video')), cb('📌', t('pinnedMsgs'), () => LC.pinnedList()), cb('🔎', t('searchInChat'), () => LC.openSearch({ chan: S.chan })), cb('📅', t('jumpToDate'), (e) => jumpDateMenu(e.currentTarget)), cb('ⓘ', t('chatInfo'), () => LC.chatInfo(S.chan)));
    void call; LC.renderCallBar && LC.renderCallBar();
  }
  LC.renderHeader = renderHeader;
  function jumpDateMenu(anchor) {
    const inp = el('input', { type: 'date', 'aria-label': t('jumpToDate') }); LC.modal([el('h2', { text: '📅 ' + t('jumpToDate') }), inp, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('go'), onclick: () => { if (!inp.value) return; LC.closeModal(); LC.jumpToDate(new Date(inp.value + 'T00:00:00').getTime()); } }))]); void anchor;
  }
  function renderTabs() {
    const box = $('#tabs'); box.replaceChildren(...TABS.map(([k, ic, lab]) => el('button', { class: 'tab' + (S.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': S.tab === k, onclick: () => LC.setTab(k) }, el('span', { 'aria-hidden': 'true', text: ic }), ' ' + t(lab))));
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
    const changed = S.chan !== chan; S.chan = chan; LC.ls.set('lc_chan', chan);
    if (changed) { LC.closeThread(); S.tab = 'chat'; S.readAt[chan] = S.read[chan] ?? 0; stick = true; }
    menuToggle(false); renderHeader(); renderTabs(); LC.renderNav();
    $('#chatView').classList.toggle('hidden', S.tab !== 'chat'); $('#tabView').classList.toggle('hidden', S.tab === 'chat');
    if (changed) LC.composers.main.refresh(); renderTyping();
    if (S.tab !== 'chat') return LC.renderTab && LC.renderTab(S.tab);
    const w = await ensureWindow(chan); if (S.chan !== chan) return;
    if (o.from) await loadAround(chan, o.from); else if (w.newer && changed) { const d = await fetchWindow(chan); S.win[chan] = { msgs: d.messages, older: d.older, newer: false, loaded: true }; }
    renderMessages(o.focusId ? 'keep' : 'bottom'); if (o.focusId) flashMessage(o.focusId);
    if (LC.visible() || S.unread[chan]) LC.markRead(chan); if (!matchMedia('(pointer:coarse)').matches) LC.composers.main.focus();
  };
  async function loadAround(chan, ts) { const d = await fetchWindow(chan, '&from=' + ts + '&limit=60'); S.win[chan] = { msgs: d.messages, older: d.older, newer: d.newer, loaded: true }; }
  LC.markRead = (chan, force) => {
    chan ||= S.chan; if (!chan || !S.me) return; const had = S.unread[chan] || S.mentions[chan];
    if (!had && !force && !(S.chan === chan && S.win[chan] && S.win[chan].msgs.length)) return;
    S.unread[chan] = 0; S.mentions[chan] = 0; LC.api('/api/read', { chan }).catch(() => {}); LC.renderNav();
  };
  LC.jumpToDate = async (ts) => { const chan = S.chan; try { await loadAround(chan, ts); renderMessages('top'); } catch (e) { LC.toast(e.message); } };
  LC.jumpToMessage = async (chan, id) => {
    if (S.chan !== chan || S.tab !== 'chat') await LC.openChat(chan);
    const w = S.win[chan]; let found = w && w.msgs.find((m) => m.id === id);
    if (!found) { try { const r = await LC.api('/api/messages/byids', { ids: [id] }), m = r.messages[0]; if (!m) return LC.toast(t('msgGone')); if (m.thread) { const root = (await LC.api('/api/messages/byids', { ids: [m.thread] })).messages[0]; if (root) return LC.openThread(root); } await loadAround(chan, m.ts); renderMessages('keep'); } catch (e) { return LC.toast(e.message); } }
    flashMessage(id);
  };
  const flashMessage = (id) => raf(() => { const n = $('#msgs').querySelector(`[data-id="${id}"]`); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1800); } });
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
    if (w.error) nodes.push(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🔒' }), el('div', { text: w.error })));
    if (w.older) nodes.push(el('button', { class: 'more', text: t('loadEarlier'), onclick: loadOlder }));
    if (!list.length && !w.error) nodes.push(el('div', { class: 'empty' }, el('div', { class: 'big', text: '👋' }), el('div', { text: t('noMessages') })));
    let prev = null, day = '', divider = false; const readAt = S.readAt[S.chan] ?? Infinity;
    for (const m of list) {
      const d = new Date(m.ts).toDateString(); if (d !== day) { nodes.push(el('div', { class: 'daysep' }, el('span', { text: LC.dayLabel(m.ts) }))); day = d; prev = null; }
      if (!divider && m.seq > readAt && m.from && m.from !== S.me.id && !m.deleted) { divider = true; nodes.push(el('div', { class: 'unreadsep', id: 'unreadSep', role: 'separator' }, el('span', { text: t('newMessages') }))); prev = null; }
      const grouped = !!prev && !prev.system && !m.system && !prev.deleted && !m.deleted && prev.from === m.from && m.ts - prev.ts < 300000 && !m.reply && !m.fwd && !prev.poll && !prev.game;
      const o = { grouped, lastMine: !!lastMineId && lastMineId.id === m.id }, sig = LC.msgSig(m, o), c = cache.get(m.id);
      let node; if (c && c.sig === sig) node = c.node; else { node = LC.msgEl(m, o); cache.set(m.id, { sig, node }); }
      nodes.push(node); prev = m;
    }
    if (w.newer) nodes.push(el('button', { class: 'more', text: t('loadNewer'), onclick: loadNewer }));
    for (const ob of S.outbox.filter((x) => x.body.chan === S.chan)) nodes.push(el('div', { class: 'msg pending mine' }, el('div', { class: 'gut' }), el('div', { class: 'body' }, el('div', { class: 'txt', text: ob.body.text || '📎' }), el('div', { class: 'small muted' }, t('notSent') + ' ', el('button', { class: 'link', text: t('retry'), onclick: () => LC.outboxFlush() }), ' · ', el('button', { class: 'link', text: t('discard'), onclick: () => { S.outbox = S.outbox.filter((x) => x !== ob); LC.ls.set('lc_outbox', S.outbox); renderMessages('keep'); } })))));
    for (const k of [...cache.keys()]) if (!list.some((m) => m.id === k)) cache.delete(k);
    box.replaceChildren(...nodes);
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
    panel.replaceChildren(el('div', { class: 'thread-head' }, el('b', { text: t('thread') }), el('button', { class: 'icon', text: '✕', 'aria-label': t('close'), onclick: LC.closeThread })), el('div', { class: 'msgs thread-msgs', id: 'threadMsgs' }), el('div', { id: 'threadTyping', class: 'typing' }), el('div', { id: 'threadComposer' }));
    $('#threadComposer').append(LC.composers.thread.el); LC.composers.thread.refresh();
    try { const d = await LC.api(`/api/thread?chan=${encodeURIComponent(m.chan)}&id=${m.id}`); threadMsgs = [d.root, ...d.messages]; } catch (e) { LC.toast(e.message); return LC.closeThread(); }
    renderThread(true); LC.composers.thread.focus();
  };
  LC.closeThread = () => { if (!S.thread) return; S.thread = null; threadMsgs = []; $('#threadPanel').classList.add('hidden'); $('#threadPanel').replaceChildren(); $('#app').classList.remove('with-thread'); };
  function renderThread(bottom) {
    const box = $('#threadMsgs'); if (!box || !S.thread) return; const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120; const nodes = []; let prev = null;
    threadMsgs.forEach((m, i) => {
      const grouped = i > 1 && !!prev && prev.from === m.from && m.ts - prev.ts < 300000 && !m.deleted && !prev.deleted, o = { grouped, thread: true }, sig = LC.msgSig(m, o), c = threadCache.get(m.id);
      let node; if (c && c.sig === sig) node = c.node; else { node = LC.msgEl(m, o); threadCache.set(m.id, { sig, node }); }
      nodes.push(node); if (i === 0) nodes.push(el('div', { class: 'daysep' }, el('span', { text: t('replies', { n: threadMsgs.length - 1 }) }))); prev = m;
    });
    box.replaceChildren(...nodes); if (bottom || near) box.scrollTop = box.scrollHeight;
  }

  // ---------- incoming events ----------
  const chatVisible = (m) => S.chan === m.chan && S.tab === 'chat' && LC.visible() && (!m.thread || (S.thread && S.thread.id === m.thread));
  LC.on('message', (m) => {
    const mine = m.from === S.me.id;
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
    const w = S.win[m.chan]; if (w) { const i = w.msgs.findIndex((x) => x.id === m.id); if (i >= 0) w.msgs[i] = m; }
    if (m.chan === S.chan && S.tab === 'chat') renderMessages('keep');
    if (S.thread) { const i = threadMsgs.findIndex((x) => x.id === m.id); if (i >= 0) { threadMsgs[i] = m; renderThread(false); } }
  });
  LC.on('purge', (e) => {
    const gone = new Set(e.ids), w = S.win[e.chan]; if (w) w.msgs = w.msgs.filter((m) => !gone.has(m.id));
    if (e.chan === S.chan && S.tab === 'chat') renderMessages('keep'); if (S.thread && (gone.has(S.thread.id))) LC.closeThread(); else if (S.thread) { threadMsgs = threadMsgs.filter((m) => !gone.has(m.id)); renderThread(false); }
  });
  LC.on('seen', (e) => { ((S.peers[e.chan] ||= {})[e.user] ||= { seen: 0, delivered: 0 }).seen = e.seq; if (e.chan === S.chan) renderMessages('keep'); });
  LC.on('delivered', (e) => { if (e.user === S.me.id) return; const p = ((S.peers[e.chan] ||= {})[e.user] ||= { seen: 0, delivered: 0 }); p.delivered = Math.max(p.delivered, e.seq); if (e.chan === S.chan) renderMessages('keep'); });
  LC.on('readstate', (e) => { S.read[e.chan] = e.seq; if (!(chatVisible({ chan: e.chan }) === false && false)) { S.unread[e.chan] = 0; S.mentions[e.chan] = 0; LC.renderNav(); } });
  LC.on('channel', () => { LC.renderNav(); if (S.chan) renderHeader(); });
  LC.on('user', () => { LC.renderNav(); if (S.chan) { renderHeader(); if (S.tab === 'chat') renderMessages('keep'); } });
  LC.on('me', () => { LC.renderNav(); if (S.chan) renderHeader(); });
  LC.on('meta', (m) => { $('#brand').textContent = '💬 ' + m.name; $('#brand').title = m.name; });
  LC.on('settings', () => LC.renderNav());
  const leave = (e) => { if (S.chan === e.id) { LC.toast(t('chatRemoved')); LC.openChat('general'); } LC.renderNav(); };
  LC.on('channel_removed', leave); LC.on('channel_deleted', leave);
  LC.on('dmttl', () => renderHeader());
  LC.on('reminder', (r) => { LC.toast('⏰ ' + r.text, { ms: 10000 }); LC.playSound('ping'); if (LC.native && !LC.visible()) LC.native.notify(t('reminder'), r.text, r.chan); });
  LC.on('schedulefail', (e) => LC.toast(t('scheduleFailed', { why: e.error })));
  LC.on('joinrequest', (r) => {
    if (!LC.isAdmin()) return; LC.renderNav(); LC.playSound('ping');
    LC.toast(t('wantsToJoin', { name: r.name }) + (r.existing ? ' ' + t('existingAcct') : ''), { ms: 12000, action: { label: t('review'), fn: () => LC.adminPanel('requests') } });
    if (LC.native && !LC.visible()) LC.native.notify(t('joinRequest'), t('wantsToJoin', { name: r.name }), null);
  });
  LC.on('joindecided', () => LC.renderNav());
  LC.on('init', () => {
    $('#app').classList.remove('hidden'); $('#brand').textContent = '💬 ' + S.chatName; $('#brand').title = S.chatName; LC.banner(null);
    const want = S.chan || LC.ls.get('lc_chan') || 'general'; S.chan = null; caches.clear(); S.readAt = {};
    LC.openChat(want); LC.updateBadge(); startIdle();
  });
  LC.on('lang', () => { renderTabs(); if (S.chan) renderHeader(); LC.renderNav(); });
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

  // ---------- search ----------
  LC.openSearch = (pre = {}) => {
    const q = el('input', { type: 'search', placeholder: t('searchPlaceholder'), value: pre.q || '', 'aria-label': t('search') }), from = el('select', { 'aria-label': t('searchFrom') }, el('option', { value: '', text: t('anyone') }), ...[...S.users.values()].map((u) => el('option', { value: u.id, text: LC.uname(u.id) })));
    const where = el('select', { 'aria-label': t('searchIn') }, el('option', { value: '', text: t('everywhere') }), ...[...S.channels.values()].map((c) => el('option', { value: c.id, text: (c.members ? '🔒 ' : '# ') + c.name })), ...[...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed).map((u) => el('option', { value: LC.dmId(S.me.id, u.id), text: '@ ' + LC.uname(u.id) })));
    const has = el('select', { 'aria-label': t('searchHas') }, ...[['', 'anything'], ['file', 'hasFile'], ['image', 'hasImage'], ['link', 'hasLink'], ['pin', 'hasPin'], ['mention', 'hasMention'], ['poll', 'hasPoll']].map(([v, k]) => el('option', { value: v, text: t(k) })));
    const after = el('input', { type: 'date', 'aria-label': t('after') }), before = el('input', { type: 'date', 'aria-label': t('before') }), out = el('div', { class: 'results', 'aria-live': 'polite' }); where.value = pre.chan || ''; from.value = pre.from || ''; has.value = pre.has || '';
    const run = async () => {
      const p = new URLSearchParams(); if (q.value.trim()) p.set('q', q.value.trim()); if (from.value) p.set('from', from.value); if (where.value) p.set('chan', where.value); if (has.value) p.set('has', has.value);
      if (after.value) p.set('after', new Date(after.value + 'T00:00:00').getTime()); if (before.value) p.set('before', new Date(before.value + 'T23:59:59').getTime() + 1);
      if (![...p.keys()].length) return out.replaceChildren(el('p', { class: 'muted', text: t('searchHint') }));
      out.replaceChildren(el('p', { class: 'muted', text: t('searching') }));
      try { const { results } = await LC.api('/api/search?' + p); out.replaceChildren(...(results.length ? results.map((m) => el('button', { class: 'hit', onclick: () => { LC.closeModal(); LC.jumpToMessage(m.chan, m.id); } }, el('small', { text: `${LC.uname(m.from)} · ${LC.chanInfo(m.chan).title} · ${LC.fmtDateTime(m.ts)}` }), el('div', { text: LC.snippet(m) || '…' }))) : [el('p', { class: 'muted', text: t('noMatches') })])); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
    };
    const deb = LC.debounce(run, 300); for (const x of [q, from, where, has, after, before]) x.addEventListener(x === q ? 'input' : 'change', deb);
    LC.modal([el('h2', { text: '🔎 ' + t('search') }), q, el('div', { class: 'filters' }, from, where, has, el('label', { class: 'small' }, t('after') + ' ', after), el('label', { class: 'small' }, t('before') + ' ', before)), out, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }))], { wide: true }); run();
  };
  document.addEventListener('DOMContentLoaded', () => { $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { LC.openSearch({ q: e.target.value }); e.target.value = ''; } }); });

  // ---------- pinned list, history, seen-by, forward ----------
  LC.pinnedList = async () => {
    const out = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('searching') })); LC.modal([el('h2', { text: '📌 ' + t('pinnedMsgs') }), out, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
    try { const { results } = await LC.api('/api/search?has=pin&chan=' + encodeURIComponent(S.chan)); out.replaceChildren(...(results.length ? results.map((m) => el('div', { class: 'hit row-between' }, el('button', { class: 'plain', onclick: () => { LC.closeModal(); LC.jumpToMessage(m.chan, m.id); } }, el('small', { text: `${LC.uname(m.from)} · ${LC.fmtDateTime(m.ts)}` }), el('div', { text: LC.snippet(m) })), LC.canPin(m) ? el('button', { class: 'secondary sm', text: t('unpin'), onclick: () => LC.api('/api/pin', { id: m.id }).then(() => LC.pinnedList()) }) : null)) : [el('p', { class: 'muted', text: t('noPins') })])); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };
  LC.showHistory = async (m) => { try { const { versions } = await LC.api('/api/msg/history?id=' + m.id); LC.modal([el('h2', { text: '🕘 ' + t('editHistory') }), ...versions.map((v, i) => el('div', { class: 'ver' }, el('small', { class: 'muted', text: (i === 0 ? t('original') : v.current ? t('current') : t('edit') + ' ' + i) + ' · ' + LC.fmtDateTime(v.ts) }), el('div', { class: 'txt' }, LC.renderText(v.text || '')))), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]); } catch (e) { LC.toast(e.message); } };
  LC.showSeenBy = async (m) => {
    try {
      const { users } = await LC.api(`/api/seenby?chan=${encodeURIComponent(m.chan)}&seq=${m.seq}`); const info = m.chan.startsWith('dm:') ? LC.tickState(m) : '';
      LC.modal([el('h2', { text: '👁 ' + t('seenByMenu') }), info ? el('p', { text: t('tick_' + info) }) : null, users.length ? el('ul', { class: 'plainlist' }, users.map((id) => el('li', {}, LC.avatar(S.users.get(id), 'sm', false), ' ' + LC.uname(id)))) : el('p', { class: 'muted', text: t('seenNobody') }), el('p', { class: 'muted small', text: t('seenNote') }), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]);
    } catch (e) { LC.toast(e.message); }
  };
  LC.forwardDialog = (m) => {
    const q = el('input', { placeholder: t('searchChats'), 'aria-label': t('searchChats') }), list = el('div', { class: 'results' });
    const items = () => { const e = chatEntries(); return [...e.chans.map((x) => ({ id: x.id, label: LC.chanInfo(x.id).title })), ...e.people.map((x) => ({ id: x.id, label: '@ ' + LC.uname(x.u.id) }))]; };
    const draw = () => list.replaceChildren(...items().filter((i) => i.label.toLowerCase().includes(q.value.toLowerCase())).map((i) => el('button', { class: 'hit', text: i.label, onclick: async () => { try { await LC.api('/api/forward', { id: m.id, chan: i.id }); LC.closeModal(); LC.toast(t('forwardedTo', { where: i.label })); } catch (e) { LC.toast(e.message); } } }))); q.addEventListener('input', draw); draw();
    LC.modal([el('h2', { text: '↪ ' + t('forward') }), q, list, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))]);
  };

  // ---------- quick switcher + shortcuts ----------
  LC.quickSwitch = () => {
    const q = el('input', { placeholder: t('switchTo'), 'aria-label': t('switchTo'), autofocus: true }), list = el('div', { class: 'results qs', role: 'listbox' }); let sel = 0, shown = [];
    const e = chatEntries(), all = [...e.chans.map((x) => ({ id: x.id, label: LC.chanInfo(x.id).title, un: S.unread[x.id] || 0 })), ...e.people.map((x) => ({ id: x.id, label: LC.uname(x.u.id), un: S.unread[x.id] || 0, u: x.u }))];
    const draw = () => { const f = q.value.trim().toLowerCase(); shown = all.filter((i) => i.label.toLowerCase().includes(f)).sort((a, b) => (b.un > 0) - (a.un > 0)).slice(0, 12); sel = Math.min(sel, Math.max(0, shown.length - 1)); list.replaceChildren(...shown.map((i, n) => el('button', { class: 'hit' + (n === sel ? ' on' : ''), role: 'option', onclick: () => { LC.closeModal(); LC.openChat(i.id); } }, i.u ? LC.avatar(i.u, 'sm', true) : null, el('span', { text: i.label }), i.un ? el('span', { class: 'badge', text: i.un }) : null))); };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; draw(); ev.preventDefault(); } else if (ev.key === 'Enter' && shown[sel]) { LC.closeModal(); LC.openChat(shown[sel].id); } });
    LC.modal([el('h2', { text: '⚡ ' + t('quickSwitcher') }), q, list]); draw();
  };
  LC.shortcutsHelp = () => LC.modal([el('h2', { text: '⌨ ' + t('shortcuts') }), el('table', { class: 'kb' }, ...[['Ctrl/⌘ + K', 'scQuick'], ['Alt + ↑ / ↓', 'scPrev'], ['Ctrl/⌘ + Shift + F', 'scSearch'], ['Ctrl/⌘ + /', 'scHelp'], ['↑ (empty box)', 'scEditLast'], ['Enter / Shift+Enter', 'scSend'], ['Esc', 'scClose'], ['@  :', 'scAuto']].map(([k, d]) => el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: t(d) })))), el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]);
  document.addEventListener('keydown', (e) => {
    if (!S.me || !$('#app') || $('#app').classList.contains('hidden')) return; const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); LC.quickSwitch(); }
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
    $('#menuBtn').addEventListener('click', () => menuToggle(true)); $('#scrim').addEventListener('click', () => menuToggle(false));
    $('#composerHost').append((LC.composers.main = LC.makeComposer({ chan: () => S.chan, thread: () => null })).el);
    LC.composers.thread = LC.makeComposer({ chan: () => S.chan, thread: () => (S.thread ? S.thread.id : null), compact: true, noFocus: false });
    $('#inviteBtn').addEventListener('click', () => LC.inviteDialog());
    $('#gearBtn').addEventListener('click', (e) => LC.mainMenu(e.currentTarget));
  });
})();
