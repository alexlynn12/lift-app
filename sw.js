const CACHE = "lift-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./exercises-data.js",
  "./program-seed.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for the app shell (HTML/CSS/JS) so updates show up immediately
// whenever the device is online. Falls back to the cached copy when offline.
// Other same-origin GETs (icons, manifest) stay cache-first since they rarely change.
const SHELL_NAMES = ["index.html", "styles.css", "app.js", "db.js", "exercises-data.js", "program-seed.js"];

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isAppShell = url.origin === location.origin &&
    (url.pathname.endsWith("/") || SHELL_NAMES.some((n) => url.pathname.endsWith("/" + n)));

  if (isAppShell) {
    // "no-store" bypasses the browser's own HTTP disk cache (GitHub Pages
    // sends cache-control: max-age=600 on these files), so this always hits
    // the network when online instead of silently reusing a stale response
    // from earlier in that 10-minute window. Falls back to the SW's own
    // Cache Storage copy only when the network is unreachable (offline).
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request, { cache: "no-store" })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
