// Service worker: makes the app installable on Android, and makes sure every open shows the
// newest version. GitHub Pages tells browsers to keep files for 10 minutes, so without this a
// phone can show an old copy after an update. Each request asks GitHub "has this changed?"
// (cheap when it hasn't) and only falls back to a saved copy when there's no connection.
// It also shows turn alerts: the Games API sends an empty push, and this asks what's waiting.
const CACHE = 'games-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(function (res) {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req.url, copy); }); }
        return res;
      })
      .catch(function () { return caches.match(req.url).then(function (r) { return r || Response.error(); }); })
  );
});

// ---------- turn alerts ----------
// The app keeps {dev, api} in the "games-me" cache so this can ask the Games API what's waiting.
const NAMES = { tilework: 'Tilework', wheelhouse: 'Wheelhouse', answers: 'Answers' };
function waiting() {
  return caches.open('games-me').then(function (c) { return c.match('me.json'); })
    .then(function (r) { return r ? r.json() : null; })
    .then(function (me) {
      if (!me || !me.dev || !me.api) return null;
      return fetch(me.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ game: 'app', fn: 'overview', args: [me.dev] }) })
        .then(function (r) { return r.json(); }).then(function (j) { return j.result || null; });
    })
    .catch(function () { return null; });
}
// One notification per waiting game, each with its own colored icon (red T, green W, blue A).
// Games that are no longer waiting lose their notification.
self.addEventListener('push', function (e) {
  e.waitUntil(waiting().then(function (o) {
    const games = o ? Object.keys(NAMES).filter(function (g) { return o[g] > 0; }) : [];
    const total = games.reduce(function (t, g) { return t + o[g]; }, 0);
    try { if (self.navigator.setAppBadge && total) self.navigator.setAppBadge(total); } catch (err) {}
    return self.registration.getNotifications().then(function (old) {
      const shown = {};
      old.forEach(function (n) {   // clear finished games (and the old single "turn" alert)
        const g = String(n.tag || '').replace(/^turn-?/, '');
        if (/^turn/.test(n.tag || '') && (!g || !(o && o[g] > 0))) n.close();
        else shown[n.tag] = n.body;
      });
      if (!games.length) {
        return self.registration.showNotification('Games', { body: 'Your move.', icon: 'icon-192.png', tag: 'turn' });
      }
      return Promise.all(games.map(function (g) {
        const body = o[g] > 1 ? o[g] + ' games are waiting on you.' : 'Your move.';
        if (shown['turn-' + g] === body) return null;   // already showing: don't buzz again
        return self.registration.showNotification(NAMES[g], {
          body: body, icon: 'icon-' + g + '.png', tag: 'turn-' + g, renotify: true, data: { game: g }
        });
      }));
    });
  }));
});
// Tapping the alert opens the app (or brings it forward) on the game that's waiting.
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const game = (e.notification.data && e.notification.data.game) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (let i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].postMessage({ game: game }); return list[i].focus(); }
    }
    return self.clients.openWindow(game ? './?game=' + game : './');
  }));
});
