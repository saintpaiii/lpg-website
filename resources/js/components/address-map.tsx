import type { LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_ATTRIBUTION, OSM_TILES, type LatLng } from '@/lib/map'; // also fixes Leaflet's default marker icons

export const CAVITE_CENTER: LatLng = [14.4791, 120.897];

const isValid = (lat: number | null | undefined, lng: number | null | undefined): boolean =>
    typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0;

export interface AddressMapProps {
    latitude: number | null;
    longitude: number | null;
    onLocationChange: (lat: number, lng: number) => void;
    /** CSS height, default "300px". */
    height?: string;
    /** Display only — pin can't be dragged or placed. */
    disabled?: boolean;
    /** Clicking the map moves an existing pin too (default: click only places the first pin). */
    clickMoves?: boolean;
    label?: string;
    /** Extra points (e.g. store pins) to keep in view together with the pin. */
    fitTo?: LatLng[];
    /** Extra map layers (store markers, route lines…). */
    children?: ReactNode;
}

/** Moves the view when the pin changes from outside (auto-pin, GPS) — not after the user drags it. */
function FollowPin({ pin, fitTo, skipNext }: { pin: LatLng | null; fitTo: LatLng[]; skipNext: React.MutableRefObject<boolean> }) {
    const map = useMap();
    const key = (pin ? pin.join(',') : '') + '|' + fitTo.map((p) => p.join(',')).join(';');

    useEffect(() => {
        if (skipNext.current) { skipNext.current = false; return; }
        if (!pin) return;
        if (fitTo.length > 0) map.fitBounds([pin, ...fitTo], { padding: [40, 40], maxZoom: 16 });
        else map.flyTo(pin, Math.max(map.getZoom(), 15), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return null;
}

/** Re-measure after mount — maps inside dialogs/collapsibles start at the wrong size (grey tiles). */
function FixSizeOnMount() {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 250);
        return () => clearTimeout(t);
    }, [map]);
    return null;
}

function ClickToPlace({ enabled, onPlace }: { enabled: boolean; onPlace: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e: LeafletMouseEvent) {
            if (enabled) onPlace(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

/**
 * Reusable address map with one draggable pin (checkout, customer profile).
 * - With coordinates: centred on a draggable pin.
 * - Without: Cavite overview; click the map to drop a pin.
 */
export default function AddressMap({ latitude, longitude, onLocationChange, height = '300px', disabled = false, clickMoves = false, label, fitTo = [], children }: AddressMapProps) {
    const hasPin = isValid(latitude, longitude);
    const pin: LatLng | null = hasPin ? [latitude as number, longitude as number] : null;
    const draggedByUser = useRef(false);
    const markerRef = useRef<LeafletMarker | null>(null);

    const eventHandlers = useMemo(() => ({
        dragend() {
            const m = markerRef.current;
            if (!m) return;
            const { lat, lng } = m.getLatLng();
            draggedByUser.current = true; // keep the view where the user left it
            onLocationChange(+lat.toFixed(7), +lng.toFixed(7));
        },
    }), [onLocationChange]);

    return (
        <div className="space-y-1.5">
            {label && <p className="text-sm font-medium">{label}</p>}
            <div className="relative overflow-hidden rounded-lg border" style={{ height, width: '100%' }}>
                <MapContainer center={pin ?? CAVITE_CENTER} zoom={pin ? 15 : 11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                    <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                    <FollowPin pin={pin} fitTo={fitTo} skipNext={draggedByUser} />
                    <FixSizeOnMount />
                    {/* Click places a pin when there isn't one yet (or moves it, with clickMoves); otherwise drag it */}
                    <ClickToPlace enabled={!disabled && (clickMoves || !hasPin)} onPlace={(lat, lng) => {
                        draggedByUser.current = true; // the user chose this spot — don't re-zoom
                        onLocationChange(+lat.toFixed(7), +lng.toFixed(7));
                    }} />
                    {pin && (
                        <Marker
                            position={pin}
                            draggable={!disabled}
                            eventHandlers={eventHandlers}
                            ref={(m) => { markerRef.current = m; }}
                        />
                    )}
                    {children}
                </MapContainer>

                {!hasPin && !disabled && (
                    <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] rounded-md bg-white/95 px-3 py-2 text-center text-xs text-gray-700 shadow dark:bg-gray-900/90 dark:text-gray-200">
                        Select your city and barangay to auto-pin your location, or click the map to place a pin.
                    </div>
                )}
            </div>
            {hasPin && !disabled && (
                <p className="text-xs text-gray-500">
                    {clickMoves ? 'Drag the pin or tap the map to set your exact delivery location.' : 'Drag the pin to adjust your exact delivery location.'}
                </p>
            )}
        </div>
    );
}

/** Look up approximate coordinates for an address (exact barangay → city centre → Cavite). */
export async function lookupBarangay(city: string, barangay: string): Promise<{ found: boolean; precision: string; latitude: number; longitude: number; message?: string } | null> {
    if (!city || !barangay) return null;
    try {
        const res = await fetch(`/api/barangay-coordinates?city=${encodeURIComponent(city)}&barangay=${encodeURIComponent(barangay)}`, {
            headers: { Accept: 'application/json' },
        });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}
