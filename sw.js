/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0 — Service Worker
   Estrategias:
     · Navegación (HTML)      → network-first, fallback a shell cacheado (offline)
     · Assets propios (css/js)→ stale-while-revalidate
     · Iconos / fuentes / CDN → cache-first
     · Supabase (API/Auth)    → SIEMPRE red, nunca se cachea
   Para forzar actualización: subir CACHE_VERSION.
═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v3.0.1-20260605';
const CACHE_NAME = `tallerpro-${CACHE_VERSION}`;

/* App shell — se precachea en install para que funcione offline */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/core/config.js',
  '/js/core/ui.js',
  '/js/core/db.js',
  '/js/core/auth.js',
  '/js/core/app.js',
  '/js/core/integraciones.js',
  '/js/core/login.js',
  '/js/modulos/dashboard/index.js',
  '/js/modulos/clientes/index.js',
  '/js/modulos/vehiculos/index.js',
  '/js/modulos/ordenes/index.js',
  '/js/modulos/inventario/index.js',
  '/js/modulos/proveedores/index.js',
  '/js/modulos/bancos/index.js',
  '/js/modulos/finanzas/index.js',
  '/js/modulos/facturacion/index.js',
  '/js/modulos/rrhh/index.js',
  '/js/modulos/bodegas/index.js',
  '/js/modulos/marketing/index.js',
  '/js/modulos/calendario/index.js',
  '/js/modulos/comunicaciones/index.js',
  '/js/modulos/configuracion/index.js',
  '/js/modulos/usuarios/index.js',
  '/js/modulos/admin/index.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* ── INSTALL: precachear el shell ──────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // si algo falla, no bloquear la instalación
  );
});

/* ── ACTIVATE: borrar caches viejos ────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Helpers ───────────────────────────────────────── */
function esSupabase(url) {
  return url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in');
}
function esEstaticoPropio(url) {
  return url.origin === self.location.origin &&
    /\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);
}

/* ── FETCH ─────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;            // mutaciones siempre a la red

  const url = new URL(req.url);

  /* 1. Supabase: nunca cachear (datos, auth, tokens) */
  if (esSupabase(url)) return;                 // deja pasar a la red por defecto

  /* 2. Navegación (HTML): network-first con fallback al shell */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('/index.html', copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  /* 3. Assets propios (css/js/img): stale-while-revalidate */
  if (esEstaticoPropio(url)) {
    event.respondWith(
      caches.match(req).then(cacheado => {
        const red = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
          }
          return res;
        }).catch(() => cacheado);
        return cacheado || red;
      })
    );
    return;
  }

  /* 4. Terceros (fuentes Google, CDN supabase-js): cache-first */
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then(cacheado => cacheado || fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      }).catch(() => cacheado))
    );
  }
});

/* Permite a la página pedir activación inmediata de un SW nuevo */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
