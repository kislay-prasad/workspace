'use strict';
// Accessibility audit with axe-core (npm i -g axe-core, or set AXE_JS to axe.min.js).
// Needs Playwright available to Node (e.g. `npm i -g playwright` and NODE_PATH=$(npm root -g)).
const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
const axeSrc = fs.readFileSync(process.env.AXE_JS || require.resolve('axe-core/axe.min.js'), 'utf8');
(async () => {
  fs.rmSync(TMP + '/lc-a11y', { recursive: true, force: true });
  const app = createApp({ dataDir: TMP + '/lc-a11y', name: 'A11y', publicDir: ROOT + '/public' }); const port = await app.start(3831); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'); const ht = c.newToken(host); const post = (tok, p, b) => fetch(B + p, { method: 'POST', headers: { 'x-token': tok }, body: JSON.stringify(b) }).then((r) => r.json());
  await post(ht, '/api/send', { chan: 'general', text: 'Hello **team** — check @Bob and https://example.com' }); await post(ht, '/api/send', { chan: 'general', poll: { q: 'Lunch?', options: ['Pizza', 'Sushi'] } }); await post(ht, '/api/channel', { name: 'Study crew', members: [bob.id] });
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1200, height: 800 } }); const p = await ctx.newPage(); p.setDefaultTimeout(5000);
  const audit = async (label) => { await p.evaluate(axeSrc); const r = await p.evaluate(async () => { const res = await axe.run(document, { resultTypes: ['violations'] }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((x) => x.target.join(' ') + ' :: ' + (x.failureSummary || '').split('\n')[1]) })); }); console.log(`\n== ${label}: ${r.length} rule(s) violated`); for (const v of r) console.log(`  [${v.impact}] ${v.id} (${v.n}) ${v.help}\n      ${v.sample.join('\n      ')}`); return r; };
  await p.goto(B); await p.waitForSelector('#login:not(.hidden)'); await audit('login (light)');
  await p.evaluate((t) => { localStorage.setItem('lc_token', JSON.stringify(t)); }, ht); await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); await p.waitForSelector('.msg'); await audit('chat (light)');
  await p.evaluate(() => LC.setUi({ theme: 'dark' })); await audit('chat (dark)');
  await p.evaluate(() => LC.setUi({ theme: 'hc' })); await audit('chat (high contrast)');
  await p.evaluate(() => LC.setUi({ theme: 'auto' })); await p.click('#gearBtn'); await p.click('.popmenu button:has-text("Settings")'); await p.click('.tabbtn:has-text("Appearance")'); await audit('settings modal');
  await p.keyboard.press('Escape'); await p.click('.adminbtn'); await p.click('.tabbtn:has-text("People")'); await p.waitForSelector('.table'); await audit('admin people'); await p.keyboard.press('Escape');
  await p.click('.tab:has-text("Whiteboard")'); await audit('whiteboard tab'); await p.click('.tab:has-text("Calendar")'); await audit('calendar tab');
  await br.close(); app.stop(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
