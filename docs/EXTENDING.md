# Extending LANChat

LANChat is split into **feature areas**. Each area keeps its code in its own files and plugs into the core
through the extension points below. Several people (or agents) can then build different areas at the same
time and merge without conflicts.

Ground rules:
- **No dependencies.** The server uses only Node's built-in modules. The client is plain JavaScript with no build
  step and no frameworks. Do not add npm packages, CDNs or anything that needs the internet: LANChat must work on a
  LAN with no internet at all.
- **No Microsoft names or logos.** Copy how Teams works, not its trademarks. Icons come from Fluent UI System
  Icons (MIT).
- **Privacy.** Everything stays on the host's computer. People only see chats they belong to. Always check
  `ctx.canSee(me, chan)` before reading or writing anything that belongs to a chat.
- Keep the style: small functions, `el()` for DOM, `LC.t()` for every visible string, icons through `LC.icon()`,
  and server errors through `fail(status, message)` with a message a person can understand.

## Files and ownership

| Area | Owns (edit freely) | Sections of the Teams list |
|---|---|---|
| core | `lib/app.js`, `lib/store.js`, `lib/tls.js`, `public/js/core.js`, `public/js/i18n.js`, `public/js/main.js`, `public/style.css`, `test.js` | — |
| chatux | `public/js/chatux*.js`, `public/css/chatux.css`, `lib/routes-chatux.js`, and the existing `public/js/render.js`, `public/js/composer.js`, `public/js/chat.js`, `lib/routes-chat.js` | 1, 7, 14, 15, 16 |
| people | `public/js/people*.js`, `public/css/people.css`, `lib/routes-people.js`, and the existing `lib/routes-activity.js` | 5, 6, 8 |
| shell | `public/js/shell*.js`, `public/js/lang-*.js`, `public/css/shell.css`, `lib/routes-shell.js`, and the existing `public/js/panels.js` (settings part), `desktop/main.js`, `desktop/preload.js`, `desktop/*.html`, `public/manifest.webmanifest`, `public/sw.js`, `scripts/build_desktop.py` | 2, 3, 4, 25 |
| calls | `public/js/calls*.js` (including the existing meeting window `calls.js`), `public/css/calls.css`, `lib/routes-calls.js`, `lib/routes-callx.js` | 17, 19, 20, 22 |
| meetings | `public/js/meetings*.js`, `public/css/meetings.css`, `lib/routes-meetings.js` | 18, 21, 23 |
| apps | `public/js/apps*.js`, `public/css/apps.css`, `lib/routes-apps.js`, and the existing `public/js/collab.js`, `lib/routes-collab.js` (notes, whiteboard, to-dos) | 10 |
| files | `public/js/files*.js`, `public/css/files.css`, `lib/routes-files.js`, `lib/routes-calendar.js` | 9, 12 |
| teams | `public/js/teams*.js`, `public/css/teams.css`, `lib/routes-teams.js`, `lib/routes-bots.js`, and the existing `lib/routes-admin.js`, `lib/routes-auth.js`, the admin part of `public/js/panels.js` | 11, 13, 24 |

Desktop: any area may add `desktop/ext-<area>.js` (loaded automatically, see below).

**Files owned by another area:** prefer an extension point. If there is no way around it, make a *small,
surgical* edit (a few lines, ideally adding a hook call the owner would want anyway), keep it away from big
rewrites, and list it under "Edits outside my area" in your `docs/features-<area>.md`. Never reformat or reorder
someone else's file.

**Shared files:**
- `public/index.html`: add `<script>`/`<link>` tags **only inside your own `<!-- area:x -->` block**. Area scripts
  load after the core scripts and before `main.js` starts the app, so register extensions at load time.
- Icons: list the extra icons you need in `scripts/icons/<area>.txt` (one name per line, add ` filled` to also get
  the filled variant), then run `node scripts/build-icons.js` (the icon package is in
  `/tmp/fluent/pkg/package/icons`; check a name exists with `ls /tmp/fluent/pkg/package/icons | grep <name>_20`).
  `public/js/icons.js` is generated; merge conflicts in it are fixed by running the script again.
- Strings: never edit `i18n.js`. In your own file call `LC.addStrings('en', { key: 'Text' })` (and
  `LC.addStrings('hi', {...})`, `LC.addStrings('es', {...})` when you can). New languages:
  `LC.addStrings('fr', {...}, 'Français')`, right-to-left: `LC.addStrings('ar', {...}, 'العربية', 'rtl')`.
  Prefix keys with your area to avoid clashes (`cx_`, `pp_`, `sh_`, `cl_`, `mt_`, `ap_`, `fl_`, `tm_`).
- CSS: put styles in `public/css/<area>.css`. Use the design tokens from `style.css` (`var(--bg)`, `var(--fg)`,
  `var(--muted)`, `var(--line)`, `var(--brand)`, `var(--card)`, `var(--hover)` …) so light, dark and high-contrast
  themes keep working. Prefix class names with your area when they are new (`.cx-…`).
- Data: store your data with `ctx.coll('<name>')` in collections you own (list yours in your features doc).
  Never rename or reshape another area's data.
- Tests: `tests/api-<area>.js` (server, via `tests/harness.js`) and `tests/ui-<area>.js` (Playwright).

## Server

### Route modules
Every `lib/routes-*.js` file is loaded automatically: `module.exports = (ctx) => { ... }`. Add routes to `ctx.api`:

```js
module.exports = (ctx) => {
  const { api, db, json, body, fail, str, canSee, emit, audience, store } = ctx;
  api['POST /api/thing/do'] = async (req, res, me, url) => {   // me = signed-in user (always set unless public)
    const b = await body(req, 4096);                             // parsed JSON body (limit in bytes)
    const chan = str(b.chan, 64); if (!canSee(me, chan)) fail(404, 'No such chat');
    const things = ctx.coll('things');                           // db.things, created on first use
    things[chan] = { ... }; store.save();                        // save after every change
    emit('thing', { chan, ... }, audience(chan));                // live event to the chat's members (null = everyone)
    json(res, 200, { ok: true });
  };
};
```

Routes are exact `METHOD /path` keys; pass ids in the query string or body. Extra modules load after the core ones
(`routes-auth`, `routes-admin`, `routes-chat`, `routes-collab`, `routes-calls`), so a module may *replace* a core
route by assigning the same key again — only do that for behaviour your area owns, and keep the old behaviour working. Public routes (no sign-in, e.g. an
incoming webhook) must be added with `ctx.publicRoutes.add('POST /api/hook')` and must check their own secret.

### ctx — the most used helpers
- Data: `db` (the snapshot: `db.users`, `db.channels`, `db.messages`, `db.files` …), `coll(name, init?)`,
  `store.save()`, `S` (session settings, `S.name` …), `P` (paths: `P.dir`, `P.uploads`).
- People: `userById(id)`, `pub(u, viewer)` (public user object), `isOwner(u)`, `isAdmin(u)`, `online(id)`,
  `adminIds()`, `presenceOf(u, viewer)`, `setAutoPresence(uid, 'call' | 'meeting' | 'presenting' | null)`.
- Chats: `validChan(chan)`, `canSee(u, chan)`, `audience(chan)`, `dmPeer(chan, me)`, `chanOut(c)`,
  `chanMsgs(chan)`, `msgById` (Map), `addMessage(m)`, `sysMsg(chan, text, { kind })`, `removeMessages(list)`.
  A DM channel id is `dm:<idA>:<idB>` with the ids sorted; `dm:<id>:<id>` is "notes to self".
- Events: `emit(name, data, userIds|null)`, `emitFor(name, (viewer) => data, ids)`, `emitUser(u)`. New client event
  names must be registered on the client with `LC.addEvents('name')` before `LC.on('name', fn)` works.
- Activity feed: `activity(userId, item)` (see "Activity items"). Never notifies people about their own actions.
- Timers: `ticks.push({ every: ms, fn: (now) => … })`.
- Misc: `rid(n)`, `str(v, max)`, `isObj(o)`, `rate(key, max, windowMs)` (returns false when over the limit),
  `fail(status, msg)`, `json(res, code, obj)`, `body(req, limit)`, `readBody(req, limit)`, `appVersion`.

### Hooks (`ctx.hooks.<name>.push(fn)`)
| Hook | Signature | Use |
|---|---|---|
| `beforeMessage` | `(m, body, me)` | add fields to a new message from the request body, or `fail()` to refuse it (bad-word filter, posting rules) |
| `afterMessage` | `(m)` | react to a stored message (activity items, bots, workflows, webhooks) |
| `afterReact` | `(m, me, emoji, added)` | reactions (activity items, workflows) |
| `afterJoin` | `(u)` | a new member joined (welcome bots, default teams) |
| `userFields` | `(u, viewer) => {...}` | extra public fields on people (job title, pronouns, out of office …) |
| `initExtra` | `(u) => {...}` | extra fields in the `init` event a client gets when it connects |
| `chanFields` | `(c) => {...}` | extra fields on channels sent to clients (description, picture, tabs …) |
| `canSee` | `(u, chan) => true/false/undefined` | channel visibility rules (teams, private channels); `undefined` = no opinion |
| `audience` | `(chan) => [ids]/null/undefined` | who receives a channel's live events (must match `canSee`) |
| `presence` | `(u, viewer) => state/undefined` | override presence (out of office, a timed status) |
| `callJoin` | `(me, chan, call, body, starting)` | `fail()` to refuse joining a call (lobby, locked meeting, roles) |
| `callEvent` | `(type, chan, call, uid)` | `'start'`, `'join'`, `'leave'`, `'end'` (call history, attendance, auto presence) |
| `callFields` | `(call) => {...}` | extra fields on the call state everyone receives |

Calls are exposed as `ctx.calls` (Map chan → call `{ id, mode, by, started, parts: Set, media, sharing, max? }`),
`ctx.callState(chan)`, `ctx.pushCallState(chan)` and `ctx.leaveCall(chan, uid)`. A call's size limit is
`call.max || S.maxCallSize || 8`.

## Client

Scripts share the global `LC`. Useful helpers from `core.js`: `el(tag, attrs, ...children)`, `$`, `LC.api(path, body)`
(POST JSON; GET when `body` is left out), `LC.on(event, fn)`, `LC.emitLocal(event, data)`, `LC.addEvents(...)`, `LC.t(key, vars)`,
`LC.icon(name, { filled })`, `LC.ibtn(icon, label, fn, opts)`, `LC.btn(...)`, `LC.menu(anchor, items)`,
`LC.modal(...)` / `LC.closeModal()`, `LC.toast(text, opts)`, `LC.avatar(user, size)`, `LC.presenceDot(user)`,
`LC.uname(id)`, `LC.chanInfo(chan)`, `LC.PRES_ICON` / `LC.presenceLabel(p)`, `LC.openChat(chan)`, `LC.prefs()` / `LC.setPrefs(patch)` (per-person settings
stored on the server), `LC.ui` / `LC.setUi(patch)` (this device only), `LC.ls` (localStorage), `LC.S` (state: `me`,
`users`, `channels`, `chan`, `calls` …). Read `core.js` before writing a helper that may already exist.

### Registries (`LC.ext`)
| Registry | Shape | Where it shows |
|---|---|---|
| `panes` | `key -> { icon, label, order, badge(), render(nav), main(host), action(), bottom, hidden() }` | left app bar; `render` draws the list column, `main` takes over the big area (like Teams' Calendar), `action` opens a dialog |
| `tabs` | `{ key, icon, label, order, when(chan), render(host, chan) }` | tabs above a chat |
| `msgParts` | `(m, o) => node` | extra content inside a message |
| `msgMenu` | `(m, o) => [items]` | message "More" menu |
| `chatMenu`, `userMenu`, `mainMenu`, `profileMenu`, `headerMenu` | `(...) => [items]` | the matching menus |
| `headerActions` | `(chan) => [buttons]` | chat header buttons |
| `composerMore`, `attachMenu` | `(composer) => [items]` | composer menus |
| `composerTools` | `(composer) => node` | buttons next to Send |
| `beforeSend` | `(body, composer, opts)` | add fields to an outgoing message |
| `mentionSources` | `(query, chan) => [{ label, insert, icon }]` | extra @mention suggestions |
| `settingsTabs`, `adminTabs` | `{ key, icon, label, order, render(), ownerOnly }` | new tabs in the Settings and Manage dialogs |
| `settingsSections`, `adminSections` | `{ tab, order, render(), ownerOnly }` | an extra section at the end of an existing tab (Settings tabs: `profile`, `appearance`, `notifications`, `people`, `emoji`, `about`; Manage tabs: `requests`, `people`, `settings`, `security`, `storage`, `blocked`, `cleanup`) |
| `composerBanner` | `(chan, composer) => node` | a strip above the message box (e.g. "Ana is out of office") |
| `commands` | `'/name' -> { help, run(args) }` | slash commands |
| `callPanels` | `{ key, icon, label, short, order, when(call), render(host, call) }` | meeting toolbar button + side panel |
| `callToolbar`, `callMore` | `(call) => [buttons / items]` | meeting toolbar / "More" menu |
| `beforeCall` | `async ({ chan, mode, joining }) => false \| { micId, camId, cam, muted, ...body }` | before a call starts (pre-join screen, lobby) |
| `rail` | `(railNode) => void` | after the app bar is drawn |

Menu items are `{ icon, label, fn, danger?, disabled? }` or `'sep'`. `LC.extItems(list, ...args)` runs a registry safely.
`LC.callApi` gives meeting modules the current call (`chan`, `me`, `local`, `participants()`, `state()`, `redraw()`,
`setPanel(key)`, `data()` for module state, `toggleMic()`, `toggleCam()`). Local events: `call:joined`,
`call:left`, `call:drawn`.

Functions exported on `LC` (`LC.shouldAlert`, `LC.alertMessage`, `LC.renderChats`, `LC.renderHeader`, `LC.renderRail` …)
are called through `LC`, so an area that owns that behaviour may replace them from its own file. Do this only for
behaviour your area owns.

### Desktop (`desktop/ext-<area>.js`)
```js
module.exports = (api) => {
  api.handle('people:jumpList', async (e, items) => { ... return result; });   // renderer: LC.native.invoke('x:people:jumpList', items)
  api.on('people:flash', (e) => api.getWin().flashFrame(true));                  // renderer: LC.native.send('x:people:flash')
  api.sendToWin('people:openChat', chan);                                        // renderer: LC.native.on('x:people:openChat', fn)
  api.onWindow((win) => { ... });  api.onArgs((argv, first) => { ... });           // new window; command line (also 2nd launch)
  api.addMenuItems([{ label: '…', click }]); api.addTrayItems([...]);  api.rebuildTray();
};
```
`api` also has `app, ipcMain, BrowserWindow, Menu, Tray, dialog, shell, screen, session, clipboard, nativeImage,
Notification, getWin(), getTray(), cfg(), save(), showMain(), USER, ROOT, PUBLIC, appIcon()`. Renderer side: `LC.native`
exists only in the desktop app (feature-detect it). The bridge only passes channels that start with `x:`.

## Shared data contracts

**Presence states** (`pub(u).presence`): `online` (Available), `busy`, `dnd`, `brb`, `away`, `offline`, plus automatic
`call` ("In a call"), `meeting` ("In a meeting"), `presenting` ("Presenting") and `oof` (Out of office). The people
area owns how these look and how people set them; calls and meetings only call `ctx.setAutoPresence()`.

**Activity items** (`ctx.activity(uid, item)`): `{ type, from, chan?, msg?, text?, ... }` with `type` one of
`mention`, `reply`, `reaction`, `missedCall`, `voicemail`, `added` (to a chat or team), `task` (assigned to you),
`meeting` (invite, update, starting now), `follow` (a followed thread), `urgent`, `approval`, `form`, `report`,
`system`. The people area owns the Activity pane, the notification rules (`LC.shouldAlert` / `LC.alertMessage`) and creates
`mention`, `reply` and `reaction` items (from the
`afterMessage`/`afterReact` hooks, using `u.follows` for followed threads). Other areas create items for their own
features.

**Messages**: `m.priority` = `'important' | 'urgent'` (chatux sets it; people decides how alerts behave, urgent
repeats every 2 minutes until read and gets through Do not disturb). `m.subject` = post subject line. `m.card` =
rich card `{ title, text, image, buttons: [{ label, url | action }] }` (teams area renders and handles card actions).
Threads: replies have `m.thread = rootId`. `u.follows = { [rootId]: 1 }`, `u.unfollows = { [rootId]: 1 }` (chatux
maintains them).

**Channels**: `c.kind` = `''` (channel) | `'group'` (group chat) | `'meeting'` (a meeting's chat, `c.meeting` =
meeting id) | `'posts'` (posts-style channel: each top-level message has a subject and its own replies; chatux
renders it). `c.team` = team id ('' = no team). Visibility always goes through `canSee`.

**Meetings** (meetings area, `db.meetings`): `{ id, title, organizer, start, end, allDay, tz, repeat: { freq:
'daily'|'weekly'|'monthly', interval, until, days }, invitees: [uid], rsvp: { uid: 'yes'|'maybe'|'no' }, chan,
details, passcode, lobby, created }`. API: `GET /api/meetings?from=&to=` (occurrences visible to me, each with
`{ id, occurrence, start, end, ... }`), `GET /api/meetings/get?id=`, `POST /api/meetings/create|update|cancel|rsvp`.
Client: `LC.meetings.schedule(prefill)` opens the "New meeting" form, `LC.meetings.open(id)` shows details,
`LC.meetings.join(id)` joins. The calendar app (apps area) shows these next to calendar events and uses
`LC.meetings` when it exists, so it must also work when meetings are missing.

**Files** (files area): `db.files[id] = { id, name, size, by, ts, ... }`; uploaded bytes in `P.uploads/<id>`. Messages
reference files as `m.files = [{ id, name, size, type? }]`. Other areas upload with `LC.upload(blob, name)` (client) and
may attach the result to a message.

**Calendar events** (files area): per chat in `db.extras[chan].events = [{ id, by, ts, title, start, end, notes, remind,
reminded }]` (written by `POST /api/event` in `routes-collab.js`; reminders by the tick there). The files area may extend
the event shape (all-day, repeat, category colour, location …) and take over `POST /api/event` from `lib/routes-calendar.js`
(re-assign the route). Keep old events readable. Per-chat notes, whiteboard and to-dos (`db.extras[chan].note/board/todos`)
belong to the apps area.

**Teams** (teams area, `db.teams`): `{ id, name, picture, description, owners: [uid], members: [uid], guests: [uid],
code, archived, created }`; a channel belongs to a team via `c.team`.

## Tests
- `node test.js` — core server suite (must stay green).
- `node tests/run-api.js [filter]` — every `tests/api-*.js` file (the harness gives each a fresh server on a free port).
- Browser tests: Playwright (`require('playwright')`; Chromium is preinstalled; never run `playwright install`). Launch
  with `{ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }` for calls. Use your
  area's port range for servers: chatux 4100–4199, people 4200–4299, shell 4300–4399, calls 4400–4499, meetings
  4500–4599, apps 4600–4699, files 4700–4799, teams 4800–4899. Electron debugging ports: chatux 9511–9519, people
  9521–9529, shell 9531–9539, calls 9541–9549, meetings 9551–9559, apps 9561–9569, files 9571–9579, teams 9581–9589.
  Temporary folders: put them under `os.tmpdir()` with your area name in them.
- Desktop tests (Linux, under `xvfb-run`): Electron is at `/tmp/elec/lin/node_modules/electron/dist/electron`; build an
  app folder with `desktop/*` + `lib/` + `public/` + `package.json` (see `tests/README.md`, `tests/electron-*.js`).
- Existing browser suites that must keep passing: `tests/ui-smoke.js`, `tests/ui-features.js`, `tests/ui-cleanup.js`,
  `tests/ui-https.js`, `tests/a11y.js` (axe-core accessibility scan).
