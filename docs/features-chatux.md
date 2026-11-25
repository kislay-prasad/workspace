# Chat experience (chatux area) — sections 1, 7, 14, 15, 16

Status: ✅ done · 🟡 partial (what is missing) · ❌ not done (why). "Where" says where to find it in the app.

## 1. Emoji and fun
| | Feature | Where / how |
|---|---|---|
| ✅ | Emoji search | Emoji button in the message box → type in **Search emoji**. Searches names and keywords of the ~515 emoji the picker offers (Unicode names + common keywords such as "lol", "party", "thanks") and custom emoji by name. Arrow keys move around the grid. |
| ✅ | Skin tones | Hand button next to the search box in the picker → six tones. Applied to people/hand emoji (those that take a tone), remembered in your settings (all devices), also used on the 👍 quick reaction. |
| ✅ | Typing shortcuts | `:)` → 🙂, `:D` → 😃, `;)` → 😉, `:(` → 🙁, `:P`, `:O`, `:'(`, `<3` → ❤️, `</3`, `:|`, `:*`, `B-)`, `xD`, `^_^`, `>:(`, `:-/`, `(y)`, `(n)`, `o/` … converted when you send, never inside code or links. Off: Settings › Appearance › *Chats and messages*. |
| ✅ | Animated emoji | Messages that are only 1–5 emoji pop in and wiggle on hover; quick reactions hop on hover; your new reaction pops. Settings › Appearance › *Reduce motion* (and the system setting) stops all of it. |
| ✅ | More quick reactions on hover | Hover (or tap on phones) a message: 👍 ❤️ 😂 😮 😢 😡 + *More reactions* (full picker) + reply in thread, quote, More. |
| ✅ | Sticker packs with captions | Picker → **Stickers**: five built-in packs (Classic, Cats, Work, Party, Weather) drawn with SVG + emoji, some with built-in labels. Type a caption first; it is drawn on the sticker in meme style. Sent as a small structured message (`m.sticker`), so it stays crisp. |
| ✅ | Meme maker | Message box ⋯ → **Make a meme** (also in the Stickers tab): choose a picture, paste one (Ctrl+V) or pick a recent picture from the chat, type top/bottom text (classic white-with-black-outline, auto-sized) → **Send** sends a JPEG image (`m.meme = 1`). |
| ✅ | Praise | Message box ⋯ → **Praise**: 12 badges (Kind heart, Team player, Problem solver, Leadership, Creative, Coach, Inclusive, Achiever, Courage, Thank you, Helpful, Rock star), pick people from the chat, optional note → a praise card. |
| ✅ | Your own GIF collection | ⋯ on any message with a GIF/picture → **Save to My GIFs** (also in the image viewer). Picker → **My GIFs** tab: click to send, × to remove, *Upload a GIF or picture*. Stored per person on the server; saving copies the file, so it stays when the original message is deleted. |
| ❌ | GIF search from the internet | Not possible: LANChat works without internet and there is no API key. The My GIFs tab says so. |

## 7. Search and commands
| | Feature | Where / how |
|---|---|---|
| ✅ | Highlighted matches | Results page highlights the words; clicking a message result opens the chat, scrolls to the message and highlights the words in the conversation (also used by Find in chat). |
| ✅ | Recent searches | Focus the search box: your last 10 searches (saved in your settings, all devices); **Clear recent searches** at the end. |
| ✅ | Suggestions while typing | Under the search box: *Search for "…"*, people, chats/channels, matching recent searches. Arrow keys + Enter. |
| ✅ | Result tabs | Enter in the search box → a Teams-style results page in the big area: **Messages** (with From / In / Contains / date filters), **People**, **Files**, **Channels**, with counts. Esc or × goes back to the chat. Phones: the search button in the top bar. |
| ✅ | Find in this chat | **Ctrl+F** (or the magnifier in the chat header): find bar with "n of m", Enter = next (older), Shift+Enter = previous, Esc closes. Matches come from the server (up to 500, newest first); older messages are loaded as you go (thread replies open the thread). |
| ✅ | Search inside text files | The Files tab of the results page also matches the contents of uploaded text-like files (.txt .md .csv .tsv .json .log .js .ts .py .go .java .c/.cpp .cs .php .sh .sql .html .css .xml .svg .yml .ini .toml .tex .srt .ics .vcf …, first 1 MB, binary files skipped) that you are allowed to see, with a snippet. Extracted text is cached in memory (24 MB cap). |
| ✅ | Slash commands | Type `/` at the start of the message box (a command list pops up) or in the search box: `/available`, `/away`, `/busy`, `/brb`, `/dnd` (call `POST /api/presence`; the server's error is shown if refused), `/goto <chat>`, `/saved`, `/files`, `/mentions`, `/unread`, `/call <name>` (no name = call this chat), `/keys`, `/help`. Commands without a parameter run as soon as you pick them. Other areas add theirs to `LC.ext.commands` (`'/name' -> { help, run(args), args? }`) and they appear in the list and in `/help`. |

## 14. Chat list
| | Feature | Where / how |
|---|---|---|
| ✅ | Draft pencil | Chats with an unsent draft show a red pencil and "**Draft:** …" as the preview (drafts are kept per device, as before). |
| ✅ | Mark chat as unread | Chat ⋯ (or right-click) → **Mark as unread**: bold with a dot, counts in the Chat badge; stored on the server so it shows on every device; cleared when the chat is read. |
| ✅ | Filters | Chips at the top of the list: **Unread, Chats, Channels, Meetings, Muted, Drafts**; the filter button shows a *Filter by name* box (also matches group members). |
| ✅ | Hide previews | Settings › Appearance › *Chats and messages* → **Hide message previews in the chat list** (saved in your settings). |
| ✅ | Group chat picture | Group chat ⋯ / header ⋯ / group info → **Change picture** (any member): cropped to 128 px, kept on the server (not in uploads), shown in the list and the header; "X changed the group picture". |
| ✅ | Any member can rename a group chat | Header ⋯ → **Rename chat**, chat ⋯, or group info; system line "X renamed the chat to …". Other settings still need the creator or an admin. |
| ✅ | New chat with a To: box | Compose button at the top of the list: add people (type, arrows, Enter; Backspace removes), optional group name, optional first message → 1 person opens your 1:1 chat, yourself = notes to self, 2+ reuses an existing group chat with exactly those people or creates one (named after its members until renamed). |
| ✅ | History when adding people | Group info (people button in the header) → **Add people** → *Don't include chat history* / *Include history from the past N days* / *Include all chat history*. Enforced on the server: a per-member start point hides older messages, threads, search results, file listings and file downloads, chat-list previews and live updates of old messages. |
| ✅ | Chat with yourself | "<name> (You)" at the top of the list (notes to self). |
| ✅ | Delete or leave a chat | Group chat ⋯ → **Leave chat**; 1:1 chat ⋯ → **Delete chat** (removed from your list *and* its history hidden for you, like Teams; it comes back when a new message arrives); creator/admins → **Delete chat for everyone** (with confirmation). |
| ✅ | Meeting chats | Channels with `kind: 'meeting'` appear under Recent with a calendar tile and under the **Meetings** filter. |
| ✅ | Your own sections (drag and drop) | List ⋯ → **New section**; drag chats onto a section header or between its chats; section ⋯ → rename / move up / move down / delete; chat ⋯ → **Move to…** (keyboard way) and Move up/down. Stored in your settings (`prefs.chatSections`). |
| ✅ | Team channels | The list shows people, group chats, meeting chats and channels with `team === ''`; team channels appear only when pinned or put in one of your sections. |
| ✅ | Enter sends / Ctrl+Enter sends | Settings › Appearance › *Chats and messages* → *Sending messages*. Shift+Enter is a new line in both modes; Ctrl+Enter always sends; in the expanded Format box Enter adds a line (Teams-like). |

## 15. Writing messages
| | Feature | Where / how |
|---|---|---|
| ✅ | Formatting toolbar | **Format** button (A with pen) in the message box or **Ctrl+Shift+X** expands the box: bold, italic, underline, strikethrough, highlight, font colour (9 theme-aware colours), font size, paragraph style (Heading 1–3, quote), bullets, numbers, checklist, outdent/indent, link with custom text, table (rows × columns picker), divider, code block (with language), clear formatting, undo/redo, priority, quick replies, live **preview**. Ctrl+B / I / U work in the box. Lists continue on Enter. It writes a markdown-like syntax (`**b**` `*i*` `__u__` `~~s~~` `==hl==` `{color:red}…{/color}` `{size:large}…{/size}` `[text](url)` `# h1` `- [ ]` `---` pipe tables, fenced code) that `render.js` draws — no user HTML is ever stored or injected. The author can tick checklist items in their own messages. |
| ✅ | Coloured code blocks | Fenced code with a language (js, ts, py, json, html/xml, css, sql, sh, java, c/cpp/c#, go and aliases) is coloured (theme-aware) and has a **Copy** button. |
| ✅ | Subject line / posts channels | In channels the expanded box has **Add a subject** (`m.subject`, shown bold above the text). Channels with `kind: 'posts'` show each top-level message as a card with its subject, "N replies from …" (expands inline) and **Reply** (opens the thread); the box there starts with **Start a post**. |
| ✅ | Important / Urgent | Format box "!" or message box ⋯ → *Set delivery options* → Important / Urgent (`m.priority`): orange IMPORTANT! / red URGENT! label and accent on the message. How alerts behave is the people area's. |
| ✅ | Announcements | Message box ⋯ → **Announcement**: headline, optional subheading, banner colour or picture, message → a big announcement card (`m.announce`). |
| 🟡 | Share location | Message box ⋯ → **Share location**: sends coordinates and accuracy; the card has *Open in maps* (OpenStreetMap, needs internet), *Open in a maps app* (`geo:`) and *Copy coordinates*. Partial: it needs the browser's geolocation — the secure `https://` page (the plain `http://` page offers the switch) and location permission; many desktops without GPS/location services (and the desktop app, whose engine uses an online location service) cannot get a position, which the dialog explains. No map image (would need internet tiles). |
| ✅ | Spell check | The message boxes have `spellcheck` on (the shell area adds the desktop spell checker and suggestions). |
| ✅ | Quick (canned) replies | Message box ⋯ or Format box → **Quick replies** → pick one to insert; *Manage quick replies…* to add/edit/delete (up to 30, saved in your settings). |
| ✅ | Messaging rules | `S.settings.messagingRules`: Edit hidden when `edit === false` or past `editMinutes`; Delete hidden for your own messages when `delete === false` (admins keep it); Stickers tab / meme maker / My GIFs and *Save to My GIFs* hidden when `stickers` / `memes` / `gifs` are false. The server also refuses `m.sticker`, `m.meme`, `m.gif` messages when those are off (the teams area enforces the rest). |
| ❌ | AI writing help, voice typing | Not possible offline (no model or speech service on the LAN). |

## 16. Message actions
| | Feature | Where / how |
|---|---|---|
| ✅ | Copy link | Message ⋯ → **Copy link** → `<origin>/#m=<chan>/<msgId>`. Opening the link (at start-up, after signing in, or clicked inside a chat — same-origin links open in place) jumps to and highlights the message; the hash is cleared. |
| ✅ | Mark unread from here | Message ⋯ → **Mark as unread**: your read point moves to just before that message (server), the "New messages" line and unread count come back, and the chat stays unread while you look at it. |
| ✅ | Notifications on/off for a message | Message ⋯ → **Turn off / Turn on notifications** = unfollow / follow its thread (`u.follows`, `u.unfollows`). People who post in a thread or are mentioned in it follow it automatically unless they turned it off. |
| ✅ | Pinned messages at the top | A bar under the header shows the latest pin (click jumps) with **See all** (list with unpin) and × to hide it for this visit. |
| ✅ | See more | Long messages (12+ lines or ~900 characters) are clamped with **See more / See less**. |
| ✅ | More system lines | Created, renamed, topic changed, picture changed, added/removed (with who did it, `actor`/`target`), left, settings, timer, pin, clear, joined — each with an icon (`m.kind`); older lines get an icon from their wording. |
| ✅ | New-replies count | Thread summaries show "N new" (replies since you last opened a thread you follow); posts show it on the replies line. Seen counts are stored on the server. |
| ✅ | Followed threads view | **Followed threads** row at the top of the chat list (badge = threads with new replies; also in the list ⋯ menu): cards with the chat, the first message, reply count, new count and last reply; click opens the thread; bell button stops following. |
| ✅ | Activity item when added | Adding people to a group chat (or creating one) creates `ctx.activity(uid, { type: 'added', from, chan, text })` for each of them. |
| — | Read aloud, Report message | Not this area (shell and teams add them to the message menu). |

## Data I own
- Collections: `db.cxStart` (`[chan][uid] = first visible seq`: history limits and deleted 1:1 chats), `db.cxUnread` (`[uid][chan] = ts`, chats marked unread), `db.cxHidden` (`[uid][chan] = ts`, deleted 1:1 chats), `db.cxThreadSeen` (`[uid][rootId] = reply count when last opened`, max 400 per person), `db.cxPics` (`[chan] = { type, b64, v, by }`, group pictures ≤ 96 KB), `db.cxGifs` (`[uid] = [{ id, name, size, ts, src? }]`, max 60).
- People: `u.follows`, `u.unfollows` (shared contract, max 500 each). Prefs keys: `chatSections`, `skinTone`, `emojiShortcuts`, `sendKey`, `hidePreviews`, `cannedReplies`, `recentSearches` (validated by a wrapper around `POST /api/prefs`).
- Messages: `subject`, `priority`, `announce {title, sub, color, image}`, `location {lat, lon, acc}`, `sticker {p, s, c}`, `praise {b, to, note}`, `meme`, `gif`; system lines get `kind`, `actor`, `target`. Channels: new group chats have `kind: 'group'` and `autoName`; `chanFields` adds `chatPic` (version) and `autoName`.
- This device only (localStorage): drafts (`lc_draft:*`, as before), recent emoji `lc_recent`, `lc_tone`, `lc_codelang`, collapsed sections `lc_collapsed`.
- Old data keeps loading: everything is optional; old system lines get kinds from their wording; old groups without `kind` are treated as group chats.

## API routes (new)
`POST /api/chatux/follow {id, on}` · `POST /api/chatux/thread/seen {id}` · `GET /api/chatux/followed` · `POST /api/chatux/unread {chan, on?}` / `{chan, msg}` · `GET /api/chatux/pins?chan=` · `POST /api/chatux/chat/picture {chan, data}` · `GET /api/chatux/chat/picture?chan=&v=&token=` · `POST /api/chatux/chat/new {members, name?}` · `POST /api/chatux/chat/hide {chan, on?}` · `GET /api/chatux/gifs` · `POST /api/chatux/gifs/save {file}` · `POST /api/chatux/gifs/remove {id}` · `GET /api/chatux/search/files?q=&chan=&from=` · `GET /api/chatux/find?chan=&q=`.
Changed (in my `lib/routes-chat.js`): `POST /api/channel/members` takes `history: 'none' | days | 'all'`; `POST /api/channel/update` lets any member rename a group chat; `POST /api/channel` accepts `kind: 'posts'` for channels; every message-reading route checks per-member history; `POST /api/read` clears "marked unread"; system lines carry kinds. All routes check `canSee`, validate and size-limit input and are rate-limited where they write.

## Client events and hooks
- Live events: `cxunread`, `cxreadset`, `cxfollow`, `cxthread`, `cxhidden`, `cxgifs`. Local: `cx:chat` (a chat opened), `cx:drawn` (messages drawn), `cx:thread`, `cx:draft`, `cx:gifs`. Init carries `d.cx` and a `last` map that respects history limits.
- New registry `LC.ext.composerSetup` (`(composer) => void`), composer API additions (`onRefresh`, `onSent`, `toggleFormat`, `setPriority`, `send({ extra })`).
- Exported helpers other areas can use: `LC.chatEntries`, `LC.entryName`, `LC.chatLead`, `LC.renderChats`, `LC.navItem`, `LC.chatMenu`, `LC.newChatDialog`, `LC.groupInfo`, `LC.setChatFilter`, `LC.moveChat`, `LC.openSearch({q, tab, chan, from, has})`, `LC.openFind`, `LC.highlightText/highlightIn`, `LC.jumpToMessage(chan, id, {q})`, `LC.msgLink`, `LC.runCommand/commandList`, `LC.skinTone`, `LC.openPicker`, `LC.saveGifs`, `LC.isFollowing/setFollow`, `LC.markUnreadFrom`, `LC.markChatUnread`, `LC.isGroupChat`, `LC.isSelfChat`, `LC.isPostsChat`, `LC.chatTitle`, `LC.msgRules/canEditMsg/canDeleteMsg`, `LC.renderInline`, `LC.highlightCode`.
- For other areas: routes that return messages or files should also check `ctx.canSeeMsg(u, m)` (history limits); `m.sticker` / `m.meme` / `m.gif` identify stickers, memes and GIFs for messaging rules.

## Edits outside my area
- `lib/app.js` (core, ~6 lines): hooks `keepFile` (consulted by `gcFiles`) and `canSeeMsg` (used by `fileCanRead` and to filter the recipients of `message`/`update` events), exported `ctx.canSeeMsg`. Needed so history limits are enforced everywhere and saved GIFs survive the hourly clean-up.
- `docs/EXTENDING.md`: two rows in the hooks table for those hooks.
- `public/index.html`: script tags only inside the chatux block. `scripts/icons/chatux.txt` + regenerated `public/js/icons.js`.
- From my own files (no edits to theirs): `LC.chatInfo` (panels.js) is wrapped so group chats get the new group-info dialog (channels and 1:1 chats keep the original); `LC.totalUnread` (core) is wrapped to count chats marked unread; `POST /api/prefs` (routes-auth.js) is wrapped to accept my prefs keys.
- Tests: `tests/ui-smoke.js` (search now opens the results page) and `tests/ui-features.js` (stickers render as sticker art) — same checks, new markup.
- `public/js/chat.js` (mine) also got the people builder's requests: leaving a page that takes over the big area brings the conversation back (`LC.closeApp`), and read-receipt ticks have `role="img"` (render.js).

## Tests
- `tests/api-chatux.js` (14 sections): history limits (messages, threads, search, files, downloads, live updates, previews), N days / all, renames and system kinds, new chats, pictures, hidden 1:1 chats, unread marks, follows and new replies, pins, My GIFs and clean-up, message fields, file-content search, find, prefs validation.
- `tests/ui-chatux.js` (38 steps, port 4110, screenshots in `/tmp/chatux-shots/`): every feature group end to end in two browsers, plus an axe-core audit of the new screens (list, picker tabs, new chat, group info, find bar, results page, suggestions, Format box, posts channel, followed threads; light, dark and high contrast) when `AXE_JS` is set.
