const CACHE = 'msp-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/config.js', '/manifest.json', '/icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API / 웹훅은 캐시 없이 네트워크 직통
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/webhook')) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
