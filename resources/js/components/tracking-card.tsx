import { router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { CheckCircle2, MapPin, MapPinOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import ServiceAreaLimit from '@/components/service-area-limit';
import 'leaflet/dist/leaflet.css';
import { useEchoPrivate, usePollInterval } from '@/lib/echo';
import { dotIcon, fetchRoute, haversineKm, OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';
import type { SharedData } from '@/types';

type Tracking = {
    status: 'not_dispatched' | 'preparing_pickup' | 'on_the_way' | 'delivered';
    rider_name: string | null;
    /** exact = the rider's NEXT stop is this order (server rule, J6) → real position; else rounded to ≈1 km */
    rider_area: { lat: number; lng: number; updated_at: string; exact?: boolean } | null;
    delivery_address: { lat: number; lng: number } | null;
    store_location: { lat: number; lng: number; name: string | null } | null;
    stops_before: number;
};

const STATUS_TEXT: Record<Tracking['status'], string> = {
    not_dispatched: 'Waiting for a rider',
    preparing_pickup: 'Rider is picking up your order',
    on_the_way: 'On the way',
    delivered: 'Delivered',
};

function Fit({ points }: { points: LatLng[] }) {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 14);
        else if (points.length > 1) map.fitBounds(points, { padding: [36, 36] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

/**
 * Live delivery tracking for the customer. Polls every 30s. The rider is shown only as
 * an approximate area (coordinates are rounded to ~1.1 km on the server), never exact GPS.
 */
export default function TrackingCard({ orderId }: { orderId: number }) {
    const [data, setData] = useState<Tracking | null>(null);
    const [failed, setFailed] = useState(false);
    const meId = usePage<SharedData>().props.auth.user.id as number;
    const pollMs = usePollInterval(30_000);   // 60 s safety net while live updates are connected

    useEffect(() => {
        let cancelled = false;
        const load = () => axios.get<Tracking>(`/customer/orders/${orderId}/tracking`)
            .then((r) => { if (!cancelled) { setData(r.data); setFailed(false); } })
            .catch(() => { if (!cancelled) setFailed(true); });
        load();
        const timer = setInterval(load, pollMs);
        return () => { cancelled = true; clearInterval(timer); };
    }, [orderId, pollMs]);

    // Live: the rider's (rounded) position moves the circle right away
    useEchoPrivate<{ order_id: number; lat: number; lng: number; updated_at: string; exact?: boolean }>(`user.${meId}`, 'RiderLocationUpdated', (e) => {
        if (e.order_id !== orderId) return;
        setData((d) => (d ? { ...d, rider_area: { lat: e.lat, lng: e.lng, updated_at: e.updated_at, exact: !!e.exact } } : d));
    });

    // J6: the rider is coming to THIS order next → road route to the customer's pin + ETA (OSRM, else km ÷ 25 km/h)
    const exact = !!data?.rider_area?.exact && data?.status === 'on_the_way';
    const [route, setRoute] = useState<{ coords: LatLng[]; eta: number | null; km: number | null } | null>(null);
    const routeKey = exact && data?.rider_area && data?.delivery_address
        ? `${data.rider_area.lat.toFixed(4)},${data.rider_area.lng.toFixed(4)}>${data.delivery_address.lat},${data.delivery_address.lng}` : '';
    useEffect(() => {
        if (!routeKey || !data?.rider_area || !data.delivery_address) { setRoute(null); return; }
        const from: LatLng = [data.rider_area.lat, data.rider_area.lng];
        const to: LatLng = [data.delivery_address.lat, data.delivery_address.lng];
        const ctl = new AbortController();
        fetchRoute([from, to], ctl.signal).then((r) => {
            const km = r.distanceKm ?? haversineKm(from[0], from[1], to[0], to[1]);
            setRoute({ coords: r.coords, km, eta: r.durationMin ?? Math.max(1, Math.round((km / 25) * 60)) });
        });
        return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeKey]);
    // Live: delivery status changes refresh the card (and the "stops before you" count)
    useEchoPrivate<{ order_id: number }>(`user.${meId}`, 'DeliveryUpdated', (e) => {
        if (e.order_id !== orderId) return;
        axios.get<Tracking>(`/customer/orders/${orderId}/tracking`).then((r) => setData(r.data)).catch(() => {});
    });

    // Delivered while watching → refresh the page so the order shows its final state
    useEffect(() => {
        if (data?.status === 'delivered') {
            const t = setTimeout(() => router.reload(), 2500);
            return () => clearTimeout(t);
        }
    }, [data?.status]);

    const points = useMemo<LatLng[]>(() => {
        const p: LatLng[] = [];
        if (data?.delivery_address) p.push([data.delivery_address.lat, data.delivery_address.lng]);
        if (data?.store_location) p.push([data.store_location.lat, data.store_location.lng]);
        if (data?.rider_area) p.push([data.rider_area.lat, data.rider_area.lng]);
        return p;
    }, [data]);

    if (data?.status === 'delivered') {
        return (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 font-semibold text-green-800 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" /> Order Delivered!
            </div>
        );
    }

    return (
        <div className="mt-4 overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-2.5 text-sm font-semibold dark:bg-gray-800/50">
                <MapPin className="h-4 w-4 text-blue-600" /> Delivery Tracking
            </div>

            {!data && !failed && <div className="h-[300px] animate-pulse bg-gray-100 dark:bg-gray-800" />}
            {failed && !data && <p className="p-4 text-sm text-muted-foreground">Tracking is unavailable right now.</p>}

            {data && (
                points.length === 0 ? (
                    <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                        <MapPinOff className="h-6 w-6" /> Location not available for this address.
                    </div>
                ) : (
                    <div style={{ height: 300 }}>
                        <MapContainer center={points[0]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                            <Fit points={points} />
                            {data.delivery_address && (
                                <Marker position={[data.delivery_address.lat, data.delivery_address.lng]} icon={pinIcon(PIN_COLORS.customer)}>
                                    <Popup>Your delivery location</Popup>
                                </Marker>
                            )}
                            {data.store_location && (
                                <Marker position={[data.store_location.lat, data.store_location.lng]} icon={pinIcon(PIN_COLORS.store)}>
                                    <Popup>{data.store_location.name ?? 'Store'}</Popup>
                                </Marker>
                            )}
                            {exact && data.rider_area && (
                                <Marker position={[data.rider_area.lat, data.rider_area.lng]} icon={dotIcon('#2563eb')}>
                                    <Popup>{data.rider_name ?? 'Your rider'} — on the way to you</Popup>
                                </Marker>
                            )}
                            {exact && route && route.coords.length > 1 && <Polyline positions={route.coords} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }} />}
                            {!exact && data.rider_area && (
                                <Circle center={[data.rider_area.lat, data.rider_area.lng]} radius={900}
                                    pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.18, weight: 1 }}>
                                    <Popup>Rider is somewhere in this area</Popup>
                                </Circle>
                            )}
                            <ServiceAreaLimit />
                        </MapContainer>
                    </div>
                )
            )}

            {data && (
                <div className="grid gap-1 px-4 py-3 text-sm">
                    <p><span className="text-muted-foreground">Rider:</span> <strong>{data.rider_name ?? '—'}</strong></p>
                    <p><span className="text-muted-foreground">Status:</span> {STATUS_TEXT[data.status]}</p>
                    <p><span className="text-muted-foreground">Deliveries before yours:</span> {data.stops_before}</p>
                    {exact && route && (
                        <p data-testid="tracking-eta"><span className="text-muted-foreground">Arriving in about:</span> <strong>{route.eta} min</strong>{route.km !== null && <span className="text-muted-foreground"> · {route.km.toFixed(1)} km</span>}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {exact
                            ? 'Your order is the rider\'s next stop — live position and route. Updates as the rider moves.'
                            : data.rider_area
                            ? 'The circle shows the rider\'s approximate area, for privacy. Updates every 30 seconds.'
                            : 'The rider\'s area appears once they start sharing their location.'}
                    </p>
                </div>
            )}
        </div>
    );
}
