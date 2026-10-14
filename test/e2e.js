// End-to-end test: two phones (Player 1, Player 2) use the app through the real shim -> fake server -> real Code.gs.
// Run: node test/e2e.js
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
  while (Date.now() - t0 < (ms || 8000)) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(150); }
  check(false, 'timed out: ' + label); return null;
}

(async () => {
  const PORT = 18555, URL = 'http://localhost:' + PORT + '/';
  const { server, backend } = await start(PORT);
  const { ctx, folders } = backend;

  // An old Wheelhouse game already in progress (slot 1), saved by the old Apps Script with old device ids.
  folders.wh.createFile('wheelhouse-state-1.json', JSON.stringify({ app: 'wheelhouse', gid: 'gold', moveNo: 7, status: 'play', settings: { rounds: 3, source: 'builtin' },
    players: [{ dev: 'dOLDp1', name: 'Player 1', bank: 300, total: 0 }, { dev: 'dOLDp2', name: 'Player 2', bank: 0, total: 0 }], round: 1, turn: 0, starter: 0,
    puzzle: { text: 'BREAK A LEG', cat: 'Phrase', hint: '', src: 'built-in' }, guessed: ['R'], phase: 'spin', spinVal: 0, spin: { n: 2, idx: 3, jit: 0 }, log: ['old game'], used: [], bonus: null, last: '' }));

  ctx.setup();   // step 1 of the real setup: finds the save folders and lists games already in progress
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const phone = { viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true };
  async function mkPhone(label) {
    const c = await browser.newContext(phone);
    const p = await c.newPage();
    p.on('pageerror', e => { console.log('PAGEERROR ' + label + ': ' + e.message); failures++; });
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) console.log('CONSOLE ' + label + ': ' + m.text()); });
    await p.goto(URL);
    return p;
  }
  const frame = (p, g) => p.frame({ url: new RegExp('/' + g + '/') });

  // ---------- login ----------
  const A = await mkPhone('Player 1');
  await A.waitForSelector('#bNewP');
  check(await A.isVisible('text=Who\'s playing on this phone?'), 'first open asks who is playing');
  await A.click('#bNewP');
  await A.fill('#pName', 'Player 1');
  await A.click('#emo button[data-e="🦊"]');
  await A.click('#pSave');
  await until(() => frame(A, 'tilework'), 5000, 'tilework frame');
  const me = await A.evaluate(() => JSON.parse(localStorage.getItem('games-me')));
  check(me && me.name === 'Player 1' && me.avatar === '🦊' && /^p/.test(me.dev), 'Player 1 saved: ' + JSON.stringify(me));
  check(JSON.parse(ctx.getProfiles ? JSON.stringify(ctx.getProfiles()) : '{}')[me.dev].name === 'Player 1', 'profile stored on the server');
  await A.screenshot({ path: path.join(shots, 'a-tilework-lobby.png') });

  const B = await mkPhone('Player 2');
  await B.waitForSelector('#whoList button');
  check((await B.textContent('#whoList')).includes('Player 1'), 'second phone sees Player 1 in the player list');
  await B.click('#bNewP'); await B.fill('#pName', 'Player 2'); await B.click('#emo button[data-e="🐼"]'); await B.click('#pSave');
  await until(() => frame(B, 'tilework'), 5000, 'B tilework frame');
  const p2 = await B.evaluate(() => JSON.parse(localStorage.getItem('games-me')));

  // the game pages use the app's player id
  const twA = frame(A, 'tilework');
  await until(() => twA.evaluate(() => localStorage.getItem('tilework-id')), 4000, 'tilework id');
  check(await twA.evaluate(() => localStorage.getItem('tilework-id')) === me.dev, 'Tilework uses the app player id');

  // ---------- Tilework ----------
  await until(() => twA.isVisible('#lobbyGo'), 6000, 'tilework lobby');
  await twA.click('#lobbyGo'); await twA.click('#setupGo');
  await until(() => twA.evaluate(() => window.__tw.state && window.__tw.state.status === 'waiting'), 6000, 'tilework waiting');
  const twB = frame(B, 'tilework');
  await twB.evaluate(() => {}); // frame ready
  await until(async () => { await B.evaluate(() => 0); return twB.isVisible('#joinBtn'); }, 10000, 'B sees Join');
  await twB.click('#joinBtn');
  await until(() => twA.evaluate(() => window.__tw.state && window.__tw.state.status === 'active'), 10000, 'tilework active on A');
  let tws = await twA.evaluate(() => window.__tw.state);
  check(tws.players[0] === me.dev && tws.players[1] === p2.dev, 'Tilework seats are the app players');
  await until(() => twA.evaluate(() => document.querySelector('#pl1 .nm').textContent.includes('🐼')), 6000, 'avatar in Tilework');
  check((await twA.textContent('#pl0 .nm')).startsWith('🦊'), 'Tilework shows avatars: ' + (await twA.textContent('#pl0 .nm')) + ' / ' + (await twA.textContent('#pl1 .nm')));
  check((await twA.textContent('#bagc')).includes('1.0'), 'Tilework shows version 1.0');
  // whoever's turn it is plays two tiles through the star
  const turnPage = tws.turn === 0 ? A : B, twT = frame(turnPage, 'tilework');
  await until(() => twT.evaluate(() => window.__tw.state && window.__tw.state.turn === window.__tw.me), 8000, 'turn page knows it is its turn');
  await sleep(500);
  await twT.click('#rack .slot:nth-child(1) .htile:not(.anchor), #rack .slot:nth-child(2) .htile:not(.anchor) >> nth=0'); await twT.click('.cell[data-i="112"]');
  await sleep(200);
  await twT.click('#rack .htile:not(.anchor) >> nth=0'); await twT.click('.cell[data-i="113"]');
  await sleep(300);
  await twT.click('#playBtn'); await sleep(200);
  if (await twT.evaluate(() => !document.querySelector('#playBtn').disabled && /Tap Play again/.test(document.querySelector('#status').textContent))) await twT.click('#playBtn');
  await until(() => twA.evaluate(() => window.__tw.state.moveNo >= 2 && window.__tw.state.turn !== undefined && window.__tw.state.log.length > 0), 10000, 'tilework move saved');
  tws = await twA.evaluate(() => window.__tw.state);
  check(tws.log.length === 1 && tws.scores[tws.turn === 0 ? 1 : 0] > 0, 'Tilework move scored: ' + JSON.stringify(tws.log));
  await (tws.turn === 0 ? A : B).screenshot({ path: path.join(shots, 'tilework-phone.png') });

  // ---------- app turn dots ----------
  const dotPage = tws.turn === 0 ? A : B, otherPage = tws.turn === 0 ? B : A;
  await dotPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(() => dotPage.isVisible('#bar .tab[data-game="tilework"] .dot'), 6000, 'turn dot on Tilework tab');
  check(await dotPage.isVisible('#bar .tab[data-game="tilework"] .dot'), 'Tilework tab shows a dot for the player whose turn it is');
  check(!(await otherPage.isVisible('#bar .tab[data-game="tilework"] .dot')), 'no dot for the other player');
  check((await dotPage.title()).startsWith('(1)'), 'page title counts games waiting: ' + await dotPage.title());

  // ---------- Wheelhouse: old game carries over ----------
  await A.click('#bar .tab[data-game="wheelhouse"]');
  const whA = await until(() => frame(A, 'wheelhouse'), 5000, 'wheelhouse frame');
  await until(() => whA.evaluate(() => typeof GAMES !== 'undefined' && GAMES[1] && GAMES[1].gid === 'gold'), 8000, 'old game tab listed');
  await whA.evaluate(() => switchTab(1));
  await until(() => whA.isVisible('[data-claim="0"]'), 8000, 'claim seat button for old game');
  await whA.click('[data-claim="0"]');
  await until(() => whA.evaluate(() => S && S.players[0].dev === DEV), 8000, 'claimed old seat');
  check(await whA.evaluate(() => S.puzzle.text === 'BREAK A LEG' && S.players[0].bank === 300), 'old Wheelhouse game continues with its money and puzzle');

  // ---------- Wheelhouse: new 2-player game ----------
  await whA.evaluate(() => switchTab(0));
  await until(() => whA.isVisible('#bCreate'), 6000, 'wheelhouse new game form');
  check((await whA.inputValue('#sName')) === 'Player 1', 'name is filled in from the app player');
  await whA.selectOption('#sSrc', 'builtin'); await whA.selectOption('#sRounds', '2');
  await whA.click('#bCreate');
  await B.click('#bar .tab[data-game="wheelhouse"]');
  const whB = await until(() => frame(B, 'wheelhouse'), 5000, 'B wheelhouse frame');
  await until(() => whB.evaluate(() => S && S.status === 'lobby'), 10000, 'B sees lobby');
  await whB.click('#bJoin');
  await until(() => whA.evaluate(() => S && S.players.length === 2), 10000, 'Player 2 joined');
  check(await whA.evaluate(() => MAX_SEATS === 2), 'Wheelhouse max 2 players');
  await whA.click('#bStart');
  await until(() => whA.evaluate(() => S && S.status === 'play'), 10000, 'wheelhouse playing');
  const firsts = await whA.evaluate(() => S.turn);
  // play: whoever's turn solves it
  const whT = firsts === 0 ? whA : whB;
  await until(() => whT.evaluate(() => S && S.status === 'play' && myTurn()), 10000, 'turn page sees its turn');
  await whT.evaluate(() => solve(S.puzzle.text));
  await until(() => whA.evaluate(() => S.status === 'roundEnd'), 10000, 'round solved');
  const w = await whA.evaluate(() => ({ t: S.players.map(p => p.total), names: [...document.querySelectorAll('#players .nm')].map(e => e.textContent) }));
  check(w.t[firsts] >= 1000, 'Wheelhouse solve banks money: ' + JSON.stringify(w.t));
  check(w.names[0].startsWith('🦊') && w.names[1].startsWith('🐼'), 'Wheelhouse shows avatars: ' + w.names.join(' / '));
  check(!/BREAK A LEG|"text"/.test(folders.wh.files.find(f => f.name === 'wheelhouse-state.json').content), 'Wheelhouse save file has no plaintext answer');
  await whA.evaluate(() => nextRound());
  await until(() => whA.evaluate(() => S.status === 'play' && S.round === 2), 10000, 'round 2');
  const h = await whA.evaluate(() => ({ s: document.documentElement.scrollHeight, h: innerHeight }));
  check(h.s <= h.h + 2, 'Wheelhouse turn fits the phone inside the app (' + h.s + ' / ' + h.h + ')');
  await A.screenshot({ path: path.join(shots, 'wheelhouse-phone.png') });

  // ---------- Answers vs the computer ----------
  await A.click('#bar .tab[data-game="answers"]');
  const anA = await until(() => frame(A, 'answers'), 5000, 'answers frame');
  await until(() => anA.isVisible('#bCreate'), 8000, 'answers new game form');
  await anA.evaluate(() => { BOT_DELAY = 60; });
  await anA.selectOption('#sOpp', 'hard'); await anA.selectOption('#sRounds', '1'); await anA.selectOption('#sSrc', 'builtin');
  await anA.click('#bCreate');
  await until(() => anA.evaluate(() => S && S.players.length === 2 && S.players[1].dev === 'bot'), 8000, 'computer seated');
  await A.screenshot({ path: path.join(shots, 'answers-lobby-bot.png') });
  check((await anA.textContent('#lobby')).includes('🤖'), 'computer shows a robot avatar');
  await anA.click('#bStart');
  await until(() => anA.evaluate(() => S && S.status !== 'lobby'), 10000, 'answers started');
  let botBest = 0, sawBotPick = false, sawBotAnswer = false, myRight = 0, guard = 0;
  while (guard++ < 400) {
    const st = await anA.evaluate(() => ({ status: S.status, control: S.control, resp: responder(), dd: S.cur && S.cur.dd, wager: S.cur && S.cur.wager, busy, log: S.log[0] || '' }));
    if (/Computer picked/.test(st.log)) sawBotPick = true;
    if (/^Computer: "/.test(st.log)) sawBotAnswer = true;
    botBest = Math.max(botBest, await anA.evaluate(() => S.players[1].score));
    if (st.status === 'over') break;
    if (st.busy) { await sleep(50); continue; }
    if (st.status === 'pick' && st.control === 0) {
      await anA.evaluate(() => { for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++) if (!S.board.cats[c].clues[r].used) return pickClue(c, r); });
    } else if (st.status === 'clue' && st.resp === 0) {
      if (st.dd && st.wager == null) await anA.evaluate(() => ddWager(200));
      else if (Math.random() < 0.5) { myRight++; await anA.evaluate(() => respond('What is', S.board.cats[S.cur.c].clues[S.cur.r].a.split('|')[0])); }
      else await anA.evaluate(() => respond('What is', 'zzz'));
    } else if (st.status === 'roundEnd') {
      await anA.evaluate(() => nextRound());
    } else if (st.status === 'finalWager' && await anA.evaluate(() => S.final.in.indexOf(0) >= 0 && S.final.wager[0] === undefined)) {
      await anA.evaluate(() => finalWager(0));
    } else if (st.status === 'finalAnswer' && await anA.evaluate(() => S.final.in.indexOf(0) >= 0 && S.final.resp[0] === undefined)) {
      await anA.evaluate(() => finalRespond('What is', 'zzz'));
    }
    await sleep(120);
  }
  const fin = await anA.evaluate(() => ({ status: S.status, scores: S.players.map(p => p.score), final: S.final && { in: S.final.in, w: S.final.wager, ok: S.final.ok } }));
  check(fin.status === 'over', 'Answers game vs computer reached the end: ' + JSON.stringify(fin));
  check(sawBotPick && sawBotAnswer, 'computer picked clues and answered (pick ' + sawBotPick + ', answer ' + sawBotAnswer + ')');
  check(botBest > 0, 'computer scored during the game (best ' + botBest + ', final ' + fin.scores[1] + ')');
  await A.screenshot({ path: path.join(shots, 'answers-over.png') });
  const saved = JSON.parse(folders.an.files.find(f => f.name === 'answers-state.json').content);
  let leaks = 0;
  saved.board.cats.forEach(c => c.clues.forEach(cl => { if ('a' in cl || !cl.e) leaks++; }));
  if (saved.final && ('a' in saved.final || !saved.final.e)) leaks++;
  check(leaks === 0, 'Answers save file has no plaintext answers');
  check(await anA.evaluate(() => isRight('Arachnaphobia', 'Arachnophobia', 'fear of spiders') && isRight('Green paint', 'Green', 'Mix blue and yellow paint') && !isRight('Vitamin C', 'Vitamin A')), 'v3 typo matching is in 1.0');

  // ---------- Answers: two people, max 2 ----------
  await anA.evaluate(() => rematch ? null : null);
  await anA.evaluate(() => switchTab(1));
  await until(() => anA.isVisible('#bCreate'), 8000, 'answers tab 2 form');
  await anA.selectOption('#sOpp', 'person'); await anA.selectOption('#sSrc', 'builtin');
  await anA.click('#bCreate');
  await B.click('#bar .tab[data-game="answers"]');
  const anB = await until(() => frame(B, 'answers'), 5000, 'B answers frame');
  await until(() => anB.evaluate(() => GAMES[1] && GAMES[1].status === 'lobby'), 10000, 'B sees the Answers lobby tab');
  await anB.evaluate(() => switchTab(1));
  await until(() => anB.isVisible('#bJoin'), 8000, 'B join button');
  await anB.click('#bJoin');
  await until(() => anA.evaluate(() => S && S.players.length === 2), 10000, 'Player 2 joined Answers');
  check(await anB.evaluate(() => MAX_SEATS === 2), 'Answers max 2 players');
  await anA.click('#bStart');
  await until(() => anB.evaluate(() => S && S.status === 'pick'), 10000, 'B sees Answers board');
  const hb = await anB.evaluate(() => ({ s: document.documentElement.scrollHeight, h: innerHeight }));
  check(hb.s <= hb.h + 2, 'Answers board fits the phone inside the app (' + hb.s + ' / ' + hb.h + ')');
  await B.screenshot({ path: path.join(shots, 'answers-board-phone.png') });

  // ---------- profile edit ----------
  await A.click('#me');
  await A.fill('#pName', 'Player 1 P'); await A.click('#emo button[data-e="🚀"]'); await A.click('#pSave');
  await until(() => A.evaluate(() => document.getElementById('me').textContent === '🚀'), 5000, 'avatar changed');
  check(ctx.getProfiles()[me.dev].avatar === '🚀', 'avatar change saved on the server');

  // ---------- server: health check + overview counts the computer's move for the host ----------
  check(JSON.parse(ctx.doGet().getContent()).ok === true, 'doGet health check');
  const ov = ctx.overview(me.dev);
  check(typeof ov.tilework === 'number' && typeof ov.answers === 'number', 'overview: ' + JSON.stringify(ov));
  const bad = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ game: 'answers', fn: 'deleteEverything', args: [] }) } }).getContent());
  check(!!bad.error, 'unknown calls are refused: ' + bad.error);

  await browser.close(); server.close();
  console.log(failures ? failures + ' FAILURE(S)' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
