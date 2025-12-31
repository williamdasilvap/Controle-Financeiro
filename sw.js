// Simple service worker for Finanças PWA
const CACHE_NAME = "financas-cache-v1.2.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css?v=1.2.0",
  "./assets/js/app.js?v=1.2.0",
  "./assets/js/charts.js",
  "./assets/js/format.js",
  "./assets/js/storage.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/apple-touch-icon-167.png",
  "./assets/icons/apple-touch-icon-152.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith("financas-cache-") && k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if(req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      // atualiza cache em background (stale-while-revalidate simples)
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
      return res;
    }).catch(()=>cached))
  );
});
