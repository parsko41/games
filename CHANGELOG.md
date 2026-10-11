# Games app: changelog

## Answers 1.2 (2026-10-11): bigger text
- Bigger text everywhere: names, scores, clue, messages, buttons, answer box.
- Board: each category name is as big as its box allows (`fitBoard()` in the page, narrow font on Android), very long words (11+ letters) can break with a hyphen, and the dollar values all share the biggest size that fits (shown without the comma, e.g. $1200).
- Long clues step down a size (over 95 and 150 characters) so a turn still fits on the screen.

## Turn alerts (2026-10-11): Games 1.1, Games API 1.1
- Tap your avatar → Turn alerts → **Turn on turn alerts**. When a game starts waiting on you, your phone gets a "Your move in Wheelhouse" notification, and Android puts a dot on the Games icon. Tapping it opens that game. "Send a test" checks it works.
- You don't get an alert for your own move. Alerts clear when you open the app and nothing is waiting.
- Needs the new `server/Code.gs` (Luke: paste, save, Deploy → Manage deployments → pencil → New version). Run `checkAlerts` once in the editor to check it.
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
