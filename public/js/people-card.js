'use strict';
// People area: the contact card (hover or click a person's picture or name anywhere), the People pane (directory with search
// and filters, contact groups, a person's profile page with the org chart). Uses helpers from people.js (LC.people).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), PP = LC.people;
  LC.addStrings('en', {
    pp_people: 'People', pp_cardOf: 'Contact card: {name}', pp_chat: 'Chat', pp_call: 'Call', pp_video: 'Video call', pp_moreActions: 'More actions', pp_chatWith: 'Chat with {name}',
    pp_contact: 'Contact information', pp_localTime: '{time} local time', pp_sameTime: 'same time as you', pp_ahead: '{d} ahead of you', pp_behind: '{d} behind you', pp_hoursShort: '{h} h', pp_hmShort: '{h} h {m} min',
    pp_org: 'Organization', pp_reportsToShort: 'Reports to', pp_directReports: 'Direct reports ({n})', pp_openOrg: 'Open org chart', pp_orgChart: 'Org chart', pp_filesShared: 'Files shared with you', pp_noFiles: 'No files shared between you yet.',
    pp_lastSeen: 'Last seen {when}', pp_viewProfile: 'View profile', pp_addToGroup: 'Add to contact group', pp_newGroup: 'New contact group', pp_groupName: 'Group name', pp_inGroups: 'In your contact groups',
    pp_favorite: 'Add to favorites', pp_unfavorite: 'Remove from favorites', pp_priorityAdd: 'Give priority access', pp_priorityRemove: 'Remove priority access', pp_editMyProfile: 'Edit profile',
    pp_searchPeople: 'Search by name, title, department or location', pp_filter: 'Show', pp_everyone: 'Everyone', pp_availableNow: 'Available now', pp_dept: 'Department: {d}', pp_groupF: 'Group: {g}',
    pp_groups: 'Contact groups', pp_allPeople: 'All people', pp_noMatch: 'Nobody matches your search.', pp_emptyGroup: 'Nobody in this group yet.', pp_renameGroup: 'Rename group', pp_deleteGroup: 'Delete group', pp_addPeople: 'Add people',
    pp_confirmDeleteGroup: 'Delete the contact group “{name}”? The people in it are not affected.', pp_removeFromGroup: 'Remove {name} from {group}', pp_groupMenu: 'Group options: {name}', pp_save: 'Save',
    pp_findPeople: 'Find people', pp_directoryHelp: 'Everyone in this session. Select a person to see their profile and where they sit in the organization.', pp_back: 'All people', pp_noManagerYet: 'No manager set.', pp_you: 'You',
  });
  LC.addStrings('hi', { pp_people: 'लोग', pp_chat: 'चैट', pp_call: 'कॉल', pp_video: 'वीडियो कॉल', pp_org: 'संगठन', pp_orgChart: 'संगठन चार्ट', pp_filesShared: 'आपके साथ साझा की गई फ़ाइलें', pp_viewProfile: 'प्रोफ़ाइल देखें', pp_groups: 'संपर्क समूह', pp_allPeople: 'सभी लोग', pp_newGroup: 'नया संपर्क समूह', pp_findPeople: 'लोग खोजें' });
  LC.addStrings('es', { pp_people: 'Personas', pp_chat: 'Chat', pp_call: 'Llamar', pp_video: 'Videollamada', pp_org: 'Organización', pp_orgChart: 'Organigrama', pp_filesShared: 'Archivos compartidos contigo', pp_viewProfile: 'Ver perfil', pp_groups: 'Grupos de contactos', pp_allPeople: 'Todas las personas', pp_newGroup: 'Nuevo grupo de contactos', pp_findPeople: 'Buscar personas' });
  const fail = (e) => LC.toast(e.message || String(e));
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  const live = (u) => !!u && !u.removed && !u.deleted;
  const dmWith = (id) => LC.dmId(S.me.id, id);

  // ---------- local time ----------
  const tzOffset = (tz, d = new Date()) => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d).map((x) => [x.type, x.value])); return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, p.hour % 24, +p.minute) - Math.floor(d.getTime() / 60000) * 60000) / 60000); } catch { return null; } };
  PP.localTime = (u) => {
    if (!u || !u.tz) return null;
    let time; try { time = new Date().toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit', timeZone: u.tz }); } catch { return null; }
    const mine = (S.me && S.me.tz) || PP.myTz(), a = tzOffset(u.tz), b = tzOffset(mine); let diff = '';
    if (a !== null && b !== null) { const m = Math.round((a - b) / 15) * 15, abs = Math.abs(m), h = Math.floor(abs / 60), mm = abs % 60, d = mm ? t('pp_hmShort', { h, m: mm }) : t('pp_hoursShort', { h }); diff = !m ? t('pp_sameTime') : m > 0 ? t('pp_ahead', { d }) : t('pp_behind', { d }); }
    return { time: t('pp_localTime', { time }), diff, tz: u.tz.replace(/_/g, ' ') };
  };

  // ---------- org ----------
  PP.managerOf = (u) => { const m = u && u.manager && S.users.get(u.manager); return live(m) ? m : null; };
  PP.reportsOf = (id) => [...S.users.values()].filter((x) => live(x) && x.manager === id).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id)));
  PP.chainOf = (u) => { const out = [], seen = new Set([u.id]); let m = PP.managerOf(u); while (m && !seen.has(m.id) && out.length < 20) { out.unshift(m); seen.add(m.id); m = PP.managerOf(m); } return out; };

  // ---------- contact groups (prefs.contactGroups = [{ id, name, members }]; the Calls pane uses them for speed dial) ----------
  PP.groups = () => (LC.prefs().contactGroups || []);
  const saveGroups = (list) => PP.savePrefs({ contactGroups: list });
  const newId = () => Math.random().toString(36).slice(2, 10) || 'g' + Date.now().toString(36);
  PP.newGroup = async (withId) => { const name = await LC.prompt(t('pp_newGroup'), { placeholder: t('pp_groupName'), max: 40 }); if (!name || !name.trim()) return; return saveGroups([...PP.groups(), { id: newId(), name: name.trim(), members: withId ? [withId] : [] }]); };
  PP.toggleInGroup = (gid, uid) => saveGroups(PP.groups().map((g) => (g.id !== gid ? g : { ...g, members: g.members.includes(uid) ? g.members.filter((x) => x !== uid) : [...g.members, uid] })));
  const renameGroup = async (g) => { const name = await LC.prompt(t('pp_renameGroup'), { value: g.name, max: 40 }); if (name && name.trim()) saveGroups(PP.groups().map((x) => (x.id === g.id ? { ...x, name: name.trim() } : x))); };
  const deleteGroup = async (g) => { if (await LC.confirm(t('pp_confirmDeleteGroup', { name: g.name }), { danger: true, ok: t('delete') })) saveGroups(PP.groups().filter((x) => x.id !== g.id)); };
  function addPeopleDialog(g) {
    const picks = new Set(g.members), q = el('input', { type: 'search', placeholder: t('pp_searchPeople'), 'aria-label': t('pp_searchPeople') }), list = el('div', { class: 'people pp-pick' });
    const draw = () => list.replaceChildren(...PP.others().filter((u) => matches(u, q.value)).map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: picks.has(u.id), onchange: (e) => (e.target.checked ? picks.add(u.id) : picks.delete(u.id)) }), LC.avatar(u, 'sm', true), el('span', { text: LC.uname(u.id) }))));
    q.addEventListener('input', draw); draw();
    LC.modal([el('h2', {}, LC.icon('people_community'), ' ' + t('pp_addPeople') + ' · ' + g.name), q, list, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('pp_save'), onclick: () => { LC.closeModal(); saveGroups(PP.groups().map((x) => (x.id === g.id ? { ...x, members: [...picks] } : x))); } }))], { label: t('pp_addPeople') });
  }
  PP.groupMenu = (anchor, uid) => LC.menu(anchor, [...PP.groups().map((g) => ({ label: g.name, checked: g.members.includes(uid), fn: () => PP.toggleInGroup(g.id, uid) })), 'sep', { icon: 'add', label: t('pp_newGroup'), fn: () => PP.newGroup(uid) }]);

  // ---------- the person's actions ----------
  const startCall = async (id, mode) => { const dm = dmWith(id); PP.closePop(); await LC.openChat(dm); if (LC.startCall) LC.startCall(dm, mode); };
  PP.personMenu = (anchor, uid) => {
    const u = S.users.get(uid); if (!u || !S.me) return; const me = uid === S.me.id, favs = LC.prefs().favorites || [];
    LC.menu(anchor, [
      !me ? { icon: 'people_community', label: t('pp_addToGroup'), fn: () => PP.groupMenu(anchor, uid) } : null,
      !me ? { icon: 'star', label: favs.includes(uid) ? t('pp_unfavorite') : t('pp_favorite'), fn: () => LC.toggleFavorite(uid) } : null,
      !me ? { icon: 'tag', label: t('setNickname'), fn: () => LC.nicknameDialog(uid) } : null,
      !me ? { icon: 'person_star', label: PP.hasPriority(uid) ? t('pp_priorityRemove') : t('pp_priorityAdd'), fn: () => PP.togglePriority(uid) } : null,
      !me ? { icon: 'person_prohibited', label: PP.isBlocked(uid) ? t('pp_unblock') : t('pp_block'), danger: !PP.isBlocked(uid), fn: () => (PP.isBlocked(uid) ? PP.unblock(uid) : PP.block(uid)) } : null,
      me ? { icon: 'person_edit', label: t('pp_editMyProfile'), fn: () => LC.settingsPanel('profile') } : null,
      !me && LC.isAdmin() ? 'sep' : null, !me && LC.isAdmin() ? { icon: 'shield_person', label: t('manageUser'), fn: () => LC.adminPanel('people', uid) } : null,
      ...LC.extItems(LC.ext.userMenu, uid),
    ]);
  };
  const actions = (u) => {
    if (u.id === S.me.id) return el('div', { class: 'pp-cacts' }, LC.btn('person_edit', t('pp_editMyProfile'), () => { PP.closePop(); LC.settingsPanel('profile'); }), LC.btn('edit', t('pp_statusMsg'), () => { PP.closePop(); PP.statusDialog(); }));
    const name = LC.uname(u.id);
    return el('div', { class: 'pp-cacts' }, el('button', { type: 'button', class: 'primary withicon', 'aria-label': t('pp_chatWith', { name }), onclick: () => { PP.closePop(); LC.openChat(dmWith(u.id)); } }, LC.icon('chat'), el('span', { text: t('pp_chat') })),
      LC.ibtn('call', t('voiceCallWith', { name }), () => startCall(u.id, 'voice'), { cls: 'icon pp-cbtn' }), LC.ibtn('video', t('videoCallWith', { name }), () => startCall(u.id, 'video'), { cls: 'icon pp-cbtn' }),
      LC.ibtn('more_horizontal', t('pp_moreActions'), (e) => PP.personMenu(e.currentTarget, u.id), { cls: 'icon pp-cbtn', menu: true }));
  };
  const personBtn = (u, sub, onclick) => el('button', { type: 'button', class: 'pp-person', onclick }, LC.avatar(u, 'sm', true), el('span', { class: 'itext' }, el('span', { class: 'name', text: LC.uname(u.id) }), sub ? el('span', { class: 'prev', text: sub }) : null));
  const roleLine = (u) => [u.jobTitle, u.department].filter(Boolean).join(' · ');

  // ---------- pieces shared by the card and the profile page ----------
  function identity(u, big) {
    const name = LC.uname(u.id);
    return el('div', { class: 'pp-chead' }, LC.avatar(u, big ? 'xl' : 'lg', true), el('div', { class: 'pp-cid' },
      el('div', { class: 'pp-cname' + (big ? ' big' : '') }, el('h2', { text: name }), u.voice ? LC.ibtn('speaker_2', t('pp_playName'), () => PP.playName(u), { cls: 'icon pp-play' }) : null),
      name !== u.name ? el('div', { class: 'muted small', text: u.name }) : null, u.pronouns ? el('div', { class: 'muted small pp-pron', text: u.pronouns }) : null,
      roleLine(u) ? el('div', { class: 'small', text: roleLine(u) }) : null,
      el('div', { class: 'pp-cstat small' }, LC.icon(LC.PRES_ICON[u.presence] || 'presence_offline', { cls: 'p-' + u.presence }), el('span', { text: LC.presenceLabel(u.presence) + (u.presence === 'offline' && u.lastSeen ? ' · ' + t('pp_lastSeen', { when: LC.ago(u.lastSeen) }) : '') })),
      u.statusText ? el('div', { class: 'pp-cmsg small' }, u.statusEmoji ? el('span', { text: u.statusEmoji + ' ' }) : null, el('span', { text: u.statusText })) : null));
  }
  const oofNote = (u) => (u.oof ? el('div', { class: 'pp-coof small' }, LC.icon('presence_oof', { cls: 'p-oof' }), el('div', {}, el('b', { text: u.oof.to ? t('pp_oofUntil', { when: PP.when(u.oof.to) }) : t('pp_oofIsOn') }), u.oof.message ? el('div', { class: 'pp-pre', text: u.oof.message }) : null)) : null);
  function details(u) {
    const rows = [], wl = u.workLoc, lt = PP.localTime(u);
    const line = (icon, label, value) => rows.push(el('div', { class: 'pp-dl' }, LC.icon(icon), el('div', {}, el('div', { class: 'muted small', text: label }), value)));
    if (u.email) line('mail', t('pp_email'), el('a', { href: 'mailto:' + u.email, text: u.email }));
    if (u.phone) line('phone', t('pp_phone'), el('a', { href: 'tel:' + u.phone.replace(/[^0-9+]/g, ''), text: u.phone }));
    if (u.office) line('building', t('pp_office'), el('span', { text: u.office }));
    if (wl) line(wl.kind === 'office' ? 'building' : 'home', t('pp_workLoc'), el('span', { text: wl.kind === 'custom' ? wl.text : t(wl.kind === 'office' ? 'pp_wlOffice' : 'pp_wlRemote') }));
    if (lt) line('globe_clock', lt.tz, el('span', { text: lt.time + (u.id !== S.me.id && lt.diff ? ' · ' + lt.diff : '') }));
    return rows.length ? el('section', { class: 'pp-csec' }, el('h3', { text: t('pp_contact') }), ...rows) : null;
  }
  function orgBlock(u, onPick) {
    const mgr = PP.managerOf(u), reps = PP.reportsOf(u.id); if (!mgr && !reps.length) return null;
    return el('section', { class: 'pp-csec' }, el('h3', { text: t('pp_org') }),
      mgr ? el('div', { class: 'muted small', text: t('pp_reportsToShort') }) : null, mgr ? personBtn(mgr, roleLine(mgr), () => onPick(mgr.id)) : null,
      reps.length ? el('div', { class: 'muted small', text: t('pp_directReports', { n: reps.length }) }) : null, ...reps.slice(0, 6).map((r) => personBtn(r, roleLine(r), () => onPick(r.id))),
      el('button', { type: 'button', class: 'link pp-linkbtn', text: t('pp_openOrg'), onclick: () => { PP.closePop(); PP.showPerson(u.id); } }));
  }
  function filesBlock(u) {
    if (u.id === S.me.id) return null;
    const box = el('div', { class: 'pp-files' }, el('p', { class: 'muted small', text: t('loading') })), chan = dmWith(u.id);
    LC.api('/api/files?chan=' + encodeURIComponent(chan)).then(({ files }) => {
      box.replaceChildren(...(files.length ? files.slice(0, 5).map((f) => el('a', { class: 'pp-file', href: LC.fileUrl(f), download: f.name }, LC.icon(LC.isImage(f.name) ? 'image' : /\.pdf$/i.test(f.name) ? 'document_pdf' : 'document'), el('span', { class: 'itext' }, el('span', { class: 'name', text: f.name }), el('span', { class: 'prev', text: `${LC.uname(f.from)} · ${LC.shortTime ? LC.shortTime(f.ts) : LC.fmtDateTime(f.ts)}` })))) : [el('p', { class: 'muted small', text: t('pp_noFiles') })]));
    }).catch(() => box.replaceChildren(el('p', { class: 'muted small', text: t('pp_noFiles') })));
    return el('section', { class: 'pp-csec' }, el('h3', { text: t('pp_filesShared') }), box);
  }

  // ---------- the contact card ----------
  LC.contactCard = (anchor, uid, o = {}) => {
    const u = S.users.get(uid); if (!u || !S.me) return null;
    const open = PP.popOpen();
    if (open && open.o.uid === uid && !o.hover) { if (open.o.hover) { open.o.hover = false; const f = open.box.querySelector('button'); if (f) f.focus(); return open.box; } if (open.anchor === anchor) { PP.closePop(true); return null; } }
    const body = [identity(u, false), oofNote(u), actions(u), details(u), orgBlock(u, (id) => LC.contactCard(anchor, id)), filesBlock(u)];
    return PP.pop(anchor, body.filter(Boolean), { cls: 'pp-card', label: t('pp_cardOf', { name: LC.uname(uid) }), uid, hover: !!o.hover, focus: !o.hover, side: !!o.side });
  };
  PP.card = LC.contactCard;
  LC.userMenu = (anchor, uid) => LC.contactCard(anchor, uid); // a person's name or picture in a message opens their card

  // hover: pictures (data-uid) and author names, after a short pause; the card stays while the mouse is on it
  let hoverT = 0, leaveT = 0;
  const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  const msgAuthor = (node) => { const id = node.closest('.msg') && node.closest('.msg').dataset.id, w = S.win[S.chan], m = id && w && w.msgs.find((x) => x.id === id); if (m) return m.from; const n = node.textContent; const u = [...S.users.values()].find((x) => LC.uname(x.id) === n); return u ? u.id : null; };
  function hoverTarget(n) {
    if (!n || !n.closest || n.closest('.pp-pop, #meBox, .ringbox, #menu, .pp-nohover, .tile, .stage')) return null; // not the big pictures on a meeting's stage
    const av = n.closest('.av[data-uid]'); if (av) return { node: av.closest('button') && av.closest('.msg') ? av.closest('button') : av, uid: av.dataset.uid };
    const who = n.closest('.msg .who'); if (who) { const uid = msgAuthor(who); return uid ? { node: who, uid } : null; }
    return null;
  }
  document.addEventListener('mouseover', (e) => {
    if (!S.me || !canHover()) return;
    const open = PP.popOpen();
    if (open && open.o.hover && (open.box.contains(e.target) || (open.anchor && open.anchor.contains(e.target)))) { clearTimeout(leaveT); return; }
    const tg = hoverTarget(e.target); clearTimeout(hoverT); if (!tg || !S.users.has(tg.uid)) return;
    hoverT = setTimeout(() => {
      if (!document.contains(tg.node) || !tg.node.matches(':hover')) return; const cur = PP.popOpen();
      if (cur && (!cur.o.hover || cur.o.uid === tg.uid)) return; // a card opened by click stays until you close it
      LC.contactCard(tg.node, tg.uid, { hover: true, side: !!tg.node.closest('#nav, .cside, .pp-plist') });
    }, 550);
  });
  document.addEventListener('mouseout', (e) => {
    clearTimeout(hoverT); const open = PP.popOpen(); if (!open || !open.o.hover) return;
    const to = e.relatedTarget; if (to && (open.box.contains(to) || (open.anchor && open.anchor.contains(to)))) return;
    clearTimeout(leaveT); leaveT = setTimeout(() => { const cur = PP.popOpen(); if (cur && cur.o.hover && !cur.box.matches(':hover') && !(cur.anchor && cur.anchor.matches && cur.anchor.matches(':hover'))) PP.closePop(); }, 350);
  });
  // the picture in a 1:1 chat's header opens the card too (keyboard: header "More options" › View profile)
  document.addEventListener('click', (e) => { const h = e.target.closest('#headAvatar'); if (h && S.chan && S.chan.startsWith('dm:') && !S.app) LC.contactCard(h, LC.peerOf(S.chan)); });
  LC.ext.headerMenu.push((chan) => (chan && chan.startsWith('dm:') && LC.peerOf(chan) !== S.me.id ? [{ icon: 'contact_card', label: t('pp_viewProfile'), fn: () => LC.contactCard($('#headAvatar'), LC.peerOf(chan)) }] : []));
  LC.ext.chatMenu.push((e) => (e.kind === 'dm' ? [{ icon: 'contact_card', label: t('pp_viewProfile'), fn: () => LC.contactCard(document.querySelector(`.item[data-chan="${CSS.escape(e.id)}"] .av`) || $('#nav'), e.u.id, { side: true }) }] : []));
  LC.on('user', (u) => { const open = PP.popOpen(); if (open && open.o.uid === u.id && open.box.classList.contains('pp-card') && !open.box.contains(document.activeElement)) { const was = open.o; LC.contactCard(open.anchor, u.id, { hover: was.hover, side: was.side }); } });

  // ---------- People pane: directory, contact groups, profile page with org chart ----------
  const st = { query: '', filter: 'all', selected: null };
  let host = null, navList = null, dirList = null, navTyped = 0, navFocus = '';
  const text = (u) => [LC.uname(u.id), u.name, u.jobTitle, u.department, u.office, u.workLoc && u.workLoc.text, u.email, u.pronouns].filter(Boolean).join(' ').toLowerCase();
  const matches = (u, q) => !q || q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text(u).includes(w));
  const passes = (u) => {
    if (!matches(u, st.query)) return false;
    if (st.filter === 'available') return u.presence === 'online';
    if (st.filter.startsWith('d:')) return (u.department || '') === st.filter.slice(2);
    if (st.filter.startsWith('g:')) { const g = PP.groups().find((x) => x.id === st.filter.slice(2)); return !!g && g.members.includes(u.id); }
    return true;
  };
  const sortPeople = (list) => list.sort((a, b) => ((b.presence !== 'offline') - (a.presence !== 'offline')) || LC.uname(a.id).localeCompare(LC.uname(b.id)));
  const everyone = () => [...S.users.values()].filter(live);
  const setQuery = (v, from) => { st.query = v; for (const i of document.querySelectorAll('.pp-search input')) if (i !== from) i.value = v; fillNav(); fillDir(); };
  const setFilter = (v) => { st.filter = v; for (const s of document.querySelectorAll('select.pp-fsel')) s.value = v; fillNav(); fillDir(); };
  function filterSelect(where) {
    const depts = [...new Set(everyone().map((u) => u.department).filter(Boolean))].sort(), groups = PP.groups();
    const s = el('select', { 'aria-label': t('pp_filter'), class: 'pp-fsel', onchange: (e) => setFilter(e.target.value), onfocus: () => { if (where === 'nav') navFocus = 'filter'; }, onblur: () => { if (where === 'nav') navFocus = ''; } },
      el('option', { value: 'all', text: t('pp_everyone') }), el('option', { value: 'available', text: t('pp_availableNow') }),
      depts.length ? el('optgroup', { label: t('pp_department') }, depts.map((d) => el('option', { value: 'd:' + d, text: t('pp_dept', { d }) }))) : null,
      groups.length ? el('optgroup', { label: t('pp_groups') }, groups.map((g) => el('option', { value: 'g:' + g.id, text: t('pp_groupF', { g: g.name }) }))) : null);
    s.value = st.filter; if (s.value !== st.filter) { st.filter = 'all'; s.value = 'all'; } return s;
  }
  const searchBox = (where) => el('div', { class: 'pp-search' + (where === 'main' ? ' wide' : '') }, LC.icon('search'), el('input', { type: 'search', value: st.query, placeholder: t('pp_searchPeople'), 'aria-label': t('pp_searchPeople'),
    oninput: (e) => { if (where === 'nav') navTyped = Date.now(); setQuery(e.target.value, e.target); }, onfocus: () => { if (where === 'nav') navFocus = 'search'; }, onblur: () => { if (where === 'nav') navFocus = ''; } }));
  const subOf = (u) => [LC.presenceLabel(u.presence), roleLine(u)].filter(Boolean).join(' · ');
  function navRow(u, group) {
    const name = LC.uname(u.id), on = st.selected === u.id && S.app === 'people';
    return el('div', { class: 'pp-prow' + (on ? ' on' : '') }, el('button', { type: 'button', class: 'pp-pmain', 'aria-current': on ? 'true' : null, onclick: () => PP.showPerson(u.id) }, LC.avatar(u, '', true), el('span', { class: 'itext' }, el('span', { class: 'name', text: name }), el('span', { class: 'prev', text: subOf(u) }))),
      LC.ibtn('chat', t('pp_chatWith', { name }), () => LC.openChat(dmWith(u.id)), { cls: 'icon pp-rowbtn' }),
      group ? LC.ibtn('dismiss', t('pp_removeFromGroup', { name, group: group.name }), () => PP.toggleInGroup(group.id, u.id), { cls: 'icon pp-rowbtn' }) : LC.ibtn('more_horizontal', t('pp_moreActions'), (e) => PP.personMenu(e.currentTarget, u.id), { cls: 'icon pp-rowbtn', menu: true }));
  }
  const shut = () => LC.ls.get('lc_pp_shut', {});
  function fillNav() {
    if (!navList || !document.contains(navList)) return;
    const groups = PP.groups(), closed = shut(), people = sortPeople(everyone().filter((u) => u.id !== S.me.id && passes(u))), out = [];
    const sec = (key, label, extra) => { const isShut = !!closed[key]; return el('div', { class: 'sec' }, el('button', { class: 'sectoggle', 'aria-expanded': String(!isShut), onclick: () => { const c = shut(); c[key] = !isShut; LC.ls.set('lc_pp_shut', c); fillNav(); } }, LC.icon(isShut ? 'chevron_right' : 'chevron_down'), el('span', { text: label })), extra || null); };
    for (const g of groups) {
      const mem = sortPeople(g.members.map((id) => S.users.get(id)).filter((u) => live(u) && matches(u, st.query)));
      out.push(sec('g:' + g.id, `${g.name} (${g.members.length})`, LC.ibtn('more_horizontal', t('pp_groupMenu', { name: g.name }), (e) => LC.menu(e.currentTarget, [{ icon: 'person_add', label: t('pp_addPeople'), fn: () => addPeopleDialog(g) }, { icon: 'edit', label: t('pp_renameGroup'), fn: () => renameGroup(g) }, { icon: 'delete', label: t('pp_deleteGroup'), danger: true, fn: () => deleteGroup(g) }]), { cls: 'icon plus', menu: true })));
      if (!closed['g:' + g.id]) out.push(...(mem.length ? mem.map((u) => navRow(u, g)) : [el('div', { class: 'empty small', text: t('pp_emptyGroup') })]));
    }
    out.push(sec('all', t('pp_allPeople') + ` (${people.length})`));
    if (!closed.all) out.push(...(people.length ? people.map((u) => navRow(u)) : [el('div', { class: 'empty small', text: everyone().length > 1 ? t('pp_noMatch') : t('nobodyYet') })]));
    navList.replaceChildren(...out);
  }
  function renderNav(nav) {
    const typing = navFocus === 'search' || Date.now() - navTyped < 1500, picking = navFocus === 'filter';
    navList = el('div', { class: 'pp-navlist' }); const sb = searchBox('nav'), fs = filterSelect('nav');
    nav.replaceChildren(el('div', { class: 'pp-navtop' }, sb, el('div', { class: 'pp-frow' }, fs)), navList); fillNav();
    if (typing) { const i = sb.querySelector('input'), n = i.value.length; i.focus(); i.setSelectionRange(n, n); } else if (picking) fs.focus();
  }
  const tile = (u) => el('button', { type: 'button', class: 'pp-tile', onclick: () => PP.showPerson(u.id) }, LC.avatar(u, 'lg', true), el('span', { class: 'pp-tname', text: LC.uname(u.id) + (u.id === S.me.id ? ` (${t('pp_you')})` : '') }), el('span', { class: 'muted small pp-trole', text: roleLine(u) || ' ' }), el('span', { class: 'small pp-tstat', text: LC.presenceLabel(u.presence) }));
  function fillDir() {
    if (!dirList || !document.contains(dirList)) return; const list = sortPeople(everyone().filter(passes));
    dirList.replaceChildren(...(list.length ? [el('div', { class: 'pp-tiles' }, list.map(tile))] : [el('div', { class: 'empty' }, LC.icon('people_search', { cls: 'big' }), el('p', { text: t('pp_noMatch') }))]));
  }
  function directory() {
    dirList = el('div', { class: 'pp-dirlist' });
    const page = el('div', { class: 'pp-dir' }, el('div', { class: 'pp-dirhead' }, el('h2', { text: t('pp_findPeople') }), el('p', { class: 'muted small', text: t('pp_directoryHelp') })), el('div', { class: 'pp-dirbar' }, searchBox('main'), filterSelect('main')), dirList);
    return page;
  }
  function orgChart(u) {
    const chain = PP.chainOf(u), reps = PP.reportsOf(u.id), node = (x, cur) => el('li', {}, el('button', { type: 'button', class: 'pp-onode' + (cur ? ' cur' : ''), 'aria-current': cur ? 'true' : null, onclick: () => PP.showPerson(x.id) }, LC.avatar(x, 'sm', true), el('span', { class: 'itext' }, el('span', { class: 'name', text: LC.uname(x.id) }), el('span', { class: 'prev', text: roleLine(x) || LC.presenceLabel(x.presence) }))));
    return el('section', { class: 'pp-psec pp-orgsec' }, el('h3', {}, LC.icon('organization'), ' ' + t('pp_orgChart')),
      el('ol', { class: 'pp-org', 'aria-label': t('pp_orgChart') }, ...chain.map((x) => node(x)), node(u, true)),
      reps.length ? el('div', { class: 'pp-orgrep' }, el('div', { class: 'muted small', text: t('pp_directReports', { n: reps.length }) }), el('ul', { class: 'pp-orgkids' }, reps.map((x) => node(x)))) : null,
      !chain.length && !reps.length ? el('p', { class: 'muted small', text: t('pp_noManagerYet') }) : null);
  }
  function profilePage(u) {
    const groups = PP.groups().filter((g) => g.members.includes(u.id));
    return el('div', { class: 'pp-page' }, el('button', { type: 'button', class: 'secondary sm withicon pp-backbtn', onclick: () => PP.showPerson(null) }, LC.icon('arrow_left'), el('span', { text: t('pp_back') })),
      el('div', { class: 'pp-phero' }, identity(u, true), actions(u)), oofNote(u),
      el('div', { class: 'pp-pcols' }, el('div', {}, details(u) || el('section', { class: 'pp-csec' }, el('h3', { text: t('pp_contact') }), el('p', { class: 'muted small', text: '—' })),
        groups.length ? el('section', { class: 'pp-csec' }, el('h3', { text: t('pp_inGroups') }), el('div', { class: 'pp-chips' }, groups.map((g) => el('span', { class: 'pill', text: g.name })))) : null, filesBlock(u)), orgChart(u)));
  }
  function drawMain(force) {
    if (!host || S.app !== 'people' || !document.contains(host)) return; const u = st.selected && S.users.get(st.selected);
    if (u && live(u)) { if (force || !host.contains(document.activeElement) || !host.querySelector('.pp-page')) host.replaceChildren(profilePage(u)); return; }
    if (!host.querySelector('.pp-dir')) host.replaceChildren(directory()); fillDir();
  }
  PP.showPerson = (id) => {
    st.selected = id; if (S.pane !== 'people' || S.app !== 'people') return LC.setPane('people');
    drawMain(true); fillNav(); if (host) host.scrollTop = 0; const f = host && host.querySelector(id ? '.pp-page h2' : '.pp-search input'); if (f && id) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
  };
  LC.ext.panes.people = { icon: 'people', label: () => t('pp_people'), order: 45, render: renderNav, main: (h) => { host = h; h.classList.add('pp-host'); h.replaceChildren(); drawMain(true); }, actions: () => [LC.ibtn('people_community', t('pp_newGroup'), () => PP.newGroup())], subtitle: () => t('pp_directoryHelp') };
  // leaving the People pane for a list pane (Activity, Chat…) brings the conversation back into the big area
  const setPane0 = LC.setPane;
  LC.setPane = (pane) => { const was = S.app; const r = setPane0(pane); if (was === 'people' && !S.app && S.chan && LC.ext.panes[pane] && !LC.ext.panes[pane].action) LC.openChat(S.chan); return r; };
  const live2 = () => { if (S.app === 'people') drawMain(); if (S.pane === 'people') fillNav(); };
  LC.on('user', live2); LC.on('me', () => { if (S.pane === 'people') LC.renderNav(); live2(); });
})();
