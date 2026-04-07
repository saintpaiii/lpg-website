const CACHE_NAME = 'lpg-cavite-v1';
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = ['/', '/manifest.json', '/offline'];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // addAll is best-effort; ignore failures so SW installs even if offline
            Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
        )
    );
    self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((n) => n !== CACHE_NAME)
                    .map((n) => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch — Network-first, cache fallback ────────────────────────────────────
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip cross-origin requests (PayMongo, OSRM, Nominatim, etc.)
    if (url.origin !== self.location.origin) return;

    // Skip API/webhook/Sanctum routes — always network only
    if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/sanctum/') ||
        url.pathname.startsWith('/broadcasting/')
    ) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful static assets (JS, CSS, fonts, images, icons)
                if (
                    response.status === 200 &&
                    (url.pathname.startsWith('/build/') ||
                     url.pathname.startsWith('/icons/') ||
                     url.pathname === '/manifest.json' ||
                     url.pathname === '/favicon.ico' ||
                     url.pathname === '/favicon.svg')
                ) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(async () => {
                // Try cache
                const cached = await caches.match(event.request);
                if (cached) return cached;

                // For navigation requests, show offline page
                if (event.request.destination === 'document') {
                    const offline = await caches.match(OFFLINE_URL);
                    if (offline) return offline;
                }
            })
    );
});
