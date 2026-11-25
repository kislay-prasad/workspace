'use strict';
// Meetings area API (sections 18, 21, 23): scheduling + repeats, invitations / RSVP / updates / cancellations, meeting chat,
// link + meeting ID + passcode, lobby (server-enforced), guest join by link, reminders, Q&A, agenda, breakout rooms,
// attendance + CSV, recap, webinars (attendees only watch, registration with approval), templates, chat mode.
const H = require('./harness');
const DAY = 86400000, MIN = 60000;
H.suite('Meetings', async (t) => {
  const s = await t.server();
  const bob = await s.user('Bob'), cy = await s.user('Cy'), dee = await s.user('Dee'), adm = await s.user('Ada', 'admin'), eve = await s.user('Eve');
  const owner = s.owner, call = s.call, now = Date.now();
  const mine = (ticks) => s.ctx.ticks.filter((x) => x.mt === ticks);
  const runMt = (name, at) => { for (const x of mine(name)) x.fn(at || Date.now()); };
  const create = (tok, b) => call('POST', '/api/meetings/create', { title: 'Sync', start: now + 2 * 3600000, end: now + 2 * 3600000 + 30 * MIN, tz: 'Europe/Berlin', ...b }, tok);
  const get = (tok, id) => call('GET', '/api/meetings/get?id=' + id, undefined, tok);
  const acts = (u) => (s.db.activity && s.db.activity[u.id]) || [];
  let m1;

  await t.section('create: meeting chat, card, invitations, link ID + passcode', async () => {
    const r = await create(owner.token, { invitees: [bob.id, cy.id], optional: [cy.id], details: 'Agenda in the chat', location: 'Room 4' });
    t.eq(r.s, 200, r.d); m1 = r.d.meeting;
    t.ok(/^[a-f0-9]{16}$/.test(m1.id) && /^\d{12}$/.test(m1.code) && m1.passcode.length === 6, m1);
    t.ok(m1.start % MIN === 0, 'whole minutes');
    const c = s.db.channels[m1.chan]; t.eq(c.kind, 'meeting'); t.eq(c.meeting, m1.id); t.eq(c.members.sort(), [owner.id, bob.id, cy.id].sort());
    t.ok(s.db.messages.some((m) => m.chan === m1.chan && m.mtCard && m.mtCard.meeting === m1.id && m.mtCard.kind === 'invite'), 'invitation card');
    t.ok(acts(bob).some((a) => a.type === 'meeting' && a.kind === 'invite' && a.meeting === m1.id && a.from === owner.id), 'activity for invitee');
    t.eq(s.db.meetings[m1.id].optional, [cy.id]);
    const g = await get(bob.token, m1.id); t.eq(g.d.meeting.details, 'Agenda in the chat'); t.ok(!g.d.meeting.rsvp, 'responses are the organizer\'s'); t.eq(g.d.meeting.code, m1.code);
    const chans = await call('GET', '/api/messages?chan=' + m1.chan, undefined, bob.token); t.eq(chans.s, 200);
  });
  await t.section('create: validation, size limits, permissions', async () => {
    t.eq((await create(bob.token, { title: '  ' })).s, 400);
    t.eq((await create(bob.token, { start: now + DAY, end: now + DAY - MIN })).s, 400);
    t.eq((await create(bob.token, { start: 'x', end: 'y' })).s, 400);
    t.eq((await create(bob.token, { start: now + 10 * 366 * DAY, end: now + 10 * 366 * DAY + MIN })).s, 400);
    const long = await create(bob.token, { title: 'x'.repeat(500), details: 'y'.repeat(9000), invitees: ['nobody', bob.id, 42] });
    t.eq(long.s, 200, long.d); t.eq(long.d.meeting.title.length, 120); t.eq(long.d.meeting.details.length, 4000); t.eq(long.d.meeting.invitees, []);
    const big = await fetch(s.B + '/api/meetings/create', { method: 'POST', headers: { 'x-token': bob.token, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'a', details: 'z'.repeat(40000) }) }); t.eq(big.status, 413);
    s.db.users[dee.id].role = 'guest'; t.eq((await create(dee.token)).s, 403); s.db.users[dee.id].role = 'member';
    const g = await call('POST', '/api/channel', { name: 'Trio', members: [bob.id] }, owner.token);
    t.eq((await create(owner.token, { chan: g.d.id, invitees: [cy.id] })).s, 400, 'invitees must be in the group chat');
    t.eq((await create(owner.token, { chan: 'dm:' + [owner.id, bob.id].sort().join(':') })).s, 404);
    const ch = await create(owner.token, { chan: 'general', title: 'All hands', invitees: [bob.id] }); t.eq(ch.s, 200, ch.d); t.eq(ch.d.meeting.chan, 'general');
  });
  await t.section('repeats: daily / weekdays / weekly / monthly in the meeting time zone, until, cancel one', async () => {
    const mon = new Date(Date.UTC(2027, 2, 1, 8, 30)).getTime(); // Mon 1 Mar 2027 09:30 Berlin (UTC+1); DST starts 28 Mar
    const wd = (await create(owner.token, { title: 'Stand-up', start: mon, end: mon + 15 * MIN, repeat: { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] }, invitees: [bob.id] })).d.meeting;
    const l = await call('GET', `/api/meetings?from=${mon - DAY}&to=${mon + 35 * DAY}`, undefined, bob.token);
    const occ = l.d.meetings.filter((x) => x.id === wd.id); t.eq(occ.length, 26, occ.length); // 1 Mar .. 5 Apr 2027
    t.ok(occ.every((x) => { const d = new Date(x.start); return d.getUTCDay() >= 1 && d.getUTCDay() <= 5; }), 'weekdays only');
    const berlin = (ts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(ts);
    t.ok(occ.every((x) => berlin(x.start) === '09:30'), 'same local time across DST: ' + occ.map((x) => berlin(x.start)).join());
    const mo = (await create(owner.token, { title: 'Monthly', start: Date.UTC(2027, 0, 31, 12), end: Date.UTC(2027, 0, 31, 13), tz: 'UTC', repeat: { freq: 'monthly', interval: 1, until: Date.UTC(2027, 6, 1) } })).d.meeting;
    const lm = (await call('GET', `/api/meetings?from=${Date.UTC(2027, 0, 1)}&to=${Date.UTC(2028, 0, 1)}`, undefined, owner.token)).d.meetings.filter((x) => x.id === mo.id);
    t.eq(lm.map((x) => new Date(x.start).toISOString().slice(0, 10)), ['2027-01-31', '2027-03-31', '2027-05-31'], 'months without a 31st are skipped, until respected');
    const da = (await create(owner.token, { title: 'Daily', start: Date.UTC(2027, 1, 1, 7), end: Date.UTC(2027, 1, 1, 7, 15), tz: 'UTC', repeat: { freq: 'daily', interval: 2 } })).d.meeting;
    const ld = (await call('GET', `/api/meetings?from=${Date.UTC(2027, 1, 1)}&to=${Date.UTC(2027, 1, 8)}`, undefined, owner.token)).d.meetings.filter((x) => x.id === da.id);
    t.eq(ld.length, 4); t.eq(ld[1].start - ld[0].start, 2 * DAY);
    const c1 = await call('POST', '/api/meetings/cancel', { id: wd.id, occurrence: occ[1].start }, owner.token); t.eq(c1.s, 200, c1.d);
    const l2 = (await call('GET', `/api/meetings?from=${mon - DAY}&to=${mon + 35 * DAY}`, undefined, bob.token)).d.meetings.filter((x) => x.id === wd.id); t.eq(l2.length, 25);
    t.ok(acts(bob).some((a) => a.kind === 'cancel' && a.meeting === wd.id && a.occurrence === occ[1].start));
    t.eq((await call('POST', '/api/meetings/cancel', { id: wd.id, occurrence: occ[1].start + 1000 }, owner.token)).s, 404);
    t.eq(typeof s.ctx.meetingOccurrences, 'function');
  });
  await t.section('visibility: not invited = not listed; the link shows only the basics', async () => {
    const l = await call('GET', `/api/meetings?from=${now}&to=${now + 3 * DAY}`, undefined, dee.token); t.ok(!l.d.meetings.some((x) => x.id === m1.id));
    const g = await get(dee.token, m1.id); t.eq(g.s, 200); t.eq(g.d.meeting.title, 'Sync'); t.ok(!g.d.meeting.code && !g.d.meeting.details && !g.d.meeting.invitees, g.d.meeting);
    t.eq((await call('GET', '/api/messages?chan=' + m1.chan, undefined, dee.token)).s, 404);
    t.eq((await get(dee.token, 'ffffffffffffffff')).s, 404);
  });
  await t.section('RSVP: tracking for the organizer, activity, outsiders refused', async () => {
    const r = await call('POST', '/api/meetings/rsvp', { id: m1.id, rsvp: 'yes' }, bob.token); t.eq(r.s, 200, r.d);
    t.eq((await call('POST', '/api/meetings/rsvp', { id: m1.id, rsvp: 'maybe' }, cy.token)).s, 200);
    t.eq((await call('POST', '/api/meetings/rsvp', { id: m1.id, rsvp: 'perhaps' }, cy.token)).s, 400);
    t.eq((await call('POST', '/api/meetings/rsvp', { id: m1.id, rsvp: 'yes' }, dee.token)).s, 403);
    const g = await get(owner.token, m1.id); t.eq(g.d.meeting.rsvp, { [bob.id]: 'yes', [cy.id]: 'maybe' }); t.eq(g.d.meeting.counts, { yes: 1, maybe: 1, no: 0, none: 0 });
    t.ok(acts(s.owner).some((a) => a.kind === 'rsvp' && a.rsvp === 'yes' && a.from === bob.id));
  });
  await t.section('update: organizer only; time change asks again; invitees added / removed; chat renamed', async () => {
    t.eq((await call('POST', '/api/meetings/update', { id: m1.id, title: 'Hijack' }, bob.token)).s, 403);
    const ev = s.sse(cy.token); await s.wait(100);
    const r = await call('POST', '/api/meetings/update', { id: m1.id, title: 'Sync v2', start: m1.start + 3600000, end: m1.end + 3600000, invitees: [bob.id, dee.id] }, owner.token); t.eq(r.s, 200, r.d);
    const m = s.db.meetings[m1.id]; t.eq(m.rsvp, {}); t.eq(s.db.channels[m1.chan].name, 'Sync v2'); t.eq(s.db.channels[m1.chan].members.sort(), [owner.id, bob.id, dee.id].sort());
    await ev.waitFor('channel_removed', (d) => d.id === m1.chan); ev.close();
    t.ok(acts(dee).some((a) => a.kind === 'invite' && a.meeting === m1.id)); t.ok(acts(bob).some((a) => a.kind === 'time')); t.ok(acts(cy).some((a) => a.kind === 'removed'));
    t.ok(s.db.messages.some((x) => x.chan === m1.chan && x.mtCard && x.mtCard.kind === 'update'));
    const q = await call('POST', '/api/meetings/update', { id: m1.id, options: { qa: false } }, owner.token); t.eq(q.s, 200);
    t.eq(s.db.messages.filter((x) => x.chan === m1.chan && x.mtCard && x.mtCard.kind === 'update').length, 1, 'options alone post no new card');
    m1 = (await get(owner.token, m1.id)).d.meeting;
  });
  await t.section('join with a meeting ID + passcode (wrong tries are limited)', async () => {
    t.eq((await call('POST', '/api/meetings/lookup', { code: m1.code.replace(/(\d{3})/g, '$1 '), passcode: m1.passcode }, cy.token)).d.id, m1.id);
    t.eq((await call('POST', '/api/meetings/lookup', { code: m1.code, passcode: 'nope' }, cy.token)).s, 404);
    for (let i = 0; i < 9; i++) await call('POST', '/api/meetings/lookup', { code: m1.code, passcode: 'x' + i }, cy.token);
    t.eq((await call('POST', '/api/meetings/lookup', { code: m1.code, passcode: m1.passcode }, cy.token)).s, 429);
  });

  let lm;
  await t.section('lobby: who bypasses, 403 { lobby: true } on the call routes, admit / deny / admit all', async () => {
    lm = (await create(owner.token, { title: 'Lobby test', start: now + 60000, end: now + 3600000, invitees: [bob.id], lobby: 'invited' })).d.meeting;
    const evs = [owner, bob, cy, dee].map((u) => s.sse(u.token)); await s.wait(150);
    const j1 = await call('POST', '/api/meetings/join', { id: lm.id }, cy.token); t.eq(j1.s, 202, j1.d); t.eq(j1.d.lobby, true);
    await evs[0].waitFor('mt_lobby', (d) => d.meeting === lm.id && d.waiting.some((w) => w.uid === cy.id)); await evs[0].waitFor('mt_knock', (d) => d.uid === cy.id);
    const b = await call('POST', '/api/meetings/join', { id: lm.id }, bob.token); t.eq(b.s, 200, b.d); t.eq(b.d.chan, lm.chan);
    const st = await call('POST', '/api/call/start', { chan: lm.chan, mode: 'video', ep: 'bobep1' }, bob.token); t.eq(st.s, 200, st.d);
    const c = s.ctx.calls.get(lm.chan); t.eq(c.meeting, lm.id); t.eq(c.roles[owner.id], 'organizer'); t.eq(c.roles[bob.id], 'presenter');
    t.eq(st.d.call.meeting, lm.id); t.eq(st.d.call.mt.title, 'Lobby test');
    s.ctx.channels = null; s.db.channels[lm.chan].members.push(dee.id); // someone who can see the chat but isn't invited still waits
    const d1 = await call('POST', '/api/call/join', { chan: lm.chan, ep: 'deeep1' }, dee.token); t.eq(d1.s, 403, d1.d); t.eq(d1.d.lobby, true);
    t.eq((await call('POST', '/api/meetings/lobby', { id: lm.id, op: 'admit', uid: cy.id }, cy.token)).s, 403);
    const ad = await call('POST', '/api/meetings/lobby', { id: lm.id, op: 'admit', uid: cy.id }, bob.token); t.eq(ad.s, 200, ad.d); // presenters in the meeting can admit
    await evs[2].waitFor('mt_admitted', (d) => d.meeting === lm.id && d.channel && d.channel.id === lm.chan);
    t.ok(s.db.channels[lm.chan].members.includes(cy.id), 'admitted people get the meeting chat');
    t.eq((await call('POST', '/api/call/join', { chan: lm.chan, ep: 'cyep1' }, cy.token)).s, 200);
    const dn = await call('POST', '/api/meetings/lobby', { id: lm.id, op: 'deny', uid: dee.id }, owner.token); t.eq(dn.s, 200); await evs[3].waitFor('mt_denied', (d) => d.meeting === lm.id);
    t.eq((await call('POST', '/api/call/join', { chan: lm.chan, ep: 'deeep1' }, dee.token)).s, 403);
    await call('POST', '/api/meetings/lobby', { id: lm.id, op: 'leave' }, dee.token);
    const all = await call('POST', '/api/meetings/lobby', { id: lm.id, op: 'admitAll' }, owner.token); t.eq(all.d.waiting, []);
    for (const e of evs) e.close();
  });
  await t.section('lobby policies: everyone / members (guests wait) / organizer only', async () => {
    const pol = async (lobby, who) => { const m = (await create(owner.token, { title: 'P ' + lobby, lobby, invitees: [bob.id] })).d.meeting; return (await call('POST', '/api/meetings/join', { id: m.id }, who.token)).s; };
    t.eq(await pol('everyone', dee), 200); t.eq(await pol('members', dee), 200); t.eq(await pol('organizer', bob), 202); t.eq(await pol('invited', bob), 200);
    s.db.users[dee.id].role = 'guest'; t.eq(await pol('members', dee), 202); t.eq(await pol('everyone', dee), 200); s.db.users[dee.id].role = 'member';
    s.db.settings.meetingRules = { lobby: 'invited' }; t.eq(await pol('', dee), 202, 'session rule is the default'); delete s.db.settings.meetingRules;
  });
  await t.section('guest join by link: the host\'s approval prompt names the meeting; approval is still needed', async () => {
    const ip = { ip: '10.33.0.7' };
    const it = await call('POST', '/api/meetings/intent', { deviceId: 'guestdevice01', meeting: lm.id }, '', ip); t.eq(it.s, 200, it.d);
    t.eq((await call('POST', '/api/meetings/intent', { deviceId: 'x', meeting: lm.id }, '', ip)).s, 200, 'bad input is ignored quietly');
    const ev = s.sse(owner.token); await s.wait(120);
    const j = await call('POST', '/api/join', { name: 'Gus', deviceId: 'guestdevice01' }, '', ip); t.eq(j.s, 202, j.d);
    const jr = await ev.waitFor('joinrequest', (d) => d.name === 'Gus'); t.eq(jr.meeting, lm.id); t.eq(jr.meetingTitle, 'Lobby test'); ev.close();
    const rq = await call('GET', '/api/admin/requests', undefined, owner.token); t.eq(rq.d.requests.find((x) => x.name === 'Gus').meeting, lm.id);
    const ev2 = s.sse(owner.token); const init = await ev2.waitFor('init'); ev2.close(); t.eq(init.mtReqs[j.d.id].meeting, lm.id);
    t.eq((await call('GET', '/api/meetings/get?id=' + lm.id, undefined, '')).s, 401, 'the meeting API needs a session');
  });

  await t.section('reminders: 15 minutes before, ring at the start (not for declined)', async () => {
    const st = now + 14 * MIN, m = (await create(owner.token, { title: 'Soon', start: st, end: st + 30 * MIN, invitees: [bob.id, cy.id] })).d.meeting;
    await call('POST', '/api/meetings/rsvp', { id: m.id, rsvp: 'no' }, cy.token);
    const eb = s.sse(bob.token), ec = s.sse(cy.token); await s.wait(150);
    runMt('reminders', now); await eb.waitFor('mt_reminder', (d) => d.id === m.id && d.kind === 'soon');
    runMt('reminders', st + 5000); await eb.waitFor('mt_reminder', (d) => d.id === m.id && d.kind === 'start');
    t.ok(acts(bob).some((a) => a.kind === 'start' && a.meeting === m.id)); await s.wait(100); t.ok(!ec.has('mt_reminder', (d) => d.id === m.id), 'declined: no reminder');
    const n = s.db.meetings[m.id].sent; runMt('reminders', st + 6000); t.eq(s.db.meetings[m.id].sent, n);
    eb.close(); ec.close();
  });

  await t.section('Q&A: anonymous, upvotes, replies, moderation, live', async () => {
    const id = lm.id, q = (tok, b) => call('POST', '/api/meetings/qa', { id, ...b }, tok);
    const ev = s.sse(bob.token); await s.wait(100);
    t.eq((await q(cy.token, { op: 'ask', text: 'Why?', anon: true })).s, 200); await ev.waitFor('mt_qa', (d) => d.meeting === id);
    await q(bob.token, { op: 'ask', text: 'When?' }); const l = (await call('GET', '/api/meetings/qa?id=' + id, undefined, bob.token)).d.items;
    const anon = l.find((x) => x.text === 'Why?'); t.eq(anon.by, null); t.eq(anon.anon, true); t.eq(anon.mine, false);
    t.eq((await call('GET', '/api/meetings/qa?id=' + id, undefined, cy.token)).d.items.find((x) => x.id === anon.id).mine, true);
    await q(bob.token, { op: 'vote', qid: anon.id }); await q(owner.token, { op: 'vote', qid: anon.id }); await q(owner.token, { op: 'reply', qid: anon.id, text: 'Because.' });
    t.eq((await q(bob.token, { op: 'answer', qid: anon.id })).s, 403);
    t.eq((await q(owner.token, { op: 'answer', qid: anon.id })).s, 200); await q(owner.token, { op: 'pin', qid: anon.id });
    const when = l.find((x) => x.text === 'When?'); await q(owner.token, { op: 'dismiss', qid: when.id });
    const l2 = (await call('GET', '/api/meetings/qa?id=' + id, undefined, cy.token)).d.items; t.ok(!l2.some((x) => x.id === when.id), 'dismissed hidden from others');
    const a2 = l2.find((x) => x.id === anon.id); t.eq([a2.votes, a2.answered, a2.pinned, a2.replies.length], [2, true, true, 1]);
    t.eq((await call('GET', '/api/meetings/qa?id=' + id, undefined, eve.token)).s, 403);
    t.eq((await q(cy.token, { op: 'delete', qid: when.id })).s, 403); t.eq((await q(bob.token, { op: 'delete', qid: when.id })).s, 200);
    t.eq((await q(bob.token, { op: 'ask', text: '' })).s, 400); ev.close();
  });
  await t.section('agenda: add, toggle, move, delete (own or organizer)', async () => {
    const a = (tok, b) => call('POST', '/api/meetings/agenda', { id: lm.id, ...b }, tok);
    await a(bob.token, { op: 'add', text: 'Intro', mins: 5 }); const r = await a(cy.token, { op: 'add', text: 'Demo', mins: 999 }); t.eq(r.d.agenda[1].mins, 480);
    await a(owner.token, { op: 'move', aid: r.d.agenda[1].id, by: -1 }); const r2 = await a(owner.token, { op: 'toggle', aid: r.d.agenda[0].id });
    t.eq(r2.d.agenda.map((x) => [x.text, x.done]), [['Demo', false], ['Intro', true]]);
    t.eq((await a(cy.token, { op: 'del', aid: r2.d.agenda[1].id })).s, 403); t.eq((await a(owner.token, { op: 'del', aid: r2.d.agenda[1].id })).s, 200);
    t.eq((await call('GET', '/api/meetings/agenda?id=' + lm.id, undefined, eve.token)).s, 403);
  });
  await t.section('breakout rooms: create, assign, open (moves people), announce, timer closes them, reuse', async () => {
    const id = lm.id, r = (tok, b) => call('POST', '/api/meetings/rooms', { id, ...b }, tok);
    const evs = { bob: s.sse(bob.token), cy: s.sse(cy.token), own: s.sse(owner.token) }; await s.wait(150);
    t.eq((await r(bob.token, { op: 'create', n: 2 })).s, 403);
    const c1 = await r(owner.token, { op: 'create', n: 2, auto: false }); t.eq(c1.s, 200, c1.d); t.eq(c1.d.state.rooms.length, 2);
    const asg = await r(owner.token, { op: 'assign', assign: { [bob.id]: 0, [cy.id]: 1 } }); t.eq(asg.d.state.rooms.map((x) => x.members), [[bob.id], [cy.id]]);
    const room0 = asg.d.state.rooms[0].chan; t.eq(s.db.channels[room0].kind, 'breakout'); t.eq(s.db.channels[room0].members, [owner.id]);
    const op = await r(owner.token, { op: 'open', minutes: 10 }); t.eq(op.s, 200, op.d); t.ok(op.d.state.open && op.d.state.closesAt > Date.now());
    t.eq(s.db.channels[room0].members.sort(), [owner.id, bob.id].sort());
    const mv = await evs.bob.waitFor('mt_move', (d) => d.reason === 'open'); t.eq(mv.to, room0);
    const st = await call('POST', '/api/call/start', { chan: room0, mode: 'video', ep: 'bobroom' }, bob.token); t.eq(st.s, 200, st.d);
    t.eq(s.ctx.calls.get(room0).meeting, id, 'room calls belong to the meeting'); t.eq((await call('POST', '/api/call/start', { chan: room0, mode: 'video' }, cy.token)).s, 404, 'other rooms stay private');
    t.eq((await r(owner.token, { op: 'announce', text: 'Two minutes left' })).s, 200); await evs.cy.waitFor('mt_announce', (d) => d.text === 'Two minutes left');
    t.ok(s.db.messages.some((m) => m.chan === room0 && /Two minutes left/.test(m.system || '')));
    const mv2 = await r(owner.token, { op: 'assign', assign: { [cy.id]: 0 } }); t.eq(mv2.d.state.rooms[0].members.sort(), [bob.id, cy.id].sort()); await evs.cy.waitFor('mt_move', (d) => d.to === room0);
    runMt('rooms', Date.now() + 11 * MIN); await evs.bob.waitFor('mt_move', (d) => d.reason === 'close' && d.to === lm.chan);
    t.eq(s.db.meetingData[id].rooms.open, false);
    t.eq((await call('GET', '/api/meetings/rooms?id=' + id, undefined, bob.token)).d.state.rooms.length, 2, 'rooms can be reused');
    const re = await r(owner.token, { op: 'open' }); t.eq(re.s, 200); await r(owner.token, { op: 'close' }); t.eq((await r(owner.token, { op: 'delete' })).s, 200); t.ok(!s.db.channels[room0], 'deleted rooms remove their chats');
    await call('POST', '/api/call/leave', { chan: room0 }, bob.token);
    for (const e of Object.values(evs)) e.close();
  });
  await t.section('attendance: join / leave times, CSV for the organizer only', async () => {
    const id = lm.id; await call('POST', '/api/call/leave', { chan: lm.chan }, cy.token); await s.wait(30);
    const a = await call('GET', `/api/meetings/attendance?id=${id}&occ=${encodeURIComponent(s.ctx.calls.get(lm.chan).mtOcc)}`, undefined, owner.token); t.eq(a.s, 200, a.d);
    const byId = Object.fromEntries(a.d.people.map((p) => [p.uid, p])); t.ok(byId[bob.id] && byId[cy.id], a.d); t.ok(byId[cy.id].last >= byId[cy.id].first && !byId[cy.id].here); t.eq(byId[bob.id].here, true);
    t.eq((await call('GET', `/api/meetings/attendance?id=${id}&occ=x`, undefined, bob.token)).s, 403);
    s.db.users[cy.id].name = '=HYPERLINK("x")';
    const csv = await fetch(`${s.B}/api/meetings/attendance?id=${id}&occ=${encodeURIComponent(s.ctx.calls.get(lm.chan).mtOcc)}&format=csv`, { headers: { 'x-token': owner.token } });
    t.eq(csv.status, 200); t.ok(/text\/csv/.test(csv.headers.get('content-type')) && /attachment/.test(csv.headers.get('content-disposition')));
    const text = await csv.text(); t.ok(text.includes('"\'=HYPERLINK(""x"")"'), 'formula cells are defused: ' + text); s.db.users[cy.id].name = 'Cy';
    const g = await get(owner.token, id); t.ok(g.d.meeting.sessions.length >= 1);
  });
  await t.section('recap: chat during the meeting, polls, files, Q&A, agenda; only for the meeting chat', async () => {
    await call('POST', '/api/send', { chan: lm.chan, text: 'notes from the meeting' }, bob.token);
    await call('POST', '/api/send', { chan: lm.chan, poll: { q: 'Ship it?', options: ['Yes', 'No'] } }, owner.token);
    const up = await s.upload(bob.token, 'slides.pdf', Buffer.from('%PDF-1.1')); await call('POST', '/api/send', { chan: lm.chan, text: '', files: [{ id: up.d.id }] }, bob.token);
    const r = await call('GET', '/api/meetings/recap?id=' + lm.id, undefined, cy.token); t.eq(r.s, 200, r.d);
    t.ok(r.d.messages.some((m) => m.text === 'notes from the meeting'), r.d.messages); t.ok(r.d.polls.some((m) => m.poll.q === 'Ship it?'), r.d.polls); t.ok(r.d.files.some((f) => f.name === 'slides.pdf'), r.d.files);
    t.ok(r.d.qa.length >= 1 && r.d.agenda.length >= 1, [r.d.qa, r.d.agenda]); t.ok(r.d.attendees >= 2, r.d.attendees); t.ok(r.d.attendance.every((p) => p.ms === undefined), 'only the organizer sees times');
    t.ok((await call('GET', '/api/meetings/recap?id=' + lm.id, undefined, owner.token)).d.attendance.some((p) => p.ms !== undefined));
    t.eq((await call('GET', '/api/meetings/recap?id=' + lm.id, undefined, eve.token)).s, 403);
    const rec = await call('GET', '/api/meetings/recent', undefined, cy.token); t.ok(rec.d.recent.some((x) => x.id === lm.id));
  });
  await t.section('webinar: attendees can only watch (mics, cameras, sharing), presenters can', async () => {
    const w = (await create(owner.token, { title: 'Webinar', lobby: 'everyone', presenters: [bob.id], invitees: [cy.id], options: { viewOnly: true, present: 'specific' } })).d.meeting;
    t.ok(w.invitees.includes(bob.id), 'presenters are invited');
    const evs = [owner, bob, cy].map((u) => s.sse(u.token)); await s.wait(120);
    t.eq((await call('POST', '/api/call/start', { chan: w.chan, mode: 'video', ep: 'ownw' }, owner.token)).s, 200);
    const c = s.ctx.calls.get(w.chan); t.ok(c.hardMute && c.noCams, 'attendee controls on'); t.ok(c.max >= 16, String(c.max));
    t.eq((await call('POST', '/api/call/join', { chan: w.chan, ep: 'cyw' }, cy.token)).s, 200); t.eq((await call('POST', '/api/call/join', { chan: w.chan, ep: 'bobw' }, bob.token)).s, 200);
    t.eq([c.roles[cy.id], c.roles[bob.id]], ['attendee', 'presenter']);
    t.eq((await call('POST', '/api/call/media', { chan: w.chan, ep: 'cyw', mic: true, cam: false }, cy.token)).s, 403);
    t.eq((await call('POST', '/api/call/media', { chan: w.chan, ep: 'cyw', mic: false, cam: true }, cy.token)).s, 403);
    t.eq((await call('POST', '/api/call/share', { chan: w.chan, ep: 'cyw', on: true }, cy.token)).s, 403);
    t.eq((await call('POST', '/api/call/media', { chan: w.chan, ep: 'bobw', mic: true, cam: true }, bob.token)).s, 200);
    t.eq((await call('POST', '/api/call/admin', { chan: w.chan, ep: 'ownw', action: 'role', uid: cy.id, value: 'presenter' }, owner.token)).s, 200);
    await call('POST', '/api/call/leave', { chan: w.chan }, cy.token); t.eq((await call('POST', '/api/call/join', { chan: w.chan, ep: 'cyw2' }, cy.token)).s, 200); t.eq(c.roles[cy.id], 'presenter', 'a role changed in the meeting stays');
    for (const id of [owner, bob, cy]) await call('POST', '/api/call/leave', { chan: w.chan }, id.token);
    for (const e of evs) e.close();
  });
  await t.section('webinar registration: form, approval, approve all, auto-approve', async () => {
    const reg = { on: true, email: true, notes: true, question: 'Why come?', approve: true };
    const w = (await create(owner.token, { title: 'Open day', options: { viewOnly: true, registration: reg } })).d.meeting;
    const f = await call('GET', '/api/meetings/register?id=' + w.id, undefined, dee.token); t.eq(f.d.fields, { email: true, notes: true, question: 'Why come?' }); t.eq(f.d.open, true);
    t.eq((await call('POST', '/api/meetings/register', { id: w.id, name: 'Dee', email: 'not-an-email' }, dee.token)).s, 400);
    const r = await call('POST', '/api/meetings/register', { id: w.id, name: 'Dee', email: 'dee@example.lan', notes: 'hi', answer: 'learn' }, dee.token); t.eq(r.d.status, 'pending');
    t.ok(acts(s.owner).some((a) => a.kind === 'reg' && a.from === dee.id));
    await call('POST', '/api/meetings/register', { id: w.id, name: 'Cy', email: 'cy@example.lan' }, cy.token);
    t.eq((await call('GET', '/api/meetings/registrations?id=' + w.id, undefined, dee.token)).s, 403);
    const list = (await call('GET', '/api/meetings/registrations?id=' + w.id, undefined, owner.token)).d.registrations; t.eq(list.length, 2);
    t.eq((await call('POST', '/api/meetings/registrations', { id: w.id, op: 'decline', rid: list.find((x) => x.name === 'Cy').id }, owner.token)).s, 200);
    t.eq((await call('POST', '/api/meetings/registrations', { id: w.id, op: 'approve', all: true }, owner.token)).d.decided, 1);
    const m = s.db.meetings[w.id]; t.ok(m.invitees.includes(dee.id) && !m.invitees.includes(cy.id)); t.ok(s.db.channels[w.chan].members.includes(dee.id));
    t.ok(acts(dee).some((a) => a.kind === 'regok' && a.link === '#meet=' + w.id)); t.ok(acts(cy).some((a) => a.kind === 'regno'));
    const auto = (await create(owner.token, { title: 'Auto', options: { viewOnly: true, registration: { ...reg, approve: false } } })).d.meeting;
    t.eq((await call('POST', '/api/meetings/register', { id: auto.id, name: 'Bob', email: 'b@x.lan' }, bob.token)).d.status, 'approved');
    t.eq((await call('POST', '/api/meetings/register', { id: lm.id, name: 'Bob', email: 'b@x.lan' }, bob.token)).s, 400, 'no registration on normal meetings');
  });
  await t.section('templates: save, replace by name, delete', async () => {
    const r = await call('POST', '/api/meetings/templates', { op: 'save', name: 'Retro', titlePrefix: 'Retro', duration: 45, lobby: 'invited', options: { qa: false, chat: 'during' } }, bob.token); t.eq(r.s, 200, r.d);
    await call('POST', '/api/meetings/templates', { op: 'save', name: 'retro', duration: 99999 }, bob.token);
    const l = (await call('GET', '/api/meetings/templates', undefined, bob.token)).d.templates; t.eq(l.length, 1); t.eq(l[0].duration, 1440);
    t.eq((await call('GET', '/api/meetings/templates', undefined, cy.token)).d.templates, []);
    t.eq((await call('POST', '/api/meetings/templates', { op: 'delete', tid: l[0].id }, bob.token)).d.templates, []);
  });
  await t.section('meeting chat on / off / only during the meeting', async () => {
    const m = (await create(owner.token, { title: 'Quiet', invitees: [bob.id], options: { chat: 'off' } })).d.meeting;
    t.eq((await call('POST', '/api/send', { chan: m.chan, text: 'hi' }, bob.token)).s, 403); t.eq((await call('POST', '/api/send', { chan: m.chan, text: 'hi' }, owner.token)).s, 200);
    await call('POST', '/api/meetings/update', { id: m.id, options: { chat: 'during' } }, owner.token); t.eq((await call('POST', '/api/send', { chan: m.chan, text: 'hi' }, bob.token)).s, 403);
    const ev = s.sse(owner.token); await s.wait(100); await call('POST', '/api/call/start', { chan: m.chan, mode: 'voice', ep: 'quietep' }, owner.token);
    t.eq((await call('POST', '/api/send', { chan: m.chan, text: 'now' }, bob.token)).s, 200); await call('POST', '/api/call/leave', { chan: m.chan }, owner.token); ev.close();
  });
  await t.section('cancel: organizer or admin; card + activity; join refused afterwards', async () => {
    t.eq((await call('POST', '/api/meetings/cancel', { id: m1.id }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/meetings/cancel', { id: m1.id, message: 'Sorry!' }, adm.token)).s, 200);
    t.ok(s.db.messages.some((x) => x.chan === m1.chan && x.mtCard && x.mtCard.kind === 'cancel' && x.mtCard.note === 'Sorry!')); t.ok(acts(bob).some((a) => a.kind === 'cancel' && a.meeting === m1.id));
    t.eq((await call('POST', '/api/meetings/join', { id: m1.id }, bob.token)).s, 400);
    t.ok(!(await call('GET', `/api/meetings?from=${now}&to=${now + 3 * DAY}`, undefined, bob.token)).d.meetings.some((x) => x.id === m1.id));
  });
  await t.section('meet now: instant meeting in a channel, not on calendars; old / partial records still load', async () => {
    const r = await call('POST', '/api/meetings/create', { instant: true, title: 'Meeting in general', chan: 'general' }, bob.token); t.eq(r.s, 200, r.d); t.eq(r.d.meeting.adhoc, true);
    t.ok(!(await call('GET', `/api/meetings?from=${now - DAY}&to=${now + DAY}`, undefined, bob.token)).d.meetings.some((x) => x.id === r.d.meeting.id));
    t.ok(!s.db.messages.some((x) => x.mtCard && x.mtCard.meeting === r.d.meeting.id), 'no invitation card for meet now');
    s.db.meetings.aaaaaaaaaaaaaaaa = { id: 'aaaaaaaaaaaaaaaa', title: 'Legacy', organizer: owner.id, start: now + DAY, end: now + DAY + 30 * MIN, chan: 'general' };
    const g = await get(owner.token, 'aaaaaaaaaaaaaaaa'); t.eq(g.s, 200, g.d); t.eq(g.d.meeting.lobby, 'members');
    t.eq((await call('GET', `/api/meetings?from=${now}&to=${now + 3 * DAY}`, undefined, owner.token)).s, 200);
  });
});
