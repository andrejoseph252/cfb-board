/* Service worker: keeps the board's files on the device so a return visit doesn't wait on the network for them.

   - The page itself, version.json, the data files and the sound manifest: network first, so a new release or new
     data is always what you get; the kept copy only answers when the network is slow (1.5s) or gone (offline).
   - Fingerprinted files (js/ and css/ with ?v=, sound clips with a hash in the name) and fonts (versioned names):
     from the device. A changed file has a new address, so a kept copy can never be out of date; older fingerprints
     of the same file are deleted as new ones arrive.
   - Icons: from the device, refreshed in the background.
   - Scores, stats, team logos (ESPN already lets browsers keep those for hours) and everything else: untouched.
   On install it also keeps every file the current page uses (the first visit loaded them before this was running).
   The page later asks it to fetch the game's modules too ("warm"), when nothing else is downloading. */
const FILES = 'cfb-files-v1', PAGES = 'cfb-pages-v1', KEEP = [FILES, PAGES, 'cfb-data-v1'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try{
      const html = await (await fetch('./', { cache: 'no-cache' })).text(), c = await caches.open(FILES);
      // Everything the page links to (already in the browser's cache from this visit, so this costs nothing).
      const urls = [...html.matchAll(/(?:href|src)="((?:js|css|fonts|icons)\/[^"]+)"/g)].map(m => m[1]);
      await Promise.all(urls.map(u => c.add(u).catch(() => {})));
      await (await caches.open(PAGES)).put('./', new Response(html, { headers: { 'content-type': 'text/html' } }));
    }catch{}
    self.skipWaiting();
  })());
});
// The page's list of files to have ready (the game's modules), fetched one at a time in the background.
self.addEventListener('message', e => {
  if (!Array.isArray(e.data?.warm)) return;
  e.waitUntil((async () => {
    const c = await caches.open(FILES);
    for (const u of e.data.warm){ const req = new Request(new URL(u, registration.scope)); if (!(await c.match(req))) await fromDevice(req, new URL(req.url)).catch(() => {}); }
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const fingerprinted = u => /\.(js|css)$/.test(u.pathname) && u.searchParams.has('v') || /\/fonts\/[^/]+\.woff2$/.test(u.pathname)
  || /\/audio\/[a-z]+-\d+\.[0-9a-f]{8}\.mp3$/.test(u.pathname);
const fresh = (u, req) => req.mode === 'navigate' || /\/(version\.json|manifest\.webmanifest)$/.test(u.pathname)
  || /\/data\/[^/]+\.json$/.test(u.pathname) || /\/audio\/manifest\.json$/.test(u.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin){
    if (fingerprinted(u)) return e.respondWith(fromDevice(req, u));
    if (fresh(u, req)) return e.respondWith(networkFirst(req, u));
    if (/\/icons\//.test(u.pathname)) return e.respondWith(refreshing(req, e));
  }
});

async function fromDevice(req, u){
  const c = await caches.open(FILES), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok){
    const copy = r.clone();
    (async () => {
      // Drop older fingerprints of this same file.
      if (u.searchParams.has('v')) for (const k of await c.keys()){ const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) await c.delete(k); }
      await c.put(req, copy);
    })().catch(() => {});
  }
  return r;
}

async function networkFirst(req, u){
  const c = await caches.open(PAGES), key = u.pathname;   // query strings here are only cache-busters
  const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()).catch(() => {}); return r; });
  net.catch(() => {});
  const kept = await c.match(key);
  if (!kept) return net;
  const slow = new Promise(res => setTimeout(() => res(null), 1500));
  try{
    const r = await Promise.race([net, slow]);
    return r || kept;
  }catch{ return kept; }
}

async function refreshing(req, e){
  const c = await caches.open(FILES), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()).catch(() => {}); return r; });
  if (hit){ e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}
