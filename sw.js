/* Service worker of the installed presentation. build-deploy.mjs fills VERSION and FILES.
   Everything the presentation needs is cached at install, so it opens with no internet.
   Page and text files: newest version when online (3 s limit), stored copy otherwise.
   Photos and icons: from the cache. Google Fonts: stored at install, and when first loaded. */
const VERSION = "6b5cc596b0";
const CACHE = "nvm-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "maison-content.js",
  "manifest.webmanifest",
  "assets/dj-scene.jpg",
  "assets/doublejay-1.jpg",
  "assets/doublejay-2.jpg",
  "assets/doublejay-3.jpg",
  "assets/doublejay-carre.jpg",
  "assets/en-route.jpg",
  "assets/entree-nb.jpg",
  "assets/ig/ig-amstel.jpg",
  "assets/ig/ig-badman.jpg",
  "assets/ig/ig-bruxelles.jpg",
  "assets/ig/ig-kigingi.jpg",
  "assets/ig/ig-paris.jpg",
  "assets/ig/ig-rwanda.jpg",
  "assets/ig/ig-stade.jpg",
  "assets/kelly-1.jpg",
  "assets/kelly-2.jpg",
  "assets/kelly-live-1.jpg",
  "assets/kelly-live-2.jpg",
  "assets/kirikou-danse.jpg",
  "assets/kirikou-live.jpg",
  "assets/kirikou-moto.jpg",
  "assets/kirikou-officiel.jpg",
  "assets/kirikou-scene-nb.jpg",
  "assets/live-jean-nb.jpg",
  "assets/live-jean.jpg",
  "assets/logo.jpg",
  "assets/nour-1.jpg",
  "assets/nour-2.jpg",
  "assets/stade-1.jpg",
  "assets/stade-2.jpg",
  "assets/superbeat.jpg",
  "assets/vision-paris-petit.jpg",
  "assets/vision-paris.jpg",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..800;1,6..96,400..700&family=Jost:wght@300;400;500&display=swap";

/* the two Google fonts, stored with the rest so the type looks right offline (best effort) */
async function cacheFonts(c) {
  try {
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    const css = await res.clone().text();
    await c.put(FONT_CSS, res);
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(r => r.ok && c.put(u, r)).catch(() => {})));
  } catch (err) {}
}

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => { await c.addAll(FILES); await cacheFonts(c); }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("nvm-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    for (const c of await self.clients.matchAll()) c.postMessage("nvm-cached");
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const page = req.mode === "navigate" || /\.(html|js|webmanifest)$/.test(url.pathname);
    const key = req.mode === "navigate" ? "./" : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
    // page and text: the newest version when the network answers within 3 s, else the stored copy
    if (page && hit) {
      const timeout = new Promise(r => setTimeout(() => r(null), 3000));
      const res = await Promise.race([fresh.catch(() => null), timeout]);
      if (res && res.ok) return res;
      e.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    // photos and icons: straight from the phone
    if (hit) return hit;
    try { return await fresh; } catch (err) { return (await c.match("./")) || Response.error(); }
  })());
});
