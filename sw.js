const V = '3.0.0';
const CACHE = `tp-${V}`;
const STATIC = ['/', '/index.html', '/manifest.json',
  '/css/base.css', '/css/layout.css', '/css/components.css',
  '/js/core/config.js', '/js/core/db.js', '/js/core/ui.js',
  '/js/core/auth.js', '/js/core/app.js', '/js/core/login.js',
  '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(()=>{})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.hostname.includes('supabase')||u.hostname.includes('googleapis')||u.hostname.includes('jsdelivr')) return;
  if (e.request.method!=='GET') return;
  if (e.request.mode==='navigate') {
    e.respondWith(fetch(e.request).then(r=>{caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const net=fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;});
    return cached||net;
  }));
});
self.addEventListener('message', e => { if(e.data==='SKIP_WAITING') self.skipWaiting(); });
