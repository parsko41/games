// Shared by every page of the Games app.
// 1) Gives the games the same google.script.run they used inside Apps Script, but sends each call
//    to the Games API over HTTPS, so the game code didn't have to change.
// 2) One login for every game: the player picked in the app is written into each game's own
//    device/name keys before the game starts.
// 3) Avatars: GamesApp.avatar(dev, name) returns "🦊 " (or "") for a player.
// 4) Winners' Log: GamesApp.winnersLog(game) opens the log sheet (each game's ☰ menu has the entry).
(function () {
  'use strict';
  const me = document.currentScript;
  const GAME = (me && me.dataset.game) || 'app';
  const API = window.GAMES_API_URL;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function call(game, fn, args) {
    if (!API || /PASTE/.test(API)) return Promise.reject(new Error('The app isn\'t connected yet: put the Games API link in config.js.'));
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ game: game, fn: fn, args: args, dev: player && player.dev }) })
      .then(function (r) { if (!r.ok) throw new Error('Server error ' + r.status); return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error); return j.result; });
  }

  // google.script.run look-alike: run.withSuccessHandler(f).withFailureHandler(g).someFn(args...)
  if (!(window.google && window.google.script && window.google.script.run)) {
    window.google = { script: { get run() {
      let ok = function () {}, bad = function () {};
      const chain = new Proxy({}, { get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { ok = f; return chain; };
        if (k === 'withFailureHandler') return function (f) { bad = f; return chain; };
        return function () { call(GAME, k, Array.prototype.slice.call(arguments)).then(function (r) { ok(r); }, function (e) { bad(e); }); };
      } });
      return chain;
    } } };
  }

  // ---------- the player on this phone ----------
  let player = null;
  try { player = JSON.parse(lsGet('games-me') || 'null'); } catch (e) { player = null; }
  const KEYS = {
    tilework: ['tilework-id', 'tilework-name'],
    wheelhouse: ['wheelhouse-device', 'wheelhouse-name'],
    answers: ['answers-device', 'answers-name'],
    garden: ['garden-device', 'garden-name']
  };
  if (player && player.dev && KEYS[GAME]) {
    lsSet(KEYS[GAME][0], player.dev);
    lsSet(KEYS[GAME][1], player.name || '');
  }

  // ---------- avatars ----------
  let profiles = {};
  try { profiles = JSON.parse(lsGet('games-profiles') || '{}') || {}; } catch (e) { profiles = {}; }
  // Fetch the player list; if it changed, tell the page so it can redraw names (event "gamesprofiles").
  let lastRefresh = 0;
  function refresh() {
    lastRefresh = Date.now();
    return call('app', 'getProfiles', []).then(function (p) {
      const changed = JSON.stringify(p || {}) !== JSON.stringify(profiles);
      profiles = p || {}; lsSet('games-profiles', JSON.stringify(profiles));
      if (changed) window.dispatchEvent(new Event('gamesprofiles'));
      return profiles;
    }, function () { return profiles; });
  }
  function avatar(dev, name) {
    if (dev && String(dev).indexOf('bot') === 0) return '🤖 ';
    let p = dev && profiles[dev];
    if (!p && name) {
      const n = String(name).trim().toLowerCase();
      for (const k in profiles) if (profiles[k] && String(profiles[k].name).toLowerCase() === n) { p = profiles[k]; break; }
    }
    if (!p && dev && Date.now() - lastRefresh > 3000) refresh();   // someone new: look them up
    return p && p.avatar ? p.avatar + ' ' : '';
  }
  if (GAME !== 'app') { refresh(); setInterval(function () { if (!document.hidden) refresh(); }, 60000); }

  // ---------- names ----------
  // The app login name wins over the name saved in a game, so a rename shows everywhere at once.
  function nameOf(dev, name) {
    const p = dev && profiles[dev];
    return p && p.name ? p.name : (name || '');
  }
  // Swap in login names for an array of seats like [{dev, name}, ...] (changes them in place).
  function fixNames(seats) {
    (seats || []).forEach(function (s) { if (s && s.dev) s.name = nameOf(s.dev, s.name); });
    return seats;
  }

  // ---------- Winners' Log (☰ → Winners' Log in each game) ----------
  // One sheet that slides up over the game, in the game's own colors. Opens on this game's record;
  // "All games" shows the grand tally. The rows come from the Games API (getLog); a game's moves
  // are fetched when you tap it (getLogGame). Wins are counted from the rows, newest first.
  const LOG_TITLES = { tilework: 'Tilework', wheelhouse: 'Wheelhouse', answers: 'Answers' };
  const LOG_CSS =
    '#wlVeil{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;z-index:60;color:var(--ink)}' +
    '#wlVeil .wl{background:var(--panel);width:100%;max-width:560px;box-sizing:border-box;border-radius:16px 16px 0 0;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 28px);max-height:88vh;overflow:auto}' +
    '#wlVeil .wlhead{display:flex;align-items:center;gap:8px;margin-bottom:10px}' +
    '#wlVeil h2{margin:0;font-size:1.2rem;flex:1}' +
    '#wlVeil button{font:inherit;color:inherit;cursor:pointer}' +
    '#wlVeil .wlx{border:0;background:transparent;font-size:1.4rem;padding:2px 8px;color:var(--muted,var(--dim))}' +
    '#wlVeil .wltog{display:flex;gap:4px;background:var(--panel2,var(--bg));border-radius:12px;padding:4px;margin-bottom:12px}' +
    '#wlVeil .wltog button{flex:1;border:0;background:transparent;border-radius:9px;padding:9px 4px;font-weight:700;color:var(--muted,var(--dim))}' +
    '#wlVeil .wltog button.on{background:var(--panel);color:var(--ink);box-shadow:inset 0 0 0 2px var(--accent,var(--gold))}' +
    '#wlVeil .wlcard{background:var(--panel2,var(--bg));border-radius:12px;padding:12px;margin-bottom:10px}' +
    '#wlVeil .wltally{display:flex;align-items:center;text-align:center}' +
    '#wlVeil .wltally>div{flex:1;min-width:0}' +
    '#wlVeil .wlnm{font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#wlVeil .wlbig{font-size:2.4rem;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}' +
    '#wlVeil .wldash{flex:0 0 auto!important;font-size:1.6rem;color:var(--muted,var(--dim));padding:14px 6px 0}' +
    '#wlVeil .wlsub{text-align:center;font-size:.85rem;color:var(--muted,var(--dim));margin-top:6px}' +
    '#wlVeil .wllead{color:var(--accent,var(--gold));font-weight:700}' +
    '#wlVeil .wlrow{display:flex;justify-content:space-between;gap:8px;font-size:.9rem;padding:4px 0}' +
    '#wlVeil h3{font-size:.95rem;margin:14px 0 6px;color:var(--muted,var(--dim))}' +
    '#wlVeil .wlg{display:block;width:100%;text-align:left;border:0;background:var(--panel2,var(--bg));border-radius:12px;padding:9px 12px;margin-bottom:6px}' +
    '#wlVeil .wlg .wlwhen{font-size:.75rem;color:var(--muted,var(--dim))}' +
    '#wlVeil .wlg .wlsc{display:flex;justify-content:space-between;gap:8px;font-size:.95rem;margin-top:2px}' +
    '#wlVeil .wlg .wlsc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#wlVeil .wlg b{color:var(--accent,var(--gold))}' +
    '#wlVeil .wlmoves{margin:6px 0 2px;padding-left:22px;font-size:.82rem;color:var(--muted,var(--dim))}' +
    '#wlVeil .wlmoves li{margin:2px 0}' +
    '#wlVeil .wlnote{font-size:.85rem;color:var(--muted,var(--dim));text-align:center;padding:10px 0}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function winnersLog(game) {
    if (!document.getElementById('wlStyle')) {
      const st = document.createElement('style'); st.id = 'wlStyle'; st.textContent = LOG_CSS; document.head.appendChild(st);
    }
    const old = document.getElementById('wlVeil'); if (old) old.remove();
    const veil = document.createElement('div'); veil.id = 'wlVeil';
    veil.innerHTML = '<div class="wl" role="dialog" aria-label="Winners\' Log"><div class="wlhead"><h2>Winners\' Log</h2>' +
      '<button class="wlx" aria-label="Close">✕</button></div><div class="wlbody"><div class="wlnote">Loading…</div></div></div>';
    document.body.appendChild(veil);
    const box = veil.querySelector('.wlbody');
    function close() { veil.remove(); }
    veil.querySelector('.wlx').onclick = close;
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });

    let rows = [], view = LOG_TITLES[game] ? game : 'all';
    const moves = {};   // key -> moves (fetched once)
    const myDev = player && player.dev;

    function who(dev, name) { return avatar(dev, name) + esc(nameOf(dev, name) || 'Player'); }
    // The two players and each one's wins (and ties) over some rows, from this phone's side.
    function tally(list) {
      const t = { wins: {}, ties: 0, n: list.length };
      list.forEach(function (r) { if (r.win) t.wins[r.win] = (t.wins[r.win] || 0) + 1; else t.ties++; });
      return t;
    }
    function pair() {
      const seen = {}, names = {};
      rows.forEach(function (r) { r.seats.forEach(function (s) { seen[s.dev] = (seen[s.dev] || 0) + 1; names[s.dev] = s.name; }); });
      const devs = Object.keys(seen).sort(function (a, b) { return (b === myDev) - (a === myDev) || seen[b] - seen[a]; });
      return [devs[0], devs[1]].map(function (d) { return { dev: d || '', name: names[d] || '' }; });
    }
    function tallyCard(t, p, grand) {
      const a = t.wins[p[0].dev] || 0, b = t.wins[p[1].dev] || 0;
      const lead = a === b ? (t.n ? 'All square' : '') : who(a > b ? p[0].dev : p[1].dev, a > b ? p[0].name : p[1].name) + (grand ? ' is the grand winner so far' : ' leads');
      return '<div class="wlcard"><div class="wltally">' +
        '<div><div class="wlnm">' + who(p[0].dev, p[0].name) + '</div><div class="wlbig">' + a + '</div></div>' +
        '<div class="wldash">–</div>' +
        '<div><div class="wlnm">' + who(p[1].dev, p[1].name) + '</div><div class="wlbig">' + b + '</div></div></div>' +
        '<div class="wlsub">' + (t.n ? 'wins · ' + t.ties + ' tie' + (t.ties === 1 ? '' : 's') + ' · ' + t.n + ' game' + (t.n === 1 ? '' : 's') : 'No finished games yet') + '</div>' +
        (lead ? '<div class="wlsub wllead">' + lead + '</div>' : '') + '</div>';
    }
    function when(t) {
      const d = new Date(t);
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    function moveList(r) {
      const m = moves[r.key];
      if (m === undefined) return '<div class="wlnote">Loading moves…</div>';
      if (!m || !m.length) return '<div class="wlnote">No moves were saved for this game.</div>';
      return '<ol class="wlmoves">' + m.map(function (x) {
        if (x && typeof x === 'object') { const s = r.seats[x.p]; return '<li>' + (s ? esc(nameOf(s.dev, s.name)) + ': ' : '') + esc(x.t) + '</li>'; }
        return '<li>' + esc(x) + '</li>';
      }).join('') + '</ol>';
    }
    function gameRow(r, showGame) {
      const a = r.seats[0], b = r.seats[1];
      const sc = function (s) { const t = who(s.dev, s.name) + ' ' + s.score; return '<span>' + (r.win === s.dev ? '<b>' + t + '</b>' : t) + '</span>'; };
      return '<button class="wlg" data-key="' + esc(r.key) + '"><div class="wlwhen">' + (showGame ? esc(LOG_TITLES[r.game] || r.game) + ' · ' : '') + when(r.t) + (r.win ? '' : ' · Tie') + '</div>' +
        '<div class="wlsc">' + sc(a) + sc(b) + '</div>' + (r.open ? moveList(r) : '') + '</button>';
    }
    function draw() {
      const p = pair(), all = view === 'all';
      const list = all ? rows : rows.filter(function (r) { return r.game === view; });
      let h = '';
      if (LOG_TITLES[game]) h += '<div class="wltog"><button data-v="' + game + '" class="' + (all ? '' : 'on') + '">' + LOG_TITLES[game] + '</button><button data-v="all" class="' + (all ? 'on' : '') + '">All games</button></div>';
      h += tallyCard(tally(list), p, all);
      if (all) {
        h += '<div class="wlcard">' + Object.keys(LOG_TITLES).map(function (g) {
          const t = tally(rows.filter(function (r) { return r.game === g; }));
          return '<div class="wlrow"><span>' + LOG_TITLES[g] + '</span><span>' + (t.wins[p[0].dev] || 0) + ' – ' + (t.wins[p[1].dev] || 0) + (t.ties ? ' · ' + t.ties + ' tie' + (t.ties === 1 ? '' : 's') : '') + '</span></div>';
        }).join('') + '</div>';
      }
      h += '<h3>' + (all ? 'All games' : 'Recent games') + '</h3>';
      h += list.length ? list.slice(0, 60).map(function (r) { return gameRow(r, all); }).join('') : '<div class="wlnote">Finished games show up here.</div>';
      h += '<div class="wlnote">Games against the computer and pass-and-play games don\'t count.</div>';
      box.innerHTML = h;
    }
    box.addEventListener('click', function (e) {
      const t = e.target.closest('[data-v]');
      if (t) { view = t.dataset.v; draw(); return; }
      const g = e.target.closest('.wlg');
      if (!g) return;
      const r = rows.find(function (x) { return x.key === g.dataset.key; });
      if (!r) return;
      r.open = !r.open; draw();
      if (r.open && moves[r.key] === undefined) {
        call('app', 'getLogGame', [r.key]).then(function (d) { moves[r.key] = d ? d.moves : null; draw(); },
          function () { moves[r.key] = null; draw(); });
      }
    });
    call('app', 'getLog', []).then(function (list) { rows = list || []; draw(); }, function (e) {
      const m = String(e && e.message || e);
      box.innerHTML = '<div class="wlnote">' + (/Unknown call/.test(m) ? 'The Winners\' Log needs Games API 1.5. Player 1 has to update the Games API first.' : 'Couldn\'t load the log: ' + esc(m)) + '</div>';
    });
  }

  window.GamesApp = { game: GAME, call: call, player: player, profiles: function () { return profiles; }, refresh: refresh, avatar: avatar, nameOf: nameOf, fixNames: fixNames, winnersLog: winnersLog };
})();
