// Scoring harness: loads crossword/index.html alone, with a pretend Games API that holds one tiny game
// (a 3x3 ring: CAT / WAN across, COW / TEN down), and checks the 1.1 scoring rules.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f)); });
function mkState(o) {
  const E = (num, dir, r, c, clue, ans) => ({ num, dir, r, c, len: 3, clue, by: -1, t: 0, ans });
  return Object.assign({ app: 'crossword', gid: 'gtest', moveNo: 5, status: 'play', size: 'small',
    players: [{ dev: 'dA', name: 'A', score: 0 }, { dev: 'dB', name: 'B', score: 0 }], turn: 0, w: 3, h: 3, mask: '....#....',
    known: '         ', entries: [E(1, 'A', 0, 0, 'pet', 'CAT'), E(1, 'D', 0, 0, 'cattle', 'COW'), E(2, 'D', 0, 2, 'number', 'TEN'), E(3, 'A', 2, 0, 'pale', 'WAN')],
    claims: 0, idle: 0, log: [], moves: [], endNote: '' }, o);
}
(async () => {
  await new Promise(r => srv.listen(18600, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await (await b.newContext({ viewport: { width: 360, height: 700 }, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => { console.log('PAGEERROR ' + e.message); fails++; });
  let saved = null, stored = null;
  await page.exposeFunction('__get', () => stored); await page.exposeFunction('__put', j => { stored = j; saved = JSON.parse(j); });
  await page.addInitScript(() => {
    localStorage.setItem('crossword-device', 'dA'); localStorage.setItem('crossword-name', 'A');
    window.google = { script: { get run() { let ok = () => {}, bad = () => {}; const ch = new Proxy({}, { get(_, k) {
      if (k === 'withSuccessHandler') return f => { ok = f; return ch; };
      if (k === 'withFailureHandler') return f => { bad = f; return ch; };
      return async (...a) => { try {
        if (k === 'getState') ok({ state: JSON.parse(await window.__get() || 'null'), games: [] });
        else if (k === 'saveState') { await window.__put(a[0]); ok({ ok: true, state: JSON.parse(a[0]), games: [] }); }
        else ok({}); } catch (e) { bad(e); } };
    } }); return ch; } } };
  });
  async function load(o) {                       // fresh page with a given state
    stored = JSON.stringify(mkState(o)); saved = null;
    await page.goto('http://localhost:18600/crossword/'); await page.waitForSelector('#bHint', { timeout: 8000 });
  }
  const sc = () => page.evaluate(() => S.players.map(p => p.score));

  // 1. no points: no hint, and hintLetter refuses
  await load({});
  check(await page.isDisabled('#bHint'), 'Hint is off with 0 points');
  await page.evaluate(() => hintLetter(0)); await sleep(300);
  check(saved === null, 'hintLetter with 0 points saves nothing');

  // 2. 19 points: still off. 20 points: on, and a hint takes you to exactly 0, never below
  await load({ players: [{ dev: 'dA', name: 'A', score: 19 }, { dev: 'dB', name: 'B', score: 0 }] });
  check(await page.isDisabled('#bHint'), 'Hint is off with 19 points');
  await page.evaluate(() => hintLetter(0)); await sleep(300);
  check(saved === null, 'hintLetter with 19 points saves nothing');
  await load({ players: [{ dev: 'dA', name: 'A', score: 20 }, { dev: 'dB', name: 'B', score: 0 }] });
  check(!(await page.isDisabled('#bHint')), 'Hint is on with exactly 20 points');
  await page.click('#bHint');
  check(await page.evaluate(() => hintMode && document.querySelectorAll('.cx.hp').length === 8), 'in hint mode all 8 empty squares are highlighted');
  await page.click('.cx[data-i="0"]');
  await page.waitForSelector('#rYes'); await page.click('#rYes');
  await page.waitForFunction(() => S.moveNo === 6, null, { timeout: 5000 });
  const a = await page.evaluate(() => ({ sc: S.players.map(p => p.score), known: S.known, turn: S.turn, idle: S.idle, log: S.log[0] }));
  check(a.sc[0] === 0 && a.known[0] === 'C' && a.turn === 1 && a.idle === 1, 'hint: -20 (20 -> 0), shows C, ends turn: ' + JSON.stringify(a));

  // 3. a square that would finish a word can't be hinted (CAT has one blank left; the T also crosses TEN)
  await load({ players: [{ dev: 'dA', name: 'A', score: 50 }, { dev: 'dB', name: 'B', score: 0 }], known: 'CA       ' });
  check(await page.evaluate(() => !hintable(2)), 'a square finishing CAT is not hintable');
  await page.evaluate(() => hintLetter(2)); await sleep(300);
  check(saved === null, 'hintLetter on a word-finishing square saves nothing');
  await page.click('#bHint');
  await page.click('.cx[data-i="2"]'); await sleep(200);
  check(await page.evaluate(() => !document.getElementById('rYes')), 'tapping a word-finishing square in hint mode opens no purchase');
  check(await page.evaluate(() => hintable(3) && hintable(6)), 'other squares still can be hinted');

  // 4. a wrong guess costs 5 a square, the other player gets it, and the turn passes; scores may go below zero
  await load({});
  await page.evaluate(() => { selectEntry(0); draft = 'DOG'; guess(); });
  await page.waitForFunction(() => S.moveNo === 6, null, { timeout: 5000 });
  let s = await sc(); check(s[0] === -15 && s[1] === 15, 'wrong 3-letter guess: -15 for you, +15 to the other player (' + s + ')');
  check(await page.evaluate(() => S.turn === 1 && S.chain === 0 && /missed \(-15, \+15 to B\)/.test(S.log[0])), 'turn passes and the log shows the steal');
  await load({ known: 'C        ' });
  await page.evaluate(() => { selectEntry(0); draft = 'XY'; guess(); });
  await page.waitForFunction(() => S.moveNo === 6, null, { timeout: 5000 });
  s = await sc(); check(s[0] === -10 && s[1] === 10, 'penalty counts only the squares you typed (2 typed: ' + s + ')');

  // 4b. a right guess keeps the turn: up to 3 words in a row, then it passes
  await load({});
  await page.evaluate(() => { selectEntry(0); draft = 'CAT'; guess(); });
  await page.waitForFunction(() => S.moveNo === 6, null, { timeout: 5000 });
  let t = await page.evaluate(() => ({ sc: S.players.map(p => p.score), turn: S.turn, chain: S.chain, idle: S.idle }));
  check(t.sc[0] === 30 && t.turn === 0 && t.chain === 1 && t.idle === 0, 'right guess: +30 and you go again (word 1 of 3): ' + JSON.stringify(t));
  check(await page.evaluate(() => /word 2 of 3/.test(document.getElementById('status').textContent)), 'status line says word 2 of 3');
  await page.evaluate(() => { selectEntry(1); draft = 'OW'; guess(); });
  await page.waitForFunction(() => S.moveNo === 7, null, { timeout: 5000 });
  t = await page.evaluate(() => ({ turn: S.turn, chain: S.chain }));
  check(t.turn === 0 && t.chain === 2, 'second right guess: still your turn (word 2 of 3): ' + JSON.stringify(t));
  await page.evaluate(() => { selectEntry(2); draft = 'EN'; guess(); });
  await page.waitForFunction(() => S.moveNo === 8, null, { timeout: 5000 });
  t = await page.evaluate(() => ({ turn: S.turn, chain: S.chain, sc: S.players.map(p => p.score) }));
  check(t.turn === 1 && t.chain === 0 && t.sc[0] === 90, 'third right guess ends the streak and passes the turn: ' + JSON.stringify(t));

  // 4c. words finished by crossing letters don't count toward the 3
  await load({ known: 'C    E AN' });
  await page.evaluate(() => { selectEntry(1); draft = 'OW'; guess(); });
  await page.waitForFunction(() => S.moveNo === 6, null, { timeout: 5000 });
  t = await page.evaluate(() => ({ turn: S.turn, chain: S.chain, sc: S.players.map(p => p.score), by: S.entries.map(e => e.by) }));
  check(t.sc[0] === 60 && t.chain === 1 && t.turn === 0 && t.by[3] === 0, 'COW also finished WAN (+60 in all) but counts as one word in the streak: ' + JSON.stringify(t));

  // 5. a negative-score player can't hint; not your turn: no Hint
  await load({ players: [{ dev: 'dA', name: 'A', score: -15 }, { dev: 'dB', name: 'B', score: 100 }] });
  check(await page.isDisabled('#bHint'), 'Hint is off with a negative score');
  await load({ turn: 1, players: [{ dev: 'dA', name: 'A', score: 100 }, { dev: 'dB', name: 'B', score: 0 }] });
  check(await page.isDisabled('#bHint'), 'Hint is off when it is not your turn');
  await page.screenshot({ path: path.join(__dirname, 'scoring.png') });
  await b.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
