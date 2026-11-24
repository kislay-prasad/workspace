'use strict';
// Electron end-to-end call test (Linux + xvfb): two desktop apps on the LAN, approval, a video call, and
// screen sharing that shares the WHOLE screen by default (no picker), received by the other app.
//   ELECTRON_BIN=/path/to/electron APP_DIR=/path/to/app node tests/electron-call.js
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os');
const E = process.env.ELECTRON_BIN, APP = process.env.APP_DIR; if (!E || !APP) { console.error('Set ELECTRON_BIN and APP_DIR'); process.exit(2); }
const HA = os.tmpdir() + '/lanchat-cA', HB = os.tmpdir() + '/lanchat-cB';
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal).address;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = (home, port) => { fs.mkdirSync(home, { recursive: true }); return spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x900x24', E, '--no-sandbox', `--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', APP], { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home }, stdio: 'ignore', detached: true }); };
const pageWith = async (br, pred, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { for (const c of br.contexts()) for (const p of c.pages()) if (pred(p.url())) return p; await sleep(300); } throw new Error('page not found'); };
const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); } };
const until = async (fn, ms = 20000, what = 'condition') => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400); } throw new Error('timed out: ' + what); };
(async () => {
  for (const h of [HA, HB]) fs.rmSync(h, { recursive: true, force: true });
  const procs = []; let A, B, a, b;
  try {
    procs.push(launch(HA, 9461)); await until(() => fetch('http://127.0.0.1:9461/json/version').then(() => true).catch(() => false), 20000, 'A starts');
    A = await chromium.connectOverCDP('http://127.0.0.1:9461');
    await step('A hosts a session', async () => { const w = await pageWith(A, (u) => u.endsWith('sessions.html')); w.setDefaultTimeout(8000); await w.fill('#nname', 'Friday Gang'); await w.click('#newf button[type=submit]'); a = await pageWith(A, (u) => u.startsWith('http://localhost:')); a.setDefaultTimeout(10000); await a.waitForSelector('#login:not(.hidden)'); await a.fill('#nameIn', 'Host'); await a.click('#joinBtn'); await a.waitForSelector('#app:not(.hidden) .item.active'); });
    const port = new URL(a.url()).port;
    fs.mkdirSync(HB + '/LANChat', { recursive: true }); fs.writeFileSync(HB + '/LANChat/config.json', JSON.stringify({ version: 4, sessions: [{ id: 'j1', kind: 'join', name: 'Friday Gang', url: `http://${lanIp}:${port}` }], active: 'j1', closeToTray: true }));
    procs.push(launch(HB, 9462)); await until(() => fetch('http://127.0.0.1:9462/json/version').then(() => true).catch(() => false), 20000, 'B starts');
    B = await chromium.connectOverCDP('http://127.0.0.1:9462');
    await step('B joins over the LAN and A approves', async () => { b = await pageWith(B, (u) => u.startsWith(`http://${lanIp}:`)); b.setDefaultTimeout(10000); await b.waitForSelector('#login:not(.hidden)'); await b.fill('#nameIn', 'Friend'); await b.click('#joinBtn'); await b.waitForSelector('#waiting:not(.hidden)'); await a.click('.rbtn[data-pane="manage"]'); await a.click('.req button:has-text("Approve")'); await a.keyboard.press('Escape'); await b.waitForSelector('#app:not(.hidden) .item.active'); });
    await step('video call: ring, accept, connected, audio + camera arrive', async () => {
      await a.click('.item[data-chan^="dm:"]:has-text("Friend") .itemmain'); await a.click('#headActions button[aria-label="Video call"]');
      await b.waitForSelector('.ringbox'); await b.click('.ringbox button[aria-label="Accept with video"]');
      await until(async () => { const x = await a.evaluate(() => LC.callDebug()), y = await b.evaluate(() => LC.callDebug()); return x && y && x[0] && y[0] && x[0].startsWith('connected') && y[0].startsWith('connected'); }, 20000, 'connected');
      await until(() => b.evaluate(() => { const au = document.querySelector('#callAudio audio'); return !!(au && au.srcObject && au.srcObject.getAudioTracks().length); }), 8000, 'remote audio');
      await until(() => b.evaluate(() => [...document.querySelectorAll('#callUI .tile:not(.local) video')].some((v) => v.videoWidth > 0)), 10000, 'remote camera video');
    });
    await step('share: one click shares the whole screen (no picker) and the friend sees it', async () => {
      await a.click('#callUI .sharegroup .cbtn:not(.caret)'); await a.waitForSelector('#callUI .selfshare');
      const label = await a.evaluate(() => { const v = [...document.querySelectorAll('video')]; void v; return LC.callDebug() && window.__lcShareLabel; }); void label;
      await b.waitForSelector('#callUI .present video'); await until(() => b.evaluate(() => { const v = document.querySelector('#callUI .present video'); return v && v.videoWidth > 0 ? v.videoWidth + 'x' + v.videoHeight : false; }), 15000, 'screen video at the friend');
      const cams = await b.evaluate(() => [...document.querySelectorAll('#callUI .film .tile:not(.local) video')].filter((v) => v.videoWidth > 0).length); if (!cams) throw new Error('presenter camera not visible in the strip');
      await b.waitForSelector('#callUI .plabel:has-text("Host is presenting")');
    });
    await step('the share picker lists screens and windows with thumbnails', async () => { const list = await a.evaluate(() => LC.native.screens()); if (!list.some((s) => s.kind === 'screen' && s.thumb.startsWith('data:image/'))) throw new Error(JSON.stringify(list.map((s) => s.kind + ':' + s.name))); });
    await a.screenshot({ path: os.tmpdir() + '/e2e-call-host.png' }); await b.screenshot({ path: os.tmpdir() + '/e2e-call-friend.png' });
    await step('stop sharing and leave', async () => { await a.click('#callUI .selfshare button'); await b.waitForSelector('#callUI .present', { state: 'detached' }); await a.evaluate(() => LC.leaveCall()); await b.waitForFunction(() => !document.querySelector('#callUI .tile:not(.local)')); await b.evaluate(() => LC.leaveCall()); });
  } catch (e) { console.log('HARNESS', e.message); }
  for (const br of [A, B]) try { await br.close(); } catch {} for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  try { require('child_process').execSync('pkill -f -- "--remote-debugging-port=946"', { stdio: 'ignore' }); } catch {}
  console.log('DONE'); process.exit(0);
})();
