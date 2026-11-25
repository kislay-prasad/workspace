'use strict';
// Sanity checks for the extension points every feature area relies on (docs/EXTENDING.md).
const H = require('./harness');
H.suite('Core extension points', async (t) => {
  const s = await t.server();
  const bob = await s.user('Bob');
  await t.section('notes to self: dm with yourself works', async () => {
    const chan = s.dm(bob, bob); const r = await s.call('POST', '/api/send', { chan, text: 'remember milk' }, bob.token);
    t.eq(r.s, 200, r.d); const h = await s.call('GET', `/api/messages?chan=${encodeURIComponent(chan)}`, undefined, bob.token); t.ok(h.d.messages.some((m) => m.text === 'remember milk'), h.d);
  });
  await t.section('hooks: beforeMessage can add fields, afterMessage sees the message', async () => {
    let seen = null; s.ctx.hooks.beforeMessage.push((m, p) => { if (p.extraField) m.extraField = String(p.extraField).slice(0, 20); });
    s.ctx.hooks.afterMessage.push((m) => { seen = m; });
    const r = await s.call('POST', '/api/send', { chan: 'general', text: 'x', extraField: 'yes' }, bob.token); t.eq(r.s, 200, r.d);
    t.eq(seen && seen.extraField, 'yes');
  });
  await t.section('activity feed: item arrives live and can be marked read', async () => {
    const ev = s.sse(bob.token); await s.wait(150);
    s.ctx.activity(bob.id, { type: 'mention', from: s.owner.id, chan: 'general', text: 'hello' });
    const a = await ev.waitFor('activity', (d) => d.type === 'mention'); ev.close();
    const l = await s.call('GET', '/api/activity', undefined, bob.token); t.ok(l.d.items.some((i) => i.id === a.id && !i.read), l.d);
    const r = await s.call('POST', '/api/activity/read', { ids: [a.id] }, bob.token); t.eq(r.s, 200, r.d);
    const l2 = await s.call('GET', '/api/activity?unread=1', undefined, bob.token); t.ok(!l2.d.items.some((i) => i.id === a.id), l2.d);
  });
  await t.section('activity: your own actions never show in your feed', async () => {
    t.eq(s.ctx.activity(bob.id, { type: 'reaction', from: bob.id }), null);
  });
  await t.section('init carries appVersion and initExtra hooks', async () => {
    s.ctx.hooks.initExtra.push((u) => ({ helloArea: u.name }));
    const ev = s.sse(bob.token); const init = await ev.waitFor('init'); ev.close();
    t.ok(init.appVersion, 'appVersion'); t.eq(init.helloArea, 'Bob');
  });
  await t.section('userFields hook adds public fields to people', async () => {
    s.ctx.hooks.userFields.push((u) => ({ pronouns: u.name === 'Bob' ? 'they/them' : '' }));
    const ev = s.sse(s.owner.token); const init = await ev.waitFor('init'); ev.close();
    const b = (init.users || []).find((u) => u.id === bob.id); t.eq(b && b.pronouns, 'they/them');
  });
});
