'use strict';
// Calls area desktop test (Linux + xvfb): two desktop apps on the LAN, approval, a video call, one-click whole-screen sharing
// seen by the friend, and the desktop extras from desktop/ext-calls.js: the red frame around the shared screen (which also
// draws people's annotations) and the always-on-top presenter toolbar (pause and stop presenting from it).
//   ELECTRON_BIN=/path/to/electron APP_DIR=/path/to/app node tests/electron-calls.js     (debugging ports 9541-9542)
// APP_DIR = desktop/* + lib/ + public/ in one folder (see tests/README.md).
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os');
const E = process.env.ELECTRON_BIN, APP = process.env.APP_DIR; if (!E || !APP) { console.error('Set ELECTRON_BIN and APP_DIR'); process.exit(2); }
const HA = os.tmpdir() + '/lanchat-calls-A', HB = os.tmpdir() + '/lanchat-calls-B', PA = 9541, PB = 9542;
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal).address;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = (home, port) => { fs.mkdirSync(home, { recursive: true }); return spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x900x24', E, '--no-sandbox', `--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', APP], { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home }, stdio: 'ignore', detached: true }); };
const pageWith = async (br, pred, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { for (const c of br.contexts()) for (const p of c.pages()) if (pred(p.url())) return p; await sleep(300); } throw new Error('page not found'); };
const pageEval = async (br, test, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { for (const c of br.contexts()) for (const p of c.pages()) { if (!p.url().startsWith('data:text/html')) continue; try { if (await p.evaluate(test)) return p; } catch {} } await sleep(300); } return null; };
let ok = 0, bad = 0; const step = async (name, fn) => { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); } };
const until = async (fn, ms = 20000, what = 'condition') => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400); } throw new Error('timed out: ' + what); };
(async () => {
  for (const h of [HA, HB]) fs.rmSync(h, { recursive: true, force: true });
  const procs = []; let A, B, a, b;
  try {
    procs.push(launch(HA, PA)); await until(() => fetch(`http://127.0.0.1:${PA}/json/version`).then(() => true).catch(() => false), 30000, 'A starts');
    A = await chromium.connectOverCDP(`http://127.0.0.1:${PA}`);
    await step('A hosts a session', async () => { const w = await pageWith(A, (u) => u.endsWith('sessions.html')); w.setDefaultTimeout(8000); await w.fill('#nname', 'Friday Gang'); await w.click('#newf button[type=submit]'); a = await pageWith(A, (u) => u.startsWith('http://localhost:')); a.setDefaultTimeout(10000); await a.waitForSelector('#login:not(.hidden)'); await a.fill('#nameIn', 'Host'); await a.click('#joinBtn'); await a.waitForSelector('#app:not(.hidden) .item.active'); });
    const port = new URL(a.url()).port;
    fs.mkdirSync(HB + '/LANChat', { recursive: true }); fs.writeFileSync(HB + '/LANChat/config.json', JSON.stringify({ version: 4, sessions: [{ id: 'j1', kind: 'join', name: 'Friday Gang', url: `http://${lanIp}:${port}` }], active: 'j1', closeToTray: true }));
    procs.push(launch(HB, PB)); await until(() => fetch(`http://127.0.0.1:${PB}/json/version`).then(() => true).catch(() => false), 30000, 'B starts');
    B = await chromium.connectOverCDP(`http://127.0.0.1:${PB}`);
    await step('B joins over the LAN and A approves', async () => { b = await pageWith(B, (u) => u.startsWith(`http://${lanIp}:`)); b.setDefaultTimeout(10000); await b.waitForSelector('#login:not(.hidden)'); await b.fill('#nameIn', 'Friend'); await b.click('#joinBtn'); await b.waitForSelector('#waiting:not(.hidden)'); await a.click('.rbtn[data-pane="manage"]'); await a.click('.req button:has-text("Approve")'); await a.keyboard.press('Escape'); await b.waitForSelector('#app:not(.hidden) .item.active'); });
    await step('video call: ring, accept, connected, audio + camera arrive', async () => {
      await a.click('.rbtn[data-pane="chat"]'); await a.click('.item[data-chan^="dm:"]:has-text("Friend") .itemmain'); await a.click('#headActions button[aria-label="Video call"]');
      await b.waitForSelector('.ringbox'); await b.click('.ringbox button[aria-label="Accept with video"]');
      await until(async () => { const x = await a.evaluate(() => LC.callDebug()), y = await b.evaluate(() => LC.callDebug()); return x && y && x[0] && y[0] && x[0].startsWith('connected') && y[0].startsWith('connected'); }, 25000, 'connected');
      await until(() => b.evaluate(() => { const au = document.querySelector('#callAudio audio'); return !!(au && au.srcObject && au.srcObject.getAudioTracks().length); }), 8000, 'remote audio');
      await until(() => b.evaluate(() => [...document.querySelectorAll('#callUI .tile:not(.local) video')].some((v) => v.videoWidth > 0)), 12000, 'remote camera video');
    });
    await step('share: one click shares the whole screen (no picker) and the friend sees it', async () => {
      await a.click('#callUI .sharegroup .cbtn:not(.caret)'); await a.waitForSelector('#callUI .selfshare');
      await b.waitForSelector('#callUI .present video'); await until(() => b.evaluate(() => { const v = document.querySelector('#callUI .present video'); return v && v.videoWidth > 0; }), 15000, 'screen video at the friend');
      const cams = await b.evaluate(() => [...document.querySelectorAll('#callUI .film .tile:not(.local) video')].filter((v) => v.videoWidth > 0).length); if (!cams) throw new Error('presenter camera not visible in the strip');
      await b.waitForSelector('#callUI .plabel:has-text("Host is presenting")');
    });
    let bar = null, frame = null;
    await step('desktop: a red frame around the shared screen and a presenter toolbar on top of it', async () => {
      frame = await pageEval(A, () => !!(window.ink && document.getElementById('b') && getComputedStyle(document.getElementById('b')).borderTopColor === 'rgb(229, 56, 59)')); if (!frame) throw new Error('no red frame window');
      bar = await pageEval(A, () => !!document.getElementById('stop') && /present/i.test(document.getElementById('lbl').textContent)); if (!bar) throw new Error('no presenter toolbar');
      const label = await bar.evaluate(() => document.getElementById('stop').textContent); if (!/Stop presenting/.test(label)) throw new Error('toolbar label: ' + label);
      await a.screenshot({ path: os.tmpdir() + '/e2e-calls-host.png' }); await bar.screenshot({ path: os.tmpdir() + '/e2e-calls-toolbar.png' });
    });
    await step('the presenter toolbar pauses sharing (the friend sees "paused") and resumes', async () => {
      await bar.click('#pause'); await b.waitForSelector('#callUI .cl-pausedpill'); await until(() => bar.evaluate(() => /Resume/.test(document.getElementById('pause').textContent)), 8000, 'toolbar shows Resume');
      await bar.click('#pause'); await b.waitForSelector('#callUI .cl-pausedpill', { state: 'detached' });
    });
    await step('annotations from the friend are drawn on the presenter\'s real screen (in the frame)', async () => {
      await a.click('#callUI .cl-ptool button[data-k="pt:ink"]'); await b.waitForSelector('#callUI .cl-inkbar');
      await b.evaluate(() => LC.api('/api/call/ink', { chan: LC.callApi.chan, k: 'pen', pts: [1000, 1000, 5000, 5000, 9000, 2000], c: '#34c759', w: 4 }));
      await until(() => frame.evaluate(() => (window.inkCount || 0) > 0), 8000, 'ink reached the frame');
    });
    await step('"Stop presenting" on the toolbar stops the share; the frame and toolbar close', async () => {
      await bar.click('#stop'); await b.waitForSelector('#callUI .present', { state: 'detached' }); await a.waitForSelector('#callUI .selfshare', { state: 'detached' });
      await until(async () => !(await pageEval(A, () => !!(window.ink || document.getElementById('stop')), 500)), 8000, 'windows closed');
    });
    await step('the share picker lists screens and windows with thumbnails', async () => { const list = await a.evaluate(() => LC.native.screens()); if (!list.some((s) => s.kind === 'screen' && s.thumb.startsWith('data:image/'))) throw new Error(JSON.stringify(list.map((s) => s.kind + ':' + s.name))); });
    await step('leave', async () => { await a.evaluate(() => LC.leaveCall()); await b.waitForFunction(() => !document.querySelector('#callUI .tile:not(.local)')); await b.evaluate(() => LC.leaveCall()); });
  } catch (e) { bad++; console.log('HARNESS', e.message); }
  for (const br of [A, B]) try { await br.close(); } catch {} for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  console.log(`electron-calls: ${ok}/${ok + bad} passed`); process.exit(bad ? 1 : 0);
})();
