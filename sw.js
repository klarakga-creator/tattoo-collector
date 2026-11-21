// Offline-first shell: open instantly from cache, update in the background.
// Your data never goes through this cache; it always comes live from Supabase.
const CACHE = 'tc-v6';
const SHELL = ['./', 'index.html', 'css/style.css', 'config.js', 'vendor/supabase.js', 'js/figure.js', 'js/swipe.js', 'js/cropper.js', 'js/store.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/favicon-32.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !fonts) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: own });
    const net = fetch(e.request).then((res) => { if (res.ok || res.type === 'opaque') c.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (own ? c.match('index.html') : Response.error());
  }));
});
