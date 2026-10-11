# Games

Tilework, Wheelhouse and Answers in one app: one icon on the phone, a tab per game, one player
(name and avatar) per phone.

- The pages (this repo) are hosted free on **GitHub Pages**.
- Saves stay on **Google Drive** in `Games/<Game>/Save data`, the same files as before, through a
  small Google Apps Script called **Games API** (`server/Code.gs`).

Games already in progress carry over. The first time each of you opens an old game in the app,
tap "I'm <your name>" once and it continues where it left off.

## One-time setup

### 1. The Games API (Google, about 5 minutes, easiest on a computer)
1. In Drive, open the **Games** folder → New → More → **Google Apps Script**. Name it `Games API`.
2. Replace everything in `Code.gs` with `server/Code.gs` from this repo, then save.
3. Pick **setup** in the function menu → Run → approve the permissions.
   The log should list the three save folders and say the word list was found.
4. **Deploy → New deployment** → type **Web app**.
   Execute as: **Me**. Who has access: **Anyone**. Deploy, then copy the **Web app URL** (ends in `/exec`).
5. Optional check: open that URL in a browser. It should show `{"ok":true,...}`.

### 2. GitHub Pages
1. Signed in to the shared GitHub account, create a repository named `games` (Public: free Pages needs it).
2. Upload everything in this folder (Add file → Upload files, drag the whole folder in) and commit.
3. Open `config.js` on GitHub (pencil icon), paste the `/exec` URL between the quotes, and commit.
4. Settings → **Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
5. After a minute the app is at `https://<account>.github.io/games/`.

### 3. Each phone
1. Open the link in Chrome → ⋮ menu → **Install app** (or Add to Home screen).
2. Open it from the home screen and pick who you are (once). Then each game remembers you.

## Making changes (either of you)
- Edit a file on GitHub (pencil icon) and commit. The app updates within a minute or two.
- Every change gets a version bump at the top of that game's `VERSIONS` list.
- **Answers:** edit `answers/src/` (the page, `clues.txt`, `finals.txt`), then rebuild with
  `node answers/src/build.js`, which writes `answers/index.html`. Commit both.
- **Server:** if `server/Code.gs` changes, paste it into the Games API project, then
  Deploy → Manage deployments → pencil → Version: **New version** → Deploy. The URL stays the same.
- Older versions: every commit is kept in GitHub's history (the file's History button).

## Testing on a computer
- `node test/fake-server.js 8080`, then open http://localhost:8080/: the full app with a
  pretend Drive in memory.
- `node test/e2e.js` runs two phones through all three games with Playwright (login, avatars,
  Tilework move, old Wheelhouse game carry-over, Wheelhouse round, Answers against the computer,
  2-player Answers, turn dots, no plaintext answers in the save files).

## Files
| Path | What it is |
|---|---|
| `index.html` | The app shell: game tabs, player picker, turn dots |
| `shim.js` | Lets the games call the Games API, shares the player and avatars |
| `config.js` | The Games API link (the only setting) |
| `manifest.webmanifest`, `sw.js`, `icon*` | What makes it installable on Android |
| `tilework/`, `wheelhouse/`, `answers/` | The games |
| `server/Code.gs` | The Games API (Apps Script) |
| `test/` | Local fake server and end-to-end test |

## Notes
- The repo is public, so the code (and the built-in clues) can be seen by anyone who looks for it,
  same as the page source in Apps Script today. Answers in the save files stay scrambled.
- The old Apps Script projects keep working, so nothing breaks while you switch over.
