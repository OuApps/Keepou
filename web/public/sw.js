/*
 * Keepou service worker (E8-S1) — installability + app-shell caching only.
 * No offline editing, no background sync (ARCHITECTURE §9): /api requests
 * always go to the network; hashed build assets are cached first-hit.
 */

const SHELL_CACHE = 'keepou-shell-v1'
const SHELL_URLS = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // The API (and any cross-origin request, e.g. Google Fonts) stays network-only.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return

  // SPA navigations: network first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Static assets (hashed by Vite): cache first, then network + cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
