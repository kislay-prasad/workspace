'use strict';
// chatux area API tests (docs/features-chatux.md): group history, system lines, new chats, pictures, hidden chats, unread marks,
// follows / new replies, pins, My GIFs, message fields, file-content search, find in chat, prefs.
const H = require('./harness');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngUrl = 'data:image/png;base64,' + Buffer.concat([PNG, Buffer.alloc(40)]).toString('base64');

H.suite('chatux: chat experience', async (t) => {
  const s = await t.server();
  const { call } = s, own = s.owner;
  const bob = await s.user('Bob'), cara = await s.user('Cara'), dave = await s.user('Dave');
  const send = async (who, chan, text, extra = {}) => { const r = await call('POST', '/api/send', { chan, text, ...extra }, who.token); t.eq(r.s, 200, r.d); return r.d.id; };
  const msgs = async (who, chan) => (await call('GET', '/api/messages?chan=' + encodeURIComponent(chan), undefined, who.token)).d.messages || [];
  const init = async (who) => { const e = s.sse(who.token); const d = await e.waitFor('init'); e.close(); return d; };
  let gid;

  await t.section('new chat: 0 people = notes to self, 1 = their 1:1 chat, 2+ = a group named after its members', async () => {
    t.eq((await call('POST', '/api/chatux/chat/new', { members: [] }, bob.token)).d.chan, s.dm(bob, bob));
    t.eq((await call('POST', '/api/chatux/chat/new', { members: [cara.id] }, bob.token)).d.chan, s.dm(bob, cara));
    const ev = s.sse(cara.token); await ev.waitFor('init');
    const r = await call('POST', '/api/chatux/chat/new', { members: [cara.id, own.id] }, bob.token); t.eq(r.s, 200, r.d);
    gid = r.d.chan; const c = r.d.channel; t.eq(c.kind, 'group'); t.ok(c.autoName, c); t.ok(/Bob, Cara, Host|Bob, Host, Cara/.test(c.name) || c.name.includes('Bob'), c.name);
    const a = await ev.waitFor('activity', (x) => x.type === 'added' && x.chan === gid); t.eq(a.from, bob.id); ev.close();
    t.eq((await call('POST', '/api/chatux/chat/new', { members: ['nope', cara.id] }, bob.token)).s, 400);
    await call('POST', '/api/admin/settings', { membersCanCreateGroups: false }, own.token);
    t.eq((await call('POST', '/api/chatux/chat/new', { members: [cara.id, dave.id] }, bob.token)).s, 403);
    await call('POST', '/api/admin/settings', { membersCanCreateGroups: true }, own.token);
  });

  await t.section('any member can rename a group chat (system line), other changes still need the creator or an admin', async () => {
    const r = await call('POST', '/api/channel/update', { id: gid, name: 'Weekend plans' }, cara.token); t.eq(r.s, 200, r.d); t.eq(r.d.name, 'Weekend plans'); t.ok(!r.d.autoName);
    const sysm = (await msgs(bob, gid)).find((m) => m.kind === 'rename'); t.ok(sysm && /Cara renamed the chat to Weekend plans/.test(sysm.system), sysm);
    t.eq((await call('POST', '/api/channel/update', { id: gid, topic: 'x' }, cara.token)).s, 403);
    t.eq((await call('POST', '/api/channel/update', { id: gid, name: 'Hack' }, dave.token)).s, 404, 'non-members cannot');
    const tp = await call('POST', '/api/channel/update', { id: gid, topic: 'Saturday' }, bob.token); t.eq(tp.s, 200, tp.d);
    t.ok((await msgs(bob, gid)).some((m) => m.kind === 'topic' && /changed the topic/.test(m.system)));
  });

  let oldId, oldFile;
  await t.section('adding people without history: no old messages, search, files, threads or live updates of old messages', async () => {
    const up = await s.upload(bob.token, 'secret.txt', Buffer.from('the treasure is under the oak')); t.eq(up.s, 200, up.d); oldFile = up.d.id;
    oldId = await send(bob, gid, 'old secret plan', { files: [{ id: oldFile }] });
    const reply = await send(cara, gid, 'old reply', { thread: oldId });
    const dEv = s.sse(dave.token); await dEv.waitFor('init');
    const r = await call('POST', '/api/channel/members', { id: gid, add: [dave.id], history: 'none' }, bob.token); t.eq(r.s, 200, r.d);
    await dEv.waitFor('activity', (a) => a.type === 'added' && a.chan === gid);
    const add = (await msgs(bob, gid)).find((m) => m.kind === 'add'); t.ok(add && add.target === dave.id && add.actor === bob.id, add);
    const newId = await send(bob, gid, 'welcome dave');
    const seen = await msgs(dave, gid); t.ok(!seen.some((m) => m.id === oldId || m.id === reply), 'old hidden'); t.ok(seen.some((m) => m.id === newId), 'new visible');
    t.eq((await call('POST', '/api/messages/byids', { ids: [oldId, reply] }, dave.token)).d.messages.length, 0);
    t.eq((await call('GET', '/api/thread?id=' + oldId, undefined, dave.token)).s, 404);
    t.eq((await call('GET', '/api/search?q=secret', undefined, dave.token)).d.results.length, 0);
    t.eq((await call('GET', '/api/files?chan=' + gid, undefined, dave.token)).d.files.length, 0);
    t.eq((await fetch(`${s.B}/files/${oldFile}/secret.txt?token=${dave.token}`)).status, 404, 'old file cannot be downloaded');
    t.eq((await fetch(`${s.B}/files/${oldFile}/secret.txt?token=${cara.token}`)).status, 200, 'members with history can');
    t.eq((await call('POST', '/api/react', { id: oldId, emoji: '👍' }, dave.token)).s, 404, 'cannot react to hidden messages');
    t.eq((await call('POST', '/api/send', { chan: gid, text: 'x', thread: oldId }, dave.token)).s, 400, 'cannot reply in hidden threads');
    await call('POST', '/api/react', { id: oldId, emoji: '🎉' }, cara.token); await s.wait(200);
    t.ok(!dEv.has('update', (m) => m.id === oldId), 'no live update of an old message'); t.ok(dEv.has('message', (m) => m.id === newId));
    dEv.close();
    const ini = await init(dave); t.ok(!ini.last[gid] || ini.last[gid].id !== oldId, 'chat list preview does not leak');
    t.eq((await call('GET', `/api/chatux/find?chan=${gid}&q=secret`, undefined, dave.token)).d.hits.length, 0);
  });

  await t.section('history from the past N days, and re-adding with all history', async () => {
    const m = s.ctx.msgById.get(oldId), back = s.ctx.chanMsgs(gid).filter((x) => x.seq <= m.seq + 1), realTs = back.map((x) => x.ts);
    for (const x of back) x.ts = Date.now() - 10 * 86400000; // everything up to the old message (and its reply) was 10 days ago
    const recent = await send(bob, gid, 'yesterday-ish');
    await call('POST', '/api/channel/members', { id: gid, remove: [dave.id] }, bob.token);
    t.eq((await call('POST', '/api/channel/members', { id: gid, add: [dave.id], history: 3 }, bob.token)).s, 200);
    let seen = await msgs(dave, gid); t.ok(!seen.some((x) => x.id === oldId) && seen.some((x) => x.id === recent), 'only the past 3 days');
    t.ok((await msgs(bob, gid)).some((x) => x.kind === 'add' && /past 3 days/.test(x.system)));
    await call('POST', '/api/channel/members', { id: gid, remove: [dave.id] }, bob.token);
    t.eq((await call('POST', '/api/channel/members', { id: gid, add: [dave.id], history: 'all' }, bob.token)).s, 200);
    seen = await msgs(dave, gid); t.ok(seen.some((x) => x.id === oldId), 'all history');
    back.forEach((x, i) => { x.ts = realTs[i]; });
  });

  await t.section('group chat picture: members set it, only members can see it, junk is refused', async () => {
    t.eq((await call('POST', '/api/chatux/chat/picture', { chan: gid, data: 'data:image/png;base64,AAAA' }, cara.token)).s, 400);
    t.eq((await call('POST', '/api/chatux/chat/picture', { chan: gid, data: 'data:image/png;base64,' + Buffer.alloc(80, 7).toString('base64') }, cara.token)).s, 400, 'not really a PNG');
    const r = await call('POST', '/api/chatux/chat/picture', { chan: gid, data: pngUrl }, cara.token); t.eq(r.s, 200, r.d); t.ok(r.d.channel.chatPic > 0, r.d);
    const img = await fetch(`${s.B}/api/chatux/chat/picture?chan=${gid}&token=${bob.token}`); t.eq(img.status, 200); t.eq(img.headers.get('content-type'), 'image/png');
    t.eq((await fetch(`${s.B}/api/chatux/chat/picture?chan=${gid}&token=${own.token}`)).status, 200);
    const outsider = await s.user('Eve'); t.eq((await fetch(`${s.B}/api/chatux/chat/picture?chan=${gid}&token=${outsider.token}`)).status, 404);
    t.eq((await call('POST', '/api/chatux/chat/picture', { chan: 'general', data: pngUrl }, bob.token)).s, 400, 'channels have no group picture');
    t.ok((await msgs(bob, gid)).some((m) => m.kind === 'picture'));
  });

  await t.section('delete a 1:1 chat for me: hidden with its history until a new message arrives', async () => {
    const dm = s.dm(bob, cara); const first = await send(cara, dm, 'hi bob');
    t.eq((await call('POST', '/api/chatux/chat/hide', { chan: dm }, bob.token)).s, 200);
    let ini = await init(bob); t.ok(ini.cx.hidden[dm], 'hidden'); t.ok(!ini.last[dm], 'no preview');
    t.eq((await msgs(bob, dm)).length, 0, 'history gone for me'); t.eq((await msgs(cara, dm)).length, 1, 'still there for Cara');
    t.eq((await call('POST', '/api/chatux/chat/hide', { chan: gid }, bob.token)).s, 400, 'groups are left, not hidden');
    const next = await send(cara, dm, 'are you there?');
    ini = await init(bob); t.ok(!ini.cx.hidden[dm], 'back in the list'); t.eq(ini.last[dm].id, next);
    t.ok(!(await msgs(bob, dm)).some((m) => m.id === first));
  });

  await t.section('mark a chat unread (synced) and mark unread from a message', async () => {
    const ev = s.sse(bob.token); await ev.waitFor('init');
    t.eq((await call('POST', '/api/chatux/unread', { chan: 'general' }, bob.token)).s, 200);
    await ev.waitFor('cxunread', (e) => e.chan === 'general' && e.on);
    t.ok((await init(bob)).cx.unread.general, 'flag survives reconnects');
    await call('POST', '/api/read', { chan: 'general' }, bob.token); await ev.waitFor('cxunread', (e) => e.chan === 'general' && !e.on);
    t.ok(!(await init(bob)).cx.unread.general, 'reading clears it');
    const a = await send(cara, 'general', 'one'); await send(cara, 'general', 'two @Bob'); await call('POST', '/api/read', { chan: 'general' }, bob.token);
    const r = await call('POST', '/api/chatux/unread', { chan: 'general', msg: a }, bob.token); t.eq(r.s, 200, r.d); t.eq(r.d.unread, 2); t.eq(r.d.mentions, 1);
    await ev.waitFor('cxreadset', (e) => e.chan === 'general' && e.unread === 2); ev.close();
    t.eq((await init(bob)).unread.general, 2);
    t.eq((await call('POST', '/api/chatux/unread', { chan: gid }, dave.token)).s, 200);
    t.eq((await call('POST', '/api/chatux/unread', { chan: s.dm(bob, cara) }, dave.token)).s, 404, 'only your chats');
  });

  await t.section('threads: posters and mentioned people follow; turning notifications off sticks; new replies are counted', async () => {
    const root = await send(bob, 'general', 'who wants pizza?');
    await send(cara, 'general', 'me! @Dave too', { thread: root });
    for (const u of [bob, cara, dave]) t.ok(s.db.users[u.id].follows[root], u.name + ' follows');
    t.ok(!(s.db.users[own.id].follows || {})[root], 'others do not');
    t.eq((await call('POST', '/api/chatux/follow', { id: root, on: false }, dave.token)).s, 200);
    await send(bob, 'general', 'ok ordering', { thread: root });
    t.ok(!s.db.users[dave.id].follows[root] && s.db.users[dave.id].unfollows[root], 'stays unfollowed');
    let f = (await call('GET', '/api/chatux/followed', undefined, cara.token)).d.threads.find((x) => x.root.id === root);
    t.ok(f && f.count === 2 && f.fresh === 1, f);
    await call('POST', '/api/chatux/thread/seen', { id: root }, cara.token);
    f = (await call('GET', '/api/chatux/followed', undefined, cara.token)).d.threads.find((x) => x.root.id === root); t.eq(f.fresh, 0);
    t.eq((await call('POST', '/api/chatux/follow', { id: root, on: true }, own.token)).s, 200); t.ok(s.db.users[own.id].follows[root]);
    const ini = await init(cara); t.ok(ini.cx.follows.includes(root)); t.eq(ini.cx.threads[root].n, 2); t.eq(ini.cx.seen[root], 2);
    t.eq((await call('POST', '/api/chatux/follow', { id: 'nope' }, cara.token)).s, 404);
  });

  await t.section('pins come newest first and stay private', async () => {
    const a = await send(own, 'general', 'pin me first'), b = await send(own, 'general', 'pin me second');
    await call('POST', '/api/pin', { id: a }, own.token); await s.wait(5); await call('POST', '/api/pin', { id: b }, own.token);
    const p = (await call('GET', '/api/chatux/pins?chan=general', undefined, bob.token)).d.pins; t.eq(p.slice(0, 2).map((m) => m.id), [b, a]);
    t.eq((await call('GET', '/api/chatux/pins?chan=' + gid, undefined, (await s.user('Fay')).token)).s, 404);
  });

  await t.section('My GIFs: saving copies the picture, it survives the original message and clean-up, removing frees it', async () => {
    const up = await s.upload(cara.token, 'party.gif', PNG); const mid = await send(cara, 'general', '', { files: [{ id: up.d.id }] });
    const r = await call('POST', '/api/chatux/gifs/save', { file: up.d.id }, bob.token); t.eq(r.s, 200, r.d); const g = r.d.gif; t.ok(g.id !== up.d.id, 'a copy');
    t.eq((await call('POST', '/api/chatux/gifs/save', { file: up.d.id }, bob.token)).d.existed, true, 'no duplicates');
    t.eq((await call('GET', '/api/chatux/gifs', undefined, bob.token)).d.gifs.map((x) => x.id), [g.id]);
    const txt = await s.upload(cara.token, 'notes.txt', Buffer.from('hello')); await send(cara, 'general', '', { files: [{ id: txt.d.id }] });
    t.eq((await call('POST', '/api/chatux/gifs/save', { file: txt.d.id }, bob.token)).s, 400, 'pictures only');
    const priv = await s.upload(dave.token, 'mine.gif', PNG); t.eq((await call('POST', '/api/chatux/gifs/save', { file: priv.d.id }, bob.token)).s, 404, 'only pictures you can see');
    const sent = await call('POST', '/api/send', { chan: 'general', text: '', files: [{ id: g.id }], gif: true }, bob.token); t.eq(sent.s, 200, sent.d);
    t.eq(s.ctx.msgById.get(sent.d.id).gif, 1);
    await call('POST', '/api/delete', { id: mid }, cara.token); await call('POST', '/api/delete', { id: sent.d.id }, bob.token);
    s.db.files[g.id].ts = Date.now() - 3 * 86400000; await call('POST', '/api/admin/retention/run', {}, own.token);
    t.ok(s.db.files[g.id], 'kept by My GIFs'); t.eq((await fetch(`${s.B}/files/${g.id}/x.gif?token=${bob.token}`)).status, 200);
    t.eq((await call('POST', '/api/chatux/gifs/remove', { id: g.id }, bob.token)).s, 200); t.ok(!s.db.files[g.id], 'freed');
  });

  await t.section('message fields: subject, priority, announcement, location, sticker, praise (validated)', async () => {
    const id = await send(bob, 'general', 'body', { subject: '  Big   news ', priority: 'urgent' }); let m = s.ctx.msgById.get(id); t.eq(m.subject, 'Big news'); t.eq(m.priority, 'urgent');
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', priority: 'important' }, bob.token)).s, 400, 'priority alone is empty');
    t.eq((await call('POST', '/api/send', { chan: 'general', text: 'x', priority: 'mega' }, bob.token)).s, 200);
    const up = await s.upload(bob.token, 'banner.png', PNG);
    const an = await send(bob, 'general', 'details', { announce: { title: 'Party!', sub: 'Friday', color: 'purple', image: up.d.id }, files: [{ id: up.d.id }] }); m = s.ctx.msgById.get(an); t.eq(m.announce, { title: 'Party!', color: 'purple', sub: 'Friday', image: up.d.id });
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', announce: { title: '' } }, bob.token)).s, 400);
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', announce: { title: 'x', image: oldFile } }, bob.token)).s, 400, 'banner must be attached');
    const loc = await send(bob, 'general', '', { location: { lat: 51.5007292, lon: -0.1246254, acc: 12.4 } }); t.eq(s.ctx.msgById.get(loc).location, { lat: 51.500729, lon: -0.124625, acc: 12 });
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', location: { lat: 91, lon: 0 } }, bob.token)).s, 400);
    const st = await send(bob, 'general', '', { sticker: { p: 'cats', s: 'wave', c: 'Hello   there' } }); t.eq(s.ctx.msgById.get(st).sticker, { p: 'cats', s: 'wave', c: 'Hello there' });
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', sticker: { p: '../x', s: 'y' } }, bob.token)).s, 400);
    const pr = await send(bob, gid, '', { praise: { b: 'kind', to: [cara.id, 'ghost', own.id, (await s.user('Gil')).id], note: 'Thanks!' } }); t.eq(s.ctx.msgById.get(pr).praise, { b: 'kind', to: [cara.id, own.id], note: 'Thanks!' });
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', praise: { b: 'evil', to: [cara.id] } }, bob.token)).s, 400);
    s.ctx.S.messagingRules = { stickers: false, gifs: false, memes: false };
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', sticker: { p: 'cats', s: 'wave' } }, bob.token)).s, 403);
    t.eq((await call('POST', '/api/send', { chan: 'general', text: '', files: [{ id: up.d.id }], meme: true }, bob.token)).s, 403);
    delete s.db.settings.messagingRules;
    const ini = await init(cara); t.ok(ini.last.general, 'preview present');
  });

  await t.section('search inside text files: members find words in shared files, others do not', async () => {
    const tx = await s.upload(bob.token, 'minutes.md', Buffer.from('# Minutes\nWe agreed on the zebracorn budget.\n')); await send(bob, gid, 'notes attached', { files: [{ id: tx.d.id }] });
    const bin = await s.upload(bob.token, 'data.txt', Buffer.concat([Buffer.from('zebracorn'), Buffer.alloc(20)])); await send(bob, gid, '', { files: [{ id: bin.d.id }] });
    const r = await call('GET', '/api/chatux/search/files?q=zebracorn', undefined, cara.token); t.eq(r.s, 200, r.d);
    t.eq(r.d.files.map((f) => f.name), ['minutes.md']); t.ok(/zebracorn budget/.test(r.d.files[0].snippet), r.d.files[0]); t.eq(r.d.files[0].match, 'content');
    t.eq((await call('GET', '/api/chatux/search/files?q=zebracorn', undefined, (await s.user('Hal')).token)).d.files.length, 0, 'outsiders');
    t.ok((await call('GET', '/api/chatux/search/files?q=minutes', undefined, cara.token)).d.files.some((f) => f.match === 'name'));
    t.ok((await call('GET', '/api/chatux/search/files', undefined, cara.token)).d.files.length >= 2, 'no query = recent files');
  });

  await t.section('find in this chat returns every match, newest first', async () => {
    const a = await send(bob, gid, 'needle one'), b = await send(cara, gid, 'Needle two');
    const r = await call('GET', `/api/chatux/find?chan=${gid}&q=needle`, undefined, bob.token); t.eq(r.d.hits.slice(0, 2).map((h) => h.id), [b, a]);
    t.eq((await call('GET', `/api/chatux/find?chan=${gid}&q=needle`, undefined, (await s.user('Ivy')).token)).s, 404);
  });

  await t.section('prefs: sections, skin tone, send key, quick replies, recent searches (validated); core prefs still work', async () => {
    const r = await call('POST', '/api/prefs', { chatSections: [{ id: 'abcd', name: ' Friends ', chats: ['general', gid, 'general', 'nope'] }, { name: '', chats: [s.dm(cara, dave)] }], skinTone: 9, sendKey: 'ctrl', hidePreviews: 1, emojiShortcuts: false, cannedReplies: ['On my way', '', 'x'.repeat(2000)], recentSearches: ['a', 'a', 'b'], readReceipts: false, evil: 1 }, bob.token);
    t.eq(r.s, 200, r.d); const p = r.d.prefs;
    t.eq(p.chatSections[0], { id: 'abcd', name: 'Friends', chats: ['general', gid] }); t.eq(p.chatSections[1].chats, [], 'chats you cannot see are dropped'); t.eq(p.chatSections[1].name, 'Section');
    t.eq(p.skinTone, 0); t.eq(p.sendKey, 'ctrl'); t.eq(p.hidePreviews, true); t.eq(p.emojiShortcuts, false); t.eq(p.cannedReplies.length, 2); t.eq(p.cannedReplies[1].length, 1000);
    t.eq(p.recentSearches, ['a', 'b']); t.eq(p.readReceipts, false); t.ok(!('evil' in p));
    t.eq((await call('POST', '/api/prefs', { chatSections: 'x' }, bob.token)).s, 400);
  });
});
