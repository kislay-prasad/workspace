# LANChat

Private, Microsoft Teams–style chat and meetings for you and your friends. **Everything stays on the host's computer** — no
accounts, no cloud, no internet needed.
One person *hosts a session* (and is its admin); friends join from the desktop app or any browser on the same Wi-Fi, and the host
approves every person before they get in.

## Quick start (desktop app, Windows)
1. Unzip, double-click **LANChat.exe**. (If Windows warns: right-click the `.zip` → Properties → **Unblock** before unzipping. Allow *Private networks* in the Firewall prompt.)
2. First launch opens **Sessions**: *Create a new session* (you become the host/admin) or pick a friend's session from the list.
3. **Invite** (top bar) shows a QR code and two addresses: an `https://…` link for phones and browsers, and the plain address for
   the LANChat app (*Sessions → Join a session*, or it appears under *Find sessions on this Wi-Fi*).
4. Each new person waits on a "Waiting for approval" screen until you approve them (**Manage** in the left app bar, or the notification).

**Phones and browsers:** the first time they open the `https://` link the browser warns *"Your connection is not private"* — that is
expected (the session makes its own certificate). Tap **Advanced → Proceed** (iPhone: **Show details → visit this website**). The
secure link is what lets browsers use the microphone, camera and screen sharing; on the plain `http://` address LANChat offers a
**Switch to the secure page** button that keeps you signed in.

Closing the window keeps hosted sessions running in the tray. *Quit* stops them. Your data is in `%APPDATA%\LANChat`.

## Running without the desktop app
```bash
node server.js            # Node 18+; prints the address for friends and a private HOST link for you
```
Options (environment): `PORT`, `DATA_DIR`, `SESSION_NAME`, `PASSCODE`, `REQUIRE_APPROVAL=0` (open join — not recommended),
`ADMIN_KEY`, `DB_PASSPHRASE` (unlock an encrypted history), `TRUST_PROXY=1`, `PUBLIC_URL` (printed in the host link),
`HTTPS=0` (turn off the built-in `https://` — the same port answers both `http://` and `https://`).
Docker / Render files are included for an always-on server (see *Hosting beyond your Wi-Fi*).

## Who can do what
| | Host (owner) | Admin | Member |
|---|---|---|---|
| Approve / deny / block join requests | ✔ | ✔ | |
| Remove people, time them out (mute) | ✔ | ✔ (not admins) | |
| Delete anyone's messages, pin, post in read-only channels | ✔ | ✔ (not the host's) | |
| Create/rename/delete channels, manage groups | ✔ | ✔ | if allowed |
| Promote/demote admins, change session settings | ✔ | | |
| Passcode, retention, backup/restore, encryption, internet sharing | ✔ | | |

The host proves ownership with a private **admin key** (in the `#k=…` part of the host link; the desktop app handles this for you).
Lost your browser data? Open the host link again.

## Features
**Looks and works like Teams** — top bar with search and your status · left app bar (Activity, Chat, Calls, Saved, Manage,
Settings) · chat list with last-message previews and "Recent" sorting · conversation header with call buttons and tabs · message
cards (yours on the right) with a hover bar for reactions/reply/more · Microsoft's Fluent icon set · phone layout with a bottom bar.

**Meetings** — full-window meeting stage (gallery, or the other person big with you in the corner) · camera, mic, raise hand,
reactions, participants panel, device settings (mic/camera/speaker), full screen, a small movable window while you keep chatting ·
**screen sharing shares your whole screen by default** in the desktop app (the ⌄ next to Share picks a screen or one window, and
"Include computer sound" on Windows) · while someone presents, their screen fills the stage and everyone's video moves to a strip
on the side (one presenter at a time; the presenter's camera stays on) · Teams shortcuts: Ctrl+Shift+M mute, Ctrl+Shift+O camera,
Ctrl+Shift+K raise hand, Ctrl+Shift+H leave. In a browser, the browser's own picker opens on *Entire screen*.

**Host controls** — approval before joining · remove / block (by name, device, address) · room passcode · admins · read-only
"announcement" channels · mute/time-out · rename/delete channels & groups, add/remove group members · auto-delete after N days
+ storage usage report · one-click backup & restore (zip) · optional AES-256-GCM encryption of the history file.

**Messaging** — channels, private groups, 1:1 chats · @mentions & @everyone · threads · pins · saved messages · forwarding ·
delivered/seen ticks (and "seen by", switchable off) · scheduled & disappearing messages · polls & quizzes · tic-tac-toe ·
Markdown (bold, italic, strike, code, lists, quotes) · drafts · edit history · slow mode · custom emoji & stickers ·
link previews (off by default; host fetches the page title).

**People** — profile photo, status, color, nickname (private), favorites · online / away / do-not-disturb / invisible ·
per-chat mute, pin, archive, quiet hours.

**Files & media** — multiple files with progress bars · drag a whole **folder** (zipped automatically) · big photos compressed ·
Files tab · image lightbox with swipe · built-in PDF viewer · voice messages · screen/camera clips.

**Collaboration** — calls for up to 8 people (peer-to-peer, never through a server) · shared notes (with conflict detection) ·
live whiteboard · to-do lists · calendar with reminders.

**Everywhere** — search with filters (person, chat, date, type) · jump to date · "New messages" divider · quick switcher
(Ctrl/⌘+K) & shortcuts · light / dark / high-contrast themes, accent color, text size, compact layout, wallpapers, reduced motion ·
English, हिन्दी, Español (admin screens are mostly English) · installable on phones (PWA) · offline queue that sends when you reconnect.

**Desktop app extras** — several sessions at once (host some, join others) · tray icon · taskbar unread badge · native
notifications · start with Windows · encrypted sessions prompt for a passphrase · *Connection help* diagnostics ·
update from a folder you trust · optional **Share over the internet** (see below).

## Security notes (read this)
* Browsers on the `https://` link get an encrypted connection (with a self-made certificate, hence the one-time warning). The desktop
  app and the plain `http://` address are unencrypted on your Wi-Fi — use a trusted network. Approval + passcode keep strangers out.
* Calls, voice messages and screen sharing need a "secure context": the `https://` link in browsers, or the desktop app (which asks
  to restart once the first time you join a friend's session). Calls themselves are always encrypted (WebRTC).
* Encryption-at-rest protects the history file only; uploaded files are stored as normal files. Forget the passphrase = history is gone.
* Blocking by device/address is best-effort (people can change them). The approval step is the real gate.
* **Share over the internet** (optional, off by default) starts a free Cloudflare quick tunnel: a public link anyone could try. LANChat
  forces approval + a passcode while it is on. This feature talks to Cloudflare and downloads `cloudflared` (checksum-verified).
* "Update from a folder" runs code from that folder as part of the app — only use folders from people you trust.
* The desktop and server code are original; third-party parts are listed in `LICENSE-NOTICES.txt`.

## Hosting beyond your Wi-Fi
* **Easiest:** *Chat → Share over the internet…* in the desktop app (works while your computer is on).
* **Always-on:** `docker compose up -d` on any always-on machine, or `render.yaml` for Render. Note: free hosting tiers have no
  persistent disk, so history would be lost on restart — use a plan with a disk (the blueprint asks for one). Set `PUBLIC_URL` and
  read the host link from the logs. Netlify/Vercel/GitHub Pages only host static files and **cannot** run LANChat.

## Limits
Messages up to 8,000 characters · files up to 100 MB (host can change) · group calls up to 8 people (mesh) · history is one JSON snapshot
(fine for hundreds of thousands of messages; not a database) · no GIF search (needs internet + an API key) · no linking of separate sessions.

## Development
```bash
node test.js                              # server test suite (security-critical paths, ~36 sections)
node tests/ui-smoke.js                    # browser tests (Playwright): ui-smoke, ui-features, ui-https, ui-cleanup, a11y (axe)
node scripts/build-icons.js <icons dir>   # regenerate public/js/icons.js from @fluentui/svg-icons
python scripts/build_desktop.py --platform win32   # also: linux, darwin-arm64, darwin-x64 -> dist/*.zip
```
Layout: `lib/` server (zero dependencies) · `public/` web client · `desktop/` Electron shell · `server.js` CLI entry.
