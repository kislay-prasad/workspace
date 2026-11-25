# Teams area: teams and channels, bots and automation, admin and security

Sections 13, 11 and 24 of the Teams list. Status key:
- ✅ done
- 🟡 partial (what's missing is said)
- ❌ not done (why)

Files:
- Server: `lib/routes-teams.js` (teams and channels), `lib/routes-teams-admin.js` (admin and security),
  `lib/routes-bots.js` (bots and automation). I also edited the existing `lib/routes-auth.js` (sign-in) and
  `lib/routes-admin.js` (Manage).
- Client: `public/js/teams.js` (Teams pane and channels), `teams-admin.js` (Manage dialog), `teams-auth.js` (sign-in
  and Settings › Security), `teams-bots.js` (cards, connectors, Bots/Workflows/Developer), `public/css/teams.css`,
  `scripts/icons/teams.txt`.
- Tests: `tests/api-teams.js` (33 sections) and `tests/ui-teams.js` (24 browser steps; with `AXE_JS` set it also runs
  axe-core on every new screen).

## 13. Teams and channels

| | Feature | Where / how |
|---|---|---|
| ✅ | Several teams; **Teams** pane | App bar → **Teams**. Each team shows its picture or initials tile, name, ⋯ menu, and its channels underneath. Unread channels are bold; @mentions show a red `@N` badge; the app bar shows the total mentions. Teams can be collapsed (remembered on this device). |
| ✅ | Picture, description, owners, members, guests | Team ⋯ → **Manage team** (big area): Members tab (owners and members/guests; owners change Owner ↔ Member or remove people), Settings tab (picture, name, description, privacy, label). Pictures are small `data:` images (never garbage-collected uploads). |
| ✅ | Join code | Manage team › Settings › **Team code**: Generate / Copy / Turn off (owners only see it). Join or create a team → **Join a team with a code**. Code guessing is rate-limited (10 tries per 10 minutes). |
| ✅ | Team settings | Manage team › Settings, enforced on the server: members create/update channels, create private channels, delete channels, add apps/connectors, add people (public teams), manage tags; guests create/delete channels; @team / @channel; stickers and memes; show a private team in the directory. |
| ✅ | Templates (Project, Event, Class, Friends) | **Create a team** (＋ in the pane or the card on Join or create): pick a template → details → add members. Templates create their channels (some are posts-style or "only moderators post") and fill the General channel's Notes and Tasks tabs. If the apps area provides `ctx.addTab`, it is called too. |
| ✅ | Join or create a team | Pane header button (people icon) → big-area page with Create a team, Join with a code, and a searchable grid of public teams (**Join**) and discoverable private teams (**Request to join** with an optional note; **Cancel request**). Owners get an activity item and answer in Manage team › **Pending requests**. |
| ✅ | Archive / delete | Team ⋯ → **Archive team** (owners): read-only for everyone (messages, reactions, pins, polls, notes, whiteboard, tasks, events are refused). It moves to an **Archived teams** section and can be restored there. **Delete the team** removes its channels, messages and files (legal-hold messages are kept). |
| ✅ | Private and shared channels | Team ⋯ → **Add channel**: Standard / Private (chosen team members) / Shared (chosen people, also from outside the team). Channel owners and team owners manage members (Manage channel › Members, *Make channel owner*). Outsiders in a shared channel see only that channel and the team's name and picture, never its members. |
| ✅ | Leave team | Team ⋯ → **Leave the team**. The last owner must name another owner first. Private-channel access goes with it. |
| ✅ | Session-wide channels keep working | Untouched unless a rule is configured (`c.team === ''`). Guests see one only if an admin adds them. |
| ✅ | Channel description and picture | Channel ⋯ or header ⋯ → **Manage channel**. The picture replaces the team tile in lists and the header. Works for session-wide channels too (admins). |
| ✅ | Get link to a channel / team | Channel ⋯ / team ⋯ → **Get link** (`<address>/#c=<chan>`, `#team=<id>`). Links are handled after `init` and on `hashchange`; access is checked ("That link isn't available to you" for non-members). |
| ✅ | Show / hide channels | Channel ⋯ → **Hide** (per person, stored on the server, synced to your other devices). Hidden ones are under "N hidden channels". Teams can be hidden too (Hidden teams section). General can't be hidden. |
| — | Channel tabs (add, rename, reorder) | Done by the apps area ("Add a tab" gallery), not here. |
| ✅ | Posts-style channels | Add channel / Manage channel → **Layout: Posts or Chat** (`c.kind = 'posts'`; chatux renders posts and subjects). |
| ✅ | Post in several channels | Message box ⋯ → **Post in multiple channels**. A strip shows the chosen channels. The server makes copies only where you may post; each copy carries `m.xpost = { id, chans }` and shows "Posted in N channels · Also in …". |
| ✅ | Who can post / reply | Manage channel › **Moderation**: who starts new posts (everyone / only moderators: owners plus a moderators list), whether members can reply. Enforced in `hooks.beforeMessage`; only team owners or channel owners can change it. Members see a strip explaining it. |
| 🟡 | Tags (`@designers`) | Manage team › **Tags** (owners, or members if allowed); session-wide tags in Manage › Teams (admins). `@tag` notifies its members who can see the chat (`m.mentions`, `m.tags`). Tags, `@team` and `@channel` are suggested in the message box. *Missing:* in message text they show as plain text, not highlighted (chatux's renderer only highlights people and @everyone). |
| ✅ | `@channel` and `@team` | Notify everyone who can see the channel (`m.everyone`, `m.mentionAll`). Rights: admins and team owners always; members if the team setting allows (default on); never guests; outside teams like @everyone. |
| ✅ | Channel statistics | Channel ⋯ → **Channel analytics** (admins, team owners, channel owners), and Manage team › **Analytics** for the whole team: 7/30/90 days, messages-per-day chart, messages, posts, replies, reactions, files, active people, top posters. |
| ❌ | Channel email addresses | Not possible offline (as briefed). |

## 11. Bots and automation

| | Feature | Where / how |
|---|---|---|
| ✅ | Incoming webhooks | Channel ⋯ → **Connectors and webhooks** → **New incoming webhook** (name, picture). The secret address is shown once, with a curl example; the key is stored as a salted scrypt hash and checked in constant time. `POST {text, title, card}` posts as the webhook (a hidden bot user with a **Bot** badge). Rate-limited (30/min per webhook, 120/min per address). **New secret**, on/off, delete. Members may add them when the team allows apps; outside teams, admins only. |
| ✅ | Outgoing webhooks | Same dialog → **New outgoing webhook** (admins and team owners): name + http(s) address; the HMAC token is shown once. `@Name` in that channel → JSON POST signed `Authorization: HMAC <base64>` (+ `X-LANChat-Signature: sha256=<hex>`), 5 s timeout, 64 KB answer limit; `{text, card}` answers are posted as a thread reply. Errors are kept on the webhook (Connectors list and Manage › Bots) and admins get an activity item (at most one per 10 minutes per webhook). |
| ✅ | Simple bots | Manage › **Bots**: name, picture, replies ("contains a word" or a regex, checked with a 50 ms time limit, in every chat the bot is in / its 1:1 chats / one channel, `{person}` placeholder), and welcome messages for new people (`hooks.afterJoin`) in #general and/or as a 1:1. Bots are users with `bot: true`: "Bot" badge, always Available, can't sign in (their names are refused at sign-in and in approvals). Bots never read other people's 1:1 chats. |
| ✅ | Workflows | Manage › **Workflows**: when a message is posted (channel, words), someone joins the session or a team, a reaction is added, on a daily/weekly schedule, or someone runs it from the message box. Then: post a message or card, send a 1:1, add the person to a team or channel/group, create a task (uses `ctx.createTask` / `ctx.apps.createTask` when the apps area offers it, else the built-in Tasks tab), call a webhook. The list shows on/off, runs, last run and the last error; **Run now** to test. Posts come from a "Workflows" bot. |
| ✅ | Rich cards with buttons | `m.card = {title, text, image, facts, buttons}` rendered in messages (`LC.ext.msgParts`). Buttons open a link, post a reply in the thread, or call back the outgoing webhook / workflow / API bot that sent the card (`POST /api/tm/card/action`). Unsafe links and SVG pictures are refused; only bots can make call-back buttons. |
| ✅ | Message extensions | Message box ⋯ → **Create a card** (title, text, picture, facts, link/reply buttons) and **Workflow: <name>** for workflows set to "run from the message box" (optionally asking a question first). |
| ✅ | Developer guide and API keys | Manage › **Developer**: create/revoke API keys tied to a bot (existing or new) with scopes read/post; shown once, stored hashed. `x-api-key` requests act as that bot only in chats it belongs to (`/api/bot/me`, `/chats`, `/messages`, `/send`, `/events`). The **Developer guide** link opens `docs/API.md`. |
| ❌ | Power Automate, Microsoft Graph, Microsoft 365 connectors | Not possible (as briefed). |

## 24. Admin and security (Manage dialog)

The Manage dialog now has a side list of tabs, Teams-admin-centre style; on phones they scroll sideways.

| | Feature | Where / how |
|---|---|---|
| ✅ | Activity log of admin actions | Manage › **Compliance › Activity log**: who, action, details, time. Filter by person, action and dates; **Download CSV**. `ctx.audit(me, action, details)` is defined in `routes-admin.js` and records every existing admin action (approvals, removals, roles, time-outs, deletions, clean-up, settings, backup/restore, encryption…) plus all of mine. Other areas call `ctx.audit && ctx.audit(…)`. Keeps the last 5,000 entries. |
| ✅ | Usage reports | Manage › **Usage**: people, active people per day, messages per day, calls and minutes (from `db.callLog`), files and storage; 7/30/90 days; SVG bar charts; **Download CSV**. Daily activity is recorded from connections and messages (`db.tmUsage`). |
| ✅ | Messaging rules | Manage › **Policies › Messaging rules**: editing / deleting on or off, a time limit in minutes, stickers, memes, GIFs. Stored in `S.messagingRules`. Edit/delete and the time limit are enforced by wrapping `POST /api/edit` and `/api/delete` (admins exempt); chatux enforces stickers/memes/GIFs and hides the buttons. Teams can also turn stickers and memes off. |
| ✅ | Meeting rules | Manage › **Policies › Meeting rules**: who can record, who can present, who can bypass the lobby, maximum people per call, watermark. Stored in `S.meetingRules` with the calls/meetings field names. The calls and meetings areas enforce them (this module doesn't duplicate the size limit). |
| ✅ | Bad-word filter | Manage › **Policies › Bad-word filter**: a word list matched as whole words in any case; block with an explanation, or replace with `***`. Applies to messages, edits, subjects and cards; channel, team and tag names are always refused. |
| ✅ | Report a concern | Message ⋯ → **Report this message**; a person's menu or contact card → **Report <name>**: reason + note. Admins get a `report` activity item (it opens Manage › Reports) and a badge on Manage. **Reports** inbox: snapshot of the message, **Open in chat** (when the admin may see it), **Delete message** (also in chats the admin can't open), **Time out 1 hour**, **Remove person**, **Dismiss**, Reopen, "Show handled reports". |
| ✅ | Export / legal hold | Manage › **Compliance** (host only): **Put on hold** / Remove hold, **View held items**; export a person's messages as a zip (`messages.json`, readable `messages.html`, the files in their messages, held originals and held files). While on hold, their messages are kept from clean-up, timers and channel deletion (`hooks.keepMessage`, also thread posts their replies belong to). Edits and deletes copy the original (and deleted files) into the hold archive. Also in each person's Actions menu. |
| ✅ | Information barriers | Manage › **Policies › Information barriers**: segments of people and blocked pairs. Enforced on new 1:1 and group messages, new group chats, adding people to groups or teams, forwarding into a 1:1, and calls (`hooks.beforeMessage`, `hooks.callJoin`). People on the other side are hidden from each other's lists and pickers (`removed`/`barrier` on the user object they receive). |
| ✅ | Sensitivity labels | Manage › **Policies › Sensitivity labels** (editable: name, colour, protection level, description; General / Confidential / Highly confidential to start). Set on a team (Manage team) or channel (Manage channel); a badge shows in the chat header. Confidential: forwarding outside the team is refused, and `ctx.allowAnyoneLink(me, chan, fileId)` returns false for the files area. Highly confidential: guests can't be added. |
| ✅ | Bulk add from CSV | Manage › **People › Bulk add people**: upload or paste CSV (name, role, job title, department). Each row gets a one-time invite code (valid 7–90 days; link `<address>/#invite=CODE` fills in the name) or a pre-approved name. They join without waiting; role, job title and department are applied (job title/department go into the people area's `u.profile`). **Download codes (CSV)**; the Invitations list shows used/expired with **Revoke**. |
| ✅ | Guest accounts | Manage › People › Actions → **Make guest / Make member**; invited guests via bulk add. Guests have a **Guest** badge. They see only the teams, group chats and channels they're added to (Actions → **Channel access…** for session-wide channels, and live events follow that). They can't create teams, channels or group chats, join teams by code, or use @everyone/@here/@team. Teams list guests separately. |
| ✅ | PIN or password + 2-step check | Profile menu → **Security and devices**, or Settings › **Security**: set a PIN (4–12 digits, not trivial) or password (8+ characters), stored as a salted scrypt hash. Optionally add an authenticator app (TOTP, RFC 6238, works offline; QR code via `public/qrcode.js`; codes can't be reused). Signing in by name on a new device then asks for the PIN (and code) before the host's approval. With the host's setting (Manage › Settings › **Sign-in with a PIN**) a correct PIN signs in straight away. 5 wrong tries lock the account for 10 minutes (20 per address). Admins: Actions → **Reset sign-in PIN**. |
| ✅ | Signed-in devices | Manage › People › Actions → **Signed-in devices…** (and for yourself in Settings › Security): device, address, first and last seen; **Sign out** one or **Sign out everywhere** (open connections are dropped, so a removed device is refused at once). "Last seen" updates when the app is opened on that device. |
| ✅ | Team naming and expiry | Manage › **Teams**: prefix/suffix and blocked words for team names (admins exempt); "archive teams unused for N days" with a warning N days before. Owners get an activity item and a strip with **Renew**; expired teams are archived (renew restores them). |
| ✅ | Call quality dashboard | Manage › **Usage › Call quality**: calls, average length and people, ratings (average + 1–5 chart), round trip, packet loss (%), jitter, poor calls (rating ≤ 2, loss > 5 % or RTT > 400 ms), recent calls. Shows "No call data yet" when `db.callLog` is empty. |
| ✅ | Watermark on shared screens | The setting is in Meeting rules (`S.meetingRules.watermark`); the calls area draws it. |
| ✅ | Branded lobby | Manage › Settings › **Branded lobby** (host): logo, colour, welcome text. Shown on the sign-in screen and the "waiting for approval" screen (`/api/config` `brand`, logo at `/api/tm/brand/logo`). The meetings area's lobby wait box gets the same logo and text, added from `teams-auth.js` without editing their code. `LC.tmBrand` holds it for other areas. |
| ❌ | Microsoft Purview/Entra, chatting with real Teams/Skype users | Not possible (as briefed). |

## Data owned here
- `db.teams` (shared contract): `{ id, name, picture, description, owners, members (includes owners), guests, code, visibility, settings, archived, archivedWhy, created, by, template, label, general, active, warned, requests: [{ uid, ts, note }] }`.
- Team channels in `db.channels`: `team`, `kind ('' | 'posts')`, `general`, and for private/shared channels `private`/`shared`, `members`, `owners`.
- Optional fields on any channel: `description`, `picture` (data URL), `postRule`, `replyRule`, `moderators`, `label`.
- Collections:
  - teams and channels: `db.tmTags`, `db.tmPrefs` (hidden channels/teams per person), `db.tmGuestChans`;
  - admin and security: `db.tmConfig` (labels, naming, expiry, bad words, barriers, branding, PIN policy, who creates teams), `db.tmAudit`, `db.tmUsage`, `db.tmReports`, `db.tmHolds`, `db.tmHoldArchive` (+ held files in `<data>/hold/`), `db.tmInvites` (codes hashed), `db.tmAuth` (PIN hashes, TOTP secrets), `db.tmDevices`;
  - bots: `db.tmBots`, `db.tmHooks` (incoming keys hashed; outgoing HMAC tokens), `db.tmFlows`, `db.tmKeys` (hashed), `db.tmBotEvents`, `db.tmBotMeta`.
- Session settings: `S.messagingRules`, `S.meetingRules` (contract).
- Fields on other areas' objects:
  - users: `u.bot`, `u.botKind`; role `guest`;
  - messages: `m.card`, `m.bot { kind, id }`, `m.xpost`, `m.tags`, `m.tagMentions`, `m.mentionAll`.
- "Start fresh" clears all of the above except the activity log and policies.

## New API routes
- Teams and channels:
  - `POST /api/teams/create`, `update`, `code`, `join` (`{id}` or `{code}`), `request` (`{id, note, cancel}`), `requests/decide`, `members` (`{add, remove, roles}`), `leave`, `archive`, `delete`, `renew`, `channel`, `hide`, `tags`
  - `GET /api/teams/get`, `directory`, `stats` (`?chan=` or `?team=`, `&days=`)
- Admin:
  - `GET|POST /api/tm/admin/policies`
  - `GET /api/tm/admin/teams`, `POST …/teams/act`
  - `GET /api/tm/admin/audit` (`?csv=1`), `usage`, `callquality`
  - `GET /api/tm/admin/reports`, `POST …/reports/act`
  - `GET /api/tm/admin/holds`, `hold/items`, `export`; `POST …/hold`
  - `POST /api/tm/admin/bulk`; `GET …/invites`, `POST …/invites/revoke`
  - `GET|POST /api/tm/admin/guestchans`
  - `GET /api/tm/admin/devices`, `POST …/devices/signout`; `POST …/pin/reset`
- Everyone:
  - `POST /api/tm/report`
  - `GET /api/tm/me/security`, `POST /api/tm/me/pin`, `pin/remove`, `totp/start`, `totp/confirm`, `totp/off`
  - `GET /api/tm/me/devices`, `POST …/devices/signout`
  - `GET /api/tm/flows/manual`, `POST /api/tm/flows/run`, `POST /api/tm/card/action`
  - `GET /api/tm/hooks`, `POST /api/tm/hooks/create`, `regen`, `update`, `remove`
  - `GET /api/tm/docs/api`
- Bots admin:
  - `GET /api/tm/admin/bots`, `POST …/bots/save`, `bots/remove`
  - `GET /api/tm/admin/flows`, `POST …/flows/save`, `toggle`, `remove`, `test`
  - `GET /api/tm/admin/keys`, `POST …/keys/create`, `keys/revoke`
- Public (each checks its own secret or is harmless):
  - `POST /api/hook/in`
  - `GET /api/bot/me`, `chats`, `messages`, `events`; `POST /api/bot/send` (all `x-api-key`)
  - `GET /api/tm/brand/logo`
  - `GET /api/tm/invite?code=` (rate-limited)
- Changed:
  - `POST /api/join`: invite codes, PIN/TOTP step, device records, bot names refused, 401 for an expired token.
  - `GET /api/config`: adds `brand`.
  - `POST /api/admin/user/role`: admins switch member ↔ guest; the host still makes admins.
  - `GET /api/admin/users`: adds `hasPin`, `tmHeld`, `bot`.

## Live events (client)
`team`, `team_removed`, `tm_prefs`, `tm_tags`, `tm_config`, `tm_reports`, `tm_flows` (all registered with `LC.addEvents`).
`init` also carries `teams`, `tmPrefs`, `tmTags`, `tmCanCreateTeams`, `tmCfg` and `tmReportsOpen`.

## For other areas
- **Server helpers:**
  - `ctx.audit(me, action, details)`
  - `ctx.teamOf(chan)`, `ctx.teamMembers(teamId)`
  - `ctx.sensitivity(chan) → { level, label, anyoneLinks }`, `ctx.allowAnyoneLink(me, chan, fileId)`
  - legal hold is a `hooks.keepMessage` rule, so it also protects files referenced by held messages
- **Client:**
  - `LC.tm` (team store, dialogs), `LC.teams.open(id)` (used by the Activity pane), `LC.tmUi` (small form/chart helpers), `LC.tmBrand`
  - activity types `report` (registered) and `added`/`system` items carrying `team` and `chan`
- **Wrapped from my modules (behaviour kept):**
  - routes: `POST /api/channel`, `/api/channel/update`, `/api/channel/delete`, `/api/channel/members`, `/api/edit`, `/api/delete`, `/api/forward`; and, so archived teams are read-only, `/api/note`, `/api/board/*`, `/api/todo`, `/api/event`, `/api/react`, `/api/pin`, `/api/poll/vote`
  - client: `LC.chanInfo` (team channel title/topic), `LC.chatLead` (team tile), `LC.chatInfo` (team channels open Manage channel), `LC.openChat` (people without #general never land on it), `LC.adminPanel` (side tabs), the Manage pane badge (adds open reports), and `window.fetch` for `POST /api/join` only (adds the invite code / PIN / code fields; main.js is unchanged)

## Edits outside my area
- `public/index.html`: three `<script>` tags inside my own `<!-- area:teams -->` block.
- `public/js/panels.js`: the admin part, which is mine. Two hook points in Manage › People rows: `LC.adminUserItems` (extra Actions) and `LC.adminUserPills` (Bot / PIN pills).
- `public/js/icons.js`: regenerated by `scripts/build-icons.js` (my list is `scripts/icons/teams.txt`).
- `lib/routes-calls.js` (calls area): one line in `ringStart`. Calls started in a channel (a team channel, or a session-wide channel) no longer ring everyone. Group chats, meeting chats and 1:1 calls ring as before. Without it, a call in a team channel rang the whole team and left everyone a "missed call". Once guests exist, a call in #general would have rung the whole session, because the audience of session-wide channels then has to be listed explicitly.
- No edits to core files (`lib/app.js`, `core.js`, `main.js`, `i18n.js`, `style.css`).
- Data written in other areas' formats:
  - Bulk add writes `u.profile.jobTitle/department` (the people area's profile).
  - A template's new General channel gets starter Notes and Tasks in `db.extras[chan]` (the apps area's existing format), only for brand-new channels.
  - A workflow's "create a task" step uses the same format when the apps area offers no `ctx.createTask`.

## Known gaps and notes
- `@tag`, `@team` and `@channel` work (notifications, mention counts, activity) but aren't highlighted in the message text (chatux's renderer).
- The header of a *private* team channel shows its member count and names (chat.js), not the team name.
- Outgoing webhooks and workflow webhooks verify HTTPS certificates, so a LAN service with a self-made certificate
  should use `http://`.
- The bot API can't upload files.
- `tests/ui-features.js` prints two "ERR_INTERNET_DISCONNECTED" console errors from its offline step. The same
  happens on `main`, so they don't come from this branch.
- `tests/ui-calls.js` sometimes logs Chromium's "VideoFrame was garbage collected" warning (calls area).

## Tests
- `node tests/api-teams.js`: 33 sections.
  - Teams: visibility for outsiders (messages, files, search, live events, init), channel calls that don't ring everyone, codes and requests, private and shared channels, guests, moderation and archive, tags, @team, cross-posting, hiding, analytics.
  - Admin: activity log, messaging rules, bad words, information barriers, labels, reports, legal hold and export, bulk add, PIN + TOTP, devices, naming and expiry, usage and call quality, branding, admin teams.
  - Bots: incoming webhooks (hashed key, rate limit, regenerate), outgoing webhooks (HMAC check against a local server, card call-backs, errors), simple bots, workflows (every trigger), user cards, API keys (hashed, scopes, membership, revoke).
- `node tests/ui-teams.js`: 24 browser steps on ports 4820+. Screenshots go to `/tmp/teams-shots/`. With `AXE_JS=…` every new screen is checked for 0 axe violations (the Manage team view also in dark).
