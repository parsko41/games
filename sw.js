// Service worker: makes the app installable on Android, and makes sure every open shows the
// newest version. GitHub Pages tells browsers to keep files for 10 minutes, so without this a
// phone can show an old copy after an update. Each request asks GitHub "has this changed?"
// (cheap when it hasn't) and only falls back to a saved copy when there's no connection.
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
