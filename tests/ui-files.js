'use strict';
// Files and Calendar browser flows (docs/features-files.md). Playwright with Chromium; servers use the files port range
// (4700–4799). Screenshots go to /tmp/files-shots/. With AXE_JS set, the new screens are audited with axe-core.
const ROOT = require('path').resolve(__dirname, '..'), os = require('os'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const { readZipIndex } = require(ROOT + '/lib/zip.js');
const SHOTS = '/tmp/files-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const axeSrc = process.env.AXE_JS ? fs.readFileSync(process.env.AXE_JS, 'utf8') : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/lc-files-ui-');
  const app = createApp({ dataDir: dir, name: 'Files UI', publicDir: ROOT + '/public' }); const port = await app.start(4710); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const ana = c.makeUser('Ana'); c.makeOwner(ana); const bob = c.makeUser('Bob'), eve = c.makeUser('Eve'); const at = c.newToken(ana), bt = c.newToken(bob), et = c.newToken(eve);
  const grp = 'g-files1'; c.db.channels[grp] = { id: grp, name: 'Project', topic: '', created: Date.now(), by: ana.id, members: [ana.id, bob.id], kind: 'group' }; c.sysMsg(grp, 'Ana created this group');
  const br = await chromium.launch(); const errs = []; let pass = 0, failN = 0, axeBad = 0;
  const open = async (tok, label, o = {}) => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...o });
    await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok);
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.ctx = ctx;
    p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/401|404|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p;
  };
  const A = await open(at, 'ana'), P = await open(bt, 'bob');
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failN++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); try { await A.screenshot({ path: `${SHOTS}/fail-${pass + failN}.png` }); } catch {} } };
  const audit = async (p, label) => {
    if (!axeSrc) return; await p.evaluate(axeSrc);
    const r = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join(' | ')}`));
    if (r.length) { axeBad += r.length; console.log(`    axe ${label}: ${r.length} violation(s)\n      ` + r.join('\n      ')); } else console.log(`    axe ${label}: 0 violations`);
  };
  const openChat = (p, chan) => p.evaluate((ch) => LC.openChat(ch), chan);
  const tab = async (p, key) => { await p.click(`.tab[data-tab="${key}"]`); };
  const prompt = async (p, value) => { await p.waitForSelector('.modal.top input'); await p.fill('.modal.top input', value); await p.press('.modal.top input', 'Enter'); };
  const confirm = async (p) => { await p.waitForSelector('[role=alertdialog] button.primary'); await p.click('[role=alertdialog] button.primary'); };
  const fileRec = (name) => Object.values(c.db.files).find((f) => f.name === name && !f.verOf);
  const code = 'const greet = (name) => `Hi ${name}`; // say hi\nfunction add(a, b) { return a + b; }\nconsole.log(greet("Bob"), add(2, 3));\n';

  console.log('Files');
  await step('a code file in a message gets a file card; View opens the text viewer with colours and line numbers', async () => {
    await openChat(A, grp); await A.setInputFiles('#composerHost input[type=file]', { name: 'app.js', mimeType: 'text/javascript', buffer: Buffer.from(code) });
    await A.waitForSelector('.chip svg.ok'); await A.click('#composerHost .send');
    await openChat(P, grp); await P.waitForSelector('.file.fl-card:has-text("app.js")');
    await P.click('.file.fl-card:has-text("app.js") button:has-text("View")'); await P.waitForSelector('.modal .fl-code .fl-line');
    const n = await P.locator('.modal .fl-line').count(); if (n !== 3) throw new Error('lines: ' + n);
    if (!(await P.locator('.modal .fl-tk').count()) || !(await P.locator('.modal .fl-tc').count())) throw new Error('no syntax colours');
    await P.screenshot({ path: `${SHOTS}/ui-viewer.png` }); await audit(P, 'text viewer'); await P.keyboard.press('Escape');
  });
  await step('CSV opens as a table; a big log says "Download to see the rest"', async () => {
    const big = 'line\n'.repeat(70000); await A.evaluate(async ([csv, log]) => { const a = await LC.upload(new Blob([csv]), 'budget.csv').promise, b = await LC.upload(new Blob([log]), 'server.log').promise; await LC.api('/api/send', { chan: 'g-files1', text: 'numbers', files: [a, b] }); }, ['Item,Q1,Q2\nRent,1200,1250\n"Coffee, beans",80,95\n', big]);
    await P.waitForSelector('.file.fl-card:has-text("budget.csv")'); await P.click('.file.fl-card:has-text("budget.csv") button:has-text("View")');
    await P.waitForSelector('.modal .fl-csv table'); const cell = await P.locator('.modal .fl-csv tbody tr >> nth=1').locator('td >> nth=1').textContent(); if (cell !== 'Coffee, beans') throw new Error(cell); await P.keyboard.press('Escape');
    await P.click('.file.fl-card:has-text("server.log") button:has-text("View")'); await P.waitForSelector('.modal .fl-trunc:not(.hidden)'); await P.keyboard.press('Escape');
  });
  await step('Files tab: lists the chat’s files; a new folder shows up live for the other person', async () => {
    await tab(A, 'files'); await tab(P, 'files'); await A.waitForSelector('.fl-table tr.fl-item:has-text("app.js")');
    await A.click('.fl-bar button:has-text("New folder")'); await prompt(A, 'Designs');
    await P.waitForSelector('.fl-table tr.fl-folder:has-text("Designs")'); await A.screenshot({ path: `${SHOTS}/ui-files-tab.png` }); await audit(A, 'Files tab (light)');
    await A.evaluate(() => LC.setUi({ theme: 'dark' })); await audit(A, 'Files tab (dark)'); await A.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('upload into a folder, breadcrumb navigation, Move to dialog', async () => {
    await A.click('.fl-table tr.fl-folder:has-text("Designs") .fl-name'); await A.waitForSelector('.fl-crumbs .fl-crumb.cur:has-text("Designs")');
    await A.setInputFiles('.fl-files input[type=file]', { name: 'logo-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('blue logo') });
    await A.waitForSelector('.fl-table tr.fl-item:has-text("logo-notes.txt")'); const r = fileRec('logo-notes.txt'); if (!r || r.home !== grp) throw new Error('not in the Files tab');
    await A.click('.fl-crumbs button.fl-crumb:has-text("Files")'); await A.waitForSelector('.fl-table tr.fl-item:has-text("budget.csv")');
    await A.click('.fl-table tr.fl-item:has-text("budget.csv") input[type=checkbox]'); await A.click('.fl-bar button:has-text("Move to")');
    await A.click('.modal .fl-treerow:has-text("Designs")'); await A.click('.modal button:has-text("Move here")');
    await P.waitForSelector('.fl-table tr.fl-folder:has-text("Designs") .fl-c-size:has-text("2 items")');
  });
  await step('rename a file: the chat message shows the new name', async () => {
    await A.click('.fl-table tr.fl-item:has-text("app.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Rename")'); await prompt(A, 'greeter.js');
    await tab(P, 'chat'); await P.waitForSelector('.file.fl-card:has-text("greeter.js")'); await tab(P, 'files');
  });
  await step('new version from the file menu: same message, "Version 2", history lists version 1', async () => {
    await A.waitForSelector('.fl-table tr.fl-item:has-text("greeter.js")');
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]');
    const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('.popmenu button:has-text("Upload new version")')]);
    await fc.setFiles({ name: 'greeter.js', mimeType: 'text/javascript', buffer: Buffer.from('const v = 2;\n') });
    await A.waitForSelector('.toast:has-text("version 2")'); await tab(P, 'chat'); await P.waitForSelector('.file.fl-card:has-text("greeter.js"):has-text("Version 2")');
    await P.click('.file.fl-card:has-text("greeter.js") button[aria-haspopup="menu"]'); await P.click('.popmenu button:has-text("Version history")');
    await P.waitForSelector('.modal .fl-vrow:has-text("Version 1")'); await audit(P, 'version history'); await P.keyboard.press('Escape'); await tab(P, 'files');
  });
  await step('Download all builds a zip on the server with the folder structure', async () => {
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click('.fl-bar button:has-text("Download all")')]);
    const f = path.join(dir, 'all.zip'); await dl.saveAs(f); const names = readZipIndex(f).map((e) => e.name).sort();
    for (const n of ['Designs/budget.csv', 'Designs/logo-notes.txt', 'greeter.js']) if (!names.includes(n)) throw new Error(names.join(', '));
  });
  await step('share link: members link is copied; it shows in the Files app under Shared links and can be removed', async () => {
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Copy link")');
    await A.waitForSelector('.modal input[value="anyone"]'); if (!(await A.locator('.modal input[value="anyone"]').isEnabled())) throw new Error('owner should be allowed a public link');
    await A.click('.modal button:has-text("Create link")'); await A.waitForSelector('.modal .fl-linkrow'); await audit(A, 'share dialog'); await A.keyboard.press('Escape');
    const k = Object.values(c.db.fileLinks)[0].k; const link = await P.evaluate((key) => fetch('/api/files/link/open?k=' + key, { headers: { 'x-token': LC.S.token } }).then((r) => r.status), k); if (link !== 200) throw new Error('member cannot open: ' + link);
    await A.click('.rbtn[data-pane="files"]'); await A.click('.fl-navitem:has-text("Shared links")'); await A.waitForSelector('.fl-linkrow:has-text("greeter.js")');
    await A.click('.fl-linkrow button[aria-label="Remove link"]'); await A.waitForSelector('.fl-linkrow', { state: 'detached' }); if (Object.keys(c.db.fileLinks).length) throw new Error('not revoked');
  });
  await step('Files app: recent files, type chips, name search, open details', async () => {
    await A.click('.fl-navitem:has-text("Recent")'); await A.waitForSelector('.fl-apptable tr:has-text("budget.csv")');
    await A.click('.fl-chip:has-text("Code")'); await A.waitForSelector('.fl-apptable tr:has-text("budget.csv")', { state: 'detached' }); await A.waitForSelector('.fl-apptable tr:has-text("greeter.js")');
    await A.click('.fl-chip:has-text("All")'); await A.fill('.fl-apphead input[type=search]', 'logo'); await A.waitForFunction(() => document.querySelectorAll('.fl-apptable tbody tr').length === 1);
    await A.screenshot({ path: `${SHOTS}/ui-files-app.png` }); await audit(A, 'Files app');
    await A.click('.fl-apptable tr:has-text("logo-notes") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Details")'); await A.waitForSelector('.modal .fl-dl:has-text("Project")'); await audit(A, 'details'); await A.keyboard.press('Escape');
    await A.fill('.fl-apphead input[type=search]', ''); await A.click('.rbtn[data-pane="chat"]');
  });
  await step('delete your file: the message shows "File deleted"; others can’t delete it', async () => {
    await openChat(A, grp); await tab(A, 'files');
    const id = fileRec('greeter.js').id, st = await P.evaluate((x) => fetch('/api/files/delete', { method: 'POST', headers: { 'x-token': LC.S.token }, body: JSON.stringify({ id: x }) }).then((r) => r.status), id);
    if (st !== 403) throw new Error('Bob deleted Ana’s file: ' + st);
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Delete")'); await confirm(A);
    await tab(P, 'chat'); await P.waitForSelector('.fl-deleted:has-text("File deleted")'); if (fileRec('greeter.js')) throw new Error('still on the server');
  });
  await step('outsiders see nothing of the chat’s files', async () => {
    const E = await open(et, 'eve'); const r = await E.evaluate(async () => { const a = await fetch('/api/files/list?chan=g-files1', { headers: { 'x-token': LC.S.token } }); const b = await fetch('/api/files/all', { headers: { 'x-token': LC.S.token } }).then((x) => x.json()); return [a.status, b.files.length]; });
    if (r[0] !== 404 || r[1] !== 0) throw new Error(JSON.stringify(r)); await E.ctx.close();
  });
  await step('phone: the Files tab and the Files app work at 390 px', async () => {
    const M = await open(at, 'phone', { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    await openChat(M, grp); await M.evaluate(() => LC.setTab('files')); await M.waitForSelector('.fl-table tr.fl-folder:has-text("Designs")'); await M.screenshot({ path: `${SHOTS}/ui-files-phone.png` });
    const wide = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (wide) throw new Error('horizontal scroll');
    await M.evaluate(() => LC.setPane('files')); await M.waitForSelector('.fl-apptable'); await M.ctx.close();
  });

  console.log(`ui-files: ${pass}/${pass + failN} steps passed${axeSrc ? `, axe violations: ${axeBad}` : ''}`);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await br.close(); app.stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(failN || axeBad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
