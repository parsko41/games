# Games app: changelog

## Gardens 0.4 (2026-10-13): answer the open questions in the app
- Open questions are answered in the app (☰ → Open questions, or the button on the intro screen): each player writes their own answer, either records the decision, and both see each other's. Saved on Drive as a second save file (`Games/Garden/Save data/garden-state-4.json`), separate from the game, so no server change and no redeploy.
- Real names removed from the repo's current files (docs, comments, test data), replaced with Player 1 / Player 2. Earlier commits in GitHub's history still contain them.

## Games 1.5 (2026-10-13): Garden is now called Gardens
- The game is now called **Gardens** everywhere you see it: tab, page title, intro, menu, turn alerts and docs (Gardens 0.3, app 1.5). Internal ids stay singular (game key `garden`, the `garden/` folder, `garden-*` storage keys, Drive folder `Games/Garden`), so the server and saves are unaffected: no Games API redeploy is needed for the rename.

## Games 1.4 (2026-10-13): Garden, a new game
- **Garden 0.2 (new, fourth tab).** A 2-player game to design together: shape the plot (alternate adding soil), then grow it. Plants grow overnight if watered, weeds choke and overrun the other player's thirsty plants, water is scarce, a "Wait a Week" card runs a growth step right now. Busy-day protection: actions and water bank up to 2 days, growth is one step a night, dry plants wilt but never die, vacation shields, and a "while you were away" recap. Opens with an intro screen that explains the game and lists the open questions. Numbers (plot size, game length, actions/water per day, bank, shields, scoring) are settings picked when creating a garden; everything unsettled is under ☰ → Rules and in `garden/RULES.md`.
- App 1.4: Garden tab added (amber turn dot); tab labels slightly smaller so four fit on a 360px phone. `shim.js`: Garden gets the shared player (`garden-device` / `garden-name`). `sw.js`: turn alerts name the game "Garden".
- **Games API 1.3 (needs Player 1):** adds the `garden` game (saves in `Games/Garden/Save data`, made automatically) and the Garden turn dot (your turn while shaping; "a new garden day is waiting" while growing). Paste `server/Code.gs` into the Games API project, then Deploy → Manage deployments → pencil → Version: **New version** → Deploy. Don't make a new deployment. After it deploys, the line under your avatar should read "Games API 1.3".
- `test/fake-server.js`: pretend Drive has a `Games` parent folder so the Garden folder lookup can be tested. `test/e2e.js` was not run for this change; Garden was tested with two simulated phones against the real `Code.gs` on the fake Drive.

## Games 1.3 (2026-10-11): Games API version in the app
- Tap your avatar: the bottom line now says "Games app 1.3 · Games API 1.2", so you can tell the two apart and check that a Games API deploy took.
- How: the page reads the version from the API link's health check (a GET of the `/exec` link, `{app: 'Games API 1.2'}`); no server change. Shows "not reachable" if the API can't be reached.

## No repeated clues (2026-10-11): Answers 1.4, Games API 1.2
- Why repeats happened: Answers has 36 built-in categories and 16 finals, and each game only remembered what *that* game had used. A Built-in + online game uses 8 built-in categories, so after about 4 games everything came round again. Online clues were 30 random questions per category with no memory at all.
- Now the Games API keeps a year of history for both phones and every game: built-in category names, finals, and a fingerprint of every online clue. Nothing played in the last 365 days is used again.
- When the built-in categories (or finals) are all used up, the board fills with fresh online categories (and the final becomes a hard online clue). "Built-in only" games can't do that, so they reuse the categories played longest ago.
- A second online source, The Trivia API (the-trivia-api.com, free, no key), alongside Open Trivia DB. New categories: Arts & Literature, Film & TV, Science, Food & Drink, Society & Culture. If one site is down the other is used.
- How: `answers-history.json` in Games/Answers on Drive (`{cats, finals, clues}` of name/fingerprint → day number; entries older than a year are dropped). New API calls `planBoard(names, want, avoid, online)` and `planFinal(keys, online)`; `getOnlineCategories` still works for older pages. The page falls back to the old behavior if the Games API hasn't been updated yet.
- Needs the new `server/Code.gs` (Player 1: paste, save, Deploy → Manage deployments → pencil → New version). The history starts empty, so clues from games before this update can show up once more.

## Games 1.2 (2026-10-11): color-coded alerts
- Each waiting game gets its own notification with its own icon: red T (Tilework), green W (Wheelhouse), blue A (Answers). A game's notification goes away when it's no longer waiting; the Android icon dot goes when none are left.
- The dots on the game tabs use the same colors.
- Android can't draw custom dots on an app icon (one launcher dot only). On the Galaxy S24, Settings → Home screen → App icon badges → Show with number shows how many alerts are waiting.
- Files: `icon-tilework.png`, `icon-wheelhouse.png`, `icon-answers.png`; `sw.js` uses notification tags `turn-<game>`.

## Answers 1.3 (2026-10-11): bigger text under the clue
- The message under the clue (26px), the instructions line (24px), the buttons (30px) and the answer box (24/26px) are about 1.6× bigger. Double was tried but long clues and the phone keyboard wouldn't fit.
- These sizes are for a 360px-wide screen (Galaxy S24) and grow with the screen (`clamp(…, vw, …)`), about 14% bigger on a 412px-wide Pixel 9.
- The money line is shorter: "Right +$400 · Wrong −$400" (dropped "Passing costs nothing").

## Answers 1.2 (2026-10-11): bigger text
- Bigger text everywhere: names, scores, clue, messages, buttons, answer box.
- Board: each category name is as big as its box allows (`fitBoard()` in the page, narrow font on Android), very long words (11+ letters) can break with a hyphen, and the dollar values all share the biggest size that fits (shown without the comma, e.g. $1200).
- Long clues step down a size (over 95 and 150 characters) so a turn still fits on the screen.

## Turn alerts (2026-10-11): Games 1.1, Games API 1.1
- Tap your avatar → Turn alerts → **Turn on turn alerts**. When a game starts waiting on you, your phone gets a "Your move in Wheelhouse" notification, and Android puts a dot on the Games icon. Tapping it opens that game. "Send a test" checks it works.
- You don't get an alert for your own move. Alerts clear when you open the app and nothing is waiting.
- Needs the new `server/Code.gs` (Player 1: paste, save, Deploy → Manage deployments → pencil → New version). Run `checkAlerts` once in the editor to check it.
- How: the phone's push subscription is stored in Script Property `PUSH` ({dev: [{endpoint}]}). After each successful save, `notify_()` compares each subscribed player's `overview()` counts with `PUSH_SEEN` and sends an empty Web Push (VAPID ES256, signed in pure JS with BigInt; key in Script Property `VAPID`) to anyone whose count went up, except the caller (`dev` is now sent with every API call by `shim.js`). `sw.js` gets the push, asks `overview()` what's waiting (player id + API link are kept in the `games-me` cache), and shows the notification.

## Login names everywhere (2026-10-11): Tilework 1.1, Wheelhouse 1.3, Answers 1.1
- Your Games login name is your name in every game, including games already in progress. Change it any time by tapping your avatar (top right); both phones pick it up within a minute.
- The games' own "Your name" boxes are gone; they show "Playing as <name>" instead. Tilework pass-and-play still lets you name each seat.
- How: `GamesApp.nameOf(dev, savedName)` / `GamesApp.fixNames(seats)` in `shim.js` swap in the profile name when a game loads. Saved name fields are unchanged; old log lines keep the name used at the time.

## Wheelhouse 1.2 (2026-10-11)
- The clue under the puzzle is twice as big (28px, was 14px).

## 1.0 (2026-10-10)
First version of the combined app.
- One app with a tab per game (Tilework, Wheelhouse, Answers), installable on Android.
- One player per phone, picked once: name and avatar shared by every game. Tap the avatar to change it or switch players.
- A green dot on a game's tab (and a count in the title) when one of its games is waiting on you.
- All games: max 2 players, first player chosen at random, avatars next to names.
- Answers: play against the computer (easy, medium, hard), plus the v3 fixes (typo-tolerant answers, online clues that need multiple-choice options filtered out).
- One Apps Script (Games API) serves all three games' saves from the same Drive folders as before. Games in progress carry over.

## How it works (for whoever changes it next)
- `shim.js` defines `google.script.run` as fetch POSTs of `{game, fn, args}` to the Games API, so the games' code is the same as in Apps Script. It also writes the app player's id and name into each game's own localStorage keys (`tilework-id/-name`, `wheelhouse-device/-name`, `answers-device/-name`) before the game starts. All pages share one origin, so localStorage is shared.
- Player list: Script Property `PROFILES` = {dev: {name, avatar, t}}. `GamesApp.avatar(dev, name)` looks up by id, then by name (for seats saved under an old device id). New ids trigger a refresh, and pages redraw on the `gamesprofiles` event.
- Turn summaries: Script Properties `GAME_<game>_<slot>` (Tilework keeps its own summary shape). `overview(dev)` counts games waiting on a player per game; a computer's move counts for the host.
- Save folders: Script Property `FOLDER_<game>`, defaulting to the known IDs (Tilework 1dXMZ9…, Answers 1KBmbt…); Wheelhouse's is found by name in Games/Wheelhouse. Tilework words: `WORDS_ID`, or `tilework-words.txt` in Games/Tilework.
- Save rules are the same as each old Code.gs: Wheelhouse/Answers strict (moveNo +1 or a new gid at 0); Tilework rejects only a stale moveNo for the same gid.
- Answers computer: a seat with dev `bot` and a `level`. `botTick()` runs after every state change on the host's phone (seat 0) and plays after 1.2–2.4s (BOT_DELAY). Turn functions take an optional `who` dev id.
