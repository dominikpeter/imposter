// Offline support: the app shell and the one-phone game work without a connection (rooms, AI and sign-in need it).
// Pages: network first, last copy when offline. Build files (/_next/static, hashed names): cache first.
// Other same-origin files (icons, fonts): cached copy right away, refreshed in the background.
// Never cached: /api (live data), /admin (private), Next's route payloads (RSC: must match the deployed build).
// One cache per app version (sw.js?v=…): a new release starts clean and the old cache is deleted, so it can't grow.
const CACHE = `imposter-${new URL(location.href).searchParams.get("v") ?? "dev"}`;
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
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
  } else if (req.mode === "navigate") {
    // only the start page is kept (the offline game); other pages would just pile up
    e.respondWith(fetch(req).then((res) => (url.pathname === "/" ? keep(req, res) : res)).catch(() => caches.match("/")));
  } else {
    e.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => keep(req, res)).catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});
