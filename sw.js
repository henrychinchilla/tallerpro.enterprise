/* ═══════════════════════════════════════════════════════
   NexusPro Enterprise v3.0 — Service Worker
   Estrategias:
     · Navegación (HTML)      → network-first, fallback a shell cacheado (offline)
     · Assets propios (css/js)→ stale-while-revalidate
     · Iconos / fuentes / CDN → cache-first
     · Supabase (API/Auth)    → SIEMPRE red, nunca se cachea
   Para forzar actualización: subir CACHE_VERSION.
═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v3.51.0-20260701i';
const CACHE_NAME = `nexuspro-${CACHE_VERSION}`;

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
  '/js/core/charts.js',
  '/js/core/integraciones.js',
  '/js/core/docs.js',
  '/js/core/login.js',
  '/js/modulos/principal/dashboard.js',
  '/js/modulos/operacion/clientes.js',
  '/js/modulos/operacion/vehiculos.js',
  '/js/modulos/operacion/ordenes.js',
  '/js/modulos/operacion/inventario.js',
  '/js/modulos/operacion/bodegas.js',
  '/js/modulos/operacion/proveedores.js',
  '/js/modulos/operacion/compras.js',
  '/js/modulos/operacion/activos.js',
  '/js/modulos/operacion/envios.js',
  '/js/modulos/operacion/traslados.js',
  '/js/modulos/operacion/mi_ot.js',
  '/js/modulos/operacion/cotizaciones.js',
  '/js/modulos/especializados/herreria.js',
  '/js/modulos/especializados/peleteria.js',
  '/js/modulos/especializados/electronica.js',
  '/js/modulos/especializados/refrigeracion.js',
  '/js/modulos/finanzas/presupuesto.js',
  '/js/modulos/finanzas/contabilidad.js',
  '/js/modulos/finanzas/formularios_sat.js',
  '/js/modulos/finanzas/facturacion.js',
  '/js/modulos/finanzas/bancos.js',
  '/js/modulos/finanzas/finanzas.js',
  '/js/modulos/rrhh/rrhh.js',
  '/js/modulos/marketing/marketing.js',
  '/js/modulos/herramientas/calendario.js',
  '/js/modulos/herramientas/comunicaciones.js',
  '/js/modulos/admin/configuracion.js',
  '/js/modulos/admin/usuarios.js',
  '/js/modulos/admin/admin.js',
  '/js/modulos/admin/superadmin.js',
  '/js/modulos/admin/respaldos.js',
  '/pos.html',
  '/js/pos/pos.js',
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

  /* 2. Navegación (HTML): network-first, cacheando cada página por su URL
        (no machacar el shell con /pos.html u otras páginas) */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')).then(r => r || caches.match('/')))
    );
    return;
  }

  /* 3. Assets propios (css/js/img): NETWORK-FIRST.
        Siempre intenta la red para servir el código más reciente tras un
        deploy; si no hay conexión, cae al caché (offline). Esto evita el
        problema de "desplegué pero veo lo viejo" sin desregistrar el SW. */
  if (esEstaticoPropio(url)) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
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
