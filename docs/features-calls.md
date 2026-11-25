# Calls area: calling and the meeting window (sections 17, 19, 20, 22)

Legend: ✅ done · 🟡 partial (what is missing) · ❌ not done (why). "Meeting window" = the call UI (`public/js/calls.js`).

Files: `public/js/calls.js` (meeting window, calling), `calls-effects.js` (backgrounds, filters), `calls-share.js` (sharing and
presenting), `calls-record.js` (recording), `calls-pane.js` (Calls pane, Settings › Calls / Devices), `calls-walkie.js`
(Walkie Talkie), `calls-tick.js` (a worker clock), `public/css/calls.css`, `lib/routes-calls.js` (live calls),
`lib/routes-callx.js` (history, settings, voicemail, rating, walkie-talkie), `desktop/ext-calls.js` (red frame and presenter
toolbar), `scripts/icons/calls.txt`.

## 17. Calling

| | Feature | Where / how |
|---|---|---|
| ✅ | Call history | Calls pane (rail › Calls) › History: All / Missed / Incoming / Outgoing. Each row shows who, when, the duration, voice or video, **Call back** and **Open the chat**. Only calls you were part of, in chats you can still see. |
| ✅ | Missed-call alerts | The server creates an activity item `{ type: 'missedCall', from, chan, mode, call, reason }`. The people area turns it into a banner or OS notification. The Calls rail badge counts unread missed calls + new voicemail; opening History marks the missed calls read. |
| ✅ | Voicemail | A 1:1 call that nobody answers in 30 s, that is declined, or that reaches someone busy, in Do not disturb or offline shows the caller "Leave a voicemail". The voicemail recorder shows the callee's greeting, beeps, records up to 2 min and uploads it. The callee finds it in Calls › Voicemail (play, mark heard / not heard, delete, call back, "New" badge) and gets an activity item `{ type: 'voicemail', from, chan, vm, dur }`. The greeting text is set in Settings › Calls. |
| ✅ | Hold / resume | More › Hold. You stop sending audio and video and stop hearing the others. They see "On hold" on your tile, and in a 1:1 call a banner. Resume from the big button. Hold is silent (no music). |
| ✅ | Ring someone into the call | Participants › **Add people** (or More › Add people), or **Ring** next to people in "Others in this chat". In a 1:1 call, adding a third person creates a group chat with everyone. Both people's apps move into its call automatically and the new person is rung. |
| ✅ | Transfer | 1:1 call › More › Transfer…: pick a person. **Transfer** connects the other person to that person's ringing call ("Transferred by …") and you drop off. **Consult first** calls the target while the other person waits on hold; a banner then offers **Transfer now** or **Back to …**. |
| ✅ | Forward calls | Settings › Calls › Call forwarding has three rules: "Forward my calls" (off / voicemail / a person), "If I don't answer or decline" (voicemail / a person / nothing) and "If I'm already in a call" (voicemail / a person / nothing). They apply when you are rung for a 1:1 call. Forwarding to a person moves the caller's call to a 1:1 call with that person, which rings with their "forwarded" ringtone. At most two hops; other areas' rules (blocking) still apply. |
| ✅ | Park and pick up | More › Park call: you step out and get a 3-digit code. The other side sees "… parked the call · code 123". Pick it up in Calls › "Pick up a parked call": works on any of your devices, and anyone in that chat can use the code. After 5 minutes the call rings you back. |
| ✅ | Speed dial and contact groups | Calls pane list: Speed dial (edit with the star or pencil; one-click video or voice). Contact groups come from the people area's `LC.prefs().contactGroups`: calling one reuses a group chat with exactly those people, or creates one. With no groups, a link goes to the People pane. |
| ✅ | Ringtones | Six ringtones generated with WebAudio (Classic, Chimes, Marimba, Bright, Soft pulse, Retro phone) plus Silent, with a preview. Settings › Calls › Ringtones has one for your calls and one for forwarded or transferred calls. |
| ✅ | Rate the call | After a call of more than 20 s with someone else: a small card with 1–5 stars and optional issues. Stored in `db.callLog[].ratings`. It can be turned off in Settings › Calls. |
| ✅ | Walkie-talkie | Rail › Walkie Talkie: pick a chat or channel, **Connect**, then hold the big button (or Space) to talk. Everyone connected to that chat hears you. The server grants the floor to one talker at a time (max 60 s). Audio goes device to device. |
| ✅ | Settings › Devices | Default camera with a live preview (and video effects), microphone with a level meter, noise suppression and music mode, speaker with "Play a test sound" (plays on the chosen speaker), and **Make a test call** (records 5 s, plays them back). |
| ❌ | Phone numbers, dial pad to phones, call queues, emergency calling | Skipped as briefed: needs the phone network. |

## 19. Meetings: controls and views

| | Feature | Where / how |
|---|---|---|
| ✅ | Hold Ctrl+Space to talk while muted | Shows a "Talking" banner while held. |
| ✅ | "You're muted" warning | While muted, a copy of your mic (never sent) is checked. Speaking shows the banner with **Unmute**; once dismissed it stays quiet for 20 s. |
| ✅ | Hide self view, mirror, turn off incoming video | **View** menu (also in More / camera menu). Mirror is on by default and applies to your own view only. "Turn off incoming video" asks the others not to send you their camera (`want: []`), which saves bandwidth. |
| ✅ | Raised hands numbered; lower all | The hand badge on tiles and in Participants shows the order. Participants › Meeting options › Lower all hands, or lower one hand from a person's menu. |
| ✅ | Organizer controls | Participants panel (person menu, **Mute all**, **Meeting options**) and the tile "…" menu: mute one or all; "Don't allow attendees to unmute" (hard mute, with per-person Allow mic); turn off a camera; "Don't allow attendees to turn on camera" (per-person Allow camera); remove; roles (organizer / presenter / attendee; only organizers change roles); lock; end the meeting for everyone (Leave ⌄ › End meeting). All checked on the server. Receiving apps also mute the audio of anyone the server lists as muted. Removed people can't rejoin unless rung again. Only organizers and presenters can share. |
| ✅ | Pin, spotlight, views | Tile "…" › Pin for me / Spotlight for everyone (organizers and presenters). View menu: Gallery (9 per page), Large gallery (up to 49 per page, paged), Speaker, Together mode (round seats on an auditorium scene), Focus on content. |
| 🟡 | Noise suppression levels, music mode | Mic ⌄ menu or Device settings. Browsers have a single noise suppression switch, so the levels map to it: Auto = noise suppression, echo cancellation and auto gain; High adds the browser's `voiceIsolation` where supported; Low leaves auto gain off; Off turns noise suppression off. Music mode turns all processing off, asks for stereo and raises the Opus bitrate to 128 kbit/s (stereo is signalled in the SDP). |
| ✅ | Network quality | `getStats` every 3 s per connection (round trip, loss, jitter). Tiles show signal bars (hover for numbers). "Your network is causing poor call quality" appears when your outgoing quality is poor twice in a row. Each person's average goes into `db.callLog[].quality` when they leave. |
| ✅ | Chat panel in the meeting | **Chat** button: the call chat's messages, live, with a full message box. It is kept between redraws, so typing is never interrupted. |
| ✅ | Meeting info panel | More › Meeting info: chat name, started by, start time and live duration, people, mode, your role, locked, recording, and the meeting link when the meetings area set `call.meeting` (`#meet=<id>`). |
| 🟡 | Background effects and filters | Camera ⌄ › Video effects (side panel), Settings › Devices, or any area via `LC.callEffects.picker()`. Uses the camera's own background blur when `getCapabilities().backgroundBlur` exists. Otherwise, with no AI model offline: a "portrait" effect keeps a soft oval in the middle sharp and blurs the rest, or puts one of six generated pictures (or your own) behind it. Filters: brightness, soft focus, warm, cool, black & white. **Missing:** real person segmentation (hair and shoulders outside the oval get blurred or replaced). Frames go through insertable streams (MediaStreamTrackProcessor), with a canvas fallback. Ctrl+Shift+P toggles blur. |
| ✅ | Ring people from inside the meeting | Participants › "Others in this chat" › **Ring** (shows "Ringing…"). |
| 🟡 | More than 8 people | **No host relay.** Calls stay a mesh, now up to 16 by default (`call.max` / `S.meetingRules.maxPeople` / `S.maxCallSize`, capped at 25). Above 8: cameras start off for newcomers; each device asks only for the cameras it shows (9, or 16 in large gallery; signers, spotlight and pinned first), so senders encode fewer streams; camera video drops to 640×360 and 350 kbit/s. A real relay (one device re-sending everyone's tracks) was not built: it needs per-viewer audio mixing and re-encoding on one machine, and I could not make that reliable in the time. |
| ❌ | 3D avatars, immersive spaces | Skipped as briefed. |

## 20. Meetings: sharing and presenting

| | Feature | Where / how |
|---|---|---|
| ✅ | Red border while sharing | Desktop app: a click-through, always-on-top red frame around the shared screen (`desktop/ext-calls.js`), kept out of the capture with `setContentProtection` on Windows and macOS. Browser: a red frame around the meeting window while you share. |
| ✅ | Presenter toolbar | Desktop: a small always-on-top bar at the top of the shared screen with timer, Pause/Resume, Mic, Camera, Give control / Take back, and Stop presenting. Browser and app: the same bar at the top of the meeting stage, plus "Let everyone annotate" and Presenter mode. |
| ✅ | Pause sharing | Toolbar › Pause. Your app stops sending frames; viewers keep the last frame with a "… paused sharing" label. |
| ✅ | Zoom into shared content | Viewers: Ctrl+wheel, the +/− and reset buttons, two-finger pinch, and drag to pan when zoomed. Annotations zoom with the content. |
| ✅ | Share a browser tab | Share ⌄ › Browser tab (browsers; `displaySurface: 'browser'`). The desktop app lists screens and windows with thumbnails. |
| ✅ | Smooth video sharing | Share ⌄ › "Optimize for video": `contentHint = 'motion'`, 30 fps, 4 Mbit/s, maintain-framerate. "Include computer sound" is a separate option; Windows desktop uses loopback audio. |
| ✅ | Share the whiteboard | Share ⌄ › Whiteboard: the call chat's whiteboard on the stage for everyone, and anyone in the chat can draw. It uses the apps area's whiteboard tab (`LC.ext.tabs` key `board`, `render(host, chan)`) when that area registers one. Otherwise it shows a compatible live view with the same data, API and live events as the Whiteboard tab in `collab.js`. That renderer is tied to the chat open in the main window, so it can't be reused for another chat without changing it. |
| ✅ | PDF slides with page sync | Share ⌄ › PDF slides: pick a PDF posted in the chat, or upload one (it is posted first so everyone can open it). Everyone sees the presenter's page in the browser's PDF viewer (`#page=N`), and the presenter has previous / next. Viewers can look ahead privately, then **Sync to presenter**. |
| ✅ | Presenter modes | Share ⌄ or toolbar › Presenter mode: Content only, Standout (your camera in a rounded box over the content), Side-by-side. Composited on a canvas before sending. |
| ✅ | Laser pointer and drawing | Presenter, and everyone after "Let everyone annotate": a tool bar on the content with laser pointer, pen (5 colours) and clear. Strokes go live to everyone over the shared video, the whiteboard and the PDF. The presenter sees them on the preview in "You're presenting", and in the desktop app also on the real screen (drawn by the red-frame window). |
| 🟡 | Give / take / request control | Viewers: **Request control**; the presenter gets Give / Deny. The presenter can also Give control from the toolbar, and Take back (desktop toolbar too). The controller gets a named **remote pointer** that everyone sees ("look here"), drawn on the presenter's real screen in the desktop app. **Missing:** real keyboard and mouse control. OS input injection could not be made safe and tested on Windows here (no Windows machine), so none is done. Control is always given explicitly, each time. |
| ❌ | PowerPoint Live / Excel Live | Skipped as briefed. |

## 22. Recording

| | Feature | Where / how |
|---|---|---|
| ✅ | Record the meeting to a video in the chat | More › Start recording. The recorder's app draws the stage (shared screen or whiteboard with four speaker tiles, otherwise a gallery with names and the speaking highlight) on a 1280×720 canvas at 15 fps. All voices are mixed with WebAudio and recorded with MediaRecorder (WebM VP8/Opus). A new part starts every 30 minutes, or before the session's upload limit. Each part is uploaded (`LC.upload`) and posted with `m.recording = true` and the video in `m.files`. If an upload fails, you are offered a download. 🟡 PDF slides show as a title card in the recording: the browser's PDF viewer can't be drawn into a canvas. |
| ✅ | "Recording started" notice | For everyone: a banner (recording consent text), a red "Recording" dot in the meeting title, the chat's call bar and the mini window, and a system line in the chat. Stopping adds a "Recording stopped" line and a notice in the meeting. |
| ✅ | Record automatically | Meeting options › Record automatically (organizer, per call), and Settings › Calls › "Record my meetings automatically" (calls you organize, once someone else is there). |
| ✅ | Choose who can record | `S.meetingRules.record` (everyone / organizers / nobody) is honoured on the server. The organizer can change it per meeting (Meeting options › Who can record). Organizers can stop someone else's recording. |
| ❌ | Live captions, transcripts, AI recap, speaker coach | Skipped as briefed. |

## Shared contracts and extension points (for other areas)

- **Kept:** `LC.ext.beforeCall` (options `micId`, `camId`, `cam`, `muted`, **`companion`**: a second device joins with no mic, no sound and camera off, labelled "Companion", and counts as the same person), `LC.ext.callPanels` / `callToolbar` / `callMore`, local events `call:joined` / `call:left` (both also fire with `moved: true` when the server moves the call) / `call:drawn`. Server: `hooks.callJoin` / `callEvent` / `callFields`, `ctx.calls`, `ctx.callState`, `ctx.pushCallState`, `ctx.leaveCall`. `hooks.callJoin` also runs before the server moves someone into another call (forwarding, transfer, consult). `call.max || S.meetingRules.maxPeople || S.maxCallSize || 16`.
- **`LC.callApi`:** `chan`, `me`, `local`, `ep` (this device), `state()`, `participants()`, `peers()`, `redraw()`, `panel()`, `setPanel(key)`, `mini()`, `setMini(v)`, `toggleMic()`, `toggleCam()`, `syncMedia()`, `data()`, **`setVolume(uid, 0..1)`** / `volume(uid)` (all of that person's devices), `role(uid)`, `isOrganizer(uid)`, `canPresent(uid)`, `endpoints()`, `streamOf(uid)` (camera), `audioOf(uid)`, `view()` / `setView('gallery'|'large'|'speaker'|'together'|'content')`, `pin(uid)`, `hold(on)`, `ring([uid])`, `isRecording()`, `companion()`.
- **`LC.callEffects`:** `list()`, `get()` → `{ bg, filter }`, `set({ bg, filter })` (remembered on this device, applied at once in a call; fires local `call:effects`), `process(track)` → `{ track, stop }`, `picker(host, { preview })` (the picker UI, for a "before you join" screen).
- **Other helpers:** `LC.callDevices` (`getMic`, `getCam`, `micConstraints`), `LC.ringtones` (`names`, `play`, `loop`, `stop`), `LC.callPrefs()` / `LC.setCallPrefs(patch)`, `LC.callRecorder` (`start`, `stop`, `active`), `LC.leaveVoicemail(uid)`, `LC.walkie` (`connect`, `disconnect`, `talk`, `release`, `state`).
- **Call state** (everyone in the chat gets it; extra fields next to `id, mode, by, started, participants, media, sharing`):
  - devices and people: `endpoints [{ ep, uid, companion, cam, want }]`, `roles {uid: 'organizer'|'presenter'|'attendee'}`, `meeting`, `max`, `hands` (in order raised), `held`;
  - organizer controls: `locked`, `hardMute`, `noCams`, `allow {uid: {mic, cam}}`, `spotlight`;
  - sharing: `share { kind: 'screen'|'board'|'pdf', by, file, page, mode, sound, video, at }`, `paused`, `inkAll`, `ctl { to, by, at }`;
  - recording: `rec { by, started }`, `recPolicy`, `autoRec`;
  - calling: `parked { code, by, at }`, `consult`, `consultOf`, `ringing [uid]`.

  `media[uid]` is still exactly `{ mic, cam, hand }`. Fields from `hooks.callFields` override the calls fields.
- **Presence:** not set here. The people area derives it from `ctx.calls` (`parts`, `sharing`, `meeting`).
- **The signers preference:** `LC.prefs().signers`: those people come first, have a "Signer" badge, take a double-size tile in the gallery, and their camera is always requested in large meetings.

## Data I own

- `db.callLog` (array, newest last, capped at 5000): `{ id, chan, mode, by, start, end, parts, missed, rung, ratings: { uid: { stars, issues, at } }, quality: { uid: { rtt, loss, jitter } }, meeting? }`.
- `db.callPrefs[uid]`: `{ forward: { always, unanswered, busy } ('off' | 'voicemail' | uid), greeting, ringtone, ringtoneFwd, autoRecord, askRating, speedDial: [uid] }`.
- `db.voicemail[uid]`: `[{ id, from, chan, file, dur, ts, heard, size, type }]` (up to 100 per person). The audio is in `<data dir>/voicemail/`, outside `uploads/`, so clean-up and file garbage collection can't delete it. Note: backups (which copy `uploads/`) do not include voicemail audio.
- **In memory only:** live calls (`ctx.calls`) and walkie-talkie channels (`ctx.walkies`).
- **Device-local (`LC.ui` / localStorage):** `clNoise`, `clMusic`, `clView`, `clHideSelf`, `clMirror`, `clShareSound`, `clShareVideo`, `clPresMode`, `clBg`, `clFilter`, and `lc_cl_bgimg` (your own background picture, resized).
- Recordings are ordinary chat messages and files: `m.recording = true`, `m.rec = { part, dur, start, call }`.

## API routes (all need sign-in; every one checks `canSee` and the caller's part in the call)

- **Calls:**
  - joining and media: `POST /api/call/start | join | leave | media | alive | hold | react | signal`;
  - sharing: `share | sharestate | ink | control`;
  - organizer: `admin` (actions: `mute`, `muteall`, `hardmute`, `allowmic`, `camoff`, `nocams`, `allowcam`, `remove`, `role`, `lock`, `end`, `spotlight`, `lowerhands`, `lowerhand`, `recpolicy`, `autorec`);
  - calling: `ring | decline | transfer | consult | park | pickup`;
  - recording: `record | recpost`.
- **Satellite (`routes-callx.js`):**
  - history and settings: `GET /api/callx/history?f=all|missed|incoming|outgoing`, `POST /api/callx/rate`, `POST /api/callx/quality`, `GET|POST /api/callx/prefs`;
  - voicemail: `GET /api/voicemail/greeting?to=`, `POST /api/voicemail/leave`, `GET /api/voicemail`, `POST /api/voicemail/heard`, `POST /api/voicemail/delete`, `GET /api/voicemail/audio?id=` (only your own, byte ranges);
  - walkie-talkie: `GET /api/walkie/state`, `POST /api/walkie/join | leave | alive | talk | signal`.
- All inputs are size-limited and validated. Rate limits cover calls started, rings, transfers, pick-up codes (10 a minute), voicemail, annotations, control requests and signaling.

## Client events (live)

- **New:**
  - calls: `callmove` (your device was moved to another call), `callnoanswer` (offer voicemail), `callringstop`, `callcmd` (organizer actions aimed at you: mute, camoff, removed, ended, lowerhand, mayunmute, stopshare, stoprec);
  - sharing: `callink` (annotations and pointers), `callctl` (control request / given / denied / taken);
  - settings and voicemail: `callprefs`, `voicemail`, `voicemailstate`;
  - walkie-talkie: `walkie`, `walkiesig`.
- **Existing:** `callstate`, `callring` (now also `fwd`, `xfer`, `parked`, `consult`, `add`), `callsig` (now `fromEp`, `to` = device), `callreact`.
- **Local:** `call:effects`.

## Tests

- `tests/api-calls.js` (16 sections): devices and companion, hands, organizer controls, session rules, ringing / missed / decline / busy / Do not disturb, call log and history, forwarding, voicemail, hold / sharing kinds / annotations / control, recording rules and posting, add people, transfer and consult, park, rating and quality, call settings, walkie-talkie, heartbeat.
- `tests/ui-calls.js` (19 steps, three fake-media browsers):
  - every feature group above, plus the phone layout;
  - axe-core audits of 15 calls screens (set `AXE_JS`);
  - screenshots in `$SHOTS`.
- `tests/electron-calls.js` (Linux + xvfb, ports 9541–9542): two desktop apps, approval, video call, one-click whole-screen share; the red frame and the toolbar; pause and stop from the toolbar; annotations on the real screen.

**Tested on Linux only:** the desktop extras (frame, toolbar, content protection); Windows loopback "computer sound" was not tested.

## Edits outside my area

None. I only added script tags inside my `<!-- area:calls -->` block in `public/index.html`, and `public/js/icons.js` was regenerated from `scripts/icons/calls.txt`. I replaced `LC.ext.panes.calls` from my own file.
