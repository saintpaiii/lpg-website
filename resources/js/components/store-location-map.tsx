import L from 'leaflet';
import { ExternalLink, Navigation } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
    dotIcon, fetchRoute, formatDistance, googleMapsDirections, haversineKm, OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon,
    type LatLng, type RoadRoute,
} from '@/lib/map';
import { mapsUrl } from '@/lib/order-status';

/**
 * Keep the view on what matters (MapContainer ignores center/zoom changes after mount). `fitKey` is a short string
 * that changes once per result — never built from hundreds of route coordinates.
 */
function Fit({ points, fitKey }: { points: LatLng[]; fitKey: string }) {
    const map = useMap();
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 16);
        else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);
    return null;
}

const WALKABLE_KM = 0.3;

/**
 * Where to pick up the order: read-only map with the store pin and — when the customer's address is known — the road
 * route from it (our OpenStreetMap + OSRM proxy), the distance and an estimated time. Google Maps is only an extra
 * button. Without store coordinates: address + "Open in Maps" only.
 */
export default function StoreLocationMap({
    storeName, lat, lng, address, instructions, height = 200, from = null, fromApproximate = false,
}: {
    storeName: string;
    lat: number | null | undefined;
    lng: number | null | undefined;
    address: string;
    instructions?: string | null;
    height?: number;
    /** The customer's address (pin) — the route starts here */
    from?: LatLng | null;
    /** The start is only the barangay centre (auto-placed pin) */
    fromApproximate?: boolean;
}) {
    const hasPin = lat != null && lng != null && lat !== 0 && lng !== 0;
    const store: LatLng | null = hasPin ? [lat!, lng!] : null;
    const openUrl = mapsUrl(hasPin ? lat : null, hasPin ? lng : null, address);
    const btn = 'inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto';

    // Road route from the customer's address (debounced; aborted when the points change)
    const r4 = (n: number) => n.toFixed(4);
    const routeKey = store && from ? `${r4(from[0])},${r4(from[1])}>${r4(store[0])},${r4(store[1])}` : '';
    const [route, setRoute] = useState<RoadRoute | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRoute(null);
        if (!routeKey || !store || !from) { setLoading(false); return; }
        setLoading(true);
        const ctrl = new AbortController();
        const timer = window.setTimeout(async () => {
            const result = await fetchRoute([from, store], ctrl.signal);
            // fetchRoute returns the straight-line fallback on abort — ignore it
            if (ctrl.signal.aborted) return;
            setRoute(result);
            setLoading(false);
        }, 500);
        return () => { window.clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeKey]);

    const straightKm = store && from ? haversineKm(from[0], from[1], store[0], store[1]) : null;
    const fitPoints = useMemo<LatLng[]>(
        () => (route?.ok ? route.coords : store ? (from ? [store, from] : [store]) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [route, routeKey],
    );
    const fitKey = `${routeKey || (store ? store.join(',') : '')}|${route?.ok ? 'road' : route ? 'line' : 'pts'}`;
    const approx = fromApproximate ? '≈ ' : '';

    return (
        <div className="overflow-hidden rounded-lg border bg-card">
            {store && (
                // isolate + z-0: Leaflet's panes (z-index 400/1000) never cover dialogs or lightboxes
                <div className="relative isolate z-0" style={{ height }}>
                    <MapContainer center={store} zoom={16} scrollWheelZoom={false} dragging className="h-full w-full">
                        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                        {route?.ok && <Polyline positions={route.coords} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.8 }} />}
                        {route && !route.ok && from && (
                            <Polyline positions={[from, store]} pathOptions={{ color: '#94a3b8', weight: 2, dashArray: '6 6' }} />
                        )}
                        <Marker position={store} icon={pinIcon(PIN_COLORS.store)}>
                            <Tooltip direction="top" offset={[0, -28]}>{storeName}</Tooltip>
                        </Marker>
                        {from && (
                            <Marker position={from} icon={dotIcon()}>
                                <Tooltip direction="top">Your address</Tooltip>
                            </Marker>
                        )}
                        <Fit points={fitPoints} fitKey={fitKey} />
                    </MapContainer>
                </div>
            )}
            <div className="space-y-1 p-3 text-sm">
                <p className="font-semibold text-foreground">{storeName}</p>
                {address && <p className="text-muted-foreground">{address}</p>}
                {instructions && <p className="text-xs text-muted-foreground">{instructions}</p>}

                {/* Distance + time from the customer's address */}
                {store && from && (
                    <div className="space-y-0.5 pt-1 text-xs">
                        {loading && !route && <p className="text-muted-foreground">Finding the route…</p>}
                        {route?.ok && route.distanceKm != null && (
                            <>
                                <p className="font-medium text-foreground">
                                    🚗 {approx}{formatDistance(route.distanceKm)} by road
                                    {route.durationMin != null && <> · about {route.durationMin < 1 ? 1 : Math.round(route.durationMin)} min</>}
                                </p>
                                <p className="text-muted-foreground">
                                    {fromApproximate
                                        ? 'Approximate — from your barangay. Move your pin for an exact route.'
                                        : 'Route from your address (OpenStreetMap)'}
                                </p>
                            </>
                        )}
                        {route && (!route.ok || route.distanceKm == null) && straightKm != null && (
                            <>
                                <p className="font-medium text-foreground">📍 About {approx}{formatDistance(straightKm)} from your address (straight line)</p>
                                {fromApproximate && (
                                    <p className="text-muted-foreground">Approximate — from your barangay. Move your pin for an exact route.</p>
                                )}
                            </>
                        )}
                        {!fromApproximate && straightKm != null && straightKm < WALKABLE_KM && (
                            <p className="text-emerald-700 dark:text-emerald-400">Very near — you can walk there.</p>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-2 pt-1.5 sm:flex-row">
                    {store && (
                        <a href={googleMapsDirections(store[0], store[1], from ?? null, 'driving')} target="_blank" rel="noreferrer"
                            className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
                            <Navigation className="h-4 w-4" /> Get directions
                        </a>
                    )}
                    {openUrl && (
                        <a href={openUrl} target="_blank" rel="noreferrer" className={`${btn} border-input bg-background hover:bg-muted`}>
                            <ExternalLink className="h-4 w-4" /> Open in Maps
                        </a>
                    )}
                </div>
                {store && (
                    <p className="text-[11px] text-muted-foreground">Google Maps may show a longer route if a local shortcut isn't on its map.</p>
                )}
            </div>
        </div>
    );
}
