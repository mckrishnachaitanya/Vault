const CACHE = 'vault-static-v1';

// Install — cache index.html
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./index.html'])).then(() => self.skipWaiting())
  );
});

// Activate — claim clients immediately
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Fetch — stale-while-revalidate for index.html; network-first for vault-info.json
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // vault-info.json — always network, cache as fallback
  if (url.pathname.endsWith('vault-info.json')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // index.html — stale-while-revalidate
  if (url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const networkFetch = fetch(e.request).then(res => {
          cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }
});
