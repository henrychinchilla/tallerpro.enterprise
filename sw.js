/* ═══════════════════════════════════════════════════════
   sw.js — Service Worker · TallerPro PWA
   Estrategia: Network-first con fallback a caché
═══════════════════════════════════════════════════════ */

const CACHE_NAME = 'tallerpro-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/config.js',
  '/js/db.js',
  '/js/seed.js',
  '/js/ui.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/modules/dashboard.js',
  '/js/modules/clientes.js',
  '/js/modules/ordenes.js',
  '/js/modules/inventario.js',
  '/js/modules/pages.js',
  '/manifest.json'
];

/* ── Instalar: pre-cachea assets ──────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── Activar: limpia cachés viejos ────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: Network-first, caché como fallback ────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
