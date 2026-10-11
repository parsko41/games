// Minimal service worker so Android offers "Install app". It doesn't cache anything:
// the games always load fresh, so a new version shows up as soon as it's pushed.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* network as usual */ });
