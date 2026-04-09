import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Camera,
    Car,
    CheckCircle,
    ChevronDown,
    ExternalLink,
    Locate,
    MapPin,
    Navigation,
    Package,
    Phone,
    Radio,
    Truck,
    X,
} from 'lucide-react';
import L from 'leaflet';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string | null } | null;
};

type CustomerRef = {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    barangay: string | null;
    city: string | null;
};

type OrderRef = {
    id: number;
    order_number: string;
    status: string;
    total_amount: number;
    shipping_fee: number | null;
    transaction_type: string;
    payment_method: string;
    payment_status: string;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    delivery_distance_km: number | null;
    estimated_delivery_minutes: number | null;
    store_location: { lat: number; lng: number; name: string } | null;
    customer: CustomerRef | null;
    items: OrderItem[];
};

type DeliveryRow = {
    id: number;
    status: DeliveryStatus;
    notes: string | null;
    assigned_at: string | null;
    delivered_at: string | null;
    order: OrderRef | null;
    vehicle: { vehicle_type: string; plate_number: string } | null;
};

type Counts = {
    assigned: number;
    picked_up: number;
    in_transit: number;
    delivered_today: number;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    deliveries: Paginated<DeliveryRow>;
    tab: string;
    counts: Counts;
    filters: { tab?: string };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Deliveries', href: '/rider/deliveries' }];

const STATUS_LABELS: Record<DeliveryStatus, string> = {
    assigned:   'Assigned',
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

const STATUS_STYLES: Record<DeliveryStatus, string> = {
    assigned:   'bg-blue-100 text-blue-700',
    picked_up:  'bg-indigo-100 text-indigo-700',
    in_transit: 'bg-purple-100 text-purple-700',
    delivered:  'bg-emerald-100 text-emerald-700',
    failed:     'bg-red-100 text-red-700',
};

// Next statuses a rider can move to
const STATUS_NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
    assigned:   ['picked_up', 'failed'],
    picked_up:  ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered:  [],
    failed:     [],
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash:            'Cash',
    gcash:           'GCash',
    maya:            'Maya',
    bank_transfer:   'Bank Transfer',
    card:            'Card',
    grab_pay:        'GrabPay',
    credits:         'Platform Credits',
    credits_partial: 'Credits + Online',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
    paid:    'bg-emerald-100 text-emerald-700',
    unpaid:  'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
};

// ── Small components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeliveryStatus }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
        </span>
    );
}

function Pagination({ data, onVisit }: { data: Paginated<any>; onVisit: (url: string) => void }) {
    if (data.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
                Showing {data.from}–{data.to} of {data.total}
            </p>
            <div className="flex gap-1">
                {data.links.map((link, i) => (
                    <button
                        key={i}
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url!)}
                        className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                            link.active
                                ? 'bg-blue-600 text-white'
                                : link.url
                                ? 'hover:bg-gray-100 text-gray-600'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Update Status Dialog ───────────────────────────────────────────────────────

const PROOF_STATUSES: DeliveryStatus[] = ['picked_up', 'delivered', 'failed'];

// GPS state helper
type GpsState = 'idle' | 'capturing' | 'ok' | 'failed';

// Green rider pin for modal map preview
const riderPinIcon = L.divIcon({
    html: `<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 18 10 18S20 17.5 20 10C20 4.477 15.523 0 10 0z"
              fill="#22c55e" stroke="white" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="4" fill="white" opacity="0.95"/>
    </svg>`,
    className: '',
    iconSize: [20, 28],
    iconAnchor: [10, 28],
});

function UpdateStatusDialog({
    delivery,
    targetStatus,
    onClose,
}: {
    delivery: DeliveryRow | null;
    targetStatus: DeliveryStatus | null;
    onClose: () => void;
}) {
    const { data, setData, post, processing, errors, reset, transform } = useForm<{
        status: string;
        notes: string;
        location_note: string;
        photo: File | null;
        rider_latitude: string;
        rider_longitude: string;
        rider_accuracy: string;
    }>({
        status:          targetStatus ?? '',
        notes:           '',
        location_note:   '',
        photo:           null,
        rider_latitude:  '',
        rider_longitude: '',
        rider_accuracy:  '',
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview]       = useState<string | null>(null);
    const [gpsState, setGpsState]     = useState<GpsState>('idle');
    const [geocodeAddr, setGeocodeAddr] = useState<string | null>(null);

    // Derived coords for convenience
    const riderLat = data.rider_latitude  ? parseFloat(data.rider_latitude)  : null;
    const riderLng = data.rider_longitude ? parseFloat(data.rider_longitude) : null;

    // Auto-capture GPS + reverse-geocode when dialog opens
    useEffect(() => {
        if (!delivery || !targetStatus) return;
        setGpsState('capturing');
        setGeocodeAddr(null);
        if (!navigator.geolocation) { setGpsState('failed'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setData((prev) => ({
                    ...prev,
                    rider_latitude:  String(lat),
                    rider_longitude: String(lng),
                    rider_accuracy:  pos.coords.accuracy ? String(pos.coords.accuracy) : '',
                }));
                setGpsState('ok');
                // Reverse geocode via Nominatim
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
                    headers: { 'Accept-Language': 'en' },
                })
                    .then((r) => r.json())
                    .then((geo) => {
                        const addr = geo.address;
                        const parts = [
                            addr?.village || addr?.suburb || addr?.neighbourhood || addr?.hamlet,
                            addr?.city || addr?.town || addr?.municipality,
                            addr?.province || addr?.state,
                        ].filter(Boolean);
                        const readable = parts.length ? parts.join(', ') : geo.display_name?.split(',').slice(0, 3).join(',') ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                        setGeocodeAddr(readable);
                        // Auto-fill location_note for the proof record
                        setData((prev) => ({ ...prev, location_note: readable }));
                    })
                    .catch(() => {
                        setGeocodeAddr(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                    });
            },
            () => setGpsState('failed'),
            { enableHighAccuracy: true, timeout: 8000 },
        );
    }, [!!delivery, targetStatus]);

    if (data.status !== (targetStatus ?? '')) {
        setData('status', targetStatus ?? '');
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('photo', file);
        if (file) {
            const url = URL.createObjectURL(file);
            setPreview(url);
        } else {
            setPreview(null);
        }
    }

    function clearPhoto() {
        setData('photo', null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!delivery) return;
        transform((d) => ({ ...d, _method: 'PATCH' }));
        post(`/rider/deliveries/${delivery.id}/status`, {
            forceFormData: true,
            onSuccess: () => {
                reset();
                setPreview(null);
                setGpsState('idle');
                setGeocodeAddr(null);
                onClose();
            },
        });
    }

    function handleClose() {
        reset();
        setPreview(null);
        setGpsState('idle');
        setGeocodeAddr(null);
        onClose();
    }

    const isFailed   = targetStatus === 'failed';
    const needsPhoto = targetStatus !== null && PROOF_STATUSES.includes(targetStatus);

    return (
        <Dialog open={!!delivery && !!targetStatus} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 ${isFailed ? 'text-red-600' : ''}`}>
                        {isFailed
                            ? <AlertTriangle className="h-4 w-4" />
                            : <CheckCircle className="h-4 w-4 text-blue-600" />
                        }
                        {isFailed ? 'Mark as Failed' : `Mark as ${targetStatus ? STATUS_LABELS[targetStatus] : ''}`}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <p className="text-sm text-gray-600">
                        {isFailed
                            ? <>Provide a reason for the failed delivery of <span className="font-semibold">{delivery?.order?.order_number}</span>.</>
                            : <>Confirm status update for <span className="font-semibold">{delivery?.order?.order_number}</span>?</>
                        }
                    </p>

                    {/* GPS location block */}
                    <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${
                        gpsState === 'ok'        ? 'bg-emerald-50 border-emerald-200' :
                        gpsState === 'failed'    ? 'bg-amber-50 border-amber-200' :
                        gpsState === 'capturing' ? 'bg-blue-50 border-blue-200' :
                                                   'bg-gray-50 border-gray-200'
                    }`}>
                        <div className={`flex items-center gap-2 text-xs font-medium ${
                            gpsState === 'ok'        ? 'text-emerald-700' :
                            gpsState === 'failed'    ? 'text-amber-700' :
                            gpsState === 'capturing' ? 'text-blue-600' :
                                                       'text-gray-500'
                        }`}>
                            <Locate className={`h-3.5 w-3.5 shrink-0 ${gpsState === 'capturing' ? 'animate-pulse' : ''}`} />
                            {gpsState === 'ok'        && 'Location captured — will be shared with this update'}
                            {gpsState === 'failed'    && 'Location unavailable — update will proceed without location'}
                            {gpsState === 'capturing' && 'Capturing your location…'}
                            {gpsState === 'idle'      && 'Preparing location capture…'}
                        </div>

                        {/* Reverse-geocoded address */}
                        {gpsState === 'ok' && (
                            <p className="flex items-start gap-1.5 text-xs text-emerald-700">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>
                                    {geocodeAddr
                                        ? <><strong>Detected location:</strong> {geocodeAddr}</>
                                        : 'Looking up address…'
                                    }
                                </span>
                            </p>
                        )}

                        {/* Small map preview */}
                        {gpsState === 'ok' && riderLat !== null && riderLng !== null && (
                            <div className="rounded-md overflow-hidden border border-emerald-200 mt-1">
                                <MapContainer
                                    center={[riderLat, riderLng]}
                                    zoom={15}
                                    style={{ height: 160, width: '100%' }}
                                    scrollWheelZoom={false}
                                    dragging={false}
                                    zoomControl={false}
                                    attributionControl={false}
                                >
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    <Marker position={[riderLat, riderLng]} icon={riderPinIcon} />
                                </MapContainer>
                            </div>
                        )}
                    </div>

                    {/* Photo proof — hidden for in_transit */}
                    {targetStatus !== 'in_transit' && (
                        <div className="grid gap-1.5">
                            <Label className="flex items-center gap-1">
                                <Camera className="h-3.5 w-3.5" />
                                Photo Proof{needsPhoto ? ' *' : ' (optional)'}
                            </Label>
                            {preview ? (
                                <div className="relative">
                                    <img src={preview} alt="Preview" className="w-full rounded-md object-cover max-h-48 border" />
                                    <button
                                        type="button"
                                        onClick={clearPhoto}
                                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 p-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                                    <Camera className="h-6 w-6" />
                                    <span>Tap to take or upload a photo</span>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/jpg"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                            )}
                            {errors.photo && <p className="text-xs text-red-500">{errors.photo}</p>}
                        </div>
                    )}

                    {/* Notes */}
                    <div className="grid gap-1.5">
                        <Label>{isFailed ? 'Reason *' : 'Notes (optional)'}</Label>
                        <textarea
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                            placeholder={isFailed ? 'e.g. Customer not home, wrong address…' : 'Any delivery notes…'}
                            rows={2}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {errors.notes && <p className="text-xs text-red-500">{errors.notes}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            disabled={processing || (isFailed && !data.notes.trim()) || (needsPhoto && !data.photo)}
                            variant={isFailed ? 'destructive' : 'default'}
                            className={isFailed ? '' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                        >
                            {processing ? 'Uploading…' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── FitBounds helper ──────────────────────────────────────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length >= 2) map.fitBounds(positions as any, { padding: [30, 30] });
    }, [positions.map(p => p.join(',')).join('|')]);
    return null;
}

// ── Delivery Detail Panel ──────────────────────────────────────────────────────

function DeliveryDetailPanel({ delivery }: { delivery: DeliveryRow }) {
    const o = delivery.order;
    if (!o) return null;

    const isActive = ['picked_up', 'in_transit'].includes(delivery.status);

    const [osrmCoords, setOsrmCoords] = useState<[number, number][] | null>(null);
    const [riderPos, setRiderPos]     = useState<[number, number] | null>(null);

    // Share location state
    const [shareLoading, setShareLoading]   = useState(false);
    const [lastShared, setLastShared]       = useState<Date | null>(null);
    const [autoShare, setAutoShare]         = useState(false);
    const autoShareRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const watchIdRef   = useRef<number | null>(null);

    async function sendLocation(lat: number, lng: number, accuracy?: number) {
        try {
            await fetch('/rider/location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? '',
                },
                body: JSON.stringify({ delivery_id: delivery.id, latitude: lat, longitude: lng, accuracy }),
            });
            setLastShared(new Date());
            setRiderPos([lat, lng]);
        } catch { /* silent */ }
    }

    function shareOnce() {
        if (!navigator.geolocation) return;
        setShareLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                sendLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).finally(() => setShareLoading(false));
            },
            () => setShareLoading(false),
            { enableHighAccuracy: true, timeout: 8000 },
        );
    }

    function toggleAutoShare(on: boolean) {
        setAutoShare(on);
        if (!on) {
            // Stop
            if (autoShareRef.current) clearInterval(autoShareRef.current);
            if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
            autoShareRef.current = null;
            watchIdRef.current   = null;
            return;
        }
        // Start — share immediately then every 30s
        shareOnce();
        autoShareRef.current = setInterval(() => shareOnce(), 30_000);
    }

    // Cleanup auto-share on unmount
    useEffect(() => {
        return () => {
            if (autoShareRef.current) clearInterval(autoShareRef.current);
            if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
        };
    }, []);

    const hasCustomerLoc = o.delivery_latitude !== null && o.delivery_longitude !== null;
    const hasStoreLoc    = o.store_location !== null;

    // Fix Leaflet icons + get rider GPS + fetch OSRM
    useEffect(() => {
        import('leaflet').then((L) => {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
        });

        // Rider's current GPS
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setRiderPos([pos.coords.latitude, pos.coords.longitude]),
                () => {},
                { timeout: 8000, enableHighAccuracy: true },
            );
        }

        // OSRM route — store → customer
        if (hasStoreLoc && hasCustomerLoc) {
            const { lat: sLat, lng: sLng } = o.store_location!;
            const custLat = o.delivery_latitude!;
            const custLng = o.delivery_longitude!;
            const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${custLng},${custLat}?overview=full&geometries=geojson`;
            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (data.code === 'Ok' && data.routes?.[0]) {
                        const coords = (data.routes[0].geometry.coordinates as [number, number][])
                            .map(([lng, lat]) => [lat, lng] as [number, number]);
                        setOsrmCoords(coords);
                    }
                })
                .catch(() => {});
        }
    }, []);

    // Determine map center
    const mapCenter: [number, number] = hasCustomerLoc
        ? [o.delivery_latitude!, o.delivery_longitude!]
        : hasStoreLoc
            ? [o.store_location!.lat, o.store_location!.lng]
            : [14.28, 120.95];

    // Positions for FitBounds
    const fitPositions: [number, number][] = [];
    if (hasStoreLoc)    fitPositions.push([o.store_location!.lat, o.store_location!.lng]);
    if (hasCustomerLoc) fitPositions.push([o.delivery_latitude!, o.delivery_longitude!]);

    const showMap = hasCustomerLoc || hasStoreLoc;

    // Navigate with Google Maps
    const navHref = hasStoreLoc && hasCustomerLoc
        ? `https://www.google.com/maps/dir/?api=1&origin=${o.store_location!.lat},${o.store_location!.lng}&destination=${o.delivery_latitude},${o.delivery_longitude}`
        : hasCustomerLoc
            ? `https://www.google.com/maps/dir/?api=1&destination=${o.delivery_latitude},${o.delivery_longitude}`
            : null;

    return (
        <div className="mt-3 grid gap-3 rounded-lg border bg-gray-50 p-3 text-sm">
            {/* Customer info + action buttons */}
            {o.customer && (
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Deliver to</p>
                    <p className="font-semibold text-gray-900 text-base">{o.customer.name}</p>
                    <p className="flex items-start gap-1 text-gray-500 mt-0.5 text-xs">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        {[o.customer.address, o.customer.barangay, o.customer.city].filter(Boolean).join(', ') || '—'}
                    </p>
                    {(o.delivery_distance_km || o.estimated_delivery_minutes) && (
                        <p className="mt-0.5 text-xs text-blue-600">
                            {o.delivery_distance_km ? `${o.delivery_distance_km.toFixed(1)} km` : ''}
                            {o.delivery_distance_km && o.estimated_delivery_minutes ? ' · ' : ''}
                            {o.estimated_delivery_minutes ? `~${o.estimated_delivery_minutes} min` : ''}
                        </p>
                    )}
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {o.customer.phone && (
                            <a
                                href={`tel:${o.customer.phone}`}
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Phone className="h-3 w-3" />
                                Call {o.customer.phone}
                            </a>
                        )}
                        {navHref && (
                            <a
                                href={navHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Navigate
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Share location (only for active deliveries) */}
            {isActive && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                            <Navigation className="h-3.5 w-3.5" />
                            Live Location
                        </p>
                        {autoShare && (
                            <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 animate-pulse">
                                <Radio className="h-3 w-3" /> Live tracking active
                            </span>
                        )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={shareOnce}
                            disabled={shareLoading}
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                        >
                            <Locate className={`h-3 w-3 ${shareLoading ? 'animate-spin' : ''}`} />
                            {shareLoading ? 'Getting location…' : 'Share My Location'}
                        </button>

                        <button
                            type="button"
                            onClick={() => toggleAutoShare(!autoShare)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                autoShare
                                    ? 'border-emerald-500 bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <Radio className="h-3 w-3" />
                            {autoShare ? 'Stop Auto-share' : 'Auto-share every 30s'}
                        </button>
                    </div>
                    {lastShared && (
                        <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            Last shared: {lastShared.toLocaleTimeString()}
                        </p>
                    )}
                </div>
            )}

            {/* Route map */}
            {showMap && (
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Route Map
                        {riderPos && <span className="ml-1 text-emerald-600 normal-case font-normal">• Your location shown</span>}
                    </p>
                    <div className="rounded-lg overflow-hidden border border-gray-200 h-52">
                        <MapContainer
                            center={mapCenter}
                            zoom={13}
                            style={{ height: '100%', width: '100%' }}
                            attributionControl={false}
                        >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {fitPositions.length >= 2 && <FitBounds positions={fitPositions} />}
                            {/* Store pin */}
                            {hasStoreLoc && <Marker position={[o.store_location!.lat, o.store_location!.lng]} />}
                            {/* Customer pin */}
                            {hasCustomerLoc && <Marker position={[o.delivery_latitude!, o.delivery_longitude!]} />}
                            {/* Rider pin */}
                            {riderPos && <Marker position={riderPos} />}
                            {/* OSRM road route */}
                            {osrmCoords && (
                                <Polyline positions={osrmCoords} pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.75 }} />
                            )}
                        </MapContainer>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                        {hasStoreLoc && hasCustomerLoc && '● Store → ● Customer'}
                        {riderPos && ' · ● You'}
                    </p>
                </div>
            )}

            {/* Items */}
            <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Items</p>
                <ul className="space-y-1">
                    {o.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between">
                            <span className="text-gray-700">{item.product?.name ?? 'Unknown'} × {item.quantity}</span>
                            <span className="tabular-nums text-gray-500">
                                ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="mt-2 pt-1.5 border-t space-y-1">
                    {o.shipping_fee !== null && o.shipping_fee > 0 && (
                        <div className="flex justify-between text-gray-500 text-xs">
                            <span>Delivery fee</span>
                            <span>₱{o.shipping_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-900">
                        <span>Total</span>
                        <span>₱{o.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* Payment info */}
            <div className="flex items-center justify-between">
                <span className="text-gray-500">{PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_STYLES[o.payment_status] ?? ''}`}>
                    {o.payment_status.charAt(0).toUpperCase() + o.payment_status.slice(1)}
                </span>
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RiderDeliveries({ deliveries, tab, counts, filters }: Props) {
    const flash = (usePage().props as any).flash as { success?: string; error?: string } | undefined;

    const [expanded, setExpanded]           = useState<number | null>(null);
    const [statusTarget, setStatusTarget]   = useState<DeliveryRow | null>(null);
    const [targetStatus, setTargetStatus]   = useState<DeliveryStatus | null>(null);

    const isHistory = tab === 'history';

    function switchTab(newTab: string) {
        router.get('/rider/deliveries', { tab: newTab }, { preserveState: false });
    }

    function openStatusDialog(delivery: DeliveryRow, next: DeliveryStatus) {
        setStatusTarget(delivery);
        setTargetStatus(next);
    }

    function closeStatusDialog() {
        setStatusTarget(null);
        setTargetStatus(null);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Deliveries" />

            <div className="flex flex-col gap-6 p-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Deliveries</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">View and update your assigned deliveries.</p>
                </div>

                {/* Flash */}
                {flash?.success && (
                    <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 border border-emerald-200">
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                        {flash.error}
                    </div>
                )}

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Assigned</CardTitle>
                            <Truck className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.assigned}</div>
                            <p className="text-xs text-muted-foreground">Pending pickup</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Picked Up</CardTitle>
                            <Package className="h-4 w-4 text-indigo-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.picked_up}</div>
                            <p className="text-xs text-muted-foreground">With rider</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
                            <Truck className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.in_transit}</div>
                            <p className="text-xs text-muted-foreground">On the way</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Delivered Today</CardTitle>
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.delivered_today}</div>
                            <p className="text-xs text-muted-foreground">Completed</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-6">
                        <button
                            onClick={() => switchTab('active')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                !isHistory
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => switchTab('history')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                isHistory
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            History
                        </button>
                    </nav>
                </div>

                {/* Deliveries list */}
                {deliveries.data.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <Truck className="mb-3 h-10 w-10" />
                            <p className="font-medium">
                                {isHistory ? 'No delivery history yet' : 'No active deliveries'}
                            </p>
                            <p className="mt-1 text-sm">
                                {isHistory
                                    ? 'Completed and failed deliveries will appear here.'
                                    : 'New deliveries assigned to you will appear here.'
                                }
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {deliveries.data.map((d) => (
                            <Card key={d.id} className="overflow-hidden">
                                <div
                                    className="flex cursor-pointer items-start gap-3 p-4 hover:bg-gray-50/60"
                                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                                >
                                    {/* Status icon */}
                                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                        d.status === 'delivered' ? 'bg-emerald-100' :
                                        d.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                                    }`}>
                                        {d.status === 'delivered' ? (
                                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                                        ) : d.status === 'failed' ? (
                                            <AlertTriangle className="h-4 w-4 text-red-600" />
                                        ) : (
                                            <Truck className="h-4 w-4 text-blue-600" />
                                        )}
                                    </div>

                                    {/* Main info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-sm font-semibold text-blue-600">
                                                {d.order?.order_number ?? '—'}
                                            </span>
                                            <StatusBadge status={d.status} />
                                        </div>
                                        <p className="mt-0.5 font-medium text-gray-900">
                                            {d.order?.customer?.name ?? '—'}
                                        </p>
                                        {d.order?.customer && (
                                            <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                                <MapPin className="h-3 w-3" />
                                                {[
                                                    d.order.customer.address,
                                                    d.order.customer.barangay,
                                                    d.order.customer.city,
                                                ].filter(Boolean).join(', ') || '—'}
                                            </p>
                                        )}
                                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                                            <span>Assigned: {d.assigned_at ?? '—'}</span>
                                            {d.delivered_at && (
                                                <span className="text-emerald-600">Delivered: {fmtDate(d.delivered_at)}</span>
                                            )}
                                        </div>
                                        {d.vehicle && (
                                            <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                                                <Car className="h-3 w-3 shrink-0" />
                                                {d.vehicle.vehicle_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} · {d.vehicle.plate_number}
                                            </p>
                                        )}
                                        {d.notes && d.status === 'failed' && (
                                            <p className="mt-1 flex items-start gap-1 text-xs text-red-500">
                                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                {d.notes}
                                            </p>
                                        )}
                                    </div>

                                    {/* Amount + actions */}
                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                        <span className="font-semibold tabular-nums text-gray-900">
                                            ₱{(d.order?.total_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </span>

                                        {/* Status actions */}
                                        {!isHistory && STATUS_NEXT[d.status].length > 0 && (
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs">
                                                            Update Status
                                                            <ChevronDown className="ml-1 h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <p className="px-2 py-1.5 text-xs text-gray-500 font-medium">Move to</p>
                                                        <DropdownMenuSeparator />
                                                        {STATUS_NEXT[d.status].map((s) => (
                                                            <DropdownMenuItem
                                                                key={s}
                                                                onClick={() => openStatusDialog(d, s)}
                                                                className={s === 'failed' ? 'text-red-600' : ''}
                                                            >
                                                                {STATUS_LABELS[s]}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded detail */}
                                {expanded === d.id && <DeliveryDetailPanel delivery={d} />}
                            </Card>
                        ))}
                    </div>
                )}

                <Pagination
                    data={deliveries}
                    onVisit={(url) => router.visit(url, { preserveState: true })}
                />
            </div>

            <UpdateStatusDialog
                delivery={statusTarget}
                targetStatus={targetStatus}
                onClose={closeStatusDialog}
            />
        </AppLayout>
    );
}
