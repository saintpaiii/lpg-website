import { Camera, MapPinOff, Navigation } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { dotIcon, googleMapsDirections, OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, fetchRoute, type LatLng } from '@/lib/map';

export type RouteStop = {
    id: number;
    number: number;
    sequence: number | null;
    batch_id: string | null;
    status: 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
    order_number: string | null;
    customer_name: string;
    customer_phone: string | null;
    address: string;
    lat: number | null;
    lng: number | null;
    amount: number;
    payment_label: string;
    amount_to_collect: number;
};

export type RouteData = {
    store: { lat: number; lng: number; approximate?: boolean } | null;
    stops: RouteStop[];
};

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isDone = (s: RouteStop['status']) => s === 'delivered' || s === 'failed';

/** Pin colour + label per delivery status (values from the deliveries.status enum). */
export const STOP_STATUS: Record<RouteStop['status'], { color: string; label: string; legend: string }> = {
    assigned:   { color: '#EF4444', label: 'To deliver (not yet picked up)', legend: 'To deliver' },
    picked_up:  { color: '#3B82F6', label: 'Picked up from store',           legend: 'Picked up' },
    in_transit: { color: '#F97316', label: 'In transit',                     legend: 'In transit' },
    delivered:  { color: '#22C55E', label: 'Delivered',                      legend: 'Delivered' },
    failed:     { color: '#6B7280', label: 'Failed',                         legend: 'Failed' },
};
const stopStyle = (s: string) => STOP_STATUS[s as RouteStop['status']] ?? STOP_STATUS.assigned;
/** Keep the route number until the stop is finished, then ✓ / ✕. */
const stopGlyph = (s: RouteStop) => (s.status === 'delivered' ? '✓' : s.status === 'failed' ? '✕' : s.number);

function FitToPoints({ points }: { points: LatLng[] }) {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 14);
        else if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
    // Fit only when the set of points changes (not on every re-render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

/**
 * Rider route with OSRM road geometry per leg. Finished stops form the gray dashed
 * "already driven" path (store → done stops); the solid blue path continues from the
 * last finished stop (or the store) through the stops still to deliver.
 */
export default function DeliveryMap({ route, riderPos, onUploadProof, height = 480 }: {
    route: RouteData;
    riderPos: LatLng | null;
    onUploadProof: (stop: RouteStop) => void;
    height?: number;
}) {
    const mapped = route.stops.filter((s) => s.lat !== null && s.lng !== null);
    const unmapped = route.stops.filter((s) => s.lat === null || s.lng === null);

    // Two paths: already driven (store → finished stops) and still to drive
    // (last finished stop, or the store → remaining stops in route order)
    const { donePts, todoPts } = useMemo(() => {
        const store: LatLng[] = route.store ? [[route.store.lat, route.store.lng]] : [];
        const done = mapped.filter((s) => isDone(s.status)).map((s) => [s.lat!, s.lng!] as LatLng);
        const todo = mapped.filter((s) => !isDone(s.status)).map((s) => [s.lat!, s.lng!] as LatLng);
        const doneP = [...store, ...done];
        return { donePts: doneP, todoPts: [...doneP.slice(-1), ...todo] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(route)]);

    // Road geometry: ONE request per path through the cached /api/route proxy, only when the points change
    const [paths, setPaths] = useState<{ done: LatLng[]; todo: LatLng[]; ok: boolean }>({ done: [], todo: [], ok: true });
    const pathKey = JSON.stringify([donePts, todoPts]);
    useEffect(() => {
        const ctrl = new AbortController();
        const usable = (pts: LatLng[]) => (pts.length >= 2 ? pts : []);
        // Straight lines immediately, then upgrade to road geometry
        setPaths({ done: usable(donePts), todo: usable(todoPts), ok: true });
        Promise.all([fetchRoute(usable(donePts), ctrl.signal), fetchRoute(usable(todoPts), ctrl.signal)]).then(([d, t]) => {
            if (ctrl.signal.aborted) return;
            setPaths({
                done: usable(donePts).length ? d.coords : [],
                todo: usable(todoPts).length ? t.coords : [],
                ok: (!usable(donePts).length || d.ok) && (!usable(todoPts).length || t.ok),
            });
        });
        return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathKey]);
    const waypoints = [...donePts, ...todoPts.slice(1)].map((at) => ({ at }));

    const fitPoints: LatLng[] = [...waypoints.map((w) => w.at), ...(riderPos ? [riderPos] : [])];
    const center: LatLng = fitPoints[0] ?? [14.42, 120.94];

    return (
        <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border" style={{ height }}>
                <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                    <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                    <FitToPoints points={fitPoints} />

                    {paths.done.length > 1 && (
                        <Polyline positions={paths.done} pathOptions={{ color: '#9ca3af', weight: 4, opacity: 0.8, dashArray: '6 8' }} />
                    )}
                    {paths.todo.length > 1 && (
                        <Polyline positions={paths.todo} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />
                    )}

                    {route.store && (
                        <Marker position={[route.store.lat, route.store.lng]} icon={pinIcon(PIN_COLORS.store, '🏪')}>
                            <Popup>
                                <strong>Store — pickup</strong>
                                {route.store.approximate && <div className="text-xs text-gray-500">Approximate (barangay centre)</div>}
                            </Popup>
                        </Marker>
                    )}

                    {mapped.map((s) => {
                        const st = stopStyle(s.status);
                        return (
                            <Marker key={`${s.id}-${s.status}`} position={[s.lat!, s.lng!]} icon={pinIcon(st.color, stopGlyph(s))}
                                zIndexOffset={isDone(s.status) ? -500 : 0}>
                                <Popup minWidth={220}>
                                    <div className="space-y-1 text-sm">
                                        <p className="font-semibold">#{s.number} — {s.customer_name}</p>
                                        <p className="text-xs text-gray-600">{s.address || 'No address on file'}</p>
                                        <p className="text-xs">
                                            {peso(s.amount)} ({s.payment_label})
                                            {s.amount_to_collect > 0 && <span className="font-semibold text-amber-700"> · collect {peso(s.amount_to_collect)}</span>}
                                        </p>
                                        <p className="text-xs">
                                            Status: <span className="font-semibold" style={{ color: st.color }}>{s.status === 'delivered' ? '✓ ' : s.status === 'failed' ? '✕ ' : ''}{st.label}</span>
                                        </p>
                                        {s.order_number && <p className="font-mono text-[11px] text-gray-500">{s.order_number}</p>}
                                        {!isDone(s.status) && (
                                            <div className="flex gap-1.5 pt-1.5">
                                                <a href={googleMapsDirections(s.lat!, s.lng!)} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold !text-white hover:bg-blue-700">
                                                    <Navigation className="h-3 w-3" /> Navigate
                                                </a>
                                                <button type="button" onClick={() => onUploadProof(s)}
                                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold hover:bg-gray-50">
                                                    <Camera className="h-3 w-3" /> Upload Proof
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}

                    {riderPos && (
                        <>
                            <CircleMarker center={riderPos} radius={22} pathOptions={{ color: '#2563eb', fillOpacity: 0.12, weight: 1 }} />
                            <Marker position={riderPos} icon={dotIcon('#2563eb')}><Popup>You are here</Popup></Marker>
                        </>
                    )}
                </MapContainer>
            </div>

            {!paths.ok && (
                <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    Road routing is unavailable right now, so stops are joined with straight lines. Use <strong>Navigate</strong> for turn-by-turn directions.
                </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <Legend color={PIN_COLORS.store} label="Store" />
                {(Object.keys(STOP_STATUS) as RouteStop['status'][]).map((k) => (
                    <Legend key={k} color={STOP_STATUS[k].color} label={STOP_STATUS[k].legend} />
                ))}
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" /> You</span>
            </div>

            {route.stops.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">No active deliveries — only the store is shown.</p>
            )}

            {unmapped.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="mb-1 flex items-center gap-1.5 font-semibold"><MapPinOff className="h-4 w-4" /> Location not available</p>
                    {unmapped.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                            <span>
                                #{s.number} {s.customer_name} — {s.address || 'no address'}
                                <span className="ml-1 font-semibold" style={{ color: stopStyle(s.status).color }}>({stopStyle(s.status).legend})</span>
                            </span>
                            {!isDone(s.status) && (
                                <button type="button" onClick={() => onUploadProof(s)} className="text-xs font-semibold underline">Upload Proof</button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}</span>;
}
