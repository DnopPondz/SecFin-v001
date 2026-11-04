// Offline reading and installability. Pages and the brief come from the network when it answers
// within a few seconds and from the cache otherwise; scripts and styles are served from the cache
// and refreshed in the background. Nothing user-specific or admin-only is ever cached.
const CACHE = "sf-v3";
const SHELL = ["/", "/story", "/style.css", "/common.js", "/app.js", "/story.js", "/chat.js", "/manifest.webmanifest", "/icons/favicon.svg", "/icons/icon-192.png"];
const NETWORK_TIMEOUT_MS = 4000;
// Read-only APIs worth keeping for offline reading.
const API_CACHED = /^\/api\/(brief\/|briefs$|story\/|widgets$|watch$|popular$|sources$)/;
const MAX_PRECACHE = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (hit) {
    fresh.catch(() => {});
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages: one cached copy per page, whatever the query string (?id=, ?d=).
  if (req.mode === "navigate") {
    const page = url.pathname.replace(/\.html$/, "").replace(/^\/index$/, "/");
    if (page === "/" || page === "/story") event.respondWith(networkFirst(req, page));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (API_CACHED.test(url.pathname)) event.respondWith(networkFirst(req, req.url));
    return;
  }
  if (/\.(css|js|svg|png|webmanifest)$/.test(url.pathname) && url.pathname !== "/sw.js") {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// The front page sends today's story URLs so they can be read offline later.
self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};
  if (type !== "precache" || !Array.isArray(urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of urls.slice(0, MAX_PRECACHE)) {
      const path = new URL(u, location.origin);
      if (path.origin !== location.origin || !API_CACHED.test(path.pathname) || (await cache.match(path.href))) continue;
      try {
        const res = await fetch(path.href);
        if (res.ok) await cache.put(path.href, res);
      } catch {}
    }
  })());
});
