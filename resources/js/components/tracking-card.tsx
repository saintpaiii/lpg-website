import { router } from '@inertiajs/react';
import axios from 'axios';
import { CheckCircle2, MapPin, MapPinOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';

type Tracking = {
    status: 'not_dispatched' | 'preparing_pickup' | 'on_the_way' | 'delivered';
    rider_name: string | null;
    rider_area: { lat: number; lng: number; updated_at: string } | null;
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

    useEffect(() => {
        let cancelled = false;
        const load = () => axios.get<Tracking>(`/customer/orders/${orderId}/tracking`)
            .then((r) => { if (!cancelled) { setData(r.data); setFailed(false); } })
            .catch(() => { if (!cancelled) setFailed(true); });
        load();
        const timer = setInterval(load, 30_000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [orderId]);

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
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-green-800">
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
            {failed && !data && <p className="p-4 text-sm text-gray-500">Tracking is unavailable right now.</p>}

            {data && (
                points.length === 0 ? (
                    <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-sm text-gray-500">
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
                            {data.rider_area && (
                                <Circle center={[data.rider_area.lat, data.rider_area.lng]} radius={900}
                                    pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.18, weight: 1 }}>
                                    <Popup>Rider is somewhere in this area</Popup>
                                </Circle>
                            )}
                        </MapContainer>
                    </div>
                )
            )}

            {data && (
                <div className="grid gap-1 px-4 py-3 text-sm">
                    <p><span className="text-gray-500">Rider:</span> <strong>{data.rider_name ?? '—'}</strong></p>
                    <p><span className="text-gray-500">Status:</span> {STATUS_TEXT[data.status]}</p>
                    <p><span className="text-gray-500">Deliveries before yours:</span> {data.stops_before}</p>
                    <p className="text-xs text-gray-400">
                        {data.rider_area
                            ? 'The circle shows the rider\'s approximate area, for privacy. Updates every 30 seconds.'
                            : 'The rider\'s area appears once they start sharing their location.'}
                    </p>
                </div>
            )}
        </div>
    );
}
