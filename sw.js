const CACHE = 'shul-display-v2';
const FILES = [
  './',
  './index.html',
  './editor.html',
  './config.json',
  './css/theme.css',
  './css/widgets.css',
  './css/display.css',
  './css/editor.css',
  './js/calendar.js',
  './js/events.js',
  './js/images.js',
  './js/model.js',
  './js/storage.js',
  './js/widgets.js',
  './js/display.js',
  './js/editor.js',
  './assets/akron-shul-logo.png',
  './vendor/hebcal/hebcal-core.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const extra = url.hostname === 'cdn.jsdelivr.net'
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !extra) return;
  // Prefer the network so a published update shows up, and fall back to
  // the last copy if the television loses its connection.
  if (sameOrigin) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
