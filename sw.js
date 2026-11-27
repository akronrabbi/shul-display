const CACHE = 'shul-display-v12';
const MEDIA_HOST = 'br-winter-morning-beywmp3z.storage.c-9.us-east-2.aws.neon.tech';
const FILES = [
  './',
  './index.html',
  './live.html',
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
  './js/themes.js',
  './js/type.js',
  './js/storage.js',
  './js/cloud.js',
  './js/auth.js',
  './js/widgets.js',
  './js/drive.js',
  './js/display.js',
  './js/editor.js',
  './js/templates.js',
  './js/gphotos.js',
  './js/albums.js',
  './vendor/fonts/fonts.css',
  './vendor/fonts/files/inter-latin-wght-normal.woff2',
  './vendor/fonts/files/heebo-hebrew-wght-normal.woff2',
  './vendor/fonts/files/fraunces-latin-wght-normal.woff2',
  './vendor/fonts/files/source-sans-3-latin-wght-normal.woff2',
  './vendor/fonts/files/noto-serif-hebrew-hebrew-wght-normal.woff2',
  './vendor/fonts/files/outfit-latin-wght-normal.woff2',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './assets/akron-shul-logo.png',
  './assets/akron-shul-logo-light.png',
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

function isImmutableMedia(url) {
  if (url.hostname === MEDIA_HOST && url.pathname.includes('/media/')) return true;
  return url.origin === self.location.origin && /\/media\/[a-f0-9]{16}\.[a-z0-9]+$/i.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function cacheFirstForever(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && (fresh.ok || fresh.type === 'opaque')) {
    try { await cache.put(request, fresh.clone()); } catch { /* a full disk should not hide the picture */ }
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (isImmutableMedia(url)) {
    event.respondWith(cacheFirstForever(event.request));
    return;
  }
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
