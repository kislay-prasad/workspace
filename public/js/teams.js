'use strict';
// Teams & channels (section 13): the Teams pane in the app bar (your teams with their channels, unread state, ⋯ menus),
// "Join or create a team", Manage team (members, requests, channels, settings, analytics, tags), channel settings
// (description, picture, posts or chat, moderation, sensitivity label, members), deep links (#c= / #team=), hidden
// channels, tags and @team/@channel suggestions, posting in several channels at once, channel analytics.
// Owned by the "teams" feature area — see docs/EXTENDING.md and docs/features-teams.md.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addEvents('team', 'team_removed', 'tm_prefs', 'tm_tags', 'tm_config');
  const TM = (LC.tm = { teams: new Map(), prefs: { hidden: [], hiddenTeams: [] }, tags: [], cfg: {}, canCreate: true, view: null });

  // ---------- strings ----------
  LC.addStrings('en', {
    role_guest: 'Guest', tm_teams: 'Teams', tm_joinCreate: 'Join or create a team', tm_createTeam: 'Create a team', tm_createTeamBtn: 'Create team', tm_joinCode: 'Join a team with a code', tm_codePh: 'Enter code', tm_join: 'Join', tm_joinTeam: 'Join team',
    tm_requestJoin: 'Request to join', tm_requested: 'Requested', tm_cancelRequest: 'Cancel request', tm_searchTeams: 'Search teams', tm_noTeamsFound: 'No teams to show. Create one, or ask an owner for a team code.', tm_members: 'Members', tm_membersN: '{n} members', tm_member1: '1 member',
    tm_public: 'Public', tm_private: 'Private', tm_shared: 'Shared', tm_publicHint: 'Anyone in this session can find and join', tm_privateHint: 'People need permission to join', tm_noTeams: "You aren't in any teams yet.", tm_teamOptions: 'More options for {name}',
    tm_chanOptions: 'More options for {name}', tm_manageTeam: 'Manage team', tm_addChannel: 'Add channel', tm_addMember: 'Add member', tm_hide: 'Hide', tm_show: 'Show', tm_editTeam: 'Edit team', tm_getLinkTeam: 'Get link to team', tm_getLinkChan: 'Get link to channel',
    tm_manageTags: 'Manage tags', tm_renew: 'Renew team', tm_leave: 'Leave the team', tm_archive: 'Archive team', tm_restore: 'Restore team', tm_deleteTeam: 'Delete the team', tm_hiddenTeams: 'Hidden teams', tm_archivedTeams: 'Archived teams',
    tm_hiddenChans: '{n} hidden channels', tm_hideHidden: 'Hide hidden channels', tm_muteChannel: 'Mute channel', tm_manageChannel: 'Manage channel', tm_connectors: 'Connectors and webhooks', tm_analytics: 'Channel analytics', tm_deleteChannel: 'Delete this channel', tm_leaveChannel: 'Leave channel',
    tm_linkCopied: 'Link copied', tm_confirmLeave: 'Leave {name}? You will lose access to its channels.', tm_confirmDelete: 'Delete the team {name} and all of its channels, messages and files? This cannot be undone.', tm_confirmDeleteChan: 'Delete the channel {name} and its messages?',
    tm_confirmArchive: 'Archive {name}? It becomes read-only and moves to Archived teams. Owners can restore it.', tm_archived: 'Archived', tm_archivedNotice: 'This team is archived — channels are read-only.', tm_expiresSoon: 'This team will expire soon because nobody has used it. An owner can renew it.',
    tm_startScratch: 'From scratch', tm_startScratchHint: 'Start with a General channel and add your own', tm_tpl_project: 'Project', tm_tpl_event: 'Event', tm_tpl_class: 'Class', tm_tpl_friends: 'Friends',
    tm_tplHint_project: 'Planning, design, development and announcements', tm_tplHint_event: 'Logistics, budget, volunteers and announcements', tm_tplHint_class: 'Homework, class notes, questions and announcements', tm_tplHint_friends: 'Plans, photos, games and random chat',
    tm_pickTemplate: 'How do you want to start?', tm_quickDetails: 'Some quick details about your team', tm_teamName: 'Team name', tm_description: 'Description', tm_privacy: 'Privacy', tm_label: 'Sensitivity', tm_noLabel: 'No label', tm_picture: 'Picture', tm_uploadPicture: 'Upload picture', tm_removePicture: 'Remove',
    tm_back: 'Back', tm_next: 'Next', tm_create: 'Create', tm_addMembersTo: 'Add members to {name}', tm_addMembersHint: 'Start typing a name. Guests can only see this team and its channels.', tm_skip: 'Skip', tm_add: 'Add', tm_searchPeople: 'Search people',
    tm_channelName: 'Channel name', tm_chanType: 'Privacy', tm_typeStandard: 'Standard — everyone in the team', tm_typePrivate: 'Private — only the people you choose from the team', tm_typeShared: 'Shared — people you choose, also from outside the team',
    tm_layout: 'Layout', tm_layoutPosts: 'Posts — each conversation starts with a post and replies stay under it', tm_layoutChat: 'Chat — messages in one flowing conversation', tm_addChannelTo: 'Add a channel to {name}', tm_pickPeople: 'Members of this channel',
    tm_tabMembers: 'Members', tm_tabRequests: 'Pending requests', tm_tabChannels: 'Channels', tm_tabSettings: 'Settings', tm_tabAnalytics: 'Analytics', tm_tabTags: 'Tags', tm_owner: 'Owner', tm_member: 'Member', tm_guest: 'Guest', tm_ownersN: 'Owners ({n})', tm_membersGuestsN: 'Members and guests ({n})',
    tm_remove: 'Remove', tm_roleFor: 'Role for {name}', tm_noRequests: 'No pending requests.', tm_approve: 'Accept', tm_deny: 'Decline', tm_showForMe: 'Show for me', tm_general: 'General', tm_privateChan: 'Private channel', tm_sharedChan: 'Shared channel', tm_postsChan: 'Posts',
    tm_teamCode: 'Team code', tm_teamCodeHint: 'Share this code so people can join the team directly.', tm_generate: 'Generate', tm_copy: 'Copy', tm_removeCode: 'Turn off', tm_noCode: 'No code — people join by request or invitation.',
    tm_memberPerms: 'Member permissions', tm_guestPerms: 'Guest permissions', tm_mentions: '@mentions', tm_fun: 'Fun stuff', tm_discover: 'Discovery',
    tm_s_memberCreateChannels: 'Let members create and update channels', tm_s_memberCreatePrivate: 'Let members create private channels', tm_s_memberDeleteChannels: 'Let members delete channels', tm_s_memberAddApps: 'Let members add apps, tabs and connectors',
    tm_s_memberAddMembers: 'Let members add people to this public team', tm_s_memberManageTags: 'Let members manage tags', tm_s_mentionTeam: 'Show members the option to @team', tm_s_mentionChannel: 'Give members the option to @channel', tm_s_stickers: 'Allow stickers and memes',
    tm_s_guestCreateChannels: 'Let guests create and update channels', tm_s_guestDeleteChannels: 'Let guests delete channels', tm_s_discoverable: 'Show this private team in "Join or create a team"', tm_saved: 'Saved',
    tm_range7: 'Last 7 days', tm_range30: 'Last 30 days', tm_range90: 'Last 90 days', tm_msgsPerDay: 'Messages per day', tm_stMessages: 'Messages', tm_stPosts: 'Posts', tm_stReplies: 'Replies', tm_stReactions: 'Reactions', tm_stFiles: 'Files', tm_stActive: 'Active people', tm_topPosters: 'Top posters', tm_nothingYet: 'No activity in this period yet.',
    tm_tagsHint: 'Tags notify a group of people at once: type @ and the tag name in a message.', tm_tagName: 'Tag name', tm_newTag: 'Create tag', tm_noTags: 'No tags yet.', tm_tagMembers: 'People in @{name}', tm_deleteTag: 'Delete tag', tm_editTag: 'Edit people', tm_sessionTags: 'Session-wide tags',
    tm_mentionTeam: 'Notify everyone in this team', tm_mentionChannel: 'Notify everyone in this channel', tm_tagHint: 'Tag · {n} people',
    tm_alsoPost: 'Post in multiple channels', tm_alsoPostIn: 'Also posting in: {list}', tm_pickChannels: 'Select channels', tm_pickChannelsHint: 'Your message is posted in each channel you pick (where you may post).', tm_clear: 'Clear', tm_done: 'Done', tm_postedIn: 'Posted in {n} channels', tm_alsoIn: 'Also in',
    tm_moderation: 'Moderation', tm_whoPosts: 'Who can start new posts', tm_postEveryone: 'Everyone', tm_postModerators: 'Only moderators (owners and the people below)', tm_allowReplies: 'Members can reply to posts', tm_moderators: 'Moderators', tm_details: 'Details',
    tm_onlyModsNotice: 'Only moderators can start new posts here. You can still reply to posts.', tm_noRepliesNotice: 'Replies are turned off in this channel.', tm_channelOwners: 'Channel owner', tm_makeOwner: 'Make channel owner', tm_leaveTeamChan: 'You left the channel.',
    tm_teamDeleted: 'That team was deleted.', tm_teamGone: 'You are no longer in {name}.', tm_noAccess: "That link isn't available to you — you may need to join the team first.", tm_joined: 'You joined {name}', tm_requestSent: 'Request sent. A team owner will let you in.',
    tm_cantCreate: 'Only admins can create teams in this session.', tm_guestNoCreate: "Guests can't create teams or channels.", tm_from: 'by {name}', tm_owners: 'Owners', tm_note: 'Message to the owners (optional)', tm_whyJoin: 'Why do you want to join? (optional)',
    tm_noChannelsYet: 'No other channels yet.', tm_openTeam: 'Open', tm_teamHome: 'Team', tm_expiry: 'Expires unless renewed', tm_sharedWithYou: 'Shared with you', tm_addPeople: 'Add people', tm_peopleSel: '{n} selected', tm_nobody: 'Nobody to add.',
    tm_aboutTeam: 'About this team', tm_created: 'Created {when}', tm_channelPic: 'Channel picture', tm_labelBadge: 'Sensitivity: {name}', tm_err: 'Something went wrong',
  });
  LC.addStrings('hi', { tm_teams: 'टीमें', tm_joinCreate: 'टीम से जुड़ें या बनाएँ', tm_createTeam: 'टीम बनाएँ', tm_join: 'जुड़ें', tm_manageTeam: 'टीम प्रबंधित करें', tm_addChannel: 'चैनल जोड़ें', tm_hide: 'छिपाएँ', tm_show: 'दिखाएँ', tm_leave: 'टीम छोड़ें', tm_members: 'सदस्य', tm_public: 'सार्वजनिक', tm_private: 'निजी', tm_general: 'सामान्य', tm_getLinkChan: 'चैनल का लिंक पाएँ', tm_noTeams: 'आप अभी किसी टीम में नहीं हैं।', role_guest: 'अतिथि' });
  LC.addStrings('es', { tm_teams: 'Equipos', tm_joinCreate: 'Unirse a un equipo o crear uno', tm_createTeam: 'Crear un equipo', tm_join: 'Unirse', tm_manageTeam: 'Administrar equipo', tm_addChannel: 'Agregar canal', tm_hide: 'Ocultar', tm_show: 'Mostrar', tm_leave: 'Salir del equipo', tm_members: 'Miembros', tm_public: 'Público', tm_private: 'Privado', tm_general: 'General', tm_getLinkChan: 'Obtener vínculo al canal', tm_noTeams: 'Todavía no estás en ningún equipo.', role_guest: 'Invitado' });

  // ---------- small UI helpers (shared with teams-admin.js / teams-bots.js / teams-auth.js) ----------
  const U = (LC.tmUi = {});
  U.set = (node, ...kids) => { node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return node; }; // replaceChildren() would print "null"
  U.fail = (e) => LC.toast((e && e.message) || t('tm_err'));
  U.field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  U.group = (label, ...kids) => el('div', { class: 'field', role: 'group', 'aria-label': label }, el('span', { class: 'flabel', 'aria-hidden': 'true', text: label }), ...kids);
  U.toggle = (label, checked, fn, hint) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!checked, onchange: (e) => fn(e.target.checked, e) }), el('span', {}, label, hint ? el('small', { class: 'muted', text: ' — ' + hint }) : null));
  U.select = (opts, value, fn, label) => { const s = el('select', { 'aria-label': label || '', onchange: (e) => fn && fn(e.target.value) }, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = String(value ?? ''); return s; };
  U.radios = (name, opts, value, fn, label) => el('div', { class: 'tm-radios', role: 'radiogroup', 'aria-label': label }, opts.map(([v, l, hint]) => el('label', { class: 'tm-radio' }, el('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => fn(v) }), el('span', {}, el('b', { text: l }), hint ? el('small', { class: 'muted', text: hint }) : null))));
  U.pill = (text, cls = '', title) => el('span', { class: 'pill tm-pill ' + cls, text, title: title || null });
  const PALETTE = ['#5b5fc7', '#038387', '#c239b3', '#ca5010', '#498205', '#0078d4', '#986f0b', '#d13438', '#4f6bed', '#7a5af5'];
  U.colorOf = (id) => PALETTE[[...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  const initials = (n) => { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase(); };
  U.tile = (tm, size = '') => el('span', { class: 'av tile tm-tile ' + size, 'aria-hidden': 'true', style: `background:${tm && tm.picture ? 'transparent' : U.colorOf(tm ? tm.id : '?')}` }, tm && tm.picture ? el('img', { src: tm.picture, alt: '' }) : initials(tm ? tm.name : '?'));
  // read an image file into a small data: URL (pictures never depend on uploaded files)
  U.imageData = async (file, size = 160, type = 'image/jpeg', quality = 0.85, maxLen = 150000) => {
    const bmp = await createImageBitmap(file), c = document.createElement('canvas'); const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k)); const g = c.getContext('2d'); if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(bmp, 0, 0, c.width, c.height);
    let q = quality, out = c.toDataURL(type, q); while (out.length > maxLen && q > 0.3) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
    if (out.length > maxLen) throw new Error(t('tm_err')); return out;
  };
  U.pictureInput = (cur, onChange, o = {}) => {
    const box = el('div', { class: 'tm-picline' }), file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'hidden', 'aria-label': o.label || t('tm_uploadPicture') });
    let val = cur || '';
    const draw = () => U.set(box, val ? el('img', { class: 'tm-picprev', src: val, alt: '' }) : el('span', { class: 'tm-picprev empty', 'aria-hidden': 'true' }, LC.icon('image')), el('button', { type: 'button', class: 'secondary sm', text: t('tm_uploadPicture'), onclick: () => file.click() }), val ? el('button', { type: 'button', class: 'secondary sm', text: t('tm_removePicture'), onclick: () => { val = ''; draw(); onChange(''); } }) : null, file);
    file.onchange = async () => { const f = file.files[0]; file.value = ''; if (!f) return; try { val = await U.imageData(f, o.size || 160, o.type || 'image/jpeg', 0.85, o.max || 150000); draw(); onChange(val); } catch (e) { U.fail(e); } };
    draw(); return box;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  // a small accessible bar chart (values per day); each bar has a <title> with its exact value
  U.chart = (values, labels, o = {}) => {
    const W = 640, H = o.height || 150, n = Math.max(1, values.length), max = Math.max(1, ...values), bw = W / n, gap = Math.min(4, bw * 0.2);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 22}`, class: 'tm-chart', role: 'img', 'aria-label': o.label || '' });
    for (const f of [0.5, 1]) svg.append(sv('line', { x1: 0, x2: W, y1: H - H * f, y2: H - H * f, class: 'tm-gl' }));
    svg.append(sv('text', { x: 2, y: 11, class: 'tm-axis' }, String(max)));
    values.forEach((v, i) => { const h = Math.round((v / max) * (H - 14)); svg.append(sv('rect', { x: i * bw + gap / 2, y: H - h, width: Math.max(1, bw - gap), height: h, rx: 2, class: 'tm-bar' + (o.cls ? ' ' + o.cls : '') }, sv('title', {}, `${labels[i]}: ${v}`))); });
    const marks = n <= 8 ? values.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    for (const i of marks) svg.append(sv('text', { x: Math.min(W - 40, Math.max(0, i * bw)), y: H + 16, class: 'tm-axis' }, labels[i]));
    return el('div', { class: 'tm-chartbox' }, svg);
  };
  U.dayLabels = (from, days) => Array.from({ length: days }, (_, i) => new Date(from + i * 86400000).toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { month: 'short', day: 'numeric' }));
  U.stat = (big, small) => el('div', { class: 'stat' }, el('b', { text: String(big) }), el('small', { text: small }));
  U.csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  U.download = (name, text, type = 'text/csv') => { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  // people picker: searchable list with checkboxes (skips bots, removed people and, by default, yourself)
  U.people = (o = {}) => {
    const picked = new Set(o.value || []), q = el('input', { type: 'search', placeholder: t('tm_searchPeople'), 'aria-label': t('tm_searchPeople') }), list = el('div', { class: 'people tm-people' }), count = el('span', { class: 'muted small' });
    const pool = () => [...S.users.values()].filter((u) => !u.removed && !u.deleted && !u.bot && (o.self || u.id !== S.me.id) && (!o.filter || o.filter(u))).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id)));
    const draw = () => {
      const f = q.value.trim().toLowerCase(), us = pool().filter((u) => !f || LC.uname(u.id).toLowerCase().includes(f) || u.name.toLowerCase().includes(f));
      list.replaceChildren(...(us.length ? us.map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: picked.has(u.id), onchange: (e) => { if (e.target.checked) picked.add(u.id); else picked.delete(u.id); count.textContent = t('tm_peopleSel', { n: picked.size }); } }), LC.avatar(u, 'sm', false), el('span', { class: 'grow', text: LC.uname(u.id) }), u.role === 'guest' ? U.pill(t('role_guest'), 'guest') : null)) : [el('p', { class: 'muted small pad', text: t('tm_nobody') })]));
      count.textContent = t('tm_peopleSel', { n: picked.size });
    };
    q.addEventListener('input', draw); draw();
    return { el: el('div', { class: 'tm-pickwrap' }, q, list, count), value: () => [...picked] };
  };
  U.members = (n) => (n === 1 ? t('tm_member1') : t('tm_membersN', { n }));
  U.badge = (n, mention) => el('span', { class: 'badge' + (mention ? ' mention' : ''), text: (mention ? '@' : '') + (n > 99 ? '99+' : n) });

  // ---------- state ----------
  const me = () => S.me || {};
  const isGuest = () => me().role === 'guest';
  const teamOfChan = (chan) => { const c = S.channels.get(chan); return c && c.team ? TM.teams.get(c.team) || null : null; };
  const isOwner = (tm) => !!tm && !tm.partial && (tm.owners || []).includes(me().id);
  const canOwn = (tm) => isOwner(tm) || LC.isAdmin();
  const settingsOf = (tm) => (tm && tm.settings) || {};
  const channelsOf = (tid) => [...S.channels.values()].filter((c) => c.team === tid).sort((a, b) => (b.general ? 1 : 0) - (a.general ? 1 : 0) || a.name.localeCompare(b.name));
  const canAddChannel = (tm) => !tm.partial && !tm.archived && (canOwn(tm) || (isGuest() ? settingsOf(tm).guestCreateChannels : settingsOf(tm).memberCreateChannels));
  const canEditChan = (c) => { const tm = TM.teams.get(c.team); if (!c.team) return LC.isAdmin() || (!!c.members && c.by === me().id); if (!tm || tm.archived) return false; return canOwn(tm) || (c.owners || []).includes(me().id) || (!c.members && !tm.partial && (isGuest() ? settingsOf(tm).guestCreateChannels : settingsOf(tm).memberCreateChannels)); };
  const canDeleteChan = (c) => { const tm = TM.teams.get(c.team); if (!tm || c.general || tm.archived) return false; return canOwn(tm) || (c.owners || []).includes(me().id) || (!tm.partial && (isGuest() ? settingsOf(tm).guestDeleteChannels : settingsOf(tm).memberDeleteChannels)); };
  const canStats = (c) => { const tm = TM.teams.get(c.team); return LC.isAdmin() || canOwn(tm) || (c.owners || []).includes(me().id) || (!c.team && c.members && c.by === me().id); };
  TM.teamOfChan = teamOfChan; TM.canOwn = canOwn; TM.channelsOf = channelsOf; TM.isGuest = isGuest; TM.canEditChan = canEditChan;
  const labelOf = (id) => (TM.cfg.labels || []).find((l) => l.id === id) || null;
  TM.labelOf = labelOf;
  const rerender = () => { if (S.pane === 'teams') LC.renderNav(); else LC.renderRail(); if (S.app && LC.ext.panes[S.app] && LC.ext.panes[S.app].tmView) LC.openApp(S.app); };

  LC.on('init', (d) => {
    TM.teams = new Map((d.teams || []).map((x) => [x.id, x])); TM.prefs = d.tmPrefs || { hidden: [], hiddenTeams: [] }; TM.tags = d.tmTags || []; TM.canCreate = d.tmCanCreateTeams !== false;
    TM.cfg = d.tmCfg || TM.cfg || {};
    setTimeout(deepLink, 0);
  });
  LC.on('team', (x) => { TM.teams.set(x.id, x); rerender(); if (S.chan && teamOfChan(S.chan) && teamOfChan(S.chan).id === x.id) LC.renderHeader(); });
  LC.on('team_removed', (x) => { const old = TM.teams.get(x.id); TM.teams.delete(x.id); if (old && !x.silent) LC.toast(x.deleted ? t('tm_teamDeleted') : t('tm_teamGone', { name: old.name })); if (TM.view === x.id && S.app) LC.openApp('tm_dir'); rerender(); });
  LC.on('tm_prefs', (p) => { TM.prefs = p; rerender(); });
  LC.on('tm_tags', (list) => { TM.tags = list; });
  LC.on('tm_config', (c) => { TM.cfg = { ...TM.cfg, ...c }; rerender(); });
  for (const ev of ['channel', 'channel_removed', 'channel_deleted', 'message', 'readstate', 'me']) LC.on(ev, () => { if (S.pane === 'teams') LC.renderNav(); else LC.renderRail(); });

  // ---------- how team channels look elsewhere: title, picture tile, header badges ----------
  const baseInfo = LC.chanInfo;
  LC.chanInfo = (chan) => {
    const i = baseInfo(chan); if (!i.c || !i.c.team) return i;
    const tm = TM.teams.get(i.c.team), bits = [tm ? tm.name : ''], c = i.c;
    if (c.private) bits.push(t('tm_privateChan')); else if (c.shared) bits.push(t('tm_sharedChan'));
    if (c.topic || c.description) bits.push(c.topic || c.description);
    return { ...i, kind: 'channel', title: c.name, team: tm, longTitle: (tm ? tm.name + ' › ' : '') + c.name, topic: bits.filter(Boolean).join(' · '), icon: '#' };
  };
  const baseLead = LC.chatLead;
  LC.chatLead = (id, size = '') => {
    const c = S.channels.get(id); if (!c || (!c.team && !c.picture)) return baseLead(id, size);
    if (!c.team) return el('div', { class: 'av tile ' + size, 'aria-hidden': 'true' }, el('img', { src: c.picture, alt: '' }));
    const tm = TM.teams.get(c.team), tile = c.picture ? el('div', { class: 'av tile ' + size, 'aria-hidden': 'true' }, el('img', { src: c.picture, alt: '' })) : U.tile(tm || { id: c.team, name: c.name }, size);
    if (c.private || c.shared) tile.append(el('span', { class: 'tm-lock' }, LC.icon(c.private ? 'lock_closed' : 'channel_share')));
    return tile;
  };
  LC.ext.headerActions.push((chan) => {
    const c = S.channels.get(chan); if (!c) return [];
    const tm = c.team ? TM.teams.get(c.team) : null, out = [];
    const lab = labelOf(c.label || (tm && tm.label)); if (lab) out.push(el('span', { class: 'tm-label', style: `--lc:${lab.color}`, title: t('tm_labelBadge', { name: lab.name }), 'aria-label': t('tm_labelBadge', { name: lab.name }) }, LC.icon('shield_keyhole'), el('span', { text: lab.name })));
    if (tm && tm.archived) out.push(U.pill(t('tm_archived'), 'warn'));
    return out;
  });
  LC.ext.composerBanner.push((chan) => {
    const c = S.channels.get(chan); if (!c) return null; const tm = c.team ? TM.teams.get(c.team) : null;
    if (tm && tm.archived) return el('div', { class: 'tm-banner' }, LC.icon('archive'), el('span', { text: t('tm_archivedNotice') }));
    if (tm && tm.warned && canOwn(tm)) return el('div', { class: 'tm-banner' }, LC.icon('hourglass'), el('span', { text: t('tm_expiresSoon') }), el('button', { class: 'secondary sm', text: t('tm_renew'), onclick: () => LC.api('/api/teams/renew', { id: tm.id }).catch(U.fail) }));
    const mod = LC.isAdmin() || canOwn(tm) || (c.owners || []).includes(me().id) || (c.moderators || []).includes(me().id);
    if (c.postRule === 'moderators' && !mod) return el('div', { class: 'tm-banner' }, LC.icon('megaphone'), el('span', { text: t('tm_onlyModsNotice') }));
    return null;
  });

  // ---------- deep links: #c=<chan> opens a channel, #team=<id> a team (access is checked by the server either way) ----------
  function deepLink() {
    const h = location.hash, mc = /^#c=([^&]+)/.exec(h), mt = /^#team=([a-f0-9]{6,32})/.exec(h); if (!mc && !mt) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (mc) { const chan = decodeURIComponent(mc[1]); if (!S.channels.has(chan)) return LC.toast(t('tm_noAccess'), { ms: 6000 }); const c = S.channels.get(chan); if (c.team) { setOpen(c.team, true); S.pane = 'teams'; } LC.openChat(chan); return; }
    const id = mt[1], tm = TM.teams.get(id);
    if (tm && !tm.partial) { setOpen(id, true); LC.setPane('teams'); if (tm.general && S.channels.has(tm.general)) LC.openChat(tm.general); return; }
    LC.setPane('teams'); openDirectory(id);
  }
  let info = null;
  const shareBase = async () => { try { info ||= await LC.api('/api/info'); const u = info.urls && info.urls[0]; if (u && !/^(localhost|127\.)/.test(location.hostname) === false) return (info.https && u.secureUrl) || u.url; } catch {} return location.origin; };
  TM.copyLink = async (kind, id) => { const base = await shareBase(); const link = `${base}/#${kind}=${encodeURIComponent(id)}`; LC.toast((await LC.copy(link)) ? t('tm_linkCopied') + ': ' + link : link, { ms: 6000 }); };

  // ---------- guests (and anyone without #general): never fall back to a chat they can't open ----------
  const baseOpen = LC.openChat;
  LC.openChat = (chan, o) => {
    const ok = (c) => c && (c.startsWith('dm:') ? S.users.has(LC.peerOf(c)) : S.channels.has(c));
    if (S.me && !ok(chan) && !S.channels.has('general')) { const first = [...S.channels.values()].find((c) => !c.team) || [...S.channels.values()][0]; chan = first ? first.id : LC.dmId(S.me.id, S.me.id); }
    return baseOpen(chan, o);
  };

  // ---------- the Teams pane ----------
  const openState = () => LC.ls.get('lc_tm_open', {});
  const isOpen = (id) => openState()[id] !== false;
  const setOpen = (id, v) => { const s = openState(); s[id] = !!v; LC.ls.set('lc_tm_open', s); };
  const showHidden = (id) => !!LC.ls.get('lc_tm_showhidden', {})[id];
  const mentionsIn = (tid) => channelsOf(tid).reduce((a, c) => a + (S.mentions[c.id] || 0), 0);
  const unreadIn = (tid) => channelsOf(tid).some((c) => (S.unread[c.id] || 0) && !LC.isMuted(c.id));
  function chanItem(c) {
    const id = c.id, un = S.unread[id] || 0, mn = S.mentions[id] || 0, muted = LC.isMuted(id), active = S.chan === id && !S.app;
    return el('div', { class: 'item tm-chan' + (active ? ' active' : '') + (un && !muted ? ' unread' : '') + (muted ? ' muted' : ''), 'data-chan': id, oncontextmenu: (ev) => { ev.preventDefault(); chanMenu({ x: ev.clientX, y: ev.clientY }, c); } },
      el('button', { class: 'itemmain', 'aria-current': active ? 'page' : null, onclick: () => { TM.view = null; LC.openChat(id); } },
        el('span', { class: 'tm-cico', 'aria-hidden': 'true' }, c.private ? LC.icon('lock_closed') : c.shared ? LC.icon('channel_share') : null),
        el('span', { class: 'name', text: c.name }), muted ? LC.icon('alert_off', { cls: 'mutedmark', label: t('muted') }) : null,
        mn ? el('span', { class: 'badge mention', text: '@' + mn, 'aria-label': t('unreadMentions', { n: mn }) }) : un && !muted ? el('span', { class: 'dotmark tm-dot', 'aria-label': t('unreadMsgs', { n: un }) }) : null),
      el('button', { class: 'kebab', 'aria-label': t('tm_chanOptions', { name: c.name }), title: t('tm_chanOptions', { name: c.name }), 'aria-haspopup': 'menu', onclick: (ev) => { ev.stopPropagation(); chanMenu(ev.currentTarget, c); } }, LC.icon('more_horizontal')));
  }
  function teamBlock(tm) {
    const open = isOpen(tm.id), hid = new Set(TM.prefs.hidden || []), chans = channelsOf(tm.id), shown = chans.filter((c) => !hid.has(c.id)), hidden = chans.filter((c) => hid.has(c.id));
    const mn = mentionsIn(tm.id), un = unreadIn(tm.id), cur = (S.chan && teamOfChan(S.chan) === tm && !S.app) || (S.app === 'tm_team' && TM.view === tm.id);
    const block = el('div', { class: 'tm-team' + (cur ? ' current' : ''), 'data-team': tm.id },
      el('div', { class: 'tm-trow' + (un ? ' unread' : '') },
        el('button', { class: 'tm-thead', 'aria-expanded': String(open), title: tm.name, onclick: () => { setOpen(tm.id, !open); LC.renderNav(); } },
          LC.icon(open ? 'chevron_down' : 'chevron_right', { cls: 'tm-chev' }), U.tile(tm, 'sm'), el('span', { class: 'tm-tname', text: tm.name }),
          tm.partial ? U.pill(t('tm_shared'), '', t('tm_sharedWithYou')) : null, tm.archived ? U.pill(t('tm_archived'), 'warn') : null, !open && mn ? U.badge(mn, true) : null),
        el('button', { class: 'kebab', 'aria-label': t('tm_teamOptions', { name: tm.name }), title: t('tm_teamOptions', { name: tm.name }), 'aria-haspopup': 'menu', onclick: (ev) => { ev.stopPropagation(); teamMenu(ev.currentTarget, tm); } }, LC.icon('more_horizontal'))));
    if (open) {
      const list = el('div', { class: 'tm-chans', role: 'group', 'aria-label': tm.name }, ...shown.map(chanItem));
      if (hidden.length) {
        const sh = showHidden(tm.id);
        list.append(el('button', { class: 'tm-hiddenbtn', 'aria-expanded': String(sh), onclick: () => { const s = LC.ls.get('lc_tm_showhidden', {}); s[tm.id] = !sh; LC.ls.set('lc_tm_showhidden', s); LC.renderNav(); } }, LC.icon(sh ? 'chevron_down' : 'chevron_right'), el('span', { text: t('tm_hiddenChans', { n: hidden.length }) })));
        if (sh) list.append(...hidden.map((c) => { const n = chanItem(c); n.classList.add('tm-hiddenchan'); return n; }));
      }
      block.append(list);
    }
    return block;
  }
  function renderTeams(nav) {
    const all = [...TM.teams.values()].sort((a, b) => a.name.localeCompare(b.name)), ht = new Set(TM.prefs.hiddenTeams || []), shut = LC.ls.get('lc_collapsed', {});
    const active = all.filter((x) => !x.archived && !ht.has(x.id)), hidden = all.filter((x) => !x.archived && ht.has(x.id)), archived = all.filter((x) => x.archived);
    nav.replaceChildren();
    if (!active.length) nav.append(el('div', { class: 'empty tm-empty' }, LC.icon('people_team', { cls: 'big' }), el('p', { text: t('tm_noTeams') }), !isGuest() ? el('button', { class: 'primary sm', text: t('tm_joinCreate'), onclick: () => openDirectory() }) : null));
    nav.append(...active.map(teamBlock));
    if (hidden.length) { nav.append(LC.navSection('tm_hidden', t('tm_hiddenTeams') + ` (${hidden.length})`)); if (!shut.tm_hidden) nav.append(...hidden.map(teamBlock)); }
    if (archived.length) { nav.append(LC.navSection('tm_archived', t('tm_archivedTeams') + ` (${archived.length})`)); if (!shut.tm_archived) nav.append(...archived.map(teamBlock)); }
  }
  Object.assign(LC.ext.panes, {
    teams: { icon: 'people_team', label: () => t('tm_teams'), order: 30, badge: () => [...TM.teams.values()].reduce((a, x) => a + mentionsIn(x.id), 0), render: renderTeams,
      actions: () => [!isGuest() ? LC.ibtn('people_add', t('tm_joinCreate'), () => openDirectory()) : null, !isGuest() && TM.canCreate ? LC.ibtn('add', t('tm_createTeam'), () => createTeamDialog()) : null].filter(Boolean) },
    tm_dir: { icon: 'people_team', label: () => t('tm_joinCreate'), hidden: () => true, main: (host) => renderDirectory(host), tmView: true },
    tm_team: { icon: 'people_team', label: () => (TM.teams.get(TM.view) || {}).name || t('tm_manageTeam'), subtitle: () => t('tm_manageTeam'), hidden: () => true, main: (host) => renderManage(host), tmView: true },
  });

  // ---------- team and channel menus ----------
  async function hide(body) { try { await LC.api('/api/teams/hide', body); } catch (e) { U.fail(e); } }
  function teamMenu(anchor, tm) {
    const own = canOwn(tm), hidden = (TM.prefs.hiddenTeams || []).includes(tm.id), member = !tm.partial;
    const tagRights = member && (own || (settingsOf(tm).memberManageTags && !isGuest()));
    LC.menu(anchor, [
      member ? { icon: 'settings', label: t('tm_manageTeam'), fn: () => openManage(tm.id) } : null,
      member && canAddChannel(tm) ? { icon: 'channel_add', label: t('tm_addChannel'), fn: () => channelDialog(tm) } : null,
      member && own && !tm.archived ? { icon: 'person_add', label: t('tm_addMember'), fn: () => addMembersDialog(tm) } : null,
      { icon: hidden ? 'eye' : 'eye_off', label: hidden ? t('tm_show') : t('tm_hide'), fn: () => hide({ team: tm.id, hidden: !hidden }) },
      'sep',
      member && own ? { icon: 'edit', label: t('tm_editTeam'), fn: () => openManage(tm.id, 'settings') } : null,
      member ? { icon: 'link', label: t('tm_getLinkTeam'), fn: () => TM.copyLink('team', tm.id) } : null,
      tagRights ? { icon: 'tag', label: t('tm_manageTags'), fn: () => openManage(tm.id, 'tags') } : null,
      own && (tm.warned || (tm.archived && tm.archivedWhy === 'expired')) ? { icon: 'arrow_clockwise', label: t('tm_renew'), fn: () => LC.api('/api/teams/renew', { id: tm.id }).catch(U.fail) } : null,
      own || member ? 'sep' : null,
      member ? { icon: 'sign_out', label: t('tm_leave'), danger: true, fn: async () => { if (await LC.confirm(t('tm_confirmLeave', { name: tm.name }), { danger: true, ok: t('tm_leave') })) LC.api('/api/teams/leave', { id: tm.id }).catch(U.fail); } } : null,
      own ? { icon: 'archive', label: tm.archived ? t('tm_restore') : t('tm_archive'), fn: async () => { if (tm.archived || (await LC.confirm(t('tm_confirmArchive', { name: tm.name }), { ok: t('tm_archive') }))) LC.api('/api/teams/archive', { id: tm.id, archived: !tm.archived }).catch(U.fail); } } : null,
      own ? { icon: 'delete', label: t('tm_deleteTeam'), danger: true, fn: async () => { if (await LC.confirm(t('tm_confirmDelete', { name: tm.name }), { danger: true, ok: t('delete') })) LC.api('/api/teams/delete', { id: tm.id }).catch(U.fail); } } : null,
    ]);
  }
  const chanItems = (c, o = {}) => {
    const hidden = (TM.prefs.hidden || []).includes(c.id), muted = LC.isMuted(c.id), prefs = LC.prefs(), pinned = (prefs.pinnedChats || []).includes(c.id);
    const tm = c.team ? TM.teams.get(c.team) : null, own = tm ? canOwn(tm) : LC.isAdmin(), stats = canStats(c);
    const connectors = LC.tmBots && (c.team ? tm && !tm.archived && !tm.partial && (own || (c.owners || []).includes(me().id) || (settingsOf(tm).memberAddApps && !isGuest())) : LC.isAdmin());
    return [
      o.full && c.team ? { icon: muted ? 'alert' : 'alert_off', label: muted ? t('unmute') : t('tm_muteChannel'), fn: () => { const m = { ...(prefs.muted || {}) }; if (muted) delete m[c.id]; else m[c.id] = true; LC.setPrefs({ muted: m }); } } : null,
      c.team && !c.general ? { icon: hidden ? 'eye' : 'eye_off', label: hidden ? t('tm_show') : t('tm_hide'), fn: () => hide({ chan: c.id, hidden: !hidden }) } : null,
      o.full && c.team ? { icon: pinned ? 'pin_off' : 'pin', label: pinned ? t('unpinChat') : t('pinChat'), fn: () => LC.setPrefs({ pinnedChats: pinned ? prefs.pinnedChats.filter((x) => x !== c.id) : [...(prefs.pinnedChats || []), c.id] }) } : null,
      o.full ? 'sep' : null,
      { icon: 'settings', label: t('tm_manageChannel'), fn: () => manageChannel(c.id) },
      { icon: 'link', label: t('tm_getLinkChan'), fn: () => TM.copyLink('c', c.id) },
      connectors ? { icon: 'plug_connected', label: t('tm_connectors'), fn: () => LC.tmBots.connectors(c.id) } : null,
      stats ? { icon: 'data_bar_vertical', label: t('tm_analytics'), fn: () => statsDialog(c.id) } : null,
      c.team && c.members && !(c.owners || []).includes(me().id) ? { icon: 'sign_out', label: t('tm_leaveChannel'), fn: () => LC.api('/api/channel/members', { id: c.id, remove: [me().id] }).then(() => LC.toast(t('tm_leaveTeamChan'))).catch(U.fail) } : null,
      c.team && canDeleteChan(c) ? 'sep' : null,
      c.team && canDeleteChan(c) ? { icon: 'delete', label: t('tm_deleteChannel'), danger: true, fn: async () => { if (await LC.confirm(t('tm_confirmDeleteChan', { name: c.name }), { danger: true, ok: t('delete') })) LC.api('/api/channel/delete', { id: c.id }).catch(U.fail); } } : null,
    ];
  };
  const chanMenu = (anchor, c) => LC.menu(anchor, chanItems(c, { full: true }));
  LC.ext.headerMenu.push((chan) => { const c = S.channels.get(chan); if (!c) return []; if (!c.team && !LC.isAdmin() && !(c.members && c.by === me().id)) return []; return ['sep', ...chanItems(c)]; });

  // ---------- Join or create a team ----------
  function openDirectory(focus) { TM.view = null; TM.dirFocus = focus || null; LC.openApp('tm_dir'); LC.renderNav(); }
  TM.openDirectory = openDirectory;
  async function renderDirectory(host) {
    const q = el('input', { type: 'search', placeholder: t('tm_searchTeams'), 'aria-label': t('tm_searchTeams') }), grid = el('div', { class: 'tm-grid', 'aria-live': 'polite' });
    const code = el('input', { placeholder: t('tm_codePh'), 'aria-label': t('tm_codePh'), maxlength: 20, autocomplete: 'off' });
    const joinCode = async (e) => { e.preventDefault(); if (!code.value.trim()) return; try { const r = await LC.api('/api/teams/join', { code: code.value.trim() }); TM.teams.set(r.team.id, r.team); LC.toast(t('tm_joined', { name: r.team.name })); setOpen(r.team.id, true); LC.setPane('teams'); if (r.general) LC.openChat(r.general); } catch (x) { U.fail(x); } };
    const cards = el('div', { class: 'tm-grid tm-startgrid' },
      el('div', { class: 'tm-card tm-start' }, el('div', { class: 'tm-cardicon', 'aria-hidden': 'true' }, LC.icon('people_team')), el('h3', { text: t('tm_createTeam') }), el('p', { class: 'muted small', text: TM.canCreate ? t('tm_startScratchHint') : t('tm_cantCreate') }),
        el('button', { class: 'primary', text: t('tm_createTeamBtn'), disabled: !TM.canCreate || isGuest(), onclick: () => createTeamDialog() })),
      el('form', { class: 'tm-card tm-start', onsubmit: joinCode }, el('div', { class: 'tm-cardicon', 'aria-hidden': 'true' }, LC.icon('key')), el('h3', { text: t('tm_joinCode') }), code, el('button', { class: 'secondary', type: 'submit', text: t('tm_joinTeam'), disabled: isGuest() })));
    host.replaceChildren(el('div', { class: 'tm-page' }, el('div', { class: 'row-between tm-pagehead' }, el('h2', { text: t('tm_joinCreate') }), q), cards, grid));
    const load = async () => {
      grid.replaceChildren(el('p', { class: 'muted', text: t('loading') }));
      try {
        const { teams } = await LC.api('/api/teams/directory?q=' + encodeURIComponent(q.value.trim()));
        grid.replaceChildren(...(teams.length ? teams.map((x) => dirCard(x, load)) : [el('p', { class: 'muted', text: t('tm_noTeamsFound') })]));
        if (TM.dirFocus) { const n = grid.querySelector(`[data-team="${TM.dirFocus}"]`); if (n) { n.classList.add('flash'); n.scrollIntoView({ block: 'center' }); } TM.dirFocus = null; }
      } catch (e) { grid.replaceChildren(el('p', { class: 'err', text: e.message })); }
    };
    q.addEventListener('input', LC.debounce(load, 250)); load();
  }
  function dirCard(x, reload) {
    const lab = labelOf(x.label);
    const act = x.visibility === 'public' ? el('button', { class: 'primary sm', text: t('tm_join'), onclick: async () => { try { const r = await LC.api('/api/teams/join', { id: x.id }); TM.teams.set(r.team.id, r.team); LC.toast(t('tm_joined', { name: x.name })); setOpen(x.id, true); LC.setPane('teams'); if (r.general) LC.openChat(r.general); } catch (e) { U.fail(e); } } })
      : x.requested ? el('button', { class: 'secondary sm', text: t('tm_cancelRequest'), onclick: () => LC.api('/api/teams/request', { id: x.id, cancel: true }).then(reload).catch(U.fail) })
        : el('button', { class: 'secondary sm', text: t('tm_requestJoin'), onclick: async () => { const note = await LC.prompt(t('tm_whyJoin'), { max: 300, ok: t('tm_requestJoin') }); if (note === null) return; LC.api('/api/teams/request', { id: x.id, note }).then(() => { LC.toast(t('tm_requestSent')); reload(); }).catch(U.fail); } });
    return el('div', { class: 'tm-card', 'data-team': x.id }, el('div', { class: 'row-between' }, U.tile(x, 'lg'), lab ? el('span', { class: 'tm-label sm', style: `--lc:${lab.color}` }, el('span', { text: lab.name })) : null),
      el('h3', { text: x.name }), el('p', { class: 'muted small tm-desc', text: x.description || '' }),
      el('div', { class: 'row-between' }, el('span', { class: 'small muted' }, LC.icon(x.visibility === 'public' ? 'globe' : 'lock_closed'), ' ' + (x.visibility === 'public' ? t('tm_public') : t('tm_private')) + ' · ' + U.members(x.count)), x.requested ? U.pill(t('tm_requested')) : null),
      act);
  }

  // ---------- Create a team (template → details → members) ----------
  const TPLS = [['', 'add', 'tm_startScratch', 'tm_startScratchHint'], ['project', 'clipboard_task', 'tm_tpl_project', 'tm_tplHint_project'], ['event', 'calendar_ltr', 'tm_tpl_event', 'tm_tplHint_event'], ['class', 'lightbulb', 'tm_tpl_class', 'tm_tplHint_class'], ['friends', 'people_community', 'tm_tpl_friends', 'tm_tplHint_friends']];
  function createTeamDialog() {
    if (isGuest()) return LC.toast(t('tm_guestNoCreate')); if (!TM.canCreate) return LC.toast(t('tm_cantCreate'));
    let tpl = '';
    const step1 = () => LC.modal([el('h2', {}, LC.icon('people_team'), ' ' + t('tm_createTeam')), el('p', { class: 'muted', text: t('tm_pickTemplate') }),
      el('div', { class: 'tm-tpls' }, TPLS.map(([k, ic, lab, hint]) => el('button', { type: 'button', class: 'tm-tpl', onclick: () => { tpl = k; step2(); } }, el('span', { class: 'tm-cardicon', 'aria-hidden': 'true' }, LC.icon(ic)), el('b', { text: t(lab) }), el('small', { class: 'muted', text: t(hint) })))),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))], { wide: true });
    const step2 = () => {
      const name = el('input', { maxlength: 60, required: true, autofocus: true }), desc = el('textarea', { maxlength: 1000, rows: 3 }), err = el('div', { class: 'err', role: 'alert' });
      const n = TM.cfg.naming || {}; if (n.prefix || n.suffix) name.placeholder = `${n.prefix || ''}…${n.suffix || ''}`;
      let vis = 'private', pic = '', label = '';
      const labels = TM.cfg.labels || [];
      const go = async (e) => {
        e.preventDefault(); err.textContent = '';
        try { const r = await LC.api('/api/teams/create', { name: name.value, description: desc.value, visibility: vis, template: tpl, picture: pic || undefined, label }); TM.teams.set(r.team.id, r.team); setOpen(r.team.id, true); step3(r.team, r.general); }
        catch (x) { err.textContent = x.message; }
      };
      LC.modal(el('form', { onsubmit: go }, el('h2', {}, LC.icon('people_team'), ' ' + (tpl ? t('tm_tpl_' + tpl) : t('tm_createTeam'))), el('p', { class: 'muted small', text: t('tm_quickDetails') }),
        U.field(t('tm_teamName'), name), U.field(t('tm_description'), desc),
        U.group(t('tm_privacy'), U.radios('tm-vis', [['private', t('tm_private'), t('tm_privateHint')], ['public', t('tm_public'), t('tm_publicHint')]], vis, (v) => { vis = v; }, t('tm_privacy'))),
        labels.length ? U.field(t('tm_label'), U.select([['', t('tm_noLabel')], ...labels.map((l) => [l.id, l.name])], '', (v) => { label = v; }, t('tm_label'))) : null,
        U.group(t('tm_picture'), U.pictureInput('', (v) => { pic = v; })), err,
        el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('tm_back'), onclick: step1 }), el('button', { class: 'primary', type: 'submit', text: t('tm_create') }))));
    };
    const step3 = (tm, general) => {
      const pick = U.people({ filter: (u) => !(tm.members || []).includes(u.id) });
      const done = () => { LC.closeModal(); LC.setPane('teams'); if (general) LC.openChat(general); };
      LC.modal([el('h2', {}, LC.icon('person_add'), ' ' + t('tm_addMembersTo', { name: tm.name })), el('p', { class: 'muted small', text: t('tm_addMembersHint') }), pick.el,
        el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('tm_skip'), onclick: done }), el('button', { class: 'primary', text: t('tm_add'), onclick: async () => { const add = pick.value(); try { if (add.length) await LC.api('/api/teams/members', { id: tm.id, add }); done(); } catch (e) { U.fail(e); } } }))]);
    };
    step1();
  }
  TM.createTeam = createTeamDialog;
  function addMembersDialog(tm) {
    const pick = U.people({ filter: (u) => !(tm.members || []).includes(u.id) && !(tm.guests || []).includes(u.id) });
    LC.modal([el('h2', {}, LC.icon('person_add'), ' ' + t('tm_addMembersTo', { name: tm.name })), el('p', { class: 'muted small', text: t('tm_addMembersHint') }), pick.el,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('tm_add'), onclick: async () => { try { await LC.api('/api/teams/members', { id: tm.id, add: pick.value() }); LC.closeModal(); } catch (e) { U.fail(e); } } }))]);
  }

  // ---------- add a channel ----------
  function channelDialog(tm) {
    const name = el('input', { maxlength: 50, required: true, autofocus: true }), desc = el('textarea', { maxlength: 1024, rows: 2 }), err = el('div', { class: 'err', role: 'alert' });
    let type = 'standard', kind = 'posts';
    const own = canOwn(tm), priv = own || (isGuest() ? false : settingsOf(tm).memberCreatePrivate);
    const pick = U.people({}), pickBox = el('div', { class: 'hidden' }, U.group(t('tm_pickPeople'), pick.el));
    const types = [['standard', t('tm_typeStandard')], ...(priv ? [['private', t('tm_typePrivate')], ['shared', t('tm_typeShared')]] : [])];
    const redrawPick = () => { const p2 = U.people({ filter: type === 'private' ? (u) => (tm.members || []).includes(u.id) || (tm.guests || []).includes(u.id) : null }); pick.el.replaceWith(p2.el); Object.assign(pick, p2); pickBox.classList.toggle('hidden', type === 'standard'); };
    const go = async (e) => { e.preventDefault(); err.textContent = ''; try { const c = await LC.api('/api/teams/channel', { team: tm.id, name: name.value, description: desc.value, type, kind, members: type === 'standard' ? undefined : pick.value() }); S.channels.set(c.id, c); LC.closeModal(); setOpen(tm.id, true); LC.openChat(c.id); } catch (x) { err.textContent = x.message; } };
    LC.modal(el('form', { onsubmit: go }, el('h2', {}, LC.icon('channel_add'), ' ' + t('tm_addChannelTo', { name: tm.name })), U.field(t('tm_channelName'), name), U.field(t('tm_description'), desc),
      U.group(t('tm_chanType'), U.radios('tm-ctype', types, type, (v) => { type = v; redrawPick(); }, t('tm_chanType'))), pickBox,
      U.group(t('tm_layout'), U.radios('tm-kind', [['posts', t('tm_layoutPosts')], ['', t('tm_layoutChat')]], kind, (v) => { kind = v; }, t('tm_layout'))), err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', type: 'submit', text: t('tm_add') }))), { wide: true });
  }
  TM.channelDialog = channelDialog;

  // ---------- manage a channel (team channels; and the teams area's settings on session-wide channels) ----------
  function manageChannel(chan) {
    const c = S.channels.get(chan); if (!c) return; const can = canEditChan(c), tm = c.team ? TM.teams.get(c.team) : null;
    const name = el('input', { value: c.name, maxlength: 50, disabled: !can || !!c.general || !c.team, 'aria-label': t('tm_channelName') }), desc = el('textarea', { maxlength: 1024, rows: 2, disabled: !can, 'aria-label': t('tm_description') }); desc.value = c.description || '';
    let pic, kind = c.kind || '', postRule = c.postRule || '', replies = c.replyRule !== 'none', label = c.label || '';
    const modPick = U.people({ value: c.moderators || [], self: true, filter: (u) => !tm || (tm.members || []).includes(u.id) || (tm.guests || []).includes(u.id) || (c.members || []).includes(u.id) });
    const labels = TM.cfg.labels || [];
    const save = async () => {
      const patch = { id: c.id, description: desc.value, postRule, replyRule: replies ? '' : 'none', moderators: modPick.value(), label };
      if (['', 'posts'].includes(c.kind || '')) patch.kind = kind; if (pic !== undefined) patch.picture = pic; if (c.team && !c.general && name.value !== c.name) patch.name = name.value;
      try { const out = await LC.api('/api/channel/update', patch); S.channels.set(out.id, out); LC.toast(t('tm_saved'), { ms: 1500 }); LC.closeModal(); } catch (e) { U.fail(e); }
    };
    const body = [el('div', { class: 'row-between' }, el('h2', {}, LC.chatLead(c.id, 'sm'), ' ' + c.name), LC.ibtn('dismiss', t('close'), LC.closeModal)),
      el('h3', { text: t('tm_details') }), c.team ? U.field(t('tm_channelName'), name) : null, U.field(t('tm_description'), desc), U.group(t('tm_channelPic'), can ? U.pictureInput(c.picture || '', (v) => { pic = v; }, { label: t('tm_channelPic') }) : (c.picture ? el('img', { class: 'tm-picprev', src: c.picture, alt: '' }) : el('span', { class: 'muted small', text: '—' })))];
    if (['', 'posts'].includes(c.kind || '')) body.push(U.group(t('tm_layout'), U.radios('tm-kind2', [['posts', t('tm_layoutPosts')], ['', t('tm_layoutChat')]], kind, (v) => { kind = v; }, t('tm_layout'))));
    body.push(el('h3', { text: t('tm_moderation') }), U.group(t('tm_whoPosts'), U.radios('tm-post', [['', t('tm_postEveryone')], ['moderators', t('tm_postModerators')]], postRule, (v) => { postRule = v; }, t('tm_whoPosts'))),
      U.toggle(t('tm_allowReplies'), replies, (v) => { replies = v; }), U.group(t('tm_moderators'), modPick.el));
    if (labels.length) body.push(U.field(t('tm_label'), U.select([['', t('tm_noLabel')], ...labels.map((l) => [l.id, l.name])], label, (v) => { label = v; }, t('tm_label'))));
    if (c.team && c.members) body.push(el('h3', { text: t('tm_members') + ` (${c.members.length})` }), chanMembers(c, can));
    if (!can) for (const n of body) if (n.querySelectorAll) n.querySelectorAll('input,textarea,select').forEach((x) => { x.disabled = true; });
    body.push(el('div', { class: 'acts' }, c.team && canDeleteChan(c) ? el('button', { class: 'secondary danger', text: t('tm_deleteChannel'), onclick: async () => { if (await LC.confirm(t('tm_confirmDeleteChan', { name: c.name }), { danger: true, ok: t('delete') })) LC.api('/api/channel/delete', { id: c.id }).then(LC.closeModal).catch(U.fail); } }) : null,
      el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }), can ? el('button', { class: 'primary', text: t('save'), onclick: save }) : null));
    LC.modal(body, { wide: true });
  }
  TM.manageChannel = manageChannel;
  function chanMembers(c, can) {
    const tm = TM.teams.get(c.team), box = el('div', { class: 'tm-memberlist' });
    const ownersSet = new Set(c.owners || []);
    for (const id of c.members) {
      const u = S.users.get(id); if (!u) continue;
      box.append(el('div', { class: 'rowline' }, LC.avatar(u, 'sm', true), el('span', { class: 'grow', text: LC.uname(id) }), ownersSet.has(id) ? U.pill(t('tm_channelOwners')) : null, u.role === 'guest' ? U.pill(t('role_guest'), 'guest') : null,
        can && !ownersSet.has(id) ? el('button', { class: 'secondary sm', text: t('tm_makeOwner'), onclick: () => LC.api('/api/channel/members', { id: c.id, owners: { [id]: true } }).then(() => manageChannel(c.id)).catch(U.fail) }) : null,
        can && id !== me().id ? el('button', { class: 'secondary sm', text: t('tm_remove'), onclick: () => LC.api('/api/channel/members', { id: c.id, remove: [id] }).then(() => manageChannel(c.id)).catch(U.fail) }) : null));
    }
    if (can) {
      const pick = U.people({ filter: (u) => !c.members.includes(u.id) && (c.shared || (tm && ((tm.members || []).includes(u.id) || (tm.guests || []).includes(u.id)))) });
      box.append(el('details', { class: 'tm-details' }, el('summary', { text: t('tm_addPeople') }), pick.el, el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('tm_add'), onclick: () => LC.api('/api/channel/members', { id: c.id, add: pick.value() }).then(() => manageChannel(c.id)).catch(U.fail) }))));
    }
    return box;
  }

  // ---------- channel analytics ----------
  async function statsDialog(chan, days = 30) {
    const out = el('div', { class: 'tm-stats' }, el('p', { class: 'muted', text: t('loading') })), title = LC.chanInfo(chan).longTitle || LC.chanInfo(chan).title;
    const range = U.select([[7, t('tm_range7')], [30, t('tm_range30')], [90, t('tm_range90')]], days, (v) => statsDialog(chan, Number(v)), t('tm_range30'));
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('data_bar_vertical'), ' ' + t('tm_analytics')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('div', { class: 'row-between' }, el('b', { text: title }), range), out], { wide: true });
    try { const s = await LC.api(`/api/teams/stats?chan=${encodeURIComponent(chan)}&days=${days}`); out.replaceChildren(statsView(s)); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  }
  TM.statsDialog = statsDialog;
  function statsView(s) {
    return el('div', {}, el('div', { class: 'rowline tm-tiles' }, U.stat(s.messages, t('tm_stMessages')), U.stat(s.posts, t('tm_stPosts')), U.stat(s.replies, t('tm_stReplies')), U.stat(s.reactions, t('tm_stReactions')), U.stat(s.files, t('tm_stFiles')), U.stat(s.active, t('tm_stActive'))),
      el('h3', { text: t('tm_msgsPerDay') }), U.chart(s.perDay, U.dayLabels(s.from, s.days), { label: t('tm_msgsPerDay') }),
      el('h3', { text: t('tm_topPosters') }), s.top.length ? el('ol', { class: 'tm-top' }, s.top.map((x) => el('li', {}, LC.avatar(S.users.get(x.id), 'sm', false), el('span', { class: 'grow', text: S.users.has(x.id) ? LC.uname(x.id) : x.name }), el('b', { text: String(x.n) })))) : el('p', { class: 'muted', text: t('tm_nothingYet') }));
  }

  // ---------- Manage team (main area: members, pending requests, channels, settings, analytics, tags) ----------
  function openManage(id, tab = 'members') { TM.view = id; TM.viewTab = tab; LC.openApp('tm_team'); LC.renderNav(); }
  TM.openManage = openManage;
  async function renderManage(host) {
    const tm = TM.teams.get(TM.view); if (!tm) return host.replaceChildren(el('p', { class: 'muted pad', text: t('tm_teamDeleted') }));
    const own = canOwn(tm), tabs = [['members', 'people', t('tm_tabMembers')], own ? ['requests', 'door_arrow_right', t('tm_tabRequests') + ((tm.requests || []).length ? ` (${tm.requests.length})` : '')] : null, ['channels', 'channel', t('tm_tabChannels')], own ? ['settings', 'settings', t('tm_tabSettings')] : null, own ? ['analytics', 'data_bar_vertical', t('tm_tabAnalytics')] : null, ['tags', 'tag', t('tm_tabTags')]].filter(Boolean);
    if (!tabs.some(([k]) => k === TM.viewTab)) TM.viewTab = 'members';
    const body = el('div', { class: 'tm-mbody' });
    const bar = el('div', { class: 'tabsbar tm-mtabs', role: 'tablist', 'aria-label': t('tm_manageTeam') }, tabs.map(([k, ic, lab]) => el('button', { class: 'tabbtn' + (k === TM.viewTab ? ' on' : ''), role: 'tab', 'aria-selected': String(k === TM.viewTab), onclick: () => { TM.viewTab = k; renderManage(host); } }, LC.icon(ic), el('span', { text: lab }))));
    const lab = labelOf(tm.label);
    U.set(host, el('div', { class: 'tm-page' },
      el('div', { class: 'tm-mhead' }, U.tile(tm, 'xl'), el('div', { class: 'grow' }, el('h2', { text: tm.name }), el('p', { class: 'muted', text: tm.description || '' }),
        el('div', { class: 'rowline small muted' }, LC.icon(tm.visibility === 'public' ? 'globe' : 'lock_closed'), tm.visibility === 'public' ? t('tm_public') : t('tm_private'), ' · ', U.members(new Set([...(tm.members || []), ...(tm.guests || [])]).size), lab ? el('span', { class: 'tm-label sm', style: `--lc:${lab.color}` }, el('span', { text: lab.name })) : null, tm.archived ? U.pill(t('tm_archived'), 'warn') : null)),
        tm.general && S.channels.has(tm.general) ? el('button', { class: 'secondary sm withicon', onclick: () => LC.openChat(tm.general) }, LC.icon('chat'), el('span', { text: t('tm_general') })) : null),
      bar, body));
    body.append(el('p', { class: 'muted', text: t('loading') }));
    try { body.replaceChildren(await ({ members: manageMembers, requests: manageRequests, channels: manageChannels, settings: manageSettings, analytics: manageAnalytics, tags: manageTags })[TM.viewTab](tm)); }
    catch (e) { body.replaceChildren(el('p', { class: 'err', text: e.message })); }
  }
  const refreshManage = () => { if (S.app === 'tm_team') LC.openApp('tm_team'); };
  function manageMembers(tm) {
    const own = canOwn(tm) && !tm.archived, q = el('input', { type: 'search', placeholder: t('tm_searchPeople'), 'aria-label': t('tm_searchPeople') }), list = el('div');
    const row = (id, role) => {
      const u = S.users.get(id); if (!u) return null;
      return el('tr', {}, el('td', {}, el('div', { class: 'rowline' }, LC.avatar(u, 'sm', true), el('b', { text: LC.uname(id) }), id === me().id ? el('small', { class: 'muted', text: ' (' + t('you') + ')' }) : null)),
        el('td', {}, role === 'guest' ? U.pill(t('tm_guest'), 'guest') : own && id !== me().id ? U.select([['owner', t('tm_owner')], ['member', t('tm_member')]], role, (v) => LC.api('/api/teams/members', { id: tm.id, roles: { [id]: v } }).then(refreshManage).catch((e) => { U.fail(e); refreshManage(); }), t('tm_roleFor', { name: LC.uname(id) })) : el('span', { text: role === 'owner' ? t('tm_owner') : t('tm_member') })),
        el('td', {}, own && id !== me().id ? LC.ibtn('dismiss', t('tm_remove') + ' ' + LC.uname(id), () => LC.api('/api/teams/members', { id: tm.id, remove: [id] }).then(refreshManage).catch(U.fail)) : null));
    };
    const draw = () => {
      const f = q.value.trim().toLowerCase(), m = (id) => !f || LC.uname(id).toLowerCase().includes(f);
      const owners = (tm.owners || []).filter(m), rest = [...(tm.members || []).filter((i) => !(tm.owners || []).includes(i)), ...(tm.guests || [])].filter(m);
      const tbl = (rows) => el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, el('thead', {}, el('tr', {}, el('th', { text: t('col_person') }), el('th', { text: t('col_role') }), el('th', {}, el('span', { class: 'sr-only', text: t('actions') })))), el('tbody', {}, rows)));
      list.replaceChildren(el('h3', { text: t('tm_ownersN', { n: owners.length }) }), tbl(owners.map((i) => row(i, 'owner'))), el('h3', { text: t('tm_membersGuestsN', { n: rest.length }) }), tbl(rest.map((i) => row(i, (tm.guests || []).includes(i) ? 'guest' : 'member'))));
    };
    q.addEventListener('input', draw); draw();
    return el('div', {}, el('div', { class: 'row-between' }, q, own ? el('button', { class: 'primary sm withicon', onclick: () => addMembersDialog(tm) }, LC.icon('person_add'), el('span', { text: t('tm_addMember') })) : null), list);
  }
  function manageRequests(tm) {
    const reqs = tm.requests || []; if (!reqs.length) return el('p', { class: 'empty', text: t('tm_noRequests') });
    const decide = (uid, approve) => LC.api('/api/teams/requests/decide', { id: tm.id, uid, approve }).then(refreshManage).catch(U.fail);
    return el('div', {}, reqs.map((r) => el('div', { class: 'req' }, LC.avatar(S.users.get(r.uid), 'sm', true), el('div', { class: 'grow' }, el('b', { text: LC.uname(r.uid) }), el('div', { class: 'muted small', text: LC.ago(r.ts) + (r.note ? ' · “' + r.note + '”' : '') })),
      el('button', { class: 'primary sm', text: t('tm_approve'), onclick: () => decide(r.uid, true) }), el('button', { class: 'secondary sm', text: t('tm_deny'), onclick: () => decide(r.uid, false) }))));
  }
  async function manageChannels(tm) {
    const { channels } = await LC.api('/api/teams/get?id=' + encodeURIComponent(tm.id)), hid = new Set(TM.prefs.hidden || []);
    const rows = channels.sort((a, b) => (b.general ? 1 : 0) - (a.general ? 1 : 0) || a.name.localeCompare(b.name)).map((c) => {
      const local = S.channels.get(c.id);
      return el('tr', {}, el('td', {}, el('div', { class: 'rowline' }, c.private ? LC.icon('lock_closed', { label: t('tm_privateChan') }) : c.shared ? LC.icon('channel_share', { label: t('tm_sharedChan') }) : LC.icon('channel'), c.canSee ? el('button', { class: 'link', text: c.name, onclick: () => LC.openChat(c.id) }) : el('span', { text: c.name }), c.kind === 'posts' ? U.pill(t('tm_postsChan')) : null)),
        el('td', { class: 'small muted', text: c.description || '' }),
        el('td', {}, c.canSee && !c.general ? U.toggle(t('tm_showForMe'), !hid.has(c.id), (v) => hide({ chan: c.id, hidden: !v })) : null),
        el('td', {}, local ? LC.ibtn('more_horizontal', t('tm_chanOptions', { name: c.name }), (e) => LC.menu(e.currentTarget, chanItems(local)), { menu: true }) : null));
    });
    return el('div', {}, canAddChannel(tm) ? el('div', { class: 'acts' }, el('button', { class: 'primary sm withicon', onclick: () => channelDialog(tm) }, LC.icon('channel_add'), el('span', { text: t('tm_addChannel') }))) : null,
      el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, el('thead', {}, el('tr', {}, el('th', { text: t('name') }), el('th', { text: t('tm_description') }), el('th', { text: t('tm_showForMe') }), el('th', {}, el('span', { class: 'sr-only', text: t('actions') })))), el('tbody', {}, rows))));
  }
  function manageSettings(tm) {
    const s = settingsOf(tm), set = (patch) => LC.api('/api/teams/update', { id: tm.id, ...patch }).then(() => LC.toast(t('tm_saved'), { ms: 1200 })).catch((e) => { U.fail(e); refreshManage(); });
    const name = el('input', { value: tm.name, maxlength: 60, 'aria-label': t('tm_teamName') }), desc = el('textarea', { maxlength: 1000, rows: 3, 'aria-label': t('tm_description') }); desc.value = tm.description || '';
    const tg = (k) => U.toggle(t('tm_s_' + k), s[k], (v) => set({ settings: { [k]: v } }));
    const labels = TM.cfg.labels || [], code = tm.code || '';
    return el('div', { class: 'tm-settings' },
      el('h3', { text: t('tm_aboutTeam') }), U.group(t('tm_picture'), U.pictureInput(tm.picture || '', (v) => set({ picture: v }))), U.field(t('tm_teamName'), name), U.field(t('tm_description'), desc),
      el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('save'), onclick: () => set({ name: name.value, description: desc.value }) })),
      U.group(t('tm_privacy'), U.radios('tm-vis2', [['private', t('tm_private'), t('tm_privateHint')], ['public', t('tm_public'), t('tm_publicHint')]], tm.visibility, (v) => set({ visibility: v }), t('tm_privacy'))),
      labels.length ? U.field(t('tm_label'), U.select([['', t('tm_noLabel')], ...labels.map((l) => [l.id, l.name])], tm.label || '', (v) => set({ label: v }), t('tm_label'))) : null,
      el('h3', { text: t('tm_teamCode') }), el('p', { class: 'muted small', text: code ? t('tm_teamCodeHint') : t('tm_noCode') }),
      el('div', { class: 'rowline' }, code ? el('code', { class: 'tm-code', text: code }) : null, code ? el('button', { class: 'secondary sm', text: t('tm_copy'), onclick: async () => LC.toast((await LC.copy(code)) ? t('copied') : code, { ms: 1500 }) }) : null,
        el('button', { class: 'secondary sm', text: t('tm_generate'), onclick: () => LC.api('/api/teams/code', { id: tm.id }).then(refreshManage).catch(U.fail) }), code ? el('button', { class: 'secondary sm', text: t('tm_removeCode'), onclick: () => LC.api('/api/teams/code', { id: tm.id, off: true }).then(refreshManage).catch(U.fail) }) : null),
      el('h3', { text: t('tm_memberPerms') }), ...['memberCreateChannels', 'memberCreatePrivate', 'memberDeleteChannels', 'memberAddApps', 'memberAddMembers', 'memberManageTags'].map(tg),
      el('h3', { text: t('tm_guestPerms') }), ...['guestCreateChannels', 'guestDeleteChannels'].map(tg),
      el('h3', { text: t('tm_mentions') }), ...['mentionTeam', 'mentionChannel'].map(tg),
      el('h3', { text: t('tm_fun') }), tg('stickers'),
      el('h3', { text: t('tm_discover') }), tg('discoverable'));
  }
  async function manageAnalytics(tm, days = TM.statDays || 30) {
    const s = await LC.api(`/api/teams/stats?team=${encodeURIComponent(tm.id)}&days=${days}`);
    return el('div', {}, el('div', { class: 'acts' }, U.select([[7, t('tm_range7')], [30, t('tm_range30')], [90, t('tm_range90')]], days, (v) => { TM.statDays = Number(v); refreshManage(); }, t('tm_range30'))), statsView(s));
  }
  function manageTags(tm) { return tagsPanel(tm); }
  // tags: team tags (team owners, or members when allowed) and session-wide tags (admins, from Manage › Teams)
  function tagsPanel(tm) {
    const can = tm ? canOwn(tm) || (settingsOf(tm).memberManageTags && !isGuest()) : LC.isAdmin(), box = el('div');
    const mine = () => TM.tags.filter((g) => (g.team || '') === (tm ? tm.id : ''));
    const draw = () => {
      const list = mine();
      U.set(box, el('p', { class: 'muted small', text: t('tm_tagsHint') }), list.length ? el('div', {}, list.map((g) => el('div', { class: 'req tm-tagrow' }, LC.icon('tag'), el('div', { class: 'grow' }, el('b', { text: '@' + g.name }), el('div', { class: 'muted small', text: g.members.map(LC.uname).join(', ') || '—' })),
        can ? el('button', { class: 'secondary sm', text: t('tm_editTag'), onclick: () => editTag(g) }) : null, can ? LC.ibtn('delete', t('tm_deleteTag') + ' @' + g.name, () => LC.api('/api/teams/tags', { op: 'delete', id: g.id }).then((r) => { TM.tags = TM.tags.filter((x) => x.id !== g.id); draw(); return r; }).catch(U.fail)) : null))) : el('p', { class: 'muted', text: t('tm_noTags') }),
        can ? el('div', { class: 'acts' }, el('button', { class: 'primary sm withicon', onclick: () => editTag(null) }, LC.icon('add'), el('span', { text: t('tm_newTag') }))) : null);
    };
    const editTag = (g) => {
      const name = el('input', { value: g ? g.name : '', maxlength: 30, 'aria-label': t('tm_tagName'), placeholder: 'designers' }), pick = U.people({ value: g ? g.members : [], self: true, filter: tm ? (u) => (tm.members || []).includes(u.id) || (tm.guests || []).includes(u.id) : null });
      U.set(box, U.field(t('tm_tagName'), name), U.group(t('tm_tagMembers', { name: g ? g.name : '…' }), pick.el), el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('cancel'), onclick: draw }),
        el('button', { class: 'primary sm', text: t('save'), onclick: async () => { try { const r = await LC.api('/api/teams/tags', { op: g ? 'update' : 'add', id: g ? g.id : undefined, team: tm ? tm.id : '', name: name.value, members: pick.value() }); TM.tags = [...TM.tags.filter((x) => x.id !== r.tag.id), r.tag]; draw(); } catch (e) { U.fail(e); } } })));
      name.focus();
    };
    draw(); return box;
  }
  TM.tagsPanel = tagsPanel;

  // ---------- composer: @tags, @team, @channel ----------
  LC.ext.mentionSources.push((q, chan) => {
    if (!chan || isGuest()) return []; const c = S.channels.get(chan), tm = c && c.team ? TM.teams.get(c.team) : null, out = [], f = (q || '').toLowerCase();
    for (const g of TM.tags) if ((g.team ? tm && g.team === tm.id : !tm) && g.name.startsWith(f)) out.push({ label: '@' + g.name + ' — ' + t('tm_tagHint', { n: g.members.length }), insert: '@' + g.name + ' ', icon: 'tag' });
    if (c && !chan.startsWith('dm:')) {
      const s = settingsOf(tm), ok = (k) => LC.isAdmin() || (tm ? canOwn(tm) || s[k] : S.settings.membersCanEveryone);
      if (tm && 'team'.startsWith(f) && ok('mentionTeam')) out.push({ label: '@team — ' + t('tm_mentionTeam'), insert: '@team ', icon: 'people_team' });
      if ('channel'.startsWith(f) && ok('mentionChannel')) out.push({ label: '@channel — ' + t('tm_mentionChannel'), insert: '@channel ', icon: 'channel' });
    }
    return out;
  });

  // ---------- post in several channels at once ----------
  const also = new WeakMap(); // composer api -> [chan ids]
  const postable = (c) => !c.members || c.team ? !c.readonly || LC.isAdmin() : true;
  LC.ext.composerMore.push((composer) => {
    const chan = composer.cfg.chan(); if (!chan || chan.startsWith('dm:') || composer.cfg.thread()) return [];
    return [{ icon: 'chat_multiple', label: t('tm_alsoPost'), fn: () => pickChannels(composer, chan) }];
  });
  function pickChannels(composer, chan) {
    const cur = new Set(also.get(composer) || []);
    const cands = [...S.channels.values()].filter((c) => c.id !== chan && !c.id.startsWith('dm:') && c.kind !== 'group' && c.kind !== 'meeting' && (c.team || !c.members) && postable(c) && !(c.team && (TM.teams.get(c.team) || {}).archived));
    const label = (c) => (c.team ? ((TM.teams.get(c.team) || {}).name || '') + ' › ' + c.name : '# ' + c.name);
    const list = el('div', { class: 'people' }, cands.sort((a, b) => label(a).localeCompare(label(b))).map((c) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: cur.has(c.id), onchange: (e) => (e.target.checked ? cur.add(c.id) : cur.delete(c.id)) }), LC.chatLead(c.id, 'sm'), el('span', { text: label(c) }))));
    LC.modal([el('h2', {}, LC.icon('chat_multiple'), ' ' + t('tm_pickChannels')), el('p', { class: 'muted small', text: t('tm_pickChannelsHint') }), list,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('tm_clear'), onclick: () => { also.delete(composer); LC.closeModal(); composer.renderBanner(); } }), el('button', { class: 'primary', text: t('tm_done'), onclick: () => { if (cur.size) also.set(composer, [...cur].slice(0, 10)); else also.delete(composer); LC.closeModal(); composer.renderBanner(); } }))]);
  }
  LC.ext.composerBanner.push((chan, composer) => {
    const list = composer && also.get(composer); if (!list || !list.length) return null;
    const names = list.map((id) => { const c = S.channels.get(id); return c ? (c.team ? c.name : '#' + c.name) : null; }).filter(Boolean);
    return el('div', { class: 'tm-banner' }, LC.icon('chat_multiple'), el('span', { class: 'grow', text: t('tm_alsoPostIn', { list: names.join(', ') }) }), LC.ibtn('dismiss', t('tm_clear'), () => { also.delete(composer); composer.renderBanner(); }));
  });
  LC.ext.beforeSend.push((body, composer) => { const list = also.get(composer); if (list && list.length && !body.thread && !body.sendAt) { body.tmAlso = list; also.delete(composer); setTimeout(() => composer.renderBanner(), 0); } });
  LC.ext.msgParts.push((m) => {
    if (!m.xpost || !Array.isArray(m.xpost.chans) || m.xpost.chans.length < 2) return null;
    const others = m.xpost.chans.filter((c) => c !== m.chan && S.channels.has(c));
    return el('div', { class: 'tm-xpost small muted' }, LC.icon('chat_multiple'), ' ' + t('tm_postedIn', { n: m.xpost.chans.length }) + (others.length ? ' · ' + t('tm_alsoIn') + ' ' : ''),
      ...others.flatMap((c, i) => [i ? ', ' : '', el('button', { class: 'link', text: LC.chanInfo(c).longTitle || LC.chanInfo(c).title, onclick: () => LC.openChat(c) })]));
  });
})();
