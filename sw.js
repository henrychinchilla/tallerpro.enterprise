/* TallerPro Enterprise v3.0 — Service Worker */
const V = '3.0.1';
const CACHE = `tp-${V}`;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['/', '/index.html', '/manifest.json',
        '/css/base.css', '/css/layout.css', '/css/components.css'])
        .catch(()=>{}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Nunca interceptar Supabase ni CDNs externos */
  if (url.hostname.includes('supabase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('jsdelivr') ||
      url.hostname.includes('fonts.g')) return;

  if (e.request.method !== 'GET') return;

  /* Navegación y JS/CSS: SIEMPRE network-first para ver cambios inmediatamente */
  if (e.request.mode === 'navigate' ||
      e.request.destination === 'script' ||
      e.request.destination === 'style') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  /* Imágenes e iconos: cache-first */
  if (e.request.destination === 'image' || e.request.destination === 'font') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        });
      })
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
