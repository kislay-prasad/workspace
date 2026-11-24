'use strict';
// Takeover test (Linux + xvfb): an older LANChat left running in the tray must be replaced when a newer copy starts.
//   ELECTRON_DIST=<electron dist folder> OLD_APP=<app folder of an older LANChat, e.g. from \`git archive v4.1\`> node tests/electron-takeover.js
// Builds four installed copies under /tmp/inst (old, new, a "4.2.2" copy, and a folder that gets the new version unzipped over it).
const ROOT = require('path').resolve(__dirname, '..'), { execSync } = require('child_process');
const DIST = process.env.ELECTRON_DIST, OLD = process.env.OLD_APP; if (!DIST || !OLD) { console.error('Set ELECTRON_DIST and OLD_APP'); process.exit(2); }
const install = (name, src, version) => { execSync(`rm -rf /tmp/inst/${name} && mkdir -p /tmp/inst && cp -al "${DIST}" /tmp/inst/${name} && rm -f /tmp/inst/${name}/resources/default_app.asar && mv /tmp/inst/${name}/electron /tmp/inst/${name}/lanchat && mkdir -p /tmp/inst/${name}/resources/app`);
  if (src === 'repo') execSync(`cp -r "${ROOT}/desktop/." /tmp/inst/${name}/resources/app/ && cp -r "${ROOT}/lib" "${ROOT}/public" /tmp/inst/${name}/resources/app/`); else execSync(`cp -r "${src}/." /tmp/inst/${name}/resources/app/`);
  if (version) execSync(`sed -i 's/"version": "[^"]*"/"version": "${version}"/' /tmp/inst/${name}/resources/app/package.json`); };
install('old41', OLD); install('new421', 'repo'); install('new422', 'repo', '9.9.9'); install('same', OLD);
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const H = '/tmp/hT'; fs.rmSync(H, { recursive: true, force: true }); fs.mkdirSync(H, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = (inst, port, env = {}) => spawn('xvfb-run', ['-a', `/tmp/inst/${inst}/lanchat`, '--no-sandbox', `--remote-debugging-port=${port}`], { env: { ...process.env, HOME: H, XDG_CONFIG_HOME: H, ...env }, stdio: 'ignore', detached: true });
const mains = (inst) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return fs.readlinkSync(`/proc/${d}/exe`) === `/tmp/inst/${inst}/lanchat` && !/--type=/.test(fs.readFileSync(`/proc/${d}/cmdline`, 'utf8')); } catch { return false; } });
const up = async (port, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { try { await fetch(`http://127.0.0.1:${port}/json/version`); return true; } catch { await sleep(400); } } return false; };
const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); } };
const sessionsVersion = async (port) => { const br = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); try { for (let i = 0; i < 40; i++) { for (const c of br.contexts()) for (const p of c.pages()) if (p.url().endsWith('sessions.html')) { await p.waitForFunction(() => document.querySelector('#ver') && document.querySelector('#ver').textContent, null, { timeout: 8000 }); return await p.textContent('#ver'); } await sleep(300); } return 'no sessions window'; } finally { await br.close().catch(() => {}); } };
(async () => {
  const procs = [];
  try {
    procs.push(launch('old41', 9481));
    await step('the old version starts (like the copy left in the tray)', async () => { if (!(await up(9481))) throw new Error('old did not start'); if (!mains('old41').length) throw new Error('no old main process'); });
    procs.push(launch('new421', 9482, { LANCHAT_REPLACE_OLDER: '1' }));
    await step('starting the new version closes the old copy and runs the new one', async () => {
      if (!(await up(9482, 30000))) throw new Error('new did not start; old still running: ' + mains('old41').length);
      for (let i = 0; i < 20 && mains('old41').length; i++) await sleep(300); if (mains('old41').length) throw new Error('old copy still running');
      const v = await sessionsVersion(9482); if (v !== 'version ' + require(ROOT + '/desktop/package.json').version) throw new Error('sessions window shows: ' + v);
    });
    procs.push(launch('new421', 9483));
    await step('starting the same version again just brings it forward (nothing is closed)', async () => { await sleep(6000); if (mains('new421').length !== 1) throw new Error('main processes of 4.2.1: ' + mains('new421').length); if (await up(9483, 1500)) throw new Error('a second copy kept running'); });
    procs.push(launch('new422', 9484));
    await step('a newer copy takes over from this one by itself, no prompt', async () => {
      if (!(await up(9484, 30000))) throw new Error('4.2.2 did not start; 4.2.1 mains: ' + mains('new421').length);
      for (let i = 0; i < 20 && mains('new421').length; i++) await sleep(300); if (mains('new421').length) throw new Error('4.2.1 still running');
      const v = await sessionsVersion(9484); if (v !== 'version 9.9.9') throw new Error('sessions window shows: ' + v);
    });
    // unzipped OVER the running old copy's folder: same path, old code still in memory
    for (const inst of ['new422']) for (const pid of mains(inst)) try { process.kill(Number(pid), 'SIGKILL'); } catch {} await sleep(1500);
    procs.push(launch('same', 9485)); await step('the old version runs from a folder', async () => { if (!(await up(9485))) throw new Error('did not start'); });
    require('child_process').execSync('rm -rf /tmp/inst/same/resources/app && mkdir -p /tmp/inst/same/resources/app && cp -r ' + ROOT + '/desktop/. /tmp/inst/same/resources/app/ && cp -r ' + ROOT + '/lib ' + ROOT + '/public /tmp/inst/same/resources/app/');
    const oldPid = mains('same')[0]; procs.push(launch('same', 9486, { LANCHAT_REPLACE_OLDER: '1' }));
    await step('the new version unzipped over that folder replaces the old code still running', async () => { if (!(await up(9486, 30000))) throw new Error('new did not start'); for (let i = 0; i < 20 && fs.existsSync('/proc/' + oldPid); i++) await sleep(300); if (fs.existsSync('/proc/' + oldPid)) throw new Error('old process still running'); const v = await sessionsVersion(9486); if (v !== 'version ' + require(ROOT + '/desktop/package.json').version) throw new Error('sessions window shows: ' + v); });
  } catch (e) { console.log('HARNESS', e.message); }
  for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  for (const inst of ['old41', 'new421', 'new422', 'same']) for (const pid of mains(inst)) try { process.kill(Number(pid), 'SIGKILL'); } catch {}
  console.log('DONE'); process.exit(0);
})();
