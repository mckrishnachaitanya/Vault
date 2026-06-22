const CACHE = 'vault-static-v1';
const INFO_URL = './vault-info.json';
const INFO_VERSION_KEY = 'vault-info-version';

// Install — cache index.html
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./index.html'])).then(() => self.skipWaiting())
  );
});

// Activate — claim clients, then check for update
self.addEventListener('activate', e => {
  e.waitUntil(
    self.clients.claim().then(() => checkForUpdate())
  );
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

// Check vault-info.json for version change and notify clients
async function checkForUpdate() {
  try {
    const res = await fetch(INFO_URL + '?_sw=' + Date.now());
    if (!res.ok) return;
    const info = await res.json();
    const newVersion = info.version;

    // Read last seen version from cache storage
    const cache = await caches.open(CACHE);
    const stored = await cache.match('__vault_info_version__');
    const lastVersion = stored ? await stored.text() : null;

    if (lastVersion !== newVersion) {
      // Save new version
      await cache.put('__vault_info_version__', new Response(newVersion));
      // Notify all clients — but only if there was a previous version (not first install)
      if (lastVersion !== null) {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => client.postMessage({ type: 'VAULT_UPDATE', version: newVersion }));
      }
    }
  } catch (_) {
    // Network unavailable — silent fail
  }
}
