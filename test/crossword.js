// Crossword test: two phones (Player 1, Player 2) play Crossword through the real shim -> fake server -> real Code.gs.
// Run: node test/crossword.js
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { start } = require('./fake-server');

let failures = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shots = path.join(__dirname, 'shots');
require('fs').mkdirSync(shots, { recursive: true });
async function until(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 8000)) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(120); }
  check(false, 'timed out: ' + label); return null;
}

(async () => {
  const PORT = 18556, URL = 'http://localhost:' + PORT + '/';
  const { backend } = await start(PORT);
  const { ctx, folders } = backend;
  ctx.setup();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const phone = { viewport: { width: 360, height: 700 }, isMobile: true, hasTouch: true };
  async function mkPhone(label, name, emoji) {
    const c = await browser.newContext(phone);
    const p = await c.newPage();
    p.on('pageerror', e => { console.log('PAGEERROR ' + label + ': ' + e.message); failures++; });
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) console.log('CONSOLE ' + label + ': ' + m.text()); });
    await p.goto(URL);
    await p.waitForSelector('#bNewP');
    await p.click('#bNewP'); await p.fill('#pName', name); await p.click('#emo button[data-e="' + emoji + '"]'); await p.click('#pSave');
    return p;
  }
  const frame = (p) => p.frame({ url: /\/crossword\// });
  const A = await mkPhone('Player 1', 'Player 1', '🦊');
  const B = await mkPhone('Player 2', 'Player 2', '🐼');

  // ---------- the tab ----------
  const tabs = await A.evaluate(() => [...document.querySelectorAll('#bar .tab')].map(b => ({ g: b.dataset.game, t: b.textContent, clipped: b.scrollWidth > b.clientWidth })));
  check(tabs.some(t => t.g === 'crossword' && t.t === 'Crossword'), 'app has a Crossword tab');
  check(!tabs.some(t => t.g === 'garden'), 'no Gardens tab any more');
  check(tabs.every(t => !t.clipped), 'every tab label fits at 360px wide: ' + tabs.filter(t => t.clipped).map(t => t.t).join(','));
  await A.click('#bar .tab[data-game="crossword"]'); await B.click('#bar .tab[data-game="crossword"]');
  const fA = await until(() => frame(A), 5000, 'A crossword frame'), fB = await until(() => frame(B), 5000, 'B crossword frame');
  await until(() => fA.isVisible('#bCreate'), 8000, 'create button');
  check(await fA.evaluate(() => localStorage.getItem('crossword-name')) === 'Player 1', 'game uses the app login name');
  check(/Medium/.test(await fA.textContent('#cSize')), 'size picker offers sizes');
  await fA.selectOption('#cSize', 'medium');
  await fA.click('#bCreate');
  await until(() => fA.evaluate(() => S && S.status === 'lobby'), 8000, 'lobby');
  const lob = await fA.evaluate(() => ({ n: S.entries.length, w: S.w, h: S.h, mn: S.moveNo }));
  check(lob.n >= 10 && lob.w <= 11 && lob.h <= 11 && lob.mn === 0, 'medium crossword built: ' + JSON.stringify(lob));
  await until(() => fB.isVisible('#bJoin'), 10000, 'B sees Join');
  await fB.click('#bJoin');
  await until(() => fA.evaluate(() => S && S.status === 'play'), 10000, 'play on A');
  await until(() => fB.evaluate(() => S && S.status === 'play'), 10000, 'play on B');

  // ---------- what's saved ----------
  const saved = () => folders.cw ? folders.cw : null;
  const cwFile = () => { let f; Object.values(backend.allFolders).forEach(d => { (d.files || []).forEach(x => { if (x.name === 'crossword-state.json') f = x; }); }); return f; };
  const raw = cwFile().content, st0 = JSON.parse(raw);
  const answers = await fA.evaluate(() => S.entries.map(e => e.ans));
  check(st0.entries.every(e => e.enc && e.ans === undefined) && answers.every(a => !raw.includes('"' + a + '"') && !raw.includes(a)), 'save file has no plain-text answers');
  check(/^[ ]+$/.test(st0.known) && st0.known.length === st0.w * st0.h, 'nothing is filled in at the start');

  const who = await fA.evaluate(() => S.turn);
  const T = who === 0 ? A : B, O = who === 0 ? B : A, fT = frame(T), fO = frame(O);
  await until(() => fT.evaluate(() => myTurn()), 6000, 'turn page sees its turn');
  const v = await fT.evaluate(() => ({ s: document.documentElement.scrollHeight, h: innerHeight, kbd: !document.getElementById('kbd').classList.contains('hidden') }));
  check(v.kbd && v.s <= v.h + 2, 'a full turn (grid, keyboard, buttons) fits the phone: ' + v.s + ' / ' + v.h);
  await T.screenshot({ path: path.join(shots, 'crossword-turn.png') });
  check(!(await fO.evaluate(() => !document.getElementById('kbd').classList.contains('hidden'))), 'other player has no keyboard on their turn');

  // ---------- solve the longest clue by tapping a grid square and the on-screen keys ----------
  const target = await fT.evaluate(() => { let b = 0; S.entries.forEach((e, i) => { if (e.len > S.entries[b].len) b = i; }); const e = S.entries[b]; return { i: b, ans: e.ans, len: e.len, cell: cellsOf(S, e)[1], other: S.entries.filter((x, k) => k !== b && cellsOf(S, x).indexOf(cellsOf(S, e)[1]) >= 0).length }; });
  await fT.click('.cx[data-i="' + target.cell + '"]');
  const afterTap = await fT.evaluate(() => selE);
  check(afterTap >= 0, 'tapping a square picks a clue (' + afterTap + ')');
  await fT.evaluate((i) => selectEntry(i), target.i);
  for (const ch of target.ans.slice(0, 2)) await fT.click('#kbd button[data-k="' + ch + '"]');
  check(await fT.evaluate(() => draft.length) === 2 && await fT.isDisabled('#bGuess'), 'typing letters fills the draft; Guess waits for every letter');
  await fT.click('#kbd button[data-k="⌫"]');
  check(await fT.evaluate(() => draft.length) === 1, 'backspace works');
  await fT.evaluate(() => { draft = ''; });
  for (const ch of target.ans) await fT.click('#kbd button[data-k="' + ch + '"]');
  check(!(await fT.isDisabled('#bGuess')), 'Guess is on once every square has a letter');
  await T.screenshot({ path: path.join(shots, 'crossword-typed.png') });
  await fT.click('#bGuess');
  await until(() => fO.evaluate(() => S.moveNo === 2), 10000, 'solved word reaches the other phone');
  let s1 = await fO.evaluate(() => ({ turn: S.turn, scores: S.players.map(p => p.score), by: S.entries.map(e => e.by), known: S.known, idle: S.idle }));
  const solvedIdx = s1.by.map((b, i) => b >= 0 ? i : -1).filter(i => i >= 0);
  check(solvedIdx.includes(target.i) && s1.by[target.i] === who, 'word is claimed by the player who solved it');
  const pts = solvedIdx.reduce((t, i) => t + 10 * answers[i].length, 0);
  check(s1.scores[who] === pts && s1.scores[1 - who] === 0 && s1.turn === 1 - who, 'scored 10 a letter (' + pts + ') and the turn passed: ' + JSON.stringify(s1.scores));
  check(await fO.evaluate(() => myTurn()), 'other player now has the turn');
  await O.screenshot({ path: path.join(shots, 'crossword-after-solve.png') });
  const raw2 = cwFile().content, st2 = JSON.parse(raw2);
  check(st2.entries.every(e => e.enc && e.ans === undefined) && st2.entries.every((e, i) => e.by >= 0 || answers[i].length < 5 || !raw2.includes(answers[i])), 'still no plain-text answers after a move (solved words show on the board, the rest stay scrambled)');

  // ---------- a wrong guess just passes the turn ----------
  const wrong = await fO.evaluate(() => { const o = openEntries(); const i = o[0]; selectEntry(i); const e = S.entries[i]; return { i, n: blanksOf(e).length }; });
  for (let k = 0; k < wrong.n; k++) await fO.click('#kbd button[data-k="Q"]');
  await fO.click('#bGuess');
  await until(() => fT.evaluate(() => S.moveNo === 3), 10000, 'wrong guess saved');
  const s2 = await fT.evaluate(() => ({ turn: S.turn, scores: S.players.map(p => p.score), idle: S.idle, log: S.log[0] }));
  check(s2.turn === who && s2.idle === 1 && s2.scores[1 - who] === 0 && /missed/.test(s2.log), 'wrong guess: no points, turn passes back: ' + s2.log);

  // ---------- reveal ----------
  const rv = await fT.evaluate(() => { const o = openEntries().filter(i => blanksOf(S.entries[i]).length >= 2); selectEntry(o[0]); return { i: o[0], before: S.known.replace(/ /g, '').length, sc: S.players[S.turn].score }; });
  await fT.click('#bReveal');
  await until(() => fT.isVisible('#rYes'), 3000, 'reveal confirmation');
  await fT.click('#rYes');
  await until(() => fO.evaluate(() => S.moveNo === 4), 10000, 'reveal saved');
  const s3 = await fO.evaluate(() => ({ filled: S.known.replace(/ /g, '').length, sc: S.players[1 - S.turn].score, turn: S.turn, by: S.entries.map(e => e.by) }));
  check(s3.filled > rv.before && s3.sc <= rv.sc - 10 + 1000 && s3.turn === 1 - who, 'reveal adds a letter and ends the turn');

  // ---------- invariants + play to the end ----------
  async function invariant(f) {
    return f.evaluate(() => S.entries.every(e => (e.by >= 0) === cellsOf(S, e).every(i => S.known[i] !== ' ')) &&
      S.entries.every(e => cellsOf(S, e).every(i => S.known[i] === ' ' || S.known[i] === e.ans[cellsOf(S, e).indexOf(i)])));
  }
  check(await invariant(fO), 'a word is claimed exactly when all its squares are filled, and every letter is right');
  let guard = 0;
  while (guard++ < 60) {
    // the phone that has the newest save is the one that just moved; the other one has to catch up first
    await fA.evaluate(() => poll()); await fB.evaluate(() => poll()); await sleep(250);
    const sA = await fA.evaluate(() => ({ n: S.moveNo, over: S.status === 'over', turn: S.turn })), sB = await fB.evaluate(() => ({ n: S.moveNo }));
    if (sA.over) break;
    if (sA.n !== sB.n) { await sleep(300); continue; }
    const fP = sA.turn === 0 ? fA : fB;
    await fP.evaluate(() => { const o = openEntries(); selectEntry(o[0]); const e = S.entries[o[0]]; const bl = blanksOf(e); draft = bl.map(i => e.ans[cellsOf(S, e).indexOf(i)]).join(''); guess(); });
    await until(() => fP.evaluate(() => !busy), 8000, 'save done');
  }
  await until(() => fA.evaluate(() => S.status === 'over'), 10000, 'game over');
  const fin = await fA.evaluate(() => ({ sc: S.players.map(p => p.score), note: S.endNote, by: S.entries.map(e => e.by), total: S.entries.reduce((t, e) => t + e.len * 10, 0) }));
  check(fin.by.every(b => b >= 0) && fin.sc[0] + fin.sc[1] === fin.total - 10 && /solved/.test(fin.note), 'game ends when every word is claimed; points add up (' + fin.sc.join(' + ') + ' = ' + fin.total + ' - the 10 for the reveal): ' + fin.note);
  await A.screenshot({ path: path.join(shots, 'crossword-over.png') });

  // ---------- Winners' Log ----------
  const log = ctx.getLog();
  check(log.filter(r => r.game === 'crossword').length === 1, 'finished game logged once in the Winners\' Log: ' + JSON.stringify(log.map(r => r.key.split(':')[0])));
  const detail = ctx.getLogGame(log[0].key);
  check(detail && detail.moves.length > 5 && detail.extra && detail.extra.words === fin.by.length, 'log keeps every move and the puzzle size');
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(async () => !(await A.isVisible('#bar .tab[data-game="crossword"] .dot')) && !(await B.isVisible('#bar .tab[data-game="crossword"] .dot')), 6000, 'dots clear');
  check(!(await A.isVisible('#bar .tab[data-game="crossword"] .dot')) && !(await B.isVisible('#bar .tab[data-game="crossword"] .dot')), 'no turn dot once the game is over');

  // ---------- rematch ----------
  await fA.click('#bRe');
  await until(() => fA.evaluate(() => S.status === 'play' && S.moveNo === 0 && S.entries.every(e => e.by < 0)), 10000, 'rematch');
  check(await fA.evaluate(() => S.players.every(p => p.score === 0)), 'rematch starts a fresh puzzle at 0-0');
  const re = await fA.evaluate(() => S.entries.map(e => e.ans));
  check(re.every(a => !answers.includes(a)), 'the rematch shares no word with the first game');
  const usedNow = ctx.getUsed().split(' ');
  check(answers.every(a => usedNow.includes(a)) && re.every(a => usedNow.includes(a)) && new Set(usedNow).size === usedNow.length, 'Drive history lists every word used so far, once each (' + usedNow.length + ')');
  check(await fA.evaluate(() => Object.keys(BANKMAP).length) >= 4500, 'clue bank has thousands of answers');

  // ---------- turn dot ----------
  const cur = await fA.evaluate(() => S.turn), DP = cur === 0 ? A : B, OP = cur === 0 ? B : A;
  await DP.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(() => DP.isVisible('#bar .tab[data-game="crossword"] .dot'), 6000, 'turn dot');
  check(await DP.isVisible('#bar .tab[data-game="crossword"] .dot') && !(await OP.isVisible('#bar .tab[data-game="crossword"] .dot')), 'Crossword tab shows a dot only for the player whose turn it is');

  // ---------- sizes and a second game ----------
  await fA.evaluate(() => switchTab(1));
  await until(() => fA.isVisible('#bCreate'), 6000, 'second tab new game');
  for (const sz of ['small', 'large']) {
    const r = await fA.evaluate((k) => { const p = makePuzzle(k); return { n: p.entries.length, w: p.w, h: p.h }; }, sz);
    check((sz === 'small' ? r.n >= 7 && r.w <= 9 && r.h <= 9 : r.n >= 14 && r.w <= 13 && r.h <= 13), sz + ' puzzle: ' + JSON.stringify(r));
  }
  // every built puzzle is a valid crossword: letters line up where words cross, runs are entries
  const bad = await fA.evaluate(() => { let bad = 0; for (let k = 0; k < 30; k++) { const p = makePuzzle(['small', 'medium', 'large'][k % 3]); const g = {}; let ok = true; p.entries.forEach(e => { for (let j = 0; j < e.len; j++) { const key = (e.r + (e.dir === 'D' ? j : 0)) * p.w + e.c + (e.dir === 'A' ? j : 0); if (g[key] && g[key] !== e.ans[j]) ok = false; g[key] = e.ans[j]; } }); if (!ok || Object.keys(g).length !== p.mask.split('').filter(c => c === '.').length) bad++; } return bad; });
  check(bad === 0, '30 random puzzles are all consistent');
  // many games in a row with the history carried along: no word is ever used twice
  const rep = await fA.evaluate(() => { const used = {}; let games = 0, repeats = 0, words = 0; for (let k = 0; k < 120; k++) { const p = makePuzzle(['small', 'medium', 'large'][k % 3], used); if (!p) break; games++; p.entries.forEach(e => { words++; if (used[e.ans]) repeats++; used[e.ans] = 1; }); } return { games, repeats, words }; });
  check(rep.games === 120 && rep.repeats === 0, '120 games in a row (' + rep.words + ' words) with no word repeated: ' + JSON.stringify(rep));
  await A.screenshot({ path: path.join(shots, 'crossword-newgame.png') });

  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
