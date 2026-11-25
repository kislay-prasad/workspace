'use strict';
// Chat experience: emoji & fun, search & commands, chat list, writing messages, message actions (sections 1, 7, 14, 15, 16).
// Owned by the "chatux" feature area — see docs/EXTENDING.md for the extension points (LC.ext.*) and docs/features-chatux.md.
// This file: shared state (S.cx) and live events, settings, slash commands, links to messages (#m=<chan>/<id>).
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_settingsTitle: 'Chats and messages', cx_hidePreviews: 'Hide message previews in the chat list', cx_sendKey: 'Sending messages', cx_sendEnter: 'Enter sends, Shift+Enter adds a new line',
    cx_sendCtrl: 'Ctrl+Enter sends, Enter adds a new line', cx_sendKeyHint: 'In the expanded box (Format) Enter always adds a new line and Ctrl+Enter sends.', cx_shortcutsOn: 'Turn typed shortcuts like :) and <3 into emoji when sending',
    cx_animOff: 'Animated emoji follow “Reduce motion”.', cx_you: '(You)', cx_notesToSelf: 'Notes to self',
    cx_cmdAway: 'Set your status to Away', cx_cmdAvailable: 'Set your status to Available', cx_cmdBusy: 'Set your status to Busy', cx_cmdBrb: 'Set your status to Be right back', cx_cmdDnd: 'Set your status to Do not disturb',
    cx_cmdGoto: 'Go to a chat or channel', cx_cmdSaved: 'See your saved messages', cx_cmdFiles: 'See recent files', cx_cmdMentions: 'See your @mentions', cx_cmdUnread: 'See your unread chats', cx_cmdCall: 'Call someone',
    cx_cmdKeys: 'See keyboard shortcuts', cx_cmdHelp: 'See all commands', cx_argChat: 'chat name', cx_argName: 'name', cx_statusSet: 'Your status is now {s}', cx_noChatNamed: 'No chat matches “{q}”.', cx_noPersonNamed: 'Nobody here matches “{q}”.',
    cx_commands: 'Commands', cx_commandsHelp: 'Type / in the search box or at the start of the message box, then pick a command.', cx_unknownCmd: 'Unknown command {c}. Type /help to see them all.', cx_brb: 'Be right back', cx_busy: 'Busy',
    cx_msgGone: "That message isn't available to you.",
  });
  LC.addStrings('hi', { cx_settingsTitle: 'चैट और संदेश', cx_hidePreviews: 'चैट सूची में संदेश पूर्वावलोकन छिपाएँ', cx_you: '(आप)', cx_notesToSelf: 'खुद के लिए नोट्स', cx_commands: 'कमांड' });
  LC.addStrings('es', { cx_settingsTitle: 'Chats y mensajes', cx_hidePreviews: 'Ocultar vistas previas de mensajes en la lista de chats', cx_sendKey: 'Enviar mensajes', cx_sendEnter: 'Entrar envía, Mayús+Entrar agrega una línea', cx_sendCtrl: 'Ctrl+Entrar envía, Entrar agrega una línea', cx_you: '(Tú)', cx_notesToSelf: 'Notas para mí', cx_commands: 'Comandos', cx_statusSet: 'Tu estado ahora es {s}' });

  // ---------- shared state (filled from init: d.cx; see lib/routes-chatux.js) ----------
  const cx = (S.cx = { unread: {}, hidden: {}, follows: new Set(), unfollows: new Set(), seen: {}, threads: {}, keepUnread: null, openPosts: new Set(), gifs: null });
  LC.cxInit = (d) => {
    const c = d.cx || {};
    cx.unread = c.unread || {}; cx.hidden = c.hidden || {}; cx.follows = new Set(c.follows || []); cx.unfollows = new Set(c.unfollows || []);
    cx.seen = c.seen || {}; cx.threads = c.threads || {}; cx.keepUnread = null; cx.gifs = null;
  };
  LC.addEvents('cxunread', 'cxreadset', 'cxfollow', 'cxthread', 'cxhidden', 'cxgifs');
  LC.on('cxunread', (e) => { if (e.on) cx.unread[e.chan] = Date.now(); else delete cx.unread[e.chan]; LC.renderNav(); LC.updateBadge(); });
  LC.on('cxreadset', (e) => { S.read[e.chan] = e.seq; S.unread[e.chan] = e.unread; S.mentions[e.chan] = e.mentions; LC.renderNav(); LC.updateBadge(); });
  LC.on('cxfollow', (e) => { if (e.on) { cx.follows.add(e.id); cx.unfollows.delete(e.id); if (e.n) cx.threads[e.id] = { n: e.n, chan: e.chan }; } else { cx.follows.delete(e.id); cx.unfollows.add(e.id); } LC.renderNav(); if (S.chan && S.tab === 'chat' && LC.renderMessages) LC.renderMessages('keep'); }); // a follow can arrive after the root's update: redraw its "new replies"
  LC.on('cxthread', (e) => { cx.seen[e.id] = e.n; if (cx.threads[e.id]) cx.threads[e.id].n = Math.max(cx.threads[e.id].n, e.n); LC.renderNav(); if (S.chan && S.tab === 'chat') LC.renderMessages('keep'); });
  LC.on('cxhidden', (e) => { if (e.on) cx.hidden[e.chan] = e.ts || Date.now(); else delete cx.hidden[e.chan]; LC.renderNav(); });
  LC.on('cxgifs', (e) => { cx.gifs = e.gifs; LC.emitLocal('cx:gifs', e.gifs); });
  // a chat marked unread counts as one unread chat in the badge
  const coreTotal = LC.totalUnread;
  LC.totalUnread = () => coreTotal() + Object.keys(cx.unread).filter((c) => !S.unread[c] && !LC.isMuted(c)).length;

  // ---------- helpers other chatux files use ----------
  LC.isGroupChat = (c) => !!c && !!c.members && !c.team && (!c.kind || c.kind === 'group');
  LC.isSelfChat = (chan) => !!S.me && chan === LC.dmId(S.me.id, S.me.id);
  LC.chatTitle = (chan) => (LC.isSelfChat(chan) ? `${LC.realName(S.me.id)} ${t('cx_you')}` : LC.chanInfo(chan).title);

  // ---------- links to a message: <origin>/#m=<chan>/<id> ----------
  LC.msgLink = (m) => location.origin + '/#m=' + encodeURIComponent(m.chan).replace(/%3A/gi, ':') + '/' + m.id;
  LC.copyMsgLink = async (m) => LC.toast((await LC.copy(LC.msgLink(m))) ? t('cx_linkCopied') : t('copyFailed'), { ms: 1800 });
  const parseLink = (hash) => { const x = /^#m=([^/]{1,200})\/([A-Za-z0-9]{4,32})$/.exec(hash || ''); if (!x) return null; try { return { chan: decodeURIComponent(x[1]), id: x[2] }; } catch { return null; } };
  const canOpen = (chan) => (chan.startsWith('dm:') ? chan.split(':').length === 3 && chan.split(':').slice(1).includes(S.me.id) && chan.split(':').slice(1).every((i) => S.users.has(i)) : S.channels.has(chan));
  // read once after init (chat.js) and on hashchange; the hash is cleared once handled
  LC.takeHashLink = () => { const l = parseLink(location.hash); if (!l) return null; try { history.replaceState(null, '', location.pathname + location.search); } catch {} return canOpen(l.chan) ? l : (LC.toast(t('cx_msgGone')), null); };
  LC.openHashLink = (hash) => { const l = parseLink(hash); if (!l) return; if (!canOpen(l.chan)) return LC.toast(t('cx_msgGone')); LC.jumpToMessage(l.chan, l.id); };
  window.addEventListener('hashchange', () => { if (!S.me || !/^#m=/.test(location.hash)) return; const l = LC.takeHashLink(); if (l) LC.jumpToMessage(l.chan, l.id); });

  // ---------- settings: Settings › Appearance › Chats and messages ----------
  const check = (label, on, fn) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!on, onchange: (e) => fn(e.target.checked) }), el('span', { text: label }));
  const setPref = (patch) => { Object.assign(S.me.prefs, patch); LC.renderNav(); return LC.setPrefs(patch); };
  LC.ext.settingsSections.push({ tab: 'appearance', order: 40, render: () => {
    const p = LC.prefs(), key = p.sendKey === 'ctrl' ? 'ctrl' : 'enter';
    const radio = (v, label) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'cxSendKey', value: v, checked: key === v, onchange: () => setPref({ sendKey: v }) }), el('span', { text: label }));
    return el('section', { class: 'cx-settings' }, el('h3', { text: t('cx_settingsTitle') }),
      check(t('cx_hidePreviews'), p.hidePreviews, (v) => setPref({ hidePreviews: v })),
      check(t('cx_shortcutsOn'), p.emojiShortcuts !== false, (v) => setPref({ emojiShortcuts: v })),
      el('fieldset', { class: 'cx-fieldset' }, el('legend', { text: t('cx_sendKey') }), radio('enter', t('cx_sendEnter')), radio('ctrl', t('cx_sendCtrl')), el('p', { class: 'muted small', text: t('cx_sendKeyHint') })),
      el('p', { class: 'muted small', text: t('cx_animOff') }));
  } });

  // ---------- slash commands (search box and the start of the message box); other areas add theirs to LC.ext.commands ----------
  const presence = (state) => LC.api('/api/presence', { state }).then(() => LC.toast(t('cx_statusSet', { s: state === 'auto' ? t('online') : state === 'brb' ? t('cx_brb') : state === 'busy' ? t('cx_busy') : LC.presenceLabel(state) }), { ms: 2000 })).catch((e) => LC.toast(e.message));
  const best = (list, q, name) => { const l = q.toLowerCase(); return list.find((x) => name(x).toLowerCase() === l) || list.find((x) => name(x).toLowerCase().startsWith(l)) || list.find((x) => name(x).toLowerCase().includes(l)); };
  const goto = (q) => {
    q = q.trim().replace(/^[#@]/, ''); if (!q) return LC.quickSwitch();
    const e = LC.chatEntries(), list = [...e.all.values()].filter((x) => !x.hidden), hit = best(list, q, (x) => LC.entryName ? LC.entryName(x) : LC.chanInfo(x.id).title);
    if (hit) LC.openChat(hit.id); else LC.toast(t('cx_noChatNamed', { q }));
  };
  const call = async (q) => {
    q = q.trim().replace(/^@/, ''); if (!q) { if (S.chan) LC.startCall(S.chan, 'voice'); return; }
    const u = best([...S.users.values()].filter((x) => x.id !== S.me.id && !x.removed && !x.deleted), q, (x) => LC.uname(x.id)); if (!u) return LC.toast(t('cx_noPersonNamed', { q }));
    const dm = LC.dmId(S.me.id, u.id); await LC.openChat(dm); LC.startCall(dm, 'voice');
  };
  const add = (name, help, run, args) => { if (!LC.ext.commands['/' + name]) LC.ext.commands['/' + name] = { help, run, args }; };
  add('available', () => t('cx_cmdAvailable'), () => presence('auto')); add('away', () => t('cx_cmdAway'), () => presence('away')); add('busy', () => t('cx_cmdBusy'), () => presence('busy'));
  add('brb', () => t('cx_cmdBrb'), () => presence('brb')); add('dnd', () => t('cx_cmdDnd'), () => presence('dnd'));
  add('goto', () => t('cx_cmdGoto'), goto, () => t('cx_argChat')); add('saved', () => t('cx_cmdSaved'), () => LC.setPane('saved'));
  add('files', () => t('cx_cmdFiles'), () => LC.openSearch({ tab: 'files' })); add('mentions', () => t('cx_cmdMentions'), () => LC.openSearch({ tab: 'messages', has: 'mention' }));
  add('unread', () => t('cx_cmdUnread'), () => { LC.setPane('chat'); if (LC.setChatFilter) LC.setChatFilter('unread'); }); add('call', () => t('cx_cmdCall'), call, () => t('cx_argName'));
  add('keys', () => t('cx_cmdKeys'), () => LC.shortcutsHelp()); add('help', () => t('cx_cmdHelp'), () => LC.commandsHelp());
  const label = (x) => (typeof x === 'function' ? x() : x || '');
  LC.commandList = (prefix = '') => Object.entries(LC.ext.commands).filter(([k]) => k.toLowerCase().startsWith(('/' + prefix.replace(/^\//, '')).toLowerCase())).map(([k, c]) => ({ name: k, help: label(c.help), args: label(c.args) })).sort((a, b) => a.name.localeCompare(b.name));
  LC.runCommand = (text) => {
    const x = /^\/([\w-]+)\s*([\s\S]*)$/.exec(String(text || '').trim()); if (!x) return false;
    const key = Object.keys(LC.ext.commands).find((k) => k.toLowerCase() === '/' + x[1].toLowerCase());
    if (!key) { LC.toast(t('cx_unknownCmd', { c: '/' + x[1] })); return true; }
    try { const r = LC.ext.commands[key].run(x[2] || ''); if (r && r.catch) r.catch((e) => LC.toast(e.message)); } catch (e) { LC.toast(e.message); }
    return true;
  };
  LC.isCommand = (text) => { const x = /^\/([\w-]+)(\s|$)/.exec(String(text || '').trim()); return !!x && Object.keys(LC.ext.commands).some((k) => k.toLowerCase() === '/' + x[1].toLowerCase()); };
  LC.commandsHelp = () => LC.modal([el('h2', {}, LC.icon('slash_forward'), ' ' + t('cx_commands')), el('p', { class: 'muted small', text: t('cx_commandsHelp') }),
    el('table', { class: 'kb cx-cmdtable' }, ...LC.commandList().map((c) => el('tr', {}, el('td', {}, el('kbd', { text: c.name + (c.args ? ' ' + c.args : '') })), el('td', { text: c.help })))),
    el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))]);
})();
