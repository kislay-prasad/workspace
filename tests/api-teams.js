'use strict';
// Teams area API tests (docs/features-teams.md): teams and channels, admin and security rules, bots and automation.
// Many permission checks: non-members never see team channels, messages or files; guests are limited; private and
// shared channels; information barriers; legal hold; PIN sign-in; API keys and webhook secrets.
const crypto = require('crypto');
const H = require('./harness');
const { readZipIndex } = require('../lib/zip');
const fs = require('fs');
const os = require('os');
const path = require('path');

H.suite('Teams area: teams, channels, admin and security, bots', async (t) => {
  const s = await t.server();
  const owner = s.owner, bob = await s.user('Bob'), carol = await s.user('Carol'), dan = await s.user('Dan'), ada = await s.user('Ada', 'admin');
  const call = s.call, ok = (r) => t.eq(r.s, 200, r.d);
  let team, gen, priv;

  // ---------------- teams and channels ----------------
  await t.section('create a team from a template: channels, owner, code; outsiders see nothing', async () => {
    const r = await call('POST', '/api/teams/create', { name: 'Marketing', template: 'project', description: 'Launches', members: [bob.id] }, owner.token); ok(r);
    team = r.d.team; gen = r.d.general; t.ok(team.code && team.code.length === 7, team); t.eq(team.owners, [owner.id]); t.ok(team.members.includes(bob.id));
    const chans = Object.values(s.db.channels).filter((c) => c.team === team.id); t.eq(chans.length, 5, chans.map((c) => c.name));
    t.ok(s.db.extras[gen] && s.db.extras[gen].todos.length > 0, 'template tasks seeded');
    ok(await call('POST', '/api/send', { chan: gen, text: 'secret plan' }, bob.token));
    t.eq((await call('GET', `/api/messages?chan=${gen}`, undefined, carol.token)).s, 404);
    t.eq((await call('POST', '/api/send', { chan: gen, text: 'x' }, carol.token)).s, 404);
    t.eq((await call('GET', `/api/collab?chan=${gen}`, undefined, carol.token)).s, 404);
    t.eq((await call('GET', `/api/files?chan=${gen}`, undefined, carol.token)).s, 404);
    const se = await call('GET', '/api/search?q=secret', undefined, carol.token); t.ok(!(se.d.results || []).length, se.d);
    const byid = await call('POST', '/api/messages/byids', { ids: [s.db.messages.find((m) => m.text === 'secret plan').id] }, carol.token); t.eq((byid.d.messages || []).length, 0);
    const ev = s.sse(carol.token); const init = await ev.waitFor('init'); ev.close();
    t.ok(!init.channels.some((c) => c.team), 'no team channels in init'); t.eq(init.teams, []);
    const evb = s.sse(bob.token); const ib = await evb.waitFor('init'); evb.close();
    t.eq(ib.teams.length, 1); t.eq(ib.teams[0].code, undefined, 'members do not see the code'); t.ok(ib.channels.filter((c) => c.team === team.id).length === 5);
  });

  await t.section('files in team channels are readable only by the team', async () => {
    const up = await s.upload(bob.token, 'plan.txt', Buffer.from('hello')); ok(up);
    ok(await call('POST', '/api/send', { chan: gen, text: 'file', files: [{ id: up.d.id }] }, bob.token));
    const get = (tok) => fetch(`${s.B}/files/${up.d.id}/plan.txt?token=${tok}`).then((r) => r.status);
    t.eq(await get(owner.token), 200); t.eq(await get(carol.token), 404);
  });

  await t.section('live events: team channel messages reach only the team', async () => {
    const ec = s.sse(carol.token), eb = s.sse(bob.token); await ec.waitFor('init'); await eb.waitFor('init');
    ok(await call('POST', '/api/send', { chan: gen, text: 'live only for us' }, owner.token));
    await eb.waitFor('message', (m) => m.text === 'live only for us'); await t.wait(150);
    t.ok(!ec.has('message', (m) => m.text === 'live only for us'), 'outsider got the message'); ec.close(); eb.close();
  });

  await t.section('join with a code (rate-limited), public teams, private requests approved by owners', async () => {
    t.eq((await call('POST', '/api/teams/join', { code: 'nope123' }, carol.token)).s, 404);
    const j = await call('POST', '/api/teams/join', { code: team.code }, carol.token); ok(j); t.eq(j.d.general, gen);
    t.eq((await call('GET', `/api/messages?chan=${gen}`, undefined, carol.token)).s, 200);
    const pub = await call('POST', '/api/teams/create', { name: 'Book club', visibility: 'public' }, bob.token); ok(pub);
    const dir = await call('GET', '/api/teams/directory', undefined, dan.token); t.ok(dir.d.teams.some((x) => x.id === pub.d.team.id && x.visibility === 'public'), dir.d);
    t.ok(dir.d.teams.every((x) => !x.members && !x.code), 'directory leaks no members or codes');
    ok(await call('POST', '/api/teams/join', { id: pub.d.team.id }, dan.token));
    t.eq((await call('POST', '/api/teams/join', { id: team.id }, dan.token)).s, 403, 'private team needs a request');
    ok(await call('POST', '/api/teams/request', { id: team.id, note: 'let me in' }, dan.token));
    t.eq((await call('POST', '/api/teams/requests/decide', { id: team.id, uid: dan.id, approve: true }, bob.token)).s, 403, 'members cannot approve');
    const ev = s.sse(dan.token); await ev.waitFor('init');
    ok(await call('POST', '/api/teams/requests/decide', { id: team.id, uid: dan.id, approve: true }, owner.token));
    await ev.waitFor('team', (x) => x.id === team.id && !x.partial); await ev.waitFor('channel', (c) => c.team === team.id); ev.close();
    t.ok(s.db.teams[team.id].members.includes(dan.id));
    const codes = []; for (let i = 0; i < 12; i++) codes.push((await call('POST', '/api/teams/join', { code: 'zzzzzz' + i }, bob.token)).s);
    t.ok(codes.includes(429), 'code guessing is rate-limited: ' + codes);
  });

  await t.section('private channels: only their members; leaving the team removes access', async () => {
    const r = await call('POST', '/api/teams/channel', { team: team.id, name: 'Leadership', type: 'private', members: [bob.id] }, owner.token); ok(r); priv = r.d.id;
    t.eq((await call('GET', `/api/messages?chan=${priv}`, undefined, carol.token)).s, 404);
    ok(await call('GET', `/api/messages?chan=${priv}`, undefined, bob.token));
    t.eq((await call('POST', '/api/channel/members', { id: priv, add: [carol.id] }, bob.token)).s, 403, 'members cannot add to a private channel');
    t.eq((await call('POST', '/api/teams/channel', { team: team.id, name: 'Outsider room', type: 'private', members: [ada.id] }, owner.token)).d.members.includes(ada.id), false, 'non-team people are not added to private channels');
    ok(await call('POST', '/api/channel/members', { id: priv, add: [carol.id] }, owner.token));
    ok(await call('GET', `/api/messages?chan=${priv}`, undefined, carol.token));
    const ev = s.sse(carol.token); await ev.waitFor('init');
    ok(await call('POST', '/api/teams/leave', { id: team.id }, carol.token));
    await ev.waitFor('channel_removed', (c) => c.id === priv); await ev.waitFor('team_removed', (x) => x.id === team.id); ev.close();
    t.eq((await call('GET', `/api/messages?chan=${priv}`, undefined, carol.token)).s, 404);
    t.ok(!s.db.channels[priv].members.includes(carol.id));
  });

  await t.section('shared channels include outsiders, who see only that channel and the team name', async () => {
    const r = await call('POST', '/api/teams/channel', { team: team.id, name: 'With partners', type: 'shared', members: [carol.id] }, owner.token); ok(r);
    ok(await call('GET', `/api/messages?chan=${r.d.id}`, undefined, carol.token));
    t.eq((await call('GET', `/api/messages?chan=${gen}`, undefined, carol.token)).s, 404);
    const ev = s.sse(carol.token); const init = await ev.waitFor('init'); ev.close();
    const tm = init.teams.find((x) => x.id === team.id); t.ok(tm && tm.partial && !tm.members && !tm.owners, tm);
    t.eq(init.channels.filter((c) => c.team === team.id).map((c) => c.id), [r.d.id]);
  });

  await t.section('guests: only what they are added to; no teams/channels/groups/@everyone; label limits', async () => {
    const g = await s.user('Gina'); t.eq((await call('POST', '/api/admin/user/role', { id: g.id, role: 'guest' }, bob.token)).s, 403);
    ok(await call('POST', '/api/admin/user/role', { id: g.id, role: 'guest' }, ada.token));
    t.eq((await call('GET', '/api/messages?chan=general', undefined, g.token)).s, 404, 'guests do not see session channels');
    const ev = s.sse(g.token); const init = await ev.waitFor('init'); t.ok(!init.channels.some((c) => c.id === 'general'), 'no general in init');
    const eb = s.sse(bob.token); await eb.waitFor('init');
    ok(await call('POST', '/api/send', { chan: 'general', text: 'members only news' }, bob.token)); await t.wait(150);
    t.ok(!ev.has('message', (m) => m.text === 'members only news'), 'guest received a general message');
    t.eq((await call('POST', '/api/teams/create', { name: 'Guest team' }, g.token)).s, 403);
    t.eq((await call('POST', '/api/channel', { name: 'guestchan' }, g.token)).s, 403);
    t.eq((await call('POST', '/api/channel', { name: 'G group', members: [bob.id] }, g.token)).s, 403);
    t.eq((await call('POST', '/api/chatux/chat/new', { members: [bob.id, carol.id] }, g.token)).s, 403, 'no group chats via New chat either');
    ok(await call('POST', '/api/chatux/chat/new', { members: [bob.id] }, g.token));
    t.eq((await call('POST', '/api/teams/join', { code: team.code }, g.token)).s, 403);
    ok(await call('POST', '/api/teams/members', { id: team.id, add: [g.id] }, owner.token));
    t.ok(s.db.teams[team.id].guests.includes(g.id), 'added as a team guest'); t.ok(!s.db.teams[team.id].members.includes(g.id));
    ok(await call('GET', `/api/messages?chan=${gen}`, undefined, g.token));
    t.eq((await call('POST', '/api/send', { chan: gen, text: 'hi @everyone' }, g.token)).s, 403);
    t.eq((await call('POST', '/api/teams/channel', { team: team.id, name: 'Guest made' }, g.token)).s, 403, 'guests cannot add channels by default');
    ok(await call('POST', '/api/tm/admin/guestchans', { uid: g.id, chans: ['general'] }, ada.token));
    await ev.waitFor('channel', (c) => c.id === 'general'); ok(await call('GET', '/api/messages?chan=general', undefined, g.token));
    t.eq((await call('POST', '/api/teams/update', { id: team.id, label: 'highly' }, owner.token)).s, 400, 'highly confidential needs the guests out first');
    ok(await call('POST', '/api/teams/members', { id: team.id, remove: [g.id] }, owner.token));
    ok(await call('POST', '/api/teams/update', { id: team.id, label: 'highly' }, owner.token));
    t.eq((await call('POST', '/api/teams/members', { id: team.id, add: [g.id] }, owner.token)).s, 403, 'no guests in highly confidential teams');
    ok(await call('POST', '/api/teams/update', { id: team.id, label: '' }, owner.token));
    ok(await call('POST', '/api/admin/user/role', { id: g.id, role: 'member' }, ada.token));
    ok(await call('GET', '/api/messages?chan=general', undefined, g.token)); ev.close(); eb.close();
  });

  await t.section('moderation: who can post, who can reply; archived teams are read-only', async () => {
    ok(await call('POST', '/api/channel/update', { id: gen, postRule: 'moderators', moderators: [dan.id] }, owner.token));
    t.eq((await call('POST', '/api/send', { chan: gen, text: 'new post' }, bob.token)).s, 403);
    const p = await call('POST', '/api/send', { chan: gen, text: 'mod post' }, dan.token); ok(p);
    ok(await call('POST', '/api/send', { chan: gen, text: 'a reply', thread: p.d.id }, bob.token));
    ok(await call('POST', '/api/channel/update', { id: gen, postRule: '', replyRule: 'none' }, owner.token));
    t.eq((await call('POST', '/api/send', { chan: gen, text: 'reply 2', thread: p.d.id }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/channel/update', { id: gen, replyRule: '' }, bob.token)).s, 403, 'members cannot change moderation');
    ok(await call('POST', '/api/channel/update', { id: gen, replyRule: '' }, owner.token));
    t.eq((await call('POST', '/api/teams/archive', { id: team.id }, bob.token)).s, 403);
    ok(await call('POST', '/api/teams/archive', { id: team.id }, owner.token));
    t.eq((await call('POST', '/api/send', { chan: gen, text: 'x' }, owner.token)).s, 403);
    t.eq((await call('POST', '/api/react', { id: p.d.id, emoji: '👍' }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/note', { chan: gen, text: 'x', v: s.db.extras[gen].note.v }, bob.token)).s, 403);
    ok(await call('GET', `/api/messages?chan=${gen}`, undefined, bob.token));
    ok(await call('POST', '/api/teams/archive', { id: team.id, archived: false }, owner.token));
    ok(await call('POST', '/api/send', { chan: gen, text: 'back' }, bob.token));
  });

  await t.section('tags notify their members; only owners (or allowed members) manage them', async () => {
    t.eq((await call('POST', '/api/teams/tags', { op: 'add', team: team.id, name: 'designers', members: [dan.id] }, bob.token)).s, 403);
    ok(await call('POST', '/api/teams/tags', { op: 'add', team: team.id, name: 'designers', members: [dan.id, bob.id] }, owner.token));
    t.eq((await call('POST', '/api/teams/tags', { op: 'add', team: team.id, name: 'Bob' }, owner.token)).s, 409, 'tag names cannot clash with people');
    t.eq((await call('POST', '/api/teams/tags', { op: 'add', name: 'everyone-else' }, bob.token)).s, 403, 'session tags are for admins');
    const ev = s.sse(dan.token); await ev.waitFor('init');
    ok(await call('POST', '/api/send', { chan: gen, text: 'review please @designers' }, bob.token));
    const m = await ev.waitFor('message', (x) => x.text === 'review please @designers'); t.ok(m.mentions.includes(dan.id), m); t.ok(!m.mentions.includes(bob.id), 'not the sender');
    ok(await call('POST', '/api/send', { chan: gen, text: 'ping @designers and @Bob' }, owner.token));
    const m2 = await ev.waitFor('update', (x) => x.text === 'ping @designers and @Bob' && (x.mentions || []).includes(dan.id) && x.mentions.includes(bob.id)); t.ok(m2, 'tag members kept with name mentions'); ev.close();
  });

  await t.section('@team and @channel follow team settings; guests and outsiders never', async () => {
    const r = await call('POST', '/api/send', { chan: gen, text: 'all hands @team' }, bob.token); ok(r); t.ok(s.db.messages.find((m) => m.id === r.d.id).everyone);
    ok(await call('POST', '/api/teams/update', { id: team.id, settings: { mentionTeam: false } }, owner.token));
    const r2 = await call('POST', '/api/send', { chan: gen, text: 'again @team' }, bob.token); ok(r2); t.ok(!s.db.messages.find((m) => m.id === r2.d.id).everyone);
    const r3 = await call('POST', '/api/send', { chan: gen, text: 'owner @team' }, owner.token); t.ok(s.db.messages.find((m) => m.id === r3.d.id).everyone, 'owners can always');
  });

  await t.section('post in several channels at once (only where you may post)', async () => {
    const other = Object.values(s.db.channels).find((c) => c.team === team.id && c.name === 'Design').id;
    const r = await call('POST', '/api/send', { chan: gen, text: 'cross post', tmAlso: [other, priv, 'general'] }, dan.token); ok(r); await t.wait(150);
    const copies = s.db.messages.filter((m) => m.text === 'cross post'); t.eq(copies.length, 3, copies.map((m) => m.chan));
    t.ok(!copies.some((m) => m.chan === priv), 'not in a private channel Dan is not in'); t.ok(copies.every((m) => m.xpost && m.xpost.id === copies[0].xpost.id));
  });

  await t.section('hide channels; analytics for owners only; General cannot be deleted', async () => {
    const design = Object.values(s.db.channels).find((c) => c.team === team.id && c.name === 'Design').id;
    ok(await call('POST', '/api/teams/hide', { chan: design, hidden: true }, bob.token)); t.ok(s.db.tmPrefs[bob.id].hidden.includes(design));
    t.eq((await call('POST', '/api/teams/hide', { chan: gen, hidden: true }, bob.token)).s, 400);
    t.eq((await call('GET', `/api/teams/stats?chan=${gen}&days=7`, undefined, bob.token)).s, 403);
    const st = await call('GET', `/api/teams/stats?chan=${gen}&days=7`, undefined, owner.token); ok(st); t.eq(st.d.perDay.length, 7); t.ok(st.d.messages > 3, st.d);
    t.eq((await call('POST', '/api/channel/delete', { id: gen }, owner.token)).s, 400);
    t.eq((await call('POST', '/api/channel/delete', { id: design }, bob.token)).s, 403);
    ok(await call('POST', '/api/teams/update', { id: team.id, settings: { memberDeleteChannels: true } }, owner.token));
    ok(await call('POST', '/api/channel/delete', { id: design }, bob.token)); t.ok(!s.db.channels[design]);
  });

  await t.section('a call in a team channel reaches the team (call state) without ringing everyone', async () => {
    const eb = s.sse(bob.token), ec = s.sse(carol.token); await eb.waitFor('init'); await ec.waitFor('init');
    ok(await call('POST', '/api/call/start', { chan: gen, mode: 'voice' }, owner.token));
    await eb.waitFor('callstate', (d) => d.chan === gen && d.call); await t.wait(200);
    t.ok(!eb.has('callring', (d) => d.chan === gen), 'team members are not rung'); t.ok(!ec.has('callstate', (d) => d.chan === gen), 'outsiders see nothing');
    ok(await call('POST', '/api/call/leave', { chan: gen }, owner.token)); eb.close(); ec.close();
  });

  // ---------------- admin and security ----------------
  await t.section('activity log: admin actions are recorded; only admins read it; CSV export', async () => {
    ok(await call('POST', '/api/admin/user/mute', { id: dan.id, minutes: 5 }, ada.token)); ok(await call('POST', '/api/admin/user/mute', { id: dan.id, minutes: 0 }, ada.token));
    t.eq((await call('GET', '/api/tm/admin/audit', undefined, bob.token)).s, 403);
    const a = await call('GET', '/api/tm/admin/audit?action=user.timeout', undefined, ada.token); ok(a); t.ok(a.d.entries.some((e) => e.by === ada.id && /Dan/.test(e.details)), a.d);
    const csv = await fetch(`${s.B}/api/tm/admin/audit?csv=1&token=${ada.token}`).then((r) => r.text()); t.ok(/^time,who,action,details/.test(csv) && /user\.timeout/.test(csv), csv.slice(0, 200));
  });

  await t.section('messaging rules: editing and deleting can be turned off or time-limited (admins exempt)', async () => {
    const r = await call('POST', '/api/send', { chan: 'general', text: 'typo' }, bob.token);
    t.eq((await call('POST', '/api/tm/admin/policies', { messagingRules: { edit: false } }, bob.token)).s, 403);
    ok(await call('POST', '/api/tm/admin/policies', { messagingRules: { edit: false, delete: false } }, ada.token));
    t.eq((await call('POST', '/api/edit', { id: r.d.id, text: 'fixed' }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/delete', { id: r.d.id }, bob.token)).s, 403);
    const ra = await call('POST', '/api/send', { chan: 'general', text: 'admin typo' }, ada.token); ok(await call('POST', '/api/edit', { id: ra.d.id, text: 'admin fixed' }, ada.token));
    ok(await call('POST', '/api/tm/admin/policies', { messagingRules: { edit: true, delete: true, editMinutes: 1 } }, ada.token));
    s.db.messages.find((m) => m.id === r.d.id).ts -= 120000;
    t.eq((await call('POST', '/api/edit', { id: r.d.id, text: 'late' }, bob.token)).s, 403, 'past the time limit');
    ok(await call('POST', '/api/tm/admin/policies', { messagingRules: { editMinutes: 0 } }, ada.token));
    ok(await call('POST', '/api/edit', { id: r.d.id, text: 'fixed now' }, bob.token));
    t.eq(s.ctx.S.messagingRules.edit, true); t.eq(s.ctx.clientSettings().messagingRules.editMinutes, 0, 'clients get the rules in settings');
  });

  await t.section('bad-word filter: block or replace with ***, also for channel and team names', async () => {
    ok(await call('POST', '/api/tm/admin/policies', { badwords: { on: true, words: 'darn, heck', action: 'block' } }, ada.token));
    t.eq((await call('POST', '/api/send', { chan: 'general', text: 'oh darn it' }, bob.token)).s, 400);
    ok(await call('POST', '/api/send', { chan: 'general', text: 'darning socks is fine' }, bob.token));
    t.eq((await call('POST', '/api/channel', { name: 'heck channel' }, bob.token)).s, 400);
    t.eq((await call('POST', '/api/teams/create', { name: 'Darn team' }, bob.token)).s, 400);
    ok(await call('POST', '/api/tm/admin/policies', { badwords: { action: 'replace' } }, ada.token));
    const r = await call('POST', '/api/send', { chan: 'general', text: 'oh Darn it' }, bob.token); ok(r); t.eq(s.db.messages.find((m) => m.id === r.d.id).text, 'oh *** it');
    ok(await call('POST', '/api/edit', { id: r.d.id, text: 'heck again' }, bob.token)); t.eq(s.db.messages.find((m) => m.id === r.d.id).text, '*** again');
    ok(await call('POST', '/api/tm/admin/policies', { badwords: { on: false } }, ada.token));
  });

  await t.section('information barriers: no 1:1 or group chats or calls between blocked segments; hidden from pickers', async () => {
    const segs = [{ id: 'sales1', name: 'Sales', members: [bob.id] }, { id: 'rsrch1', name: 'Research', members: [carol.id] }];
    ok(await call('POST', '/api/tm/admin/policies', { barriers: { on: true, segments: segs, blocks: [['sales1', 'rsrch1']] } }, ada.token));
    const dm = s.dm(bob, carol);
    t.eq((await call('POST', '/api/send', { chan: dm, text: 'hi' }, bob.token)).s, 403); t.eq((await call('POST', '/api/send', { chan: dm, text: 'hi' }, carol.token)).s, 403);
    t.eq((await call('POST', '/api/channel', { name: 'Mixed', members: [carol.id] }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/chatux/chat/new', { members: [carol.id, dan.id] }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/call/start', { chan: dm, mode: 'voice' }, bob.token)).s, 403);
    ok(await call('POST', '/api/send', { chan: s.dm(bob, dan), text: 'still fine' }, bob.token));
    const ev = s.sse(bob.token); const init = await ev.waitFor('init'); ev.close();
    const c = init.users.find((u) => u.id === carol.id); t.ok(c.removed && c.barrier, c);
    ok(await call('POST', '/api/tm/admin/policies', { barriers: { on: false } }, ada.token));
    ok(await call('POST', '/api/send', { chan: dm, text: 'hi again' }, bob.token));
  });

  await t.section('sensitivity labels: confidential messages are not forwarded out of the team', async () => {
    ok(await call('POST', '/api/teams/update', { id: team.id, label: 'confidential' }, owner.token));
    const r = await call('POST', '/api/send', { chan: gen, text: 'numbers' }, bob.token); ok(r);
    t.eq((await call('POST', '/api/forward', { id: r.d.id, chan: 'general' }, bob.token)).s, 403);
    const inside = Object.values(s.db.channels).find((c) => c.team === team.id && c.name === 'Planning').id;
    ok(await call('POST', '/api/forward', { id: r.d.id, chan: inside }, bob.token));
    t.eq(s.ctx.sensitivity(gen).anyoneLinks, false);
    ok(await call('POST', '/api/teams/update', { id: team.id, label: '' }, owner.token));
  });

  let reportId;
  await t.section('report a concern: admins get an activity item and an inbox; actions are audited', async () => {
    const r = await call('POST', '/api/send', { chan: 'general', text: 'rude words' }, dan.token);
    const ea = s.sse(ada.token); await ea.waitFor('init');
    ok(await call('POST', '/api/tm/report', { msg: r.d.id, reason: 'harassment', note: 'not nice' }, bob.token));
    await ea.waitFor('activity', (a) => a.type === 'report' && a.from === bob.id); ea.close();
    t.eq((await call('POST', '/api/tm/report', { msg: r.d.id }, dan.token)).s, 400, 'not your own message');
    t.eq((await call('GET', '/api/tm/admin/reports', undefined, bob.token)).s, 403);
    const l = await call('GET', '/api/tm/admin/reports', undefined, ada.token); reportId = l.d.reports[0].id; t.eq(l.d.reports[0].snapshot.text, 'rude words');
    ok(await call('POST', '/api/tm/admin/reports/act', { id: reportId, action: 'delete' }, ada.token));
    t.ok(s.db.messages.find((m) => m.id === r.d.id).deleted);
    ok(await call('POST', '/api/tm/report', { user: dan.id, reason: 'spam' }, bob.token));
    const l2 = await call('GET', '/api/tm/admin/reports', undefined, ada.token); ok(await call('POST', '/api/tm/admin/reports/act', { id: l2.d.reports[0].id, action: 'dismiss' }, ada.token));
    t.eq((await call('GET', '/api/tm/admin/reports', undefined, ada.token)).d.open, 0);
  });

  await t.section('legal hold: held messages survive clean-up; edits and deletes keep the original; export zip', async () => {
    t.eq((await call('POST', '/api/tm/admin/hold', { uid: bob.id }, ada.token)).s, 403, 'only the host');
    ok(await call('POST', '/api/tm/admin/hold', { uid: bob.id, note: 'case 7' }, owner.token));
    const up = await s.upload(bob.token, 'evidence.txt', Buffer.from('proof'));
    const r = await call('POST', '/api/send', { chan: 'general', text: 'original words', files: [{ id: up.d.id }] }, bob.token);
    ok(await call('POST', '/api/edit', { id: r.d.id, text: 'changed words' }, bob.token)); ok(await call('POST', '/api/delete', { id: r.d.id }, bob.token));
    const items = await call('GET', `/api/tm/admin/hold/items?uid=${bob.id}`, undefined, owner.token); ok(items);
    t.ok(items.d.items.some((a) => a.action === 'edit' && a.orig.text === 'original words'), items.d); t.ok(items.d.items.some((a) => a.action === 'delete' && a.orig.text === 'changed words' && a.orig.files[0].kept), items.d);
    const before = s.db.messages.filter((m) => m.from === bob.id).length;
    ok(await call('POST', '/api/admin/cleanup', { days: 0 }, owner.token));
    t.eq(s.db.messages.filter((m) => m.from === bob.id).length, before, 'held messages kept'); t.ok(!s.db.messages.some((m) => m.from === carol.id && !m.system), 'others removed');
    t.eq((await call('GET', `/api/tm/admin/export?uid=${bob.id}`, undefined, ada.token)).s, 403);
    const zip = Buffer.from(await fetch(`${s.B}/api/tm/admin/export?uid=${bob.id}&token=${owner.token}`).then((x) => x.arrayBuffer()));
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teams-zip-')), 'x.zip'); fs.writeFileSync(f, zip);
    const names = readZipIndex(f).map((e) => e.name); t.ok(names.includes('messages.json') && names.includes('messages.html') && names.some((n) => n.startsWith('held-files/')), names);
    ok(await call('POST', '/api/tm/admin/hold', { uid: bob.id, on: false }, owner.token));
  });

  await t.section('bulk add: one-time invite codes and pre-approved names join without waiting', async () => {
    t.eq((await call('POST', '/api/tm/admin/bulk', { rows: [{ name: 'Zed' }] }, bob.token)).s, 403);
    const r = await call('POST', '/api/tm/admin/bulk', { rows: [{ name: 'Zed', role: 'guest', title: 'Designer', dept: 'Art' }, { name: 'Bob' }, { name: 'Yan' }] }, ada.token); ok(r);
    t.eq(r.d.created.length, 2); t.eq(r.d.skipped[0].name, 'Bob');
    const z = r.d.created.find((x) => x.name === 'Zed');
    const look = await call('GET', `/api/tm/invite?code=${encodeURIComponent(z.code)}`, undefined, null, { ip: s.nextIp() }); t.eq(look.d.name, 'Zed');
    const j = await call('POST', '/api/join', { name: 'whatever', invite: z.code, deviceId: 'zz' }, null, { ip: s.nextIp() }); t.eq(j.s, 200, j.d); t.eq(j.d.me.name, 'Zed'); t.eq(j.d.me.role, 'guest');
    t.eq(s.db.users[j.d.me.id].profile.jobTitle, 'Designer');
    t.eq((await call('POST', '/api/join', { name: 'Zed2', invite: z.code, deviceId: 'zz2' }, null, { ip: s.nextIp() })).s, 403, 'codes work once');
    const n = await call('POST', '/api/tm/admin/bulk', { rows: [{ name: 'Quinn' }], mode: 'names' }, ada.token); ok(n);
    const q = await call('POST', '/api/join', { name: 'quinn', deviceId: 'q1' }, null, { ip: s.nextIp() }); t.eq(q.s, 200, q.d);
    const p = await call('POST', '/api/join', { name: 'Paula', deviceId: 'p1' }, null, { ip: s.nextIp() }); t.eq(p.s, 202, 'others still wait for approval');
  });

  await t.section('PIN + authenticator code: needed on new devices, wrong tries locked out, admins can reset', async () => {
    t.eq((await call('POST', '/api/tm/me/pin', { pin: '12' }, dan.token)).s, 400);
    ok(await call('POST', '/api/tm/me/pin', { pin: '482915' }, dan.token)); t.ok(s.db.tmAuth[dan.id].pin.hash && !JSON.stringify(s.db.tmAuth).includes('482915'), 'PIN stored hashed');
    const ip = s.nextIp();
    const a = await call('POST', '/api/join', { name: 'Dan', deviceId: 'new' }, null, { ip }); t.eq(a.s, 401); t.ok(a.d.needPin);
    t.eq((await call('POST', '/api/join', { name: 'Dan', pin: '000000', deviceId: 'new' }, null, { ip })).s, 403);
    const ok202 = await call('POST', '/api/join', { name: 'Dan', pin: '482915', deviceId: 'new' }, null, { ip }); t.eq(ok202.s, 202, ok202.d);
    const st = await call('POST', '/api/tm/me/totp/start', {}, dan.token); ok(st); t.ok(/^otpauth:\/\/totp\//.test(st.d.uri));
    const code = s.ctx.tm.hotp(st.d.secret, Math.floor(Date.now() / 30000));
    ok(await call('POST', '/api/tm/me/totp/confirm', { code }, dan.token));
    ok(await call('POST', '/api/tm/admin/policies', { pinSkipsApproval: true }, owner.token));
    const ip2 = s.nextIp(); const n1 = await call('POST', '/api/join', { name: 'Dan', pin: '482915', deviceId: 'n2' }, null, { ip: ip2 }); t.eq(n1.s, 401); t.ok(n1.d.totp, n1.d);
    const reused = await call('POST', '/api/join', { name: 'Dan', pin: '482915', totp: code, deviceId: 'n2' }, null, { ip: ip2 }); t.eq(reused.s, 403, 'a used code is not accepted twice');
    const next = s.ctx.tm.hotp(st.d.secret, Math.floor(Date.now() / 30000) + 1);
    const good = await call('POST', '/api/join', { name: 'Dan', pin: '482915', totp: next, deviceId: 'n2' }, null, { ip: ip2 }); t.eq(good.s, 200, good.d); t.eq(good.d.me.id, dan.id);
    const ip3 = s.nextIp(); const tries = []; for (let i = 0; i < 6; i++) tries.push((await call('POST', '/api/join', { name: 'Dan', pin: '11111' + i, deviceId: 'x' }, null, { ip: ip3 })).s);
    t.ok(tries.includes(429), 'locked after wrong tries: ' + tries);
    ok(await call('POST', '/api/tm/admin/pin/reset', { uid: dan.id }, ada.token)); t.ok(!s.db.tmAuth[dan.id]);
    ok(await call('POST', '/api/tm/admin/policies', { pinSkipsApproval: false }, owner.token));
  });

  await t.section('signed-in devices: list, sign out one device (its token stops working)', async () => {
    const j = await call('POST', '/api/join', { token: carol.token, deviceId: 'carol-dev' }, null, { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }); ok(j);
    const d = await call('GET', `/api/tm/admin/devices?uid=${carol.id}`, undefined, ada.token); ok(d); t.ok(d.d.devices.length >= 1, d.d);
    t.eq((await call('GET', `/api/tm/admin/devices?uid=${carol.id}`, undefined, bob.token)).s, 403);
    const mine = await call('GET', '/api/tm/me/devices', undefined, carol.token); t.ok(mine.d.devices.some((x) => x.current), mine.d);
    ok(await call('POST', '/api/tm/admin/devices/signout', { uid: carol.id, all: true }, ada.token));
    t.eq((await call('GET', '/api/messages?chan=general', undefined, carol.token)).s, 401);
  });

  await t.section('team naming and expiry: prefix/suffix, blocked words, warning then archive, renew', async () => {
    ok(await call('POST', '/api/tm/admin/policies', { naming: { prefix: 'GRP-', suffix: '', blocked: ['ceo'] }, expiry: { days: 30, warnDays: 7 } }, ada.token));
    const r = await call('POST', '/api/teams/create', { name: 'Runners' }, bob.token); ok(r); t.eq(r.d.team.name, 'GRP-Runners');
    t.eq((await call('POST', '/api/teams/create', { name: 'CEO fans' }, bob.token)).s, 400);
    const tt = s.db.teams[r.d.team.id]; tt.active = Date.now() - 25 * 86400000;
    s.ctx.tm.expiryTick(); t.ok(tt.warned > 0 && !tt.archived, 'warned first');
    s.ctx.tm.expiryTick(Date.now() + 8 * 86400000); t.ok(tt.archived && tt.archivedWhy === 'expired', 'archived after the warning');
    ok(await call('POST', '/api/teams/renew', { id: tt.id }, bob.token)); t.ok(!tt.archived && !tt.warned);
    ok(await call('POST', '/api/tm/admin/policies', { naming: { prefix: '', blocked: [] }, expiry: { days: 0 } }, ada.token));
  });

  await t.section('usage report and call quality (from db.callLog; "no data" when empty)', async () => {
    const e = await call('GET', '/api/tm/admin/callquality?days=7', undefined, ada.token); ok(e); t.ok(e.d.empty || e.d.calls >= 0);
    s.db.callLog = [...(Array.isArray(s.db.callLog) ? s.db.callLog : []), { id: 'c1', chan: 'general', mode: 'video', by: bob.id, start: Date.now() - 600000, end: Date.now(), parts: [bob.id, dan.id], missed: [], ratings: { [bob.id]: { stars: 2, issues: ['echo'], at: Date.now() } }, quality: { [bob.id]: { rtt: 520, loss: 7.5, jitter: 30 } } }];
    const q = await call('GET', '/api/tm/admin/callquality?days=7', undefined, ada.token); ok(q); t.ok(q.d.calls >= 1 && q.d.poor >= 1 && q.d.rtt >= 1, q.d);
    const u = await call('GET', '/api/tm/admin/usage?days=7', undefined, ada.token); ok(u); t.eq(u.d.messages.length, 7); t.ok(u.d.messages[6] > 0 && u.d.active[6] > 0 && u.d.calls[6] >= 1, u.d);
    t.eq((await call('GET', '/api/tm/admin/usage', undefined, bob.token)).s, 403);
  });

  await t.section('branded lobby: owner sets logo, colour and welcome text; shown before sign-in', async () => {
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
    t.eq((await call('POST', '/api/tm/admin/policies', { brand: { welcome: 'Hi' } }, ada.token)).s, 403);
    t.eq((await call('POST', '/api/tm/admin/policies', { brand: { logo: 'data:image/svg+xml;base64,PHN2Zz4=' } }, owner.token)).s, 400, 'no SVG');
    ok(await call('POST', '/api/tm/admin/policies', { brand: { logo: png, color: '#ff8800', welcome: 'Welcome to the club' } }, owner.token));
    const c = await call('GET', '/api/config'); t.eq(c.d.brand.welcome, 'Welcome to the club'); t.eq(c.d.brand.color, '#ff8800');
    const logo = await fetch(s.B + c.d.brand.logo); t.eq(logo.status, 200); t.eq(logo.headers.get('content-type'), 'image/png');
  });

  await t.section('Manage › Teams: admins archive, set owners and delete any team', async () => {
    const l = await call('GET', '/api/tm/admin/teams', undefined, ada.token); ok(l); t.ok(l.d.teams.some((x) => x.id === team.id));
    t.eq((await call('GET', '/api/tm/admin/teams', undefined, bob.token)).s, 403);
    ok(await call('POST', '/api/tm/admin/teams/act', { id: team.id, action: 'owner', uid: bob.id }, ada.token)); t.ok(s.db.teams[team.id].owners.includes(bob.id));
    const bc = Object.values(s.db.teams).find((x) => x.name === 'Book club');
    ok(await call('POST', '/api/tm/admin/teams/act', { id: bc.id, action: 'delete' }, ada.token)); t.ok(!s.db.teams[bc.id]);
    t.ok(!Object.values(s.db.channels).some((c) => c.team === bc.id), 'its channels are gone');
  });

  // ---------------- bots and automation ----------------
  await t.section('incoming webhooks: secret URL (hashed, constant-time), posts cards, rate-limited, regenerate and remove', async () => {
    carol.token = s.ctx.newToken(s.db.users[carol.id]); // signed out everywhere in the devices section
    t.eq((await call('POST', '/api/tm/hooks/create', { chan: gen, kind: 'in', name: 'CI' }, carol.token)).s, 404, 'outsiders cannot');
    const r = await call('POST', '/api/tm/hooks/create', { chan: gen, kind: 'in', name: 'Build bot' }, bob.token); ok(r);
    const hook = r.d.hook, url = new URL(s.B + r.d.url), key = url.searchParams.get('key');
    t.ok(!JSON.stringify(s.db.tmHooks).includes(key), 'webhook key stored hashed');
    t.eq((await fetch(`${s.B}/api/hook/in?id=${hook.id}&key=${key.slice(0, -2)}xx`, { method: 'POST', body: '{"text":"x"}' })).status, 404);
    const p = await fetch(s.B + r.d.url, { method: 'POST', body: JSON.stringify({ title: 'Build passed', text: 'All green', card: { title: 'Build 42', facts: [{ k: 'Branch', v: 'main' }], buttons: [{ label: 'Open', url: 'https://example.com/b/42' }, { label: 'Bad', url: 'javascript:alert(1)' }] } }) });
    t.eq(p.status, 200); const m = s.db.messages.find((x) => x.card && x.card.title === 'Build 42');
    t.ok(m && m.from === hook.uid && m.bot.kind === 'in', m); t.eq(m.card.buttons.length, 1, 'unsafe link dropped');
    t.ok(s.db.users[hook.uid].bot && s.db.users[hook.uid].removed, 'webhook identity is a hidden bot');
    const codes = []; for (let i = 0; i < 31; i++) codes.push((await fetch(s.B + r.d.url, { method: 'POST', body: '{"text":"spam"}', headers: { 'x-forwarded-for': '10.9.9.' + i } })).status);
    t.ok(codes.includes(429), 'rate-limited');
    const g = await call('POST', '/api/tm/hooks/regen', { id: hook.id }, owner.token); ok(g);
    t.eq((await fetch(s.B + r.d.url, { method: 'POST', body: '{"text":"old key"}', headers: { 'x-forwarded-for': '10.9.8.1' } })).status, 404, 'old key stops working');
    ok(await call('POST', '/api/tm/hooks/remove', { id: hook.id }, owner.token));
    t.eq((await fetch(s.B + g.d.url, { method: 'POST', body: '{"text":"gone"}', headers: { 'x-forwarded-for': '10.9.8.2' } })).status, 404);
  });

  await t.section('outgoing webhooks: @mention → signed POST (HMAC-SHA256) → answer posted as a reply; errors kept for admins', async () => {
    let got = null; const srv = require('http').createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got = { body: b, auth: req.headers.authorization, sig: req.headers['x-lanchat-signature'] }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: 'Pong from the service', card: { title: 'Answer', buttons: [{ label: 'Again', action: 'post', id: 'again' }] } })); }); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
    t.eq((await call('POST', '/api/tm/hooks/create', { chan: gen, kind: 'out', name: 'Pinger', url: `http://127.0.0.1:${port}/hook` }, dan.token)).s, 403, 'members cannot add outgoing webhooks');
    const r = await call('POST', '/api/tm/hooks/create', { chan: gen, kind: 'out', name: 'Pinger', url: `http://127.0.0.1:${port}/hook` }, owner.token); ok(r);
    const sent = await call('POST', '/api/send', { chan: gen, text: '@Pinger ping please' }, bob.token); ok(sent);
    for (let i = 0; i < 40 && !s.db.messages.some((m) => m.text === 'Pong from the service'); i++) await t.wait(50);
    t.ok(got, 'the service was called'); const expect = crypto.createHmac('sha256', Buffer.from(r.d.secret, 'base64')).update(got.body).digest('base64'); t.eq(got.auth, 'HMAC ' + expect);
    t.eq(JSON.parse(got.body).text, '@Pinger ping please');
    const reply = s.db.messages.find((m) => m.text === 'Pong from the service'); t.ok(reply && reply.thread === sent.d.id && reply.bot.kind === 'out', reply);
    got = null; const act = await call('POST', '/api/tm/card/action', { id: reply.id, button: 0 }, dan.token); ok(act); t.eq(JSON.parse(got.body).action, 'again');
    t.eq((await call('POST', '/api/tm/card/action', { id: reply.id, button: 0 }, carol.token)).s, 404, 'outsiders cannot press buttons');
    srv.close(); await t.wait(50);
    ok(await call('POST', '/api/send', { chan: gen, text: '@Pinger again' }, bob.token));
    for (let i = 0; i < 60 && !s.db.tmHooks[r.d.hook.id].lastError; i++) await t.wait(100);
    t.ok(s.db.tmHooks[r.d.hook.id].lastError, 'error recorded'); const l = await call('GET', '/api/tm/hooks', undefined, ada.token); t.ok(l.d.hooks.some((h) => h.lastError), l.d);
  });

  let botId;
  await t.section('simple bots: keyword and regex replies, welcome messages; bots cannot sign in', async () => {
    t.eq((await call('POST', '/api/tm/admin/bots/save', { name: 'Helper' }, bob.token)).s, 403);
    const r = await call('POST', '/api/tm/admin/bots/save', { name: 'Helper', rules: [{ match: 'keyword', pattern: 'wifi, password', reply: { text: 'The Wi-Fi password is on the fridge, {person}.' }, chans: ['*'] }, { match: 'regex', pattern: '^order\\s+#?\\d+$', reply: { text: 'Order noted' }, chans: ['general'] }], welcome: { general: true, dm: true, text: 'Welcome {person}!' } }, ada.token); ok(r); botId = r.d.bot.uid;
    t.eq((await call('POST', '/api/tm/admin/bots/save', { name: 'Bad', rules: [{ match: 'regex', pattern: '(', reply: { text: 'x' } }] }, ada.token)).s, 400);
    ok(await call('POST', '/api/send', { chan: 'general', text: 'what is the wifi code?' }, carol.token)); await t.wait(50);
    t.ok(s.db.messages.some((m) => m.from === botId && m.text === 'The Wi-Fi password is on the fridge, Carol.'), 'keyword rule');
    ok(await call('POST', '/api/send', { chan: 'general', text: 'order #42' }, carol.token)); await t.wait(50); t.ok(s.db.messages.some((m) => m.from === botId && m.text === 'Order noted'), 'regex rule');
    ok(await call('POST', '/api/send', { chan: s.dm(carol, { id: botId }), text: 'password?' }, carol.token)); await t.wait(50);
    t.ok(s.db.messages.some((m) => m.from === botId && m.chan === s.dm(carol, { id: botId })), 'answers in a 1:1 chat with the bot');
    ok(await call('POST', '/api/send', { chan: s.dm(carol, dan), text: 'wifi?' }, carol.token)); await t.wait(50);
    t.ok(!s.db.messages.some((m) => m.from === botId && m.chan === s.dm(carol, dan)), 'bots never read other 1:1 chats');
    const nu = await s.user('Newbie'); t.ok(s.db.messages.some((m) => m.from === botId && m.chan === 'general' && m.text === 'Welcome Newbie!')); t.ok(s.db.messages.some((m) => m.from === botId && m.chan === s.dm(nu, { id: botId })), 'welcome DM');
    t.eq((await call('POST', '/api/join', { name: 'Helper', deviceId: 'b' }, null, { ip: s.nextIp() })).s, 403, 'a bot name cannot sign in');
    const ev = s.sse(bob.token); const init = await ev.waitFor('init'); ev.close(); const bu = init.users.find((u) => u.id === botId); t.ok(bu.bot && bu.presence === 'online', bu);
  });

  await t.section('workflows: message, reaction, team join, manual and schedule triggers; steps and errors', async () => {
    t.eq((await call('POST', '/api/tm/admin/flows/save', { name: 'x', trigger: { type: 'join' }, actions: [{ type: 'dm', to: 'person', text: 'hi' }] }, bob.token)).s, 403);
    const planning = Object.values(s.db.channels).find((c) => c.team === team.id && c.name === 'Planning').id;
    ok(await call('POST', '/api/tm/admin/flows/save', { name: 'Urgent watcher', trigger: { type: 'message', chan: gen, words: 'urgent' }, actions: [{ type: 'post', chan: planning, text: '{person} flagged: {text}' }, { type: 'task', chan: planning, text: 'Follow up with {person}' }] }, owner.token));
    ok(await call('POST', '/api/send', { chan: gen, text: 'this is urgent!' }, bob.token)); await t.wait(100);
    t.ok(s.db.messages.some((m) => m.chan === planning && m.text === 'Bob flagged: this is urgent!' && m.bot && m.bot.kind === 'flow'), 'post step');
    t.ok((s.db.extras[planning] || { todos: [] }).todos.some((x) => x.text === 'Follow up with Bob'), 'task step');
    const pub = await call('POST', '/api/teams/create', { name: 'Runners club', visibility: 'public' }, owner.token);
    const f2 = await call('POST', '/api/tm/admin/flows/save', { name: 'Welcome runners', trigger: { type: 'teamJoin', team: pub.d.team.id }, actions: [{ type: 'dm', to: 'person', text: 'Welcome to {team}, {person}!' }] }, owner.token); ok(f2);
    ok(await call('POST', '/api/teams/join', { id: pub.d.team.id }, carol.token)); await t.wait(100);
    t.ok(s.db.messages.some((m) => m.text === 'Welcome to Runners club, Carol!' && m.chan.includes(carol.id)), 'team join trigger');
    ok(await call('POST', '/api/tm/admin/flows/save', { name: 'Thumbs', trigger: { type: 'reaction', chan: gen, emoji: '👍' }, actions: [{ type: 'addTeam', team: pub.d.team.id }] }, owner.token));
    const target = s.db.messages.filter((m) => m.chan === gen && !m.system).pop(); ok(await call('POST', '/api/react', { id: target.id, emoji: '👍' }, dan.token)); await t.wait(100);
    t.ok(s.db.teams[pub.d.team.id].members.includes(dan.id), 'reaction trigger added Dan to the team');
    const man = await call('POST', '/api/tm/admin/flows/save', { name: 'Stand-up', trigger: { type: 'manual', input: 'What did you do?' }, actions: [{ type: 'card', card: { title: 'Stand-up from {person}', text: '{input}' } }] }, owner.token); ok(man);
    const list = await call('GET', `/api/tm/flows/manual?chan=${gen}`, undefined, bob.token); t.ok(list.d.flows.some((f) => f.id === man.d.flow.id));
    ok(await call('POST', '/api/tm/flows/run', { id: man.d.flow.id, chan: gen, input: 'Shipped it' }, bob.token)); await t.wait(50);
    t.ok(s.db.messages.some((m) => m.chan === gen && m.card && m.card.title === 'Stand-up from Bob' && m.card.text === 'Shipped it'), 'manual run posts a card');
    t.eq((await call('POST', '/api/tm/flows/run', { id: man.d.flow.id, chan: priv }, carol.token)).s, 404, 'cannot run into a chat you cannot see');
    const d = new Date(Date.now() + 120000), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const sch = await call('POST', '/api/tm/admin/flows/save', { name: 'Daily hello', trigger: { type: 'schedule', freq: 'daily', time: hm }, actions: [{ type: 'post', chan: 'general', text: 'Good morning!' }, { type: 'webhook', url: 'http://127.0.0.1:9/' }] }, owner.token); ok(sch);
    s.tick(d.getTime()); await t.wait(300); t.ok(s.db.messages.some((m) => m.chan === 'general' && m.text === 'Good morning!'), 'schedule trigger');
    for (let i = 0; i < 30 && !s.db.tmFlows[sch.d.flow.id].lastError; i++) await t.wait(100);
    t.ok(/webhook/.test(s.db.tmFlows[sch.d.flow.id].lastError), 'webhook error kept: ' + s.db.tmFlows[sch.d.flow.id].lastError);
    ok(await call('POST', '/api/tm/admin/flows/toggle', { id: sch.d.flow.id, on: false }, owner.token));
  });

  await t.section('cards from people: validated; reply buttons ok, callback buttons only for bots', async () => {
    const r = await call('POST', '/api/send', { chan: 'general', card: { title: 'Lunch?', text: 'Vote below', buttons: [{ label: 'Yes', action: 'reply', value: 'Count me in' }, { label: 'Sneaky', action: 'post', id: 'x' }, { label: 'Menu', url: 'https://example.com/menu' }] } }, bob.token); ok(r);
    const m = s.db.messages.find((x) => x.id === r.d.id); t.eq(m.card.buttons.map((b) => b.label), ['Yes', 'Menu']);
    t.eq((await call('POST', '/api/send', { chan: 'general', card: { image: 'data:image/svg+xml;base64,PHN2Zz4=' } }, bob.token)).s, 400, 'no SVG pictures');
    t.eq((await call('POST', '/api/tm/card/action', { id: r.d.id, button: 0 }, dan.token)).s, 400);
  });

  await t.section('API keys: hashed, scoped, act as a bot only in chats it belongs to; revoke', async () => {
    t.eq((await call('POST', '/api/tm/admin/keys/create', { name: 'k', botName: 'Reporter', scopes: ['read'] }, bob.token)).s, 403);
    const rk = await call('POST', '/api/tm/admin/keys/create', { name: 'Reader', botName: 'Reporter', scopes: ['read'] }, ada.token); ok(rk);
    const wk = await call('POST', '/api/tm/admin/keys/create', { name: 'Writer', bot: rk.d.info.uid, scopes: ['read', 'post'] }, ada.token); ok(wk);
    t.ok(/^lck_[a-f0-9]{10}_/.test(wk.d.key)); t.ok(!JSON.stringify(s.db.tmKeys).includes(wk.d.key.split('_')[2]), 'API key stored hashed');
    const api = (k, m, p, b) => fetch(s.B + p, { method: m, headers: { 'x-api-key': k, 'x-forwarded-for': '10.5.5.5' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ s: r.status, d: await r.json().catch(() => ({})) }));
    t.eq((await api('lck_0000000000_nope-nope-nope-nope-nope', 'GET', '/api/bot/me')).s, 401);
    const me = await api(wk.d.key, 'GET', '/api/bot/me'); t.eq(me.d.name, 'Reporter');
    t.eq((await api(wk.d.key, 'GET', `/api/bot/messages?chan=${gen}`)).s, 404, 'not in the team yet');
    t.eq((await api(rk.d.key, 'POST', '/api/bot/send', { chan: 'general', text: 'hi' })).s, 403, 'read-only key');
    const sent = await api(wk.d.key, 'POST', '/api/bot/send', { chan: 'general', text: 'Daily report', card: { title: 'Report', buttons: [{ label: 'Ack', action: 'post', id: 'ack' }] } }); t.eq(sent.s, 200, sent.d);
    const msgs = await api(rk.d.key, 'GET', '/api/bot/messages?chan=general&limit=5'); t.ok(msgs.d.messages.some((m) => m.text === 'Daily report'));
    ok(await call('POST', '/api/tm/card/action', { id: sent.d.id, button: 0 }, dan.token));
    const evs = await api(rk.d.key, 'GET', '/api/bot/events'); t.ok(evs.d.events.some((e) => e.button === 'ack' && e.user.id === dan.id), evs.d);
    ok(await call('POST', '/api/teams/members', { id: team.id, add: [rk.d.info.uid] }, owner.token));
    t.eq((await api(wk.d.key, 'GET', `/api/bot/messages?chan=${gen}`)).s, 200, 'in the team now');
    const chats = await api(wk.d.key, 'GET', '/api/bot/chats'); t.ok(chats.d.chats.some((c) => c.id === gen) && !chats.d.chats.some((c) => c.id === priv), 'only its chats');
    ok(await call('POST', '/api/tm/admin/keys/revoke', { id: wk.d.info.id }, ada.token));
    t.eq((await api(wk.d.key, 'GET', '/api/bot/me')).s, 401, 'revoked');
  });
  void crypto;
});
