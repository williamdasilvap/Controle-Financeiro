/* Finanças PWA SW - v1.3.0 */
const CACHE_NAME = "financas-cache-v1.3.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css?v=1.3.0",
  "./assets/js/app.js?v=1.3.0",
  "./assets/js/charts.js",
  "./assets/js/format.js",
  "./assets/js/storage.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k!==CACHE_NAME) ? caches.delete(k) : null)))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if(req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if(cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});
