const CACHE_NAME = 'lpg-cavite-v2';
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

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Only two things are handled here:
//   1. Full page navigations → network, with the offline page as fallback.
//   2. Static assets → network-first, cached copy as fallback.
// Everything else (Inertia/axios XHRs, auth flows, uploads, files) goes straight
// to the network without the service worker in the way.
const BYPASS_PREFIXES = [
    '/auth/', '/login', '/logout', '/register', '/verify-otp', '/email/',
    '/api/', '/sanctum/', '/broadcasting/', '/storage/', '/documents/',
];

const isStaticAsset = (pathname) =>
    pathname.startsWith('/build/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.svg';

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Skip cross-origin requests (PayMongo, OSRM, Nominatim, Google, etc.)
    if (url.origin !== self.location.origin) return;

    if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
        );
        return;
    }

    if (!isStaticAsset(url.pathname)) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(async () => (await caches.match(request)) || Response.error())
    );
});
