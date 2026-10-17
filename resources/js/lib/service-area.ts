// Mainland Cavite outline (resources/data/cavite-boundary.json, [lat, lng]) — the same file App\Support\ServiceArea uses.
// No Leaflet import here, so this check runs anywhere (and can be tested on its own).
import caviteBoundary from '../../data/cavite-boundary.json';

export type LatLngPair = [number, number];

/** Mainland Cavite outline ([lat, lng]) — same file as App\Support\ServiceArea uses. */
export const CAVITE_BOUNDARY = caviteBoundary as LatLngPair[];
const BOUNDARY_BOX = CAVITE_BOUNDARY.reduce(
    (b, [lat, lng]) => ({ s: Math.min(b.s, lat), n: Math.max(b.n, lat), w: Math.min(b.w, lng), e: Math.max(b.e, lng) }),
    { s: 90, n: -90, w: 180, e: -180 },
);

/** Inside the Cavite outline (bounding box first, then ray casting). The rectangle above is only the pan limit. */
export function isInServiceArea(lat: number, lng: number): boolean {
    if (lat < BOUNDARY_BOX.s || lat > BOUNDARY_BOX.n || lng < BOUNDARY_BOX.w || lng > BOUNDARY_BOX.e) return false;
    let inside = false;
    for (let i = 0, j = CAVITE_BOUNDARY.length - 1; i < CAVITE_BOUNDARY.length; j = i++) {
        const [latI, lngI] = CAVITE_BOUNDARY[i];
        const [latJ, lngJ] = CAVITE_BOUNDARY[j];
        if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
    }
    return inside;
}
