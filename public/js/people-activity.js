'use strict';
// People area: the Activity pane (feed with filters, read / unread, opening the right place), the notification rules
// (LC.shouldAlert / LC.alertMessage: quiet hours, mute, per-chat and per-type settings, Do not disturb with priority access,
// urgent messages repeating), banners for activity items, and quick reply from desktop notifications (desktop/ext-people.js).
// Other areas describe their own activity types: LC.ext.activityTypes.<type> = { icon, text(item), open(item), filter? }.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), PP = LC.people;
  LC.addStrings('en', {
    pp_feed: 'Feed', pp_filterAct: 'Filter activity', pp_f_all: 'All', pp_f_unread: 'Unread', pp_f_mention: '@Mentions', pp_f_reply: 'Replies', pp_f_reaction: 'Reactions', pp_f_calls: 'Calls', pp_f_meeting: 'Meetings', pp_f_task: 'Tasks', pp_f_apps: 'Apps', pp_f_more: 'More filters',
    pp_markRead: 'Mark as read', pp_markUnread: 'Mark as unread', pp_markAllRead: 'Mark all as read', pp_itemMenu: 'Options for this notification', pp_caughtUp: "You're all caught up", pp_caughtUpHelp: 'Mentions, replies, reactions, missed calls and other updates show up here.', pp_noneForFilter: 'Nothing here for this filter.',
    pp_a_mention: 'mentioned you', pp_a_mentionAll: 'mentioned everyone', pp_a_reply: 'replied to a conversation', pp_a_replyMine: 'replied to your message', pp_a_follow: 'replied in a thread you follow', pp_a_reaction: 'reacted to your message',
    pp_a_missedCall: 'Missed call', pp_a_voicemail: 'left you a voicemail', pp_a_added: 'added you', pp_a_task: 'assigned you a task', pp_a_meeting: 'Meeting update', pp_a_urgent: 'sent an urgent message', pp_a_approval: 'needs your approval', pp_a_form: 'sent you a form', pp_a_report: 'shared a report', pp_a_system: 'Notice',
    pp_urgent: 'URGENT', pp_important: 'IMPORTANT', pp_msgDeleted: 'This message was deleted.', pp_unreadDot: 'Unread',
    pp_actSettings: 'Activity notifications', pp_actHelp: 'Choose how each kind of activity reaches you. "Banner" also pops up a notification.', pp_n_banner: 'Banner and feed', pp_n_feed: 'Only show in feed', pp_n_off: 'Off',
    pp_t_mention: '@Mentions of me', pp_t_reply: 'Replies to my conversations', pp_t_reaction: 'Reactions to my messages', pp_t_missedCall: 'Missed calls', pp_t_voicemail: 'Voicemail', pp_t_added: 'Added to a chat or team', pp_t_task: 'Tasks assigned to me', pp_t_meeting: 'Meetings', pp_t_follow: 'Followed threads', pp_t_approval: 'Approvals', pp_t_form: 'Forms', pp_t_report: 'Reports', pp_t_system: 'Other notices',
    pp_chatNotif: 'Notifications', pp_cn_all: 'All activity', pp_cn_mentions: 'Mentions only', pp_cn_off: 'Off', pp_cnTitle: 'Notifications for this chat',
    pp_dndTitle: 'Do not disturb', pp_dndHelp: 'In Do not disturb (and while presenting) only urgent messages and people with priority access reach you.', pp_managePriority: 'Manage priority access ({n})',
    pp_quickReply: 'Quick reply', pp_replyTo: 'Reply to {name}', pp_replyPh: 'Type a reply', pp_openChat: 'Open chat', pp_sent: 'Reply sent', pp_urgentFrom: 'Urgent message from {name}', pp_importantFrom: 'Important message from {name}', pp_view: 'View',
  });
  LC.addStrings('hi', { pp_f_all: 'सभी', pp_f_unread: 'अपठित', pp_f_mention: '@उल्लेख', pp_f_reply: 'जवाब', pp_f_reaction: 'प्रतिक्रियाएँ', pp_f_calls: 'कॉल', pp_markAllRead: 'सभी को पढ़ा हुआ चिह्नित करें', pp_caughtUp: 'आप सब देख चुके हैं', pp_a_mention: 'ने आपका उल्लेख किया', pp_a_reply: 'ने बातचीत में जवाब दिया', pp_a_reaction: 'ने आपके संदेश पर प्रतिक्रिया दी', pp_urgent: 'अत्यावश्यक', pp_important: 'महत्वपूर्ण', pp_quickReply: 'त्वरित जवाब' });
  LC.addStrings('es', { pp_f_all: 'Todo', pp_f_unread: 'No leídos', pp_f_mention: '@Menciones', pp_f_reply: 'Respuestas', pp_f_reaction: 'Reacciones', pp_f_calls: 'Llamadas', pp_markAllRead: 'Marcar todo como leído', pp_caughtUp: 'Estás al día', pp_a_mention: 'te mencionó', pp_a_reply: 'respondió en una conversación', pp_a_reaction: 'reaccionó a tu mensaje', pp_urgent: 'URGENTE', pp_important: 'IMPORTANTE', pp_quickReply: 'Respuesta rápida' });

  // ---------- settings this area keeps in prefs ----------
  const DEFAULT_ACT = { reaction: 'feed' };
  const actSetting = (type) => ((LC.prefs().actTypes || {})[type] || DEFAULT_ACT[type] || 'banner');
  const chatSetting = (chan) => ((LC.prefs().chatNotif || {})[chan] || 'all');
  PP.actSetting = actSetting; PP.chatSetting = chatSetting;
  const inQuiet = () => { const q = LC.prefs().quiet; if (!q || !q.on) return false; const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number), f = fh * 60 + fm, e = th * 60 + tm; return f <= e ? m >= f && m < e : m >= f || m < e; };
  // Do not disturb, Presenting and quiet hours let only urgent messages and priority-access people through
  const held = (from, urgent) => { if (!S.me) return true; const dnd = S.me.presence === 'dnd' || S.me.presence === 'presenting'; if (!dnd && !inQuiet()) return false; return !urgent && !PP.hasPriority(from); };
  PP.held = held;
  LC.ringAllowed = (r) => !held(r && r.from, false) && !PP.isBlocked(r && r.from); // incoming calls (calls.js asks this before ringing)

  // ---------- notification rules for new messages ----------
  LC.shouldAlert = (m) => {
    if (!S.me || !m || !m.from || m.from === S.me.id || m.system) return false;
    if (PP.isBlocked(m.from)) return false;
    const cs = chatSetting(m.chan); if (cs === 'off') return false;
    const urgent = m.priority === 'urgent', mention = !!(m.everyone || (m.mentions || []).includes(S.me.id)), mentionBanner = mention && actSetting('mention') === 'banner';
    if (m.thread && !mentionBanner && !urgent) return false; // thread replies reach the people in the thread through the feed
    if (held(m.from, urgent)) return false;
    if (urgent) return true; // urgent gets through mute and "mentions only"
    if (LC.isMuted(m.chan) && !mentionBanner) return false;
    if (cs === 'mentions' && !mentionBanner) return false;
    const np = LC.prefs().notif || {};
    if (np.mentionsOnly && !mentionBanner && !m.chan.startsWith('dm:')) return false;
    if (mention && !mentionBanner && actSetting('mention') !== 'banner' && cs !== 'all') return false;
    return true;
  };
  const alerted = new Map(); // message id -> time, so the activity item for the same message doesn't pop up twice
  const remember = (id) => { alerted.set(id, Date.now()); if (alerted.size > 300) for (const [k, v] of alerted) if (Date.now() - v > 600000) alerted.delete(k); };
  LC.alertMessage = (m) => {
    const np = LC.prefs().notif || {}, urgent = m.priority === 'urgent', important = m.priority === 'important'; remember(m.id);
    if (np.sound !== false) LC.playSound(urgent ? 'ring' : undefined);
    const name = LC.uname(m.from), where = m.chan.startsWith('dm:') ? '' : ' · ' + LC.chanInfo(m.chan).title;
    const title = (urgent ? t('pp_urgentFrom', { name }) : important ? t('pp_importantFrom', { name }) : name) + where, body = np.previews === false ? t('newMessage') : LC.snippet(m) || t('newMessage');
    if (urgent) PP.repeatUrgent(m);
    if (np.desktop === false) return;
    osNotify({ title, body, chan: m.chan, msg: m.id, urgent, open: () => LC.jumpToMessage(m.chan, m.id) });
  };
  // urgent: repeat every 2 minutes for up to 20 minutes, until the chat is read
  const repeating = new Map(); PP.urgentEvery = 120000;
  PP.repeatUrgent = (m) => {
    if (repeating.has(m.id)) return; let n = 0;
    const tick = () => {
      const read = (S.read[m.chan] || 0) >= m.seq || (S.chan === m.chan && LC.visible() && S.tab === 'chat');
      if (read || ++n > 10 || !S.me) { repeating.delete(m.id); return; }
      if (!PP.isBlocked(m.from) && chatSetting(m.chan) !== 'off') { const np = LC.prefs().notif || {}; if (np.sound !== false) LC.playSound('ring'); if (np.desktop !== false) osNotify({ title: t('pp_urgentFrom', { name: LC.uname(m.from) }), body: LC.snippet(m) || t('newMessage'), chan: m.chan, msg: m.id, urgent: true, open: () => LC.jumpToMessage(m.chan, m.id) }); else LC.toast(t('pp_urgentFrom', { name: LC.uname(m.from) }) + ': ' + (LC.snippet(m) || ''), { ms: 8000 }); }
      repeating.set(m.id, setTimeout(tick, PP.urgentEvery));
    };
    repeating.set(m.id, setTimeout(tick, PP.urgentEvery));
  };
  PP.urgentPending = () => [...repeating.keys()];

  // ---------- desktop / browser notifications ----------
  let ext = null; // the desktop app's people bridge (desktop/ext-people.js), when present
  const probe = async () => { if (!LC.native || !LC.native.invoke) return (ext = false); try { const r = await LC.native.invoke('x:people:hello'); ext = !!(r && r.ok); } catch { ext = false; } return ext; };
  probe();
  function osNotify(n) {
    if (LC.native) {
      if (ext) { LC.native.invoke('x:people:notify', { title: n.title, body: n.body, chan: n.chan || '', msg: n.msg || '', urgent: !!n.urgent, reply: !!n.chan, replyPlaceholder: t('pp_replyPh') }).catch(() => LC.native.notify(n.title, n.body, n.chan)); }
      else LC.native.notify(n.title, n.body, n.chan);
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted' || LC.visible()) { if (n.toast && LC.visible()) LC.toast(n.title + (n.body ? ': ' + n.body : ''), { ms: 6000, action: n.open ? { label: t('pp_view'), fn: n.open } : undefined }); return; }
    try { const x = new Notification(n.title, { body: n.body, tag: n.msg || n.chan || 'lanchat', renotify: !!n.urgent, requireInteraction: !!n.urgent }); x.onclick = () => { window.focus(); x.close(); if (n.open) n.open(); else if (n.chan) LC.openChat(n.chan); }; } catch {}
  }
  PP.notify = osNotify;
  // quick reply: clicking a desktop notification opens a small reply box for that chat; macOS can also reply inside the notification
  PP.quickReply = async (chan, msgId) => {
    if (!S.me || !chan || !(chan.startsWith('dm:') ? S.users.has(LC.peerOf(chan)) : S.channels.has(chan))) return;
    let m = null; if (msgId) { try { m = (await LC.api('/api/messages/byids', { ids: [msgId] })).messages[0] || null; } catch {} }
    const who = m && m.from ? LC.uname(m.from) : LC.chanInfo(chan).title, ta = el('textarea', { rows: 3, maxlength: 8000, placeholder: t('pp_replyPh'), 'aria-label': t('pp_replyPh') });
    const send = async () => { const text = ta.value.trim(); if (!text) return; try { await LC.api('/api/send', { chan, text, thread: m && m.thread ? m.thread : undefined }); LC.closeModal(); LC.toast(t('pp_sent'), { ms: 1600 }); } catch (e) { LC.toast(e.message); } };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    LC.modal([el('h2', {}, LC.icon('arrow_reply'), ' ' + t('pp_replyTo', { name: who })), el('div', { class: 'muted small', text: LC.chanInfo(chan).title }),
      m ? el('div', { class: 'pp-qrmsg' }, LC.avatar(S.users.get(m.from), 'sm', false), el('div', { class: 'grow' }, el('b', { text: LC.uname(m.from) }), el('div', { class: 'small', text: LC.snippet(m) }))) : null, ta,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('pp_openChat'), onclick: () => { LC.closeModal(); if (m) LC.jumpToMessage(chan, m.id); else LC.openChat(chan); } }), el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('send'), onclick: send }))], { label: t('pp_quickReply') });
    setTimeout(() => ta.focus(), 40);
  };
  if (LC.native && LC.native.on) {
    LC.native.on('x:people:quickReply', (d) => { if (d && typeof d.chan === 'string') PP.quickReply(d.chan, d.msg); });
    LC.native.on('x:people:reply', (d) => { if (d && typeof d.chan === 'string' && typeof d.text === 'string' && d.text.trim()) LC.api('/api/messages/byids', { ids: d.msg ? [d.msg] : [] }).then((r) => { const m = r.messages[0]; return LC.api('/api/send', { chan: d.chan, text: d.text.slice(0, 8000), thread: m && m.thread ? m.thread : undefined }); }).then(() => LC.toast(t('pp_sent'), { ms: 1600 })).catch((e) => LC.toast(e.message)); });
  }

  // ---------- activity types (other areas add theirs) ----------
  const openMsg = (a) => (a.chan && a.msg ? LC.jumpToMessage(a.chan, a.msg) : a.chan ? LC.openChat(a.chan) : null);
  const openGeneric = async (a) => {
    if (a.app && LC.apps && typeof LC.apps.open === 'function') return LC.apps.open(a.app, a);
    if (a.meeting && LC.meetings && typeof LC.meetings.open === 'function') return LC.meetings.open(a.meeting);
    if (a.chan) { if (a.msg) return LC.jumpToMessage(a.chan, a.msg); await LC.openChat(a.chan); if (a.tab && LC.setTab) LC.setTab(a.tab); return; }
    if (a.team) { if (LC.teams && typeof LC.teams.open === 'function') return LC.teams.open(a.team); location.hash = '#team=' + encodeURIComponent(a.team); return; }
    if (a.pane && LC.ext.panes[a.pane]) LC.setPane(a.pane);
  };
  const TYPES = {
    mention: { icon: 'mention', filter: 'mention', text: (a) => t(a.everyone ? 'pp_a_mentionAll' : 'pp_a_mention'), open: openMsg },
    reply: { icon: 'arrow_reply', filter: 'reply', text: (a) => t(a.mine ? 'pp_a_replyMine' : 'pp_a_reply'), open: openMsg },
    follow: { icon: 'comment', filter: 'reply', text: () => t('pp_a_follow'), open: openMsg },
    reaction: { icon: 'emoji', filter: 'reaction', text: () => t('pp_a_reaction'), open: openMsg },
    urgent: { icon: 'alert_urgent', filter: 'mention', text: () => t('pp_a_urgent'), open: openMsg },
    missedCall: { icon: 'call_missed', filter: 'calls', text: () => t('pp_a_missedCall'), open: (a) => (LC.ext.panes.calls ? LC.setPane('calls') : openGeneric(a)) },
    voicemail: { icon: 'voicemail', filter: 'calls', text: () => t('pp_a_voicemail'), open: (a) => (a.msg ? openMsg(a) : LC.ext.panes.calls ? LC.setPane('calls') : openGeneric(a)) },
    added: { icon: 'person_add', filter: 'other', text: () => t('pp_a_added'), open: openGeneric },
    task: { icon: 'task_list_ltr', filter: 'task', text: () => t('pp_a_task'), open: openGeneric },
    meeting: { icon: 'calendar_ltr', filter: 'meeting', text: (a) => a.title || t('pp_a_meeting'), open: (a) => (LC.meetings && typeof LC.meetings.open === 'function' && (a.meeting || a.ref) ? LC.meetings.open(a.meeting || a.ref) : openGeneric(a)) },
    approval: { icon: 'clipboard_task', filter: 'apps', text: () => t('pp_a_approval'), open: openGeneric },
    form: { icon: 'form', filter: 'apps', text: () => t('pp_a_form'), open: openGeneric },
    report: { icon: 'data_bar_vertical', filter: 'apps', text: () => t('pp_a_report'), open: openGeneric },
    system: { icon: 'info', filter: 'other', text: (a) => a.title || t('pp_a_system'), open: openGeneric },
  };
  LC.ext.activityTypes = Object.assign(TYPES, LC.ext.activityTypes || {});
  const typeOf = (a) => LC.ext.activityTypes[a.type] || { icon: 'alert', filter: 'other', text: (x) => x.title || '', open: openGeneric };
  PP.openItem = (a) => { try { const r = typeOf(a).open(a); if (r && r.catch) r.catch((e) => LC.toast(e.message)); } catch (e) { LC.toast(e.message); } };

  // ---------- the feed ----------
  const A = { items: [], loaded: false, loading: false, unread: 0, filter: 'all', err: '' };
  PP.activity = A;
  const visible = (a) => { // the same rules as the server's feed, for items that arrive live
    if (!a || (a.from && PP.isBlocked(a.from)) || actSetting(a.type) === 'off') return false;
    if (a.chan) { const cs = chatSetting(a.chan); if (cs === 'off' || (cs === 'mentions' && a.type !== 'mention')) return false; if (a.chan.startsWith('dm:') ? !S.users.has(LC.peerOf(a.chan)) : !S.channels.has(a.chan)) return false; }
    return true;
  };
  const recount = () => { A.unread = A.items.filter((a) => !a.read).length; };
  async function load() {
    if (A.loading) return; A.loading = true;
    try { const r = await LC.api('/api/activity?limit=300'); A.items = r.items; A.loaded = true; A.err = ''; recount(); } catch (e) { A.err = e.message; }
    A.loading = false; redraw();
  }
  PP.reloadActivity = load;
  let drawQ = false;
  const redraw = () => { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; if (S.pane === 'activity') LC.renderNav(); else if (LC.renderRail) LC.renderRail(); }); };
  const setRead = (ids, read) => { for (const a of A.items) if (ids.includes(a.id)) a.read = read; recount(); redraw(); return LC.api('/api/activity/read', { ids, read }).catch((e) => LC.toast(e.message)); };
  const FILTERS = [['all', 'pp_f_all'], ['unread', 'pp_f_unread'], ['mention', 'pp_f_mention'], ['reply', 'pp_f_reply'], ['reaction', 'pp_f_reaction'], ['calls', 'pp_f_calls'], ['meeting', 'pp_f_meeting'], ['task', 'pp_f_task'], ['apps', 'pp_f_apps']];
  const inFilter = (a) => A.filter === 'all' || (A.filter === 'unread' ? !a.read : typeOf(a).filter === A.filter);
  const whoName = (a) => (a.from ? LC.uname(a.from) : '');
  const whereOf = (a) => (a.chan ? ((a.chan.startsWith('dm:') ? S.users.has(LC.peerOf(a.chan)) : S.channels.has(a.chan)) ? LC.chanInfo(a.chan).title : a.where || '') : a.where || '');
  const emojiNode = (e) => { const cm = /^:([a-z0-9_]+):$/.exec(e || ''); return cm && S.emojis[cm[1]] ? el('img', { class: 'cemoji', src: LC.fileUrl({ id: S.emojis[cm[1]], name: 'e.png' }, true), alt: e }) : el('span', { class: 'pp-aemo', text: e || '' }); };
  function itemEl(a) {
    const ty = typeOf(a), u = a.from ? S.users.get(a.from) : null, prio = a.priority === 'urgent' ? 'urgent' : a.priority === 'important' ? 'important' : '';
    const lead = el('span', { class: 'pp-alead' }, u ? LC.avatar(u, '', false) : el('div', { class: 'av tile pp-aicon', 'aria-hidden': 'true' }, LC.icon(ty.icon, { filled: true })), el('span', { class: 'pp-abadge t-' + a.type, 'aria-hidden': 'true' }, a.type === 'reaction' ? emojiNode(a.emoji) : LC.icon(ty.icon, { filled: true })));
    let action = ''; try { action = ty.text(a) || ''; } catch {}
    const snippet = a.gone ? t('pp_msgDeleted') : [a.subject, a.text].filter(Boolean).join(' — '), where = whereOf(a);
    const main = el('button', { type: 'button', class: 'pp-amain', onclick: () => { if (!a.read) setRead([a.id], true); PP.openItem(a); } }, lead,
      el('span', { class: 'itext' }, el('span', { class: 'irow' }, el('span', { class: 'pp-aline' }, u ? el('b', { text: whoName(a) }) : null, u ? ' ' : '', action), el('time', { class: 'itime', text: LC.shortTime ? LC.shortTime(a.ts) : LC.fmtTime(a.ts), title: LC.fmtDateTime(a.ts) })),
        where ? el('span', { class: 'prev pp-awhere', text: where }) : null,
        prio ? el('span', { class: 'pp-aprio ' + prio }, LC.icon(prio === 'urgent' ? 'alert_urgent' : 'important', { filled: true }), el('span', { text: t(prio === 'urgent' ? 'pp_urgent' : 'pp_important') })) : null,
        snippet ? el('span', { class: 'prev pp-asnip' + (a.gone ? ' gone' : '') }, a.type === 'reaction' ? emojiNode(a.emoji) : null, a.type === 'reaction' ? ' ' : '', snippet) : null),
      a.read ? null : el('span', { class: 'pp-adot', role: 'img', 'aria-label': t('pp_unreadDot') }));
    return el('div', { class: 'pp-act' + (a.read ? '' : ' unread') + (prio ? ' prio-' + prio : ''), role: 'listitem', 'data-act': a.id }, main,
      LC.ibtn('more_horizontal', t('pp_itemMenu'), (e) => LC.menu(e.currentTarget, [a.read ? { icon: 'mail_unread', label: t('pp_markUnread'), fn: () => setRead([a.id], false) } : { icon: 'mail_read', label: t('pp_markRead'), fn: () => setRead([a.id], true) }]), { cls: 'icon pp-amore', menu: true }));
  }
  function renderActivity(nav) {
    if (!A.loaded && !A.loading) load();
    const chips = el('div', { class: 'pp-chipsbar', role: 'toolbar', 'aria-label': t('pp_filterAct') }, FILTERS.map(([k, key]) => el('button', { type: 'button', class: 'pp-chip' + (A.filter === k ? ' on' : ''), 'aria-pressed': String(A.filter === k), 'data-f': k, onclick: () => { A.filter = A.filter === k && k !== 'all' ? 'all' : k; LC.renderNav(); } }, el('span', { text: t(key) }), k === 'unread' && A.unread ? el('span', { class: 'pp-chipn', text: A.unread > 99 ? '99+' : String(A.unread) }) : null)));
    const list = A.items.filter(inFilter), body = [];
    if (A.err && !A.loaded) body.push(el('p', { class: 'err pad', text: A.err }));
    else if (!A.loaded) body.push(el('p', { class: 'muted small pad', text: t('loading') }));
    else if (!list.length) body.push(el('div', { class: 'empty' }, LC.icon('alert', { cls: 'big' }), el('p', { class: 'pp-emptyt', text: A.filter === 'all' ? t('pp_caughtUp') : t('pp_noneForFilter') }), A.filter === 'all' ? el('p', { class: 'small', text: t('pp_caughtUpHelp') }) : null));
    else body.push(el('div', { class: 'pp-acts', role: 'list', 'aria-label': t('railActivity') }, list.map(itemEl)));
    nav.replaceChildren(chips, ...body);
  }
  LC.ext.panes.activity = { icon: 'alert', label: () => t('railActivity'), order: 10, badge: () => A.unread, render: renderActivity,
    actions: () => [LC.ibtn('mail_read', t('pp_markAllRead'), () => { for (const a of A.items) a.read = true; recount(); redraw(); LC.api('/api/activity/read', { all: true }).catch((e) => LC.toast(e.message)); })] };

  // ---------- live ----------
  LC.on('init', (d) => { A.unread = d.ppActUnread || 0; A.loaded = false; setTimeout(load, 300); });
  LC.on('activity', (a) => {
    if (!visible(a)) return;
    if (!A.items.some((x) => x.id === a.id)) A.items.unshift(a); recount(); redraw();
    if (a.read || actSetting(a.type) !== 'banner' || (a.msg && alerted.has(a.msg))) return;
    if (held(a.from, a.priority === 'urgent')) return;
    const ty = typeOf(a); let action = ''; try { action = ty.text(a) || ''; } catch {}
    const np = LC.prefs().notif || {}; if (np.sound !== false) LC.playSound('ping');
    const title = (a.from ? LC.uname(a.from) + ' ' : '') + action, where = whereOf(a), body = np.previews === false ? where : [where, a.type === 'reaction' ? (a.emoji || '') + ' ' + (a.text || '') : a.text].filter(Boolean).join(' · ');
    if (a.msg) remember(a.msg);
    if (np.desktop === false) { if (LC.visible() && S.pane !== 'activity') LC.toast(title, { ms: 5000, action: { label: t('pp_view'), fn: () => PP.openItem(a) } }); return; }
    osNotify({ title, body, chan: a.chan, msg: a.msg, toast: S.pane !== 'activity', open: () => { if (!a.read) setRead([a.id], true); PP.openItem(a); } });
  });
  LC.on('activityread', (e) => { for (const a of A.items) if (e.ids === 'all' || (Array.isArray(e.ids) && e.ids.includes(a.id))) a.read = e.read !== false; recount(); redraw(); });
  LC.on('ppactdel', (e) => { const gone = new Set(e.ids || []); A.items = A.items.filter((a) => !gone.has(a.id)); recount(); redraw(); });
  let sig = ''; const sigOf = () => JSON.stringify([LC.prefs().actTypes || {}, LC.prefs().chatNotif || {}, LC.prefs().blocked || []]);
  LC.on('init', () => { sig = sigOf(); });
  LC.on('me', () => { const s = sigOf(); if (s !== sig) { sig = s; if (A.loaded) load(); } });
  LC.on('channel_removed', () => { if (A.loaded) load(); });

  // ---------- per-chat notification setting (chat list menu and the chat header's More menu) ----------
  const cnLabel = (v) => t({ all: 'pp_cn_all', mentions: 'pp_cn_mentions', off: 'pp_cn_off' }[v]);
  PP.setChatNotif = (chan, v) => { const m = { ...(LC.prefs().chatNotif || {}) }; if (v === 'all') delete m[chan]; else m[chan] = v; return PP.savePrefs({ chatNotif: m }); };
  const chatNotifMenu = (anchor, chan) => LC.menu(anchor, ['all', 'mentions', 'off'].map((v) => ({ label: cnLabel(v), checked: chatSetting(chan) === v, fn: () => PP.setChatNotif(chan, v) })));
  const anchorOf = (chan, header) => (header ? [...document.querySelectorAll('#headActions button[aria-haspopup="menu"]')].pop() : document.querySelector(`.item[data-chan="${CSS.escape(chan)}"] .kebab`)) || $('#title');
  LC.ext.chatMenu.push((e) => [{ icon: chatSetting(e.id) === 'all' ? 'alert' : 'alert_off', label: t('pp_chatNotif') + ': ' + cnLabel(chatSetting(e.id)), fn: () => chatNotifMenu(anchorOf(e.id), e.id) }]);
  LC.ext.headerMenu.push((chan) => [{ icon: chatSetting(chan) === 'all' ? 'alert' : 'alert_off', label: t('pp_chatNotif') + ': ' + cnLabel(chatSetting(chan)), fn: () => chatNotifMenu(anchorOf(chan, true), chan) }]);

  // ---------- Settings › Notifications: per-type settings and Do not disturb ----------
  const ACT_TYPES = ['mention', 'reply', 'reaction', 'follow', 'missedCall', 'voicemail', 'added', 'task', 'meeting', 'approval', 'form', 'report', 'system'];
  LC.ext.settingsSections.push({ tab: 'notifications', order: 10, render: () => {
    const save = (type, v) => { const m = { ...(LC.prefs().actTypes || {}) }; if (v === (DEFAULT_ACT[type] || 'banner')) delete m[type]; else m[type] = v; PP.savePrefs({ actTypes: m }); };
    const rows = ACT_TYPES.map((type) => { const s = el('select', { 'aria-label': t('pp_t_' + type), onchange: (e) => save(type, e.target.value) }, ['banner', 'feed', 'off'].map((v) => el('option', { value: v, text: t('pp_n_' + v) }))); s.value = actSetting(type); return el('div', { class: 'pp-nrow' }, el('span', { class: 'grow', text: t('pp_t_' + type) }), s); });
    const prio = (LC.prefs().priority || []).filter((id) => S.users.has(id));
    return el('div', { class: 'pp-settings' }, el('h3', {}, LC.icon('alert'), ' ' + t('pp_actSettings')), el('p', { class: 'muted small', text: t('pp_actHelp') }), el('div', { class: 'pp-ntable' }, rows),
      el('h3', {}, LC.icon('presence_dnd', { cls: 'p-dnd' }), ' ' + t('pp_dndTitle')), el('p', { class: 'muted small', text: t('pp_dndHelp') }),
      el('button', { class: 'secondary sm withicon', onclick: () => LC.settingsPanel('privacy') }, LC.icon('person_star'), el('span', { text: t('pp_managePriority', { n: prio.length }) })));
  } });
})();
