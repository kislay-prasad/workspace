# People area — presence and status, people and profiles, activity and notifications

Sections 5, 6 and 8 of the Teams list. Files: `lib/routes-people.js`, `lib/routes-activity.js`, `public/js/people.js`
(presence, status panel, dialogs, settings, composer strip), `public/js/people-card.js` (contact card, People pane),
`public/js/people-activity.js` (Activity pane, notification rules, quick reply), `public/css/people.css`,
`desktop/ext-people.js`, `scripts/icons/people.txt`, tests `tests/api-people.js`, `tests/ui-people.js`, `tests/electron-people.js`.

✅ done · 🟡 partial · ❌ not done

## 5. Presence and status

| | Feature | Where / how |
|---|---|---|
| ✅ | Busy, Be right back, Appear away (and Available, Do not disturb, Appear offline, Reset status) | Click your picture (top right) → the status row → pick a state. "Reset status" goes back to automatic (Available, Away after 5 minutes idle). |
| ✅ | Status for a set time ("Duration": 30 min, 1 hour, 2 hours, today, this week, custom) | Status panel → Duration. The server resets it to automatic when the time is up (`presenceUntil`, checked every 10 s). The panel shows "Busy · until 4:30 PM". |
| ✅ | Status message with "Clear after" (never, today, 1 hour, 4 hours, this week, custom) and "Show when people message me" | Status panel → Set status message: up to 280 characters, quick emoji choices, the two options. Cleared by the server on time. |
| ✅ | Status message shown when someone writes to you | A strip above the message box in a 1:1 chat (`LC.ext.composerBanner`): the person's status message (if they chose "show when people message me"), or "is out of office until …" with their message, or "is in Do not disturb / presenting". Each strip can be dismissed. |
| ✅ | Automatic In a call / In a meeting / Presenting | Server-side from `ctx.calls` (callEvent hook + a 3 s tick; a screen share is picked up immediately): in a call → `call`; `call.meeting` set → `meeting`; `call.sharing === uid` → `presenting`; and from `db.meetings` happening now (organizer + invitees who didn't decline; one-off, daily, weekly and monthly repeats). A manual Do not disturb always wins; Presenting beats a manual Busy; a manual Busy beats In a call / In a meeting; automatic states beat Be right back / Appear away / Out of office. |
| ✅ | Every state looks right everywhere | `LC.PRES_ICON`, `LC.presenceLabel` and `.dot.<state>` colours for all 11 states (green / red / red with bar / yellow / purple OOF arrow / grey). Labels in the chat list, chat header, contact card, People pane, admin table, Calls pane. |
| ✅ | Out of office: dates, message, automatic reply, `oof` state | Status panel → Schedule out of office (or from the status message dialog). Shows as "Out of office" with the purple badge — also while the person is offline. The message is on the contact card and in the strip above the message box. With "Reply automatically", the first 1:1 message from each person each day gets an automatic reply in that chat, marked "Automatic reply" (it does not mark the messages as read for the away person). |
| ✅ | Work location (In the office / Remote / custom) | Status panel → Work location. Shown on the contact card and profile page. |
| ✅ | Do not disturb exceptions ("Priority access") | Settings › Privacy → Priority access (or a person's card → ⋯ → Give priority access). Their messages and calls still notify you in Do not disturb, while presenting and in quiet hours. |
| ❌ | Outlook calendar sync | Out of scope (needs the internet / Microsoft). |

## 6. People and profiles

| | Feature | Where / how |
|---|---|---|
| ✅ | Job title, department, phone, email, office location | Settings › Profile → "Contact info and work". Everyone in the session sees them on your card. Validated on the server (phone characters, email shape, lengths). |
| ✅ | Pronouns | Same section (with suggestions). Shown under the name on the card and profile page. |
| ✅ | Name pronunciation | Same tab → Name pronunciation → Record (stops by itself at 10 s), Play, Delete. A ▶ button next to your name on the card and profile page plays it. Stored in the database (collection `peopleVoice`), so file clean-up never removes it and backups include it. |
| ✅ | Local time and time zone | Detected automatically from the browser; Settings › Profile → Time zone to choose one. The card shows "4:12 PM local time · 5 h ahead of you". |
| ✅ | Contact card on hover / click of a person's picture or name anywhere | Hover any picture (messages, chat list, People pane, meeting participants list, lists in dialogs) or a message author's name for half a second; click a picture or name in a message to pin it; the 1:1 chat header picture; "View profile" in the chat list menu and the chat header's More menu (keyboard). Shows picture with presence, name, pronouns, title, status + message, out of office, Chat / Call / Video call / ⋯ (contact group, favorite, nickname, priority access, block, manage — plus other areas' `LC.ext.userMenu` items), contact details, local time, organization (manager and direct reports, clickable), "Files shared with you" (from your 1:1 chat). |
| ✅ | People directory with search | App bar → People. Search by name, title, department, location, email; filter by Available now, department or contact group. The big area shows a directory of cards; selecting someone shows their profile page. Works on phones. |
| ✅ | Contact groups | People pane: "New contact group" button, group ⋯ menu (Add people, Rename, Delete), ✕ to remove someone; or a person's ⋯ → Add to contact group. Stored as `prefs.contactGroups = [{ id, name, members }]` (validated). |
| ✅ | Org chart ("Reports to") | Settings › Profile → Reports to (the server refuses loops). People pane → a person → Org chart: the chain up to the top, the person, their direct reports; every box opens that person. "Open org chart" on the card. |
| ✅ | Block a person | Card ⋯ → Block, or Settings › Privacy → Blocked people. Enforced on the server: no 1:1 messages (`hooks.beforeMessage`, both directions with a clear message), no 1:1 calls (`hooks.callJoin`), no reactions or typing in that 1:1 chat; they see you as offline without status message; their mentions/reactions never reach your feed. Their messages in group chats are folded for you ("Message from someone you blocked · Show"). |
| ❌ | LinkedIn | Out of scope. |

## 8. Activity and notifications

| | Feature | Where / how |
|---|---|---|
| ✅ | Activity items: `mention`, `reply`, `reaction` | Created on the server (`lib/routes-activity.js`): @mentions and @everyone; thread replies go to the thread's starter, everyone who replied and followers in `u.follows`, never to people in `u.unfollows`; reactions to your messages (taking one back removes the unseen notice). Nothing from blocked people, nothing for chats you can't see. |
| ✅ | Render every type well and open the right place | Activity pane: picture with a type badge, who, what, chat name, time, the message text (always the current text; deleted messages say so). Clicking opens the message in its chat (thread replies open the thread), missed calls / voicemail open the Calls pane, meetings use `LC.meetings.open(id)`, apps use `item.app` (`LC.apps.open`), `item.chan` + `item.tab`, `item.team`, `item.pane`. Registry: `LC.ext.activityTypes.<type> = { icon, text(item), open(item), filter }`. |
| ✅ | Filters and "Mark all as read" | Chips: All, Unread (with count), @Mentions, Replies, ⋯ More (Reactions, Calls, Meetings, Tasks, Apps). "Mark all as read" in the pane header. The rail badge counts unread items. |
| ✅ | Mark one item read or unread | Clicking an item reads it; each item's ⋯ menu → Mark as read / unread. Reading a chat also reads its @mentions. Synced live to your other devices. |
| ✅ | Settings per activity type (banner and feed / feed only / off) | Settings › Notifications → Activity notifications (13 types). "Off" hides them from the feed (server-side) and never notifies. Reactions default to "feed only". |
| ✅ | Settings per chat (all activity / mentions only / off) | Chat list item ⋯ or the chat header's More menu → Notifications. Respected by the feed (server) and the alerts (`LC.shouldAlert`). |
| ✅ | Follow / unfollow a thread | chatux's toggle and `u.follows` / `u.unfollows` are respected by the reply items. |
| ✅ | Urgent and important messages | `m.priority === 'urgent'` gets through Do not disturb, mute and "mentions only", rings, and repeats every 2 minutes for up to 20 minutes until the chat is read. Important and urgent items are highlighted in the feed (red label). |
| 🟡 | Reply from the Windows notification | Desktop app: clicking a message notification opens a small quick-reply box for that chat (with the message, Enter to send, "Open chat"); on macOS you can type the reply inside the notification itself (`hasReply`). Partial because a Windows toast can show a text box (`toastXml`) but Electron gives the app no way to read what was typed, so Windows and Linux use the quick-reply box. |
| ✅ | Quiet hours, mute, mentions-only and DND (with priority access) | One rule set in `LC.shouldAlert` (messages) and the activity banners: blocked → never; chat Off → never; thread replies only through the feed; DND / Presenting / quiet hours → only urgent or priority access; muted / chat "mentions only" / "In channels, only notify for @mentions" → only @mentions (if mention banners are on) or urgent. Incoming calls use the same DND rule (`LC.ringAllowed`). |
| ❌ | Email notifications, push to phones when the app is closed | Out of scope (needs the internet / a push service). |

## Data this area owns
- User fields: `presence` (now also `online`, `busy`, `brb`), `presenceUntil`, `statusUntil`, `statusShow`, `oof = { on, from, to, message, reply }`, `workLoc = { kind: 'office'|'remote'|'custom', text }`, `profile = { jobTitle, department, phone, email, office, pronouns, manager, tz, tzManual }`. `statusText` / `statusEmoji` stay where they were.
- Prefs keys (validated): `blocked: [uid]`, `priority: [uid]`, `contactGroups: [{ id, name, members }]`, `chatNotif: { chan: 'mentions'|'off' }`, `actTypes: { type: 'banner'|'feed'|'off' }`.
- Collections: `peopleVoice` (name recordings), `peopleOofLog` (automatic replies sent today), `activityBackfill` (people whose older @mentions were copied into the feed once). Activity items stay in core's `activity` collection.
- Public user fields (`hooks.userFields`): `jobTitle, department, office, pronouns, phone, email, manager, tz, voice, workLoc, oof { to, message }, statusShow, statusUntil`; for yourself also `presenceSet, presenceUntil, oofSettings, tzManual, statusShowSet`.

## API routes
- `POST /api/presence` (replaced; same body, more states, `until`) · `POST /api/people/status { text, emoji, show, until }` · `POST /api/people/oof { on, from, to, message, reply }` · `POST /api/people/worklocation { kind, text }` · `POST /api/people/profile { jobTitle, department, office, pronouns, phone, email, manager, tz, tzManual }` · `POST /api/people/voice` (raw audio, ≤ 400 KB) · `GET /api/people/voice?id=` · `POST /api/people/voice/delete` · `POST /api/people/prefs { blocked, priority, contactGroups, chatNotif, actTypes }`.
- `GET /api/activity?type=&types=a,b&unread=1&before=&limit=` (replaced: privacy filter, current message text, `where`, `more`) · `POST /api/activity/read { ids, read } | { all, types? }`.
- Wrapped (behaviour kept): `POST /api/prefs` (also accepts the prefs keys above), `POST /api/profile` (a status typed in Settings has no expiry), `POST /api/read` (also reads that chat's @mention items), `POST /api/react` and `POST /api/typing` (blocked people in 1:1 chats), `POST /api/call/share` (Presenting updates at once).

## Client events and APIs
- New event: `ppactdel { ids }` (activity items removed). `init` carries `ppActUnread`.
- `LC.people`: `setPresence, statusDialog, oofDialog, durationDialog, savePrefs, isBlocked, block, unblock, hasPriority, togglePriority, playName, localTime, groups, newGroup, toggleInGroup, showPerson(uid), card, quickReply(chan, msgId), setChatNotif, notify, reloadActivity, urgentEvery` …
- `LC.contactCard(anchor, uid)`, `LC.userMenu` (opens the card), `LC.profileMenu` (status panel), `LC.shouldAlert`, `LC.alertMessage`, `LC.ringAllowed(ring)`, `LC.ext.activityTypes`, `LC.ext.panes.activity` (replaced), `LC.ext.panes.people` (new).
- Desktop bridge (`desktop/ext-people.js`): `x:people:hello`, `x:people:notify`, `x:people:echoQuickReply`; events to the window `x:people:quickReply { chan, msg }`, `x:people:reply { chan, msg, text }`.

## Edits outside my area (all small)
- `public/index.html` — two `<script>` tags inside my own `<!-- area:people -->` block.
- `public/js/calls.js` (calls) — the incoming-call check asks `LC.ringAllowed(r)` when it exists instead of only `presence === 'dnd'` (priority access, blocked callers, presenting).
- `public/js/chat.js` (chatux) — 4 places show presence through `LC.presenceLabel(...)` instead of `t(presence)` (chat list preview, your picture's tooltip, the 1:1 header, the Calls pane), so "In a call", "Available" etc. read right.
- `public/js/panels.js` (shell/teams) — 2 places use `LC.presenceLabel` (chat info, admin people table); the Status select in Settings › Profile lists every state (`LC.people.choices()`) and shows the chosen one (`presenceSet`).
- `public/js/icons.js` — regenerated by `node scripts/build-icons.js` (my names are in `scripts/icons/people.txt`).
- Wrapped from my module, not edited: `LC.avatar` (adds `data-uid`), `LC.msgEl` / `LC.msgSig` (fold blocked people's group messages), `LC.setPane` (leaving the People pane brings the conversation back).

## Notes for other areas
- `render.js` (chatux): the read-receipt ticks `<span class="ticks" aria-label=…>` have no role, so axe reports `aria-prohibited-attr` in 1:1 chats with your own messages (not covered by `tests/a11y.js`). Adding `role: 'img'` fixes it.
- `chat.js`: leaving a pane that has `main()` for a list pane doesn't bring the conversation back (`LC.closeApp` hides nothing back). I handle it for the People pane only.
- chatux sets `m.priority`; until then urgent/important behaviour can be tried with `priority` in `/api/send` only if a module copies it (the browser test does that with a hook).

## Tests
- `node tests/api-people.js` — presence states and durations, automatic call/meeting/presenting, calendar meetings, status message expiry, out of office (state, schedule, one automatic reply a day, read state kept), work location, profile validation and reports-to loops, name recordings, prefs validation, blocking (messages, calls, reactions, presence), activity (mentions, @everyone, thread replies with followers/unfollowers, reactions and undo, read/unread/all, reading a chat, privacy filters, per-type and per-chat settings, backfill).
- `node tests/ui-people.js` (port 4230; with `AXE_JS=…` also an axe audit of the status panel, card, People pane, profile page, Activity pane, settings sections and dialogs in light, dark and high contrast) — status panel, duration, status message strip, work location, card by click and hover, profile settings → org chart, search and contact groups, Activity live/filters/open/unread/mark all, focus kept on redraw, reactions and replies, notification rules, urgent repeats, blocking, out of office reply, quick reply, phone layout.
- `node tests/electron-people.js` (debugging port 9521) — the desktop bridge loads, shows a notification, and the reply path opens the quick-reply box and sends.
