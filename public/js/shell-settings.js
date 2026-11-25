'use strict';
// Shell area: the parts of Settings it fills (panels.js calls LC.shellSettings.<part>()): General, chat density, zoom,
// read-aloud voice, sign-language signers, Privacy › signed-in devices, Files and links, About (versions, updates).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), SH = LC.shell, X = (LC.shellSettings = LC.shellSettings || {});
  const K = () => LC.formKit; // { field, row, toggle, select } from panels.js
  const fail = (e) => LC.toast(e.message || String(e));

  LC.addStrings('en', {
    sh_tabGeneral: 'General', sh_tabAppearance: 'Appearance and accessibility', sh_tabDevices: 'Devices', sh_tabFiles: 'Files and links',
    sh_secTheme: 'Theme', sh_secLayout: 'Layout', sh_secAccess: 'Accessibility', sh_secReceipts: 'Read receipts',
    sh_density: 'Chat density', sh_comfy: 'Comfy', sh_compact: 'Compact', sh_comfyHint: 'More space around messages', sh_compactHint: 'Fit more messages on the screen',
    sh_default: '(default)', sh_zoomHint: 'Ctrl + = and Ctrl + − work anywhere; Ctrl + 0 goes back to 100%.',
    sh_secApp: 'App', sh_startup: 'Start LANChat when I sign in to this computer', sh_closeTray: 'Keep LANChat running in the tray when I close the window', sh_spell: 'Check my spelling', sh_spellHint: 'English plus the language LANChat is shown in. Right-click a word for suggestions. The first time, the dictionary is downloaded if this computer is online.',
    sh_secSessions: 'Sessions', sh_sessionsHint: "A session is one chat group. You can host several on this computer and join friends' sessions.",
    sh_secHelp: 'Help and tour',
    sh_secStorage: 'Storage', sh_storageUsed: 'LANChat uses {size} on this device.', sh_storageQuota: 'LANChat uses {size} on this device ({quota} available).', sh_storageNA: "This page can't show how much storage it uses.",
    sh_cacheDesk: 'Cache: {cache} · Saved data: {storage}', sh_clearCache: 'Clear cache', sh_clearCacheHint: 'Removes the saved copy of the app and of recent messages. You stay signed in.', sh_cacheCleared: 'Cache cleared. You are still signed in.', sh_checking: 'Checking…',
    sh_secDownloads: 'Downloads', sh_dlSave: 'Where files are saved', sh_dlFolder: 'Save to {dir}', sh_dlAsk: 'Ask where to save each file', sh_dlChange: 'Change folder…', sh_dlBrowser: 'Your browser decides where downloads go — usually your Downloads folder.',
    sh_secLinks: 'Links', sh_linksOpen: 'Open web links in', sh_linksBrowser: 'My web browser', sh_linksApp: 'A LANChat window', sh_linksHint: 'Links to messages in this session always open right here in LANChat.', sh_linksHintBrowser: 'Web links in messages open in a new browser tab. Links to messages in this session open right here.',
    sh_secSendTo: 'Share from Windows', sh_sendTo: 'Show LANChat in the Send to menu', sh_sendToHint: 'In File Explorer, right-click files › Send to › LANChat to share them in a chat. Dropping files on the LANChat icon works too.',
    sh_secPhotos: 'Photos and videos',
    sh_secDevices: 'Signed-in devices', sh_devicesHelp: "Every browser and app signed in to your account in this session. Sign out of any you don't recognise — to come back, they ask to join again and the host approves them.",
    sh_thisDevice: 'This device', sh_signOutDev: 'Sign out', sh_signOutDevNamed: 'Sign out {name}', sh_signOutOthers: 'Sign out of all other devices', sh_confirmSignOutOthers: 'Sign out of every other device? They will have to ask to join again.', sh_confirmSignOutDev: 'Sign out {name}?',
    sh_devSignedOut: 'Signed out of {n} device(s).', sh_devApp: 'LANChat app on {os}', sh_devBrowserOs: '{browser} on {os}', sh_devUnknown: 'Unknown device', sh_devSince: 'Signed in {when}', sh_devLast: 'Last active {when}', sh_devActiveNow: 'Active now', sh_noOtherDevices: "You aren't signed in anywhere else.",
    sh_secReadAloud: 'Read aloud', sh_voice: 'Voice', sh_voiceAuto: 'Automatic (matches the language)', sh_speed: 'Speed', sh_testVoice: 'Test', sh_testVoiceText: 'This is how LANChat reads messages to you.', sh_noSpeech: "This device can't read aloud.",
    sh_secSignLang: 'Sign language', sh_signHelp: 'Choose up to two people who sign for you. In meetings their video stays visible and large.', sh_signer: 'Signer {n}', sh_signerNone: 'Nobody',
    sh_secUpdates: 'Updates', sh_hostVersion: 'This session runs LANChat {v}.', sh_appVersion: 'Your desktop app is LANChat {v}.', sh_checkUpdate: 'Check for updates', sh_updateFolder: 'Update from a folder…', sh_upToDate: 'You have the latest LANChat ({v}).',
    sh_updHostNote: 'You host this session. To update, unzip a newer LANChat and choose Update from a folder — friends who joined get the update from you.', sh_updSource: 'This copy of LANChat runs from its source folder; update it there.', sh_updBrowser: 'In a browser you always get the version the host runs.',
    sh_licenses: 'Icons: Fluent UI System Icons (MIT License).',
  });
  LC.addStrings('hi', {
    sh_tabGeneral: 'सामान्य', sh_tabAppearance: 'दिखावट और सुलभता', sh_tabDevices: 'डिवाइस', sh_tabFiles: 'फ़ाइलें और लिंक', sh_density: 'चैट घनत्व', sh_comfy: 'आरामदायक', sh_compact: 'सघन', sh_clearCache: 'कैश साफ़ करें', sh_secDevices: 'साइन-इन डिवाइस',
    sh_thisDevice: 'यह डिवाइस', sh_signOutDev: 'साइन आउट', sh_signOutOthers: 'बाकी सभी डिवाइस से साइन आउट करें', sh_secReadAloud: 'पढ़कर सुनाएँ', sh_voice: 'आवाज़', sh_speed: 'गति', sh_secSignLang: 'सांकेतिक भाषा', sh_checkUpdate: 'अपडेट देखें',
  });
  LC.addStrings('es', {
    sh_tabGeneral: 'General', sh_tabAppearance: 'Apariencia y accesibilidad', sh_tabDevices: 'Dispositivos', sh_tabFiles: 'Archivos y vínculos', sh_density: 'Densidad del chat', sh_comfy: 'Cómoda', sh_compact: 'Compacta', sh_clearCache: 'Borrar caché', sh_secDevices: 'Dispositivos con sesión iniciada',
    sh_thisDevice: 'Este dispositivo', sh_signOutDev: 'Cerrar sesión', sh_signOutOthers: 'Cerrar sesión en los demás dispositivos', sh_secReadAloud: 'Leer en voz alta', sh_voice: 'Voz', sh_speed: 'Velocidad', sh_secSignLang: 'Lengua de signos', sh_checkUpdate: 'Buscar actualizaciones',
  });

  let rid = 0; const uid = (p) => p + (++rid);
  // radio buttons with a visible group label
  const radios = (label, opts, value, fn) => { const id = uid('shRg'), name = uid('shRn'); return el('div', { class: 'field' }, el('span', { class: 'flabel', id, text: label }), el('div', { class: 'sh-radios', role: 'radiogroup', 'aria-labelledby': id }, opts.map(([v, text, extra]) => el('label', { class: 'check' }, el('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => fn(v) }), el('span', { text }), extra || null)))); };
  const h3 = (key) => el('h3', { text: t(key) });
  const native = () => SH.native();

  // ---------- Appearance and accessibility ----------
  X.density = () => {
    const cur = LC.ui.compact ? 'compact' : 'comfy', id = uid('shDen'), name = uid('shDenN');
    const opt = (v, label, hint) => el('label', { class: 'sh-dens' + (cur === v ? ' on' : '') }, el('input', { type: 'radio', name, value: v, checked: cur === v, onchange: (e) => { LC.setUi({ compact: v === 'compact' }); for (const x of e.target.closest('.sh-densrow').children) x.classList.toggle('on', x.querySelector('input').checked); } }),
      el('span', { class: 'sh-densart ' + v, 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i')), el('b', { text: label }), el('small', { class: 'muted', text: hint }));
    return el('div', { class: 'field' }, el('span', { class: 'flabel', id, text: t('sh_density') }), el('div', { class: 'sh-densrow', role: 'radiogroup', 'aria-labelledby': id }, opt('comfy', t('sh_comfy'), t('sh_comfyHint')), opt('compact', t('sh_compact'), t('sh_compactHint'))));
  };
  X.zoom = () => {
    const sel = K().select(SH.zoomLevels.map((p) => [p, p + '%' + (p === 100 ? ' ' + t('sh_default') : '')]), SH.zoom(), (v) => SH.setZoom(Number(v), false), t('sh_zoom'));
    LC.on('sh:zoom', (e) => { if (sel.isConnected) sel.value = String(e.zoom); });
    return K().field(t('sh_zoom'), K().row(sel, el('button', { type: 'button', class: 'secondary sm', text: t('sh_zoomReset'), onclick: () => { SH.setZoom(100, false); sel.value = '100'; } })), t('sh_zoomHint'));
  };
  X.readAloud = () => {
    const box = el('div', { class: 'sh-ra' });
    const fill = () => {
      if (!window.speechSynthesis) return box.replaceChildren(el('p', { class: 'muted small', text: t('sh_noSpeech') }));
      const voices = SH.voices ? SH.voices() : [], out = el('output', { class: 'small muted', text: '×' + (LC.ui.shRate || 1) });
      const vs = K().select([['', t('sh_voiceAuto')], ...voices.map((v) => [v.voiceURI, `${v.name} (${v.lang})`])], LC.ui.shVoice || '', (v) => LC.setUi({ shVoice: v }), t('sh_voice'));
      const rate = el('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: LC.ui.shRate || 1, 'aria-label': t('sh_speed'), oninput: (e) => { LC.setUi({ shRate: Number(e.target.value) }); out.textContent = '×' + e.target.value; } });
      box.replaceChildren(K().row(K().field(t('sh_voice'), vs), K().field(t('sh_speed'), K().row(rate, out)), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => SH.readAloud && SH.readAloud(t('sh_testVoiceText')) }, LC.icon('read_aloud'), el('span', { text: t('sh_testVoice') }))));
    };
    fill(); if (window.speechSynthesis && !(SH.voices && SH.voices().length)) speechSynthesis.addEventListener('voiceschanged', () => { if (box.isConnected) fill(); }, { once: true });
    return [h3('sh_secReadAloud'), box];
  };
  X.signers = () => {
    const cur = [...(LC.prefs().signers || [])], people = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed && !u.deleted).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id)));
    const pick = (i) => K().select([['', t('sh_signerNone')], ...people.map((u) => [u.id, LC.uname(u.id)])], cur[i] || '', (v) => { const next = [...cur]; next[i] = v; const list = [...new Set(next.filter(Boolean))].slice(0, 2); cur.splice(0, cur.length, ...list); LC.setPrefs({ signers: list }); }, t('sh_signer', { n: i + 1 }));
    return [h3('sh_secSignLang'), el('p', { class: 'muted small', text: t('sh_signHelp') }), K().row(K().field(t('sh_signer', { n: 1 }), pick(0)), K().field(t('sh_signer', { n: 2 }), pick(1)))];
  };

  // ---------- General ----------
  SH.clearCache = async () => {
    const n = native(); if (n) { try { await n.clearCache(); } catch {} }
    else if (window.caches) { try { for (const k of await caches.keys()) await caches.delete(k); } catch {} }
    if (SH.offline && SH.offline.clear) { try { await SH.offline.clear(); } catch {} }
  };
  function storageSection() {
    const out = el('p', { class: 'small', role: 'status', text: t('sh_checking') });
    const measure = async () => {
      try {
        const n = native();
        if (n) { const c = await n.cacheInfo(); out.textContent = t('sh_cacheDesk', { cache: LC.fmtSize(c.cache || 0), storage: LC.fmtSize(c.storage || 0) }); }
        else if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.textContent = e.quota ? t('sh_storageQuota', { size: LC.fmtSize(e.usage || 0), quota: LC.fmtSize(e.quota) }) : t('sh_storageUsed', { size: LC.fmtSize(e.usage || 0) }); }
        else out.textContent = t('sh_storageNA');
      } catch { out.textContent = t('sh_storageNA'); }
    };
    const btn = el('button', { type: 'button', class: 'secondary withicon', onclick: async () => { btn.disabled = true; await SH.clearCache(); LC.toast(t('sh_cacheCleared'), { ms: 3000 }); await measure(); btn.disabled = false; } }, LC.icon('broom'), el('span', { text: t('sh_clearCache') }));
    measure();
    return [h3('sh_secStorage'), out, el('p', { class: 'muted small', text: t('sh_clearCacheHint') }), el('div', { class: 'acts start' }, btn)];
  }
  X.general = async () => {
    const info = await SH.refreshInfo(), box = el('div', {}), n = native(), K_ = K();
    if (info) {
      const pref = (k) => (v) => n.setPref(k, v).then(() => SH.refreshInfo()).catch(fail);
      box.append(h3('sh_secApp'), info.platform === 'win32' || info.platform === 'darwin' ? K_.toggle(t('sh_startup'), info.startWithWindows, pref('startWithWindows')) : '', K_.toggle(t('sh_closeTray'), info.closeToTray, pref('closeToTray')),
        info.platform !== 'darwin' ? K_.toggle(t('sh_spell'), info.spellcheck, pref('spellcheck'), t('sh_spellHint')) : '',
        h3('sh_secSessions'), el('p', { class: 'muted small', text: t('sh_sessionsHint') }), el('div', { class: 'acts start' }, el('button', { type: 'button', class: 'secondary withicon', onclick: () => n.manageSessions() }, LC.icon('people_team'), el('span', { text: t('sh_manageSessions') }))));
    }
    box.append(h3('sh_secHelp'), el('div', { class: 'acts start' }, LC.btn('book_question_mark', t('sh_helpTopics'), () => SH.helpTopics()), LC.btn('sparkle', t('sh_whatsNew'), () => SH.whatsNew()), LC.btn('lightbulb', t('sh_tour'), () => SH.tour())), ...storageSection());
    return box;
  };

  // ---------- Files and links ----------
  X.files = async () => {
    const info = await SH.refreshInfo(), n = native(), box = el('div', {}), K_ = K();
    box.append(h3('sh_secDownloads'));
    if (info) {
      const d = info.downloads, again = () => LC.settingsPanel('files');
      box.append(radios(t('sh_dlSave'), [['folder', t('sh_dlFolder', { dir: d.dir }), el('button', { type: 'button', class: 'link small sh-dlchange', text: t('sh_dlChange'), onclick: async () => { const p = await n.chooseDownloads(); if (p) again(); } })], ['ask', t('sh_dlAsk')]], d.mode, (v) => n.setPref('downloadMode', v).then(again)));
    } else box.append(el('p', { class: 'muted small', text: t('sh_dlBrowser') }));
    box.append(h3('sh_secLinks'));
    if (info) box.append(radios(t('sh_linksOpen'), [['browser', t('sh_linksBrowser')], ['app', t('sh_linksApp')]], info.links, (v) => n.setPref('links', v).then(() => SH.refreshInfo())), el('p', { class: 'muted small', text: t('sh_linksHint') }));
    else box.append(el('p', { class: 'muted small', text: t('sh_linksHintBrowser') }));
    if (info && info.sendTo !== null && info.sendTo !== undefined) box.append(h3('sh_secSendTo'), K_.toggle(t('sh_sendTo'), info.sendTo, (v) => n.setPref('sendTo', v).then((ok) => { if (!ok) LC.toast(t('sh_popFailed')); }), t('sh_sendToHint')));
    box.append(h3('sh_secPhotos'), K_.toggle(t('compressImages'), !!LC.ui.compress, (v) => LC.setUi({ compress: v })));
    return box;
  };

  // ---------- About: versions and updates ----------
  X.about = () => {
    const box = el('div', { class: 'sh-about' }, el('div', { class: 'acts start' }, LC.btn('sparkle', t('sh_whatsNew'), () => SH.whatsNew()), LC.btn('book_question_mark', t('sh_helpTopics'), () => SH.helpTopics()), LC.btn('lightbulb', t('sh_tour'), () => SH.tour())));
    const upd = el('div', {}); box.append(h3('sh_secUpdates'), upd, el('p', { class: 'muted small', text: t('sh_licenses') }));
    (async () => {
      const info = await SH.refreshInfo(), n = native(), lines = [S.appVersion ? el('p', { class: 'small', text: t('sh_hostVersion', { v: S.appVersion }) }) : null];
      if (!info) { upd.replaceChildren(...lines, el('p', { class: 'muted small', text: t('sh_updBrowser') })); return; }
      lines.push(el('p', { class: 'small', text: t('sh_appVersion', { v: info.version }) }));
      const acts = el('div', { class: 'acts start' });
      if (info.canUpdate) acts.append(LC.btn('arrow_sync', t('sh_checkUpdate'), () => SH.checkUpdate && SH.checkUpdate(true)));
      if (info.packaged) acts.append(LC.btn('folder_open', t('sh_updateFolder'), () => n.updateFromFolder()));
      upd.replaceChildren(...lines, !info.packaged ? el('p', { class: 'muted small', text: t('sh_updSource') }) : info.session && info.session.kind === 'host' ? el('p', { class: 'muted small', text: t('sh_updHostNote') }) : null, acts);
    })();
    return box;
  };

  // ---------- Privacy › signed-in devices ----------
  const devName = (d) => (d.browser === 'app' ? t('sh_devApp', { os: d.os || '—' }) : d.browser ? (d.os ? t('sh_devBrowserOs', { browser: d.browser, os: d.os }) : d.browser) : t('sh_devUnknown'));
  const devIcon = (d) => (d.os === 'Android' || d.os === 'iPhone' ? 'phone' : d.os === 'iPad' ? 'tablet' : d.browser === 'app' ? 'desktop' : 'laptop');
  async function devicesSection() {
    const box = el('div', { class: 'sh-devices' }, h3('sh_secDevices'), el('p', { class: 'muted small', text: t('sh_devicesHelp') }));
    let list; try { list = (await LC.api('/api/devices')).devices || []; } catch (e) { box.append(el('p', { class: 'err', text: e.message })); return box; }
    const out = async (body, n) => { try { const r = await LC.api('/api/devices/signout', body); LC.toast(t('sh_devSignedOut', { n: r.removed })); LC.settingsPanel('privacy'); } catch (e) { fail(e); } void n; };
    box.append(el('ul', { class: 'sh-devlist' }, list.map((d) => el('li', { class: 'sh-dev' + (d.current ? ' me' : '') }, el('span', { class: 'sh-devic', 'aria-hidden': 'true' }, LC.icon(devIcon(d))),
      el('div', { class: 'grow' }, el('div', {}, el('b', { text: devName(d) }), d.current ? el('span', { class: 'pill', text: t('sh_thisDevice') }) : null), el('div', { class: 'muted small', text: [d.created ? t('sh_devSince', { when: LC.fmtDateTime(d.created) }) : '', d.current ? t('sh_devActiveNow') : d.last ? t('sh_devLast', { when: LC.ago(d.last) }) : '', d.ip].filter(Boolean).join(' · ') })),
      d.current ? null : el('button', { type: 'button', class: 'secondary sm', text: t('sh_signOutDev'), 'aria-label': t('sh_signOutDevNamed', { name: devName(d) }), onclick: async () => { if (await LC.confirm(t('sh_confirmSignOutDev', { name: devName(d) }), { danger: true, ok: t('sh_signOutDev') })) out({ id: d.id }); } })))));
    const others = list.filter((d) => !d.current).length;
    box.append(others ? el('div', { class: 'acts start' }, el('button', { type: 'button', class: 'secondary danger withicon', onclick: async () => { if (await LC.confirm(t('sh_confirmSignOutOthers'), { danger: true, ok: t('sh_signOutDev') })) out({ others: true }); } }, LC.icon('sign_out'), el('span', { text: t('sh_signOutOthers') }))) : el('p', { class: 'muted small', text: t('sh_noOtherDevices') }));
    return box;
  }
  LC.ext.settingsSections.push({ tab: 'privacy', order: 60, render: devicesSection });

  // this device tells the server it is here (device name, last active); a device signed out elsewhere goes back to sign-in
  let helloAt = 0;
  const hello = () => { if (!S.me || SH.popMode || (SH.offline && SH.offline.active)) return; helloAt = Date.now(); LC.api('/api/devices/hello', { app: SH.info ? 'desktop ' + SH.info.version : '' }).catch(() => {}); };
  LC.on('init', (d) => { if (!d.shOffline) SH.refreshInfo().then(hello, hello); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - helloAt > 600000) hello(); });
  LC.on('shsignedout', () => LC.signOut('signedout'));
})();
