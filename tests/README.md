# Tests

* `node ../test.js` — server test suite (no dependencies). Run it with `npm test`.
* `ui-smoke.js`, `ui-features.js`, `a11y.js` — browser tests. Need Playwright (`npm i -g playwright && npx playwright install chromium`)
  and `NODE_PATH=$(npm root -g)`; `a11y.js` also needs `axe-core`.
* `electron-e2e.js` — drives two real desktop-app instances under `xvfb-run`. Needs `ELECTRON_BIN` (a Linux Electron binary) and
  `APP_DIR` (a folder with `main.js`, `lib/`, `public/` — e.g. the `resources/app` folder from `scripts/build_desktop.py`).
