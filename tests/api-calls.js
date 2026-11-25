'use strict';
// Calls area API: devices (endpoints), ringing + missed calls + voicemail offers, forwarding, roles and organizer controls,
// hold, hands order, sharing kinds, annotations, control, recording, add people / transfer / consult / park, the call log,
// call settings, voicemail, rating and the walkie-talkie.
const H = require('./harness');
H.suite('Calls (calling, meetings, sharing, recording)', async (t) => {
  const s = await t.server();
  const ana = await s.user('Ana'), bob = await s.user('Bob'), cy = await s.user('Cy'), dee = await s.user('Dee');
  const live = {}; for (const u of [ana, bob, cy, dee, s.owner]) { live[u.id] = s.sse(u.token); await live[u.id].waitFor('init'); }
  const P = (p, b, u) => s.call('POST', p, b, u.token), G = (p, u) => s.call('GET', p, undefined, u.token);
  const dmAB = s.dm(ana, bob), dmAC = s.dm(ana, cy), dmBC = s.dm(bob, cy);
  const st = (chan) => s.ctx.callState(chan);
  const endAll = async () => { s.ctx.hits.clear(); for (const chan of [...s.ctx.calls.keys()]) for (const id of [...s.ctx.calls.get(chan).parts]) s.ctx.leaveCall(chan, id); };

  await t.section('two devices of one person: both are in the call, signaling goes to the right device', async () => {
    let r = await P('/api/call/start', { chan: 'general', mode: 'video', ep: 'ana-laptop' }, ana); t.eq(r.s, 200, r.d);
    r = await P('/api/call/join', { chan: 'general', ep: 'bob-pc' }, bob); t.eq(r.s, 200, r.d);
    r = await P('/api/call/join', { chan: 'general', ep: 'ana-phone', companion: true }, ana); t.eq(r.s, 200, r.d);
    const c = st('general'); t.eq(c.participants.sort(), [ana.id, bob.id].sort()); t.eq(c.endpoints.length, 3); t.ok(c.endpoints.find((e) => e.ep === 'ana-phone').companion);
    t.eq(c.roles[ana.id], 'organizer'); t.eq(c.roles[bob.id], 'presenter');
    r = await P('/api/call/signal', { chan: 'general', to: 'ana-phone', from: 'bob-pc', kind: 'offer', data: { sdp: 'x' } }, bob); t.eq(r.s, 200, r.d);
    const sig = await live[ana.id].waitFor('callsig', (d) => d.to === 'ana-phone'); t.eq(sig.fromEp, 'bob-pc');
    r = await P('/api/call/signal', { chan: 'general', to: 'ana-phone', from: 'ana-laptop', kind: 'offer', data: {} }, bob); t.eq(r.s, 200, 'a device id that is not yours is replaced by yours');
    const sig2 = await live[ana.id].waitFor('callsig', (d) => d.to === 'ana-phone' && d !== sig); t.eq(sig2.fromEp, 'bob-pc');
    r = await P('/api/call/join', { chan: 'general', ep: 'bob-pc' }, cy); t.eq(r.s, 409, 'cannot take another person\'s device id');
    // companion: its camera is its own; the main device's mic/cam/hand stay in media
    await P('/api/call/media', { chan: 'general', ep: 'ana-phone', cam: true, mic: true }, ana);
    t.ok(st('general').endpoints.find((e) => e.ep === 'ana-phone').cam); t.eq(st('general').media[ana.id], undefined);
    await P('/api/call/leave', { chan: 'general', ep: 'ana-laptop' }, ana); t.ok(st('general').participants.includes(ana.id), 'still in on the phone');
    await P('/api/call/leave', { chan: 'general', ep: 'ana-phone' }, ana); t.ok(!st('general').participants.includes(ana.id));
    await P('/api/call/leave', { chan: 'general' }, bob); t.eq(st('general'), null);
  });

  await t.section('hands are numbered in the order raised; organizer lowers all', async () => {
    await P('/api/call/start', { chan: 'general', mode: 'voice' }, ana); for (const u of [bob, cy, dee]) await P('/api/call/join', { chan: 'general' }, u);
    await P('/api/call/media', { chan: 'general', hand: true }, cy); await s.wait(5); await P('/api/call/media', { chan: 'general', hand: true }, bob); await s.wait(5); await P('/api/call/media', { chan: 'general', hand: true }, dee);
    t.eq(st('general').hands, [cy.id, bob.id, dee.id]);
    await P('/api/call/media', { chan: 'general', hand: false }, bob); t.eq(st('general').hands, [cy.id, dee.id]);
    let r = await P('/api/call/admin', { chan: 'general', action: 'lowerhands' }, s.owner); t.eq(r.s, 400, 'not in the call');
    r = await P('/api/call/admin', { chan: 'general', action: 'lowerhands' }, ana); t.eq(r.s, 200, r.d); t.eq(st('general').hands, []);
    await live[cy.id].waitFor('callcmd', (d) => d.action === 'lowerhand');
    await endAll();
  });

  await t.section('organizer controls: mute, hard mute, cameras, roles, spotlight, lock, remove, end — enforced on the server', async () => {
    await P('/api/call/start', { chan: 'general', mode: 'video' }, ana); for (const u of [bob, cy]) await P('/api/call/join', { chan: 'general' }, u);
    for (const u of [bob, cy]) await P('/api/call/media', { chan: 'general', mic: true, cam: true }, u);
    let r = await P('/api/call/admin', { chan: 'general', action: 'role', uid: cy.id, value: 'attendee' }, bob); t.eq(r.s, 403, 'presenters cannot change roles');
    r = await P('/api/call/admin', { chan: 'general', action: 'role', uid: cy.id, value: 'attendee' }, ana); t.eq(r.s, 200, r.d); t.eq(st('general').roles[cy.id], 'attendee');
    r = await P('/api/call/admin', { chan: 'general', action: 'role', uid: ana.id, value: 'presenter' }, ana); t.eq(r.s, 400, 'keeps one organizer');
    r = await P('/api/call/share', { chan: 'general', on: true }, cy); t.eq(r.s, 403, 'attendees cannot share');
    r = await P('/api/call/admin', { chan: 'general', action: 'mute', uid: bob.id }, cy); t.eq(r.s, 403, 'attendees cannot mute others');
    r = await P('/api/call/admin', { chan: 'general', action: 'mute', uid: bob.id }, ana); t.eq(r.s, 200, r.d); t.eq(st('general').media[bob.id].mic, false); await live[bob.id].waitFor('callcmd', (d) => d.action === 'mute');
    r = await P('/api/call/admin', { chan: 'general', action: 'hardmute', value: true }, ana); t.eq(st('general').media[cy.id].mic, false); t.ok(st('general').hardMute);
    r = await P('/api/call/media', { chan: 'general', mic: true, cam: true }, cy); t.eq(r.s, 403, 'attendee cannot unmute under hard mute');
    r = await P('/api/call/media', { chan: 'general', mic: true, cam: true }, bob); t.eq(r.s, 200, 'presenters can');
    await P('/api/call/admin', { chan: 'general', action: 'allowmic', uid: cy.id, value: true }, ana); r = await P('/api/call/media', { chan: 'general', mic: true, cam: true }, cy); t.eq(r.s, 200, 'allowed to unmute');
    await P('/api/call/admin', { chan: 'general', action: 'nocams', value: true }, ana); t.eq(st('general').media[cy.id].cam, false);
    r = await P('/api/call/media', { chan: 'general', mic: true, cam: true }, cy); t.eq(r.s, 403, 'attendee camera blocked');
    r = await P('/api/call/admin', { chan: 'general', action: 'spotlight', uid: bob.id }, ana); t.eq(st('general').spotlight, bob.id);
    r = await P('/api/call/admin', { chan: 'general', action: 'lock', value: true }, bob); t.eq(r.s, 403, 'only organizers lock');
    await P('/api/call/admin', { chan: 'general', action: 'lock', value: true }, ana); r = await P('/api/call/join', { chan: 'general' }, dee); t.eq(r.s, 403, 'locked'); t.ok(/locked/.test(r.d.error));
    r = await P('/api/call/admin', { chan: 'general', action: 'remove', uid: cy.id }, ana); t.eq(r.s, 200, r.d); t.ok(!st('general').participants.includes(cy.id)); await live[cy.id].waitFor('callcmd', (d) => d.action === 'removed');
    await P('/api/call/admin', { chan: 'general', action: 'lock', value: false }, ana);
    r = await P('/api/call/join', { chan: 'general' }, cy); t.eq(r.s, 403, 'removed people stay out');
    await P('/api/call/ring', { chan: 'general', users: [cy.id] }, ana); r = await P('/api/call/join', { chan: 'general' }, cy); t.eq(r.s, 200, 'until they are invited back');
    r = await P('/api/call/admin', { chan: 'general', action: 'end' }, bob); t.eq(r.s, 403);
    r = await P('/api/call/admin', { chan: 'general', action: 'end' }, ana); t.eq(r.s, 200, r.d); t.eq(st('general'), null); await live[bob.id].waitFor('callcmd', (d) => d.action === 'ended');
  });

  await t.section('session rule "only organizers present" makes others attendees; maxPeople caps the call', async () => {
    s.ctx.S.meetingRules = { present: 'organizers', maxPeople: 2 };
    await P('/api/call/start', { chan: 'general', mode: 'voice' }, ana); await P('/api/call/join', { chan: 'general' }, bob);
    t.eq(st('general').roles[bob.id], 'attendee'); t.eq((await P('/api/call/share', { chan: 'general', on: true }, bob)).s, 403);
    const r = await P('/api/call/join', { chan: 'general' }, cy); t.eq(r.s, 409); t.ok(/full \(2/.test(r.d.error), r.d);
    delete s.db.settings.meetingRules; await endAll();
  });

  await t.section('ringing: unanswered 1:1 call -> missed call activity + voicemail offer; decline; busy; Do not disturb', async () => {
    let r = await P('/api/call/start', { chan: dmAB, mode: 'video', ep: 'ana-1' }, ana); t.eq(r.s, 200, r.d);
    await live[bob.id].waitFor('callring', (d) => d.chan === dmAB); t.eq(st(dmAB).ringing, [bob.id]);
    s.tick(Date.now() + 31000);
    const na = await live[ana.id].waitFor('callnoanswer', (d) => d.chan === dmAB && d.reason === 'noanswer'); t.ok(na.voicemail);
    const act = await live[bob.id].waitFor('activity', (d) => d.type === 'missedCall' && d.chan === dmAB); t.eq(act.from, ana.id); t.eq(act.mode, 'video');
    await P('/api/call/leave', { chan: dmAB }, ana);
    // decline
    await P('/api/call/start', { chan: dmAB, mode: 'voice' }, ana); await live[bob.id].waitFor('callring', (d) => d.chan === dmAB && d.call.mode === 'voice');
    r = await P('/api/call/decline', { chan: dmAB }, bob); t.eq(r.s, 200, r.d); await live[ana.id].waitFor('callnoanswer', (d) => d.reason === 'declined');
    t.eq(st(dmAB).ringing, []); await live[bob.id].waitFor('callringstop', (d) => d.chan === dmAB);
    await P('/api/call/leave', { chan: dmAB }, ana);
    // busy in another call
    await P('/api/call/start', { chan: 'general', mode: 'voice' }, bob);
    await P('/api/call/start', { chan: dmAB, mode: 'voice' }, ana); await live[ana.id].waitFor('callnoanswer', (d) => d.reason === 'busy'); t.eq(st(dmAB).ringing, []);
    await P('/api/call/leave', { chan: dmAB }, ana); await P('/api/call/leave', { chan: 'general' }, bob);
    // do not disturb
    s.db.users[cy.id].presence = 'dnd'; await P('/api/call/start', { chan: dmAC, mode: 'voice' }, ana); await live[ana.id].waitFor('callnoanswer', (d) => d.reason === 'dnd'); s.db.users[cy.id].presence = 'auto';
    await P('/api/call/leave', { chan: dmAC }, ana);
  });

  await t.section('call log: start, people, missed, end; history filters; call back data', async () => {
    const log = s.db.callLog; t.ok(Array.isArray(log) && log.length >= 5, 'entries');
    const e = log.find((x) => x.chan === dmAB && x.missed.includes(bob.id)); t.ok(e && e.end > 0 && e.by === ana.id && e.mode, JSON.stringify(e));
    let r = await G('/api/callx/history?f=missed', bob); t.ok(r.d.calls.length >= 2 && r.d.calls.every((x) => x.missed && x.dir === 'in'), r.d);
    r = await G('/api/callx/history?f=outgoing', ana); t.ok(r.d.calls.length && r.d.calls.every((x) => x.dir === 'out'), r.d);
    r = await G('/api/callx/history?f=incoming', ana); t.ok(r.d.calls.every((x) => x.dir === 'in'));
    r = await G('/api/callx/history', dee); t.ok(r.d.calls.every((x) => x.chan === 'general'), 'only calls you were part of');
  });

  s.ctx.hits.clear();
  await t.section('forwarding: always to voicemail, unanswered to another person (the caller\'s call moves there)', async () => {
    let r = await P('/api/callx/prefs', { forward: { always: 'voicemail', unanswered: 'voicemail', busy: 'off' } }, bob); t.eq(r.s, 200, r.d);
    await P('/api/call/start', { chan: dmAB, mode: 'voice' }, ana); await live[ana.id].waitFor('callnoanswer', (d) => d.reason === 'always' && d.voicemail);
    await P('/api/call/leave', { chan: dmAB }, ana);
    r = await P('/api/callx/prefs', { forward: { always: 'off', unanswered: cy.id, busy: 'voicemail' } }, bob); t.eq(r.d.prefs.forward.unanswered, cy.id);
    r = await P('/api/callx/prefs', { forward: { always: bob.id } }, bob); t.eq(r.d.prefs.forward.always, 'off', 'cannot forward to yourself');
    await P('/api/callx/prefs', { forward: { always: 'off', unanswered: cy.id, busy: 'voicemail' } }, bob);
    await P('/api/call/start', { chan: dmAB, mode: 'voice', ep: 'ana-x' }, ana); await live[bob.id].waitFor('callring', (d) => d.chan === dmAB);
    s.tick(Date.now() + 31000);
    const mv = await live[ana.id].waitFor('callmove', (d) => d.from === dmAB && d.reason === 'forward'); t.eq(mv.to, dmAC); t.eq(mv.fwd, bob.id);
    const rg = await live[cy.id].waitFor('callring', (d) => d.chan === dmAC); t.eq(rg.fwd, bob.id);
    t.eq(st(dmAB), null); t.eq(st(dmAC).participants, [ana.id]); t.eq(st(dmAC).endpoints[0].ep, 'ana-x', 'same device moved');
    await P('/api/call/leave', { chan: dmAC }, ana); await P('/api/callx/prefs', { forward: { always: 'off', unanswered: 'voicemail', busy: 'voicemail' } }, bob);
  });

  await t.section('voicemail: greeting, leave, list, play with ranges, heard, delete; activity item', async () => {
    await P('/api/callx/prefs', { greeting: 'Hi, Bob here. Leave a message!' }, bob);
    let r = await G('/api/voicemail/greeting?to=' + bob.id, ana); t.eq(r.d.greeting, 'Hi, Bob here. Leave a message!');
    const up = await s.upload(ana.token, 'voicemail.weba', Buffer.alloc(3000, 7), 'audio/webm'); t.eq(up.s, 200, up.d);
    r = await P('/api/voicemail/leave', { to: bob.id, chan: dmAC, file: up.d.id, dur: 4 }, ana); t.eq(r.s, 400, 'only in the 1:1 chat with them');
    r = await P('/api/voicemail/leave', { to: bob.id, chan: dmAB, file: up.d.id, dur: 4 }, ana); t.eq(r.s, 200, r.d);
    t.eq(s.db.files[up.d.id], undefined, 'moved out of the shared uploads');
    await live[bob.id].waitFor('activity', (d) => d.type === 'voicemail' && d.from === ana.id);
    r = await G('/api/voicemail', bob); t.eq(r.d.unheard, 1); const v = r.d.voicemail[0]; t.eq(v.from, ana.id); t.eq(v.dur, 4);
    t.eq((await G('/api/voicemail', cy)).d.voicemail.length, 0, 'private');
    const a = await fetch(`${s.B}/api/voicemail/audio?id=${v.id}&token=${bob.token}`, { headers: { range: 'bytes=0-99' } }); t.eq(a.status, 206); t.eq((await a.arrayBuffer()).byteLength, 100); t.eq(a.headers.get('content-type'), 'audio/webm');
    t.eq((await fetch(`${s.B}/api/voicemail/audio?id=${v.id}&token=${cy.token}`)).status, 404, 'others cannot play it');
    await P('/api/voicemail/heard', { id: v.id }, bob); t.eq((await G('/api/voicemail', bob)).d.unheard, 0);
    r = await P('/api/voicemail/delete', { id: v.id }, bob); t.eq(r.s, 200, r.d); t.eq((await G('/api/voicemail', bob)).d.voicemail.length, 0);
    const up2 = await s.upload(ana.token, 'evil.html', Buffer.from('<script>'), 'text/html'); r = await P('/api/voicemail/leave', { to: bob.id, chan: dmAB, file: up2.d.id }, ana); t.eq(r.s, 400, 'audio only');
  });

  s.ctx.hits.clear();
  await t.section('hold, sharing kinds (PDF must be in the chat), pause/page, annotations and control', async () => {
    await P('/api/call/start', { chan: 'general', mode: 'video' }, ana); await P('/api/call/join', { chan: 'general' }, bob); { const j = await P('/api/call/join', { chan: 'general' }, cy); t.eq(j.s, 200, j.d); }
    await P('/api/call/hold', { chan: 'general', on: true }, bob); t.eq(st('general').held, [bob.id]); await P('/api/call/hold', { chan: 'general', on: false }, bob); t.eq(st('general').held, []);
    const pdf = await s.upload(ana.token, 'slides.pdf', Buffer.from('%PDF-1.1\n%%EOF'), 'application/pdf');
    let r = await P('/api/call/share', { chan: 'general', on: true, kind: 'pdf', file: pdf.d.id }, ana); t.eq(r.s, 400, 'not in the chat yet');
    await P('/api/send', { chan: 'general', text: 'slides', files: [{ id: pdf.d.id }] }, ana);
    r = await P('/api/call/share', { chan: 'general', on: true, kind: 'pdf', file: pdf.d.id, page: 2 }, ana); t.eq(r.s, 200, r.d);
    t.eq(st('general').share.kind, 'pdf'); t.eq(st('general').share.page, 2); t.eq(st('general').sharing, ana.id);
    r = await P('/api/call/sharestate', { chan: 'general', page: 5 }, bob); t.eq(r.s, 403, 'only the presenter turns pages');
    await P('/api/call/sharestate', { chan: 'general', page: 5, paused: true }, ana); t.eq(st('general').share.page, 5); t.ok(st('general').paused);
    r = await P('/api/call/ink', { chan: 'general', k: 'laser', x: 5000, y: 5000 }, bob); t.eq(r.s, 403, 'viewers need permission to annotate');
    r = await P('/api/call/ink', { chan: 'general', k: 'pen', pts: [1, 2, 3, 99999], c: '#00ff00' }, ana); t.eq(r.s, 200, r.d);
    const ink = await live[bob.id].waitFor('callink', (d) => d.k === 'pen'); t.eq(ink.pts, [1, 2, 3, 10000]); t.eq(ink.c, '#00ff00');
    await P('/api/call/sharestate', { chan: 'general', inkAll: true }, ana); r = await P('/api/call/ink', { chan: 'general', k: 'laser', x: 1, y: 2 }, bob); t.eq(r.s, 200, r.d);
    r = await P('/api/call/ink', { chan: 'general', k: 'pen', pts: [1] }, bob); t.eq(r.s, 400);
    r = await P('/api/call/control', { chan: 'general', action: 'request' }, cy); t.eq(r.s, 200, r.d); await live[ana.id].waitFor('callctl', (d) => d.type === 'request' && d.from === cy.id);
    r = await P('/api/call/control', { chan: 'general', action: 'give', uid: cy.id }, bob); t.eq(r.s, 403, 'only the presenter gives control');
    r = await P('/api/call/control', { chan: 'general', action: 'give', uid: cy.id }, ana); t.eq(st('general').ctl.to, cy.id); await live[cy.id].waitFor('callctl', (d) => d.type === 'given');
    r = await P('/api/call/control', { chan: 'general', action: 'take' }, ana); t.eq(st('general').ctl, null);
    r = await P('/api/call/share', { chan: 'general', on: true, kind: 'board' }, bob); t.eq(st('general').share.kind, 'board'); t.eq(st('general').sharing, bob.id, 'takes over');
    await endAll();
  });

  await t.section('recording: who may record (session rule, per-meeting choice), notices, posting the video as a recording message', async () => {
    await P('/api/call/start', { chan: 'general', mode: 'video' }, ana); await P('/api/call/join', { chan: 'general' }, bob);
    s.ctx.S.meetingRules = { record: 'organizers' };
    let r = await P('/api/call/record', { chan: 'general', on: true }, bob); t.eq(r.s, 403, 'organizers only');
    r = await P('/api/call/admin', { chan: 'general', action: 'recpolicy', value: 'everyone' }, ana); t.eq(r.s, 200, r.d); t.eq(st('general').recPolicy, 'everyone');
    r = await P('/api/call/record', { chan: 'general', on: true }, bob); t.eq(r.s, 200, r.d); t.eq(st('general').rec.by, bob.id);
    t.ok(s.db.messages.some((m) => m.chan === 'general' && /Bob started recording/.test(m.system || '')));
    r = await P('/api/call/record', { chan: 'general', on: true }, ana); t.eq(r.s, 409, 'one recorder at a time');
    const vid = await s.upload(bob.token, 'Meeting recording part 1.webm', Buffer.alloc(5000, 1), 'video/webm');
    r = await P('/api/call/recpost', { chan: 'general', file: vid.d.id, part: 1, dur: 61 }, ana); t.eq(r.s, 403, 'only the recorder posts');
    r = await P('/api/call/recpost', { chan: 'general', file: vid.d.id, part: 1, dur: 61 }, bob); t.eq(r.s, 200, r.d);
    const m = s.db.messages.find((x) => x.id === r.d.id); t.ok(m.recording && m.files[0].id === vid.d.id && m.rec.dur === 61, JSON.stringify(m));
    r = await P('/api/call/recpost', { chan: 'general', file: vid.d.id, part: 1 }, bob); t.eq(r.s, 409, 'no double posts');
    r = await P('/api/call/record', { chan: 'general', on: false }, ana); t.eq(r.s, 200, 'an organizer can stop it'); await live[bob.id].waitFor('callcmd', (d) => d.action === 'stoprec');
    t.ok(s.db.messages.some((m2) => m2.chan === 'general' && m2.system === 'Recording stopped'));
    const vid2 = await s.upload(bob.token, 'part2.webm', Buffer.alloc(100, 1), 'video/webm'); r = await P('/api/call/recpost', { chan: 'general', file: vid2.d.id, part: 2 }, bob); t.eq(r.s, 200, 'the last part can still be posted after stopping');
    s.ctx.S.meetingRules = { record: 'nobody' }; await P('/api/call/admin', { chan: 'general', action: 'recpolicy', value: 'nobody' }, ana);
    r = await P('/api/call/record', { chan: 'general', on: true }, ana); t.eq(r.s, 403); delete s.db.settings.meetingRules; await endAll();
  });

  await t.section('add people to a 1:1 call: a group chat is made and everyone moves; ring someone into a group call', async () => {
    await P('/api/call/start', { chan: dmAB, mode: 'video', ep: 'a1' }, ana); await P('/api/call/join', { chan: dmAB, ep: 'b1' }, bob);
    let r = await P('/api/call/ring', { chan: dmAB, users: [cy.id] }, ana); t.eq(r.s, 200, r.d); const g = r.d.chan; t.ok(g.startsWith('g-'));
    t.eq(s.db.channels[g].members.sort(), [ana.id, bob.id, cy.id].sort());
    await live[bob.id].waitFor('callmove', (d) => d.from === dmAB && d.to === g); await live[cy.id].waitFor('callring', (d) => d.chan === g && d.add);
    t.eq(st(g).participants.sort(), [ana.id, bob.id].sort()); t.eq(st(dmAB), null);
    r = await P('/api/call/ring', { chan: g, users: [dee.id] }, ana); t.eq(r.s, 400, 'Dee is not in that group chat');
    await endAll();
  });

  await t.section('transfer (direct and after consulting) and park / pick up', async () => {
    await P('/api/call/start', { chan: dmAB, mode: 'voice', ep: 'a1' }, ana); await P('/api/call/join', { chan: dmAB, ep: 'b1' }, bob);
    let r = await P('/api/call/transfer', { chan: dmAB, to: cy.id }, ana); t.eq(r.s, 200, r.d); t.eq(r.d.chan, dmBC);
    await live[bob.id].waitFor('callmove', (d) => d.to === dmBC && d.reason === 'transfer' && d.xfer === ana.id);
    const rg = await live[cy.id].waitFor('callring', (d) => d.chan === dmBC); t.eq(rg.xfer, ana.id);
    t.eq(st(dmAB), null); t.eq(st(dmBC).participants, [bob.id]); await endAll();
    // consult first
    await P('/api/call/start', { chan: dmAB, mode: 'voice', ep: 'a1' }, ana); await P('/api/call/join', { chan: dmAB, ep: 'b1' }, bob);
    r = await P('/api/call/consult', { chan: dmAB, to: cy.id }, ana); t.eq(r.s, 200, r.d); t.eq(r.d.chan, dmAC);
    t.eq(st(dmAB).consult, { by: ana.id, to: cy.id }); t.eq(st(dmAB).participants, [bob.id]); t.eq(st(dmAC).consultOf, { from: dmAB, by: ana.id, other: bob.id, to: cy.id });
    r = await P('/api/call/transfer', { chan: dmAC, complete: true }, ana); t.eq(r.s, 409, 'Cy has not answered');
    await P('/api/call/join', { chan: dmAC, ep: 'c1' }, cy);
    r = await P('/api/call/transfer', { chan: dmAC, complete: true }, ana); t.eq(r.s, 200, r.d);
    t.eq(st(dmBC).participants.sort(), [bob.id, cy.id].sort()); t.eq(st(dmAB), null); t.eq(st(dmAC), null); await endAll();
    // park
    await P('/api/call/start', { chan: dmAB, mode: 'voice', ep: 'a1' }, ana); await P('/api/call/join', { chan: dmAB, ep: 'b1' }, bob);
    r = await P('/api/call/park', { chan: dmAB }, ana); t.eq(r.s, 200, r.d); const code = r.d.code; t.ok(/^\d{3}$/.test(code));
    t.eq(st(dmAB).parked.code, code); t.eq(st(dmAB).participants, [bob.id]);
    r = await P('/api/call/pickup', { code }, cy); t.eq(r.s, 404, 'not their chat');
    r = await P('/api/call/pickup', { code }, ana); t.eq(r.s, 200, r.d); t.eq(r.d.chan, dmAB); t.eq(st(dmAB).parked, null);
    r = await P('/api/call/join', { chan: dmAB, ep: 'a-phone' }, ana); t.eq(r.s, 200, r.d); await endAll();
  });

  await t.section('rating and quality go into db.callLog for people who were in the call', async () => {
    const e = s.db.callLog.filter((x) => x.parts.includes(bob.id) && x.parts.includes(ana.id)).pop();
    let r = await P('/api/callx/rate', { id: e.id, stars: 4, issues: ['echo', 'nonsense'] }, bob); t.eq(r.s, 200, r.d); t.eq(e.ratings[bob.id].stars, 4); t.eq(e.ratings[bob.id].issues, ['echo']);
    r = await P('/api/callx/rate', { id: e.id, stars: 9 }, bob); t.eq(r.s, 400);
    r = await P('/api/callx/rate', { id: e.id, stars: 3 }, dee); t.eq(r.s, 404, 'not your call');
    r = await P('/api/callx/quality', { id: e.id, rtt: 23.4, loss: 0.25, jitter: 5 }, ana); t.eq(r.s, 200, r.d); t.eq(e.quality[ana.id], { rtt: 23, loss: 0.3, jitter: 5 });
  });

  await t.section('call settings: validated, private, sent at sign-in', async () => {
    let r = await P('/api/callx/prefs', { ringtone: 'marimba', ringtoneFwd: '<script>', speedDial: [bob.id, ana.id, 'nope', cy.id], autoRecord: 1, greeting: 'x'.repeat(500) }, ana);
    t.eq(r.d.prefs.ringtone, 'marimba'); t.eq(r.d.prefs.ringtoneFwd, 'chimes'); t.eq(r.d.prefs.speedDial, [bob.id, cy.id]); t.eq(r.d.prefs.autoRecord, true); t.eq(r.d.prefs.greeting.length, 200);
    const ev = s.sse(ana.token); const init = await ev.waitFor('init'); ev.close(); t.eq(init.callPrefs.ringtone, 'marimba');
    r = await G('/api/callx/prefs', bob); t.ok(!r.d.prefs.speedDial, 'each person has their own');
  });

  await t.section('walkie-talkie: connect, one talker at a time, signaling between connected devices only', async () => {
    let r = await P('/api/walkie/join', { chan: 'general', ep: 'wa-1' }, ana); t.eq(r.s, 200, r.d); await P('/api/walkie/join', { chan: 'general', ep: 'wb-1' }, bob);
    r = await P('/api/walkie/talk', { chan: 'general', ep: 'wa-1', on: true }, ana); t.eq(r.d.floor, true);
    const w = await live[bob.id].waitFor('walkie', (d) => d.floor && d.floor.uid === ana.id); t.eq(w.people.sort(), [ana.id, bob.id].sort());
    r = await P('/api/walkie/talk', { chan: 'general', ep: 'wb-1', on: true }, bob); t.eq(r.s, 409, 'Ana has the floor'); t.ok(/Ana is talking/.test(r.d.error));
    await P('/api/walkie/talk', { chan: 'general', ep: 'wa-1', on: false }, ana); r = await P('/api/walkie/talk', { chan: 'general', ep: 'wb-1', on: true }, bob); t.eq(r.d.floor, true);
    r = await P('/api/walkie/signal', { chan: 'general', ep: 'wb-1', to: 'wa-1', kind: 'offer', data: { sdp: 'x' } }, bob); t.eq(r.s, 200, r.d); await live[ana.id].waitFor('walkiesig', (d) => d.fromEp === 'wb-1');
    r = await P('/api/walkie/signal', { chan: 'general', ep: 'wc-1', to: 'wa-1', kind: 'offer', data: {} }, cy); t.eq(r.s, 400, 'not connected');
    r = await P('/api/walkie/join', { chan: dmAB, ep: 'wc-2' }, cy); t.eq(r.s, 404, 'only chats you are in');
    s.tick(Date.now() + 61000); t.eq((await G('/api/walkie/state', ana)).d.walkies.length, 0, 'idle devices drop out');
  });

  await t.section('a dead device drops out of the call after its heartbeats stop', async () => {
    await P('/api/call/start', { chan: 'general', mode: 'voice', ep: 'hb-a' }, ana); await P('/api/call/join', { chan: 'general', ep: 'hb-b' }, bob);
    await P('/api/call/alive', { chan: 'general', ep: 'hb-b' }, bob);
    s.tick(Date.now() + 50000); t.eq(st('general').participants, [ana.id], 'bob\'s silent device was dropped; the API-only device stays');
    await endAll();
  });
  for (const e of Object.values(live)) e.close();
});
