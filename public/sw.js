const CACHE_VERSION = 'teuksae-companion-install-20260928';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app-config.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('teuksae-') && key !== APP_SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }
  if (!sameOrigin) {
    return;
  }

  if (url.pathname.startsWith('/api/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      await caches.open(APP_SHELL_CACHE).then(cache => cache.put('/index.html', response.clone())).catch(() => undefined);
    }
    return response;
  } catch (_error) {
    const cached = await caches.match('/index.html').catch(() => undefined);
    if (cached) {
      return cached;
    }
    return Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request).catch(() => undefined);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  const type = response.headers.get('content-type') || '';
  const asset = new URL(request.url).pathname;
  if (response.ok && (!asset.endsWith('.js') || /javascript/.test(type)) && !type.includes('text/html')) {
    await caches.open(ASSET_CACHE).then(cache => cache.put(request, response.clone())).catch(() => undefined);
  }
  return response;
}
