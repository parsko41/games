# Guide for AI assistants working on this repo

You're helping one of two players (Player 1 or Player 2) change their private game app.
They are not programmers and usually work from a phone. Read this whole file first.

## What this is
"Games": six 2-player games in one installable web app (Android home-screen icon).
- **Tilework**: Scrabble-style word game. `tilework/index.html`
- **Wheelhouse**: Wheel of Fortune-style. `wheelhouse/index.html`
- **Answers**: Jeopardy-style, with an optional computer opponent. `answers/src/` (built into `answers/index.html`)
- **Crossword** (replaced Gardens): a crossword for two, built on the phone from a bank of clues. Take turns picking a clue and typing its answer; a right answer claims the word (10 points a letter). `crossword/index.html`.
- **Letter Thief** (tab "Thief"): an 8x8 letter grid, Blue vs Red. Trace words through touching
  letters to claim tiles and steal the other player's. `thief/index.html`
- **Cipher Strike** (tab "Cipher"): each player picks a secret 5-letter word, then they take turns
  guessing each other's (Wordle colors), with Smoke Screen / Data Leak sabotage. `cipher/index.html`.
  Secret words (and leaked letters) go through `hide()`/`reveal()` like the other answers.
- Letter Thief and Cipher Strike use Tilework's word list (`getWords`), sharing its phone cache
  (`tilework-words-1` in localStorage), and save to `Games/Letter Thief/Save data` and
  `Games/Cipher Strike/Save data` (made by the Games API the first time, like `Games/Crossword/Save data`).

Live app: https://parsko41.github.io/games/ (GitHub Pages, repo `parsko41/games`, branch `main`, root).

## How it fits together
- `index.html` is the app shell: a tab per game (each game loads in an iframe), the one-time
  "who's playing" picker (name + emoji avatar), and green turn dots.
- `shim.js` is loaded by every page. It defines `google.script.run` (the games were first written
  as Google Apps Script pages) as `fetch` POSTs of `{game, fn, args}` to the Games API, writes the
  app player's id/name into each game's own localStorage keys, and provides
  `GamesApp.avatar(dev, name)`. Pages redraw names on the `gamesprofiles` window event.
- `config.js` holds the Games API `/exec` URL. Don't change it unless asked.
- `server/Code.gs` is the **Games API**, a Google Apps Script web app in Player 1's Google account.
  It stores every game as a JSON file in Player 1's Google Drive (`Games/<Game>/Save data`), keeps the
  player list (`PROFILES`) and turn summaries in Script Properties, and fetches online clues.
- **Winners' Log:** the Games API writes one row per finished 2-player game (not vs the computer,
  not pass-and-play) to the "Winners' Log" sheet in the Games folder, inside `saveState_`, keyed
  `game:gid` so it's never logged twice (`logResult_`, `getLog`, `getLogGame` in `server/Code.gs`).
  The screen is `GamesApp.winnersLog(game)` in `shim.js`; each game's ☰ just calls it. Tallies are
  counted from the rows by player id. Tilework keeps every move in a `moves` field for the log
  (without one, the server falls back to the game's short `log`).
- `sw.js` makes the app installable, forces a fresh copy of every file on each open, and shows
  turn alerts (Web Push from the Games API; see the "Turn alerts" entry in `CHANGELOG.md`).
- `test/` has a local fake server (runs the real Code.gs with a pretend Drive) and an end-to-end
  Playwright test. Optional: only use it if you can run Node.

## Rules the players asked for (keep them)
- **Phone first.** A whole turn should fit on a phone screen without scrolling. Leave padding at the bottom.
- **Every change gets a version bump.** Each game has a `VERSIONS` list at the top of its script:
  add a new first entry `['1.2', 'YYYY-MM-DD', 'Plain-English description of what changed']`.
  The version shows next to the game's title and under ☰ → Version history.
- **2 players max** per game. The first player is picked at random.
- **Answers are never saved as plain text.** Wheelhouse puzzle text and Answers clue answers are
  scrambled with `hide()`/`reveal()` before saving. Any new field that reveals an answer must go
  through them too.
- **Saves must not break.** Each save must bump `moveNo` by exactly 1 (the server rejects stale
  saves). Don't rename existing state fields; games in progress must keep working.
- Keep the code style of the file you're editing. No frameworks, no build tools beyond Answers'.

## How to make a change
1. **Always start from the current file in the repo**, never from an old copy or memory. Fetch it raw:
   `https://raw.githubusercontent.com/parsko41/games/main/<path>`
   (e.g. `.../main/wheelhouse/index.html`). The other player may have changed it since.
2. Make the smallest change that does what was asked. Bump the version (see above).
3. Give the person the **complete file** to download (not a diff, not a snippet). Name it exactly
   like the original (e.g. `index.html`) and say clearly **which folder it goes in**.
4. Tell them how to upload (below) and what to look for to confirm it worked (e.g. "the title says 1.2").
5. Add a line to `CHANGELOG.md` (newest at the top) and give them that file too.

### Answers has a build step
`answers/index.html` is generated from `answers/src/index.src.html` + `clues.txt` + `finals.txt`
by `node answers/src/build.js` (it pastes the clue lists in at `/*CLUES*/` and `/*FINALS*/`).
- If you can run Node: edit the files in `answers/src/`, run the build, and hand over the changed
  `src` files **and** the rebuilt `answers/index.html`.
- If you can't: make the identical edit in both `answers/src/index.src.html` and `answers/index.html`
  (clue edits go in both `clues.txt`/`finals.txt` and the matching block in `answers/index.html`).
  Clue format: `# Category` line, then 5 lines `clue :: answer|other accepted answer`, easiest first.
  Final clues: `Category :: clue :: answer`. No backticks in clue text.

### Crossword notes
- Game key `crossword`, folder `crossword/`, `crossword-*` storage keys, Drive folder `Games/Crossword` (made by the Games API the first time). It replaced Gardens; the old `Games/Garden` folder on Drive was left alone.
- The game is `crossword/index.html` plus its clue bank `crossword/bank.txt` (fetched when a game is created): one `clue :: ANSWER` per line, answer letters only (3 to 11 of them, no spaces or digits). Hand-written clues come first, then about 4,700 WordNet definitions. Adding or deleting lines is the easy way to improve the game; keep each clue short and unambiguous, and don't let the clue contain its answer.
- **No word is ever reused.** Each new puzzle asks the Games API for `getUsed` (every answer used so far, space separated, in `Games/Crossword/crossword-used.txt`), picks only other answers, and records its own with `addUsed`. Only if fewer than 250 unused answers remain does it start over (`addUsed(words, true)`). Keep this working if you change how puzzles are made.
- The grid is built on the phone that creates the game (`makePuzzle`: random greedy packing, many tries, keeps the best) and saved in the game state: `w`, `h`, `mask` (`#` = block), `known` (the letters filled in so far, space = empty) and `entries` (`num`, `dir` A/D, `r`, `c`, `len`, `clue`, `by` = who claimed it or -1, `t` = claim order). `ans` is in memory only; saves hold `enc` (via `hide()`/`reveal()`), so answers are never saved as plain text.
- Scoring: a word is worth 10 per letter to whoever fills in its last empty square, and `claimFinished` hands over every word a move completes. Reveal costs 10 and ends the turn. The game ends when every word is claimed or after 6 turns in a row with no claim.
- Every save bumps `moveNo` by exactly 1. Don't rename the state fields: games in progress must keep working.

### Server changes (`server/Code.gs`) need Player 1
The Games API runs from Player 1's Google account. If a change needs `server/Code.gs`, give the new
file and say that **Player 1** must paste it into the "Games API" Apps Script project (in the Games folder
on Drive), save, then Deploy → Manage deployments → pencil → Version: **New version** → Deploy.
Never make a *new* deployment: that creates a new URL and the app would stop connecting.
Avoid server changes when the same thing can be done in the pages.

## How the person uploads a file (tell them this)
1. Download the file you gave them.
2. On github.com (signed in to **their own** GitHub account; both players are collaborators on the repo), open **parsko41/games**, then the folder the
   file belongs in (or stay on the main page for files like `sw.js`, `index.html`, `CHANGELOG.md`).
3. **Add file → Upload files**, drag the file in (same name replaces the old one), type a short note
   like "Wheelhouse 1.2: bigger buttons", tap **Commit changes**.
4. Wait about a minute, then fully close and reopen the Games app.
Mistakes are recoverable: GitHub keeps every old version (open the file → History).

## File map
| Path | What |
|---|---|
| `index.html` | App shell: tabs, player picker, turn dots |
| `shim.js` | API bridge, shared player, avatars |
| `config.js` | Games API URL |
| `sw.js`, `manifest.webmanifest`, `icon*` | Installable app bits |
| `tilework/index.html` | Tilework (whole game in one file) |
| `wheelhouse/index.html` | Wheelhouse (whole game in one file, puzzle list inside) |
| `answers/src/` | Answers source + clue lists; `answers/index.html` is built from it |
| `crossword/index.html` | Crossword (whole game in one file, clue bank inside) |
| `thief/index.html` | Letter Thief (whole game in one file) |
| `cipher/index.html` | Cipher Strike (whole game in one file) |
| `server/Code.gs` | Games API (Apps Script, runs in Player 1's account) |
| `test/` | Fake server + end-to-end test (Node + Playwright) |
| `README.md`, `CHANGELOG.md` | Setup notes and change history |
