// Feral 2.0 - service worker. Makes the game installable and playable offline after the first visit.
// Strategy: network first (so a new deploy shows up straight away), falling back to the saved copy when there is no connection.
const CACHE = 'dz-feral2-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'lib/three.min.js', 'js/data.js', 'js/sim.js', 'js/art.js', 'js/audio.js', 'js/input.js', 'js/world3d.js', 'js/entities3d.js', 'js/render3d.js', 'js/viewmodel.js', 'js/ui.js', 'js/main.js', 'art/manifest.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('dz-feral2-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then((m) => m || caches.match('index.html'))));
});
