const cacheName = "DefaultCompany-DeadZone Run-0.1.0";
const contentToCache = [
    "Build/70b95b4a34b0af6096c8aab14309d161.loader.js",
    "Build/f6a9c6efe479a377e032a68afd0f4249.framework.js",
    "Build/6dbaa6676ef679d79639ded34167b491.data",
    "Build/2681b7c57488bb14e71e99b3bf8acbbe.wasm",
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
