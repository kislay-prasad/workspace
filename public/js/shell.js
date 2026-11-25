'use strict';
// Window and look, settings, accessibility and languages, desktop and phone (sections 2, 3, 4, 25).
// Owned by the "shell" feature area — see docs/EXTENDING.md for the extension points (LC.ext.*) and conventions.
// This file: shared helpers (LC.shell), back/forward history, zoom, the Help menu and help topics, "What's new",
// the first-run tour, the app bar (pin, reorder, More apps), pop-out windows and the sessions list in the profile menu.
// Other shell files: shell-langs.js (languages), shell-settings.js, shell-reader.js, shell-offline.js, shell-desktop.js.
(() => {
  const LC = window.LC, { el, S, $, $$ } = LC, t = (k, v) => LC.t(k, v);
  const SH = (LC.shell = LC.shell || {});

  LC.addStrings('en', {
    sh_back: 'Back', sh_forward: 'Forward', sh_navigation: 'Back and forward', sh_backKey: 'Back (Alt+Left)', sh_forwardKey: 'Forward (Alt+Right)',
    sh_zoom: 'Zoom', sh_zoomIn: 'Zoom in', sh_zoomOut: 'Zoom out', sh_zoomReset: 'Reset', sh_zoomToast: 'Zoom {n}%',
    sh_help: 'Help', sh_helpTopics: 'Help topics', sh_whatsNew: "What's new", sh_tour: 'Take the tour', sh_about: 'About LANChat', sh_helpSearch: 'Search help', sh_noHelp: 'No help topics match.',
    sh_moreApps: 'More apps', sh_searchApps: 'Search apps', sh_pin: 'Pin', sh_unpin: 'Unpin', sh_pinApp: 'Pin {name}', sh_unpinApp: 'Unpin {name}', sh_moveUp: 'Move up', sh_moveDown: 'Move down',
    sh_noApps: 'No apps match.', sh_resetApps: 'Reset the app bar', sh_dragHint: 'Drag apps on the app bar to reorder them. Right-click an app to pin, unpin or move it.', sh_appsReset: 'The app bar is back to how it started.',
    sh_popOutChat: 'Pop out chat', sh_popOutApp: 'Open in a new window', sh_popupBlocked: 'The new window was blocked. Allow pop-ups for this page and try again.', sh_popFailed: "Couldn't open a new window.",
    sh_sessions: 'Sessions', sh_manageSessions: 'Manage sessions…', sh_signedInTo: 'Signed in to {name}',
    sh_tourStep: '{n} of {total}', sh_next: 'Next', sh_done: 'Done', sh_skipTour: 'Skip tour', sh_tourLabel: 'Tour of LANChat',
    sh_tour1t: 'Your apps', sh_tour1: 'Activity, Chat, Calls and every other app live on the app bar. Right-click an app to pin, unpin or move it.',
    sh_tour2t: 'Your chats', sh_tour2: 'Chats with people, groups and channels. Pin the ones you use most, and right-click a chat for more options.',
    sh_tour3t: 'Start something new', sh_tour3: 'Start a new chat, group or channel from here.',
    sh_tour4t: 'Search', sh_tour4: 'Find messages, people and files. Ctrl+E jumps straight here.',
    sh_tour5t: 'Calls', sh_tour5: 'Start a video or audio call with everyone in this chat.',
    sh_tour6t: 'Settings and more', sh_tour6: 'Themes, languages, zoom, notifications, help — and this tour, if you want it again.',
    sh_wnTitle: "What's new in LANChat", sh_wnVersion: 'Version {v}', sh_gotIt: 'Got it',
    sh_wn1t: 'Back and forward', sh_wn1: "Go back to the chat or app you were just in with the arrows in the top bar, Alt + ← / →, or your mouse's back button.",
    sh_wn2t: 'Zoom', sh_wn2: 'Make everything bigger or smaller with Ctrl + = and Ctrl + −, or from Settings and more (…). LANChat remembers it.',
    sh_wn3t: 'Your app bar, your way', sh_wn3: "Drag apps to reorder them, unpin the ones you don't use, and find everything under More apps.",
    sh_wn4t: 'Pop out chats', sh_wn4: 'Open a chat or an app in its own window from the chat header (⋯) or the app bar.',
    sh_wn5t: 'Read aloud and Immersive reader', sh_wn5: 'Have a message read to you, or read it big and calm with line focus — from the message menu (⋯).',
    sh_wn6t: 'Twenty more languages', sh_wn6: 'Including Bengali, Tamil, Telugu, Urdu, Arabic, French, German, Chinese and Japanese. Arabic and Urdu read right to left.',
    sh_wn7t: 'Signed-in devices', sh_wn7: 'See where you are signed in and sign out of other devices in Settings › Privacy.',
    sh_wn8t: 'Read recent chats offline', sh_wn8: "Your latest messages stay on this device, so you can still read them when the host can't be reached.",
    sh_wn9t: 'Desktop app', sh_wn9: 'Share files with Send to, open lanchat:// links, spelling suggestions, and updates straight from your host.',
    sh_kbBack: 'Back / forward', sh_kbZoom: 'Zoom in / zoom out / actual size',
    sh_h1t: 'Getting started', sh_h1: "LANChat is a private chat for people on the same Wi-Fi. The host's computer keeps every message and file — nothing goes to the internet. Use Invite in the top bar to bring friends in; the host approves each person.",
    sh_h2t: 'Chats and channels', sh_h2: 'Channels are open to everyone in the session. Group chats and direct messages are private to the people in them. Pin the chats you use most (right-click a chat) and press Ctrl + K to jump to any chat.',
    sh_h3t: 'Writing messages', sh_h3: 'Format with **bold**, *italic*, `code`, lists and > quotes. Hover over a message to react, reply in a thread, or open More (⋯) to pin, save, forward, read aloud or open the Immersive reader.',
    sh_h4t: 'Calls and meetings', sh_h4: 'Use the video and phone buttons at the top of a chat. In a call you can share your screen, raise your hand and react. Browsers need the secure (https://) page for the microphone and camera — LANChat offers to switch.',
    sh_h5t: 'Files', sh_h5: 'Drop files anywhere on the window, paste them, or use the paperclip. The Files tab of a chat lists everything shared there. In the desktop app you can also send files from Windows Explorer (Send to › LANChat).',
    sh_h6t: 'Status and notifications', sh_h6: 'Set your status from your picture (top right). Do not disturb silences alerts. Quiet hours and sounds are in Settings › Notifications; mute one chat from its menu.',
    sh_h7t: 'Accessibility', sh_h7: 'Zoom with Ctrl + = and Ctrl + −, choose a high-contrast theme or bigger text, pick your language, or have messages read aloud. Everything works with the keyboard: Tab moves between areas and Ctrl + / lists the shortcuts.',
    sh_h8t: 'The desktop app', sh_h8: 'The app keeps hosted sessions running in the tray, shows unread messages on its icon, opens lanchat:// links, checks your spelling and updates itself from your host when the host has a newer version (it always asks first).',
    sh_h9t: 'Privacy and devices', sh_h9: "Messages and files are stored only on the host's computer. Settings › Privacy lists the devices signed in to your account and lets you sign them out.",
    sh_h10t: 'Reading offline', sh_h10: "LANChat keeps the latest messages of your 30 most recent chats on this device. When the host can't be reached you can still read them. They are removed when you sign out.",
  });
  LC.addStrings('hi', {
    sh_back: 'पीछे', sh_forward: 'आगे', sh_zoom: 'ज़ूम', sh_zoomIn: 'ज़ूम इन', sh_zoomOut: 'ज़ूम आउट', sh_zoomReset: 'रीसेट', sh_zoomToast: 'ज़ूम {n}%', sh_help: 'मदद', sh_helpTopics: 'मदद के विषय', sh_whatsNew: 'नया क्या है', sh_tour: 'टूर लें', sh_about: 'LANChat के बारे में',
    sh_moreApps: 'और ऐप्स', sh_searchApps: 'ऐप्स खोजें', sh_pin: 'पिन करें', sh_unpin: 'अनपिन करें', sh_moveUp: 'ऊपर ले जाएँ', sh_moveDown: 'नीचे ले जाएँ', sh_popOutChat: 'चैट अलग विंडो में खोलें', sh_popOutApp: 'नई विंडो में खोलें',
    sh_sessions: 'सत्र', sh_manageSessions: 'सत्र प्रबंधित करें…', sh_next: 'आगे', sh_done: 'हो गया', sh_skipTour: 'टूर छोड़ें', sh_gotIt: 'ठीक है', sh_wnTitle: 'LANChat में नया क्या है',
  });
  LC.addStrings('es', {
    sh_back: 'Atrás', sh_forward: 'Adelante', sh_zoom: 'Zoom', sh_zoomIn: 'Acercar', sh_zoomOut: 'Alejar', sh_zoomReset: 'Restablecer', sh_zoomToast: 'Zoom {n} %', sh_help: 'Ayuda', sh_helpTopics: 'Temas de ayuda', sh_whatsNew: 'Novedades', sh_tour: 'Hacer el recorrido', sh_about: 'Acerca de LANChat',
    sh_moreApps: 'Más aplicaciones', sh_searchApps: 'Buscar aplicaciones', sh_pin: 'Anclar', sh_unpin: 'Desanclar', sh_moveUp: 'Subir', sh_moveDown: 'Bajar', sh_popOutChat: 'Abrir el chat en otra ventana', sh_popOutApp: 'Abrir en una ventana nueva',
    sh_sessions: 'Sesiones', sh_manageSessions: 'Administrar sesiones…', sh_next: 'Siguiente', sh_done: 'Listo', sh_skipTour: 'Omitir recorrido', sh_gotIt: 'Entendido', sh_wnTitle: 'Novedades de LANChat',
  });

  // ---------- helpers shared by the shell files ----------
  SH.native = () => (LC.native && LC.native.shell) || null; // desktop bridge (desktop/preload.js); null in a browser
  SH.phone = () => matchMedia('(max-width: 760px)').matches;
  SH.automated = !!navigator.webdriver; // browser automation (tests): no first-run pop-ups
  SH.info = null; // desktop: { version, platform, zoom, links, downloads, ... } from main.js
  SH.refreshInfo = async () => { const n = SH.native(); if (!n) return null; try { SH.info = await n.info(); } catch { SH.info = null; } return SH.info; };
  SH.newer = (a, b) => { const x = String(a).split('.').map((v) => parseInt(v, 10) || 0), y = String(b).split('.').map((v) => parseInt(v, 10) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const lbl = (x) => (typeof x === 'function' ? x() : x || '');
  const modalOpen = () => !$('#modal').classList.contains('hidden') || !!$('.modal.top') || !!$('.sh-tour') || !!$('.sh-ir');
  SH.modalOpen = modalOpen;

  // pop-out windows: "?popout=chat:<chan>" or "?popout=app:<pane>" shows only that chat or app
  const pm = /^(chat|app):([\w:.-]{1,100})$/.exec(new URLSearchParams(location.search).get('popout') || '');
  SH.popMode = pm ? { kind: pm[1], id: pm[2] } : null;
  if (SH.popMode) { document.documentElement.dataset.shPopout = SH.popMode.kind; if (SH.popMode.kind === 'chat') S.chan = SH.popMode.id; }
  SH.openPopout = (kind, id) => {
    const n = SH.native(); if (n) return n.popout(kind, id).then((ok) => { if (!ok) LC.toast(t('sh_popFailed')); });
    const w = window.open(location.origin + location.pathname + '?popout=' + encodeURIComponent(kind + ':' + id), 'lcpop_' + (kind + '_' + id).replace(/\W/g, '_'), 'popup=yes,width=960,height=720');
    if (!w) LC.toast(t('sh_popupBlocked')); else { try { w.focus(); } catch {} }
  };

  // ---------- back / forward through chats, panes and apps (browser history, so Alt+←, mouse buttons and phones' back work) ----------
  const hist = { ids: [], views: new Map(), i: -1, seq: 0, replaying: false, last: 0 };
  const view = () => ({ pane: S.pane, chan: S.chan, app: S.app || null });
  const sameView = (a, b) => !!a && !!b && a.pane === b.pane && a.chan === b.chan && a.app === b.app;
  function record() {
    if (hist.replaying || SH.popMode || !S.me) return;
    const v = view(); if (sameView(hist.views.get(hist.ids[hist.i]), v)) return;
    const id = ++hist.seq; hist.ids = hist.ids.slice(0, hist.i + 1); hist.ids.push(id); hist.views.set(id, v); hist.i = hist.ids.length - 1;
    try { if (hist.i === 0) history.replaceState({ ...(history.state && typeof history.state === 'object' ? history.state : {}), lcNav: id }, ''); else history.pushState({ lcNav: id }, ''); } catch {}
    drawNav();
  }
  async function replay(v) {
    hist.replaying = true;
    try {
      if (v.app && LC.ext.panes[v.app]) { if (S.app !== v.app) LC.setPane(v.app); }
      else {
        const p = LC.ext.panes[v.pane]; if (p && !p.action && !p.main && (S.pane !== v.pane || S.app)) LC.setPane(v.pane);
        if (v.chan && !SH.phone()) await LC.openChat(v.chan);
      }
    } catch (e) { console.error('history', e); } finally { hist.replaying = false; drawNav(); }
  }
  window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.lcNav, idx = id ? hist.ids.indexOf(id) : -1; if (idx < 0 || !S.me) return;
    hist.i = idx; drawNav();
    if (SH.phone() && !$('#app').classList.contains('list-mode') && !S.app) { LC.menuToggle(true); return; } // phones: back from a chat shows the chat list
    replay(hist.views.get(id));
  });
  const go = (d) => { const now = Date.now(); if (now - hist.last < 250) return; hist.last = now; if (d < 0 && hist.i > 0) history.back(); else if (d > 0 && hist.i < hist.ids.length - 1) history.forward(); };
  SH.back = () => go(-1); SH.forward = () => go(1); SH.history = () => ({ i: hist.i, n: hist.ids.length });
  function drawNav() { const b = $('#shBack'), f = $('#shFwd'); if (b) b.disabled = !(hist.i > 0); if (f) f.disabled = !(hist.i >= 0 && hist.i < hist.ids.length - 1); }
  function navButtons() {
    const mk = (id, icon, label, title, fn) => { const b = el('button', { id, type: 'button', class: 'icon sh-navbtn', 'aria-label': label, title, onclick: fn, disabled: true }, LC.icon(icon, { cls: 'sh-flip' })); return b; };
    return el('div', { class: 'sh-nav', role: 'group', 'aria-label': t('sh_navigation') }, mk('shBack', 'arrow_left', t('sh_back'), t('sh_backKey'), () => SH.back()), mk('shFwd', 'arrow_right', t('sh_forward'), t('sh_forwardKey'), () => SH.forward()));
  }
  const origOpenChat = LC.openChat, origSetPane = LC.setPane, origOpenApp = LC.openApp;
  LC.openChat = async (...a) => { const r = await origOpenChat(...a); record(); return r; };
  LC.setPane = (pane, ...a) => { const r = origSetPane(pane, ...a); const p = LC.ext.panes[pane]; if (p && !p.action) record(); return r; };
  LC.openApp = (key, ...a) => { const r = origOpenApp(key, ...a); record(); return r; };
  // the desktop app has no browser buttons: Alt+←/→ and the mouse's back/forward buttons are handled here (browsers do it themselves)
  document.addEventListener('keydown', (e) => {
    if (!LC.native || !S.me || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); if (e.key === 'ArrowLeft') SH.back(); else SH.forward();
  });
  document.addEventListener('mouseup', (e) => { if (!LC.native || !S.me || (e.button !== 3 && e.button !== 4)) return; e.preventDefault(); if (e.button === 3) SH.back(); else SH.forward(); });

  // ---------- zoom: Ctrl+= / Ctrl+- / Ctrl+0 (desktop: the window's zoom, set by main.js; browser: the app is scaled) ----------
  const ZOOMS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
  const clampZ = (z) => Math.max(50, Math.min(200, Math.round(Number(z) || 100)));
  SH.zoomLevels = ZOOMS;
  SH.zoom = () => (SH.native() ? clampZ(((SH.info && SH.info.zoom) || 1) * 100) : clampZ(LC.ui.shZoom || 100));
  function applyZoom() {
    const r = document.documentElement, z = SH.native() ? 100 : clampZ(LC.ui.shZoom || 100);
    if (z === 100) { delete r.dataset.shZoom; r.style.removeProperty('--sh-zoom'); } else { r.dataset.shZoom = String(z); r.style.setProperty('--sh-zoom', String(z / 100)); }
  }
  let zoomToastNode = null;
  SH.zoomToast = (pct) => {
    if (zoomToastNode) zoomToastNode.remove();
    zoomToastNode = LC.toast(t('sh_zoomToast', { n: pct }), pct === 100 ? { ms: 2500 } : { ms: 4000, action: { label: t('sh_zoomReset'), fn: () => SH.setZoom(100) } }); zoomToastNode.classList.add('sh-zoomtoast');
  };
  SH.setZoom = async (pct, toast = true) => {
    pct = clampZ(pct); const n = SH.native();
    if (n) { const f = await n.setZoom(pct / 100); SH.info = { ...(SH.info || {}), zoom: f || pct / 100 }; } else { LC.setUi({ shZoom: pct }); applyZoom(); }
    if (toast) SH.zoomToast(pct); LC.emitLocal('sh:zoom', { zoom: pct });
  };
  SH.zoomStep = (d) => { const z = SH.zoom(); return SH.setZoom(d === 0 ? 100 : d > 0 ? (ZOOMS.find((s) => s > z) || 200) : ([...ZOOMS].reverse().find((s) => s < z) || 50)); };
  applyZoom();
  document.addEventListener('keydown', (e) => {
    if (SH.native() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const d = e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' ? 1 : e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' ? -1 : e.key === '0' || e.code === 'Numpad0' ? 0 : null;
    if (d === null) return; e.preventDefault(); SH.zoomStep(d);
  });
  let wheelAcc = 0, wheelAt = 0;
  window.addEventListener('wheel', (e) => {
    if (SH.native() || !e.ctrlKey) return; e.preventDefault(); const now = Date.now(); if (now - wheelAt > 400) wheelAcc = 0; wheelAt = now; wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= 60) { SH.zoomStep(wheelAcc < 0 ? 1 : -1); wheelAcc = 0; }
  }, { passive: false });
  // "Settings and more" (…) gets a Teams-style zoom row: Zoom  −  110%  +
  function zoomItem() {
    const label = t('sh_zoom');
    setTimeout(() => {
      const m = $('#menu'), b = [...m.querySelectorAll('button')].find((x) => (x.querySelector('.ml') || {}).textContent === label); if (!b) return;
      const pct = el('span', { class: 'sh-zpct', text: SH.zoom() + '%' });
      const step = (d, icon, name) => el('button', { type: 'button', role: 'menuitem', class: 'sh-zbtn', 'aria-label': name, title: name, onclick: async (ev) => { ev.stopPropagation(); await SH.zoomStep(d); pct.textContent = SH.zoom() + '%'; } }, LC.icon(icon));
      b.replaceWith(el('div', { class: 'sh-zoomrow', role: 'group', 'aria-label': label }, el('span', { class: 'mi' }, LC.icon('zoom_in')), el('span', { class: 'ml', text: label }), step(-1, 'zoom_out', t('sh_zoomOut')), pct, step(1, 'zoom_in', t('sh_zoomIn'))));
    }, 0);
    return { icon: 'zoom_in', label, fn: () => {} };
  }

  // ---------- Help: menu, topics, keyboard shortcuts, What's new ----------
  SH.helpMenu = (anchor) => LC.menu(anchor || $('#gearBtn'), [
    { icon: 'book_question_mark', label: t('sh_helpTopics'), fn: () => SH.helpTopics() }, { icon: 'keyboard', label: t('shortcuts'), fn: () => LC.shortcutsHelp() },
    { icon: 'sparkle', label: t('sh_whatsNew'), fn: () => SH.whatsNew() }, { icon: 'lightbulb', label: t('sh_tour'), fn: () => SH.tour() }, 'sep',
    { icon: 'info', label: t('sh_about'), fn: () => LC.settingsPanel('about') },
  ]);
  LC.ext.mainMenu.push(() => (SH.popMode ? [] : ['sep', zoomItem(), { icon: 'question_circle', label: t('sh_help'), fn: () => SH.helpMenu($('#gearBtn')) }, 'sep']));
  const TOPICS = [['rocket', 1], ['chat_multiple', 2], ['text_edit_style', 3], ['video', 4], ['folder', 5], ['alert', 6], ['accessibility', 7], ['desktop', 8], ['shield_lock', 9], ['cloud_off', 10]];
  SH.helpTopics = (start = 0) => {
    const q = el('input', { type: 'search', placeholder: t('sh_helpSearch'), 'aria-label': t('sh_helpSearch') }), list = el('div', { class: 'sh-helplist', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('sh_helpTopics') }), body = el('div', { class: 'sh-helpbody', role: 'tabpanel', tabindex: '0' });
    let cur = start;
    const show = (i) => { cur = i; const [ic, n] = TOPICS[i]; body.replaceChildren(el('h3', {}, LC.icon(LC.hasIcon(ic) ? ic : 'info'), ' ' + t('sh_h' + n + 't')), el('p', { text: t('sh_h' + n) })); draw(); };
    const draw = () => { const f = q.value.trim().toLowerCase(), hits = TOPICS.map((x, i) => i).filter((i) => !f || (t('sh_h' + TOPICS[i][1] + 't') + ' ' + t('sh_h' + TOPICS[i][1])).toLowerCase().includes(f));
      list.replaceChildren(...(hits.length ? hits.map((i) => el('button', { type: 'button', role: 'tab', class: 'sh-helptab' + (i === cur ? ' on' : ''), 'aria-selected': String(i === cur), onclick: () => show(i) }, LC.icon(LC.hasIcon(TOPICS[i][0]) ? TOPICS[i][0] : 'info'), el('span', { text: t('sh_h' + TOPICS[i][1] + 't') }))) : [el('p', { class: 'muted small', text: t('sh_noHelp') })])); };
    q.addEventListener('input', () => { draw(); const first = list.querySelector('.sh-helptab'); if (first && !list.querySelector('.sh-helptab.on')) first.click(); });
    LC.modal([el('div', { class: 'row-between' }, el('h2', { style: { margin: 0 } }, LC.icon('book_question_mark'), ' ' + t('sh_helpTopics')), LC.ibtn('dismiss', t('close'), LC.closeModal)), q, el('div', { class: 'sh-help' }, list, body),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('shortcuts'), onclick: () => LC.shortcutsHelp() }), el('button', { class: 'secondary', text: t('sh_tour'), onclick: () => { LC.closeModal(); SH.tour(); } }), el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))], { wide: true, label: t('sh_helpTopics') });
    show(cur);
  };
  const origShortcuts = LC.shortcutsHelp;
  LC.shortcutsHelp = (...a) => {
    origShortcuts(...a); const tb = $('#modal table.kb'); if (!tb) return;
    for (const [k, d] of [['Alt + ← / →', 'sh_kbBack'], ['Ctrl/⌘ + = / − / 0', 'sh_kbZoom']]) tb.append(el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: t(d) })));
  };
  // What's new: shown once after an update (for people who already used LANChat); always in Help
  const NOTES = { id: '2026.11-shell', items: [['arrow_left', 'sh_wn1t', 'sh_wn1'], ['zoom_in', 'sh_wn2t', 'sh_wn2'], ['apps', 'sh_wn3t', 'sh_wn3'], ['window_new', 'sh_wn4t', 'sh_wn4'], ['immersive_reader', 'sh_wn5t', 'sh_wn5'], ['local_language', 'sh_wn6t', 'sh_wn6'], ['phone_laptop', 'sh_wn7t', 'sh_wn7'], ['cloud_off', 'sh_wn8t', 'sh_wn8'], ['desktop', 'sh_wn9t', 'sh_wn9']] };
  // other areas may add their own lines: LC.shell.addWhatsNew('video', 'cl_wnTitleKey', 'cl_wnTextKey')
  SH.addWhatsNew = (icon, titleKey, textKey) => NOTES.items.push([icon, titleKey, textKey]);
  SH.notesId = () => NOTES.id;
  SH.whatsNew = () => {
    LC.modal([el('div', { class: 'row-between' }, el('h2', { style: { margin: 0 } }, LC.icon('sparkle'), ' ' + t('sh_wnTitle')), LC.ibtn('dismiss', t('close'), LC.closeModal)),
      S.appVersion ? el('p', { class: 'muted small', style: { margin: 0 }, text: t('sh_wnVersion', { v: S.appVersion }) }) : null,
      el('ul', { class: 'sh-wn' }, NOTES.items.map(([ic, tk, xk]) => el('li', {}, el('span', { class: 'sh-wnic', 'aria-hidden': 'true' }, LC.icon(LC.hasIcon(ic) ? ic : 'sparkle')), el('div', {}, el('b', { text: t(tk) }), el('p', { text: t(xk) }))))),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('sh_tour'), onclick: () => { LC.closeModal(); SH.tour(); } }), el('button', { class: 'primary', text: t('sh_gotIt'), onclick: LC.closeModal }))], { label: t('sh_wnTitle') });
    if (LC.prefs().shNotes !== NOTES.id) LC.setPrefs({ shNotes: NOTES.id });
  };

  // ---------- first-run tour (new people, once; skippable; Help › Take the tour any time) ----------
  const TOUR = [
    { k: 1, at: () => $('#rail') }, { k: 2, at: () => $('#sidebar') },
    { k: 3, at: () => [...$$('#sideActions button')].find((b) => b.getAttribute('aria-label') === t('newChannel')) || $('#sideActions button:last-child') },
    { k: 4, at: () => (SH.phone() ? $('#searchBtn') : $('.topsearch')) }, { k: 5, at: () => $('#headActions .callgroup') }, { k: 6, at: () => $('#gearBtn') },
  ];
  const shown = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  let tourEnd = null;
  SH.tour = () => {
    if (tourEnd) tourEnd(false); if (!S.me || SH.popMode) return;
    LC.closeMenu(); LC.closeModal();
    if (S.pane !== 'chat' || S.app) { LC.setPane('chat'); if (S.chan) LC.openChat(S.chan); }
    if (SH.phone()) LC.menuToggle(true);
    const before = document.activeElement, ring = el('div', { class: 'sh-tour-ring', 'aria-hidden': 'true' }), card = el('div', { class: 'sh-tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shTourT', 'aria-describedby': 'shTourX' });
    const layer = el('div', { class: 'sh-tour' }, ring, card); let i = 0;
    const steps = () => TOUR.filter((s) => shown(s.at()));
    const place = () => {
      const list = steps(); if (!list.length) return end(true); i = Math.max(0, Math.min(i, list.length - 1));
      const s = list[i], r = s.at().getBoundingClientRect(), pad = 6, last = i === list.length - 1;
      Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      card.replaceChildren(el('div', { class: 'sh-tour-step small muted', text: t('sh_tourStep', { n: i + 1, total: list.length }) }), el('h2', { id: 'shTourT', text: t('sh_tour' + s.k + 't') }), el('p', { id: 'shTourX', text: t('sh_tour' + s.k) }),
        el('div', { class: 'acts' }, el('button', { type: 'button', class: 'link sh-tour-skip', text: t('sh_skipTour'), onclick: () => end(true) }), i > 0 ? el('button', { type: 'button', class: 'secondary', text: t('sh_back'), onclick: () => { i--; place(); } }) : null,
          el('button', { type: 'button', class: 'primary', text: last ? t('sh_done') : t('sh_next'), onclick: () => { if (last) end(true); else { i++; place(); } } })));
      const W = Math.min(340, innerWidth - 24), H = card.offsetHeight || 180, gap = 14;
      let x = r.right + gap, y = r.top;
      if (x + W > innerWidth - 12) { x = Math.min(Math.max(12, r.left), innerWidth - W - 12); y = r.bottom + gap; if (y + H > innerHeight - 12) y = r.top - H - gap; }
      if (y < 12 || y + H > innerHeight - 12) y = Math.max(12, Math.min(innerHeight - H - 12, r.top + r.height / 2 - H / 2));
      Object.assign(card.style, { left: x + 'px', top: y + 'px', width: W + 'px' });
      const f = card.querySelector('.primary'); if (f) f.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(true); } else if (e.key === 'ArrowRight' && !e.altKey) { i++; place(); } else if (e.key === 'ArrowLeft' && !e.altKey && i > 0) { i--; place(); } };
    const end = (done) => { tourEnd = null; window.removeEventListener('resize', place); layer.remove(); if (done && !LC.prefs().shTour) LC.setPrefs({ shTour: true }); try { if (before && before.focus) before.focus(); } catch {} };
    tourEnd = end; layer.addEventListener('keydown', onKey); LC.focusTrap(card); document.body.append(layer); window.addEventListener('resize', place);
    requestAnimationFrame(place);
  };

  // first run: new people get the tour, people who used an older version get "What's new" (once, never during automated tests)
  let booted = false;
  SH.firstRun = (force) => {
    if (!S.me || SH.popMode || (SH.automated && !force) || modalOpen()) return;
    const p = LC.prefs(), created = (SH.initShell && SH.initShell.created) || 0, isNew = !!created && Date.now() - created < 3 * 86400000;
    if (isNew) { if (!p.shTour) SH.tour(); if (p.shNotes !== NOTES.id) LC.setPrefs({ shNotes: NOTES.id }); return; }
    if (p.shNotes !== NOTES.id) SH.whatsNew();
  };
  LC.on('init', (d) => {
    if (d.shOffline) return; SH.initShell = d.shell || {};
    if (booted) return; booted = true; setTimeout(() => SH.firstRun(), 1500);
  });

  // ---------- app bar: pin / unpin / reorder (prefs.apps), "More apps" ----------
  const appsPref = () => { const a = LC.prefs().apps || {}; return { order: Array.isArray(a.order) ? a.order : [], unpinned: Array.isArray(a.unpinned) ? a.unpinned : [] }; };
  const paneList = () => Object.entries(LC.ext.panes).map(([key, p]) => ({ key, ...p })).filter((p) => { try { return !p.hidden || !p.hidden(); } catch { return false; } }).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const topKeys = () => { const { order } = appsPref(), list = paneList().filter((p) => !p.bottom), def = new Map(list.map((p, i) => [p.key, i])); const pos = (k) => (order.includes(k) ? order.indexOf(k) : order.length + def.get(k)); return list.map((p) => p.key).sort((a, b) => pos(a) - pos(b)); };
  SH.appOrder = topKeys;
  const saveApps = (a) => { if (S.me) S.me.prefs = { ...(S.me.prefs || {}), apps: a }; LC.renderRail(); LC.setPrefs({ apps: a }); };
  const togglePin = (k) => { const a = appsPref(), un = a.unpinned.includes(k) ? a.unpinned.filter((x) => x !== k) : [...a.unpinned, k]; if (topKeys().every((x) => un.includes(x))) return; saveApps({ order: topKeys(), unpinned: un }); };
  const moveTo = (k, target, after) => { const keys = topKeys().filter((x) => x !== k); let i = keys.indexOf(target); if (i < 0) return; if (after) i++; keys.splice(i, 0, k); saveApps({ order: keys, unpinned: appsPref().unpinned }); };
  const moveBy = (k, d) => { const keys = topKeys(), shownKeys = keys.filter((x) => !appsPref().unpinned.includes(x) || x === k), i = shownKeys.indexOf(k), j = i + d; if (j < 0 || j >= shownKeys.length) return; moveTo(k, shownKeys[j], d > 0); };
  SH.togglePin = togglePin; SH.moveApp = moveBy;
  function appMenu(anchor, k) {
    const p = LC.ext.panes[k]; if (!p) return; const pinned = !appsPref().unpinned.includes(k), keys = topKeys().filter((x) => !appsPref().unpinned.includes(x)), i = keys.indexOf(k);
    LC.menu(anchor, [k !== 'chat' ? { icon: pinned ? 'pin_off' : 'pin', label: pinned ? t('sh_unpin') : t('sh_pin'), fn: () => togglePin(k) } : null,
      pinned && i > 0 ? { icon: 'arrow_up', label: t('sh_moveUp'), fn: () => moveBy(k, -1) } : null, pinned && i >= 0 && i < keys.length - 1 ? { icon: 'arrow_down', label: t('sh_moveDown'), fn: () => moveBy(k, 1) } : null,
      p.main && !SH.popMode ? 'sep' : null, p.main && !SH.popMode ? { icon: 'window_new', label: t('sh_popOutApp'), fn: () => SH.openPopout('app', k) } : null]);
  }
  let dragKey = null;
  const clearDrop = () => $$('.rbtn.sh-dropb, .rbtn.sh-dropa').forEach((b) => b.classList.remove('sh-dropb', 'sh-dropa'));
  LC.ext.rail.push((rail) => {
    const top = rail.querySelector('.rtop'); if (!top) return;
    const { unpinned } = appsPref(), keys = topKeys(), btns = new Map([...top.querySelectorAll('.rbtn[data-pane]')].map((b) => [b.dataset.pane, b])), horiz = SH.phone();
    let n = 0;
    for (const k of keys) {
      const b = btns.get(k); if (!b) continue; const off = unpinned.includes(k);
      if (off && S.pane !== k) { b.remove(); continue; }
      b.classList.toggle('sh-temp', off); top.append(b); b.classList.toggle('sh-over', n++ >= 4 && !b.classList.contains('on'));
      if (b._sh) continue; b._sh = true; b.draggable = true;
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); appMenu(b, k); });
      b.addEventListener('keydown', (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); appMenu(b, k); } });
      b.addEventListener('dragstart', (e) => { dragKey = k; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/x-lanchat-app', k); } catch {} b.classList.add('sh-dragging'); });
      b.addEventListener('dragend', () => { dragKey = null; b.classList.remove('sh-dragging'); clearDrop(); });
      b.addEventListener('dragover', (e) => { if (!dragKey || dragKey === k) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = b.getBoundingClientRect(), after = horiz ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; clearDrop(); b.classList.add(after ? 'sh-dropa' : 'sh-dropb'); });
      b.addEventListener('dragleave', () => b.classList.remove('sh-dropb', 'sh-dropa'));
      b.addEventListener('drop', (e) => { if (!dragKey || dragKey === k) return; e.preventDefault(); const r = b.getBoundingClientRect(), after = horiz ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2, from = dragKey; dragKey = null; clearDrop(); moveTo(from, k, after); });
    }
    if (!SH.popMode) top.append(el('button', { type: 'button', class: 'rbtn sh-more', 'aria-label': t('sh_moreApps'), title: t('sh_moreApps'), 'aria-haspopup': 'dialog', onclick: (e) => SH.moreApps(e.currentTarget) }, el('span', { class: 'rico' }, LC.icon('more_horizontal')), el('span', { class: 'rlabel', text: t('sh_moreApps') })));
  });
  let popEl = null;
  const closePop = (refocus) => { if (!popEl) return; const a = popEl._anchor; popEl.remove(); popEl = null; document.removeEventListener('mousedown', outside, true); if (refocus && a && a.isConnected) a.focus(); };
  const outside = (e) => { if (popEl && !popEl.contains(e.target) && !(popEl._anchor && popEl._anchor.contains(e.target))) closePop(false); };
  SH.moreApps = (anchor) => {
    if (popEl) return closePop(true);
    const q = el('input', { type: 'search', placeholder: t('sh_searchApps'), 'aria-label': t('sh_searchApps') }), list = el('ul', { class: 'sh-applist' });
    const draw = () => {
      const f = q.value.trim().toLowerCase(), { unpinned } = appsPref(), keys = topKeys(), pos = (k) => { const i = keys.indexOf(k); return i < 0 ? 999 : i; };
      const all = paneList().filter((p) => !f || lbl(p.label).toLowerCase().includes(f)).sort((a, b) => (a.bottom ? 1 : 0) - (b.bottom ? 1 : 0) || pos(a.key) - pos(b.key));
      list.replaceChildren(...(all.length ? all.map((p) => { const name = lbl(p.label), pinned = !unpinned.includes(p.key);
        return el('li', { class: 'sh-approw' + (S.pane === p.key ? ' on' : '') }, el('button', { type: 'button', class: 'sh-appopen', onclick: () => { closePop(false); LC.setPane(p.key); } }, LC.icon(p.icon || 'apps'), el('span', { text: name })),
          p.bottom || p.key === 'chat' ? null : el('button', { type: 'button', class: 'icon', 'aria-pressed': String(pinned), 'aria-label': t(pinned ? 'sh_unpinApp' : 'sh_pinApp', { name }), title: t(pinned ? 'sh_unpinApp' : 'sh_pinApp', { name }), onclick: () => { togglePin(p.key); draw(); } }, LC.icon('pin', { filled: pinned }))); })
        : [el('li', { class: 'muted small sh-noapps', text: t('sh_noApps') })]));
    };
    q.addEventListener('input', draw);
    popEl = el('div', { class: 'sh-pop', role: 'dialog', 'aria-label': t('sh_moreApps') }, el('h2', { class: 'sh-pophead', text: t('sh_moreApps') }), q, list, el('p', { class: 'muted small', text: t('sh_dragHint') }),
      el('button', { type: 'button', class: 'link small', text: t('sh_resetApps'), onclick: () => { saveApps({ order: [], unpinned: [] }); LC.toast(t('sh_appsReset'), { ms: 2500 }); draw(); } }));
    popEl._anchor = anchor; popEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); } });
    LC.focusTrap(popEl); document.body.append(popEl); draw();
    const r = anchor.getBoundingClientRect(), W = popEl.offsetWidth, H = popEl.offsetHeight, rtl = document.documentElement.dir === 'rtl';
    if (SH.phone()) Object.assign(popEl.style, { left: '8px', right: '8px', bottom: innerHeight - r.top + 6 + 'px', top: 'auto', width: 'auto' });
    else Object.assign(popEl.style, { left: (rtl ? Math.max(8, r.left - W - 6) : Math.min(innerWidth - W - 8, r.right + 6)) + 'px', top: Math.max(8, Math.min(innerHeight - H - 8, r.top - 12)) + 'px' });
    document.addEventListener('mousedown', outside, true); q.focus();
  };

  // ---------- pop out the open chat or app (button at the end of the chat header, chat menus) ----------
  LC.ext.headerMenu.push((chan) => (SH.popMode ? [] : [{ icon: 'window_new', label: t('sh_popOutChat'), fn: () => SH.openPopout('chat', chan) }]));
  LC.ext.chatMenu.push((e) => (SH.popMode ? [] : ['sep', { icon: 'window_new', label: t('sh_popOutChat'), fn: () => SH.openPopout('chat', e.id) }]));
  function popButton() {
    const host = $('#headActions'); if (!host || SH.popMode || host.querySelector('.sh-popbtn')) return;
    const app = S.app && LC.ext.panes[S.app] ? S.app : null; if (!app && !S.chan) return;
    const b = LC.ibtn('window_new', app ? t('sh_popOutApp') : t('sh_popOutChat'), () => (app ? SH.openPopout('app', app) : SH.openPopout('chat', S.chan)), { cls: 'icon sh-popbtn' });
    host.append(b);
  }

  // ---------- sessions in the profile menu (desktop: every session the app knows; browser: this one) ----------
  SH.sessions = [];
  SH.loadSessions = async () => { const n = SH.native(); if (!n) return []; try { SH.sessions = (await n.sessions()) || []; } catch { SH.sessions = []; } return SH.sessions; };
  LC.ext.profileMenu.push(() => {
    if (SH.popMode) return [];
    const n = SH.native(); if (!n) return ['sep', { icon: 'person_accounts', label: t('sh_signedInTo', { name: S.chatName }), disabled: true }, 'sep'];
    SH.loadSessions();
    return ['sep', { icon: 'people_team', label: t('sh_sessions'), disabled: true }, ...SH.sessions.map((s) => ({ label: s.name, checked: !!s.current, fn: () => { if (!s.current) n.switchSession(s.id); } })), { icon: 'settings', label: t('sh_manageSessions'), fn: () => n.manageSessions() }, 'sep'];
  });

  // desktop menu items (Help menu) -> web panels
  const origPanel = LC.openPanel;
  LC.openPanel = (name) => {
    if (!S.me) return; name = String(name);
    if (name === 'sh:help') return SH.helpTopics(); if (name === 'sh:whatsnew') return SH.whatsNew(); if (name === 'sh:tour') return SH.tour(); if (name === 'sh:about') return LC.settingsPanel('about');
    return origPanel(name);
  };

  // ---------- frame: back/forward buttons in the top bar, pop-out mode ----------
  document.addEventListener('DOMContentLoaded', () => {
    const brand = $('#brand'); if (brand) brand.after(navButtons());
    const host = $('#headActions'); if (host) new MutationObserver(popButton).observe(host, { childList: true });
  });
  LC.on('lang', () => { const old = $('.sh-nav'); if (old) { old.replaceWith(navButtons()); drawNav(); } const b = $('.sh-popbtn'); if (b) { b.remove(); popButton(); } });
  if (SH.popMode) {
    // a pop-out window shows one chat or app: no app bar, chat list or top bar; it does not alert (the main window does)
    LC.alertMessage = () => {};
    const origBadge = LC.updateBadge; LC.updateBadge = () => { origBadge(); const i = LC.chanInfo(S.chan); document.title = (S.app && LC.ext.panes[S.app] ? lbl(LC.ext.panes[S.app].label) : i.title || S.chatName) + ' — ' + S.chatName; };
    let firstOpen = true;
    LC.openChat = ((inner) => async (...a) => { const r = await inner(...a); if (firstOpen && SH.popMode.kind === 'app') { firstOpen = false; LC.setPane(SH.popMode.id); } return r; })(LC.openChat);
  }
})();
