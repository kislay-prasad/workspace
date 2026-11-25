'use strict';
// Browser flows of the people area: status panel (states, duration, status message, work location, out of office), the strip
// above the message box, contact card (click and hover), People pane (search, profile page, org chart, contact groups), profile
// settings, blocking, the Activity pane (live items, filters, read / unread), notification rules (per chat, Do not disturb with
// priority access, urgent repeats), quick reply, phone layout. Port range 4200-4299 (docs/EXTENDING.md).
const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = TMP + '/lc-ui-people'; fs.rmSync(dir, { recursive: true, force: true });
  const app = createApp({ dataDir: dir, name: 'People test', publicDir: ROOT + '/public', https: false }); const port = await app.start(4230); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  c.hooks.beforeMessage.push((m, b) => { if (b.priority === 'urgent' || b.priority === 'important') m.priority = b.priority; }); // chatux sets this in the real app
  const mk = (n) => { const u = c.makeUser(n); return { id: u.id, tok: c.newToken(u) }; };
  const host = mk('Host'); c.makeOwner(c.db.users[host.id]); const bob = mk('Bob'), cy = mk('Cy');
  const post = (tok, p, b) => fetch(B + p, { method: 'POST', headers: { 'x-token': tok }, body: JSON.stringify(b) }).then((r) => r.json());
  const dmHB = 'dm:' + [host.id, bob.id].sort().join(':');
  const br = await chromium.launch(); const errs = []; let failed = 0, passed = 0;
  const open = async (tok, label, opts = {}) => { const ctx = await br.newContext({ viewport: { width: 1280, height: 820 }, ...opts }); await ctx.addInitScript((t) => { try { localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok); const p = await ctx.newPage(); p.setDefaultTimeout(6000); p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 160)); }); await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p; };
  const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 4).join(' | ')); } };
  const H = await open(host.tok, 'host'), P = await open(bob.tok, 'bob');
  const presOf = (page, id) => page.evaluate((i) => LC.S.users.get(i).presence, id);
  const send = async (p, text) => { await p.fill('#composerHost textarea', text); await p.press('#composerHost textarea', 'Enter'); };

  console.log('People area (browser)');
  await step('status panel: pick Busy, everyone sees it; Reset status', async () => {
    await H.click('#meBox .meb'); await H.waitForSelector('.pp-me .pp-cur'); await H.click('.pp-me .pp-cur'); await H.click('.pp-me .pp-row:has-text("Busy")');
    await P.waitForFunction((i) => LC.S.users.get(i).presence === 'busy', host.id); if (c.db.users[host.id].presence !== 'busy') throw new Error('server');
    await H.click('#meBox .meb'); await H.click('.pp-me .pp-cur'); await H.click('.pp-me .pp-row:has-text("Reset status")'); await P.waitForFunction((i) => LC.S.users.get(i).presence === 'online', host.id);
  });
  await step('status duration: Do not disturb for 1 hour resets by itself', async () => {
    await H.click('#meBox .meb'); await H.click('.pp-me .pp-cur'); await H.click('.pp-me .pp-row:has-text("Duration")'); await H.selectOption('.modal select[aria-label="Status"]', 'dnd'); await H.selectOption('.modal select[aria-label="Reset status after"]', '1h'); await H.click('.modal .primary');
    await P.waitForFunction((i) => LC.S.users.get(i).presence === 'dnd', host.id); const u = c.db.users[host.id]; if (!(u.presenceUntil > Date.now() + 3000000)) throw new Error('until ' + u.presenceUntil);
    await H.click('#meBox .meb'); await H.waitForSelector('.pp-me .pp-cur:has-text("until")'); await H.keyboard.press('Escape'); await post(host.tok, '/api/presence', { state: 'auto' });
  });
  await step('status message with "show when people message me" appears above the box for the other person', async () => {
    await H.click('#meBox .meb'); await H.click('.pp-me .pp-row:has-text("Set status message")'); await H.fill('.modal textarea', 'Back at 3, ping me later'); await H.check('.modal label:has-text("Show when people message me") input');
    await H.selectOption('.modal select[aria-label="Clear status message after"]', '4h'); await H.click('.modal .primary:has-text("Done")');
    await P.waitForFunction((i) => LC.S.users.get(i).statusText === 'Back at 3, ping me later', host.id); if (!(c.db.users[host.id].statusUntil > Date.now())) throw new Error('clear after not set');
    await P.click(`.item[data-chan="${dmHB}"] .itemmain`); await P.waitForSelector('.pp-cbanner:has-text("Back at 3, ping me later")');
  });
  await step('work location: Remote shows on the contact card', async () => {
    await H.click('#meBox .meb'); await H.click('.pp-me .pp-row:has-text("Work location")'); await H.click('.pp-me .pp-sub .pp-row:has-text("Remote")');
    await P.waitForFunction((i) => (LC.S.users.get(i).workLoc || {}).kind === 'remote', host.id);
  });
  await step('contact card: click a picture in a message; Chat button opens the 1:1 chat', async () => {
    await post(host.tok, '/api/send', { chan: 'general', text: 'card test message' }); await P.click('.item[data-chan="general"] .itemmain'); await P.waitForSelector('.msg:has-text("card test message")');
    await P.click('.msg:has-text("card test message") .avbtn'); await P.waitForSelector('.pp-card:has-text("Remote")'); await P.waitForSelector('.pp-card:has-text("Back at 3, ping me later")');
    await P.click('.pp-card .pp-cacts .primary'); await P.waitForFunction((ch) => LC.S.chan === ch, dmHB); if (await P.$('.pp-card')) throw new Error('card still open');
  });
  await step('contact card: hovering a picture shows it; Escape closes it', async () => {
    await P.click('.item[data-chan="general"] .itemmain'); await P.hover('.msg:has-text("card test message") .avbtn'); await P.waitForSelector('.pp-card', { timeout: 4000 }); await P.mouse.move(700, 700); await P.waitForSelector('.pp-card', { state: 'detached', timeout: 4000 });
    await P.click('.msg:has-text("card test message") .who').catch(() => {}); await P.click('.msg:has-text("card test message") .avbtn'); await P.waitForSelector('.pp-card'); await P.keyboard.press('Escape'); await P.waitForSelector('.pp-card', { state: 'detached' });
  });
  await step('profile details in Settings reach the card; reports-to builds the org chart', async () => {
    await P.click('#gearBtn'); await P.click('.popmenu button:has-text("Settings")'); await P.waitForSelector('.pp-settings input[aria-label="Job title"]');
    await P.fill('.pp-settings input[aria-label="Job title"]', 'Designer'); await P.fill('.pp-settings input[aria-label="Department"]', 'Product'); await P.selectOption('.pp-settings select[aria-label="Reports to"]', host.id);
    await P.click('.pp-settings .primary:has-text("Save details")'); await H.waitForFunction((i) => LC.S.users.get(i).jobTitle === 'Designer' && LC.S.users.get(i).manager, bob.id); await P.keyboard.press('Escape');
    await H.click('.rbtn[data-pane="people"]'); await H.waitForSelector('.pp-tile:has-text("Bob")'); await H.click('.pp-tile:has-text("Bob")'); await H.waitForSelector('.pp-page .pp-org .pp-onode.cur:has-text("Bob")'); await H.waitForSelector('.pp-page .pp-org .pp-onode:has-text("Host")');
  });
  await step('People pane: search by title, contact group from the person menu', async () => {
    await H.fill('#nav .pp-search input', 'designer'); await H.waitForFunction(() => document.querySelectorAll('#nav .pp-prow').length === 1);
    await H.fill('#nav .pp-search input', ''); await H.click('#nav .pp-prow:has-text("Cy") .pp-rowbtn[aria-haspopup="menu"]'); await H.click('.popmenu button:has-text("Add to contact group")'); await H.click('.popmenu button:has-text("New contact group")');
    await H.fill('.modal.top input', 'Lunch crew'); await H.press('.modal.top input', 'Enter'); await H.waitForSelector('#nav .sec:has-text("Lunch crew (1)")');
    const g = c.db.users[host.id].prefs.contactGroups; if (!g || g[0].name !== 'Lunch crew' || g[0].members[0] !== cy.id) throw new Error(JSON.stringify(g));
  });
  await step('Activity: an @mention arrives live, filters, opens the message and is read', async () => {
    await H.click('.rbtn[data-pane="activity"]'); await post(bob.tok, '/api/send', { chan: 'general', text: 'look here @Host' });
    await H.waitForSelector('.pp-act.unread:has-text("look here")'); await H.waitForSelector('.rbtn[data-pane="activity"] .rbadge');
    await H.click('.pp-chip[data-f="mention"]'); await H.waitForSelector('.pp-act:has-text("mentioned you")'); await H.click('.pp-chip[data-f="reaction"]').catch(() => {});
    await H.click('.pp-chip.more'); await H.click('.popmenu button:has-text("Reactions")'); await H.waitForSelector('#nav .empty'); await H.click('.pp-chip[data-f="all"]');
    await H.click('.pp-act:has-text("look here") .pp-amain'); await H.waitForSelector('.msg.flash:has-text("look here")'); await H.waitForSelector('.pp-act:has-text("look here"):not(.unread)');
    await H.click('.pp-act:has-text("look here") .pp-amore'); await H.click('.popmenu button:has-text("Mark as unread")'); await H.waitForSelector('.pp-act.unread:has-text("look here")');
    await H.click('#sideActions button[aria-label="Mark all as read"]'); await H.waitForFunction(() => !document.querySelector('.pp-act.unread'));
  });
  await step('keyboard focus stays on a feed item when the list redraws (someone changes status)', async () => {
    await H.focus('.pp-act:has-text("look here") .pp-amain'); const key = await H.evaluate(() => document.activeElement.dataset.key);
    await post(cy.tok, '/api/presence', { state: 'busy' }); await H.waitForFunction((i) => LC.S.users.get(i).presence === 'busy' || true, cy.id); await post(bob.tok, '/api/presence', { state: 'brb' }); await H.waitForFunction((i) => LC.S.users.get(i).presence === 'brb', bob.id); await sleep(150);
    const now = await H.evaluate(() => document.activeElement && document.activeElement.dataset.key); if (now !== key) throw new Error(`focus moved: ${key} -> ${now}`); await post(bob.tok, '/api/presence', { state: 'auto' });
  });
  await step('reactions and thread replies show in the feed', async () => {
    const id = (await post(host.tok, '/api/send', { chan: 'general', text: 'react here' })).id; await post(bob.tok, '/api/react', { id, emoji: '👍' }); await post(bob.tok, '/api/send', { chan: 'general', text: 'a reply in thread', thread: id });
    await H.waitForSelector('.pp-act:has-text("reacted to your message")'); await H.waitForSelector('.pp-act:has-text("a reply in thread")');
  });
  await step('notification rules: chat set to Off, Do not disturb with priority access, urgent', async () => {
    await H.click('.rbtn[data-pane="chat"]'); await H.hover('.item[data-chan="general"]'); await H.click('.item[data-chan="general"] .kebab'); await H.click('.popmenu button:has-text("Notifications")'); await H.click('.popmenu button:has-text("Off")');
    await H.waitForFunction(() => (LC.prefs().chatNotif || {}).general === 'off');
    const ok = (m) => H.evaluate((x) => LC.shouldAlert({ id: 'x' + Math.random(), seq: 1e9, ts: Date.now(), chan: x.chan, from: x.from, text: 'hi', priority: x.priority, mentions: x.mentions }), m);
    if (await ok({ chan: 'general', from: bob.id })) throw new Error('off chat alerted');
    await H.evaluate(() => LC.people.setChatNotif('general', 'all')); await H.waitForFunction(() => !(LC.prefs().chatNotif || {}).general);
    if (!(await ok({ chan: 'general', from: bob.id }))) throw new Error('normal message did not alert');
    await post(host.tok, '/api/presence', { state: 'dnd' }); await H.waitForFunction(() => LC.S.me.presence === 'dnd');
    if (await ok({ chan: dmHB, from: bob.id })) throw new Error('alerted in DND');
    if (!(await ok({ chan: dmHB, from: bob.id, priority: 'urgent' }))) throw new Error('urgent did not get through DND');
    await H.evaluate((i) => LC.people.togglePriority(i), bob.id); await H.waitForFunction((i) => (LC.prefs().priority || []).includes(i), bob.id);
    if (!(await ok({ chan: dmHB, from: bob.id }))) throw new Error('priority access did not get through DND');
    if (await ok({ chan: dmHB, from: cy.id })) throw new Error('others got through DND');
    await post(host.tok, '/api/presence', { state: 'auto' });
  });
  await step('urgent message alerts again until it is read', async () => {
    await H.click('.item[data-chan="general"] .itemmain'); await H.evaluate(() => { LC.people.urgentEvery = 400; window.__alerts = 0; const a = LC.playSound; LC.playSound = (k) => { if (k === 'ring') window.__alerts++; return a(k); }; });
    await post(bob.tok, '/api/send', { chan: dmHB, text: 'server is down!', priority: 'urgent' });
    await H.waitForFunction(() => window.__alerts >= 3, null, { timeout: 5000 });
    await H.click(`.item[data-chan="${dmHB}"] .itemmain`); await H.waitForFunction(() => LC.people.urgentPending().length === 0, null, { timeout: 5000 });
  });
  await step('blocking: no 1:1 messages, folded in group chats with Show, unblock', async () => {
    const g = await post(host.tok, '/api/channel', { name: 'Trio', members: [bob.id, cy.id] }); await post(bob.tok, '/api/send', { chan: g.id, text: 'group hello from bob' });
    await H.evaluate((i) => LC.people.savePrefs({ blocked: [i] }), bob.id); await P.waitForFunction((i) => LC.S.users.get(i).presence === 'offline', host.id);
    await P.click(`.item[data-chan="${dmHB}"] .itemmain`); await send(P, 'can you see this?'); await P.waitForSelector('.toast:has-text("You can\'t send messages to Host")');
    await H.click(`.item[data-chan="${g.id}"] .itemmain`); await H.waitForSelector('.msg.pp-folded'); await H.click('.msg.pp-folded .link'); await H.waitForSelector('.msg:has-text("group hello from bob")');
    await H.click(`.item[data-chan="${dmHB}"] .itemmain`); await H.waitForSelector('.pp-cbanner:has-text("You blocked Bob")'); await H.click('.pp-cbanner .link:has-text("Unblock")');
    await H.waitForFunction(() => !(LC.prefs().blocked || []).length); await P.waitForFunction((i) => LC.S.users.get(i).presence !== 'offline', host.id);
  });
  await step('out of office: banner for people who write, one automatic reply', async () => {
    await H.click('#meBox .meb'); await H.click('.pp-me .pp-row:has-text("Schedule out of office")'); await H.check('.modal label:has-text("Turn on out of office") input'); await H.fill('.modal textarea', 'Away until Monday');
    await H.click('.modal .primary:has-text("Save")'); await P.waitForFunction((i) => !!LC.S.users.get(i).oof, host.id);
    await P.click(`.item[data-chan="${dmHB}"] .itemmain`); await P.waitForSelector('.pp-cbanner:has-text("out of office")'); await send(P, 'are you around?');
    await P.waitForSelector('.msg:has-text("Away until Monday") .pp-autoreply'); await post(host.tok, '/api/people/oof', { on: false });
  });
  await step('quick reply box (what clicking a desktop notification opens) sends into the chat', async () => {
    const id = (await post(bob.tok, '/api/send', { chan: dmHB, text: 'quick question' })).id; await H.evaluate((x) => LC.people.quickReply(x.chan, x.id), { chan: dmHB, id });
    await H.waitForSelector('.modal:has-text("Reply to Bob") .pp-qrmsg:has-text("quick question")'); await H.fill('.modal textarea', 'quick answer'); await H.press('.modal textarea', 'Enter'); await P.waitForSelector('.msg:has-text("quick answer")');
  });
  if (process.env.AXE_JS) await step('accessibility (axe): status panel, card, People pane, profile, Activity, settings — light, dark, high contrast', async () => {
    const axe = fs.readFileSync(process.env.AXE_JS, 'utf8'), bad = [];
    // only this area's screens: the side list, the big area when it shows People, popovers and dialogs (other areas run their own audits)
    const audit = async (label) => { await H.evaluate(axe); const r = await H.evaluate(async () => (await axe.run({ include: [...['#sidebar', '.pp-pop', '.modal:not(.hidden)', '.pp-host', '.pp-cbanner'].filter((x) => document.querySelector(x)).map((x) => [x])] }, { resultTypes: ['violations'] })).violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); for (const v of r) bad.push(label + ' — ' + v); };
    await post(bob.tok, '/api/send', { chan: 'general', text: 'axe @Host', priority: 'important' });
    for (const theme of ['light', 'dark', 'hc']) {
      await H.evaluate((th) => LC.setUi({ theme: th }), theme); await H.click('.rbtn[data-pane="activity"]'); await H.waitForSelector('.pp-act'); await audit(theme + ' activity');
      await H.click('#meBox .meb'); await H.click('.pp-me .pp-cur'); await audit(theme + ' status panel'); await H.keyboard.press('Escape');
      await H.click('.pp-act:has-text("axe") .pp-amain'); await H.waitForSelector('.msg:has-text("axe @Host")'); await H.click('.msg:has-text("axe @Host") .avbtn'); await H.waitForSelector('.pp-card'); await audit(theme + ' contact card'); await H.keyboard.press('Escape');
      await H.click('.rbtn[data-pane="people"]'); await H.waitForSelector('.pp-tile, .pp-page'); await audit(theme + ' people pane');
      await H.click('#nav .pp-prow:has-text("Bob") .pp-pmain'); await H.waitForSelector('.pp-page'); await audit(theme + ' profile page'); await H.click('.rbtn[data-pane="chat"]');
    }
    await H.evaluate(() => LC.setUi({ theme: 'auto' }));
    for (const tab of ['profile', 'notifications', 'privacy']) { await H.evaluate((tb) => LC.settingsPanel(tb), tab); await H.waitForSelector('.modal .pp-settings'); await audit('settings ' + tab); await H.keyboard.press('Escape'); }
    await H.evaluate(() => LC.people.statusDialog()); await audit('status message dialog'); await H.keyboard.press('Escape');
    await H.evaluate(() => LC.people.oofDialog()); await audit('out of office dialog'); await H.keyboard.press('Escape');
    await H.evaluate(() => LC.people.durationDialog()); await audit('duration dialog'); await H.keyboard.press('Escape');
    if (bad.length) throw new Error(bad.join('\n'));
  });
  await step('phone: People and Activity panes work at 390 px', async () => {
    const M = await open(host.tok, 'phone', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }); await M.waitForSelector('#app.list-mode .rail');
    await M.tap('.rbtn[data-pane="activity"]'); await M.waitForSelector('#nav .pp-act'); await M.tap('.rbtn[data-pane="people"]'); await M.waitForSelector('.pp-tile:has-text("Bob")'); await M.tap('.pp-tile:has-text("Bob")'); await M.waitForSelector('.pp-page h2:has-text("Bob")');
    const over = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (over) throw new Error('horizontal scroll'); await M.context().close();
  });
  console.log('ERRORS:', errs.length ? errs : 'none'); if (errs.length) failed++;
  console.log(`People area (browser): ${passed}/${passed + failed - (errs.length ? 1 : 0)} passed${errs.length ? ', with page errors' : ''}`);
  await br.close(); app.stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
