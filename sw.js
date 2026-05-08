/* TallerPro Enterprise — Service Worker v2.1.0 */
const APP_VERSION   = '2.1.0';
const CACHE_STATIC  = `tallerpro-static-v${APP_VERSION}`;
const CACHE_DYNAMIC = `tallerpro-dynamic-v${APP_VERSION}`;

const STATIC_ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/css/base.css', '/css/layout.css', '/css/components.css',
  '/js/config.js', '/js/db.js', '/js/auth.js', '/js/ui.js', '/js/app.js',
  '/js/fel.js', '/js/notifications.js',
  '/js/modules/dashboard.js', '/js/modules/clientes.js',
  '/js/modules/vehiculos.js', '/js/modules/ordenes.js',
  '/js/modules/inventario.js', '/js/modules/proveedores.js',
  '/js/modules/finanzas.js', '/js/modules/rrhh.js',
  '/js/modules/pages.js', '/js/modules/database.js',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(e => console.warn('[SW] install error:', e))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Supabase siempre en red */
  if (url.hostname.includes('supabase')) return;

  /* Navegación: Network-first */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(r => { caches.open(CACHE_STATIC).then(c => c.put(event.request, r.clone())); return r; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  /* JS/CSS/Images: Cache-first + actualización background */
  if (['script','style','image'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const net = fetch(event.request).then(r => {
          caches.open(CACHE_STATIC).then(c => c.put(event.request, r.clone()));
          return r;
        });
        return cached || net;
      })
    );
    return;
  }

  /* Resto: Network-first */
  event.respondWith(
    fetch(event.request)
      .then(r => { if(r.ok) caches.open(CACHE_DYNAMIC).then(c=>c.put(event.request,r.clone())); return r; })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') event.ports[0].postMessage({ version: APP_VERSION });
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const d = event.data.json();
  event.waitUntil(self.registration.showNotification(d.title || 'TallerPro', {
    body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png',
    data: d.url || '/'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
