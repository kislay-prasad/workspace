'use strict';
// Admin and security in the Manage dialog (section 24): Teams (all teams, who can create, naming and expiry rules,
// session-wide tags), Policies (messaging, meetings, bad words, sensitivity labels, information barriers), Reports
// (inbox of concerns), Usage (people, messages, calls, files; call quality), Compliance (activity log, legal hold,
// export). Sections in People (bulk add, invites) and Settings (branded lobby, PIN sign-in); extra items in each
// person's Actions menu (guest ↔ member, channel access, devices, PIN reset, legal hold, export).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), U = LC.tmUi;
  LC.addEvents('tm_reports');
  LC.addStrings('en', {
    tm_admTeams: 'Teams', tm_admPolicies: 'Policies', tm_admReports: 'Reports', tm_admUsage: 'Usage', tm_admCompliance: 'Compliance',
    tm_allTeams: 'All teams', tm_noTeamsYet: 'No teams yet.', tm_colTeam: 'Team', tm_colOwners: 'Owners', tm_colPeople: 'People', tm_colChannels: 'Channels', tm_colLabel: 'Label', tm_colActive: 'Last activity', tm_colStatus: 'Status',
    tm_stActiveT: 'Active', tm_stExpiring: 'Expiring', tm_teamActions: 'Actions for {name}', tm_makeOwnerOf: 'Add an owner…', tm_pickOwner: 'New owner for {name}', tm_whoCreates: 'Who can create teams', tm_createEveryone: 'Everyone (not guests)', tm_createAdmins: 'Only admins',
    tm_naming: 'Team naming', tm_namingHelp: 'A prefix or suffix is added to every new team name; blocked words are refused (admins are exempt).', tm_prefix: 'Prefix', tm_suffix: 'Suffix', tm_blockedWords: 'Blocked words (one per line)',
    tm_expiryT: 'Team expiry', tm_expiryHelp: 'Teams nobody uses are archived. Owners get a warning first and can renew the team.', tm_expireAfter: 'Archive teams unused for', tm_never: 'Never', tm_daysN: '{n} days', tm_warnBefore: 'Warn owners this many days before',
    tm_msgRules: 'Messaging rules', tm_ruleEdit: 'People can edit sent messages', tm_ruleDelete: 'People can delete sent messages', tm_ruleMinutes: 'Time limit for editing and deleting (minutes, 0 = none)', tm_ruleStickers: 'Stickers', tm_ruleMemes: 'Memes', tm_ruleGifs: 'GIFs', tm_adminsExempt: 'Admins and the host are exempt.',
    tm_meetRules: 'Meeting rules', tm_whoRecord: 'Who can record', tm_whoPresent: 'Who can present', tm_rEveryone: 'Everyone', tm_rOrganizers: 'Organizers only', tm_rNobody: 'Nobody', tm_lobbyBypass: 'Who can bypass the lobby', tm_lbEveryone: 'Everyone, guests too', tm_lbMembers: 'People in this session (guests wait)', tm_lbInvited: 'People who were invited', tm_lbOrganizer: 'Only the organizer',
    tm_maxPeople: 'Maximum people per call (0 = default)', tm_watermark: 'Watermark on shared screens', tm_badWords: 'Bad-word filter', tm_bwOn: 'Filter these words (whole words, any case)', tm_bwBlock: 'Block the message and explain why', tm_bwReplace: 'Replace the word with ***', tm_bwHelp: 'Also applies to channel, team and tag names (always blocked there).',
    tm_labels: 'Sensitivity labels', tm_labelsHelp: 'Owners set a label on a team or channel; it shows in the chat header. Confidential: messages can’t be forwarded outside the team and files get no “anyone” links. Highly confidential: also no guests.',
    tm_lvl0: 'General', tm_lvl1: 'Confidential', tm_lvl2: 'Highly confidential', tm_addLabel: 'Add label', tm_labelName: 'Label name', tm_labelColor: 'Colour', tm_labelLevel: 'Protection', tm_labelDesc: 'Description',
    tm_barriers: 'Information barriers', tm_barriersHelp: 'Stop chosen groups from chatting: people in two blocked segments can’t start 1:1 or group chats or calls with each other, and don’t see each other in pickers.', tm_ibOn: 'Turn on information barriers', tm_segments: 'Segments', tm_addSegment: 'Add segment', tm_segName: 'Segment name', tm_blockPairs: 'Blocked pairs', tm_addBlock: 'Block', tm_cantTalk: '{a} can’t talk to {b}', tm_save: 'Save', tm_peopleIn: 'People in {name}',
    tm_reportsInbox: 'Reports inbox', tm_showAll: 'Show handled reports', tm_noReports: 'Nothing has been reported.', tm_reportedBy: '{who} reported {whom}', tm_openCtx: 'Open in chat', tm_delMsg: 'Delete message', tm_timeout1h: 'Time out 1 hour', tm_removePerson: 'Remove person', tm_dismiss: 'Dismiss', tm_reopen: 'Reopen',
    tm_r_harassment: 'Harassment or bullying', tm_r_spam: 'Spam', tm_r_hate: 'Hate speech', tm_r_violence: 'Violence or threats', tm_r_inappropriate: 'Inappropriate content', tm_r_privacy: 'Private information', tm_r_other: 'Something else', tm_msgGone: 'The message was deleted.', tm_handled: '{what} by {who}', tm_personReport: 'A person was reported (no message).',
    tm_usage: 'Usage', tm_ppl: 'People', tm_activeDay: 'Active people per day', tm_msgsDay: 'Messages per day', tm_callsDay: 'Calls per day', tm_filesDay: 'Files per day', tm_minutes: 'Call minutes', tm_storage: 'Storage', tm_calls: 'Calls', tm_files: 'Files', tm_csv: 'Download CSV',
    tm_cq: 'Call quality', tm_cqEmpty: 'No call data yet. Calls appear here after they end (people can rate them, and the app measures the network).', tm_avgMin: 'Average minutes', tm_avgPeople: 'Average people', tm_rating: 'Rating', tm_rtt: 'Round trip', tm_loss: 'Packet loss', tm_jitter: 'Jitter', tm_poor: 'Poor calls', tm_recentCalls: 'Recent calls', tm_when: 'When', tm_where: 'Where',
    tm_audit: 'Activity log', tm_auditHelp: 'Admin actions: who did what and when.', tm_anyone: 'Anyone', tm_anyAction: 'Any action', tm_fromDate: 'From', tm_toDate: 'To', tm_noEntries: 'No entries.', tm_colWho: 'Who', tm_colAction: 'Action', tm_colDetails: 'Details', tm_colTime: 'Time',
    tm_hold: 'Legal hold', tm_holdHelp: 'Messages from a person on hold can’t be removed by clean-up, timers or channel deletion; their edits and deletions keep the original here.', tm_putHold: 'Put on hold', tm_holdNote: 'Reason (optional)', tm_noHolds: 'Nobody is on hold.', tm_viewHeld: 'View held items', tm_releaseHold: 'Remove hold', tm_heldItems: 'Held items for {name}', tm_noHeld: 'No edited or deleted messages kept yet.', tm_since: 'since {when}',
    tm_export: 'Export a person’s messages', tm_exportHelp: 'A zip with their messages (JSON and a readable page), held originals and the files in their messages.', tm_download: 'Download', tm_pickPerson: 'Pick a person', tm_ownerOnlyPart: 'Only the host can use legal hold and export.',
    tm_bulk: 'Bulk add people', tm_bulkHelp: 'Upload a CSV file with columns name, role (member or guest), job title, department — or paste lines. Each person gets a one-time invite code (or their name is pre-approved), so they join without waiting.', tm_csvFile: 'CSV file', tm_orPaste: 'Or paste: one person per line',
    tm_modeCodes: 'One-time invite codes', tm_modeNames: 'Pre-approved names (anyone using the name gets in — less safe)', tm_validFor: 'Valid for', tm_create2: 'Create invites', tm_preview: '{n} people', tm_created: 'Created {n}', tm_skipped: 'Skipped {name}: {why}', tm_downloadCodes: 'Download codes (CSV)', tm_invites: 'Invitations', tm_noInvites: 'No invitations.', tm_revoke: 'Revoke', tm_revokeAll: 'Revoke unused',
    tm_used: 'Used', tm_expired: 'Expired', tm_waiting: 'Not used yet', tm_inviteLink: 'Invite link', tm_code: 'Code',
    tm_brandT: 'Branded lobby', tm_brandHelp: 'Your logo, colour and welcome text on the sign-in screen, the “waiting for approval” screen and the meeting lobby.', tm_logo: 'Logo', tm_brandColor: 'Colour', tm_welcome: 'Welcome text', tm_brandPreview: 'Preview', tm_clearBrand: 'Remove branding',
    tm_pinPolicy: 'Sign-in with a PIN', tm_pinPolicyOn: 'A correct PIN (and authenticator code) lets existing accounts sign in on a new device without waiting for approval', tm_pinPolicyHelp: 'People set a PIN in Settings › Security. Without this, the PIN is asked in addition to your approval.',
    tm_makeGuest: 'Make guest', tm_makeMember: 'Make member', tm_guestChans: 'Channel access…', tm_guestChansT: 'Channels {name} can see', tm_guestChansHelp: 'Guests only see the teams and chats they are added to. Pick session-wide channels they may see too.',
    tm_devices: 'Signed-in devices…', tm_devicesT: 'Signed-in devices: {name}', tm_signOut: 'Sign out', tm_signOutAll: 'Sign out everywhere', tm_first: 'First seen {when}', tm_last: 'last seen {when}', tm_thisDevice: 'This device', tm_noDevices: 'Not signed in anywhere.',
    tm_resetPin: 'Reset sign-in PIN', tm_holdOn: 'Put on legal hold', tm_holdOff: 'Remove legal hold', tm_exportMsgs: 'Export messages', tm_pinPill: 'PIN', tm_bot: 'Bot', tm_heldPill: 'On hold', tm_confirmResetPin: 'Remove {name}’s sign-in PIN? They can set a new one.',
    tm_a_report: 'reported a concern', tm_policySaved: 'Saved', tm_none: '—',
  });
  LC.addStrings('hi', { tm_admTeams: 'टीमें', tm_admPolicies: 'नीतियाँ', tm_admReports: 'रिपोर्ट', tm_admUsage: 'उपयोग', tm_admCompliance: 'अनुपालन', tm_save: 'सहेजें', tm_dismiss: 'ख़ारिज करें' });
  LC.addStrings('es', { tm_admTeams: 'Equipos', tm_admPolicies: 'Directivas', tm_admReports: 'Informes', tm_admUsage: 'Uso', tm_admCompliance: 'Cumplimiento', tm_save: 'Guardar', tm_dismiss: 'Descartar' });

  const A = (LC.tmAdmin = { reportsOpen: 0 });
  const owner = () => LC.isOwner();
  const fmtDate = (ts) => (ts ? LC.fmtDateTime(ts) : t('tm_none'));
  const refresh = (k) => LC.adminTabsApi && LC.adminTabsApi.show(k);
  const save = (patch, k) => LC.api('/api/tm/admin/policies', patch).then(() => LC.toast(t('tm_policySaved'), { ms: 1200 })).catch((e) => { U.fail(e); if (k) refresh(k); });
  const sec = (title, help, ...kids) => el('section', { class: 'tm-sec' }, el('h3', { text: title }), help ? el('p', { class: 'muted small', text: help }) : null, ...kids);
  const num = (value, min, max, label) => el('input', { type: 'number', min, max, value: String(value ?? 0), 'aria-label': label, class: 'tm-num' });
  const table = (heads, rows, cls = '') => el('div', { class: 'tablewrap' }, el('table', { class: 'table small ' + cls }, el('thead', {}, el('tr', {}, heads.map((h) => el('th', { text: h })))), el('tbody', {}, rows)));
  const people = () => [...S.users.values()].filter((u) => !u.deleted && !u.bot && !u.barrier).sort((a, b) => a.name.localeCompare(b.name));
  const personSelect = (label, value = '', filter) => U.select([['', t('tm_pickPerson')], ...people().filter((u) => !filter || filter(u)).map((u) => [u.id, u.name])], value, null, label);
  const fileLink = (href, text) => el('a', { class: 'secondary sm btn', href, download: '' }, LC.icon('arrow_download'), ' ' + text);
  const tok = () => encodeURIComponent(S.token);

  LC.on('init', (d) => { A.reportsOpen = d.tmReportsOpen || 0; });
  LC.on('tm_reports', (e) => { A.reportsOpen = e.open || 0; LC.renderRail(); });
  const baseManageBadge = LC.ext.panes.manage && LC.ext.panes.manage.badge;
  if (LC.ext.panes.manage) LC.ext.panes.manage.badge = () => (baseManageBadge ? baseManageBadge() || 0 : 0) + (LC.isAdmin() ? A.reportsOpen : 0);

  // the Manage dialog gets a Teams-admin-center style side list of tabs (it has many tabs now)
  const baseAdmin = LC.adminPanel;
  LC.adminPanel = (...a) => { const r = baseAdmin(...a); const card = $('#modal .card'); if (card) { card.classList.add('tm-admin'); const bar = card.querySelector('.tabsbar'); if (bar) bar.setAttribute('aria-label', t('manage')); } return r; };

  // ---------- Teams ----------
  async function teamsTab() {
    const [{ teams }, p] = await Promise.all([LC.api('/api/tm/admin/teams'), LC.api('/api/tm/admin/policies')]);
    const act = (id, action, extra) => LC.api('/api/tm/admin/teams/act', { id, action, ...extra }).then(() => refresh('tm_teams')).catch(U.fail);
    const status = (x) => (x.archived ? U.pill(t('tm_archived') + (x.archivedWhy === 'expired' ? ' · ' + t('tm_expired') : ''), 'warn') : x.warned ? U.pill(t('tm_stExpiring'), 'warn') : U.pill(t('tm_stActiveT'), 'ok'));
    const rows = teams.sort((a, b) => a.name.localeCompare(b.name)).map((x) => el('tr', {},
      el('td', {}, el('div', { class: 'rowline' }, U.tile(x, 'sm'), el('div', {}, el('b', { text: x.name }), el('div', { class: 'muted', text: x.visibility === 'public' ? t('tm_public') : t('tm_private') })))),
      el('td', { text: x.owners.map((i) => LC.realName(i)).join(', ') || t('tm_none') }), el('td', { text: `${x.members}${x.guests ? ' + ' + x.guests + ' ' + t('role_guest').toLowerCase() : ''}` }), el('td', { text: String(x.channels) }),
      el('td', {}, U.select([['', t('tm_noLabel')], ...(p.labels || []).map((l) => [l.id, l.name])], x.label, (v) => act(x.id, 'label', { label: v }), t('tm_colLabel') + ' ' + x.name)),
      el('td', { text: LC.ago(x.active) }), el('td', {}, status(x)),
      el('td', {}, LC.ibtn('more_horizontal', t('tm_teamActions', { name: x.name }), (e) => LC.menu(e.currentTarget, [
        { icon: x.archived ? 'archive_arrow_back' : 'archive', label: x.archived ? t('tm_restore') : t('tm_archive'), fn: () => act(x.id, x.archived ? 'restore' : 'archive') },
        { icon: 'person_add', label: t('tm_makeOwnerOf'), fn: () => pickOwner(x) },
        'sep', { icon: 'delete', label: t('tm_deleteTeam'), danger: true, fn: async () => { if (await LC.confirm(t('tm_confirmDelete', { name: x.name }), { danger: true, ok: t('delete') })) act(x.id, 'delete'); } }]), { menu: true }))));
    const pickOwner = (x) => { const sel = personSelect(t('tm_pickOwner', { name: x.name }), '', (u) => u.role !== 'guest'); LC.modal([el('h2', { text: t('tm_pickOwner', { name: x.name }) }), sel, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('tm_teams') }), el('button', { class: 'primary', text: t('tm_save'), onclick: () => sel.value && LC.api('/api/tm/admin/teams/act', { id: x.id, action: 'owner', uid: sel.value }).then(() => LC.adminPanel('tm_teams')).catch(U.fail) }))]); };
    const pre = el('input', { value: p.naming.prefix || '', maxlength: 20, 'aria-label': t('tm_prefix') }), suf = el('input', { value: p.naming.suffix || '', maxlength: 20, 'aria-label': t('tm_suffix') }), blocked = el('textarea', { rows: 3, 'aria-label': t('tm_blockedWords') }); blocked.value = (p.naming.blocked || []).join('\n');
    const days = num(p.expiry.days, 0, 3650, t('tm_expireAfter')), warn = num(p.expiry.warnDays, 1, 90, t('tm_warnBefore'));
    return el('div', {},
      sec(t('tm_allTeams'), '', teams.length ? table([t('tm_colTeam'), t('tm_colOwners'), t('tm_colPeople'), t('tm_colChannels'), t('tm_colLabel'), t('tm_colActive'), t('tm_colStatus'), ''], rows) : el('p', { class: 'muted', text: t('tm_noTeamsYet') })),
      sec(t('tm_whoCreates'), '', U.select([['everyone', t('tm_createEveryone')], ['admins', t('tm_createAdmins')]], p.teamCreate, (v) => save({ teamCreate: v }), t('tm_whoCreates'))),
      sec(t('tm_naming'), t('tm_namingHelp'), el('div', { class: 'rowline' }, U.field(t('tm_prefix'), pre), U.field(t('tm_suffix'), suf)), U.field(t('tm_blockedWords'), blocked), el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ naming: { prefix: pre.value, suffix: suf.value, blocked: blocked.value } }, 'tm_teams') }))),
      sec(t('tm_expiryT'), t('tm_expiryHelp'), el('div', { class: 'rowline' }, U.field(t('tm_expireAfter') + ' (' + t('tm_daysN', { n: '…' }) + ', 0 = ' + t('tm_never') + ')', days), U.field(t('tm_warnBefore'), warn)), el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ expiry: { days: Number(days.value), warnDays: Number(warn.value) } }, 'tm_teams') }))),
      sec(t('tm_sessionTags'), '', LC.tm.tagsPanel(null)));
  }

  // ---------- Policies ----------
  async function policiesTab() {
    const p = await LC.api('/api/tm/admin/policies'), mr = { ...p.messagingRules }, mt = { ...p.meetingRules }, bw = { ...p.badwords };
    const minutes = num(mr.editMinutes, 0, 525600, t('tm_ruleMinutes'));
    const msg = sec(t('tm_msgRules'), t('tm_adminsExempt'), ...['edit', 'delete'].map((k) => U.toggle(t(k === 'edit' ? 'tm_ruleEdit' : 'tm_ruleDelete'), mr[k], (v) => { mr[k] = v; })), U.field(t('tm_ruleMinutes'), minutes),
      el('div', { class: 'rowline' }, ...[['stickers', 'tm_ruleStickers'], ['memes', 'tm_ruleMemes'], ['gifs', 'tm_ruleGifs']].map(([k, l]) => U.toggle(t(l), mr[k], (v) => { mr[k] = v; }))),
      el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ messagingRules: { ...mr, editMinutes: Number(minutes.value) } }, 'tm_policies') })));
    const max = num(mt.maxPeople, 0, 1000, t('tm_maxPeople'));
    const meet = sec(t('tm_meetRules'), '', el('div', { class: 'tm-cols' },
      U.field(t('tm_whoRecord'), U.select([['everyone', t('tm_rEveryone')], ['organizers', t('tm_rOrganizers')], ['nobody', t('tm_rNobody')]], mt.record, (v) => { mt.record = v; }, t('tm_whoRecord'))),
      U.field(t('tm_whoPresent'), U.select([['everyone', t('tm_rEveryone')], ['organizers', t('tm_rOrganizers')]], mt.present, (v) => { mt.present = v; }, t('tm_whoPresent'))),
      U.field(t('tm_lobbyBypass'), U.select([['everyone', t('tm_lbEveryone')], ['members', t('tm_lbMembers')], ['invited', t('tm_lbInvited')], ['organizer', t('tm_lbOrganizer')]], mt.lobby, (v) => { mt.lobby = v; }, t('tm_lobbyBypass'))), U.field(t('tm_maxPeople'), max)),
      U.toggle(t('tm_watermark'), mt.watermark, (v) => { mt.watermark = v; }), el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ meetingRules: { ...mt, maxPeople: Number(max.value) } }, 'tm_policies') })));
    const words = el('textarea', { rows: 4, 'aria-label': t('tm_bwOn') }); words.value = (bw.words || []).join('\n');
    const bad = sec(t('tm_badWords'), t('tm_bwHelp'), U.toggle(t('tm_bwOn'), bw.on, (v) => { bw.on = v; }), words, U.radios('tm-bw', [['block', t('tm_bwBlock')], ['replace', t('tm_bwReplace')]], bw.action, (v) => { bw.action = v; }, t('tm_badWords')),
      el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ badwords: { on: bw.on, action: bw.action, words: words.value } }, 'tm_policies') })));
    return el('div', {}, msg, meet, bad, labelsSec(p), barriersSec(p));
  }
  function labelsSec(p) {
    const list = (p.labels || []).map((l) => ({ ...l })), box = el('div');
    const draw = () => U.set(box, list.map((l, i) => el('div', { class: 'tm-labelrow' },
      el('input', { value: l.name, maxlength: 40, 'aria-label': t('tm_labelName'), oninput: (e) => { l.name = e.target.value; } }),
      el('input', { type: 'color', value: l.color, 'aria-label': t('tm_labelColor'), oninput: (e) => { l.color = e.target.value; } }),
      U.select([[0, t('tm_lvl0')], [1, t('tm_lvl1')], [2, t('tm_lvl2')]], l.level, (v) => { l.level = Number(v); }, t('tm_labelLevel')),
      el('input', { value: l.desc || '', maxlength: 140, placeholder: t('tm_labelDesc'), 'aria-label': t('tm_labelDesc'), oninput: (e) => { l.desc = e.target.value; } }),
      LC.ibtn('delete', t('delete') + ' ' + l.name, () => { list.splice(i, 1); draw(); }))), el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => { list.push({ id: '', name: '', color: '#616161', level: 0, desc: '' }); draw(); } }, LC.icon('add'), el('span', { text: t('tm_addLabel') })), el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ labels: list }, 'tm_policies') })));
    draw(); return sec(t('tm_labels'), t('tm_labelsHelp'), box);
  }
  function barriersSec(p) {
    const b = { on: p.barriers.on, segments: p.barriers.segments.map((x) => ({ ...x, members: [...x.members] })), blocks: p.barriers.blocks.map((x) => [...x]) }, box = el('div');
    const name = (id) => (b.segments.find((x) => x.id === id) || {}).name || '?';
    const draw = () => {
      const a = U.select(b.segments.map((x) => [x.id, x.name]), b.segments[0] ? b.segments[0].id : '', null, t('tm_segName')), c = U.select(b.segments.map((x) => [x.id, x.name]), b.segments[1] ? b.segments[1].id : '', null, t('tm_segName'));
      U.set(box, U.toggle(t('tm_ibOn'), b.on, (v) => { b.on = v; }), el('h4', { text: t('tm_segments') }),
        ...b.segments.map((sg, i) => { const pick = U.people({ value: sg.members, self: true }); sg.pick = pick; return el('details', { class: 'tm-details tm-seg' }, el('summary', {}, el('b', { text: sg.name }), ' · ' + U.members(sg.members.length)), el('div', { class: 'rowline' }, el('input', { value: sg.name, maxlength: 40, 'aria-label': t('tm_segName'), oninput: (e) => { sg.name = e.target.value; } }), LC.ibtn('delete', t('delete') + ' ' + sg.name, () => { b.segments.splice(i, 1); b.blocks = b.blocks.filter((x) => !x.includes(sg.id)); draw(); })), U.group(t('tm_peopleIn', { name: sg.name }), pick.el)); }),
        el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => { collect(); b.segments.push({ id: Math.random().toString(36).slice(2, 10), name: t('tm_segName') + ' ' + (b.segments.length + 1), members: [] }); draw(); } }, LC.icon('add'), el('span', { text: t('tm_addSegment') }))),
        el('h4', { text: t('tm_blockPairs') }), b.blocks.length ? el('ul', { class: 'plainlist' }, b.blocks.map((x, i) => el('li', {}, LC.icon('prohibited'), ' ' + t('tm_cantTalk', { a: name(x[0]), b: name(x[1]) }), LC.ibtn('dismiss', t('tm_remove'), () => { b.blocks.splice(i, 1); draw(); })))) : el('p', { class: 'muted small', text: t('tm_none') }),
        b.segments.length > 1 ? el('div', { class: 'rowline' }, a, c, el('button', { class: 'secondary sm', text: t('tm_addBlock'), onclick: () => { collect(); if (a.value && c.value && a.value !== c.value) b.blocks.push([a.value, c.value]); draw(); } })) : null,
        el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => { collect(); save({ barriers: { on: b.on, segments: b.segments.map(({ id, name: n, members }) => ({ id, name: n, members })), blocks: b.blocks } }, 'tm_policies'); } })));
    };
    const collect = () => { for (const sg of b.segments) if (sg.pick) sg.members = sg.pick.value(); };
    draw(); return sec(t('tm_barriers'), t('tm_barriersHelp'), box);
  }

  // ---------- Reports ----------
  async function reportsTab() {
    const { reports, open } = await LC.api('/api/tm/admin/reports' + (A.showAll ? '?all=1' : '')); A.reportsOpen = open; LC.renderRail();
    const act = (r, action) => LC.api('/api/tm/admin/reports/act', { id: r.id, action }).then(() => refresh('tm_reports')).catch(U.fail);
    const card = (r) => el('div', { class: 'tm-report' + (r.status !== 'open' ? ' done' : '') },
      el('div', { class: 'row-between' }, el('div', { class: 'rowline' }, LC.icon('flag'), el('b', { text: t('tm_reportedBy', { who: r.byName, whom: r.userName }) }), U.pill(t('tm_r_' + r.reason))), el('span', { class: 'muted small', text: LC.ago(r.ts) })),
      r.note ? el('p', { class: 'small', text: '“' + r.note + '”' }) : null,
      r.snapshot ? el('blockquote', { class: 'tm-snap' }, el('div', { class: 'muted small', text: r.where + ' · ' + fmtDate(r.snapshot.ts) }), el('div', { text: r.snapshot.text || r.snapshot.card || (r.snapshot.files || []).join(', ') }), r.msgGone ? el('div', { class: 'muted small', text: t('tm_msgGone') }) : null) : el('p', { class: 'muted small', text: t('tm_personReport') }),
      r.status === 'open' ? el('div', { class: 'acts' },
        r.canOpen ? el('button', { class: 'secondary sm', text: t('tm_openCtx'), onclick: () => { LC.closeModal(); LC.jumpToMessage(r.chan, r.msg); } }) : null,
        r.msg && !r.msgGone ? el('button', { class: 'secondary sm danger', text: t('tm_delMsg'), onclick: () => act(r, 'delete') }) : null,
        el('button', { class: 'secondary sm', text: t('tm_timeout1h'), onclick: () => LC.api('/api/admin/user/mute', { id: r.user, minutes: 60 }).then(() => LC.api('/api/tm/admin/reports/act', { id: r.id, action: 'resolve', outcome: 'timed out 1 hour' })).then(() => refresh('tm_reports')).catch(U.fail) }),
        el('button', { class: 'secondary sm danger', text: t('tm_removePerson'), onclick: async () => { if (!(await LC.confirm(t('removeUserHelp'), { danger: true, ok: t('tm_removePerson') }))) return; LC.api('/api/admin/user/remove', { id: r.user }).then(() => LC.api('/api/tm/admin/reports/act', { id: r.id, action: 'resolve', outcome: 'person removed' })).then(() => refresh('tm_reports')).catch(U.fail); } }),
        el('button', { class: 'primary sm', text: t('tm_dismiss'), onclick: () => act(r, 'dismiss') }))
        : el('div', { class: 'row-between small muted' }, el('span', { text: t('tm_handled', { what: r.outcome || r.status, who: LC.realName(r.handledBy) }) + ' · ' + LC.ago(r.handledAt || r.ts) }), el('button', { class: 'link', text: t('tm_reopen'), onclick: () => act(r, 'reopen') })));
    return el('div', {}, U.toggle(t('tm_showAll'), A.showAll, (v) => { A.showAll = v; refresh('tm_reports'); }), reports.length ? el('div', { class: 'tm-reports' }, reports.map(card)) : el('p', { class: 'empty', text: t('tm_noReports') }));
  }

  // ---------- Usage + call quality ----------
  async function usageTab() {
    const days = A.days || 30, [u, q] = await Promise.all([LC.api('/api/tm/admin/usage?days=' + days), LC.api('/api/tm/admin/callquality?days=' + days)]);
    const lab = U.dayLabels(u.from, u.days), sum = (a) => a.reduce((x, y) => x + y, 0);
    const range = U.select([[7, t('tm_range7')], [30, t('tm_range30')], [90, t('tm_range90')]], days, (v) => { A.days = Number(v); refresh('tm_usage'); }, t('tm_range30'));
    const usage = sec(t('tm_usage'), '', el('div', { class: 'row-between' }, range, fileLink(`/api/tm/admin/usage?days=${days}&csv=1&token=${tok()}`, t('tm_csv'))),
      el('div', { class: 'rowline tm-tiles' }, U.stat(u.people, t('tm_ppl')), U.stat(Math.max(...u.active, 0), t('tm_activeDay')), U.stat(sum(u.messages), t('tm_stMessages')), U.stat(sum(u.calls), t('tm_calls')), U.stat(sum(u.minutes), t('tm_minutes')), U.stat(sum(u.files), t('tm_files')), U.stat(LC.fmtSize(u.storage), t('tm_storage'))),
      el('h4', { text: t('tm_activeDay') }), U.chart(u.active, lab, { label: t('tm_activeDay') }), el('h4', { text: t('tm_msgsDay') }), U.chart(u.messages, lab, { label: t('tm_msgsDay'), cls: 'alt' }),
      el('h4', { text: t('tm_callsDay') }), U.chart(u.calls, lab, { label: t('tm_callsDay'), cls: 'warn' }), el('h4', { text: t('tm_filesDay') }), U.chart(u.files, lab, { label: t('tm_filesDay') }));
    const cq = q.empty ? sec(t('tm_cq'), '', el('p', { class: 'empty', text: t('tm_cqEmpty') })) : sec(t('tm_cq'), '',
      el('div', { class: 'rowline tm-tiles' }, U.stat(q.calls, t('tm_calls')), U.stat(q.avgMinutes, t('tm_avgMin')), U.stat(q.avgPeople, t('tm_avgPeople')), U.stat(q.avgStars == null ? t('tm_none') : q.avgStars + ' ★', t('tm_rating')), U.stat(q.rtt == null ? t('tm_none') : q.rtt + ' ms', t('tm_rtt')), U.stat(q.loss == null ? t('tm_none') : q.loss + ' %', t('tm_loss')), U.stat(q.jitter == null ? t('tm_none') : q.jitter + ' ms', t('tm_jitter')), U.stat(q.poor, t('tm_poor'))),
      el('h4', { text: t('tm_rating') }), U.chart(q.stars, ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'], { label: t('tm_rating'), height: 90 }),
      el('h4', { text: t('tm_recentCalls') }), table([t('tm_when'), t('tm_where'), t('tm_ppl'), t('tm_minutes'), t('tm_rating'), t('tm_rtt'), t('tm_loss')], q.recent.map((c) => el('tr', { class: c.poor ? 'tm-poor' : '' }, el('td', { text: fmtDate(c.start) }), el('td', { text: c.where }), el('td', { text: String(c.people) }), el('td', { text: String(c.minutes) }), el('td', { text: c.stars == null ? t('tm_none') : c.stars + ' ★' }), el('td', { text: c.rtt == null ? t('tm_none') : c.rtt + ' ms' }), el('td', { text: c.loss == null ? t('tm_none') : c.loss + ' %' })))));
    return el('div', {}, usage, cq);
  }

  // ---------- Compliance: activity log, legal hold, export ----------
  async function complianceTab() {
    const f = A.audit || {}, q = new URLSearchParams(); if (f.by) q.set('by', f.by); if (f.action) q.set('action', f.action); if (f.from) q.set('from', new Date(f.from + 'T00:00:00').getTime()); if (f.to) q.set('to', new Date(f.to + 'T23:59:59').getTime() + 1);
    const log = await LC.api('/api/tm/admin/audit?' + q), setF = (patch) => { A.audit = { ...f, ...patch }; refresh('tm_compliance'); };
    const by = U.select([['', t('tm_anyone')], ...[...S.users.values()].filter((u) => u.role === 'owner' || u.role === 'admin').map((u) => [u.id, u.name])], f.by || '', (v) => setF({ by: v }), t('tm_colWho'));
    const action = U.select([['', t('tm_anyAction')], ...log.actions.map((a) => [a, a])], f.action || '', (v) => setF({ action: v }), t('tm_colAction'));
    const from = el('input', { type: 'date', value: f.from || '', 'aria-label': t('tm_fromDate'), onchange: (e) => setF({ from: e.target.value }) }), to = el('input', { type: 'date', value: f.to || '', 'aria-label': t('tm_toDate'), onchange: (e) => setF({ to: e.target.value }) });
    const audit = sec(t('tm_audit'), t('tm_auditHelp'), el('div', { class: 'filters' }, by, action, el('label', { class: 'small' }, t('tm_fromDate') + ' ', from), el('label', { class: 'small' }, t('tm_toDate') + ' ', to), fileLink(`/api/tm/admin/audit?${q}&csv=1&token=${tok()}`, t('tm_csv'))),
      log.entries.length ? table([t('tm_colTime'), t('tm_colWho'), t('tm_colAction'), t('tm_colDetails')], log.entries.slice(0, 200).map((e) => el('tr', {}, el('td', { text: fmtDate(e.ts) }), el('td', { text: e.name }), el('td', {}, el('code', { text: e.action })), el('td', { text: e.details })))) : el('p', { class: 'muted', text: t('tm_noEntries') }));
    if (!owner()) return el('div', {}, audit, el('p', { class: 'muted small', text: t('tm_ownerOnlyPart') }));
    const { holds } = await LC.api('/api/tm/admin/holds');
    const who = personSelect(t('tm_pickPerson')), note = el('input', { maxlength: 200, placeholder: t('tm_holdNote'), 'aria-label': t('tm_holdNote') });
    const hold = sec(t('tm_hold'), t('tm_holdHelp'), holds.length ? el('div', {}, holds.map((h) => el('div', { class: 'req' }, LC.icon('gavel'), el('div', { class: 'grow' }, el('b', { text: h.name }), el('div', { class: 'muted small', text: t('tm_since', { when: fmtDate(h.ts) }) + (h.note ? ' · ' + h.note : '') + ` · ${h.messages} ${t('tm_stMessages').toLowerCase()} · ${h.archived} held` })),
      el('button', { class: 'secondary sm', text: t('tm_viewHeld'), onclick: () => heldItems(h) }), el('button', { class: 'secondary sm', text: t('tm_releaseHold'), onclick: () => LC.api('/api/tm/admin/hold', { uid: h.uid, on: false }).then(() => refresh('tm_compliance')).catch(U.fail) })))) : el('p', { class: 'muted', text: t('tm_noHolds') }),
      el('div', { class: 'rowline' }, who, note, el('button', { class: 'primary sm', text: t('tm_putHold'), onclick: () => who.value && LC.api('/api/tm/admin/hold', { uid: who.value, note: note.value }).then(() => refresh('tm_compliance')).catch(U.fail) })));
    const ex = personSelect(t('tm_pickPerson')), dl = el('a', { class: 'primary sm btn hidden', download: '' }, LC.icon('arrow_download'), ' ' + t('tm_download'));
    ex.addEventListener('change', () => { dl.classList.toggle('hidden', !ex.value); dl.href = `/api/tm/admin/export?uid=${encodeURIComponent(ex.value)}&token=${tok()}`; });
    return el('div', {}, audit, hold, sec(t('tm_export'), t('tm_exportHelp'), el('div', { class: 'rowline' }, ex, dl)));
  }
  async function heldItems(h) {
    const { items } = await LC.api('/api/tm/admin/hold/items?uid=' + encodeURIComponent(h.uid));
    LC.modal([el('div', { class: 'row-between' }, el('h2', { text: t('tm_heldItems', { name: h.name }) }), LC.ibtn('dismiss', t('close'), () => LC.adminPanel('tm_compliance'))),
      items.length ? el('div', { class: 'results' }, items.map((a) => el('div', { class: 'ver' }, el('small', { class: 'muted', text: `${a.action} · ${fmtDate(a.at)} · ${a.where}` }), el('div', { class: 'txt', text: a.orig.text || (a.orig.files || []).map((x) => x.name).join(', ') || a.orig.poll || '' })))) : el('p', { class: 'muted', text: t('tm_noHeld') })], { wide: true });
  }

  LC.ext.adminTabs.push(
    { key: 'tm_teams', icon: 'people_team', label: () => t('tm_admTeams'), order: 60, render: teamsTab },
    { key: 'tm_policies', icon: 'shield_checkmark', label: () => t('tm_admPolicies'), order: 61, render: policiesTab },
    { key: 'tm_reports', icon: 'flag', label: () => t('tm_admReports') + (A.reportsOpen ? ` (${A.reportsOpen})` : ''), order: 62, render: reportsTab },
    { key: 'tm_usage', icon: 'data_trending', label: () => t('tm_admUsage'), order: 63, render: usageTab },
    { key: 'tm_compliance', icon: 'gavel', label: () => t('tm_admCompliance'), order: 64, render: complianceTab });

  // ---------- People › Bulk add + invitations ----------
  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean)); if (!clean.length) return [];
    const head = clean[0].map((h) => h.toLowerCase()), has = head.includes('name');
    const col = (names, d) => { const i = head.findIndex((h) => names.includes(h)); return has ? i : d; };
    const ci = { name: col(['name'], 0), role: col(['role'], 1), title: col(['job title', 'title', 'jobtitle'], 2), dept: col(['department', 'dept'], 3) };
    return (has ? clean.slice(1) : clean).map((r) => ({ name: r[ci.name] || '', role: ci.role >= 0 ? r[ci.role] || '' : '', title: ci.title >= 0 ? r[ci.title] || '' : '', dept: ci.dept >= 0 ? r[ci.dept] || '' : '' })).filter((r) => r.name).slice(0, 500);
  }
  A.parseCsv = parseCsv;
  async function bulkSection() {
    const file = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', 'aria-label': t('tm_csvFile') }), paste = el('textarea', { rows: 3, placeholder: 'name, role, job title, department\nAna Silva, member, Designer, Studio', 'aria-label': t('tm_orPaste') });
    const out = el('div', { 'aria-live': 'polite' }), count = el('span', { class: 'muted small' }); let mode = 'codes';
    const days = U.select([[7, t('tm_daysN', { n: 7 })], [14, t('tm_daysN', { n: 14 })], [30, t('tm_daysN', { n: 30 })], [90, t('tm_daysN', { n: 90 })]], 14, null, t('tm_validFor'));
    const rows = async () => { const txt = file.files[0] ? await file.files[0].text() : paste.value; return parseCsv(txt); };
    const recount = async () => { count.textContent = t('tm_preview', { n: (await rows()).length }); };
    file.addEventListener('change', recount); paste.addEventListener('input', recount);
    const base = await (async () => { try { const i = await LC.api('/api/info'); const u = i.urls[0]; return u ? (i.https && u.secureUrl) || u.url : location.origin; } catch { return location.origin; } })();
    const go = async () => {
      const list = await rows(); if (!list.length) return LC.toast(t('tm_preview', { n: 0 }));
      try {
        const r = await LC.api('/api/tm/admin/bulk', { rows: list, mode, days: Number(days.value) });
        const csv = U.csv([['name', 'role', 'code', 'invite link'], ...r.created.map((x) => [x.name, x.role, x.code || '', x.code ? `${base}/#invite=${x.code}` : base])]);
        U.set(out, el('p', { class: 'small', text: t('tm_created', { n: r.created.length }) }), ...r.skipped.map((x) => el('p', { class: 'err small', text: t('tm_skipped', x) })),
          r.created.length ? table([t('name'), t('col_role'), t('tm_code')], r.created.map((x) => el('tr', {}, el('td', { text: x.name }), el('td', { text: t('role_' + x.role) }), el('td', {}, x.code ? el('code', { text: x.code }) : t('tm_none'))))) : null,
          r.created.length ? el('div', { class: 'acts' }, el('button', { class: 'primary sm withicon', onclick: () => U.download('lanchat-invites.csv', csv) }, LC.icon('arrow_download'), el('span', { text: t('tm_downloadCodes') }))) : null);
        invites();
      } catch (e) { U.fail(e); }
    };
    const invBox = el('div');
    const invites = async () => {
      try {
        const { invites: l } = await LC.api('/api/tm/admin/invites');
        U.set(invBox, l.length ? table([t('name'), t('col_role'), t('tm_colStatus'), ''], l.map((x) => el('tr', {}, el('td', { text: x.name + (x.kind === 'name' ? ' *' : '') }), el('td', { text: t('role_' + x.role) }), el('td', { text: x.used ? t('tm_used') + ' · ' + LC.ago(x.used) : x.expired ? t('tm_expired') : t('tm_waiting') }),
          el('td', {}, !x.used ? el('button', { class: 'secondary sm', text: t('tm_revoke'), onclick: () => LC.api('/api/tm/admin/invites/revoke', { id: x.key }).then(invites).catch(U.fail) }) : null)))) : el('p', { class: 'muted small', text: t('tm_noInvites') }),
        l.some((x) => !x.used) ? el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('tm_revokeAll'), onclick: () => LC.api('/api/tm/admin/invites/revoke', { all: true }).then(invites).catch(U.fail) })) : null);
      } catch (e) { U.set(invBox, el('p', { class: 'err', text: e.message })); }
    };
    invites();
    return el('div', { class: 'tm-sec' }, el('h3', {}, LC.icon('people_add'), ' ' + t('tm_bulk')), el('p', { class: 'muted small', text: t('tm_bulkHelp') }), U.field(t('tm_csvFile'), file), U.field(t('tm_orPaste'), paste), count,
      U.radios('tm-bulkmode', [['codes', t('tm_modeCodes')], ['names', t('tm_modeNames')]], mode, (v) => { mode = v; }, t('tm_bulk')), U.field(t('tm_validFor'), days),
      el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_create2'), onclick: go })), out, el('h4', { text: t('tm_invites') }), invBox);
  }
  LC.ext.adminSections.push({ tab: 'people', order: 60, render: bulkSection });

  // ---------- Settings › Branded lobby + PIN sign-in (host) ----------
  async function brandSection() {
    const p = await LC.api('/api/tm/admin/policies'); let logo, color = p.brand.color || '', welcome = el('textarea', { rows: 3, maxlength: 500, 'aria-label': t('tm_welcome') }); welcome.value = p.brand.welcome || '';
    const col = el('input', { type: 'color', value: color || '#5b5fc7', 'aria-label': t('tm_brandColor'), oninput: (e) => { color = e.target.value; } });
    return el('div', {}, el('section', { class: 'tm-sec' }, el('h3', {}, LC.icon('sparkle'), ' ' + t('tm_brandT')), el('p', { class: 'muted small', text: t('tm_brandHelp') }),
      U.group(t('tm_logo'), U.pictureInput(p.brand.logo ? '/api/tm/brand/logo?v=' + Date.now() : '', (v) => { logo = v; }, { size: 256, type: 'image/png', max: 290000, label: t('tm_logo') })),
      U.field(t('tm_brandColor'), col), U.field(t('tm_welcome'), welcome),
      el('div', { class: 'acts' }, el('button', { class: 'secondary sm', text: t('tm_clearBrand'), onclick: () => save({ brand: { logo: '', color: '', welcome: '' } }, 'settings') }), el('button', { class: 'primary sm', text: t('tm_save'), onclick: () => save({ brand: { ...(logo !== undefined ? { logo } : {}), color, welcome: welcome.value } }, 'settings') }))),
      el('section', { class: 'tm-sec' }, el('h3', {}, LC.icon('password'), ' ' + t('tm_pinPolicy')), U.toggle(t('tm_pinPolicyOn'), p.pinSkipsApproval, (v) => save({ pinSkipsApproval: v })), el('p', { class: 'muted small', text: t('tm_pinPolicyHelp') })));
  }
  LC.ext.adminSections.push({ tab: 'settings', order: 60, ownerOnly: true, render: brandSection });

  // ---------- each person's Actions menu (Manage › People) ----------
  LC.adminUserItems = (u, done) => {
    if (u.role === 'owner' || u.bot) return [];
    const act = (p, b, msg) => LC.api(p, b).then(() => { if (msg) LC.toast(msg, { ms: 1500 }); done(); }).catch(U.fail);
    return ['sep',
      u.role === 'guest' ? { icon: 'person', label: t('tm_makeMember'), fn: () => act('/api/admin/user/role', { id: u.id, role: 'member' }) } : u.role === 'member' ? { icon: 'person_lock', label: t('tm_makeGuest'), fn: () => act('/api/admin/user/role', { id: u.id, role: 'guest' }) } : null,
      u.role === 'guest' ? { icon: 'channel', label: t('tm_guestChans'), fn: () => guestChans(u) } : null,
      { icon: 'laptop', label: t('tm_devices'), fn: () => devicesDialog(u) },
      u.hasPin ? { icon: 'password', label: t('tm_resetPin'), fn: async () => { if (await LC.confirm(t('tm_confirmResetPin', { name: u.name }))) act('/api/tm/admin/pin/reset', { uid: u.id }); } } : null,
      owner() ? { icon: 'gavel', label: u.tmHeld ? t('tm_holdOff') : t('tm_holdOn'), fn: () => act('/api/tm/admin/hold', { uid: u.id, on: !u.tmHeld }) } : null,
      owner() ? { icon: 'arrow_download', label: t('tm_exportMsgs'), fn: () => { location.href = `/api/tm/admin/export?uid=${encodeURIComponent(u.id)}&token=${tok()}`; } } : null];
  };
  LC.adminUserPills = (u) => [u.bot ? U.pill(t('tm_bot'), 'bot') : null, u.hasPin ? U.pill(t('tm_pinPill')) : null];
  async function guestChans(u) {
    const { chans } = await LC.api('/api/tm/admin/guestchans?uid=' + encodeURIComponent(u.id)), cur = new Set(chans);
    const all = [...S.channels.values()].filter((c) => !c.team && !c.members);
    const box = el('div', { class: 'people' }, all.map((c) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: cur.has(c.id), onchange: (e) => (e.target.checked ? cur.add(c.id) : cur.delete(c.id)) }), el('span', { text: '# ' + c.name }))));
    LC.modal([el('h2', { text: t('tm_guestChansT', { name: u.name }) }), el('p', { class: 'muted small', text: t('tm_guestChansHelp') }), box,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('people') }), el('button', { class: 'primary', text: t('tm_save'), onclick: () => LC.api('/api/tm/admin/guestchans', { uid: u.id, chans: [...cur] }).then(() => LC.adminPanel('people')).catch(U.fail) }))]);
  }
  async function devicesDialog(u, self) {
    const path = self ? '/api/tm/me/devices' : '/api/tm/admin/devices?uid=' + encodeURIComponent(u.id), back = () => (self ? LC.settingsPanel('tm_security') : LC.adminPanel('people'));
    const { devices } = await LC.api(path);
    const out = (id) => LC.api(self ? '/api/tm/me/devices/signout' : '/api/tm/admin/devices/signout', self ? { id } : { uid: u.id, id, all: !id }).then(() => (self && devices.find((d) => d.id === id && d.current) ? LC.signOut('manual') : devicesDialog(u, self))).catch(U.fail);
    LC.modal([el('div', { class: 'row-between' }, el('h2', { text: t('tm_devicesT', { name: u.name }) }), LC.ibtn('dismiss', t('close'), back)),
      devices.length ? el('div', {}, devices.map((d) => el('div', { class: 'req' }, LC.icon(/Android|iPhone/.test(d.ua) ? 'phone' : 'laptop'), el('div', { class: 'grow' }, el('b', { text: d.ua }), d.current ? U.pill(t('tm_thisDevice'), 'ok') : null, el('div', { class: 'muted small', text: [t('tm_first', { when: fmtDate(d.created) }), t('tm_last', { when: LC.ago(d.last) }), d.ip, d.dev ? '#' + d.dev.slice(0, 8) : ''].filter(Boolean).join(' · ') })),
        el('button', { class: 'secondary sm', text: t('tm_signOut'), onclick: () => out(d.id) })))) : el('p', { class: 'muted', text: t('tm_noDevices') }),
      el('div', { class: 'acts' }, !self && devices.length ? el('button', { class: 'secondary danger', text: t('tm_signOutAll'), onclick: () => out(null) }) : null, el('button', { class: 'primary', text: t('close'), onclick: back }))]);
  }
  A.devicesDialog = devicesDialog;

  // ---------- Activity items for reports (admins) ----------
  LC.ext.activityTypes = LC.ext.activityTypes || {};
  LC.ext.activityTypes.report = { icon: 'flag', filter: 'other', text: () => t('tm_a_report'), open: () => (LC.isAdmin() ? LC.adminPanel('tm_reports') : null) };
})();
