const CACHE = 'msp-v2';
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

  // 같은 오리진 GET 요청만 처리, 나머지는 브라우저에 위임
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/webhook')) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
