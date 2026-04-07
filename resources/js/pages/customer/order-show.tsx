import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Banknote, Camera, CheckCircle2, Circle, Clock, CreditCard, ExternalLink, Loader2, MapPin, Navigation, Star, XCircle } from 'lucide-react';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import CustomerLayout from '@/layouts/customer-layout';

type Payment = {
    id: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    paymongo_checkout_id: string;
    paymongo_payment_id: string | null;
    payment_method: string | null;
    paid_at: string | null;
};

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
    });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const key = positions.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (positions.length >= 2) map.fitBounds(positions as any, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

async function fetchOsrmRoute(
    storeLat: number, storeLng: number,
    custLat: number, custLng: number,
    signal?: AbortSignal,
): Promise<[number, number][] | null> {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${custLng},${custLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal });
        const data = await res.json();
        if (data.code !== 'Ok') return null;
        return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
    } catch {
        return null;
    }
}

type RiderLoc = { latitude: number; longitude: number; at: string } | null;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Colored pin icons ─────────────────────────────────────────────────────────

function makePinIcon(color: string, pulse = false) {
    return L.divIcon({
        html: `<svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 9.5 12 22 12 22S24 21.5 24 12C24 5.373 18.627 0 12 0z"
                  fill="${color}" stroke="white" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="5" fill="white" opacity="0.95"/>
            ${pulse ? `<circle cx="12" cy="12" r="10" fill="${color}" opacity="0.2" style="animation:none"/>` : ''}
        </svg>`,
        className: '',
        iconSize: [24, 34],
        iconAnchor: [12, 34],
        popupAnchor: [0, -36],
    });
}

// Pre-create icons (browser-only, Leaflet is already loaded)
const storeIcon    = makePinIcon('#ef4444');      // red
const customerIcon = makePinIcon('#3b82f6');      // blue
const riderIcon    = makePinIcon('#22c55e', true); // green + pulse ring

// ── TrackingMap ───────────────────────────────────────────────────────────────

function TrackingMap({ order }: { order: Order }) {
    const [osrmCoords, setOsrmCoords] = useState<[number, number][]>([]);
    const [riderLoc, setRiderLoc]     = useState<RiderLoc>(null);
    const abortRef = useRef<AbortController | null>(null);
    const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

    const storeLoc = order.store_location;
    const custLat  = order.delivery_latitude;
    const custLng  = order.delivery_longitude;

    // Fetch OSRM route on mount
    useEffect(() => {
        if (!storeLoc || custLat == null || custLng == null) return;
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        fetchOsrmRoute(storeLoc.lat, storeLoc.lng, custLat, custLng, ctrl.signal).then((coords) => {
            if (coords) setOsrmCoords(coords);
        });
        return () => ctrl.abort();
    }, [storeLoc?.lat, storeLoc?.lng, custLat, custLng]);

    // Poll rider location every 15 seconds
    useEffect(() => {
        async function poll() {
            try {
                const res = await fetch(`/customer/orders/${order.id}/rider-location`, {
                    headers: { 'Accept': 'application/json' },
                });
                if (!res.ok) return;
                const json = await res.json();
                if (json.location) setRiderLoc(json.location);
            } catch { /* silent */ }
        }
        poll();
        pollRef.current = setInterval(poll, 15_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [order.id]);

    if (!storeLoc || custLat == null || custLng == null) return null;

    const storePos:    [number, number] = [storeLoc.lat, storeLoc.lng];
    const customerPos: [number, number] = [custLat, custLng];
    const allPositions: [number, number][] = riderLoc
        ? [storePos, customerPos, [riderLoc.latitude, riderLoc.longitude]]
        : [storePos, customerPos];

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeLoc.lat},${storeLoc.lng}&destination=${custLat},${custLng}`;

    const riderDistKm = riderLoc
        ? haversineKm(riderLoc.latitude, riderLoc.longitude, custLat, custLng)
        : null;

    return (
        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 overflow-hidden">
            {/* Banner */}
            <div className="flex items-center gap-2 px-4 py-3 bg-orange-500 text-white">
                <Navigation className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">Your order is on the way!</p>
                <span className="ml-auto text-xs opacity-90">
                    {riderDistKm != null
                        ? `Rider is ${riderDistKm.toFixed(1)} km away`
                        : order.delivery_distance_km != null
                            ? `${order.delivery_distance_km.toFixed(1)} km${order.estimated_delivery_minutes != null ? ` · ~${order.estimated_delivery_minutes} min` : ''}`
                            : ''}
                </span>
            </div>

            {/* Map */}
            <MapContainer
                center={customerPos}
                zoom={13}
                style={{ height: 260, width: '100%' }}
                scrollWheelZoom={false}
                zoomControl={true}
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <FitBounds positions={allPositions} />
                {/* Store — red pin */}
                <Marker position={storePos} icon={storeIcon} />
                {/* Customer — blue pin */}
                <Marker position={customerPos} icon={customerIcon} />
                {/* Rider — green pin */}
                {riderLoc && (
                    <Marker position={[riderLoc.latitude, riderLoc.longitude]} icon={riderIcon} />
                )}
                {/* Route line */}
                {osrmCoords.length > 0 && (
                    <Polyline positions={osrmCoords} pathOptions={{ color: '#f97316', weight: 4, opacity: 0.8 }} />
                )}
            </MapContainer>

            {/* Legend + footer */}
            <div className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm" />
                        Store
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm" />
                        Your location
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-green-500 border border-white shadow-sm" />
                        {riderLoc ? `Rider (last seen ${new Date(riderLoc.at).toLocaleTimeString()})` : 'Rider (waiting…)'}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-orange-700 dark:text-orange-400">
                        {riderLoc ? '' : 'Rider location will appear when they share it.'}
                    </span>
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400 font-medium hover:underline"
                    >
                        Open Maps <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            </div>
        </div>
    );
}

const CANCEL_REASONS = [
    'Changed my mind',
    'Found a better price',
    'Ordered by mistake',
    'Delivery takes too long',
    'Want to change order details',
    'Other',
];

type StoreLocation = { lat: number; lng: number; name: string };

type Order = {
    id: number;
    order_number: string;
    store_name: string;
    status: string;
    store_location: StoreLocation | null;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    delivery_distance_km: number | null;
    estimated_delivery_minutes: number | null;
    transaction_type: string;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    payment_mode: 'full' | 'installment';
    down_payment_amount: number | null;
    remaining_balance: number | null;
    notes: string | null;
    cancellation_reason: string | null;
    cancellation_notes: string | null;
    cancelled_by: 'customer' | 'seller' | null;
    cancelled_at: string | null;
    ordered_at: string | null;
    delivered_at: string | null;
    created_at: string;
    rated_product_ids: number[];
    items: {
        id: number;
        product_id: number | null;
        quantity: number;
        unit_price: number;
        subtotal: number;
        product: { name: string; brand: string | null } | null;
    }[];
    delivery: {
        status: string;
        rider_name: string | null;
        assigned_at: string | null;
        proofs: {
            status: string;
            photo_url: string | null;
            notes: string | null;
            location_note: string | null;
            created_at: string;
        }[];
    } | null;
    invoice: {
        id: number;
        invoice_number: string;
        payment_status: string;
        paid_amount: number;
        due_date: string | null;
    } | null;
    payment: Payment | null;
};

type Props = { order: Order };

const ORDER_STEPS = [
    { key: 'pending',          label: 'Pending' },
    { key: 'confirmed',        label: 'Confirmed' },
    { key: 'preparing',        label: 'Preparing' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered',        label: 'Delivered' },
];

const STATUS_STYLES: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:        'bg-emerald-100 text-emerald-800',
    cancelled:        'bg-gray-100 text-gray-600',
};

const PAY_STYLES: Record<string, string> = {
    unpaid:     'bg-red-100 text-red-700',
    paid:       'bg-emerald-100 text-emerald-700',
    partial:    'bg-amber-100 text-amber-700',
    to_refund:  'bg-orange-100 text-orange-700',
    refunded:   'bg-gray-100 text-gray-600',
};

const PROOF_STATUS_COLORS: Record<string, string> = {
    picked_up:  'bg-indigo-500',
    in_transit: 'bg-purple-500',
    delivered:  'bg-emerald-500',
    failed:     'bg-red-500',
};

const PROOF_STATUS_LABELS: Record<string, string> = {
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

function DeliveryTimeline({ proofs }: { proofs: NonNullable<Order['delivery']>['proofs'] }) {
    const [lightbox, setLightbox] = useState<string | null>(null);

    if (proofs.length === 0) return null;

    return (
        <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery Updates</p>
            <ol className="relative border-l border-gray-200 pl-5 space-y-4">
                {proofs.map((p, i) => (
                    <li key={i} className="relative">
                        <span className={`absolute -left-[1.3125rem] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${PROOF_STATUS_COLORS[p.status] ?? 'bg-blue-500'}`} />
                        <div className="grid gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {PROOF_STATUS_LABELS[p.status] ?? p.status}
                                </span>
                                <span className="text-xs text-gray-400">{p.created_at}</span>
                            </div>
                            {p.location_note && (
                                <p className="flex items-center gap-1 text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {p.location_note}
                                </p>
                            )}
                            {p.notes && (
                                <p className="text-xs text-gray-500 italic">"{p.notes}"</p>
                            )}
                            {p.photo_url && (
                                <button
                                    type="button"
                                    onClick={() => setLightbox(p.photo_url!)}
                                    className="group relative mt-1 w-24 h-16 overflow-hidden rounded-md border hover:opacity-90 transition-opacity"
                                >
                                    <img src={p.photo_url} alt="Delivery proof" className="h-full w-full object-cover" />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                        <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                                    </span>
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ol>

            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={lightbox}
                        alt="Delivery proof"
                        className="max-h-[90vh] max-w-full rounded-lg object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

function StatusStepper({ status, order }: { status: string; order: Order }) {
    const isCancelled = status === 'cancelled';
    const currentIdx  = ORDER_STEPS.findIndex((s) => s.key === status);

    if (isCancelled) {
        return (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-1">
                <p className="text-sm text-red-700 font-medium">
                    This order was cancelled
                    {order.cancelled_by === 'customer' ? ' by you' : order.cancelled_by === 'seller' ? ' by the seller' : ''}.
                </p>
                {order.cancellation_reason && (
                    <p className="text-sm text-red-600">Reason: {order.cancellation_reason}</p>
                )}
                {order.cancellation_notes && (
                    <p className="text-xs text-red-500 italic">"{order.cancellation_notes}"</p>
                )}
                {order.cancelled_at && (
                    <p className="text-xs text-red-400">Cancelled at {order.cancelled_at}</p>
                )}
                {order.payment_status === 'paid' && (
                    <p className="text-xs text-amber-700 mt-1 pt-1 border-t border-red-200">
                        Your payment will be refunded by the seller.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center w-full overflow-x-auto pb-2">
            {ORDER_STEPS.map((step, idx) => {
                const done    = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none min-w-0">
                        <div className="flex flex-col items-center shrink-0">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                                done    ? 'border-emerald-500 bg-emerald-500' :
                                current ? 'border-blue-600 bg-blue-600' :
                                          'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                            }`}>
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                ) : current ? (
                                    <Clock className="h-4 w-4 text-white" />
                                ) : (
                                    <Circle className="h-4 w-4 text-gray-300" />
                                )}
                            </div>
                            <span className={`mt-1.5 text-xs font-medium text-center whitespace-nowrap ${
                                done || current ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 mb-5 min-w-[20px] ${done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Star selector (interactive, used in rating dialog) ──────────────────────

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className={`text-2xl leading-none transition-transform hover:scale-110 ${
                        (hovered || value) >= star ? 'text-amber-400' : 'text-gray-300'
                    }`}
                >
                    ★
                </button>
            ))}
        </div>
    );
}

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function OrderShow({ order }: Props) {
    const canCancel = ['pending', 'confirmed'].includes(order.status) && order.payment_status !== 'paid';
    const [cancelOpen,     setCancelOpen]      = useState(false);
    const [cancelReason,   setCancelReason]    = useState('');
    const [cancelNotes,    setCancelNotes]     = useState('');
    const [cancelling,     setCancelling]      = useState(false);
    const [payingBalance,  setPayingBalance]   = useState(false);

    const canPayBalance = order.payment_mode === 'installment' && order.payment_status === 'partial';

    async function payBalance() {
        setPayingBalance(true);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(
                `/customer/orders/${order.id}/pay-balance`,
            );
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                toast.error(res.data.error ?? 'Could not start payment.');
                setPayingBalance(false);
            }
        } catch (err) {
            let msg = 'Could not start balance payment. Please try again.';
            if (axios.isAxiosError(err)) {
                msg = err.response?.data?.error ?? err.response?.data?.message ?? msg;
            }
            toast.error(msg);
            setPayingBalance(false);
        }
    }

    function submitCancel() {
        if (!cancelReason) return;
        setCancelling(true);
        router.post(`/customer/orders/${order.id}/cancel`, {
            cancellation_reason: cancelReason,
            cancellation_notes:  cancelNotes,
        }, {
            preserveScroll: true,
            onSuccess: () => { setCancelOpen(false); setCancelReason(''); setCancelNotes(''); },
            onError:   () => toast.error('Failed to cancel order. Please try again.'),
            onFinish:  () => setCancelling(false),
        });
    }

    // Rating state
    const [rateOpen, setRateOpen] = useState(false);
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [ratings, setRatings] = useState<Record<number, { rating: number; review: string }>>({});

    const unratedItems = order.items.filter(
        (i) => i.product_id !== null && !order.rated_product_ids.includes(i.product_id!)
    );
    const canRate = order.status === 'delivered' && unratedItems.length > 0;

    function openRateDialog() {
        const initial: Record<number, { rating: number; review: string }> = {};
        unratedItems.forEach((item) => {
            if (item.product_id) initial[item.product_id] = { rating: 0, review: '' };
        });
        setRatings(initial);
        setRateOpen(true);
    }

    function submitRatings() {
        const payload = Object.entries(ratings)
            .filter(([, v]) => v.rating > 0)
            .map(([productId, v]) => ({
                product_id: parseInt(productId),
                rating: v.rating,
                review: v.review || undefined,
            }));

        if (payload.length === 0) {
            toast.error('Please rate at least one product.');
            return;
        }

        setRatingSubmitting(true);
        router.post(`/customer/orders/${order.id}/rate`, { ratings: payload }, {
            onSuccess: () => { setRateOpen(false); setRatingSubmitting(false); },
            onError:   () => { setRatingSubmitting(false); },
        });
    }

    // Show toast for ?payment=success|cancelled query param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const val = params.get('payment');
        if (val === 'success') {
            toast.success('Payment received! Your order has been updated.');
        } else if (val === 'cancelled') {
            toast.error('Payment was cancelled.');
        }
        if (val) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    return (
        <CustomerLayout>
            <Head title={`Order ${order.order_number} — LPG Portal`} />

            <div className="space-y-6">
                {/* Back + header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/customer/orders">
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Orders
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white font-mono">{order.order_number}</h1>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[order.status] ?? 'bg-gray-100'}`}>
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {canPayBalance && (
                            <Button
                                size="sm"
                                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={payBalance}
                                disabled={payingBalance}
                            >
                                {payingBalance ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CreditCard className="h-4 w-4" />
                                )}
                                Pay Balance {order.remaining_balance ? peso(order.remaining_balance) : ''}
                            </Button>
                        )}
                        {canRate && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={openRateDialog}
                            >
                                <Star className="h-4 w-4" />
                                Rate Products
                            </Button>
                        )}
                        {canCancel && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                                onClick={() => { setCancelReason(''); setCancelNotes(''); setCancelOpen(true); }}
                            >
                                <XCircle className="h-4 w-4" />
                                Cancel Order
                            </Button>
                        )}
                    </div>
                </div>

                {/* Status tracker */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Delivery Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusStepper status={order.status} order={order} />
                        {order.status === 'out_for_delivery' && (
                            <TrackingMap order={order} />
                        )}
                        {order.delivery && (
                            <>
                                <div className="mt-4 pt-4 border-t border-gray-100 grid gap-2 sm:grid-cols-2 text-sm">
                                    {order.delivery.rider_name && (
                                        <div>
                                            <span className="text-gray-500">Rider:</span>{' '}
                                            <span className="font-medium">{order.delivery.rider_name}</span>
                                        </div>
                                    )}
                                    {order.delivery.assigned_at && (
                                        <div>
                                            <span className="text-gray-500">Assigned:</span>{' '}
                                            <span className="font-medium">{order.delivery.assigned_at}</span>
                                        </div>
                                    )}
                                </div>
                                <DeliveryTimeline proofs={order.delivery.proofs} />
                            </>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Items */}
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Order Items</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Product</th>
                                            <th className="px-4 py-3 text-center">Qty</th>
                                            <th className="px-4 py-3 text-right">Unit Price</th>
                                            <th className="px-4 py-3 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {order.items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 dark:text-white">{item.product?.name ?? '—'}</p>
                                                    {item.product?.brand && (
                                                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t bg-gray-50">
                                            <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-700">Total</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                                                ₱{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Details sidebar */}
                    <div className="space-y-4">
                        {/* Order info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Order Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Store</span>
                                    <span className="font-medium text-right">{order.store_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Type</span>
                                    <span className="font-medium">{order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Ordered</span>
                                    <span className="font-medium">{fmtDate(order.ordered_at ?? order.created_at)}</span>
                                </div>
                                {order.delivered_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Delivered</span>
                                        <span className="font-medium">{fmtDate(order.delivered_at)}</span>
                                    </div>
                                )}
                                {order.notes && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">Notes</span>
                                        <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">{order.notes}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Payment info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Payment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                {/* Payment mode */}
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Mode</span>
                                    <span className="flex items-center gap-1 text-xs font-medium">
                                        {order.payment_mode === 'installment' ? (
                                            <><Banknote className="h-3.5 w-3.5 text-amber-500" /> Installment</>
                                        ) : (
                                            <><CreditCard className="h-3.5 w-3.5 text-blue-500" /> Full Payment</>
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? ''}`}>
                                        {order.payment_status === 'to_refund' ? 'To Refund' :
                                         order.payment_status === 'refunded'  ? 'Refunded' :
                                         order.payment_status === 'partial'   ? 'Down Paid' :
                                         order.payment_status}
                                    </span>
                                </div>

                                {/* Installment breakdown */}
                                {order.payment_mode === 'installment' && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-3 py-2 space-y-1 text-xs">
                                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                            <span>Total</span>
                                            <span className="font-medium">{peso(order.total_amount)}</span>
                                        </div>
                                        {order.down_payment_amount !== null && (
                                            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                                <span>Down Payment (paid)</span>
                                                <span className="font-medium">{peso(order.down_payment_amount)}</span>
                                            </div>
                                        )}
                                        {order.payment_status !== 'paid' && order.remaining_balance !== null && order.remaining_balance > 0 && (
                                            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold border-t border-amber-200 dark:border-amber-800 pt-1 mt-1">
                                                <span>Balance Due</span>
                                                <span>{peso(order.remaining_balance)}</span>
                                            </div>
                                        )}
                                        {order.payment_status === 'partial' && (
                                            <p className="text-amber-600 dark:text-amber-400 pt-0.5">
                                                Pay the balance to trigger delivery.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {order.payment_method && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Method</span>
                                        <span className="font-medium capitalize">{order.payment_method.replace('_', ' ')}</span>
                                    </div>
                                )}
                                {order.payment && (
                                    <>
                                        {order.payment.status !== 'paid' && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-500">Payment</span>
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    order.payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                    order.payment.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {order.payment.status}
                                                </span>
                                            </div>
                                        )}
                                        {order.payment.paymongo_payment_id && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-gray-500 shrink-0">Ref #</span>
                                                <span className="font-mono text-xs font-medium text-right break-all">{order.payment.paymongo_payment_id}</span>
                                            </div>
                                        )}
                                        {order.payment.paid_at && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Paid At</span>
                                                <span className="font-medium text-xs">{order.payment.paid_at}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {order.invoice && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Invoice #</span>
                                            <Link href={`/customer/invoices/${order.invoice.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                                                {order.invoice.invoice_number}
                                                <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </div>
                                        {order.invoice.due_date && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Due</span>
                                                <span className="font-medium">{order.invoice.due_date}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
            {/* Cancel Order dialog */}
            <Dialog open={cancelOpen} onOpenChange={(open) => !open && setCancelOpen(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Cancel Order
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                        <p className="text-sm text-gray-600">
                            Cancel order <strong className="font-mono">{order.order_number}</strong>?
                            {order.status === 'confirmed' && ' Stock will be restored to the seller.'}
                        </p>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Reason <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a reason…</option>
                                {CANCEL_REASONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Additional notes <span className="text-gray-400 text-xs">(optional)</span>
                            </label>
                            <textarea
                                value={cancelNotes}
                                onChange={(e) => setCancelNotes(e.target.value)}
                                rows={3}
                                placeholder="Any additional details…"
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>
                        {order.payment_status === 'paid' && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Your order was paid. A refund will be processed by the seller.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
                            Keep Order
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={submitCancel}
                            disabled={cancelling || !cancelReason}
                        >
                            {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rate Products dialog */}
            <Dialog open={rateOpen} onOpenChange={(o) => !o && setRateOpen(false)}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-400" />
                            Rate Products
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        {unratedItems.map((item) => {
                            const pid = item.product_id!;
                            const state = ratings[pid] ?? { rating: 0, review: '' };
                            return (
                                <div key={item.id} className="rounded-lg border border-gray-200 p-4 space-y-3">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                                            {item.product?.name ?? `Product #${pid}`}
                                        </p>
                                        {item.product?.brand && (
                                            <p className="text-xs text-gray-500">{item.product.brand}</p>
                                        )}
                                    </div>
                                    <StarSelector
                                        value={state.rating}
                                        onChange={(v) => setRatings((prev) => ({ ...prev, [pid]: { ...prev[pid], rating: v } }))}
                                    />
                                    <textarea
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                        rows={2}
                                        placeholder="Write a review (optional)…"
                                        value={state.review}
                                        onChange={(e) => setRatings((prev) => ({ ...prev, [pid]: { ...prev[pid], review: e.target.value } }))}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                            disabled={ratingSubmitting || Object.values(ratings).every((v) => v.rating === 0)}
                            onClick={submitRatings}
                        >
                            {ratingSubmitting ? 'Submitting…' : 'Submit Review'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CustomerLayout>
    );
}
