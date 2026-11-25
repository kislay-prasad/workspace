'use strict';
// People area API: presence and status, automatic presence, out of office, profiles, name recordings, contact groups,
// blocking, priority access settings, and the activity feed (mentions, replies, reactions, filters, read state, privacy).
const H = require('./harness');
H.suite('People, presence and activity', async (t) => {
  const s = await t.server();
  const ana = await s.user('Ana'), bob = await s.user('Bob'), cy = await s.user('Cy');
  const P = (path, b, who) => s.call('POST', path, b, who.token);
  const G = (path, who) => s.call('GET', path, undefined, who.token);
  const pubOf = async (who, id) => { const ev = s.sse(who.token); const init = await ev.waitFor('init'); ev.close(); return init.users.find((u) => u.id === id); };
  const online = (who) => { const ev = s.sse(who.token); return ev; };
  const dmAB = s.dm(ana, bob);

  await t.section('presence: every manual state, bad states refused, self sees what was set', async () => {
    const live = online(ana); await live.waitFor('init');
    for (const st of ['online', 'busy', 'dnd', 'brb', 'away']) { const r = await P('/api/presence', { state: st }, ana); t.eq(r.s, 200, r.d); t.eq((await pubOf(bob, ana.id)).presence, st); }
    t.eq((await P('/api/presence', { state: 'sleeping' }, ana)).s, 400);
    await P('/api/presence', { state: 'invisible' }, ana); t.eq((await pubOf(bob, ana.id)).presence, 'offline');
    const self = await pubOf(ana, ana.id); t.eq(self.presenceSet, 'invisible'); t.eq(self.presence, 'invisible');
    t.eq((await pubOf(bob, ana.id)).presenceSet, undefined, 'others do not see the manual setting');
    await P('/api/presence', { state: 'auto' }, ana); t.eq((await pubOf(bob, ana.id)).presence, 'online'); live.close(); await s.wait(100);
  });
  await t.section('presence: a duration resets the status automatically', async () => {
    const live = online(ana); await live.waitFor('init');
    const r = await P('/api/presence', { state: 'busy', until: Date.now() + 60000 }, ana); t.eq(r.s, 200, r.d);
    t.ok(s.db.users[ana.id].presenceUntil > Date.now()); t.eq((await pubOf(bob, ana.id)).presence, 'busy');
    s.tick(Date.now() + 120000); t.eq(s.db.users[ana.id].presence, 'auto'); t.eq((await pubOf(bob, ana.id)).presence, 'online'); live.close(); await s.wait(100);
  });
  await t.section('automatic In a call / In a meeting / Presenting; manual Do not disturb and Busy win', async () => {
    const la = online(ana), lb = online(bob); await la.waitFor('init'); await lb.waitFor('init');
    t.eq((await P('/api/call/start', { chan: dmAB, mode: 'voice' }, ana)).s, 200);
    t.eq((await pubOf(cy, ana.id)).presence, 'call');
    await P('/api/call/join', { chan: dmAB }, bob); t.eq((await pubOf(cy, bob.id)).presence, 'call');
    await P('/api/call/share', { chan: dmAB, on: true }, ana); await s.wait(50); t.eq((await pubOf(cy, ana.id)).presence, 'presenting');
    await P('/api/call/share', { chan: dmAB, on: false }, ana); await s.wait(50); t.eq((await pubOf(cy, ana.id)).presence, 'call');
    s.ctx.calls.get(dmAB).meeting = 'm1'; s.tick(); t.eq((await pubOf(cy, ana.id)).presence, 'meeting');
    await P('/api/presence', { state: 'busy' }, ana); t.eq((await pubOf(cy, ana.id)).presence, 'busy', 'manual Busy wins over a meeting');
    await P('/api/presence', { state: 'dnd' }, ana); t.eq((await pubOf(cy, ana.id)).presence, 'dnd');
    await P('/api/presence', { state: 'auto' }, ana);
    await P('/api/call/leave', { chan: dmAB }, ana); await P('/api/call/leave', { chan: dmAB }, bob);
    t.eq((await pubOf(cy, ana.id)).presence, 'online'); t.eq((await pubOf(cy, bob.id)).presence, 'online');
    // a meeting on the calendar happening now
    const db = s.db; db.meetings = { mt1: { id: 'mt1', title: 'Standup', organizer: cy.id, invitees: [bob.id, ana.id], rsvp: { [ana.id]: 'no' }, start: Date.now() - 60000, end: Date.now() + 600000 } };
    s.tick(); t.eq((await pubOf(cy, bob.id)).presence, 'meeting'); t.eq((await pubOf(cy, ana.id)).presence, 'online', 'declined meetings do not count');
    db.meetings.mt1.start = Date.now() - 7 * 86400000 - 60000; db.meetings.mt1.end = db.meetings.mt1.start + 600000; s.tick(); t.eq((await pubOf(cy, bob.id)).presence, 'online', 'a past meeting does not count');
    db.meetings.mt1.repeat = { freq: 'weekly', interval: 1 }; s.tick(); t.eq((await pubOf(cy, bob.id)).presence, 'meeting', 'this week\'s occurrence of a weekly meeting counts');
    delete db.meetings; s.tick(); la.close(); lb.close(); await s.wait(100);
  });
  await t.section('status message: clear after, show when people message me', async () => {
    const r = await P('/api/people/status', { text: 'Heads down on the report', emoji: '📈', show: true, until: Date.now() + 3600000 }, ana); t.eq(r.s, 200, r.d);
    const p = await pubOf(bob, ana.id); t.eq(p.statusText, 'Heads down on the report'); t.eq(p.statusShow, true); t.ok(p.statusUntil > Date.now());
    s.tick(Date.now() + 7200000); const q = await pubOf(bob, ana.id); t.eq(q.statusText, ''); t.eq(q.statusEmoji, ''); t.eq(q.statusShow, undefined);
    await P('/api/people/status', { text: 'x'.repeat(400) }, ana); t.eq(s.db.users[ana.id].statusText.length, 280);
    await P('/api/people/status', { text: 'short', until: Date.now() + 99999 }, ana); await P('/api/profile', { statusText: 'from settings' }, ana);
    t.eq(s.db.users[ana.id].statusUntil, 0, 'a status typed in Settings never expires'); await P('/api/people/status', { text: '' }, ana);
  });
  await t.section('out of office: schedule, state for everyone (also offline), one automatic reply a day', async () => {
    t.eq((await P('/api/people/oof', { on: true, from: Date.now() + 5000, to: Date.now() - 1000 }, bob)).s, 400);
    const r = await P('/api/people/oof', { on: true, from: Date.now() - 1000, to: Date.now() + 86400000, message: 'Back on Monday', reply: true }, bob); t.eq(r.s, 200, r.d);
    let p = await pubOf(ana, bob.id); t.eq(p.presence, 'oof'); t.eq(p.oof.message, 'Back on Monday');
    const lb = online(bob); await lb.waitFor('init'); p = await pubOf(ana, bob.id); t.eq(p.presence, 'oof');
    await P('/api/presence', { state: 'dnd' }, bob); t.eq((await pubOf(ana, bob.id)).presence, 'dnd'); await P('/api/presence', { state: 'auto' }, bob); lb.close(); await s.wait(80);
    const before = s.db.users[bob.id].read[dmAB] || 0;
    t.eq((await P('/api/send', { chan: dmAB, text: 'are you there?' }, ana)).s, 200); await s.wait(60);
    t.eq((await P('/api/send', { chan: dmAB, text: 'hello?' }, ana)).s, 200); await s.wait(60);
    const msgs = (await G('/api/messages?chan=' + encodeURIComponent(dmAB), ana)).d.messages, auto = msgs.filter((m) => m.autoReply);
    t.eq(auto.length, 1, msgs.map((m) => m.text)); t.eq(auto[0].from, bob.id); t.eq(auto[0].text, 'Back on Monday');
    t.eq(s.db.users[bob.id].read[dmAB] || 0, before, 'the away person still has the messages unread');
    await P('/api/send', { chan: s.dm(cy, bob), text: 'yo' }, cy); await s.wait(60);
    t.eq((await G('/api/messages?chan=' + encodeURIComponent(s.dm(cy, bob)), cy)).d.messages.filter((m) => m.autoReply).length, 1, 'each person gets one');
    await P('/api/people/oof', { on: false }, bob); t.eq((await pubOf(ana, bob.id)).presence, 'offline'); t.eq((await pubOf(ana, bob.id)).oof, undefined);
  });
  await t.section('out of office starts on its own schedule (tick)', async () => {
    const la = online(ana); await la.waitFor('init');
    await P('/api/people/oof', { on: true, from: Date.now() + 2000, to: Date.now() + 86400000, message: 'Away' }, cy);
    t.eq((await pubOf(ana, cy.id)).presence, 'offline'); s.tick();
    await s.wait(2100); s.tick();
    await la.waitFor('user', (d) => d.id === cy.id && d.presence === 'oof'); // everyone is told when it starts
    await P('/api/people/oof', { on: false }, cy); la.close(); await s.wait(80);
  });
  await t.section('work location', async () => {
    t.eq((await P('/api/people/worklocation', { kind: 'office' }, ana)).s, 200); t.eq((await pubOf(bob, ana.id)).workLoc.kind, 'office');
    t.eq((await P('/api/people/worklocation', { kind: 'custom', text: '' }, ana)).s, 400);
    t.eq((await P('/api/people/worklocation', { kind: 'custom', text: 'Café on 5th' }, ana)).s, 200); t.eq((await pubOf(bob, ana.id)).workLoc.text, 'Café on 5th');
    t.eq((await P('/api/people/worklocation', { kind: 'moon' }, ana)).s, 400); await P('/api/people/worklocation', { kind: '' }, ana); t.eq((await pubOf(bob, ana.id)).workLoc, undefined);
  });
  await t.section('profile: details, validation, reports-to without loops, time zone', async () => {
    const r = await P('/api/people/profile', { jobTitle: 'Designer', department: 'Product', phone: '+1 (555) 010-2000', email: 'ana@example.lan', office: 'Building 2', pronouns: 'she/her', tz: 'Europe/Madrid' }, ana); t.eq(r.s, 200, r.d);
    const p = await pubOf(bob, ana.id); t.eq([p.jobTitle, p.department, p.phone, p.email, p.office, p.pronouns, p.tz], ['Designer', 'Product', '+1 (555) 010-2000', 'ana@example.lan', 'Building 2', 'she/her', 'Europe/Madrid']);
    t.eq((await P('/api/people/profile', { email: 'not an email' }, ana)).s, 400); t.eq((await P('/api/people/profile', { phone: 'call me maybe' }, ana)).s, 400);
    t.eq((await P('/api/people/profile', { tz: 'Mars/Olympus' }, ana)).s, 400); t.eq((await P('/api/people/profile', { jobTitle: '<b>' + 'x'.repeat(200) }, ana)).d.me.jobTitle.length, 80);
    t.eq((await P('/api/people/profile', { manager: ana.id }, ana)).s, 400, 'not yourself');
    t.eq((await P('/api/people/profile', { manager: bob.id }, ana)).s, 200); t.eq((await P('/api/people/profile', { manager: cy.id }, bob)).s, 200);
    const loop = await P('/api/people/profile', { manager: ana.id }, cy); t.eq(loop.s, 400, loop.d);
    t.eq((await P('/api/people/profile', { manager: 'nobody123' }, cy)).s, 400);
    t.eq((await pubOf(cy, ana.id)).manager, bob.id);
    await P('/api/people/profile', { jobTitle: 'Lead designer' }, ana); t.eq((await pubOf(cy, ana.id)).department, 'Product', 'fields left out stay');
  });
  await t.section('name recording: upload, others can play it, bad types refused, delete', async () => {
    const up = await fetch(s.B + '/api/people/voice', { method: 'POST', headers: { 'x-token': ana.token, 'content-type': 'audio/webm', 'x-forwarded-for': '10.1.1.1' }, body: Buffer.alloc(3000, 7) }); t.eq(up.status, 200);
    const p = await pubOf(bob, ana.id); t.ok(p.voice > 0);
    const get = await fetch(s.B + '/api/people/voice?id=' + ana.id + '&token=' + bob.token); t.eq(get.status, 200); t.eq(get.headers.get('content-type'), 'audio/webm'); t.eq((await get.arrayBuffer()).byteLength, 3000);
    const bad = await fetch(s.B + '/api/people/voice', { method: 'POST', headers: { 'x-token': ana.token, 'content-type': 'text/html' }, body: '<script>' }); t.eq(bad.status, 400);
    const big = await fetch(s.B + '/api/people/voice', { method: 'POST', headers: { 'x-token': ana.token, 'content-type': 'audio/webm' }, body: Buffer.alloc(500 * 1024) }); t.eq(big.status, 413);
    t.eq((await fetch(s.B + '/api/people/voice?id=' + ana.id)).status, 401, 'needs sign-in');
    await P('/api/people/voice/delete', {}, ana); t.eq((await fetch(s.B + '/api/people/voice?id=' + ana.id + '&token=' + bob.token)).status, 404);
  });
  await t.section('contact groups, priority access and chat settings are validated prefs', async () => {
    const r = await P('/api/people/prefs', { contactGroups: [{ id: 'fam', name: '  Family  ', members: [bob.id, 'ghost', bob.id] }, { name: '' }, { id: 'x"y', name: 'Work', members: [cy.id] }], priority: [bob.id, ana.id, 'ghost'], chatNotif: { general: 'off', nowhere: 'off', [dmAB]: 'loud' }, actTypes: { reaction: 'feed', mention: 'nope', __proto__: 'off' } }, ana);
    t.eq(r.s, 200, r.d); const pr = r.d.prefs;
    t.eq(pr.contactGroups.length, 2); t.eq(pr.contactGroups[0], { id: 'fam', name: 'Family', members: [bob.id] }); t.ok(/^[a-z0-9]+$/.test(pr.contactGroups[1].id));
    t.eq(pr.priority, [bob.id], 'not yourself, not strangers'); t.eq(pr.chatNotif, { general: 'off' }); t.eq(pr.actTypes, { reaction: 'feed' }); t.eq({}.polluted, undefined);
    const r2 = await P('/api/prefs', { contactGroups: [{ id: 'fam', name: 'Fam', members: [] }], readReceipts: true }, ana); t.eq(r2.d.prefs.contactGroups[0].name, 'Fam', 'LC.setPrefs works too');
    await P('/api/people/prefs', { chatNotif: {}, contactGroups: [] }, ana);
  });
  await t.section('blocking: no 1:1 messages or calls either way, presence hidden, group chats still work', async () => {
    const la = online(ana), lb = online(bob); await la.waitFor('init'); await lb.waitFor('init');
    await P('/api/people/status', { text: 'busy week' }, ana);
    t.eq((await P('/api/people/prefs', { blocked: [bob.id] }, ana)).s, 200);
    const seen = await pubOf(bob, ana.id); t.eq(seen.presence, 'offline'); t.eq(seen.statusText, '');
    t.eq((await pubOf(cy, ana.id)).presence, 'online', 'others still see her');
    const m1 = await P('/api/send', { chan: dmAB, text: 'hey' }, bob); t.eq(m1.s, 403, m1.d);
    const m2 = await P('/api/send', { chan: dmAB, text: 'hey' }, ana); t.eq(m2.s, 403); t.ok(/Unblock/.test(m2.d.error));
    t.eq((await P('/api/call/start', { chan: dmAB, mode: 'video' }, bob)).s, 403); t.eq(s.ctx.calls.has(dmAB), false);
    const old = (await G('/api/messages?chan=' + encodeURIComponent(dmAB), bob)).d.messages[0];
    t.eq((await P('/api/react', { id: old.id, emoji: '👍' }, bob)).s, 403);
    const g = await P('/api/channel', { name: 'Trio', members: [bob.id, cy.id] }, ana); t.eq(g.s, 200, g.d);
    t.eq((await P('/api/send', { chan: g.d.id, text: 'in the group' }, bob)).s, 200, 'group chats still work');
    await P('/api/people/prefs', { blocked: [] }, ana); t.eq((await pubOf(bob, ana.id)).presence, 'online');
    t.eq((await P('/api/send', { chan: dmAB, text: 'friends again' }, bob)).s, 200);
    await P('/api/people/status', { text: '' }, ana); la.close(); lb.close(); await s.wait(80);
  });

  // ----- activity -----
  const feed = async (who, q = '') => (await G('/api/activity' + q, who)).d;
  await t.section('activity: @mention and @everyone items, live, with the message text and chat name', async () => {
    const ev = s.sse(bob.token); await ev.waitFor('init');
    await P('/api/send', { chan: 'general', text: 'lunch @Bob?' }, ana);
    const a = await ev.waitFor('activity', (d) => d.type === 'mention'); ev.close();
    t.eq([a.from, a.chan, a.text, a.read], [ana.id, 'general', 'lunch @Bob?', false]);
    const f = await feed(bob); t.eq(f.items[0].where, '#general'); t.ok(f.unread >= 1);
    s.db.settings.membersCanEveryone = true; await P('/api/send', { chan: 'general', text: '@everyone party at 6' }, ana);
    const fc = await feed(cy); t.ok(fc.items.some((i) => i.type === 'mention' && i.everyone && /party/.test(i.text)), fc);
    t.ok(!(await feed(ana)).items.some((i) => /party/.test(i.text || '')), 'not for the sender');
  });
  await t.section('activity: thread replies reach the starter, people who replied and followers — not people who unfollowed', async () => {
    const root = (await P('/api/send', { chan: 'general', text: 'thread starter' }, ana)).d.id;
    await P('/api/send', { chan: 'general', text: 'first reply', thread: root }, bob);
    let f = await feed(ana, '?type=reply'); t.ok(f.items.some((i) => i.text === 'first reply' && i.from === bob.id && i.mine), f);
    s.db.users[cy.id].follows = { [root]: 1 }; await P('/api/send', { chan: 'general', text: 'second reply', thread: root }, ana);
    t.ok((await feed(bob, '?type=reply')).items.some((i) => i.text === 'second reply'), 'someone who replied');
    t.ok((await feed(cy, '?type=reply')).items.some((i) => i.text === 'second reply'), 'a follower');
    s.db.users[bob.id].unfollows = { [root]: 1 }; await P('/api/send', { chan: 'general', text: 'third reply', thread: root }, cy);
    t.ok(!(await feed(bob, '?type=reply')).items.some((i) => i.text === 'third reply'), 'unfollowed');
    t.ok((await feed(ana, '?type=reply')).items.some((i) => i.text === 'third reply'));
  });
  await t.section('activity: reactions to your messages; taking it back removes the unseen notice', async () => {
    const id = (await P('/api/send', { chan: 'general', text: 'react to me' }, ana)).d.id;
    const ev = s.sse(ana.token); await ev.waitFor('init');
    await P('/api/react', { id, emoji: '🎉' }, bob); const a = await ev.waitFor('activity', (d) => d.type === 'reaction');
    t.eq([a.emoji, a.from, a.msg], ['🎉', bob.id, id]);
    await P('/api/react', { id, emoji: '🎉' }, bob); const gone = await ev.waitFor('ppactdel'); t.eq(gone.ids, [a.id]);
    await P('/api/react', { id, emoji: '🎉' }, ana); ev.close();
    t.ok(!(await feed(ana, '?type=reaction')).items.some((i) => i.msg === id && i.from === ana.id), 'never your own');
  });
  await t.section('activity: read and unread, mark all, reading the chat reads its mentions', async () => {
    let f = await feed(bob); const one = f.items.find((i) => !i.read);
    await P('/api/activity/read', { ids: [one.id] }, bob); t.eq((await feed(bob)).items.find((i) => i.id === one.id).read, true);
    await P('/api/activity/read', { ids: [one.id], read: false }, bob); t.eq((await feed(bob)).items.find((i) => i.id === one.id).read, false);
    await P('/api/activity/read', { all: true }, bob); t.eq((await feed(bob)).unread, 0);
    await P('/api/send', { chan: 'general', text: 'hey @Bob look' }, ana); f = await feed(bob); t.eq(f.unread, 1);
    await P('/api/read', { chan: 'general' }, bob); t.eq((await feed(bob)).unread, 0);
  });
  await t.section('activity privacy: blocked people, chats you left, deleted messages, your settings', async () => {
    const g = (await P('/api/channel', { name: 'Secret', members: [bob.id, cy.id] }, ana)).d.id;
    await P('/api/send', { chan: g, text: 'secret plan @Cy' }, ana); t.ok((await feed(cy)).items.some((i) => i.text === 'secret plan @Cy'));
    await P('/api/channel/members', { id: g, remove: [cy.id] }, ana); t.ok(!(await feed(cy)).items.some((i) => i.chan === g), 'gone when you leave the chat');
    const mid = (await P('/api/send', { chan: 'general', text: 'oops @Cy wrong' }, bob)).d.id; await P('/api/delete', { id: mid }, bob);
    const del = (await feed(cy)).items.find((i) => i.msg === mid); t.eq([del.text, del.gone], ['', true]);
    await P('/api/people/prefs', { blocked: [bob.id] }, cy); await P('/api/send', { chan: 'general', text: 'still @Cy' }, bob);
    t.ok(!(await feed(cy)).items.some((i) => i.from === bob.id), 'nothing from blocked people'); await P('/api/people/prefs', { blocked: [] }, cy);
    await P('/api/people/prefs', { actTypes: { mention: 'off' } }, cy); t.ok(!(await feed(cy)).items.some((i) => i.type === 'mention'), 'type turned off');
    await P('/api/people/prefs', { actTypes: {}, chatNotif: { general: 'off' } }, cy); t.ok(!(await feed(cy)).items.some((i) => i.chan === 'general'), 'chat turned off');
    await P('/api/people/prefs', { chatNotif: { general: 'mentions' } }, cy); const left = (await feed(cy)).items.filter((i) => i.chan === 'general');
    t.ok(left.length && left.every((i) => i.type === 'mention'), 'mentions only'); await P('/api/people/prefs', { chatNotif: {} }, cy);
    const ev = s.sse(cy.token); const init = await ev.waitFor('init'); ev.close(); t.eq(typeof init.ppActUnread, 'number');
  });
  await t.section('activity: older @mentions are brought into a new feed once', async () => {
    const dan = await s.user('Dan'); const id = (await P('/api/send', { chan: 'general', text: 'welcome @Dan' }, ana)).d.id;
    s.db.activity[dan.id] = []; // as if the feed did not exist when the message was sent
    const f = await feed(dan); t.ok(f.items.some((i) => i.type === 'mention' && i.msg === id), f);
    const again = await feed(dan); t.eq(again.items.filter((i) => i.msg === id).length, 1);
  });
});
