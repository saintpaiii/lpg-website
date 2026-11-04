// Leaflet helpers shared by the rider route map and the customer tracking card.
// Free services only: OpenStreetMap tiles + the public OSRM demo router.
import { toast } from 'sonner';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

export type LatLng = [number, number];

export const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Fix Leaflet's default marker images under Vite
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

/** Teardrop pin in a given colour, optionally with a label (e.g. stop number). */
export function pinIcon(color: string, label?: string | number): L.DivIcon {
    return L.divIcon({
        className: '',
        iconSize: [30, 40],
        iconAnchor: [15, 38],
        popupAnchor: [0, -34],
        html: `
            <div style="position:relative;width:30px;height:40px">
                <svg viewBox="0 0 30 40" width="30" height="40" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
                    <path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0z" fill="${color}"/>
                    <circle cx="15" cy="14.5" r="${label !== undefined ? 9.5 : 5.5}" fill="#fff"/>
                </svg>
                ${label !== undefined ? `<span style="position:absolute;top:6px;left:0;width:30px;text-align:center;font:700 ${String(label ?? '').length > 2 ? 9 : 12}px/17px system-ui,sans-serif;color:${color}">${label}</span>` : ''}
            </div>`,
    });
}

/** Pulsing dot for "you are here". */
export function dotIcon(color = '#2563eb'): L.DivIcon {
    return L.divIcon({
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 6px ${color}33"></span>`,
    });
}

export const PIN_COLORS = {
    store: '#16a34a',      // green
    pending: '#dc2626',    // red
    delivered: '#16a34a',  // green
    failed: '#9ca3af',     // gray
    customer: '#dc2626',   // red
} as const;

export type RoadRoute = {
    /** true = road geometry from OSRM; false = straight-line fallback (routing service unreachable) */
    ok: boolean;
    coords: LatLng[];
    distanceKm: number | null;
    durationMin: number | null;
};

/**
 * Road geometry through all points in ONE request, via our cached OSRM proxy (/api/route).
 * Points are Leaflet order [lat, lng]; the server converts to OSRM's lng,lat.
 * Falls back to straight lines (ok: false) when routing is unavailable.
 */
export async function fetchRoute(points: LatLng[], signal?: AbortSignal): Promise<RoadRoute> {
    const straight: RoadRoute = { ok: false, coords: points, distanceKm: null, durationMin: null };
    if (points.length < 2) return straight;
    try {
        const qs = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';');
        const res = await fetch(`/api/route?points=${encodeURIComponent(qs)}`, {
            signal,
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        });
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.coordinates)) {
            console.warn('Road routing unavailable, drawing straight lines:', data?.message ?? res.status);
            return straight;
        }
        return { ok: true, coords: data.coordinates as LatLng[], distanceKm: data.distance_km ?? null, durationMin: data.duration_min ?? null };
    } catch (e) {
        if ((e as Error)?.name !== 'AbortError') console.warn('Road routing failed, drawing straight lines:', e);
        return straight;
    }
}

/** Driving geometry between two points (straight line when routing is unavailable). */
export async function routeSegment(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<LatLng[]> {
    return (await fetchRoute([from, to], signal)).coords;
}

/**
 * Google Maps directions to a point. Without an origin Google starts from the device location.
 * (Optional: our own map shows the route first — Google may miss local shortcuts.)
 */
export const googleMapsDirections = (lat: number, lng: number, origin?: LatLng | null, mode: 'driving' | 'walking' = 'driving') =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`
    + (origin ? `&origin=${origin[0]},${origin[1]}` : '');

/**
 * Straight-line distance in km. Delivery fees use it — must stay identical to App\Services\DeliveryFeeService
 * (the fee rounds up to the next ₱5, so even tiny differences could change a fee).
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "350 m" under 1 km (nearest 10 m), else "1.2 km". */
export function formatDistance(km: number): string {
    return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`;
}

// ── Service area: map pan limit (a rectangle around Cavite) — the real rule is isInServiceArea() below ──
export const SERVICE_AREA = { south: 14.0, north: 14.6, west: 120.5, east: 121.15 } as const;
export const SERVICE_AREA_BOUNDS = L.latLngBounds([SERVICE_AREA.south, SERVICE_AREA.west], [SERVICE_AREA.north, SERVICE_AREA.east]);
export const SERVICE_AREA_MESSAGE = 'Please choose a location inside Cavite. We only serve addresses within Cavite.';
/** Furthest zoom-out: the whole province. */
export const SERVICE_AREA_MIN_ZOOM = 10;

// The Cavite outline check lives in service-area.ts (no Leaflet import, so it can be tested on its own)
export { CAVITE_BOUNDARY, isInServiceArea } from '@/lib/service-area';

/** Keep a map inside the service area: no panning far outside Cavite, no zooming out past the province. */
export function applyServiceArea(map: L.Map): void {
    map.setMaxBounds(SERVICE_AREA_BOUNDS.pad(0.05));
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(SERVICE_AREA_MIN_ZOOM);
}

// ── Device location ("Use my current location") ──────────────────────────────

export type DeviceLocation = { lat: number; lng: number; accuracy_m: number };

/** Above this the reading is a guess (computers without GPS locate by internet connection). */
export const ACCURATE_ENOUGH_M = 300;

export const OUTSIDE_SERVICE_AREA_DEVICE = 'Your current location is outside Cavite. Please pick or search an address in Cavite.';
export const DEVICE_LOCATION_FAILED = "Couldn't get your location. Pick a saved address instead.";

export function getDeviceLocation(): Promise<DeviceLocation> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy }),
            reject,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    });
}

/** "about 2.4 km" / "about 450 m" */
export const accuracyText = (m: number): string =>
    m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

export const lowAccuracyNotice = (m: number): string =>
    `Your device's location is only accurate to about ${accuracyText(m)}. Computers without GPS guess it from your internet connection. ` +
    'Please drag the pin to your exact spot, or pick a saved address.';

// ── Address from a map point (reverse geocoding via /api/reverse-geocode) ─────

export type FilledAddress = { city: string; barangay: string; street: string };
export type FoundAddress = { city: string; barangay: string; street: string | null; approximate: boolean };

/**
 * City + barangay (always names from our Cavite dropdown) and the street for a point, or null (an error toast
 * is shown). Use it through useAutoFillAddress, which decides whether the street may be replaced.
 */
export async function lookupAddress(lat: number, lng: number): Promise<FoundAddress | null> {
    let data: { street: string | null; barangay: string | null; city: string | null; matched_by: 'name' | 'nearest'; message?: string };
    try {
        const res = await fetch(`/api/reverse-geocode?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        });
        data = await res.json();
        if (!res.ok) {
            toast.error(data?.message ?? "Couldn't look up this address. Please choose your city and barangay.");
            return null;
        }
    } catch {
        toast.error("Couldn't look up this address. Please choose your city and barangay.");
        return null;
    }
    if (!data.city || !data.barangay) {
        toast.error("Couldn't find the barangay for this spot. Please choose it from the list.");
        return null;
    }

    return { city: data.city, barangay: data.barangay, street: data.street?.trim() || null, approximate: data.matched_by === 'nearest' };
}

/** Straight-line distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const r = (d: number) => (d * Math.PI) / 180;
    const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
