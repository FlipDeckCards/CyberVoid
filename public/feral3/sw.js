// Feral 3.0 - service worker. Makes the game installable and playable offline after the first visit.
// Strategy: network first (so a new deploy shows up straight away) for the code, with every successful response (models, textures, sounds too) saved for offline use.
const CACHE = 'dz-feral3-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/sim.js', 'js/main.mjs', 'js/engine.mjs', 'js/world.mjs', 'js/creatures.mjs', 'js/fx.mjs', 'js/viewmodel.mjs', 'js/audio.mjs', 'js/input.mjs', 'js/ui.mjs', 'js/assets.mjs', 'js/previews.mjs', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('dz-feral3-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then((res) => { if (res && res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then((m) => m || caches.match('index.html'))));
});
