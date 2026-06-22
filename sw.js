const CACHE_NAME = 'vault-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './vault-info.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'no-store' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppShell = event.request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/');

  if (isAppShell) {
    // Stale-while-revalidate: serve cached instantly, refresh in background
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('./index.html').then((cached) => {
          const network = fetch('./index.html', { cache: 'no-store' })
            .then((response) => {
              if (response && response.status === 200 && response.type === 'basic') {
                cache.put('./index.html', response.clone());
                cache.put('./', response.clone());
              }
              return response;
            })
            .catch(() => null);
          return cached || network;
        })
      )
    );
    return;
  }

  // vault-info.json — always network, cache as fallback
  if (url.pathname.endsWith('vault-info.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
