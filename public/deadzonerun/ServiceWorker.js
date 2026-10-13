const cacheName = "DefaultCompany-DeadZone Run-0.1.0";
const contentToCache = [
    "Build/82c74cbf93e025414409b29e00523e54.loader.js",
    "Build/f6a9c6efe479a377e032a68afd0f4249.framework.js",
    "Build/97c6b0e785684a6cb00774a85c859de3.data",
    "Build/177cb49304d4fd6d5d7d6f06346f266c.wasm",
    "TemplateData/style.css"

];

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');
    
    e.waitUntil((async function () {
      const cache = await caches.open(cacheName);
      console.log('[Service Worker] Caching all: app shell and content');
      await cache.addAll(contentToCache);
    })());
});

self.addEventListener('fetch', function (e) {
    e.respondWith((async function () {
      let response = await caches.match(e.request);
      console.log(`[Service Worker] Fetching resource: ${e.request.url}`);
      if (response) { return response; }

      response = await fetch(e.request);
      const cache = await caches.open(cacheName);
      console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
      cache.put(e.request, response.clone());
      return response;
    })());
});
