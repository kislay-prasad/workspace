# Meetings area — features (sections 18, 21, 23)

Files: `lib/routes-meetings.js` (server), `public/js/meetings.js` (scheduling, joining, lobby, reminders, Meet pane, cards),
`public/js/meetings-engage.js` (Q&A, polls, notes + agenda, breakout rooms, attendance, recap, meeting info),
`public/js/meetings-webinar.js` (registration, interpretation, webinar attendee note, activity types), `public/css/meetings.css`,
`scripts/icons/meetings.txt`. Tests: `tests/api-meetings.js`, `tests/ui-meetings.js`.

✅ done · 🟡 partial (what's missing) · ❌ not done (why)

## 18. Meetings: scheduling and joining

| | Feature | Where / how |
|---|---|---|
| ✅ | "New meeting" form | **Meet** pane (left app bar) → *Schedule a meeting*; chat header **Meet ▾** → *Schedule a meeting* (channels and group chats; prefilled with the chat's people); chat header **⋯** → *Schedule a meeting* (also in 1:1 chats, prefilled with the other person); `LC.meetings.schedule(prefill)` for the Calendar app. (The chat list's "New" menu has no extension hook — chatux's `LC.chatListActions` — so it has no entry there.) Title, required + optional attendees (people picker with keyboard support), date, start / end, all day, repeat (none / every day / every weekday / weekly / monthly / custom: every N days-weeks-months, weekdays, until), where (a new meeting chat or an existing channel / group chat), location, details, meeting options. Edit: organizer → *Edit* in the details. |
| ✅ | Meet now | **Meet** pane → *Meet now* (new meeting chat) and header **Meet ▾** → *Meet now* (in that channel / group). Creates an instant ("ad hoc") meeting, opens the before-you-join screen; it is not put on calendars and ends (for presence) when its call ends. |
| ✅ | Meeting link, meeting ID, passcode | Details dialog, the meeting chat's *Details* tab and *Meeting info* in the meeting window: link `<LAN address>/#meet=<id>` with *Copy link*, a 12-digit meeting ID + 6-character passcode with *Copy join info*. **Meet** pane → *Join with a meeting ID* asks for both (wrong passcodes are rate limited: 10 per 10 min). `#meet=` links open the before-you-join screen after `init` (also while the app runs: `hashchange`), then the hash is cleared. |
| ✅ | Meeting chat before, during, after | A channel `kind: 'meeting'`, `meeting: <id>` whose members are the organizer + invitees (+ people admitted from the lobby); the call happens there. Channel meetings use the channel. The chat gets *Details*, *Recap* and *Q&A* tabs; the header gets a *Meeting details* button. |
| ✅ | Invitations with RSVP | Invitees get an activity item (`kind: 'invite'`) and an invitation card in the meeting chat with *Join*, *Accept / Tentative / Decline* and *View details*. The organizer sees responses on the card and the full **tracking** list in the details. Updates (new time → everybody is asked again), added / removed attendees and cancellations (whole series or one occurrence, with an optional message) post a card and notify everyone. |
| ✅ | Reminders | Server tick: 15 min before → toast (*Join*); at the start → a ring-like "Meeting is starting — Join / Dismiss" prompt with sound for invitees who accepted or haven't answered (not for declined / tentative), plus a "starting now" activity item. Personal switches in Settings → *Meetings*. Desktop notifications when the app is in the background. |
| ✅ | Before you join | Every meeting join (`LC.ext.beforeCall`): camera preview with on/off switch, mic on/off with a level meter, device pickers (mic, speaker, camera), *Computer audio / Don't use audio / Companion mode*, *Add a device*, *Join now / Cancel*; returns `{ micId, camId, cam, muted, companion? }`. Settings → *Meetings*: show it for meetings (default) or for every call. *Background effects* opens the calls area's picker (`LC.callEffects.picker`) inside the screen and the preview shows the chosen effect (`LC.callEffects.process`); the choice carries into the call. |
| ✅ | Lobby with Admit / Deny / Admit all | Meeting option "Who can bypass the lobby?" (everyone / people in this session / people I invited / only me; default = the session rule `S.meetingRules.lobby`, else everyone except guests). Waiting people see "Someone in the meeting will let you in soon" (with their preview). Organizers / presenters get a banner in the meeting window (*Admit* / *Admit all* / *View lobby*), a **Lobby** panel with Admit / Deny per person, and a toast with *Admit* when they are not in the meeting. Enforced in `hooks.callJoin` (403 `{ lobby: true }` from `/api/call/start` and `/api/call/join`). |
| ✅ | Join / leave sounds | A short rising / falling chime when someone joins or leaves the meeting you're in (from `callstate`). Meeting option *Play a sound when people join or leave*, personal switch in Settings → *Meetings*. |
| ✅ | Guest join by link (still approved) | Opening a `#meet=` link without an account: the login card says you're joining a meeting; the browser tells the server which meeting (public `POST /api/meetings/intent`, device id → meeting, 30 min, rate limited — it never lets anyone in). The host's join request (toast, Manage → *Join requests* section "Joining for a meeting") names the meeting. After approval the guest lands on the before-you-join screen; the lobby rules decide whether they wait. |
| ✅ | Join on your phone (companion) | Before-you-join → *Companion mode* joins with `{ companion: true }` (no mic, no speaker, camera off; the calls area runs it as a second device of the same person, so the phone's camera or the chat / reactions can be used). *Add a device* (before-you-join and the meeting window's *More*) shows a QR code for the phone: a one-time, 2-minute sign-in code (`/api/handoff`, the user's own account) + the meeting link + `companion=1`, which opens the before-you-join screen in companion mode. |
| ✅ | Meeting templates | The form's *Template* picker: built-in *Stand-up* (15 min), *1:1* (30 min, invited bypass), *Review* (60 min), *Webinar* (attendees only watch + registration); *Save as template* stores title prefix, duration, lobby and options per person (up to 20). |
| ❌ | Dial-in, rooms devices, joining real Teams meetings | Need a phone network / Microsoft services — out of scope (as briefed). |

## 21. Meetings: engagement and follow-up

| | Feature | Where / how |
|---|---|---|
| ✅ | Polls | Meeting window → **Polls**: create (question, options, multiple answers); it is posted as the chat's normal poll message, so results are in the chat too. Everyone else in the meeting gets a vote pop-up; results update live in the panel and pop-up. |
| ✅ | Q&A | Meeting window → **Q&A** and the meeting chat's *Q&A* tab: ask (optionally anonymously — the author is never sent to others), upvote, reply, sort by top / recent; organizers + presenters mark answered, pin, dismiss (hidden from others), delete. Live (`mt_qa`). Meeting option to turn Q&A off. |
| ✅ | Notes and agenda | Meeting window → **Notes**: agenda items (minutes, done, reorder, delete) + the meeting chat's shared note (the apps area's `/api/collab` + `/api/note`, with conflict handling), editable live during the meeting. The agenda is also editable in the meeting chat's *Details* tab and the note in its *Notes* tab; both are in the recap. |
| ✅ | Breakout rooms | Meeting window → **Rooms** (organizer): create 1–20 rooms (assign automatically or by hand), move people between rooms, open rooms (optional time limit) → everybody in the meeting is moved into their room's call automatically (rooms are channels `kind: 'breakout'` with the room's members); 1-minute warning and auto-close by the server; announcements to every room (toast + a line in each room chat); *Join room* lets the organizer visit any room; *Close rooms* → everyone moves back to the main meeting; rooms can be reopened (reuse) or deleted. Participants see their room and *Back to the main meeting*. |
| ✅ | Attendance report | From `hooks.callEvent` join / leave (breakout room time counts): per occurrence, who joined, first join, last leave, total time. Organizer: meeting window *More* → *Attendance report*, or the details → *Past meetings* → *Attendance*; *Download CSV* (formula cells defused). |
| ✅ | Recap | Details → *Past meetings* → *Recap*, the meeting chat's *Recap* tab, the meeting window's *More* → *Recap*, the Meet pane's *Recent meetings*: date, duration, attendance (times for the organizer only), recordings (`m.recording` messages from the calls area), agenda, notes, Q&A, polls, files shared, chat during the meeting (only messages the viewer may see: `canSee` + `ctx.canSeeMsg`). |
| ✅ | Interpreter audio | Meeting option *Language interpretation* (form, or the meeting window's *More* → *Language interpretation* for the organizer): interpreters + language. Listeners pick a language there → interpreter at full volume, the original at 20% (`LC.callApi.setVolume`); people on *Original audio* don't hear interpreters; interpreters hear everyone but other interpreters. |
| ❌ | AI notes | Needs an AI service — out of scope (as briefed). |

## 23. Webinars and big events

| | Feature | Where / how |
|---|---|---|
| ✅ | View-only mode | Meeting option *Attendees can only watch (webinar)*: the meeting's call is started with the calls area's attendee controls on (`call.hardMute`, `call.noCams`; only presenters share), so attendees can't unmute, use a camera or share — enforced by the server; they can react, raise a hand, chat (per the chat option) and use Q&A; the organizer can let someone speak with the calls area's participant controls. `call.max` is raised to the mesh limit (25); the form warns that the size depends on the presenters' upload speed. |
| ✅ | Registration with approval | Webinar option *Require registration* (ask for email, notes, your own question; approve each or approve automatically). Registration page `#register=<id>` (after the session's own join + host approval). New registrations notify the organizer (activity); details → *Registrations*: approve / decline / approve all, copy the registration link. Approved people are invited (meeting chat, link, activity item). |
| ✅ | Presenters and audience | *Who can present?* (everyone / specific people / only me) with a presenters picker when scheduling; presenters get `call.roles[uid] = 'presenter'`, everyone else in a webinar is an attendee; changes made in the meeting with the calls area's controls stay for that meeting. |
| ❌ | 1,000–10,000-person town halls | A peer-to-peer mesh can't carry that — out of scope (as briefed). |

## Data I own
- `db.meetings[id]` — `{ id, title, organizer, start, end, allDay, tz, repeat: { freq, interval, until, days } | null, invitees, optional, presenters, rsvp, chan, ownChat, details, location, code, passcode, lobby, options: { present, viewOnly, chat, qa, sounds, record, registration: { on, email, notes, question, approve }, interp: [{ uid, lang }] }, skip: [occurrence], cancelled, adhoc, sent, created, updated }` (old / partial records are normalised on read).
- `db.meetingData[id]` — `{ qa: [...], agenda: [...], rooms: { list: [{ chan, name, members }], open, closesAt, occ }, att: { [occurrence]: { occ, start, end, people: { uid: { first, last, ms, open, joins, role } } } }, regs: [...] }`.
- `db.meetingTemplates[uid]` — up to 20 templates.
- Channels I create: `kind: 'meeting'` (`meeting`, members) and `kind: 'breakout'` (`meeting`, `parent`, members).
- Memory only: lobby (waiting / admitted per meeting), join intents of not-yet-approved browsers.

## API (all need a session unless noted)
`GET /api/meetings?from=&to=` · `GET /api/meetings/get?id=` · `GET /api/meetings/recent` · `POST /api/meetings/create|update|cancel|rsvp` · `POST /api/meetings/lookup` (ID + passcode) ·
`POST /api/meetings/join` (202 `{ lobby: true }` when waiting) · `POST /api/meetings/lobby` (`admit|deny|admitAll|leave|list`) · `POST /api/meetings/intent` (**public**, device id → meeting, used only to label the host's approval prompt) ·
`GET|POST /api/meetings/qa` · `GET|POST /api/meetings/agenda` · `GET|POST /api/meetings/rooms` · `GET /api/meetings/attendance?id=&occ=[&format=csv]` · `GET /api/meetings/recap?id=&occ=` ·
`GET|POST /api/meetings/register` · `GET|POST /api/meetings/registrations` · `GET|POST /api/meetings/templates`. Server helper: `ctx.meetingOccurrences(m, from, to)`.

## Client events and extension points used
Events: `mt_meeting`, `mt_lobby`, `mt_knock`, `mt_admitted`, `mt_denied`, `mt_reminder`, `mt_qa`, `mt_agenda`, `mt_rooms`, `mt_move`, `mt_announce`, `mt_reg`.
Client API: `LC.meetings.schedule(prefill)`, `.open(id)`, `.join(id, { companion })`, `.edit(id)`, `.meetNow(chan)`, `.joinWithId()`, `.register(id)`; shared helpers in `LC.mt`.
Hooks used: `callJoin` (lobby, `call.meeting`, `call.roles`, webinar controls), `callEvent` (attendance), `callFields` (`mt` summary on the call state), `chanFields` (`meeting`, `parent`), `beforeMessage` (meeting chat on / off / during), `initExtra` (lobby lists, meeting join requests).
Client registries: `panes.meet`, `headerActions`, `headerMenu`, `chatMenu`, `tabs`, `msgParts` (cards), `beforeCall`, `callPanels` (Lobby, Q&A, Polls, Notes, Rooms), `callMore`, `settingsTabs` (Meetings), `adminSections` (requests), `activityTypes.meeting` (people area's feed).
Activity items: `{ type: 'meeting', kind: invite|update|time|cancel|removed|start|rsvp|reg|regok|regno, from?, meeting, title, start, chan? (channel meetings), rsvp?, occurrence?, link? }`.

## Edits outside my area
- `public/index.html`: script / link tags inside my `<!-- area:meetings -->` blocks only.
- `scripts/icons/meetings.txt` + regenerated `public/js/icons.js`.
- Wrapped core routes (no file edits): `POST /api/call/start` and `/api/call/join` (to answer the lobby refusal with `{ lobby: true }`); `ctx.reqOut` (adds `meeting`, `meetingTitle` to join requests) — installed right after `createApp()` because app.js assigns `ctx.reqOut` after loading route modules.
- No edits to other areas' files. (Merges of main and feat/calls conflicted in `public/js/calls.js` and the generated `public/js/icons.js`; I took the calls branch's own resolution of calls.js verbatim and regenerated icons.js.)
- Uses other areas' APIs as they are: calls (`hooks.callJoin/callEvent/callFields`, `call.roles`, `call.hardMute` / `call.noCams` for webinars, `/api/call/admin` role changes, `LC.callApi.setVolume`, `LC.callEffects`, `companion`), apps (`/api/collab`, `/api/note`), people (`LC.ext.activityTypes`), chatux (`ctx.canSeeMsg`), teams (`S.meetingRules.lobby`, `maxPeople`, `present`), core (`/api/handoff` for *Add a device*).
