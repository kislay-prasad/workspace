'use strict';
// Teams area browser flows (docs/features-teams.md): teams and channels, admin and security, bots and automation.
// Playwright with Chromium; servers use the teams port range (4800–4899). Screenshots go to /tmp/teams-shots/.
// With AXE_JS=/path/to/axe.min.js the new screens are also checked with axe-core (0 violations expected).
const ROOT = require('path').resolve(__dirname, '..'), os = require('os'), fs = require('fs');
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js');
const SHOTS = '/tmp/teams-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/lc-teams-ui-');
  const app = createApp({ dataDir: dir, name: 'Teams UI', publicDir: ROOT + '/public' }); const port = await app.start(4820); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'), cara = c.makeUser('Cara'); const ht = c.newToken(host), bt = c.newToken(bob), ct = c.newToken(cara); c.sysMsg('general', 'Welcome');
  const br = await chromium.launch(); const errs = []; let pass = 0, failN = 0;
  const axeSrc = process.env.AXE_JS ? fs.readFileSync(process.env.AXE_JS, 'utf8') : null;
  const open = async (tok, label, o = {}) => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...o });
    if (tok) await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok);
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.ctx = ctx;
    p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/40[0-9]|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(o.url || B); if (tok) await p.waitForSelector('#app:not(.hidden) .item.active'); return p;
  };
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failN++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); try { await H.screenshot({ path: `${SHOTS}/fail-${failN}.png` }); } catch {} } };
  const audit = async (p, label) => { if (!axeSrc) return; await p.evaluate(axeSrc); const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => x.id + ' ×' + x.nodes.length + ' ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | '))); if (v.length) throw new Error(`axe (${label}): ${v.join(' ;; ')}`); };
  const send = async (p, text) => { await p.fill('#composerHost textarea', text); await p.press('#composerHost textarea', 'Enter'); };
  const team = () => Object.values(c.db.teams).find((x) => x.name === 'Launch');
  const chanNamed = (n) => Object.values(c.db.channels).find((x) => x.team === team().id && x.name === n);
  const teamMenu = async (p, item) => { await p.click(`.tm-team[data-team="${team().id}"] .tm-trow .kebab`); await p.click(`.popmenu button:has-text("${item}")`); };
  const chanMenu = async (p, name, item) => { const row = p.locator('.tm-chan', { hasText: name }).first(); await row.hover(); await row.locator('.kebab').click(); await p.click(`.popmenu button:has-text("${item}")`); };
  const H = await open(ht, 'host'), P = await open(bt, 'bob'), C = await open(ct, 'cara');

  // ---------------- teams and channels ----------------
  await step('create a team from a template (Teams pane → Create a team)', async () => {
    await H.click('.rbtn[data-pane="teams"]'); await H.waitForSelector('.tm-empty');
    await H.click('#sideActions button[aria-label="Create a team"]'); await H.click('.tm-tpl:has-text("Project")');
    await H.fill('.modal form .field:has-text("Team name") input', 'Launch'); await H.fill('.modal form .field:has-text("Description") textarea', 'Shipping v2');
    await H.click('.modal form button[type=submit]'); await H.click('.modal button:has-text("Skip")');
    await H.waitForFunction(() => document.querySelector('#title').textContent === 'General');
    await H.waitForSelector('.tm-team .tm-chan:has-text("Planning")'); await H.screenshot({ path: `${SHOTS}/ui-01-team-created.png` });
    if (!team() || team().template !== 'project') throw new Error('team not stored');
  });
  await step('add a member from Manage team; they see the team live', async () => {
    await P.click('.rbtn[data-pane="teams"]');
    await teamMenu(H, 'Manage team'); await H.waitForSelector('.tm-mhead'); await H.click('.tm-mbody button:has-text("Add member")');
    await H.check('.modal .pick:has-text("Bob") input'); await H.click('.modal button:has-text("Add")');
    await P.waitForSelector('.tm-team:has-text("Launch") .tm-chan:has-text("General")');
    if (c.canSee(c.db.users[cara.id], team().general)) throw new Error('outsider can see the team');
  });
  await step('@team mention badges the Teams pane; members reply', async () => {
    await H.click('.tm-chan:has-text("Planning") .itemmain'); await H.waitForFunction(() => document.querySelector('#title').textContent === 'Planning');
    await P.click('.tm-chan:has-text("General") .itemmain'); await P.waitForFunction(() => document.querySelector('#title').textContent === 'General' && !document.querySelector('#composerHost textarea').disabled);
    await send(P, '@team kickoff tomorrow'); await P.waitForSelector('.msg:has-text("kickoff tomorrow")');
    await H.waitForSelector('.rbtn[data-pane="teams"] .rbadge'); await H.waitForSelector('.tm-chan:has-text("General") .badge.mention');
  });
  await step('private channel: only the chosen teammates see it', async () => {
    await teamMenu(H, 'Add channel'); await H.fill('.modal form .field:has-text("Channel name") input', 'Leads');
    await H.check('.modal input[name="tm-ctype"][value="private"]'); await H.check('.modal .pick:has-text("Bob") input'); await H.click('.modal form button[type=submit]');
    await P.waitForSelector('.tm-chan:has-text("Leads")'); await H.waitForFunction(() => document.querySelector('#title').textContent === 'Leads');
    if (c.canSee(c.db.users[cara.id], chanNamed('Leads').id)) throw new Error('private channel leaked');
  });
  await step('channel settings: posts layout and "only moderators start posts" reach members', async () => {
    await chanMenu(H, 'Design', 'Manage channel'); await H.fill('.modal .field:has-text("Description") textarea', 'Mock-ups and feedback');
    await H.check('.modal input[name="tm-post"][value="moderators"]'); await H.click('.modal .acts button.primary:has-text("Save")');
    await P.click('.tm-chan:has-text("Design") .itemmain'); await P.waitForSelector('.tm-banner:has-text("Only moderators")');
    if (chanNamed('Design').postRule !== 'moderators') throw new Error('not saved');
  });
  await step('hide a channel (per person) and show hidden channels', async () => {
    await chanMenu(P, 'Planning', 'Hide'); await P.waitForSelector('.tm-hiddenbtn:has-text("1 hidden")');
    await P.click('.tm-hiddenbtn'); await P.waitForSelector('.tm-chan.tm-hiddenchan:has-text("Planning")');
    if ((c.db.tmPrefs[host.id] || { hidden: [] }).hidden.length) throw new Error('hidden for the host too');
  });
  await step('get a link to a channel; the link opens it (access checked)', async () => {
    await chanMenu(H, 'Leads', 'Get link to channel'); await H.waitForSelector('.toast:has-text("Link copied")');
    const id = chanNamed('Leads').id; await P.goto(B + '/#c=' + id); await P.waitForFunction(() => document.querySelector('#title').textContent === 'Leads');
    await C.goto(B + '/#c=' + id); await C.waitForSelector('.toast:has-text("isn\'t available")');
  });
  await step('join a team with its code (Join or create a team)', async () => {
    await teamMenu(H, 'Manage team'); await H.click('.tm-mtabs .tabbtn:has-text("Settings")'); const code = (await H.textContent('.tm-code')).trim();
    await C.click('.rbtn[data-pane="teams"]'); await C.click('#sideActions button[aria-label="Join or create a team"]'); await C.fill('input[aria-label="Enter code"]', code); await C.click('button:has-text("Join team")');
    await C.waitForSelector('.tm-team:has-text("Launch")'); await C.screenshot({ path: `${SHOTS}/ui-02-joined.png` });
  });
  await step('tags: create @designers; it is suggested in the message box', async () => {
    await H.click('.tm-mtabs .tabbtn:has-text("Tags")'); await H.click('button:has-text("Create tag")'); await H.fill('input[aria-label="Tag name"]', 'designers'); await H.check('.tm-mbody .pick:has-text("Bob") input'); await H.click('.tm-mbody button.primary:has-text("Save")');
    await H.waitForSelector('.tm-tagrow:has-text("@designers")');
    await P.click('.tm-chan:has-text("General") .itemmain'); await P.fill('#composerHost textarea', 'hey @des'); await P.waitForSelector('.ac button:has-text("@designers")'); await P.fill('#composerHost textarea', '');
  });
  await step('post in multiple channels at once', async () => {
    await H.click('.tm-chan:has-text("General") .itemmain'); await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Post in multiple channels")');
    await H.check('.modal .pick:has-text("Launch › Development") input'); await H.click('.modal button:has-text("Done")'); await H.waitForSelector('.tm-banner:has-text("Also posting in")');
    await send(H, 'Release notes v2'); await sleep(400);
    const copies = c.db.messages.filter((m) => m.text === 'Release notes v2'); if (copies.length !== 2) throw new Error('copies: ' + copies.length);
    await H.waitForSelector('.msg:has-text("Release notes v2") .tm-xpost');
  });
  await step('channel analytics (team owners)', async () => {
    await chanMenu(H, 'General', 'Channel analytics'); await H.waitForSelector('.modal .tm-chart'); await H.screenshot({ path: `${SHOTS}/ui-03-analytics.png` }); await H.keyboard.press('Escape');
    const items = await P.evaluate(() => { LC.chanInfo; return true; }); void items;
  });
  await step('a11y: Teams pane, Join or create, Manage team', async () => {
    await audit(H, 'teams pane'); await H.click('#sideActions button[aria-label="Join or create a team"]'); await H.waitForSelector('.tm-startgrid'); await audit(H, 'join or create');
    await teamMenu(H, 'Manage team'); await H.waitForSelector('.tm-mhead'); await audit(H, 'manage team');
    await H.evaluate(() => LC.setUi({ theme: 'dark' })); await audit(H, 'manage team dark'); await H.screenshot({ path: `${SHOTS}/ui-04-manage-dark.png` }); await H.evaluate(() => LC.setUi({ theme: 'auto' }));
  });

  // ---------------- admin and security ----------------
  await step('Manage › Policies: bad-word filter blocks a message', async () => {
    await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn:has-text("Policies")'); await H.waitForSelector('.tm-sec:has-text("Bad-word filter")');
    const sec = H.locator('.tm-sec', { hasText: 'Bad-word filter' }); await sec.locator('label:has-text("Filter these words") input').check(); await sec.locator('textarea').fill('darn'); await sec.locator('button:has-text("Save")').click();
    await H.waitForSelector('.toast:has-text("Saved")'); await audit(H, 'policies'); await H.keyboard.press('Escape');
    await send(P, 'oh darn it'); await P.waitForSelector('.toast:has-text("isn\'t allowed")');
  });
  await step('report a concern from the message menu; admins handle it in Reports', async () => {
    await H.click('.tm-chan:has-text("General") .itemmain'); await send(H, 'please report me');
    const m = P.locator('.msg', { hasText: 'please report me' }).last(); await m.hover(); await m.locator('.tools button[title="More"]').click(); await P.click('.popmenu button:has-text("Report this message")');
    await P.check('.modal input[name="tm-reason"][value="spam"]'); await P.click('.modal button:has-text("Send report")'); await P.waitForSelector('.toast:has-text("admins were told")');
    await H.waitForSelector('.rbtn[data-pane="manage"] .rbadge'); await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn:has-text("Reports")'); await H.waitForSelector('.tm-report:has-text("please report me")');
    await audit(H, 'reports'); await H.click('.tm-report button:has-text("Dismiss")'); await H.waitForSelector('text=Nothing has been reported.');
  });
  await step('guests: an admin makes Cara a guest; #general disappears for her', async () => {
    await H.click('.tabbtn >> text=People'); await H.waitForSelector('.table td:has-text("Cara")'); await H.click('tr:has-text("Cara") button:has-text("Actions")'); await H.click('.popmenu button:has-text("Make guest")');
    await C.waitForFunction(() => !LC.S.channels.has('general')); if (c.db.users[cara.id].role !== 'guest') throw new Error('not a guest');
    if (!c.db.teams[team().id].guests.includes(cara.id)) throw new Error('team role not updated');
  });
  let code;
  await step('bulk add from CSV: invite code → the person joins without waiting', async () => {
    await H.click('.tabbtn >> text=People'); await H.waitForSelector('text=Bulk add people'); await H.fill('textarea[aria-label="Or paste: one person per line"]', 'name,role,job title,department\nDana,member,Designer,Studio');
    await H.click('button:has-text("Create invites")'); await H.waitForSelector('.tm-sec code'); code = (await H.textContent('.tm-sec td code')).trim(); await audit(H, 'people + bulk add'); await H.keyboard.press('Escape');
    const D = await open(null, 'dana', { url: B + '/#invite=' + code }); await D.waitForSelector('.tm-invitenote:has-text("Dana")');
    if ((await D.inputValue('#nameIn')) !== 'Dana') throw new Error('name not filled'); await D.click('#joinBtn'); await D.waitForSelector('#app:not(.hidden)');
    if (Object.values(c.db.users).find((u) => u.name === 'Dana').profile.jobTitle !== 'Designer') throw new Error('job title missing'); await D.ctx.close();
  });
  await step('PIN sign-in: Bob sets a PIN; a new device must enter it', async () => {
    await P.evaluate(() => LC.settingsPanel('tm_security')); await P.waitForSelector('.tm-security'); await audit(P, 'security settings');
    await P.fill('input[aria-label="New PIN (4–12 digits) or password (8+ characters)"]', '482915'); await P.click('.tm-security button.primary:has-text("Set PIN or password")'); await P.waitForSelector('.toast:has-text("Saved")'); await P.keyboard.press('Escape');
    await H.evaluate(() => LC.api('/api/tm/admin/policies', { pinSkipsApproval: true }));
    const N = await open(null, 'newdev'); await N.waitForSelector('#login:not(.hidden)'); await N.fill('#nameIn', 'Bob'); await N.click('#joinBtn');
    await N.waitForSelector('#tmPin:not(.hidden)'); await N.fill('#tmPin', '482915'); await N.click('#joinBtn'); await N.waitForSelector('#app:not(.hidden) .item.active'); await N.ctx.close();
  });
  await step('branded lobby: welcome text and colour on the sign-in screen', async () => {
    await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn >> text=Settings'); await H.waitForSelector('.tm-sec:has-text("Branded lobby")');
    await H.fill('textarea[aria-label="Welcome text"]', 'Hi friends — ask Host for an invite'); await H.locator('.tm-sec', { hasText: 'Branded lobby' }).locator('button.primary:has-text("Save")').click(); await H.waitForSelector('.toast:has-text("Saved")'); await H.keyboard.press('Escape');
    const L = await open(null, 'lobby'); await L.waitForSelector('.tm-welcome:has-text("Hi friends")'); await audit(L, 'branded sign-in'); await L.screenshot({ path: `${SHOTS}/ui-05-lobby.png` }); await L.ctx.close();
  });
  await step('Manage › Usage and Compliance render (charts, activity log)', async () => {
    await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn:has-text("Usage")'); await H.waitForSelector('.tm-chart'); await audit(H, 'usage');
    await H.click('.tabbtn:has-text("Compliance")'); await H.waitForSelector('.tm-sec:has-text("Activity log") td:has-text("user.role")'); await audit(H, 'compliance');
    await H.click('.tabbtn:has-text("Teams")'); await H.waitForSelector('.tm-sec td:has-text("Launch")'); await audit(H, 'admin teams'); await H.keyboard.press('Escape');
  });

  // ---------------- bots and automation ----------------
  await step('incoming webhook from the channel menu → a card appears; its reply button answers in the thread', async () => {
    await chanMenu(H, 'General', 'Connectors and webhooks'); await H.click('.modal button:has-text("New incoming webhook")'); await H.fill('.modal input[aria-label="Name"]', 'Build bot'); await H.click('.modal button[type=submit]');
    await H.waitForSelector('.modal code.tm-secret'); const url = (await H.textContent('.modal code.tm-secret')).trim(); await audit(H, 'webhook created'); await H.click('.modal button:has-text("Done")'); await H.waitForSelector('.modal h3:has-text("Incoming webhooks")'); await H.keyboard.press('Escape');
    const r = await fetch(B + new URL(url).pathname + new URL(url).search, { method: 'POST', body: JSON.stringify({ card: { title: 'Build 7 passed', facts: [{ k: 'Branch', v: 'main' }], buttons: [{ label: 'Nice', action: 'reply', value: 'Nice work, bot' }] } }) }); if (r.status !== 200) throw new Error('webhook ' + r.status);
    await P.click('.tm-chan:has-text("General") .itemmain'); await P.waitForSelector('.tm-cardmsg:has-text("Build 7 passed")'); await P.waitForSelector('.msg:has-text("Build 7 passed") .role.tm-role.bot');
    await P.click('.tm-cardmsg:has-text("Build 7 passed") button:has-text("Nice")'); await sleep(300);
    if (!c.db.messages.some((m) => m.text === 'Nice work, bot' && m.thread)) throw new Error('reply not posted in the thread');
    await P.screenshot({ path: `${SHOTS}/ui-06-card.png` });
  });
  await step('message extension: Create a card from the message box', async () => {
    await P.click('#composerHost .morebtn'); await P.click('.popmenu button:has-text("Create a card")'); await P.fill('.modal input[aria-label="Title"]', 'Lunch poll'); await P.fill('.modal textarea[aria-label="Text"]', 'Pizza or sushi?');
    await audit(P, 'create card'); await P.click('.modal button:has-text("Post")'); await H.waitForSelector('.tm-cardmsg:has-text("Lunch poll")');
  });
  await step('workflow made in Manage › Workflows runs from the message box', async () => {
    await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn:has-text("Workflows")'); await H.click('button:has-text("New workflow")');
    await H.fill('.modal input[aria-label="Name"]', 'Stand-up'); await H.selectOption('.modal select[aria-label="When this happens"]', 'manual');
    await H.selectOption('.modal select[aria-label="Do this"]', 'card'); await H.fill('.modal input[aria-label="Title"]', 'Stand-up from {person}'); await audit(H, 'workflow editor');
    await H.click('.modal button.primary:has-text("Save")'); await H.waitForSelector('.req:has-text("Stand-up")'); await H.keyboard.press('Escape');
    await sleep(500); await P.click('#composerHost .morebtn'); await P.click('.popmenu button:has-text("Workflow: Stand-up")'); await H.waitForSelector('.tm-cardmsg:has-text("Stand-up from Bob")');
  });
  await step('simple bot answers a keyword; API key from Manage › Developer posts as a bot', async () => {
    await H.evaluate(() => LC.api('/api/tm/admin/bots/save', { name: 'Helper', rules: [{ match: 'keyword', pattern: 'wifi', reply: { text: 'Password is on the fridge, {person}.' }, chans: ['*'] }] }));
    await P.click('.rbtn[data-pane="chat"]'); await P.evaluate(() => LC.openChat('general')); await send(P, 'what is the wifi?'); await P.waitForSelector('.msg:has-text("Password is on the fridge, Bob.")');
    await H.click('.rbtn[data-pane="manage"]'); await H.click('.tabbtn:has-text("Developer")'); await H.fill('input[aria-label="Key name"]', 'Reports'); await H.fill('input[aria-label="A new bot named…"]', 'Reporter');
    await H.click('.tm-sec button.primary:has-text("Create")'); await H.waitForSelector('code.tm-secret'); const key = (await H.textContent('code.tm-secret')).trim(); await audit(H, 'developer');
    const r = await fetch(B + '/api/bot/send', { method: 'POST', headers: { 'x-api-key': key }, body: JSON.stringify({ chan: 'general', text: 'Nightly report: all good' }) }); if (r.status !== 200) throw new Error('bot api ' + r.status);
    await P.waitForSelector('.msg:has-text("Nightly report") .role.tm-role.bot'); await H.keyboard.press('Escape');
  });
  await step('phone layout: Teams pane and a channel', async () => {
    const M = await open(bt, 'phone', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); await M.waitForSelector('#app.list-mode');
    await M.tap('.rbtn[data-pane="teams"]'); await M.waitForSelector('.tm-team:has-text("Launch")'); await audit(M, 'phone teams list'); await M.screenshot({ path: `${SHOTS}/ui-07-phone-teams.png` });
    await M.tap('.tm-chan:has-text("General") .itemmain'); await M.waitForSelector('#app:not(.list-mode) #composerHost textarea'); await M.screenshot({ path: `${SHOTS}/ui-08-phone-channel.png` }); await M.ctx.close();
  });

  console.log('ERRORS:', errs.length ? errs : 'none');
  console.log(`Teams UI: ${pass}/${pass + failN} steps passed`);
  await br.close(); app.stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(failN || errs.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
