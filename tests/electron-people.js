'use strict';
// Desktop app (Linux + xvfb): the people area's notification bridge (desktop/ext-people.js) loads, accepts notifications, and its
// reply path (main process -> window -> quick-reply box) sends a message. Debugging port 9521 (people range 9521-9529).
//   node tests/electron-people.js            (ELECTRON_BIN defaults to /tmp/elec/lin/node_modules/electron/dist/electron)
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), E = process.env.ELECTRON_BIN || '/tmp/elec/lin/node_modules/electron/dist/electron', PORT = 9521;
const HOME = path.join(os.tmpdir(), 'lanchat-people-e-home'), APP = path.join(os.tmpdir(), 'lanchat-people-e-app');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, what = 'condition') => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(300); } throw new Error('timed out: ' + what); };
const pageWith = async (br, pred, ms = 20000) => until(async () => { for (const c of br.contexts()) for (const p of c.pages()) if (pred(p.url())) return p; return null; }, ms, 'page');
let failed = 0, passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); } };
(async () => {
  for (const d of [HOME, APP]) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true }); // the app folder: desktop/* + lib/ + public/ + package.json (like scripts/build_desktop.py)
  for (const f of fs.readdirSync(path.join(ROOT, 'desktop'))) fs.cpSync(path.join(ROOT, 'desktop', f), path.join(APP, f), { recursive: true });
  for (const d of ['lib', 'public']) fs.cpSync(path.join(ROOT, d), path.join(APP, d), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8')); fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ ...pkg, version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version }));
  fs.mkdirSync(HOME, { recursive: true });
  const proc = spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x900x24', E, '--no-sandbox', `--remote-debugging-port=${PORT}`, APP], { env: { ...process.env, HOME, XDG_CONFIG_HOME: HOME }, stdio: 'ignore', detached: true });
  let br, a;
  console.log('People area (desktop app)');
  try {
    await until(() => fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok), 25000, 'electron starts');
    br = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    await step('host a session in the desktop app', async () => {
      const w = await pageWith(br, (u) => u.endsWith('sessions.html')); w.setDefaultTimeout(8000); await w.fill('#nname', 'People desk'); await w.click('#newf button[type=submit]');
      a = await pageWith(br, (u) => u.startsWith('http://localhost:')); a.setDefaultTimeout(10000); await a.waitForSelector('#login:not(.hidden)'); await a.fill('#nameIn', 'Host'); await a.click('#joinBtn'); await a.waitForSelector('#app:not(.hidden) .item.active');
    });
    await step('desktop/ext-people.js is loaded (x:people:hello)', async () => { const r = await a.evaluate(() => LC.native.invoke('x:people:hello')); if (!r || !r.ok) throw new Error(JSON.stringify(r)); });
    await step('a notification can be shown without errors', async () => { const r = await a.evaluate(() => LC.native.invoke('x:people:notify', { title: 'Bob', body: 'hello', chan: 'general', msg: '', reply: true })); if (typeof r !== 'boolean') throw new Error(String(r)); });
    await step('the reply path opens the quick-reply box and sends', async () => {
      await a.evaluate(() => LC.native.invoke('x:people:echoQuickReply', { chan: 'general', msg: '' })); await a.waitForSelector('.modal:has-text("Reply to") textarea');
      await a.fill('.modal textarea', 'sent from the quick reply box'); await a.press('.modal textarea', 'Enter'); await a.waitForSelector('.msg:has-text("sent from the quick reply box")');
    });
  } catch (e) { failed++; console.log('  ✗ harness:', e.message); }
  try { if (br) await br.close(); } catch {} try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
  await sleep(500); for (const d of [HOME, APP]) fs.rmSync(d, { recursive: true, force: true });
  console.log(`People area (desktop app): ${passed}/${passed + failed} passed`); process.exit(failed ? 1 : 0);
})();
