// Leaflet helpers shared by the rider route map and the customer tracking card.
// Free services only: OpenStreetMap tiles + the public OSRM demo router.
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
                ${label !== undefined ? `<span style="position:absolute;top:6px;left:0;width:30px;text-align:center;font:700 12px/17px system-ui,sans-serif;color:${color}">${label}</span>` : ''}
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

export const googleMapsDirections = (lat: number, lng: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
