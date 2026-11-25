'use strict';
// Teams and channels (section 13 of the Teams list): several teams per session, each with owners, members and guests,
// a join code, settings and templates; archive and delete; standard, private and shared channels; channel description,
// picture, posts-style channels and moderation (who can post / reply); tags (@designers), @team and @channel; posting
// to several channels at once; hiding channels; channel analytics.
// Visibility always goes through hooks.canSee / hooks.audience (kept consistent: live events only reach people who can see).
// Data owned here: db.teams (shared contract, docs/EXTENDING.md), db.tmTags, db.tmPrefs, db.tmGuestChans.
// Owners are also listed in members; guests are only in guests. A channel belongs to a team through c.team.
const crypto = require('crypto');

module.exports = (ctx) => {
  const { api, db, store, json, body, fail, rid, str, rate, isObj, userById, isAdmin, emit, emitFor, chanOut, chanMsgs, msgById, byChan, sysMsg, removeMessages, coll, activity, hooks, canSee, audience, msgOut, safeEq } = ctx;
  const TM = (ctx.tm ||= {});
  const teams = () => coll('teams');
  const tags = () => coll('tmTags');
  const prefsOf = (uid) => { const all = coll('tmPrefs'); return (all[uid] ||= { hidden: [], hiddenTeams: [] }); };
  const guestChans = () => coll('tmGuestChans');
  const now = () => Date.now();

  // ---------- small helpers ----------
  const isGuest = (u) => !!u && u.role === 'guest';
  const live = (u) => !!u && !u.removed && !u.deleted;
  const inTeam = (t, id) => !!t && (t.owners.includes(id) || t.members.includes(id) || t.guests.includes(id));
  const allOf = (t) => [...new Set([...t.owners, ...t.members, ...t.guests])];
  const chansOf = (tid) => Object.values(db.channels).filter((c) => c.team === tid);
  const teamOfChan = (chan) => { const c = typeof chan === 'string' ? db.channels[chan] : chan; return c && c.team ? teams()[c.team] || null : null; };
  const isTeamOwner = (t, u) => !!t && !!u && t.owners.includes(u.id);
  const canOwn = (t, u) => isTeamOwner(t, u) || isAdmin(u);
  const mustTeam = (id) => { const t = teams()[str(id, 32)]; if (!t || !Object.prototype.hasOwnProperty.call(teams(), str(id, 32))) fail(404, 'No such team'); return t; };
  const seeTeam = (t, me) => { if (!inTeam(t, me.id) && !isAdmin(me)) fail(404, 'No such team'); };
  const cleanText = (v, max) => str(v, max * 2).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
  const cleanName = (v, max) => str(v, 400).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const PIC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  // pictures (team, channel, branding) are small data: URLs so they never depend on uploaded files (which are garbage-collected)
  const cleanPic = (v, max = 160000) => { if (v === undefined) return undefined; if (v === null || v === '') return ''; const s = str(v, max + 1); if (s.length > max || !PIC.test(s)) fail(400, 'Use a PNG, JPEG, GIF or WebP picture under 100 KB.'); return s; };
  const ids = (v, max = 500) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.length <= 32))].slice(0, max) : []);
  const DEFAULTS = { memberCreateChannels: true, memberCreatePrivate: true, memberDeleteChannels: false, memberAddApps: true, memberAddMembers: true, memberManageTags: false, mentionTeam: true, mentionChannel: true, stickers: true, guestCreateChannels: false, guestDeleteChannels: false, discoverable: true };
  const settingsOf = (t) => ({ ...DEFAULTS, ...(t.settings || {}) });
  const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
  const newCode = () => { for (;;) { const c = Array.from(crypto.randomBytes(7), (b) => CODE_ABC[b % CODE_ABC.length]).join(''); if (!Object.values(teams()).some((x) => x.code === c)) return c; } };
  const newChanId = () => { for (;;) { const id = 'tc-' + rid(5); if (!Object.prototype.hasOwnProperty.call(db.channels, id)) return id; } };
  const newTeamId = () => { for (;;) { const id = rid(5); if (!Object.prototype.hasOwnProperty.call(teams(), id)) return id; } };
  // policies live in the admin module (naming rules, bad words, labels); call them lazily so load order does not matter
  const checkName = (name, me, what) => (TM.checkName ? TM.checkName(name, me, what) : name);
  const labelOk = (v) => { const l = str(v, 32); if (!l) return ''; if (TM.labelById && !TM.labelById(l)) fail(400, 'Unknown sensitivity label'); return l; };
  const labelLevel = (t, c) => (TM.labelLevel ? TM.labelLevel(t, c) : 0);

  // ---------- who may do what inside a team ----------
  const canCreateTeams = (u) => !isGuest(u) && !u.bot && (isAdmin(u) || !TM.policy || TM.policy().teamCreate !== 'admins');
  const canMakeChannel = (t, u, priv) => { if (canOwn(t, u)) return true; const s = settingsOf(t); if (isGuest(u)) return s.guestCreateChannels && !priv; return s.memberCreateChannels && (!priv || s.memberCreatePrivate); };
  const chanOwner = (c, u) => !!c.owners && c.owners.includes(u.id);
  const canEditChannel = (t, c, u) => canOwn(t, u) || chanOwner(c, u) || (!c.members && (isGuest(u) ? settingsOf(t).guestCreateChannels : settingsOf(t).memberCreateChannels));
  const canDeleteChannel = (t, c, u) => !c.general && (canOwn(t, u) || chanOwner(c, u) || (isGuest(u) ? settingsOf(t).guestDeleteChannels : settingsOf(t).memberDeleteChannels));
  const isModerator = (c, u) => { const t = teamOfChan(c); return isAdmin(u) || isTeamOwner(t, u) || chanOwner(c, u) || (c.moderators || []).includes(u.id); };
  TM.isModerator = isModerator;

  // ---------- output ----------
  // full view for members; people who only reach a shared channel see the team's name and picture, never its members
  const teamFull = (t) => ({
    id: t.id, name: t.name, picture: t.picture || '', description: t.description || '', owners: t.owners, members: t.members, guests: t.guests, visibility: t.visibility,
    settings: settingsOf(t), archived: t.archived || 0, created: t.created, by: t.by || null, label: t.label || '', template: t.template || '', general: t.general,
    active: t.active || t.created, warned: t.warned || 0,
  });
  const teamOut = (t, v) => {
    if (!v) return null;
    if (!inTeam(t, v.id)) return { id: t.id, name: t.name, picture: t.picture || '', partial: true, archived: t.archived || 0, label: t.label || '' };
    const own = t.owners.includes(v.id);
    return { ...teamFull(t), code: own ? t.code || '' : undefined, requests: own ? (t.requests || []) : undefined };
  };
  const viewersOf = (t) => { const s = new Set(allOf(t)); for (const c of chansOf(t.id)) if (c.shared && c.members) for (const i of c.members) s.add(i); return [...s]; };
  const pushTeam = (t) => emitFor('team', (v) => teamOut(t, v), viewersOf(t));
  const visibleTeams = (u) => Object.values(teams()).filter((t) => inTeam(t, u.id) || chansOf(t.id).some((c) => c.shared && c.members && c.members.includes(u.id)));
  const tagOut = (g) => ({ id: g.id, name: g.name, team: g.team || '', members: g.members, by: g.by || null });
  const tagsFor = (u) => (isGuest(u) ? [] : Object.values(tags()).filter((g) => (g.team ? inTeam(teams()[g.team], u.id) : true)).map(tagOut));
  const pushTags = (team) => { const t = team ? teams()[team] : null; const to = t ? allOf(t) : null; emitFor('tm_tags', (v) => tagsFor(v), to); };
  Object.assign(TM, { teams, teamOfChan, inTeam, allOf, chansOf, teamOut, teamFull, pushTeam, isGuest, canOwn, settingsOf, cleanPic, cleanText, cleanName, visibleTeams });
  // helpers other areas may use (docs/features-teams.md): which team a chat belongs to, and everyone in a team
  ctx.teamOf = (chan) => teamOfChan(chan);
  ctx.teamMembers = (id) => { const t = teams()[id]; return t ? allOf(t) : []; };

  // ---------- visibility: team channels only for the team (private/shared: their own member list); guests only what they were added to ----------
  hooks.canSee.push((u, chan) => {
    const c = db.channels[chan]; if (!c) return undefined;
    if (c.team) {
      const t = teams()[c.team]; if (!t) return false;
      if (c.members) return c.members.includes(u.id) && (!!c.shared || inTeam(t, u.id));
      return inTeam(t, u.id);
    }
    if (isGuest(u)) return c.members ? c.members.includes(u.id) : (guestChans()[chan] || []).includes(u.id);
    return undefined;
  });
  const anyGuests = () => Object.values(db.users).some((u) => u.role === 'guest' && !u.deleted);
  hooks.audience.push((chan) => {
    const c = db.channels[chan]; if (!c) return undefined;
    if (c.team) { const t = teams()[c.team]; if (!t) return []; return c.members ? c.members.filter((i) => !!c.shared || inTeam(t, i)) : allOf(t); }
    // a session-wide channel normally reaches everyone (null); once guests exist, list exactly who may see it
    if (!c.members && anyGuests()) return Object.values(db.users).filter((u) => !u.deleted && canSee(u, chan)).map((u) => u.id);
    return undefined;
  });
  hooks.chanFields.push((c) => {
    const o = {};
    for (const k of ['description', 'picture', 'postRule', 'replyRule', 'label']) if (c[k]) o[k] = c[k];
    if (c.moderators && c.moderators.length) o.moderators = c.moderators;
    if (c.team) {
      o.private = !!c.private; o.shared = !!c.shared; o.general = !!c.general; if (c.owners) o.owners = c.owners;
      const t = teams()[c.team]; if (t && t.archived) { o.archived = true; o.readonly = true; }
    }
    return o;
  });
  hooks.initExtra.push((u) => ({ teams: visibleTeams(u).map((t) => teamOut(t, u)), tmPrefs: prefsOf(u.id), tmTags: tagsFor(u), tmCanCreateTeams: canCreateTeams(u) }));

  // ---------- access changes: tell each person which team channels they gained or lost ----------
  function accessDiff(t, people, change) {
    const see = (uid) => { const u = userById(uid); return new Set(u ? chansOf(t.id).filter((c) => canSee(u, c.id)).map((c) => c.id) : []); };
    const before = new Map(people.map((i) => [i, see(i)]));
    change();
    const viewers = new Set(viewersOf(t));
    for (const i of people) {
      const after = see(i), was = before.get(i);
      for (const c of after) if (!was.has(c)) emit('channel', chanOut(db.channels[c]), [i]);
      for (const c of was) if (!after.has(c)) emit('channel_removed', { id: c }, [i]);
      if (!viewers.has(i)) emit('team_removed', { id: t.id }, [i]);
    }
  }
  function setRole(t, uid, role) { // 'owner' | 'member' | 'guest' | null (out)
    t.owners = t.owners.filter((i) => i !== uid); t.members = t.members.filter((i) => i !== uid); t.guests = t.guests.filter((i) => i !== uid);
    if (role === 'owner') { t.owners.push(uid); t.members.push(uid); } else if (role === 'member') t.members.push(uid); else if (role === 'guest') t.guests.push(uid);
    if (!role) for (const c of chansOf(t.id)) if (c.private && c.members && c.members.includes(uid)) { c.members = c.members.filter((i) => i !== uid); if (c.owners) c.owners = c.owners.filter((i) => i !== uid); }
  }
  const roleFor = (u) => (isGuest(u) ? 'guest' : 'member');
  const joinHooks = []; TM.onTeamJoin = (fn) => joinHooks.push(fn); // workflows: "someone joins a team"
  const fireTeamJoin = (t, u, by) => { for (const h of joinHooks) { try { h(t, u, by); } catch (e) { console.error('team join hook:', e.message); } } };
  TM.addToTeam = (t, u, by, role) => { // used by workflows and bulk tools; returns false if already in
    if (!t || !live(u) || inTeam(t, u.id) || t.archived) return false;
    if (isGuest(u) && labelLevel(t) >= 2) return false;
    accessDiff(t, [u.id], () => setRole(t, u.id, role || roleFor(u)));
    store.save(); pushTeam(t); if (by) activity(u.id, { type: 'added', from: by.id, team: t.id, chan: t.general, text: t.name });
    sysMsg(t.general, by && by.id !== u.id ? `${by.name} added ${u.name} to the team` : `${u.name} joined the team`); fireTeamJoin(t, u, by); return true;
  };
  // a person who leaves the session (removed / deleted) also leaves every team and tag
  TM.forget = (u) => {
    for (const t of Object.values(teams())) if (inTeam(t, u.id) || chansOf(t.id).some((c) => c.members && c.members.includes(u.id))) {
      setRole(t, u.id, null); for (const c of chansOf(t.id)) if (c.members && c.members.includes(u.id)) c.members = c.members.filter((i) => i !== u.id);
      t.requests = (t.requests || []).filter((r) => r.uid !== u.id); pushTeam(t);
    }
    for (const g of Object.values(tags())) if (g.members.includes(u.id)) g.members = g.members.filter((i) => i !== u.id);
    for (const list of Object.values(guestChans())) { const i = list.indexOf(u.id); if (i >= 0) list.splice(i, 1); }
    store.save();
  };

  // ---------- channels ----------
  const TEMPLATES = {
    project: { channels: [['Planning', 'Goals, milestones and decisions'], ['Design', 'Sketches, mock-ups and feedback'], ['Development', 'Building it'], ['Announcements', 'Important news for the whole team', { kind: 'posts', postRule: 'moderators' }]], note: 'Project plan\n\nGoal:\nMilestones:\nWho does what:\n', todos: ['Hold a kick-off meeting', 'Agree on the goal', 'Share the timeline'] },
    event: { channels: [['Logistics', 'Venue, travel and timing'], ['Budget', 'Costs and payments'], ['Volunteers', 'Who helps with what'], ['Announcements', 'News for everyone coming', { kind: 'posts', postRule: 'moderators' }]], note: 'Agenda\n\nDate:\nPlace:\nProgramme:\n', todos: ['Book the venue', 'Send the invitations', 'Plan food and drinks'] },
    class: { channels: [['Homework', 'Assignments and hand-ins'], ['Class notes', 'Notes from each lesson'], ['Questions', 'Ask anything — one post per question', { kind: 'posts' }], ['Announcements', 'News from the teacher', { kind: 'posts', postRule: 'moderators' }]], note: 'Syllabus\n\nWeek 1:\nWeek 2:\nWeek 3:\n', todos: ['Read chapter 1', 'Introduce yourself in General'] },
    friends: { channels: [['Plans', 'Trips, dinners and nights out'], ['Photos', 'Share your pictures'], ['Games', 'Game nights and scores'], ['Random', 'Anything goes']], note: 'Ideas\n\n- \n', todos: ['Pick a date for the next get-together'] },
  };
  function makeChannel(t, me, o) {
    const c = { id: newChanId(), name: o.name, topic: '', created: now(), by: me.id, team: t.id, kind: o.kind === 'posts' ? 'posts' : '' };
    if (o.description) c.description = o.description; if (o.picture) c.picture = o.picture; if (o.general) c.general = true;
    if (o.postRule === 'moderators') c.postRule = 'moderators'; if (o.replyRule === 'none') c.replyRule = 'none';
    if (o.type === 'private' || o.type === 'shared') { c[o.type] = true; c.members = o.members; c.owners = [me.id]; }
    if (o.label) c.label = o.label;
    db.channels[c.id] = c; return c;
  }
  // starter content for a template's General channel (the apps area may offer ctx.addTab; otherwise the built-in Notes and Tasks tabs are filled)
  function seedTabs(t, chan, tpl, me) {
    const T = TEMPLATES[tpl]; if (!T) return;
    if (typeof ctx.addTab === 'function') { try { ctx.addTab(chan, { type: 'notes', name: 'Notes', by: me.id }); } catch {} }
    if (db.extras[chan]) return;
    db.extras[chan] = { note: { text: T.note || '', v: 1, by: me.id, ts: now() }, board: [], todos: (T.todos || []).map((text) => ({ id: rid(6), text, done: false, by: me.id, assignee: '', due: 0, ts: now() })), events: [] };
  }
  const uniqueChanName = (t, name, except) => { if (chansOf(t.id).some((c) => c.id !== except && c.name.toLowerCase() === name.toLowerCase())) fail(409, 'This team already has a channel with that name.'); };

  // ---------- teams ----------
  api['POST /api/teams/create'] = async (req, res, me) => {
    const b = await body(req, 300000);
    if (isGuest(me)) fail(403, "Guests can't create teams.");
    if (!canCreateTeams(me)) fail(403, 'Only admins can create teams in this session.');
    if (!rate('tmcreate:' + me.id, 20, 3600000)) fail(429, 'You are creating teams too quickly. Try again later.');
    if (Object.keys(teams()).length >= 500) fail(400, 'This session has too many teams.');
    const name = checkName(cleanName(b.name, 60), me, 'team'); if (!name) fail(400, 'Give the team a name.');
    const tpl = Object.prototype.hasOwnProperty.call(TEMPLATES, str(b.template, 20)) ? str(b.template, 20) : '';
    const t = { id: newTeamId(), name, picture: cleanPic(b.picture) || '', description: cleanText(b.description, 1000), owners: [me.id], members: [me.id], guests: [], code: newCode(), visibility: b.visibility === 'public' ? 'public' : 'private', settings: {}, archived: 0, created: now(), by: me.id, template: tpl, label: labelOk(b.label), active: now(), requests: [] };
    teams()[t.id] = t;
    const gen = makeChannel(t, me, { name: 'General', general: true }); t.general = gen.id;
    for (const [cn, desc, extra] of (TEMPLATES[tpl] || { channels: [] }).channels) makeChannel(t, me, { name: cn, description: desc, ...(extra || {}) });
    seedTabs(t, gen.id, tpl, me);
    const add = ids(b.members, 200).map(userById).filter((u) => live(u) && u.id !== me.id && !(isGuest(u) && labelLevel(t) >= 2));
    for (const u of add) setRole(t, u.id, roleFor(u));
    store.save(); pushTeam(t);
    for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id));
    sysMsg(gen.id, `${me.name} created the team ${name}`);
    for (const u of add) { activity(u.id, { type: 'added', from: me.id, team: t.id, chan: gen.id, text: t.name }); fireTeamJoin(t, u, me); }
    json(res, 200, { team: teamOut(t, me), general: gen.id });
  };

  api['GET /api/teams/get'] = async (req, res, me, url) => {
    const t = mustTeam(url.searchParams.get('id')); seeTeam(t, me);
    const own = canOwn(t, me);
    // owners see every channel's name (like Teams' Manage team › Channels); others only the channels they can open
    const chans = chansOf(t.id).filter((c) => own || canSee(me, c.id)).map((c) => ({ id: c.id, name: c.name, description: c.description || '', private: !!c.private, shared: !!c.shared, general: !!c.general, kind: c.kind || '', members: c.members ? c.members.length : null, canSee: canSee(me, c.id), created: c.created }));
    json(res, 200, { team: inTeam(t, me.id) ? teamOut(t, me) : { ...teamFull(t), adminView: true }, channels: chans });
  };

  api['POST /api/teams/update'] = async (req, res, me) => {
    const b = await body(req, 300000), t = mustTeam(b.id); seeTeam(t, me);
    if (!canOwn(t, me)) fail(403, 'Only team owners can change the team.');
    const notes = [];
    if (b.name !== undefined) { const n = checkName(cleanName(b.name, 60), me, 'team'); if (!n) fail(400, 'Give the team a name.'); if (n !== t.name) { notes.push(`${me.name} renamed the team to ${n}`); t.name = n; } }
    if (b.description !== undefined) t.description = cleanText(b.description, 1000);
    if (b.picture !== undefined) t.picture = cleanPic(b.picture);
    if (b.visibility !== undefined) t.visibility = b.visibility === 'public' ? 'public' : 'private';
    if (b.label !== undefined) { const l = labelOk(b.label); if (l && TM.labelById && TM.labelById(l).level >= 2 && t.guests.length) fail(400, 'Remove the guests first: highly confidential teams cannot have guests.'); t.label = l; }
    if (isObj(b.settings)) { const s = { ...(t.settings || {}) }; for (const k of Object.keys(DEFAULTS)) if (b.settings[k] !== undefined) s[k] = !!b.settings[k]; t.settings = s; }
    store.save(); pushTeam(t); for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id));
    for (const n of notes) sysMsg(t.general, n);
    if (!isTeamOwner(t, me)) ctx.audit && ctx.audit(me, 'team.update', `${t.name} (${t.id})`);
    json(res, 200, { team: teamOut(t, me) });
  };

  api['POST /api/teams/code'] = async (req, res, me) => { // owners: make a new join code, or turn codes off
    const b = await body(req, 512), t = mustTeam(b.id); seeTeam(t, me); if (!canOwn(t, me)) fail(403, 'Only team owners can change the team code.');
    t.code = b.off ? '' : newCode(); store.save(); pushTeam(t); json(res, 200, { code: t.code });
  };

  api['GET /api/teams/directory'] = async (req, res, me, url) => {
    if (isGuest(me)) return json(res, 200, { teams: [] });
    const q = str(url.searchParams.get('q'), 60).toLowerCase().trim();
    const list = Object.values(teams()).filter((t) => !t.archived && !inTeam(t, me.id) && (t.visibility === 'public' || settingsOf(t).discoverable) && (!q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)));
    json(res, 200, { teams: list.slice(0, 200).map((t) => ({ id: t.id, name: t.name, description: (t.description || '').slice(0, 300), picture: t.picture || '', visibility: t.visibility, count: allOf(t).length, label: t.label || '', requested: (t.requests || []).some((r) => r.uid === me.id) })) });
  };

  api['POST /api/teams/join'] = async (req, res, me) => {
    const b = await body(req, 1024);
    if (isGuest(me)) fail(403, 'Guests are added to teams by a team owner.');
    let t;
    if (b.code !== undefined) {
      if (!rate('tmcode:' + me.id, 10, 600000)) fail(429, 'Too many tries. Wait a few minutes and try again.');
      const code = str(b.code, 20).trim().toLowerCase(); t = code ? Object.values(teams()).find((x) => x.code && safeEq(x.code, code)) : null;
      if (!t || t.archived) fail(404, "That code didn't work. Check it with the team owner and try again.");
    } else {
      t = mustTeam(b.id);
      if (t.archived) fail(404, 'No such team');
      if (t.visibility !== 'public') fail(403, 'This team is private. Ask to join instead, or use a team code.');
    }
    if (!inTeam(t, me.id)) { t.requests = (t.requests || []).filter((r) => r.uid !== me.id); TM.addToTeam(t, me, null); }
    json(res, 200, { team: teamOut(t, me), general: t.general });
  };

  api['POST /api/teams/request'] = async (req, res, me) => { // ask to join a private team; owners approve
    const b = await body(req, 2048), t = mustTeam(b.id);
    if (isGuest(me)) fail(403, 'Guests are added to teams by a team owner.');
    if (t.archived || (t.visibility !== 'public' && !settingsOf(t).discoverable)) fail(404, 'No such team');
    if (inTeam(t, me.id)) return json(res, 200, { ok: true, member: true });
    t.requests ||= [];
    if (b.cancel) { t.requests = t.requests.filter((r) => r.uid !== me.id); store.save(); pushTeam(t); return json(res, 200, { ok: true }); }
    if (!rate('tmreq:' + me.id, 20, 3600000)) fail(429, 'Too many requests. Try again later.');
    if (t.requests.length >= 200 && !t.requests.some((r) => r.uid === me.id)) fail(400, 'This team has too many requests waiting.');
    t.requests = t.requests.filter((r) => r.uid !== me.id); t.requests.push({ uid: me.id, ts: now(), note: cleanText(b.note, 300) });
    store.save(); pushTeam(t);
    for (const o of t.owners) activity(o, { type: 'system', sub: 'teamRequest', from: me.id, team: t.id, text: `${me.name} asked to join ${t.name}` });
    json(res, 200, { ok: true, requested: true });
  };

  api['POST /api/teams/requests/decide'] = async (req, res, me) => {
    const b = await body(req, 1024), t = mustTeam(b.id); seeTeam(t, me); if (!canOwn(t, me)) fail(403, 'Only team owners can answer requests.');
    const r = (t.requests || []).find((x) => x.uid === str(b.uid, 32)); if (!r) fail(404, 'That request was already answered.');
    t.requests = t.requests.filter((x) => x !== r); const u = userById(r.uid);
    if (b.approve && live(u)) TM.addToTeam(t, u, me); else if (live(u)) activity(u.id, { type: 'system', sub: 'teamDenied', from: me.id, team: t.id, text: `Your request to join ${t.name} was declined` });
    store.save(); pushTeam(t); json(res, 200, { ok: true });
  };

  api['POST /api/teams/members'] = async (req, res, me) => { // add / remove people, change owner ↔ member
    const b = await body(req, 32768), t = mustTeam(b.id); seeTeam(t, me);
    if (t.archived) fail(403, 'This team is archived. Restore it first.');
    const own = canOwn(t, me), s = settingsOf(t);
    const add = ids(b.add, 500).map(userById).filter((u) => live(u) && !inTeam(t, u.id));
    const remove = ids(b.remove).filter((i) => inTeam(t, i));
    const roles = isObj(b.roles) ? Object.entries(b.roles).filter(([i, r]) => inTeam(t, i) && ['owner', 'member'].includes(r)) : [];
    if (add.length && !own && !(s.memberAddMembers && t.visibility === 'public' && !isGuest(me))) fail(403, 'Only team owners can add people to this team.');
    if ((remove.length || roles.length) && !own) fail(403, 'Only team owners can remove people or change roles.');
    if (add.some(isGuest) && labelLevel(t) >= 2) fail(403, 'Guests cannot be added to a highly confidential team.');
    if (TM.blockedPair) for (const u of add) if (allOf(t).some((i) => TM.blockedPair(u.id, i))) fail(403, `${u.name} can't join this team because of an information barrier.`);
    for (const [i, r] of roles) if (r === 'owner' && isGuest(userById(i))) fail(400, 'Guests cannot be team owners.');
    const owners = new Set(t.owners); for (const i of remove) owners.delete(i); for (const [i, r] of roles) { if (r === 'owner') owners.add(i); else owners.delete(i); }
    if (!owners.size && allOf(t).filter((i) => !remove.includes(i)).length) fail(400, 'A team needs at least one owner.');
    accessDiff(t, [...add.map((u) => u.id), ...remove], () => {
      for (const u of add) setRole(t, u.id, roleFor(u));
      for (const i of remove) setRole(t, i, null);
      for (const [i, r] of roles) setRole(t, i, r);
    });
    store.save(); pushTeam(t);
    for (const u of add) { activity(u.id, { type: 'added', from: me.id, team: t.id, chan: t.general, text: t.name }); sysMsg(t.general, `${me.name} added ${u.name} to the team`); fireTeamJoin(t, u, me); }
    for (const i of remove) sysMsg(t.general, `${me.name} removed ${userById(i)?.name || 'someone'} from the team`);
    if (!isTeamOwner(t, me) && (add.length || remove.length || roles.length)) ctx.audit && ctx.audit(me, 'team.members', `${t.name}: +${add.length} −${remove.length} roles ${roles.length}`);
    json(res, 200, { team: teamOut(t, me) });
  };

  api['POST /api/teams/leave'] = async (req, res, me) => {
    const b = await body(req, 512), t = mustTeam(b.id); if (!inTeam(t, me.id)) fail(404, 'No such team');
    if (t.owners.length === 1 && t.owners[0] === me.id && allOf(t).length > 1) fail(400, 'You are the only owner. Make someone else an owner before you leave.');
    accessDiff(t, [me.id], () => setRole(t, me.id, null));
    store.save(); pushTeam(t); sysMsg(t.general, `${me.name} left the team`); json(res, 200, { ok: true });
  };

  api['POST /api/teams/archive'] = async (req, res, me) => {
    const b = await body(req, 512), t = mustTeam(b.id); seeTeam(t, me); if (!canOwn(t, me)) fail(403, 'Only team owners can archive the team.');
    const on = b.archived !== false; if (!!t.archived === on) return json(res, 200, { team: teamOut(t, me) });
    if (!on) { t.archived = 0; t.warned = 0; t.active = now(); t.archivedWhy = ''; } else { t.archived = now(); t.archivedWhy = 'owner'; }
    store.save(); pushTeam(t); for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id));
    ctx.audit && ctx.audit(me, on ? 'team.archive' : 'team.restore', `${t.name} (${t.id})`);
    json(res, 200, { team: teamOut(t, me) });
  };
  TM.archive = (t, why) => { t.archived = now(); t.archivedWhy = why || ''; store.save(); pushTeam(t); for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id)); };

  function deleteTeam(t) {
    const viewers = viewersOf(t);
    for (const c of chansOf(t.id)) { const aud = audience(c.id); removeMessages([...chanMsgs(c.id)]); delete db.channels[c.id]; byChan.delete(c.id); delete db.extras[c.id]; emit('channel_deleted', { id: c.id }, aud); }
    for (const g of Object.values(tags())) if (g.team === t.id) delete tags()[g.id];
    for (const p of Object.values(coll('tmPrefs'))) if (p.hiddenTeams) p.hiddenTeams = p.hiddenTeams.filter((i) => i !== t.id);
    delete teams()[t.id]; store.save(); emit('team_removed', { id: t.id, deleted: true }, viewers);
  }
  TM.deleteTeam = deleteTeam;
  api['POST /api/teams/delete'] = async (req, res, me) => {
    const b = await body(req, 512), t = mustTeam(b.id); seeTeam(t, me); if (!canOwn(t, me)) fail(403, 'Only team owners can delete the team.');
    ctx.audit && ctx.audit(me, 'team.delete', `${t.name} (${t.id}), ${chansOf(t.id).length} channels`);
    deleteTeam(t); json(res, 200, { ok: true });
  };

  api['POST /api/teams/renew'] = async (req, res, me) => { // expiry policy: an owner keeps the team alive
    const b = await body(req, 512), t = mustTeam(b.id); if (!canOwn(t, me)) fail(403, 'Only team owners can renew the team.');
    t.active = now(); t.warned = 0; if (t.archived && t.archivedWhy === 'expired') { t.archived = 0; t.archivedWhy = ''; for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id)); }
    store.save(); pushTeam(t); json(res, 200, { team: teamOut(t, me) });
  };

  // ---------- team channels ----------
  api['POST /api/teams/channel'] = async (req, res, me) => {
    const b = await body(req, 300000), t = mustTeam(b.team); if (!inTeam(t, me.id)) fail(404, 'No such team');
    if (t.archived) fail(403, 'This team is archived, so it is read-only.');
    const type = ['private', 'shared'].includes(b.type) ? b.type : 'standard';
    if (!canMakeChannel(t, me, type !== 'standard')) fail(403, type === 'standard' ? 'Only team owners can add channels to this team.' : 'Only team owners can add private or shared channels here.');
    if (chansOf(t.id).length >= 200) fail(400, 'This team has too many channels.');
    const name = checkName(cleanName(b.name, 50), me, 'channel'); if (!name) fail(400, 'Give the channel a name.');
    if (name.toLowerCase() === 'general') fail(409, 'Every team already has a General channel.');
    uniqueChanName(t, name);
    let members;
    if (type === 'private') members = [me.id, ...ids(b.members).filter((i) => i !== me.id && inTeam(t, i))];
    if (type === 'shared') {
      members = [me.id, ...ids(b.members).filter((i) => i !== me.id && live(userById(i)))];
      if (labelLevel(t) >= 2 && members.some((i) => isGuest(userById(i)))) fail(403, 'Guests cannot be added to a highly confidential team.');
    }
    const c = makeChannel(t, me, { name, description: cleanText(b.description, 1024), kind: b.kind, type, members, postRule: b.postRule, replyRule: b.replyRule, picture: cleanPic(b.picture) });
    store.save();
    if (type === 'shared') pushTeam(t); // outsiders now see the team's name and this channel
    emit('channel', chanOut(c), audience(c.id));
    sysMsg(c.id, `${me.name} created this channel`);
    for (const i of members || []) if (i !== me.id) activity(i, { type: 'added', from: me.id, team: t.id, chan: c.id, text: `${t.name} › ${name}` });
    json(res, 200, chanOut(c));
  };

  // a team channel's settings, or the teams area's own fields on any channel (description, picture, posts/chat, moderation, label)
  const MINE = ['description', 'picture', 'kind', 'postRule', 'replyRule', 'moderators', 'label'];
  function applyMine(me, c, b, notes) {
    if (b.description !== undefined) c.description = cleanText(b.description, 1024);
    if (b.picture !== undefined) c.picture = cleanPic(b.picture);
    if (b.kind !== undefined) { if (['', 'posts'].includes(c.kind || '')) { const k = b.kind === 'posts' ? 'posts' : ''; if (k !== (c.kind || '')) { c.kind = k; notes.push(k ? `${me.name} made this a posts channel` : `${me.name} made this a chat channel`); } } }
    if (b.postRule !== undefined) { const r = b.postRule === 'moderators' ? 'moderators' : ''; if (r !== (c.postRule || '')) { if (r) c.postRule = r; else delete c.postRule; notes.push(r ? `${me.name} set this channel so only moderators start new posts` : `${me.name} let everyone start new posts`); } }
    if (b.replyRule !== undefined) { const r = b.replyRule === 'none' ? 'none' : ''; if (r !== (c.replyRule || '')) { if (r) c.replyRule = r; else delete c.replyRule; notes.push(r ? `${me.name} turned off replies` : `${me.name} turned replies back on`); } }
    if (b.moderators !== undefined) { const t = teamOfChan(c); c.moderators = ids(b.moderators, 100).filter((i) => live(userById(i)) && (!t || inTeam(t, i) || (c.members || []).includes(i))); }
    if (b.label !== undefined) { const l = labelOk(b.label); if (l && TM.labelById && TM.labelById(l).level >= 2 && (audience(c.id) || []).some((i) => isGuest(userById(i)))) fail(400, 'Remove the guests first: highly confidential chats cannot have guests.'); if (l) c.label = l; else delete c.label; }
  }
  const origUpdate = api['POST /api/channel/update'];
  api['POST /api/channel/update'] = async (req, res, me, url) => {
    const b = await body(req, 300000), c = db.channels[str(b.id, 64)];
    if (!c || !canSee(me, c.id)) fail(404, 'No such channel');
    if (b.name !== undefined && !c.team) { const n = String(b.name || ''); if (n && TM.checkText) TM.checkText(n, me, 'name'); }
    const notes = [];
    if (c.team) {
      const t = teamOfChan(c); if (t.archived) fail(403, 'This team is archived, so it is read-only.');
      if (!canEditChannel(t, c, me)) fail(403, 'Only team owners can change this channel.');
      if (b.name !== undefined && !c.general) { const n = checkName(cleanName(b.name, 50), me, 'channel'); if (!n) fail(400, 'Invalid name'); if (n.toLowerCase() === 'general') fail(409, 'Every team already has a General channel.'); uniqueChanName(t, n, c.id); if (n !== c.name) { notes.push(`${me.name} renamed this channel to ${n}`); c.name = n; } }
      if (b.topic !== undefined) c.topic = cleanText(b.topic, 100);
      if (b.readonly !== undefined && !!b.readonly !== !!c.readonly) { c.readonly = !!b.readonly; notes.push(c.readonly ? `${me.name} made this read-only (admins post)` : `${me.name} allowed everyone to post`); }
      if (b.slow !== undefined) c.slow = Math.max(0, Math.min(Math.round(Number(b.slow)) || 0, 21600));
      if (b.ttl !== undefined) c.ttl = Math.max(0, Math.min(Math.round(Number(b.ttl)) || 0, 31536000));
      applyMine(me, c, b, notes);
      store.save(); emit('channel', chanOut(c), audience(c.id)); for (const n of notes) sysMsg(c.id, n);
      return json(res, 200, chanOut(c));
    }
    const mine = MINE.some((k) => b[k] !== undefined);
    if (mine) { if (!(isAdmin(me) || (c.members && c.by === me.id))) fail(403, 'Only admins can change this.'); applyMine(me, c, b, notes); }
    const core = ['name', 'topic', 'category', 'readonly', 'slow', 'ttl'].some((k) => b[k] !== undefined);
    if (mine) { store.save(); if (!core) emit('channel', chanOut(c), audience(c.id)); for (const n of notes) sysMsg(c.id, n); }
    if (core) return origUpdate(req, res, me, url);
    json(res, 200, chanOut(c));
  };

  const origDelete = api['POST /api/channel/delete'];
  api['POST /api/channel/delete'] = async (req, res, me, url) => {
    const b = await body(req, 256), c = db.channels[str(b.id, 64)];
    if (!c || !c.team) return origDelete(req, res, me, url);
    if (!canSee(me, c.id) && !isAdmin(me)) fail(404, 'No such channel');
    const t = teamOfChan(c);
    if (c.general) fail(400, "A team's General channel can't be deleted.");
    if (!canDeleteChannel(t, c, me)) fail(403, 'Only team owners can delete channels in this team.');
    const aud = audience(c.id); removeMessages([...chanMsgs(c.id)]); delete db.channels[c.id]; byChan.delete(c.id); delete db.extras[c.id];
    store.save(); emit('channel_deleted', { id: c.id }, aud); if (c.shared) pushTeam(t);
    sysMsg(t.general, `${me.name} deleted the channel ${c.name}`); json(res, 200, { ok: true });
  };

  // private / shared channel members (channel owners and team owners manage them)
  const origMembers = api['POST /api/channel/members'];
  api['POST /api/channel/members'] = async (req, res, me, url) => {
    const b = await body(req, 16384), c = db.channels[str(b.id, 64)];
    if (!c || !c.team) {
      if (isGuest(me) && Array.isArray(b.add) && b.add.length) fail(403, "Guests can't add people to group chats.");
      if (TM.blockedPair && c && c.members) for (const i of ids(b.add)) if ([...c.members, me.id].some((x) => TM.blockedPair(i, x))) fail(403, `${userById(i)?.name || 'That person'} can't join this chat because of an information barrier.`);
      return origMembers(req, res, me, url);
    }
    if (!c.members || !canSee(me, c.id)) fail(404, 'No such channel');
    const t = teamOfChan(c); if (t.archived) fail(403, 'This team is archived, so it is read-only.');
    const add = ids(b.add).filter((i) => !c.members.includes(i) && live(userById(i)) && (c.shared || inTeam(t, i)));
    const remove = ids(b.remove).filter((i) => c.members.includes(i));
    const owners = isObj(b.owners) ? Object.entries(b.owners).filter(([i]) => c.members.includes(i) || add.includes(i)) : [];
    const leaving = remove.length === 1 && remove[0] === me.id && !add.length && !owners.length;
    const manage = canOwn(t, me) || chanOwner(c, me);
    if (!leaving && !manage) fail(403, 'Only the channel owners can change who is in this channel.');
    if (c.shared && labelLevel(t, c) >= 2 && add.some((i) => isGuest(userById(i)))) fail(403, 'Guests cannot be added to a highly confidential channel.');
    const before = new Set(c.members);
    c.members = [...c.members.filter((i) => !remove.includes(i)), ...add];
    c.owners = (c.owners || []).filter((i) => c.members.includes(i));
    for (const [i, on] of owners) { c.owners = c.owners.filter((x) => x !== i); if (on) c.owners.push(i); }
    if (!c.owners.length && c.members.length) c.owners = [c.members[0]];
    store.save();
    const gone = [...before].filter((i) => !c.members.includes(i));
    emit('channel_removed', { id: c.id }, gone); emit('channel', chanOut(c), c.members);
    if (c.shared) pushTeam(t); for (const i of gone) if (!viewersOf(t).includes(i)) emit('team_removed', { id: t.id }, [i]);
    for (const i of add) { activity(i, { type: 'added', from: me.id, team: t.id, chan: c.id, text: `${t.name} › ${c.name}` }); sysMsg(c.id, `${me.name} added ${userById(i).name}`); }
    for (const i of gone) sysMsg(c.id, i === me.id ? `${me.name} left the channel` : `${me.name} removed ${userById(i)?.name || 'someone'}`);
    json(res, 200, { ok: true, channel: chanOut(c) });
  };

  // guests can't create channels or group chats; channel names go through the bad-word filter; information barriers for new groups
  const origCreate = api['POST /api/channel'];
  api['POST /api/channel'] = async (req, res, me, url) => {
    const b = await body(req, 4096);
    if (isGuest(me) || me.bot) fail(403, "Guests can't create channels or group chats.");
    if (b.name && TM.checkText) TM.checkText(String(b.name), me, 'name');
    if (Array.isArray(b.members) && TM.blockedPair) for (const i of ids(b.members)) for (const j of [me.id, ...ids(b.members)]) if (i !== j && TM.blockedPair(i, j)) fail(403, "These people can't be in the same chat because of an information barrier.");
    return origCreate(req, res, me, url);
  };

  // ---------- hide / show (per person) ----------
  api['POST /api/teams/hide'] = async (req, res, me) => {
    const b = await body(req, 512), p = prefsOf(me.id), on = b.hidden !== false;
    if (b.chan !== undefined) { const chan = str(b.chan, 64); if (!canSee(me, chan) || !db.channels[chan] || !db.channels[chan].team) fail(404, 'No such channel'); if (db.channels[chan].general && on) fail(400, "The General channel can't be hidden."); p.hidden = p.hidden.filter((x) => x !== chan && db.channels[x]); if (on) p.hidden.push(chan); }
    if (b.team !== undefined) { const t = mustTeam(b.team); if (!viewersOf(t).includes(me.id)) fail(404, 'No such team'); p.hiddenTeams = (p.hiddenTeams || []).filter((x) => x !== t.id && teams()[x]); if (on) p.hiddenTeams.push(t.id); }
    p.hidden = p.hidden.slice(-500); p.hiddenTeams = (p.hiddenTeams || []).slice(-200);
    store.save(); emit('tm_prefs', p, [me.id]); json(res, 200, { prefs: p });
  };

  // ---------- tags (@designers) ----------
  const RESERVED = new Set(['everyone', 'here', 'channel', 'team', 'all']);
  api['POST /api/teams/tags'] = async (req, res, me) => {
    const b = await body(req, 32768), op = str(b.op, 10);
    let g = op === 'add' ? null : tags()[str(b.id, 32)];
    if (op !== 'add' && (!g || !Object.prototype.hasOwnProperty.call(tags(), str(b.id, 32)))) fail(404, 'No such tag');
    const teamId = g ? g.team : str(b.team, 32), t = teamId ? mustTeam(teamId) : null;
    if (t) { if (!inTeam(t, me.id) && !isAdmin(me)) fail(404, 'No such team'); if (!(canOwn(t, me) || (settingsOf(t).memberManageTags && !isGuest(me)))) fail(403, 'Only team owners can manage tags here.'); }
    else if (!isAdmin(me)) fail(403, 'Only admins can manage session-wide tags.');
    if (op === 'delete') { delete tags()[g.id]; store.save(); pushTags(teamId); return json(res, 200, { ok: true }); }
    if (op !== 'add' && op !== 'update') fail(400, 'Bad operation');
    if (b.name !== undefined || op === 'add') {
      const name = str(b.name, 40).trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '-');
      if (!/^[\p{L}\p{N}_-]{2,30}$/u.test(name) || RESERVED.has(name)) fail(400, 'Tag names use 2–30 letters, numbers, - or _ (no spaces).');
      if (Object.values(db.users).some((u) => !u.deleted && u.name.toLowerCase() === name)) fail(409, 'Someone in this session already has that name.');
      if (Object.values(tags()).some((x) => x !== g && x.name === name && (x.team || '') === (teamId || ''))) fail(409, 'A tag with that name exists.');
      if (TM.checkText) TM.checkText(name, me, 'name');
      if (!g) { if (Object.keys(tags()).length >= 1000) fail(400, 'Too many tags.'); const id = rid(5); g = tags()[id] = { id, name, team: teamId || '', members: [], by: me.id, created: now() }; }
      g.name = name;
    }
    if (b.members !== undefined) g.members = ids(b.members, 500).filter((i) => live(userById(i)) && (!t || inTeam(t, i)));
    store.save(); pushTags(teamId); json(res, 200, { tag: tagOut(g) });
  };

  // ---------- messages: archived teams, moderation, guests, @team / @channel, tags, posting to several channels ----------
  const xposts = new WeakMap(), XPOST = Symbol('xpost'); // internal marker: JSON request bodies can never carry it
  const MENTION_WORD = /(^|[\s(])@([\p{L}\p{N}_-]{2,30})(?![\p{L}\p{N}_-])/gu;
  hooks.beforeMessage.push((m, p, me) => {
    const c = db.channels[m.chan]; const t = c && c.team ? teams()[c.team] : null;
    if (t && t.archived) fail(403, 'This team is archived, so its channels are read-only.');
    if (c && !me.bot) {
      const mod = isModerator(c, me);
      if (!p.thread && c.postRule === 'moderators' && !mod) fail(403, 'Only moderators can start new posts in this channel. You can still reply.');
      if (p.thread && c.replyRule === 'none' && !mod) fail(403, 'Replies are turned off in this channel.');
    }
    const text = String(m.text || '');
    if (isGuest(me) && /(^|\s)@(everyone|here)(?![\p{L}\p{N}_])/iu.test(text)) fail(403, "Guests can't use @everyone or @here.");
    if (c && text.includes('@')) {
      // @channel and @team notify everyone who can see this channel (permission like @everyone; a team setting can turn them off)
      const wantsCh = /(^|\s)@channel(?![\p{L}\p{N}_])/iu.test(text), wantsTeam = !!t && /(^|\s)@team(?![\p{L}\p{N}_])/iu.test(text);
      if (wantsCh || wantsTeam) {
        const s = t ? settingsOf(t) : null;
        const ok = !isGuest(me) && (isAdmin(me) || (t ? (isTeamOwner(t, me) || (wantsTeam ? s.mentionTeam : s.mentionChannel)) : !!ctx.S.membersCanEveryone));
        if (ok) { m.everyone = true; m.mentionAll = wantsTeam ? 'team' : 'channel'; }
      }
    }
    if (text.includes('@')) { // tags: team tags in that team's channels, session-wide tags elsewhere
      const found = new Map(); let x; MENTION_WORD.lastIndex = 0;
      const pool = Object.values(tags()).filter((g) => (g.team ? !!t && g.team === t.id : !t));
      while ((x = MENTION_WORD.exec(text))) { const name = x[2].toLowerCase(), g = pool.find((y) => y.name === name); if (g) found.set(g.id, g); }
      if (found.size) {
        const who = new Set(); for (const g of found.values()) for (const i of g.members) { const u = userById(i); if (i !== me.id && live(u) && canSee(u, m.chan)) who.add(i); }
        m.tags = [...found.values()].map((g) => ({ id: g.id, name: g.name })); m.tagMentions = [...who];
        if (who.size) m.mentions = [...new Set([...(m.mentions || []), ...who])];
      }
    }
    if (Array.isArray(p.tmAlso) && p.tmAlso.length && c && !p.thread) { // post in several channels at once (each copy links to the group)
      const list = ids(p.tmAlso, 20).filter((ch) => ch !== m.chan && db.channels[ch] && canSee(me, ch)).slice(0, 10);
      if (list.length) { const g = { id: rid(6), chans: [m.chan, ...list] }; m.xpost = g; xposts.set(m, { me, p, list, g }); }
    }
  });
  hooks.afterMessage.push((m) => {
    const c = db.channels[m.chan], t = c && c.team ? teams()[c.team] : null;
    if (t && m.from && !m.system) t.active = m.ts;
    // createMessage may replace m.mentions with the people mentioned by name; put the tag members back
    if (m.tagMentions && m.tagMentions.length) {
      const have = new Set(m.mentions || []), missing = m.tagMentions.filter((i) => !have.has(i));
      if (missing.length) { m.mentions = [...have, ...missing]; store.save(); emit('update', msgOut(m), audience(m.chan)); for (const i of missing) activity(i, { type: 'mention', from: m.from, chan: m.chan, msg: m.id, text: String(m.text || '').slice(0, 140) }); }
    }
    const x = xposts.get(m);
    if (x) {
      xposts.delete(m);
      setImmediate(() => {
        const made = [];
        for (const ch of x.list) {
          try { const copy = ctx.createMessage(x.me, { ...x.p, chan: ch, tmAlso: undefined, thread: undefined, replyTo: undefined, sendAt: undefined, [XPOST]: x.g }); made.push(copy); }
          catch (e) { x.g.chans = x.g.chans.filter((y) => y !== ch); }
        }
        if (x.g.chans.length !== x.list.length + 1) { store.save(); emit('update', msgOut(m), audience(m.chan)); for (const cm of made) emit('update', msgOut(cm), audience(cm.chan)); }
      });
    }
  });
  hooks.beforeMessage.push((m, p) => { if (p[XPOST]) m.xpost = p[XPOST]; }); // the copies made above
  // reactions and messages count as team activity (expiry policy)
  hooks.afterReact.push((m) => { const t = teamOfChan(m.chan); if (t) t.active = now(); });

  // ---------- channel / team analytics (team owners, channel owners, admins) ----------
  function stats(chans, days) {
    const DAY = 86400000, start = new Date(); start.setHours(0, 0, 0, 0); const from = start.getTime() - (days - 1) * DAY;
    const perDay = Array(days).fill(0), posters = {}, people = new Set(); let messages = 0, replies = 0, posts = 0, reactions = 0, files = 0;
    for (const chan of chans) for (const m of chanMsgs(chan)) {
      if (m.ts < from || m.system || !m.from || m.deleted) continue;
      const i = Math.min(days - 1, Math.floor((m.ts - from) / DAY)); perDay[i]++; messages++;
      if (m.thread) replies++; else posts++;
      posters[m.from] = (posters[m.from] || 0) + 1; people.add(m.from);
      for (const l of Object.values(m.reactions || {})) reactions += l.length; files += (m.files || []).length;
    }
    return { days, from, perDay, messages, posts, replies, reactions, files, active: people.size, top: Object.entries(posters).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ id, name: userById(id)?.name || '?', n })) };
  }
  api['GET /api/teams/stats'] = async (req, res, me, url) => {
    const q = url.searchParams, days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
    if (q.get('team')) {
      const t = mustTeam(q.get('team')); if (!canOwn(t, me)) fail(403, 'Only team owners and admins can see team analytics.');
      const chans = chansOf(t.id).filter((c) => !c.members || canSee(me, c.id)).map((c) => c.id);
      return json(res, 200, { ...stats(chans, days), channels: chans.length, people: allOf(t).length });
    }
    const chan = str(q.get('chan'), 64), c = db.channels[chan];
    if (!c || !canSee(me, chan)) fail(404, 'No such channel');
    const t = teamOfChan(c);
    if (!(isAdmin(me) || isTeamOwner(t, me) || chanOwner(c, me) || (c.members && !c.team && c.by === me.id))) fail(403, 'Only team owners and admins can see channel analytics.');
    json(res, 200, stats([chan], days));
  };

  // ---------- admin helpers (Manage › Teams) ----------
  TM.adminTeams = () => Object.values(teams()).map((t) => ({ id: t.id, name: t.name, picture: t.picture || '', visibility: t.visibility, owners: t.owners, members: t.members.length, guests: t.guests.length, channels: chansOf(t.id).length, label: t.label || '', archived: t.archived || 0, archivedWhy: t.archivedWhy || '', created: t.created, active: t.active || t.created, warned: t.warned || 0 }));
  TM.setOwner = (t, u, me) => { if (!live(u) || isGuest(u)) fail(400, 'Pick a member (not a guest) as owner.'); accessDiff(t, [u.id], () => setRole(t, u.id, 'owner')); store.save(); pushTeam(t); activity(u.id, { type: 'added', from: me.id, team: t.id, chan: t.general, text: t.name }); };
  TM.unarchive = (t) => { t.archived = 0; t.archivedWhy = ''; t.warned = 0; t.active = now(); store.save(); pushTeam(t); for (const c of chansOf(t.id)) emit('channel', chanOut(c), audience(c.id)); };
  TM.stats = stats;
  void msgById;
};
