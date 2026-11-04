import { ExternalLink, Navigation } from 'lucide-react';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { dotIcon, googleMapsDirections, OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';
import { mapsUrl } from '@/lib/order-status';

/** Keep the view on the points (MapContainer ignores center/zoom changes after mount). */
function Fit({ points }: { points: LatLng[] }) {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 16);
        else if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

/**
 * Where to pick up the order: read-only map with the store pin (and the customer's address as a dot), the address,
 * the store's instructions, "Get directions" and "Open in Maps". Without coordinates: address + "Open in Maps" only.
 */
export default function StoreLocationMap({
    storeName, lat, lng, address, instructions, height = 200, youAreHere = null,
}: {
    storeName: string;
    lat: number | null | undefined;
    lng: number | null | undefined;
    address: string;
    instructions?: string | null;
    height?: number;
    youAreHere?: LatLng | null;
}) {
    const hasPin = lat != null && lng != null && lat !== 0 && lng !== 0;
    const store: LatLng | null = hasPin ? [lat!, lng!] : null;
    const points: LatLng[] = store ? (youAreHere ? [store, youAreHere] : [store]) : [];
    const openUrl = mapsUrl(hasPin ? lat : null, hasPin ? lng : null, address);
    const btn = 'inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto';

    return (
        <div className="overflow-hidden rounded-lg border bg-card">
            {store && (
                // isolate + z-0: Leaflet's panes (z-index 400/1000) never cover dialogs or lightboxes
                <div className="relative isolate z-0" style={{ height }}>
                    <MapContainer center={store} zoom={16} scrollWheelZoom={false} dragging className="h-full w-full">
                        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                        <Marker position={store} icon={pinIcon(PIN_COLORS.store)}>
                            <Tooltip direction="top" offset={[0, -28]}>{storeName}</Tooltip>
                        </Marker>
                        {youAreHere && (
                            <Marker position={youAreHere} icon={dotIcon()}>
                                <Tooltip direction="top">Your address</Tooltip>
                            </Marker>
                        )}
                        <Fit points={points} />
                    </MapContainer>
                </div>
            )}
            <div className="space-y-1 p-3 text-sm">
                <p className="font-semibold text-foreground">{storeName}</p>
                {address && <p className="text-muted-foreground">{address}</p>}
                {instructions && <p className="text-xs text-muted-foreground">{instructions}</p>}
                <div className="flex flex-col gap-2 pt-1.5 sm:flex-row">
                    {store && (
                        <a href={googleMapsDirections(store[0], store[1])} target="_blank" rel="noreferrer"
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
            </div>
        </div>
    );
}
