# Tests

* `node ../test.js` — server test suite (no dependencies). Run it with `npm test`.
* `ui-smoke.js`, `ui-features.js`, `a11y.js` — browser tests. Need Playwright (`npm i -g playwright && npx playwright install chromium`)
  and `NODE_PATH=$(npm root -g)`; `a11y.js` also needs `axe-core`.
* `electron-e2e.js` — drives two real desktop-app instances under `xvfb-run`. Needs `ELECTRON_BIN` (a Linux Electron binary) and
  `APP_DIR` (a folder with `main.js`, `lib/`, `public/` — e.g. the `resources/app` folder from `scripts/build_desktop.py`).
* `ui-https.js` — a browser on the plain `http://` LAN address is offered the secure page, switches without losing its sign-in,
  and calls someone using the app (needs nothing extra).
* `ui-cleanup.js` — the clean-up tools (delete old chats, delete people, start fresh).
* `electron-call.js` — two desktop apps (Linux + xvfb): approval, video call, one-click **whole-screen** sharing seen by the friend.
  `ELECTRON_BIN=…/electron APP_DIR=…/app node tests/electron-call.js` (APP_DIR = desktop/*, lib/, public/ copied into one folder).

