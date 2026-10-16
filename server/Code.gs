// Games API 1.4: one Apps Script that stores the saves for Tilework, Wheelhouse, Answers and Garden.
// The game pages live on GitHub Pages and call this script over HTTPS (doPost).
// Saves stay where they've always been: Games/<Game>/Save data on Player 1's Drive.
//
// Setup (once): paste this into a new Apps Script project in the Games folder, run setup(),
// approve the permissions, then Deploy → New deployment → Web app,
// Execute as: Me, Who has access: Anyone. Put the /exec link in config.js on GitHub.
//
// Every call is POST {game, fn, args, dev} as text/plain, and the reply is {result} or {error}.
// dev is the calling phone's player id (so you don't get a turn alert for your own move).

const MAX_GAMES = 5;

const GAMES = {
  tilework: {
    file: 'tilework-state', parent: '12wPzLtxt5awCZRKolMf--msClkw2e0b3',          // Games/Tilework
    folder: '1dXMZ9SEyzDKnr7D-_RfWjDjWnAo9WpqB',                                   // its Save data
    strict: false, extra: ['getWords']
  },
  wheelhouse: {
    file: 'wheelhouse-state', parent: '1uZxZBBM2XHhdecE2h-kJNyvXLBztgqIx',        // Games/Wheelhouse
    folder: '', strict: true, extra: ['getTrendingPuzzle', 'planPuzzle']
  },
  answers: {
    file: 'answers-state', parent: '1-gGJ2O0LXzXBdbX3wB6IbgpcLG7wNcwt',           // Games/Answers
    folder: '1KBmbtGoYfsDtKkbL22Gq8RTXruy1lHsw', strict: true, extra: ['getOnlineCategories', 'planBoard', 'planFinal']
  },
  garden: {
    file: 'garden-state', parent: '',                                                    // Games/Garden: made next to Tilework's folder the first time
    folder: '', strict: true, extra: []
  }
};

// ---------- web entry points ----------
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { result: dispatch_(req.game, req.fn, req.args || [], req.dev) };
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the /exec link in a browser shows a quick health check.
function doGet() {
  const out = { ok: true, app: 'Games API 1.4', games: Object.keys(GAMES) };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(game, fn, args, who) {
  if (game === 'app') {
    if (fn === 'getProfiles') return getProfiles();
    if (fn === 'setProfile') return setProfile(args[0], args[1], args[2]);
    if (fn === 'overview') return overview(args[0]);
    if (fn === 'pushKey') return pushKey();
    if (fn === 'setPush') return setPush(args[0], args[1]);
    if (fn === 'clearPush') return clearPush(args[0], args[1]);
    if (fn === 'testPush') return testPush(args[0]);
    throw new Error('Unknown call: ' + fn);
  }
  const g = GAMES[game];
  if (!g) throw new Error('Unknown game: ' + game);
  if (fn === 'getState') return getState_(game, args[0]);
  if (fn === 'saveState') {
    const r = saveState_(game, args[0], args[1]);
    if (r.ok) { try { notify_(who); } catch (e) { console.warn('Turn alerts: ' + e); } }   // alerts never break a save
    return r;
  }
  if (fn === 'closeGame') return closeGame_(game, args[0], args[1]);
  if (g.extra.indexOf(fn) >= 0) {
    if (fn === 'getWords') return getWords();
    if (fn === 'getTrendingPuzzle') return getTrendingPuzzle();
    if (fn === 'planPuzzle') return planPuzzle(args[0], args[1]);
    if (fn === 'getOnlineCategories') return getOnlineCategories(args[0], args[1]);
    if (fn === 'planBoard') return planBoard(args[0], args[1], args[2], args[3]);
    if (fn === 'planFinal') return planFinal(args[0], args[1]);
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
  Logger.log('Online puzzle test: ' + JSON.stringify(trendingPuzzle_({})));
}

// ---------- saves ----------
function folder_(game) {
  const g = GAMES[game], props = PropertiesService.getScriptProperties();
  const key = 'FOLDER_' + game;
  const id = props.getProperty(key) || g.folder;
  if (id) { try { const f = DriveApp.getFolderById(id); props.setProperty(key, id); return f; } catch (e) { /* look it up below */ } }
  const parent = parent_(game);
  const it = parent.getFoldersByName('Save data');
  const f = it.hasNext() ? it.next() : parent.createFolder('Save data');
  props.setProperty(key, f.getId());
  return f;
}

// The Games/<Game> folder. The first three have fixed IDs. Garden's is found (or made) next to them,
// so its saves also live in Games/Garden/Save data.
function parent_(game) {
  const g = GAMES[game];
  if (g.parent) return DriveApp.getFolderById(g.parent);
  const props = PropertiesService.getScriptProperties(), key = 'PARENT_' + game;
  const id = props.getProperty(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* look it up below */ } }
  let root = null;
  try { const up = DriveApp.getFolderById(GAMES.tilework.parent).getParents(); if (up.hasNext()) root = up.next(); } catch (e) { root = null; }
  if (!root) root = DriveApp.getRootFolder();
  const name = game.charAt(0).toUpperCase() + game.slice(1);
  const it = root.getFoldersByName(name);
  const f = it.hasNext() ? it.next() : root.createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

// The garden's day number, same as dayIndex() in garden/index.html (rolls over at 3 AM Pacific).
function gardenDay_() {
  const p = Utilities.formatDate(new Date(Date.now() - 3 * 3600000), 'America/Los_Angeles', 'yyyy-MM-dd').split('-');
  return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
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
  if (game === 'garden') {
    const gd = s.players.map(function (p) { return p.dev; });
    return { gid: s.gid, status: s.status, names: s.players.map(function (p) { return p.name; }), devs: gd,
             act: s.status === 'shape' ? (gd[s.turn] || '') : '', day: s.day };
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
function overview(dev, allProps) {
  const props = allProps || PropertiesService.getScriptProperties().getProperties();
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
      if (game === 'garden' && g.status === 'grow') { if (g.day < gardenDay_()) n++; return; }   // a new garden day is waiting
      const acts = String(g.act || '').split(',');
      if (acts.indexOf(dev) >= 0 || g.act === '*') n++;
      else if (seat === 0 && acts.some(function (a) { return a.indexOf('bot') === 0; })) n++;
    });
    out[game] = n;
  });
  return out;
}

// ---------- turn alerts (web push) ----------
// A phone that turns on alerts sends its push subscription here: PUSH = {dev: [subscription, ...]}.
// After every save, each subscribed player whose count of waiting games went up (PUSH_SEEN keeps
// the last counts) gets an empty push. The app's service worker then asks overview() what's
// waiting and shows "Your move in Wheelhouse"; on Android that also puts a dot on the app icon.
// Pushes are signed (VAPID, ES256) with a key made on first use and kept in Script Properties.
const PUSH_CONTACT = 'https://parsko41.github.io/games/';
const MAX_SUBS = 3;   // phones per player

function pushKey() { return vapidKeys_().pub; }

function setPush(dev, sub) {
  dev = String(dev || '');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(dev)) throw new Error('Bad player id');
  if (!sub || !/^https:\/\/\S+$/.test(String(sub.endpoint || '')) || String(sub.endpoint).length > 1000) throw new Error('Bad subscription');
  const clean = { endpoint: String(sub.endpoint) };
  editPush_(function (all, seen) {
    Object.keys(all).forEach(function (d) {
      all[d] = all[d].filter(function (s) { return s.endpoint !== clean.endpoint; });
      if (!all[d].length) delete all[d];
    });
    all[dev] = (all[dev] || []).concat([clean]).slice(-MAX_SUBS);
    seen[dev] = overview(dev);   // only alert for turns that come after this
  });
  return true;
}

function clearPush(dev, endpoint) {
  editPush_(function (all) {
    if (!all[dev]) return;
    all[dev] = all[dev].filter(function (s) { return s.endpoint !== endpoint; });
    if (!all[dev].length) delete all[dev];
  });
  return true;
}

// Run in the editor to check alerts can work here: makes the key, signs once, lists phones signed up.
function checkAlerts() {
  Logger.log('Alert key: ' + pushKey());
  Logger.log('Signing works: ' + (vapidHeader_('https://fcm.googleapis.com/check').length > 100));
  Logger.log('Players with alerts on: ' + JSON.stringify(Object.keys(readPush_().all)));
}

// From the app ("Send a test alert"), or run it in the editor with no player to ping every phone.
function testPush(dev) {
  const all = readPush_().all;
  const devs = dev ? [dev] : Object.keys(all);
  let sent = 0;
  devs.forEach(function (d) { sent += sendPush_(d, all[d] || []); });
  Logger.log('Test alerts sent: ' + sent);
  return sent;
}

function readPush_() {
  const props = PropertiesService.getScriptProperties();
  return { all: JSON.parse(props.getProperty('PUSH') || '{}'), seen: JSON.parse(props.getProperty('PUSH_SEEN') || '{}') };
}

function editPush_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = readPush_();
    fn(p.all, p.seen);
    PropertiesService.getScriptProperties().setProperties({ PUSH: JSON.stringify(p.all), PUSH_SEEN: JSON.stringify(p.seen) });
  } finally {
    lock.releaseLock();
  }
}

// After a save: alert everyone (except the player who just moved) who has more games waiting than before.
function notify_(who) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const all = JSON.parse(props.PUSH || '{}');
  if (!Object.keys(all).length) return;
  const wake = [];
  editPush_(function (subs, seen) {
    Object.keys(subs).forEach(function (dev) {
      const now = overview(dev, props), was = seen[dev] || {};
      const up = Object.keys(now).some(function (g) { return now[g] > (was[g] || 0); });
      if (up && dev !== who) wake.push(dev);
      seen[dev] = now;
    });
  });
  wake.forEach(function (dev) { sendPush_(dev, all[dev]); });
}

// Sends an empty push to each of a player's phones; drops phones the push service says are gone.
function sendPush_(dev, subs) {
  let sent = 0;
  const gone = [];
  (subs || []).forEach(function (s) {
    try {
      const res = UrlFetchApp.fetch(s.endpoint, {
        method: 'post', payload: '', muteHttpExceptions: true,
        headers: { TTL: '86400', Urgency: 'high', Authorization: vapidHeader_(s.endpoint) }
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) sent++;
      else if (code === 404 || code === 410) gone.push(s.endpoint);
      else console.warn('Push ' + code + ': ' + res.getContentText().slice(0, 200));
    } catch (e) {
      console.warn('Push failed: ' + e);
    }
  });
  gone.forEach(function (ep) { clearPush(dev, ep); });
  return sent;
}

// "vapid t=<signed JWT>, k=<public key>", cached for 6 hours per push service.
function vapidHeader_(endpoint) {
  const aud = endpoint.match(/^https:\/\/[^\/]+/)[0];
  const cache = CacheService.getScriptCache();
  const hit = cache.get('VAPID_' + aud);
  if (hit) return hit;
  const keys = vapidKeys_();
  const enc = function (o) { return b64u_(Utilities.newBlob(JSON.stringify(o)).getBytes()); };
  const body = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: PUSH_CONTACT });
  const header = 'vapid t=' + body + '.' + b64u_(ecSign_(body, keys.d)) + ', k=' + keys.pub;
  cache.put('VAPID_' + aud, header, 6 * 3600);
  return header;
}

// The signing key pair: d (private) and pub (public, base64url), made once.
function vapidKeys_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('VAPID');
  if (saved) { const k = JSON.parse(saved); return { d: BigInt('0x' + k.d), pub: k.pub }; }
  const seed = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Date.now(), Math.random()].join('|');
  const d = toInt_(sha256_(Utilities.newBlob(seed).getBytes())) % (EC.n - BigInt(1)) + BigInt(1);
  const Q = ecMul_(d, [EC.gx, EC.gy]);
  const pub = b64u_([4].concat(toBytes_(Q[0]), toBytes_(Q[1])));
  props.setProperty('VAPID', JSON.stringify({ d: d.toString(16), pub: pub }));
  return { d: d, pub: pub };
}

// ---------- P-256 elliptic curve (Apps Script has no ECDSA, so it's done by hand) ----------
const EC = {
  p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
  n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
  gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
};
function mod_(a, m) { const r = a % m; return r < BigInt(0) ? r + m : r; }
function inv_(a, m) {         // modular inverse (extended Euclid)
  let r0 = mod_(a, m), r1 = m, s0 = BigInt(1), s1 = BigInt(0);
  while (r1 !== BigInt(0)) { const q = r0 / r1; let t = r0 - q * r1; r0 = r1; r1 = t; t = s0 - q * s1; s0 = s1; s1 = t; }
  return mod_(s0, m);
}
function ecAdd_(P, Q) {       // points are [x, y]; null is the point at infinity
  if (!P) return Q;
  if (!Q) return P;
  const p = EC.p;
  let l;
  if (P[0] === Q[0]) {
    if (mod_(P[1] + Q[1], p) === BigInt(0)) return null;
    l = mod_((BigInt(3) * P[0] * P[0] - BigInt(3)) * inv_(BigInt(2) * P[1], p), p);   // curve a = -3
  } else {
    l = mod_((Q[1] - P[1]) * inv_(Q[0] - P[0], p), p);
  }
  const x = mod_(l * l - P[0] - Q[0], p);
  return [x, mod_(l * (P[0] - x) - P[1], p)];
}
function ecMul_(k, P) {
  let R = null, A = P;
  while (k > BigInt(0)) { if (k & BigInt(1)) R = ecAdd_(R, A); A = ecAdd_(A, A); k >>= BigInt(1); }
  return R;
}
// ES256 signature (r || s, 64 bytes). k comes from HMAC(private key, message hash), so it never repeats.
function ecSign_(text, d) {
  const h = sha256_(Utilities.newBlob(text).getBytes()), z = toInt_(h), n = EC.n;
  for (let c = 0; c < 100; c++) {
    const k = toInt_(Utilities.computeHmacSha256Signature(h.concat([c]), toBytes_(d))) % n;
    if (k === BigInt(0)) continue;
    const r = ecMul_(k, [EC.gx, EC.gy])[0] % n;
    if (r === BigInt(0)) continue;
    const s = mod_(inv_(k, n) * (z + r * d), n);
    if (s === BigInt(0)) continue;
    return toBytes_(r).concat(toBytes_(s));
  }
  throw new Error('Could not sign');
}
function sha256_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes); }
function toInt_(bytes) { let x = BigInt(0); for (let i = 0; i < bytes.length; i++) x = (x << BigInt(8)) | BigInt(bytes[i] & 255); return x; }
function toBytes_(x) {        // 32 bytes, big-endian, as Apps Script's signed bytes
  const out = [];
  for (let i = 0; i < 32; i++) { const b = Number(x & BigInt(255)); out.unshift(b > 127 ? b - 256 : b); x >>= BigInt(8); }
  return out;
}
function b64u_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }

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

// ---------- Wheelhouse: no repeats for a year ----------
// wheelhouse-history.json (in Games/Wheelhouse) remembers every puzzle used, built-in or online,
// as {puzzles: {fingerprint: day}}. Only a fingerprint is kept, so the file doesn't give answers away.
// Nothing used in the last HISTORY_DAYS days is used again. When every built-in puzzle has been
// used this year, puzzles come from online instead (even in "Built-in only" games).
const WH_HISTORY_NAME = 'wheelhouse-history.json';

function readWhHistory_(file) {
  let h = {};
  try { h = JSON.parse((file || historyFile_('wheelhouse')).getBlob().getDataAsString() || '{}') || {}; } catch (e) { h = {}; }
  const cut = today_() - HISTORY_DAYS, src = h.puzzles || {}, out = {};
  Object.keys(src).forEach(function (x) { if (src[x] > cut) out[x] = src[x]; });
  return { puzzles: out };
}

function noteWhPuzzle_(fpv) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const file = historyFile_('wheelhouse'), h = readWhHistory_(file);
    h.puzzles[fpv] = today_();
    file.setContent(JSON.stringify(h));
  } finally {
    lock.releaseLock();
  }
}

// One puzzle. keys: the page's built-in puzzle phrases; preferOnline: try an online one first.
// Returns {i} (a built-in puzzle) or {text, cat, hint, src: 'online'}, never one used this year
// unless there's no internet and every built-in has been used (then the one used longest ago).
function planPuzzle(keys, preferOnline) {
  keys = (keys || []).map(String);
  const h = readWhHistory_();
  const fps = keys.map(fp_);
  const fresh = [];
  fps.forEach(function (f, i) { if (!h.puzzles[f]) fresh.push(i); });
  if (preferOnline || !fresh.length) {
    const p = trendingPuzzle_(h.puzzles);
    if (p) { noteWhPuzzle_(fp_(p.text)); return p; }
  }
  if (!keys.length) return null;
  let i;
  if (fresh.length) i = fresh[Math.floor(Math.random() * fresh.length)];
  else i = shuffle_(keys.map(function (k, j) { return j; })).sort(function (a, b) { return h.puzzles[fps[a]] - h.puzzles[fps[b]]; })[0];
  noteWhPuzzle_(fps[i]);
  return { i: i };
}

// Older pages call this directly. It skips (and remembers) puzzles too.
function getTrendingPuzzle() {
  const p = trendingPuzzle_(readWhHistory_().puzzles);
  if (p) noteWhPuzzle_(fp_(p.text));
  return p;
}

// A random "most read on Wikipedia" article from a random day in the last two years, that fits the
// board and isn't in played ({fingerprint: day}). Returns {text, cat, hint, src} or null.
function trendingPuzzle_(played) {
  played = played || {};
  for (let attempt = 0; attempt < 6; attempt++) {
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
        if (text && fitsBoard_(text) && !played[fp_(text)]) picks.push({ text: text, hint: a.description || '' });
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

// Same check as the page: at least 6 letters, and it fits the 12/14/14/12 board.
function fitsBoard_(text) {
  if (text.replace(/[^A-Z]/g, '').length < 6) return false;
  const words = text.split(' ');
  const plans = [[14], [14, 14], [12, 14, 14], [12, 14, 14, 12]];
  return plans.some(function (caps) {
    let line = 0, cur = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length > caps[line]) return false;
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= caps[line]) cur += ' ' + w;
      else { line++; cur = w; if (line >= caps.length || w.length > caps[line]) return false; }
    }
    return true;
  });
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

// ---------- Answers: no repeats for a year ----------
// answers-history.json (in Games/Answers) remembers what's been played and on which day:
// built-in category names, final clues, and every online clue (a fingerprint of its question).
// Nothing played in the last HISTORY_DAYS days is picked again. When the built-in categories or
// finals run out, online ones are used, even in "Built-in only" games. Built-ins only come back
// early if the online sites can't be reached (then the ones played longest ago).
const HISTORY_DAYS = 365;
const HISTORY_NAME = 'answers-history.json';

function today_() { return Math.floor(Date.now() / 86400000); }

// Short fingerprint of a question: case, spacing and punctuation don't matter.
function fp_(s) {
  const t = String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// game: 'answers' (default) or 'wheelhouse'. Each game's history sits in its own Games/<Game> folder.
function historyFile_(game) {
  game = game || 'answers';
  const key = game === 'answers' ? 'HISTORY_ID' : 'HISTORY_ID_' + game;
  const name = game === 'answers' ? HISTORY_NAME : WH_HISTORY_NAME;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(key);
  if (id) { try { return DriveApp.getFileById(id); } catch (e) { /* look it up below */ } }
  const parent = DriveApp.getFolderById(GAMES[game].parent);
  const it = parent.getFilesByName(name);
  const f = it.hasNext() ? it.next() : parent.createFile(name, '{}', 'application/json');
  props.setProperty(key, f.getId());
  return f;
}

// {cats: {name: day}, finals: {fp: day}, clues: {fp: day}}, with anything older than a year dropped.
function readHistory_(file) {
  let h = {};
  try { h = JSON.parse((file || historyFile_()).getBlob().getDataAsString() || '{}') || {}; } catch (e) { h = {}; }
  const cut = today_() - HISTORY_DAYS;
  ['cats', 'finals', 'clues'].forEach(function (k) {
    const src = h[k] || {}, out = {};
    Object.keys(src).forEach(function (x) { if (src[x] > cut) out[x] = src[x]; });
    h[k] = out;
  });
  return h;
}

// add = {cats: [names], finals: [fps], clues: [fps]}: marks them played today.
function noteHistory_(add) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const file = historyFile_(), h = readHistory_(file), d = today_();
    ['cats', 'finals', 'clues'].forEach(function (k) { (add[k] || []).forEach(function (x) { h[k][x] = d; }); });
    file.setContent(JSON.stringify(h));
  } finally {
    lock.releaseLock();
  }
}

// Unplayed names first (shuffled), then the ones played longest ago.
function freshFirst_(names, played) {
  const fresh = shuffle_(names.filter(function (n) { return !played[n]; }));
  const old = shuffle_(names.filter(function (n) { return played[n]; }))
    .sort(function (a, b) { return played[a] - played[b]; });
  return { fresh: fresh, all: fresh.concat(old) };
}

// One board. names: built-in categories the page can still use this game; want: how many of them
// it would like (4 for Built-in + online, 6 for Built-in only, 0 for Online only); avoid: category
// names already on the board; online: no longer used (online clues fill in whenever built-ins run out).
// Returns {builtin: [names], online: [{name, src, clues}]}, 6 categories in all.
function planBoard(names, want, avoid, online) {
  names = (names || []).map(String);
  avoid = avoid || [];
  want = Math.min(Math.max(Math.floor(Number(want) || 0), 0), 6);
  const h = readHistory_();
  const order = freshFirst_(names, h.cats);
  const builtin = order.fresh.slice(0, want);
  let cats = [];
  if (builtin.length < 6) cats = fetchOnline_(6 - builtin.length, avoid.concat(builtin), h);
  // Still short (no internet, or Built-in only): fill with built-ins, least recently played first.
  order.all.forEach(function (n) { if (builtin.length + cats.length < 6 && builtin.indexOf(n) < 0) builtin.push(n); });
  const clues = [];
  cats.forEach(function (c) { c.clues.forEach(function (x) { clues.push(fp_(x.q)); }); });
  noteHistory_({ cats: builtin, clues: clues });
  return { builtin: builtin, online: cats };
}

// The final clue. keys: one per built-in final ("Category :: clue"). Returns {i} (a built-in
// final), or {cat, q, a} (an online one, when every built-in final was played this year).
// online: no longer used (the final goes online whenever the built-in finals run out).
function planFinal(keys, online) {
  keys = (keys || []).map(String);
  const h = readHistory_();
  const fps = keys.map(fp_), idx = keys.map(function (k, i) { return i; });
  const order = shuffle_(idx).sort(function (a, b) { return (h.finals[fps[a]] || 0) - (h.finals[fps[b]] || 0); });
  if (order.length && !h.finals[fps[order[0]]]) {
    noteHistory_({ finals: [fps[order[0]]] });
    return { i: order[0] };
  }
  const f = fetchFinal_(h);
  if (f) { noteHistory_({ clues: [fp_(f.q)] }); return f; }
  if (!order.length) return null;
  noteHistory_({ finals: [fps[order[0]]] });
  return { i: order[0] };
}

// ---------- Answers: online clues ----------
// Two free sources: The Trivia API (the-trivia-api.com, big, fast) and Open Trivia DB
// (opentdb.com, one call per 5 seconds). A category tries the sources it has in random order.
const ONLINE_CATS = [
  { name: 'General Knowledge', tta: 'general_knowledge', otdb: 9 },
  { name: 'Books', otdb: 10 },
  { name: 'Arts & Literature', tta: 'arts_and_literature' },
  { name: 'Film', otdb: 11 },
  { name: 'Film & TV', tta: 'film_and_tv' },
  { name: 'Music', tta: 'music', otdb: 12 },
  { name: 'Television', otdb: 14 },
  { name: 'Video Games', otdb: 15 },
  { name: 'Science & Nature', otdb: 17 },
  { name: 'Science', tta: 'science' },
  { name: 'Computers', otdb: 18 },
  { name: 'Sports', tta: 'sport_and_leisure', otdb: 21 },
  { name: 'Geography', tta: 'geography', otdb: 22 },
  { name: 'History', tta: 'history', otdb: 23 },
  { name: 'Animals', otdb: 27 },
  { name: 'Food & Drink', tta: 'food_and_drink' },
  { name: 'Society & Culture', tta: 'society_and_culture' }
];
let lastOtdb_ = 0;

// Older pages call this directly (no history check on their built-in clues).
function getOnlineCategories(n, avoid) {
  n = Math.min(Math.max(Math.floor(Number(n) || 0), 0), 6);
  const h = readHistory_();
  const out = fetchOnline_(n, avoid || [], h);
  const clues = [];
  out.forEach(function (c) { c.clues.forEach(function (x) { clues.push(fp_(x.q)); }); });
  if (clues.length) noteHistory_({ clues: clues });
  return out;
}

// n categories of 5 clues (easiest first) that haven't been played this year.
function fetchOnline_(n, avoid, h) {
  const cats = shuffle_(ONLINE_CATS.filter(function (c) { return avoid.indexOf(c.name) < 0; }));
  const seen = Object.assign({}, h.clues), down = {}, out = [];
  let calls = 0;
  for (let k = 0; k < cats.length && out.length < n && calls < n + 4; k++) {
    const srcs = shuffle_(['tta', 'otdb'].filter(function (s) { return cats[k][s] && !down[s]; }));
    for (let j = 0; j < srcs.length && calls < n + 4; j++) {
      calls++;
      const got = fetchClues_(srcs[j], cats[k][srcs[j]], '');
      if (!got.length) { down[srcs[j]] = 1; calls--; continue; }   // that site isn't answering: stop asking it
      const pool = got.filter(function (c) { return goodClue_(c) && !seen[fp_(c.q)]; });
      const five = pickFive_(pool);
      if (!five) continue;
      five.forEach(function (c) { seen[fp_(c.q)] = 1; });
      out.push({ name: cats[k].name, src: 'online', clues: five });
      break;
    }
  }
  return out;
}

// One hard online clue for the final, not played this year.
// Tries The Trivia API first, then Open Trivia DB if that one isn't answering.
function fetchFinal_(h) {
  const srcs = ['tta', 'otdb'];
  for (let j = 0; j < srcs.length; j++) {
    const cats = shuffle_(ONLINE_CATS.filter(function (c) { return c[srcs[j]]; }));
    for (let k = 0; k < 3 && k < cats.length; k++) {
      const pool = fetchClues_(srcs[j], cats[k][srcs[j]], 'hard').filter(function (c) { return goodClue_(c) && !h.clues[fp_(c.q)]; });
      if (pool.length) { const c = pool[0]; return { cat: cats[k].name, q: c.q, a: c.a }; }
    }
  }
  return null;
}

// [{q, a, d}] from one source, or [] if it didn't answer.
function fetchClues_(src, cat, difficulty) {
  try {
    if (src === 'tta') {
      const url = 'https://the-trivia-api.com/v2/questions?limit=50&categories=' + cat + (difficulty ? '&difficulties=' + difficulty : '');
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return [];
      return shuffle_(JSON.parse(res.getContentText()) || []).filter(function (r) { return !r.isNiche; }).map(function (r) {
        return { q: String(r.question && r.question.text || r.question || '').trim(), a: String(r.correctAnswer || '').trim(), d: r.difficulty };
      });
    }
    const wait = lastOtdb_ + 5200 - Date.now();
    if (wait > 0) Utilities.sleep(wait);
    lastOtdb_ = Date.now();
    const url = 'https://opentdb.com/api.php?amount=50&type=multiple&encode=url3986&category=' + cat + (difficulty ? '&difficulty=' + difficulty : '');
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    const data = JSON.parse(res.getContentText());
    if (data.response_code !== 0) return [];
    return (data.results || []).map(function (r) {
      return { q: dec_(r.question), a: dec_(r.correct_answer), d: r.difficulty };
    });
  } catch (e) {
    return [];
  }
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
