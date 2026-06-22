const CACHE = 'vault-static-v1';
const INFO_URL = './vault-info.json';

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

// Page sends 'CHECK_UPDATE' on every load — we check vault-info.json version
self.addEventListener('message', async e => {
  if (e.data && e.data.type === 'CHECK_UPDATE') {
    await checkForUpdate(e.source);
  }
});

async function checkForUpdate(client) {
  try {
    const res = await fetch(INFO_URL + '?_sw=' + Date.now());
    if (!res.ok) return;
    const info = await res.json();
    const newVersion = info.version;

    const cache = await caches.open(CACHE);
    const stored = await cache.match('__vault_info_version__');
    const lastVersion = stored ? await stored.text() : null;

    if (lastVersion !== newVersion) {
      await cache.put('__vault_info_version__', new Response(newVersion));
      // Only notify if there was a previous version (not first install)
      if (lastVersion !== null && client) {
        client.postMessage({ type: 'VAULT_UPDATE', version: newVersion });
      }
    }
  } catch (_) {
    // Network unavailable — silent fail
  }
}
