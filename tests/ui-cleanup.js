const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
(async () => {
  fs.rmSync(TMP + '/lc-ui4', { recursive: true, force: true });
  const app = createApp({ dataDir: TMP + '/lc-ui4', name: 'Test', publicDir: ROOT + '/public' }); const port = await app.start(3841); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'); const ht = c.newToken(host), bt = c.newToken(bob); c.sysMsg('general', 'Welcome');
  const br = await chromium.launch(); const errs = [];
  const open = async (tok) => { const ctx = await br.newContext({ viewport: { width: 1200, height: 800 } }); await ctx.addInitScript((t) => { try { localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok); const p = await ctx.newPage(); p.on('response', (r) => r.status() === 400 && errs.push('400 ' + r.url() + ' ' + (r.request().postData() || ''))); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p; };
  const step = async (n, f) => { try { await f(); console.log('  ✓', n); } catch (e) { console.log('  ✗', n, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); } };
  const H = await open(ht), P = await open(bt);
  for (const w of ['a', 'b']) { await H.fill('#composerHost textarea', 'msg ' + w); await H.press('#composerHost textarea', 'Enter'); }
  await step('cleanup tab: preview + delete + fresh', async () => {
    await H.click('#gearBtn'); await H.click('.popmenu button:has-text("Manage")'); await H.click('[role=tab]:has-text("Clean-up")');
    await H.selectOption('select[aria-label="Delete messages older than"]', '0'); await H.click('button:has-text("Preview")'); await H.waitForSelector('text=Would delete');
    await H.click('.modal .primary.danger:has-text("Delete")'); await H.click('[role=alertdialog] button.primary'); await H.waitForSelector('text=messages deleted');
    if (app.ctx.db.messages.some((m) => m.text === 'msg a')) throw new Error('not deleted');
  });
  await step('people tab: show removed + delete permanently', async () => {
    await H.click('#modal [role=tab]:has-text("People")'); await H.click('tr:has-text("Bob") button:has-text("Actions")'); await H.click('.popmenu button:has-text("Delete account permanently")');
    await H.click('button.danger:has-text("Delete account permanently")'); await H.waitForFunction(() => !document.body.innerText.includes('Bob'), null, { timeout: 4000 }).catch(() => {});
    if (!app.ctx.db.users[bob.id].deleted) throw new Error('not deleted server side');
  });
  await step('settings about: owner sees explanation', async () => { await H.keyboard.press('Escape'); await H.click('#gearBtn'); await H.click('.popmenu button:has-text("Settings")'); await H.click('[role=tab]:has-text("About")'); await H.waitForSelector('text=You\'re the host'); });
  await step('chat info: delete my messages', async () => { await H.keyboard.press('Escape'); await H.fill('#composerHost textarea', 'mine'); await H.press('#composerHost textarea', 'Enter'); await H.click('#headActions button[aria-label="Chat info"], #headActions button[title="Chat info"]'); await H.click('button:has-text("Delete my messages here")'); await H.click('[role=alertdialog] button.primary'); await H.waitForSelector('text=messages deleted'); if (app.ctx.db.messages.some((m) => m.text === 'mine')) throw new Error('mine not deleted'); });
  console.log('errors:', errs.filter((e) => !/401/.test(e)).slice(0, 5)); await br.close(); app.stop(); process.exit(0);
})();
