// Games API 1.0: one Apps Script that stores the saves for Tilework, Wheelhouse and Answers.
// The game pages live on GitHub Pages and call this script over HTTPS (doPost).
// Saves stay where they've always been: Games/<Game>/Save data on Luke's Drive.
//
// Setup (once): paste this into a new Apps Script project in the Games folder, run setup(),
// approve the permissions, then Deploy → New deployment → Web app,
// Execute as: Me, Who has access: Anyone. Put the /exec link in config.js on GitHub.
//
// Every call is POST {game, fn, args} as text/plain, and the reply is {result} or {error}.

const MAX_GAMES = 5;

const GAMES = {
  tilework: {
    file: 'tilework-state', parent: '12wPzLtxt5awCZRKolMf--msClkw2e0b3',          // Games/Tilework
    folder: '1dXMZ9SEyzDKnr7D-_RfWjDjWnAo9WpqB',                                   // its Save data
    strict: false, extra: ['getWords']
  },
  wheelhouse: {
    file: 'wheelhouse-state', parent: '1uZxZBBM2XHhdecE2h-kJNyvXLBztgqIx',        // Games/Wheelhouse
    folder: '', strict: true, extra: ['getTrendingPuzzle']
  },
  answers: {
    file: 'answers-state', parent: '1-gGJ2O0LXzXBdbX3wB6IbgpcLG7wNcwt',           // Games/Answers
    folder: '1KBmbtGoYfsDtKkbL22Gq8RTXruy1lHsw', strict: true, extra: ['getOnlineCategories']
  }
};

// ---------- web entry points ----------
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { result: dispatch_(req.game, req.fn, req.args || []) };
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the /exec link in a browser shows a quick health check.
function doGet() {
  const out = { ok: true, app: 'Games API 1.0', games: Object.keys(GAMES) };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(game, fn, args) {
  if (game === 'app') {
    if (fn === 'getProfiles') return getProfiles();
    if (fn === 'setProfile') return setProfile(args[0], args[1], args[2]);
    if (fn === 'overview') return overview(args[0]);
    throw new Error('Unknown call: ' + fn);
  }
  const g = GAMES[game];
  if (!g) throw new Error('Unknown game: ' + game);
  if (fn === 'getState') return getState_(game, args[0]);
  if (fn === 'saveState') return saveState_(game, args[0], args[1]);
  if (fn === 'closeGame') return closeGame_(game, args[0], args[1]);
  if (g.extra.indexOf(fn) >= 0) {
    if (fn === 'getWords') return getWords();
    if (fn === 'getTrendingPuzzle') return getTrendingPuzzle();
    if (fn === 'getOnlineCategories') return getOnlineCategories(args[0], args[1]);
  }
  throw new Error('Unknown call: ' + game + '.' + fn);
}

// Run once from the editor: approves Drive + fetch permissions, finds every save folder,
// and builds the turn summaries for games already in progress.
function setup() {
  Object.keys(GAMES).forEach(function (game) {
    const f = folder_(game);
    for (let s = 0; s < MAX_GAMES; s++) writeSummary_(game, s, readState_(stateFile_(f, game, s)));
    Logger.log(game + ' saves: ' + f.getUrl());
  });
  Logger.log('Word list: ' + (getWords().length ? 'found' : 'missing (run buildWords)'));
  Logger.log('Online puzzle test: ' + JSON.stringify(getTrendingPuzzle()));
}

// ---------- saves ----------
function folder_(game) {
  const g = GAMES[game], props = PropertiesService.getScriptProperties();
  const key = 'FOLDER_' + game;
  const id = props.getProperty(key) || g.folder;
  if (id) { try { const f = DriveApp.getFolderById(id); props.setProperty(key, id); return f; } catch (e) { /* look it up below */ } }
  const parent = DriveApp.getFolderById(g.parent);
  const it = parent.getFoldersByName('Save data');
  const f = it.hasNext() ? it.next() : parent.createFolder('Save data');
  props.setProperty(key, f.getId());
  return f;
}

function slot_(slot) {
  const n = Math.floor(Number(slot) || 0);
  return Math.min(Math.max(n, 0), MAX_GAMES - 1);
}

function stateFile_(folder, game, slot) {
  const s = slot_(slot), base = GAMES[game].file;
  const name = s === 0 ? base + '.json' : base + '-' + s + '.json';
  const it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : folder.createFile(name, 'null', 'application/json');
}

function readState_(file) {
  return JSON.parse(file.getBlob().getDataAsString() || 'null');
}

// Who needs to act next. Tilework keeps its own summary shape (the page reads it as-is).
function summary_(game, s) {
  if (!s || !s.players) return null;
  if (game === 'tilework') {
    return { gid: s.gid, players: s.players, names: s.names || ['', ''], turn: s.turn,
             status: s.status, scores: s.scores, rules: s.rules || null };
  }
  const devs = s.players.map(function (p) { return p.dev; });
  let act = '';
  if (game === 'wheelhouse') {
    if (s.status === 'play') act = devs[s.turn] || '';
    else if (s.status === 'bonus' && s.bonus && s.bonus.stage !== 'done') act = devs[s.bonus.p] || '';
    else if (s.status === 'roundEnd') act = '*';
  } else {
    if (s.status === 'pick') act = devs[s.control] || '';
    else if (s.status === 'clue' && s.cur) act = devs[s.cur.order[s.cur.at]] || '';
    else if (s.status === 'roundEnd') act = '*';
    else if ((s.status === 'finalWager' || s.status === 'finalAnswer') && s.final) {
      const key = s.status === 'finalWager' ? 'wager' : 'resp';
      act = s.final.in.filter(function (i) { return s.final[key][i] === undefined; })
        .map(function (i) { return devs[i]; }).join(',');
    }
  }
  return { gid: s.gid, status: s.status, names: s.players.map(function (p) { return p.name; }),
           devs: devs, act: act, round: s.round, rounds: s.settings && s.settings.rounds };
}

function writeSummary_(game, slot, s) {
  const props = PropertiesService.getScriptProperties();
  const key = 'GAME_' + game + '_' + slot_(slot);
  const val = JSON.stringify(summary_(game, s));
  if (props.getProperty(key) !== val) props.setProperty(key, val);
}

function games_(game, props) {
  const p = props || PropertiesService.getScriptProperties().getProperties();
  const out = [];
  for (let i = 0; i < MAX_GAMES; i++) out.push(JSON.parse(p['GAME_' + game + '_' + i] || 'null'));
  return out;
}

function getState_(game, slot) {
  const s = readState_(stateFile_(folder_(game), game, slot));
  writeSummary_(game, slot, s);
  return { state: s, games: games_(game) };
}

// Same rules each game always had: Wheelhouse and Answers accept a save only when moveNo goes up
// by exactly 1 (same gid) or a brand-new game arrives (moveNo 0). Tilework rejects only a stale
// moveNo for the same gid.
function saveState_(game, json, slot) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const file = stateFile_(folder_(game), game, slot);
    const cur = readState_(file);
    const next = JSON.parse(json);
    let ok;
    if (GAMES[game].strict) {
      const fresh = next && next.moveNo === 0 && (!cur || cur.gid !== next.gid);
      const step = cur && next && cur.gid === next.gid && next.moveNo === cur.moveNo + 1;
      ok = !!(fresh || step);
    } else {
      ok = !(cur && next && cur.gid === next.gid && cur.moveNo !== next.moveNo - 1);
    }
    if (!ok) return { ok: false, state: cur, games: games_(game) };
    file.setContent(json);
    writeSummary_(game, slot, next);
    return { ok: true, state: next, games: games_(game) };
  } finally {
    lock.releaseLock();
  }
}

// Clears one game so its tab is free. gid must match, so a stale phone can't wipe a newer game.
function closeGame_(game, slot, gid) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const file = stateFile_(folder_(game), game, slot);
    const cur = readState_(file);
    if (cur && cur.gid === gid) { file.setContent('null'); writeSummary_(game, slot, null); }
    return { ok: true, state: readState_(file), games: games_(game) };
  } finally {
    lock.releaseLock();
  }
}

// ---------- players (one login for every game) ----------
// PROFILES = {dev: {name, avatar, t}}. A phone picks a player once; every game uses that id.
function getProfiles() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('PROFILES') || '{}');
}

function setProfile(dev, name, avatar) {
  dev = String(dev || '').slice(0, 40);
  if (!/^[A-Za-z0-9_-]+$/.test(dev)) throw new Error('Bad player id');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const all = getProfiles();
    all[dev] = { name: String(name || '').trim().slice(0, 14) || 'Player', avatar: String(avatar || '🙂').slice(0, 8), t: Date.now() };
    PropertiesService.getScriptProperties().setProperty('PROFILES', JSON.stringify(all));
    return all;
  } finally {
    lock.releaseLock();
  }
}

// How many games are waiting on this player in each game (drives the dots on the app's tabs).
// A computer player's move counts for the game's host, whose phone plays it.
function overview(dev) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const out = {};
  Object.keys(GAMES).forEach(function (game) {
    let n = 0;
    games_(game, props).forEach(function (g) {
      if (!g) return;
      if (game === 'tilework') {
        if (g.status === 'active' && g.players && g.players[g.turn] === dev) n++;
        else if (g.status === 'waiting' && g.players && g.players[0] !== dev) n++;
        return;
      }
      const seat = g.devs.indexOf(dev);
      if (seat < 0) { if (g.status === 'lobby' && g.devs.length < 2) n++; return; }
      if (g.status === 'over' || g.status === 'lobby') return;
      const acts = String(g.act || '').split(',');
      if (acts.indexOf(dev) >= 0 || g.act === '*') n++;
      else if (seat === 0 && acts.some(function (a) { return a.indexOf('bot') === 0; })) n++;
    });
    out[game] = n;
  });
  return out;
}

// ---------- Tilework: word list ----------
// Collins Scrabble Words 2021 + NASPA Word List 2023, merged (about 280,000 words).
// buildWords() rebuilds "tilework-words.txt" in Games/Tilework; the old project already built it.
const WORD_SOURCES = [
  'https://cdn.jsdelivr.net/gh/scrabblewords/scrabblewords@main/words/British/CSW21.txt',
  'https://cdn.jsdelivr.net/gh/scrabblewords/scrabblewords@main/words/North-American/NWL2023.txt'
];
const WORDS_NAME = 'tilework-words.txt';

function wordsFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('WORDS_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) { /* look it up below */ } }
  const it = DriveApp.getFolderById(GAMES.tilework.parent).getFilesByName(WORDS_NAME);
  if (!it.hasNext()) return null;
  const f = it.next();
  props.setProperty('WORDS_ID', f.getId());
  return f;
}

function getWords() {
  const f = wordsFile_();
  if (!f) return '';
  try { return f.getBlob().getDataAsString(); } catch (e) { return ''; }
}

function buildWords() {
  const set = {};
  WORD_SOURCES.forEach(function (u) {
    const text = UrlFetchApp.fetch(u).getContentText();
    text.split(/\r?\n/).forEach(function (line) {
      const m = /^([A-Za-z]+)/.exec(line);
      if (m && m[1].length >= 2 && m[1].length <= 15) set[m[1].toUpperCase()] = 1;
    });
  });
  const words = Object.keys(set).sort();
  if (words.length < 100000) throw new Error('Word list looks too small: ' + words.length);
  const out = [];
  let prev = '';
  words.forEach(function (w) {
    let n = 0;
    while (n < 15 && n < prev.length && n < w.length && prev[n] === w[n]) n++;
    out.push(n.toString(16) + w.slice(n));
    prev = w;
  });
  const text = out.join('\n');
  let file = wordsFile_();
  if (file) file.setContent(text);
  else {
    file = DriveApp.getFolderById(GAMES.tilework.parent).createFile(WORDS_NAME, text, 'text/plain');
    PropertiesService.getScriptProperties().setProperty('WORDS_ID', file.getId());
  }
  Logger.log(words.length + ' words saved to ' + file.getUrl());
  return words.length;
}

// ---------- Wheelhouse: online puzzles ----------
// A random "most read on Wikipedia" article from a random day in the last two years.
// Returns {text, cat, hint, src} or null (the page falls back to built-in).
function getTrendingPuzzle() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const d = new Date(Date.now() - (2 + Math.floor(Math.random() * 700)) * 86400000);
    const url = 'https://en.wikipedia.org/api/rest_v1/feed/featured/' + Utilities.formatDate(d, 'UTC', 'yyyy/MM/dd');
    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) continue;
      const data = JSON.parse(res.getContentText());
      const arts = (data.mostread && data.mostread.articles) || [];
      const picks = [];
      arts.forEach(function (a) {
        const raw = (a.titles && a.titles.normalized) || a.normalizedtitle || a.title || '';
        const text = cleanTitle_(raw);
        if (text) picks.push({ text: text, hint: a.description || '' });
      });
      if (!picks.length) continue;
      const p = picks[Math.floor(Math.random() * picks.length)];
      return { text: p.text, cat: categoryFor_(p.hint), hint: p.hint, src: 'online' };
    } catch (e) {
      // try another day
    }
  }
  return null;
}

function cleanTitle_(raw) {
  if (/^(Main Page|Special:|Deaths in|List of|Wikipedia)/i.test(raw)) return '';
  let t = String(raw).replace(/_/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (!/^[A-Z][A-Z '&.\-]*$/.test(t)) return '';
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 6) return '';
  if (words.some(function (w) { return w.length > 12; })) return '';
  if (t.length > 44) return '';
  return words.join(' ');
}

function categoryFor_(desc) {
  const d = String(desc).toLowerCase();
  if (/\b(film|movie)\b/.test(d)) return 'Movie Title';
  if (/\b(television|tv|series|sitcom|show)\b/.test(d)) return 'TV Title';
  if (/\b(song|album|band|single)\b/.test(d)) return 'Music';
  if (/\b(team|club|league)\b/.test(d)) return 'Sports';
  if (/\b(city|country|state|capital|island|town|county|river|mountain|region)\b/.test(d)) return 'On the Map';
  if (/\b(born|actor|actress|singer|rapper|musician|player|politician|footballer|businessman|businesswoman|president|wrestler|comedian|author|writer|director|athlete|journalist|model|king|queen|prince|princess)\b/.test(d)) return 'Person';
  if (/\b(game|video game)\b/.test(d)) return 'Game';
  return 'In the News';
}

// ---------- Answers: online clues (Open Trivia DB) ----------
const OTDB_CATS = {
  9: 'General Knowledge', 10: 'Books', 11: 'Film', 12: 'Music', 14: 'Television',
  15: 'Video Games', 17: 'Science & Nature', 18: 'Computers', 21: 'Sports',
  22: 'Geography', 23: 'History', 27: 'Animals'
};

function getOnlineCategories(n, avoid) {
  n = Math.min(Math.max(Math.floor(Number(n) || 0), 0), 6);
  avoid = avoid || [];
  const ids = Object.keys(OTDB_CATS).filter(function (id) { return avoid.indexOf(OTDB_CATS[id]) < 0; });
  shuffle_(ids);
  const out = [];
  let calls = 0;
  for (let k = 0; k < ids.length && out.length < n && calls < n + 2; k++) {
    if (calls) Utilities.sleep(5200);
    calls++;
    try {
      const url = 'https://opentdb.com/api.php?amount=30&type=multiple&encode=url3986&category=' + ids[k];
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) continue;
      const data = JSON.parse(res.getContentText());
      if (data.response_code !== 0) continue;
      const pool = (data.results || []).map(function (r) {
        return { q: dec_(r.question), a: dec_(r.correct_answer), d: r.difficulty };
      }).filter(goodClue_);
      const five = pickFive_(pool);
      if (five) out.push({ name: OTDB_CATS[ids[k]], src: 'online', clues: five });
    } catch (e) {
      // try another category
    }
  }
  return out;
}

function dec_(s) {
  try { return decodeURIComponent(String(s)); } catch (e) { return String(s); }
}

// Only clues that work without the multiple-choice options and can be typed on a phone.
const NEEDS_OPTIONS = /following|of these|these (is|are|was|were)|which one|which of|\bexcept\b|\bNOT\b|true or false|\blisted\b|\bchoices?\b|\boptions?\b|none of|all of the/i;
function goodClue_(c) {
  if (!c.q || !c.a || c.q.length > 200) return false;
  if (NEEDS_OPTIONS.test(c.q)) return false;
  if (c.a.length > 30 || c.a.split(/\s+/).length > 5) return false;
  if (!/[A-Za-z0-9]/.test(c.a)) return false;
  return true;
}

function pickFive_(pool) {
  if (pool.length < 5) return null;
  const by = { easy: [], medium: [], hard: [] };
  shuffle_(pool).forEach(function (c) { (by[c.d] || by.medium).push(c); });
  const want = ['easy', 'easy', 'medium', 'medium', 'hard'];
  const picked = [];
  want.forEach(function (d) {
    const order = d === 'easy' ? ['easy', 'medium', 'hard'] : d === 'medium' ? ['medium', 'easy', 'hard'] : ['hard', 'medium', 'easy'];
    for (let i = 0; i < order.length; i++) if (by[order[i]].length) { picked.push(by[order[i]].shift()); return; }
  });
  const rank = { easy: 0, medium: 1, hard: 2 };
  picked.sort(function (x, y) { return rank[x.d] - rank[y.d]; });
  return picked.map(function (c) { return { q: c.q, a: c.a }; });
}

function shuffle_(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
