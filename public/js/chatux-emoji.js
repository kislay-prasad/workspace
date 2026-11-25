'use strict';
// Emoji and fun (chatux area): emoji picker with search and skin tones, typed shortcuts (:) → 🙂), sticker packs with captions,
// My GIFs (saved per person on the server), meme maker, praise badges. GIF search from the internet is not possible offline.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_pickerTitle: 'Emoji, GIFs and stickers', cx_searchEmoji: 'Search emoji', cx_tabEmoji: 'Emoji', cx_tabGifs: 'My GIFs', cx_tabStickers: 'Stickers', cx_skinTone: 'Skin tone', cx_tone0: 'Default', cx_tone1: 'Light', cx_tone2: 'Medium-light',
    cx_tone3: 'Medium', cx_tone4: 'Medium-dark', cx_tone5: 'Dark', cx_catSmileys: 'Smileys', cx_catPeople: 'People and hands', cx_catNature: 'Animals and nature', cx_catFood: 'Food and drink', cx_catActivity: 'Activities',
    cx_catTravel: 'Travel and places', cx_catObjects: 'Objects', cx_catSymbols: 'Hearts and symbols', cx_noEmojiFound: 'No emoji found.', cx_noGifs: 'No GIFs yet. Use ⋯ → Save to My GIFs on any GIF or picture in a chat, or upload one.',
    cx_gifNoSearch: 'GIF search needs the internet, so LANChat keeps your own collection instead.', cx_uploadGif: 'Upload a GIF or picture', cx_removeGif: 'Remove from My GIFs', cx_sendGif: 'Send {name}', cx_caption: 'Add a caption (optional)',
    cx_stickerCaption: 'Caption', cx_makeMeme: 'Make a meme', cx_memeTitle: 'Meme maker', cx_memePick: 'Choose a picture', cx_memePaste: 'or paste one (Ctrl+V), or pick one from this chat:', cx_memeTop: 'Top text', cx_memeBottom: 'Bottom text',
    cx_memeNeedPic: 'Choose a picture first.', cx_memePreview: 'Meme preview', cx_praise: 'Praise', cx_praiseTitle: 'Send praise', cx_praiseWho: 'Who are you praising?', cx_praiseNote: 'Add a note (optional)', cx_praisePick: 'Pick a badge',
    cx_praiseNeedPeople: 'Pick at least one person.', cx_praiseFor: 'Praise for {names}', cx_praiseFrom: 'from {name}', cx_sendPraise: 'Send praise', cx_stickersOff: 'Stickers are turned off in this session.', cx_gifsOff: 'GIFs are turned off in this session.', cx_memesOff: 'Memes are turned off in this session.',
    cx_b_kind: 'Kind heart', cx_b_team: 'Team player', cx_b_problem: 'Problem solver', cx_b_leader: 'Leadership', cx_b_creative: 'Creative', cx_b_coach: 'Coach', cx_b_inclusive: 'Inclusive', cx_b_achiever: 'Achiever', cx_b_courage: 'Courage',
    cx_b_thanks: 'Thank you', cx_b_helper: 'Helpful', cx_b_star: 'Rock star', cx_pk_classic: 'Classic', cx_pk_cats: 'Cats', cx_pk_work: 'Work', cx_pk_party: 'Party', cx_pk_seasons: 'Weather',
    cx_st_onit: 'On it!', cx_st_done: 'Done!', cx_st_coffee: 'Coffee?', cx_st_ship: 'Ship it', cx_st_meeting: 'Meeting?', cx_st_bug: 'Found a bug', cx_st_deal: 'Deal!', cx_st_thanks: 'Thanks!', cx_st_brb: 'BRB', cx_st_lol: 'LOL', cx_st_yay: 'Yay!', cx_st_nope: 'Nope',
    cx_sticker: 'Sticker', cx_sendSticker: 'Send sticker: {name}', cx_saving: 'Saving…',
  });
  LC.addStrings('hi', { cx_searchEmoji: 'इमोजी खोजें', cx_tabEmoji: 'इमोजी', cx_tabGifs: 'मेरे GIF', cx_tabStickers: 'स्टिकर', cx_skinTone: 'त्वचा का रंग', cx_makeMeme: 'मीम बनाएँ', cx_praise: 'प्रशंसा', cx_sendPraise: 'प्रशंसा भेजें' });
  LC.addStrings('es', { cx_pickerTitle: 'Emoji, GIF y adhesivos', cx_searchEmoji: 'Buscar emoji', cx_tabEmoji: 'Emoji', cx_tabGifs: 'Mis GIF', cx_tabStickers: 'Adhesivos', cx_skinTone: 'Tono de piel', cx_noEmojiFound: 'No se encontraron emoji.', cx_caption: 'Agrega un texto (opcional)', cx_makeMeme: 'Crear un meme', cx_memeTitle: 'Creador de memes', cx_memeTop: 'Texto superior', cx_memeBottom: 'Texto inferior', cx_praise: 'Elogio', cx_praiseTitle: 'Enviar un elogio', cx_sendPraise: 'Enviar elogio', cx_praiseWho: '¿A quién elogias?', cx_b_kind: 'Buen corazón', cx_b_team: 'Trabajo en equipo', cx_b_thanks: 'Gracias' });

  // emoji offered by the picker, with names and keywords for search (Unicode names + common keywords)
  const EMOJI_DATA = [["😀", "😀 grinning happy smile grin|😃 smiling open mouth happy smile|😄 smiling open mouth and eyes happy smile laugh|😁 grinning smiling eyes grin happy|😆 smiling open mouth and tightly-closed eyes laugh lol haha|😅 smiling open mouth and cold sweat nervous laugh|🤣 rolling on the floor laughing rofl lol|😂 tears of joy lol laugh haha|🙂 slightly smiling smile happy|🙃 upside-down upside down silly|😉 winking wink|😊 smiling eyes blush smile happy|😇 smiling halo angel innocent|🥰 smiling eyes and three hearts love adore|😍 smiling heart-shaped eyes love heart crush|🤩 grinning star eyes struck wow|😘 throwing a kiss love|😗 kissing kiss|😚 kissing closed eyes kiss|😙 kissing smiling eyes kiss|😋 savouring delicious food yum tasty|😛 stuck-out tongue silly|😜 stuck-out tongue and winking eye wink crazy|🤪 grinning one large and small eye crazy zany silly|😝 stuck-out tongue and tightly-closed eyes silly|🤑 money-mouth money rich|🤗 hugging hug hugs|🤭 smiling eyes and hand covering mouth oops giggle|🤫 finger covering closed lips shh quiet secret|🤔 thinking think hmm|🤐 zipper-mouth zip quiet secret|🤨 one eyebrow raised suspicious|😐 neutral meh|😑 expressionless meh|😶 without mouth speechless|😏 smirking smirk|😒 unamused meh|🙄 rolling eyes eyeroll eye roll whatever|😬 grimacing grimace awkward|😮‍💨 open mouth dash|🤥 lying|😌 relieved calm|😔 pensive sad|😪 sleepy|🤤 drooling drool|😴 sleeping sleep zzz tired|😷 medical mask sick|🤒 thermometer sick fever|🤕 head-bandage hurt injured|🤢 nauseated nauseous sick|🤮 open mouth vomiting vomit sick|🤧 sneezing sneeze sick|🥵 overheated hot heat|🥶 freezing cold|🥴 uneven eyes and wavy mouth woozy dizzy drunk|😵 dizzy|🤯 shocked exploding head mind blown|🤠 cowboy hat|🥳 party horn and hat celebrate birthday|😎 smiling sunglasses cool|🤓 nerd geek|🧐 monocle inspect|😕 confused|😟 worried|🙁 slightly frowning sad frown|☹️ white frowning sad frown|😮 open mouth wow surprised|😯 hushed surprised|😲 astonished shocked|😳 flushed embarrassed|🥺 pleading eyes puppy please|😦 frowning open mouth frown|😧 anguished anguish|😨 fearful fear scared|😰 open mouth and cold sweat anxious|😥 disappointed but relieved sad|😢 crying cry sad tear|😭 loudly crying sob cry sad|😱 screaming in fear scream scared shock|😖 confounded|😣 persevering persevere|😞 disappointed sad|😓 cold sweat|😩 weary tired|😫 tired|🥱 yawning yawn bored tired|😤 look of triumph angry huff|😡 pouting angry mad rage pout|😠 angry mad|🤬 serious symbols covering mouth swear cursing angry|😈 smiling horns devil evil|👿 imp devil angry|💀 skull dead|💩 pile of poo poop|🤡 clown|👻 ghost boo|👽 extraterrestrial alien|🤖 robot bot"], ["👋", "👋 waving hand wave hello hi bye|🤚 raised back of hand|🖐 raised hand fingers splayed|✋ raised hand stop high five|🖖 raised hand part between middle and ring fingers vulcan spock|👌 ok hand perfect|🤌 pinched fingers italian|🤏 pinching hand pinch small|✌️ victory hand peace|🤞 hand index and middle fingers crossed luck|🤟 i love you hand|🤘 of the horns rock metal|🤙 call me hand shaka|👈 white left pointing backhand index point|👉 white right pointing backhand index point|👆 white up pointing backhand index point|👇 white down pointing backhand index point|☝️ white up pointing index point|👍 thumbs up yes like ok good +1|👎 thumbs down no dislike -1|✊ raised fist|👊 fisted hand punch fist bump|🤛 left-facing fist bump|🤜 right-facing fist bump|👏 clapping hands clap applause bravo|🙌 person raising both hands in celebration hooray raise celebrate|👐 open hands|🤲 palms up together|🤝 handshake deal agree|🙏 person folded hands pray thanks please high five|✍️ writing hand write|💅 nail polish nails|🤳 selfie|💪 flexed biceps strong muscle flex|🦾 mechanical arm robot|🧠 brain smart|👀 eyes look see|👅 tongue|👄 mouth lips|👶 baby|🧒 child kid|👦 boy|👧 girl|🧑 adult person|👨 man|👩 woman|🧔 bearded person beard|👴 older man old grandpa|👵 older woman old grandma|🙍 person frowning frown|🙎 person pouting pout|🙅 no good gesture|🙆 ok gesture|💁 information desk person tipping hand info|🙋 happy person raising one hand raise hi|🧏 deaf person|🙇 person bowing deeply bow|🤦 palm facepalm|🤷 shrug dunno|💃 dancer dance party|🕺 man dancing dance disco|👯 woman bunny ears party|🧘 person in lotus position yoga meditate calm|🏃 runner run running|🚶 pedestrian walk"], ["🐶", "🐶 dog puppy|🐱 cat kitty|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🙈 see-no-evil monkey see no evil|🙉 hear-no-evil monkey hear no evil|🙊 speak-no-evil monkey speak no evil|🐔 chicken|🐧 penguin|🐦 bird|🐤 baby chick|🦆 duck|🦅 eagle|🦉 owl|🦇 bat|🐺 wolf|🐗 boar|🐴 horse|🦄 unicorn magic|🐝 honeybee bee|🐛 bug caterpillar|🦋 butterfly|🐌 snail slow|🐞 lady beetle ladybug|🐜 ant|🐢 turtle slow|🐍 snake|🦎 lizard|🐙 octopus|🦑 squid|🦀 crab|🐠 tropical fish|🐟 fish|🐬 dolphin|🐳 spouting whale|🦈 shark|🐊 crocodile|🐘 elephant|🦒 giraffe|🦘 kangaroo|🐕 dog|🐈 cat|🌵 cactus|🎄 christmas tree xmas|🌲 evergreen tree|🌴 palm tree beach|🌱 seedling plant grow|🍀 four leaf clover luck|🍁 maple leaf autumn|🍄 mushroom|🌸 cherry blossom flower spring|🌹 rose flower love|🌻 sunflower|🌼 blossom flower|🌈 rainbow pride|☀️ black sun rays sunny weather|🌤 white sun small cloud weather|⛅ sun behind cloud cloudy weather|🌧 cloud rain weather|⚡ high voltage lightning zap electric|❄️ snowflake snow cold winter|🔥 fire hot lit flame|💧 droplet drop water|🌊 water wave ocean sea"], ["🍔", "🍏 green apple|🍎 red apple|🍐 pear|🍊 tangerine orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwifruit kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🥕 carrot|🌽 ear of maize corn|🌶 hot pepper chili spicy|🥔 potato|🍞 bread|🥐 croissant|🧀 cheese wedge|🥚 egg|🍳 cooking egg breakfast|🥞 pancakes|🥓 bacon|🥩 cut of meat steak|🍗 poultry leg chicken|🍖 meat on bone|🌭 hot dog|🍔 hamburger burger|🍟 french fries chips|🍕 slice of pizza|🥪 sandwich|🌮 taco|🌯 burrito|🍜 steaming bowl ramen noodles|🍝 spaghetti pasta|🍣 sushi|🍱 bento box|🍛 curry and rice|🍤 fried shrimp tempura|🍙 rice ball|🍚 cooked rice|🍦 soft ice cream|🍩 doughnut donut|🍪 cookie|🎂 birthday cake|🍰 shortcake cake|🧁 cupcake|🍫 chocolate bar|🍬 candy sweet|🍭 lollipop|☕ hot beverage coffee tea drink|🍵 teacup without handle tea|🥤 cup straw soda drink|🍺 beer mug|🍻 clinking beer mugs cheers beers|🥂 clinking glasses cheers champagne toast|🍷 wine glass|🍸 cocktail glass|🍹 tropical drink"], ["⚽", "⚽ soccer ball football|🏀 basketball and hoop|🏈 american football|⚾ baseball|🎾 tennis racquet and ball|🏐 volleyball|🏉 rugby football|🎱 billiards pool 8 ball|🏓 table tennis paddle and ball ping pong|🏸 badminton racquet and shuttlecock|🥊 boxing glove|🥋 martial arts uniform|⛳ flag in hole golf|🏹 bow and arrow archery|🎣 fishing pole and fish|🎮 video game controller gaming|🕹 joystick game|🎲 game die dice|♟ black chess pawn|🎯 direct hit target bullseye dart|🎳 bowling|🎰 slot machine|🧩 jigsaw puzzle piece|🎨 artist palette art paint|🎭 performing arts theater drama|🎬 clapper board movie film|🎤 microphone sing karaoke|🎧 headphone headphones music|🎼 musical score music|🎹 musical keyboard piano|🥁 drum drumsticks|🎷 saxophone|🎺 trumpet|🎸 guitar rock|🎻 violin|🏆 trophy win winner champion|🥇 first place medal gold|🥈 second place medal silver|🥉 third place medal bronze|🏅 sports medal|🎖 military medal|🎫 ticket|🎟 admission tickets|🎪 circus tent"], ["🚗", "🚗 automobile car|🚕 taxi|🚙 recreational vehicle suv car|🚌 bus|🚎 trolleybus|🏎 racing car race fast|🚓 police car|🚑 ambulance|🚒 fire engine|🚚 delivery truck|🚜 tractor|🛵 motor scooter|🏍 racing motorcycle|🚲 bicycle bike|🛴 scooter kick|✈️ airplane plane flight travel|🛫 airplane departure takeoff|🛬 airplane arriving arrival landing|🚀 rocket launch ship it|🛸 flying saucer ufo|🚁 helicopter|⛵ sailboat|🚤 speedboat|🚢 ship|🚂 steam locomotive train|🚆 train|🚇 metro subway|🏠 house building home|🏡 house garden home|🏢 office building|🏥 hospital|🏫 school|🏰 european castle|🗼 tokyo tower|🗽 statue of liberty|⛰ mountain|🌋 volcano|🏖 beach umbrella|🏝 desert island|🏕 camping|🌍 earth globe europe-africa world|🌎 earth globe americas world|🌏 earth globe asia-australia world|🗺 world map|🧭 compass"], ["💡", "⌚ watch time|📱 mobile phone|💻 personal computer laptop|⌨️ keyboard|🖥 desktop computer|🖨 printer|🖱 three button mouse computer|💽 minidisc disk|💾 floppy disk save|📷 camera photo|📹 video camera|🎥 movie camera|📞 telephone receiver phone call|☎️ black telephone|📺 television tv|📻 radio|⏰ alarm clock|🔋 battery|🔌 electric plug|💡 electric light bulb idea|🔦 electric torch flashlight|🕯 candle|💰 money bag|💳 credit card|💎 gem stone diamond|🔧 wrench tool fix|🔨 hammer tool|🛠 hammer and wrench tools|⚙️ gear settings|🔫 pistol water|💣 bomb|🔪 hocho knife|🛡 shield|🔮 crystal ball magic|💊 pill medicine|💉 syringe vaccine|🧬 dna double helix|🔬 microscope science|🔭 telescope|📡 satellite antenna|🧹 broom clean|🧺 basket laundry|🧻 roll of paper toilet|🚽 toilet|🛁 bathtub bath|🔑 key|🗝 old key|🚪 door|🛋 couch and lamp sofa|🎁 wrapped present gift|🎈 balloon party|🎉 party popper tada celebrate congrats|🎊 confetti ball celebrate|📦 package box|✉️ envelope mail letter|📧 e-mail email|📝 memo note write|📁 file folder|📅 calendar date|📌 pushpin pin|📎 paperclip attach|✂️ black scissors cut|🔒 lock locked|🔓 open lock unlock"], ["❤", "❤️ heavy black heart love red|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|❣️ heavy heart exclamation mark ornament|💕 two hearts love|💞 revolving hearts|💓 beating heart|💗 growing heart|💖 sparkling heart|💘 heart arrow cupid|💝 heart ribbon gift|✨ sparkles shiny magic|⭐ white medium star|🌟 glowing star|💫 dizzy star|💥 collision boom|💢 anger|💦 splashing sweat drops|💨 dash fast|💬 speech balloon bubble chat|💭 thought balloon bubble|🔔 bell notification|🔕 bell cancellation stroke no mute|✅ white heavy check mark done yes|❌ cross mark no wrong|⭕ heavy large circle|❗ heavy exclamation mark important|❓ black question mark ornament|‼️ double exclamation mark|⚠️ warning caution|🚫 no entry prohibited|♻️ black universal recycling recycle|➕ heavy plus add|➖ heavy minus|➗ heavy division divide|✖️ heavy multiplication x multiply|💯 hundred points 100 perfect|🔞 no one under eighteen adults only|🆗 squared ok|🆒 squared cool|🆕 squared new|🆓 squared free|▶️ black right-pointing triangle play|⏸ double vertical bar pause|⏹ black square for stop|🔁 clockwise rightwards and leftwards open circle arrows repeat|🔀 twisted rightwards arrows shuffle|⬆️ upwards black arrow up|⬇️ downwards black arrow down|⬅️ leftwards black arrow left|➡️ black rightwards arrow right|🔝 top upwards arrow above"]];
  const CAT_NAMES = ['cx_catSmileys', 'cx_catPeople', 'cx_catNature', 'cx_catFood', 'cx_catActivity', 'cx_catTravel', 'cx_catObjects', 'cx_catSymbols'];
  const CATS = EMOJI_DATA.map(([icon, list], i) => ({ icon, name: CAT_NAMES[i], items: list.split('|').map((x) => { const sp = x.indexOf(' '); return { e: x.slice(0, sp), k: x.slice(sp + 1) }; }) }));
  const KEYS = new Map(); for (const c of CATS) for (const it of c.items) KEYS.set(it.e, it.k);
  const nameOf = (e) => (KEYS.get(e.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')) || '').split(' ').slice(0, 4).join(' ') || e;
  const rules = () => LC.msgRules();

  // ---------- skin tones (people and hand emoji); remembered in your settings ----------
  const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
  const toneNow = () => { const p = LC.prefs().skinTone; return Number.isInteger(p) ? p : LC.ls.get('lc_tone', 0) || 0; };
  LC.skinTone = (e, tone = toneNow()) => {
    if (!tone || !e) return e; const cps = [...e];
    if (!/\p{Emoji_Modifier_Base}/u.test(cps[0]) || /[\u{1F3FB}-\u{1F3FF}]/u.test(e) || cps.includes('‍')) return e;
    return cps[0] + TONES[tone] + cps.slice(1).filter((c) => c !== '️').join('');
  };
  const setTone = (n) => { LC.ls.set('lc_tone', n); if (S.me) { S.me.prefs.skinTone = n; LC.setPrefs({ skinTone: n }); } };

  // ---------- typed shortcuts → emoji (on send; never inside code or links) ----------
  const SHORT = [[':-)', '🙂'], [':)', '🙂'], [':-(', '🙁'], [':(', '🙁'], [':-D', '😃'], [':D', '😃'], [';-)', '😉'], [';)', '😉'], [':-P', '😛'], [':P', '😛'], [':p', '😛'], [":'(", '😢'], [':-O', '😮'], [':O', '😮'], [':o', '😮'],
    ['</3', '💔'], ['<3', '❤️'], [':|', '😐'], [':-*', '😘'], [':*', '😘'], ['B-)', '😎'], ['8-)', '😎'], ['xD', '😆'], ['XD', '😆'], ['^_^', '😊'], ['>:(', '😠'], [':-/', '😕'], ['(y)', '👍'], ['(Y)', '👍'], ['(n)', '👎'], ['o/', '👋']];
  const SHORT_RE = new RegExp('(^|\\s)(' + SHORT.map(([k]) => k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') + ')(?=$|\\s|[.,!?])', 'g'), SHORT_MAP = new Map(SHORT);
  LC.emojiShortcuts = (text) => String(text).split(/(```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+)/g).map((seg, i) => (i % 2 ? seg : seg.replace(SHORT_RE, (all, lead, k) => lead + (SHORT_MAP.get(k) || k)))).join('');
  LC.ext.beforeSend.push((body) => { if (body.text && LC.prefs().emojiShortcuts !== false && !body.sendAt) body.text = LC.emojiShortcuts(body.text); });

  // ---------- stickers: built-in packs drawn with SVG + emoji, with an optional caption on top ----------
  const P = (id, icon, items) => ({ id, icon, items: items.map(([s, e, bg, shape, label, acc]) => ({ s, e, bg, shape, label, acc })) });
  const PACKS = [
    P('classic', '😂', [['lol', '😂', '#ffb900', 'burst', 'cx_st_lol'], ['love', '🥰', '#ff6b9a', 'blob'], ['cool', '😎', '#4f6bed', 'blob'], ['think', '🤔', '#a17fe0', 'cloud'], ['cry', '😭', '#5aa9e6', 'blob'], ['party', '🥳', '#e3008c', 'burst', 'cx_st_yay'],
      ['mind', '🤯', '#ca5010', 'burst'], ['sleep', '😴', '#7a7574', 'cloud'], ['eyeroll', '🙄', '#8a8886', 'blob', 'cx_st_nope'], ['thumbs', '👍', '#13a10e', 'burst'], ['clap', '👏', '#ffaa44', 'blob'], ['pray', '🙏', '#038387', 'blob', 'cx_st_thanks'],
      ['strong', '💪', '#d13438', 'burst'], ['fire', '🔥', '#ff8c00', 'burst'], ['hundred', '💯', '#c239b3', 'blob'], ['eyes', '👀', '#00b7c3', 'cloud']]),
    P('cats', '🐱', [['wave', '🐱', '#f7a8b8', 'blob', 'cx_st_thanks', '👋'], ['coffee', '😺', '#c19c00', 'blob', 'cx_st_coffee', '☕'], ['work', '🐈', '#6264a7', 'cloud', 'cx_st_onit', '💻'], ['party', '😸', '#e3008c', 'burst', 'cx_st_yay', '🎉'],
      ['love', '😻', '#ff6b9a', 'blob', null, '❤️'], ['sleep', '😿', '#8764b8', 'cloud', 'cx_st_brb', '💤'], ['shock', '🙀', '#ffb900', 'burst'], ['grumpy', '😾', '#7a7574', 'blob', 'cx_st_nope']]),
    P('work', '💼', [['onit', '🫡', '#0078d4', 'burst', 'cx_st_onit'], ['done', '✅', '#13a10e', 'blob', 'cx_st_done'], ['coffee', '☕', '#8e562e', 'cloud', 'cx_st_coffee'], ['ship', '🚀', '#4f6bed', 'burst', 'cx_st_ship'],
      ['meeting', '📅', '#ca5010', 'blob', 'cx_st_meeting'], ['bug', '🐛', '#498205', 'cloud', 'cx_st_bug'], ['deal', '🤝', '#038387', 'burst', 'cx_st_deal'], ['brb', '🏃', '#8764b8', 'blob', 'cx_st_brb']]),
    P('party', '🎉', [['tada', '🎉', '#e3008c', 'burst', 'cx_st_yay'], ['cake', '🎂', '#ff6b9a', 'blob'], ['pizza', '🍕', '#ffaa44', 'burst'], ['balloon', '🎈', '#d13438', 'cloud'], ['cheers', '🍻', '#c19c00', 'blob'], ['dance', '💃', '#c239b3', 'burst'],
      ['disco', '🕺', '#4f6bed', 'burst'], ['gift', '🎁', '#13a10e', 'blob', 'cx_st_thanks']]),
    P('seasons', '🌈', [['sun', '☀️', '#ffb900', 'burst'], ['rain', '🌧️', '#5aa9e6', 'cloud'], ['snow', '⛄', '#00b7c3', 'blob'], ['rainbow', '🌈', '#8764b8', 'cloud'], ['storm', '⛈️', '#605e5c', 'cloud'], ['hot', '🥵', '#d13438', 'burst']]),
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const shapeEl = (shape, fill) => {
    const a = { fill, stroke: '#fff', 'stroke-width': '6', 'paint-order': 'stroke' };
    if (shape === 'burst') { const pts = []; for (let i = 0; i < 24; i++) { const r = i % 2 ? 44 : 54, ang = (Math.PI * 2 * i) / 24; pts.push((60 + r * Math.cos(ang)).toFixed(1) + ',' + (58 + r * Math.sin(ang)).toFixed(1)); } return sv('polygon', { ...a, points: pts.join(' ') }); }
    if (shape === 'cloud') return sv('path', { ...a, d: 'M28 86a20 20 0 0 1 2-39 26 26 0 0 1 48-10 22 22 0 0 1 32 22 18 18 0 0 1-6 27z' });
    return sv('rect', { ...a, x: '10', y: '8', width: '100', height: '100', rx: '34' });
  };
  const wrapCaption = (c) => { const words = String(c).toUpperCase().split(/\s+/), lines = ['']; for (const w of words) { if ((lines[lines.length - 1] + ' ' + w).trim().length > 16 && lines.length < 3) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); } return lines.filter(Boolean).slice(-3); };
  LC.stickerSvg = (st, caption) => {
    const svg = sv('svg', { viewBox: '0 0 120 120', class: 'cx-stsvg', 'aria-hidden': 'true', focusable: 'false' });
    if (!st) { svg.append(shapeEl('blob', '#8a8886'), sv('text', { x: '60', y: '62', 'font-size': '50', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '🖼️')); }
    else {
      svg.append(shapeEl(st.shape, st.bg), sv('circle', { cx: '60', cy: '56', r: '30', fill: '#fff', opacity: '.22' }), sv('text', { x: '60', y: st.label ? '50' : '58', 'font-size': st.label ? '46' : '56', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, st.e));
      if (st.acc) svg.append(sv('text', { x: '92', y: '84', 'font-size': '28', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, st.acc));
      if (st.label) svg.append(sv('text', { x: '60', y: '90', class: 'cx-stlabel', 'font-size': '15', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, t(st.label)));
    }
    if (caption) { const lines = wrapCaption(caption), size = lines.some((l) => l.length > 12) ? 11 : 13; lines.forEach((l, i) => svg.append(sv('text', { x: '60', y: String(118 - (lines.length - 1 - i) * (size + 1) - 2), class: 'cx-stcap', 'font-size': String(size), 'text-anchor': 'middle' }, l))); }
    return svg;
  };
  const findSticker = (p, s) => { const pk = PACKS.find((x) => x.id === p); return pk ? pk.items.find((x) => x.s === s) : null; };
  const stickerName = (st) => (st ? nameOf(st.e) + (st.label ? ' — ' + t(st.label) : '') : t('cx_sticker'));
  LC.stickerEl = (m) => { const st = findSticker(m.sticker.p, m.sticker.s); return el('div', { class: 'cx-sticker', role: 'img', 'aria-label': t('cx_sticker') + ': ' + stickerName(st) + (m.sticker.c ? ' — ' + m.sticker.c : '') }, LC.stickerSvg(st, m.sticker.c)); };

  // ---------- praise badges ----------
  const BADGES = [['kind', '💗', '#e3008c'], ['team', '🤝', '#0078d4'], ['problem', '🧩', '#498205'], ['leader', '🧭', '#ca5010'], ['creative', '🎨', '#8764b8'], ['coach', '📣', '#038387'], ['inclusive', '🌈', '#4f6bed'], ['achiever', '🏆', '#c19c00'], ['courage', '🦁', '#d13438'], ['thanks', '🙏', '#6264a7'], ['helper', '🛟', '#00b7c3'], ['star', '⭐', '#ffaa44']];
  const badgeArt = (b, size = 72) => { const x = BADGES.find((y) => y[0] === b) || BADGES[0], svg = sv('svg', { viewBox: '0 0 80 80', width: String(size), height: String(size), class: 'cx-badge', 'aria-hidden': 'true', focusable: 'false' }); svg.append(sv('circle', { cx: '40', cy: '40', r: '36', fill: x[2] }), sv('circle', { cx: '40', cy: '40', r: '28', fill: '#fff', opacity: '.25' }), sv('circle', { cx: '40', cy: '40', r: '36', fill: 'none', stroke: '#fff', 'stroke-width': '3', 'stroke-dasharray': '4 5' }), sv('text', { x: '40', y: '42', 'font-size': '34', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, x[1])); return svg; };
  LC.praiseEl = (m) => {
    const p = m.praise, x = BADGES.find((y) => y[0] === p.b) || BADGES[0], names = p.to.map((id) => LC.uname(id)).join(', ');
    return el('div', { class: 'cx-praise', style: { '--cx-badge': x[2] } }, el('div', { class: 'cx-praisehead' }, badgeArt(p.b), el('div', {}, el('div', { class: 'cx-praisetitle', text: t('cx_b_' + p.b) }), el('div', { class: 'cx-praisefor', text: t('cx_praiseFor', { names }) }))),
      p.note ? el('div', { class: 'cx-praisenote' }, LC.renderInline(p.note)) : null, el('div', { class: 'muted small', text: t('cx_praiseFrom', { name: LC.uname(m.from) }) }));
  };
  LC.praiseDialog = (composer) => {
    const chan = composer.cfg.chan(), c = S.channels.get(chan);
    const cand = [...S.users.values()].filter((u) => !u.removed && !u.deleted && u.id !== S.me.id && (chan.startsWith('dm:') ? chan.split(':').includes(u.id) : !c || !c.members || c.members.includes(u.id)));
    let badge = 'kind'; const picked = new Set(chan.startsWith('dm:') && cand.length === 1 ? [cand[0].id] : []);
    const grid = el('div', { class: 'cx-badges', role: 'radiogroup', 'aria-label': t('cx_praisePick') }), note = el('textarea', { rows: 3, maxlength: 500, placeholder: t('cx_praiseNote'), 'aria-label': t('cx_praiseNote'), spellcheck: 'true' });
    const drawGrid = () => grid.replaceChildren(...BADGES.map(([b]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(b === badge), class: 'cx-badgebtn' + (b === badge ? ' on' : ''), onclick: () => { badge = b; drawGrid(); } }, badgeArt(b, 48), el('span', { text: t('cx_b_' + b) }))));
    const q = el('input', { type: 'search', placeholder: t('cx_toPh'), 'aria-label': t('cx_praiseWho') }), list = el('div', { class: 'people cx-people', role: 'group', 'aria-label': t('cx_praiseWho') });
    const drawList = () => list.replaceChildren(...cand.filter((u) => LC.uname(u.id).toLowerCase().includes(q.value.trim().toLowerCase())).map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', checked: picked.has(u.id), onchange: (e) => (e.target.checked ? picked.add(u.id) : picked.delete(u.id)) }), LC.avatar(u, 'sm', true), LC.uname(u.id))));
    q.addEventListener('input', drawList); drawGrid(); drawList();
    LC.modal([el('h2', {}, LC.icon('ribbon_star'), ' ' + t('cx_praiseTitle')), el('h3', { text: t('cx_praisePick') }), grid, el('h3', { text: t('cx_praiseWho') }), q, list, note,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('cx_sendPraise'), onclick: () => { if (!picked.size) return LC.toast(t('cx_praiseNeedPeople')); LC.closeModal(); composer.send({ force: true, extra: { praise: { b: badge, to: [...picked], note: note.value } } }); } }))], { wide: true, label: t('cx_praiseTitle') });
  };

  // ---------- My GIFs ----------
  const loadGifs = async () => { if (!S.cx.gifs) { try { S.cx.gifs = (await LC.api('/api/chatux/gifs')).gifs; } catch { S.cx.gifs = []; } } return S.cx.gifs; };
  LC.saveGifs = async (files) => { for (const f of files) { try { const r = await LC.api('/api/chatux/gifs/save', { file: f.id }); LC.toast(t('cx_gifSaved'), { ms: 1600 }); void r; } catch (e) { LC.toast(e.message); } } };
  const uploadGif = (after) => {
    const inp = el('input', { type: 'file', accept: 'image/gif,image/png,image/jpeg,image/webp', class: 'hidden' }); document.body.append(inp);
    inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); if (!f) return; try { LC.toast(t('cx_saving'), { ms: 1200 }); const up = await LC.upload(f, f.name || 'gif.gif').promise; await LC.api('/api/chatux/gifs/save', { file: up.id }); S.cx.gifs = null; if (after) after(); } catch (e) { LC.toast(e.message); } });
    inp.click();
  };

  // ---------- meme maker: a picture with classic top/bottom text, sent as an image ----------
  LC.memeDialog = (composer) => {
    if (rules().memes === false) return LC.toast(t('cx_memesOff'));
    let img = null; const cv = el('canvas', { class: 'cx-memecv', width: 600, height: 400, role: 'img', 'aria-label': t('cx_memePreview') }), top = el('input', { maxlength: 80, placeholder: t('cx_memeTop'), 'aria-label': t('cx_memeTop') }), bottom = el('input', { maxlength: 80, placeholder: t('cx_memeBottom'), 'aria-label': t('cx_memeBottom') });
    const draw = () => {
      const g = cv.getContext('2d'); if (!img) { g.fillStyle = '#3d3d3d'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(t('cx_memePick'), cv.width / 2, cv.height / 2); return; }
      const k = Math.min(1, 900 / Math.max(img.width, img.height)); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); g.drawImage(img, 0, 0, cv.width, cv.height);
      const line = (text, atTop) => {
        text = text.trim().toUpperCase(); if (!text) return; let size = Math.round(cv.width / 9); g.textAlign = 'center'; g.lineJoin = 'round';
        const words = text.split(/\s+/), lines = [];
        for (;;) { g.font = `900 ${size}px Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif`; lines.length = 0; let cur = ''; for (const w of words) { const n = cur ? cur + ' ' + w : w; if (g.measureText(n).width > cv.width * 0.94 && cur) { lines.push(cur); cur = w; } else cur = n; } lines.push(cur); if ((lines.length <= 2 && lines.every((l) => g.measureText(l).width <= cv.width * 0.94)) || size < 14) break; size -= 4; }
        g.lineWidth = Math.max(2, size / 8); g.strokeStyle = '#000'; g.fillStyle = '#fff';
        lines.forEach((l, i) => { const y = atTop ? size * (i + 1) + 6 : cv.height - 10 - (lines.length - 1 - i) * size * 1.02; g.strokeText(l, cv.width / 2, y); g.fillText(l, cv.width / 2, y); });
      };
      line(top.value, true); line(bottom.value, false);
    };
    const useBlob = (blob) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { img = im; draw(); URL.revokeObjectURL(u); }; im.onerror = () => LC.toast(t('cx_picFailed')); im.src = u; };
    const file = el('input', { type: 'file', accept: 'image/*', 'aria-label': t('cx_memePick'), onchange: (e) => { if (e.target.files[0]) useBlob(e.target.files[0]); } });
    const recent = LC.galleryImages().slice(-8).reverse(), strip = el('div', { class: 'cx-memestrip' }, recent.map((f) => el('button', { type: 'button', class: 'cx-memepick', 'aria-label': f.name, onclick: async () => { try { useBlob(await (await fetch(LC.fileUrl(f, true))).blob()); } catch { LC.toast(t('cx_picFailed')); } } }, el('img', { src: LC.fileUrl(f, true), alt: '' }))));
    top.addEventListener('input', draw); bottom.addEventListener('input', draw);
    const box = el('div', { class: 'cx-meme', onpaste: (e) => { const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); useBlob(f); } } },
      el('h2', {}, LC.icon('emoji_meme'), ' ' + t('cx_memeTitle')), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_memePick') }), file), recent.length ? el('p', { class: 'muted small', text: t('cx_memePaste') }) : null, recent.length ? strip : null,
      el('div', { class: 'rowline' }, top, bottom), cv,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('send'), onclick: () => {
        if (!img) return LC.toast(t('cx_memeNeedPic')); draw();
        cv.toBlob(async (b) => { if (!b) return LC.toast(t('cx_picFailed')); LC.closeModal(); try { const up = await LC.upload(b, `meme-${Date.now()}.jpg`).promise; composer.send({ force: true, extra: { files: [{ id: up.id, name: up.name, size: up.size }], meme: true } }); } catch (e) { LC.toast(e.message); } }, 'image/jpeg', 0.9);
      } })));
    LC.modal(box, { wide: true, label: t('cx_memeTitle') }); draw();
  };

  // ---------- the picker: Emoji (search, categories, skin tone) · My GIFs · Stickers ----------
  let pickerAnchor = null;
  const closePicker = () => { const p = $('#picker'); if (p.classList.contains('hidden')) return; p.classList.add('hidden'); p.replaceChildren(); if (pickerAnchor && pickerAnchor.isConnected) pickerAnchor.focus(); pickerAnchor = null; };
  LC.closePicker = closePicker;
  LC.openPicker = (anchor, onPick, o = {}) => {
    const p = $('#picker'); pickerAnchor = anchor;
    const recentList = () => LC.ls.get('lc_recent', []).filter((x) => typeof x === 'string');
    const allowGifs = !o.reactions && o.composer && rules().gifs !== false, allowStickers = !o.reactions && o.stickers && o.composer && rules().stickers !== false;
    const st = { tab: 'emoji', cat: o.reactions || !recentList().length ? 0 : -1, q: '', caption: '', pack: 'classic', tones: false };
    const pick = (e) => { if (!/^:/.test(e)) LC.ls.set('lc_recent', [e, ...recentList().filter((x) => x !== e)].slice(0, 32)); closePicker(); onPick(e); };
    const gridKeys = (grid, cols) => grid.addEventListener('keydown', (e) => {
      const bs = [...grid.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (i < 0) return;
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]; if (!d) return; e.preventDefault(); const n = bs[Math.max(0, Math.min(bs.length - 1, i + d))]; if (n) n.focus();
    });
    const emojiBtn = (e) => { const shown = LC.skinTone(e); return el('button', { type: 'button', text: shown, title: nameOf(e), 'aria-label': nameOf(e), onclick: () => pick(shown) }); };
    const emojiPanel = () => {
      const names = Object.keys(S.emojis).sort(), q = st.q.trim().toLowerCase(), out = [];
      if (q) {
        const words = q.split(/\s+/), hits = []; for (const c of CATS) for (const it of c.items) { const k = it.k; if (words.every((w) => k.split(' ').some((x) => x.startsWith(w)))) hits.push(it.e); }
        const cust = names.filter((n) => n.includes(q.replace(/^:|:$/g, '')));
        const grid = el('div', { class: 'grid', role: 'group', 'aria-label': t('cx_searchEmoji') }, hits.slice(0, 120).map(emojiBtn), cust.map((n) => el('button', { type: 'button', title: ':' + n + ':', 'aria-label': ':' + n + ':', onclick: () => pick(':' + n + ':') }, el('img', { class: 'cemoji big', src: LC.fileUrl({ id: S.emojis[n], name: n + '.png' }, true), alt: '' }))));
        gridKeys(grid, 8); out.push(grid); if (!hits.length && !cust.length) out.push(el('p', { class: 'muted small', text: t('cx_noEmojiFound') }));
        return out;
      }
      const cats = el('div', { class: 'cx-cats', role: 'group', 'aria-label': t('cx_tabEmoji') }, [[-1, 'clock', t('recent')], ...CATS.map((c, i) => [i, c.icon, t(c.name)]), [99, 'star', t('customEmoji')]].map(([i, ic, name]) => el('button', { type: 'button', class: st.cat === i ? 'on' : '', 'aria-pressed': String(st.cat === i), 'aria-label': name, title: name, onclick: () => { st.cat = i; draw(); } }, LC.hasIcon(ic) ? LC.icon(ic) : ic)));
      out.push(cats);
      if (st.cat === 99) {
        out.push(el('div', { class: 'grid cgrid' }, names.map((n) => el('button', { type: 'button', title: ':' + n + ':', 'aria-label': ':' + n + ':', onclick: () => pick(':' + n + ':') }, el('img', { class: 'cemoji big', src: LC.fileUrl({ id: S.emojis[n], name: n + '.png' }, true), alt: '' })))));
        if (!names.length) out.push(el('p', { class: 'muted small', text: t('noCustomEmoji') }));
        out.push(el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { closePicker(); LC.emojiManager(); } }, LC.icon('add'), t('addEmoji')));
      } else {
        const list = st.cat === -1 ? recentList() : CATS[st.cat].items.map((x) => x.e), grid = el('div', { class: 'grid', role: 'group', 'aria-label': st.cat === -1 ? t('recent') : t(CATS[st.cat].name) }, list.map(emojiBtn));
        gridKeys(grid, 8); out.push(el('div', { class: 'cx-catname', text: st.cat === -1 ? t('recent') : t(CATS[st.cat].name) }), grid);
      }
      return out;
    };
    const gifPanel = () => {
      const box = el('div', { class: 'cx-gifpanel' }, el('p', { class: 'muted small', text: t('loading') }));
      loadGifs().then((gifs) => {
        const q = st.q.trim().toLowerCase(), list = gifs.filter((g) => !q || g.name.toLowerCase().includes(q)), grid = el('div', { class: 'cx-gifgrid' }, list.map((g) => el('div', { class: 'cx-gif' },
          el('button', { type: 'button', class: 'cx-gifbtn', 'aria-label': t('cx_sendGif', { name: g.name }), title: g.name, onclick: () => { closePicker(); o.composer.send({ force: true, extra: { files: [{ id: g.id, name: g.name, size: g.size }], gif: true } }); } }, el('img', { src: LC.fileUrl(g, true), alt: '', loading: 'lazy' })),
          LC.ibtn('dismiss', t('cx_removeGif'), async () => { try { await LC.api('/api/chatux/gifs/remove', { id: g.id }); S.cx.gifs = null; draw(); } catch (e) { LC.toast(e.message); } }, { cls: 'icon cx-gifdel' }))));
        box.replaceChildren(list.length ? grid : el('p', { class: 'muted small', text: t('cx_noGifs') }), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => uploadGif(() => draw()) }, LC.icon('image_add'), t('cx_uploadGif')), el('p', { class: 'muted small', text: t('cx_gifNoSearch') }));
      });
      return [box];
    };
    const stickerPanel = () => {
      const cap = el('input', { class: 'cx-capin', maxlength: 80, placeholder: t('cx_caption'), 'aria-label': t('cx_stickerCaption'), value: st.caption, oninput: (e) => { st.caption = e.target.value; for (const n of p.querySelectorAll('.sticker')) { const s = findSticker(st.pack, n.dataset.s); n.replaceChildren(LC.stickerSvg(s, st.caption)); } } });
      const packs = el('div', { class: 'cx-cats', role: 'group', 'aria-label': t('cx_tabStickers') }, PACKS.map((pk) => el('button', { type: 'button', class: st.pack === pk.id ? 'on' : '', 'aria-pressed': String(st.pack === pk.id), 'aria-label': t('cx_pk_' + pk.id), title: t('cx_pk_' + pk.id), onclick: () => { st.pack = pk.id; draw(); } }, pk.icon)));
      const pk = PACKS.find((x) => x.id === st.pack), grid = el('div', { class: 'grid sgrid' }, pk.items.map((s) => el('button', { type: 'button', class: 'sticker', 'data-s': s.s, 'aria-label': t('cx_sendSticker', { name: stickerName(s) }), title: stickerName(s), onclick: () => { closePicker(); o.composer.send({ force: true, extra: { sticker: { p: pk.id, s: s.s, c: st.caption.trim() } } }); } }, LC.stickerSvg(s, st.caption))));
      gridKeys(grid, 4);
      return [cap, packs, grid, rules().memes !== false ? el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { closePicker(); LC.memeDialog(o.composer); } }, LC.icon('emoji_meme'), t('cx_makeMeme')) : null];
    };
    const draw = () => {
      const focusSearch = document.activeElement && document.activeElement.classList.contains('psearch'), pos = focusSearch ? document.activeElement.selectionStart : 0;
      const tone = toneNow(), toneBtn = el('button', { type: 'button', class: 'icon cx-tonebtn', 'aria-label': t('cx_skinTone'), title: t('cx_skinTone'), 'aria-expanded': String(st.tones), onclick: () => { st.tones = !st.tones; draw(); } }, LC.skinTone('✋', tone));
      const tones = st.tones ? el('div', { class: 'cx-tones', role: 'radiogroup', 'aria-label': t('cx_skinTone') }, TONES.map((_, i) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(i === tone), 'aria-label': t('cx_tone' + i), title: t('cx_tone' + i), class: i === tone ? 'on' : '', onclick: () => { setTone(i); st.tones = false; draw(); } }, LC.skinTone('✋', i)))) : null;
      const search = el('input', { type: 'search', class: 'psearch', placeholder: t('cx_searchEmoji'), 'aria-label': t('cx_searchEmoji'), value: st.q, oninput: (e) => { st.q = e.target.value; if (st.tab === 'stickers') st.tab = 'emoji'; draw(); } });
      const tabs = [['emoji', 'emoji', t('cx_tabEmoji')], allowGifs ? ['gifs', 'gif', t('cx_tabGifs')] : null, allowStickers ? ['stickers', 'sticker', t('stickers')] : null].filter(Boolean);
      const body = st.tab === 'gifs' ? gifPanel() : st.tab === 'stickers' ? stickerPanel() : emojiPanel();
      p.replaceChildren(...[st.tab === 'stickers' ? null : el('div', { class: 'cx-phead' }, search, o.reactions || st.tab !== 'emoji' ? null : toneBtn), tones,
        tabs.length > 1 ? el('div', { class: 'ptabs', role: 'tablist', 'aria-label': t('cx_pickerTitle') }, tabs.map(([k, ic, name]) => el('button', { type: 'button', role: 'tab', id: 'cxpt-' + k, 'aria-selected': String(st.tab === k), 'aria-controls': 'cxPickerPanel', class: st.tab === k ? 'on' : '', 'aria-label': name, title: name, onclick: () => { st.tab = k; draw(); } }, LC.icon(ic), el('span', { class: 'cx-ptab', text: name })))) : null,
        el('div', { class: 'cx-ppanel', id: 'cxPickerPanel', role: tabs.length > 1 ? 'tabpanel' : null, 'aria-labelledby': tabs.length > 1 ? 'cxpt-' + st.tab : null }, ...body)].filter(Boolean));
      if (focusSearch) { const n = p.querySelector('.psearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
      if (!p.classList.contains('hidden')) place();
    };
    // keep the picker next to its button and inside the window (tabs have different heights)
    const place = () => { const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight; p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px'; p.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : Math.max(8, Math.min(r.bottom + 8, innerHeight - h - 8))) + 'px'; };
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', o.reactions ? t('moreReactions') : t('cx_pickerTitle'));
    draw(); p.classList.remove('hidden'); p.style.visibility = 'hidden'; place(); p.style.visibility = '';
    if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => { const n = p.querySelector('.psearch'); if (n) n.focus(); }, 0);
  };
  document.addEventListener('mousedown', (e) => { const p = $('#picker'); if (!p.classList.contains('hidden') && !p.contains(e.target) && !e.target.closest('[aria-label][data-picker], .tools button, .emojibtn')) closePicker(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#picker').classList.contains('hidden') && $('#picker').contains(document.activeElement)) { e.stopPropagation(); closePicker(); } }, true);
})();
