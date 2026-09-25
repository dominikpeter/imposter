// Offline support: the app shell and the one-phone game work without a connection (rooms, AI and sign-in need it).
// Pages: network first, last copy when offline. Build files (/_next/static, hashed names): cache first.
// Other same-origin files (icons, fonts): cached copy right away, refreshed in the background. /api: never cached.
const CACHE = "imposter-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const keep = (req, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
  } else if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => keep(req, res)).catch(() => caches.match(req).then((hit) => hit || caches.match("/"))));
  } else {
    e.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => keep(req, res)).catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});
