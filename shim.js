// Shared by every page of the Games app.
// 1) Gives the games the same google.script.run they used inside Apps Script, but sends each call
//    to the Games API over HTTPS, so the game code didn't have to change.
// 2) One login for every game: the player picked in the app is written into each game's own
//    device/name keys before the game starts.
// 3) Avatars: GamesApp.avatar(dev, name) returns "🦊 " (or "") for a player.
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

  window.GamesApp = { game: GAME, call: call, player: player, profiles: function () { return profiles; }, refresh: refresh, avatar: avatar, nameOf: nameOf, fixNames: fixNames };
})();
