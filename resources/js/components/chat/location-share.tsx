import axios from 'axios';
import { ExternalLink, Loader2, MapPin, Navigation, Store } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { googleMapsDirections, OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';

/** A shared location (ChatService::formatMessage → location) */
export type ChatLocation = { lat: number; lng: number; label: string | null; google_url: string };

/** Philippines bounds — same as the server's validation */
export const inPhilippines = (lat: number, lng: number) => lat >= 4 && lat <= 22 && lng >= 116 && lng <= 127;

/** Downscale a photo so its long side is ≤ 1600 px (JPEG, quality 0.85). Falls back to the original if anything fails. */
export async function compressImage(file: File, maxSide = 1600): Promise<File> {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        if (scale >= 1 && file.size < 1.5 * 1024 * 1024) return file;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

function Recenter({ at }: { at: LatLng }) {
    const map = useMap();
    useEffect(() => { map.setView(at, Math.max(map.getZoom(), 16)); }, [at[0], at[1]]);   // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

/**
 * "📍 Location" in the composer: gets the device position (high accuracy, 10 s), shows a small map with a DRAGGABLE pin
 * to adjust, then "Send location". The seller can also send the store's own pin in one tap.
 */
export function LocationPicker({ open, onClose, onSend, storeLocation }: {
    open: boolean;
    onClose: () => void;
    onSend: (loc: { lat: number; lng: number; label: string | null }) => void;
    storeLocation?: { lat: number; lng: number; label: string } | null;
}) {
    const [pos, setPos] = useState<LatLng | null>(null);
    const [locating, setLocating] = useState(false);
    const [label, setLabel] = useState<string | null>(null);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (!open) return;
        setPos(null); setLabel(null);
        if (!('geolocation' in navigator)) { toast.error("This device can't share its location."); return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (p) => { setLocating(false); setPos([p.coords.latitude, p.coords.longitude]); },
            (err) => {
                setLocating(false);
                toast.error(err.code === err.PERMISSION_DENIED
                    ? 'Location is blocked. Allow it in your browser: tap the lock icon next to the address → Location → Allow, then try again.'
                    : "Couldn't get your location. Move to an open area and try again, or drag the pin.");
                if (storeLocation) setPos([storeLocation.lat, storeLocation.lng]);
            },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
        );
    }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Reverse-geocode the pin (optional label like "Rizal St., Alapan I-A, Imus")
    useEffect(() => {
        if (!pos) return;
        const ctl = new AbortController();
        const t = setTimeout(() => {
            axios.get<{ street: string | null; barangay: string | null; city: string | null }>('/api/reverse-geocode', { params: { lat: pos[0], lng: pos[1] }, signal: ctl.signal })
                .then((r) => setLabel([r.data.street, r.data.barangay, r.data.city].filter(Boolean).join(', ') || null))
                .catch(() => setLabel(null));
        }, 400);
        return () => { clearTimeout(t); ctl.abort(); };
    }, [pos?.[0], pos?.[1]]);   // eslint-disable-line react-hooks/exhaustive-deps

    const handlers = useMemo(() => ({
        dragend() {
            const m = markerRef.current;
            if (m) { const ll = m.getLatLng(); setPos([ll.lat, ll.lng]); }
        },
    }), []);
    const outside = pos ? !inPhilippines(pos[0], pos[1]) : false;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md" data-testid="location-picker">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /> Share location</DialogTitle></DialogHeader>
                <div className="overflow-hidden rounded-lg border" style={{ height: 260 }}>
                    {pos ? (
                        <MapContainer center={pos} zoom={16} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                            <Recenter at={pos} />
                            <Marker position={pos} draggable eventHandlers={handlers} ref={markerRef} icon={pinIcon(PIN_COLORS.customer)} />
                        </MapContainer>
                    ) : (
                        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                            {locating ? <><Loader2 className="h-4 w-4 animate-spin" /> Finding your location…</> : 'No location yet.'}
                        </div>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">{pos ? (label ?? `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`) : ' '}{pos && ' · drag the pin to adjust'}</p>
                {outside && <p className="text-xs text-red-600">That point is outside the Philippines.</p>}
                <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                    {storeLocation ? (
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onSend({ lat: storeLocation.lat, lng: storeLocation.lng, label: storeLocation.label })}>
                            <Store className="h-3.5 w-3.5" /> Send store location
                        </Button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        <Button type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={!pos || outside}
                            onClick={() => pos && onSend({ lat: Number(pos[0].toFixed(7)), lng: Number(pos[1].toFixed(7)), label })}>
                            Send location
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** A location bubble: mini map tile + label + "Open in Google Maps" (+ "Navigate" for riders). */
export function LocationBubble({ location, rider }: { location: ChatLocation; rider?: boolean }) {
    const at: LatLng = [location.lat, location.lng];
    return (
        <div className="mb-1 w-[240px] overflow-hidden rounded-lg border bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100" data-testid="chat-location">
            <div style={{ height: 120 }}>
                <MapContainer center={at} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false} scrollWheelZoom={false}
                    doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} attributionControl={false}>
                    <TileLayer url={OSM_TILES} />
                    <Marker position={at} icon={pinIcon(PIN_COLORS.customer)} interactive={false} />
                </MapContainer>
            </div>
            <div className="space-y-1 px-2.5 py-2 text-xs">
                <p className="flex items-start gap-1 font-medium"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" /> {location.label ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</p>
                <div className="flex flex-wrap gap-3">
                    <a href={location.google_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Open in Google Maps
                    </a>
                    {rider && (
                        <a href={googleMapsDirections(location.lat, location.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                            <Navigation className="h-3 w-3" /> Navigate
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
