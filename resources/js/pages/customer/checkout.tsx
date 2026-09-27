import { Head, Link, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Banknote, CreditCard, Crosshair, Handshake, Loader2, MapPin, Navigation, ShieldCheck, ShoppingCart, Store, TicketPercent } from 'lucide-react';
import { formatAddress } from '@/data/cavite-locations';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';
import type { SharedData } from '@/types';

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconUrl:      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl:    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
    });
}

type CartItem = {
    product_id: number;
    name: string;
    brand: string;
    weight: string;
    image_url: string | null;
    refill_price: number;
    purchase_price: number;
    transaction_type: 'refill' | 'new_purchase';
    quantity: number;
    stock: number;
};

type StoreGroup = {
    store_id: number;
    store_name: string;
    delivery_fee: number;
    store_lat: number | null;
    store_lng: number | null;
    base_delivery_fee: number | null;
    fee_per_km: number | null;
    max_delivery_radius_km: number | null;
    allow_cod: boolean;
    allow_consignment: boolean;
    min_down_payment_percent: number;
    consignment_due_days: number;
    coupons: StoreCouponOption[];
    items: CartItem[];
};

type StoreCouponOption = {
    id: number;
    code: string;
    amount: number;
    expires_at: string | null;
};

type CustomerInfo = {
    name: string;
    phone: string;
    address: string;
    city: string;
    barangay: string;
    lat: number | null;
    lng: number | null;
} | null;

type Props = {
    stores: StoreGroup[];
    customer: CustomerInfo;
};

type PaymentMode = 'full' | 'consignment' | 'cod';

const PAYMENT_MODE_META: Record<PaymentMode, { label: string; icon: React.ElementType }> = {
    full:        { label: 'Full Payment',     icon: CreditCard },
    consignment: { label: 'Consignment',      icon: Handshake  },
    cod:         { label: 'Cash on Delivery', icon: Banknote   },
};

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcFee(sg: StoreGroup, distKm: number): number {
    const base  = sg.base_delivery_fee ?? 0;
    const perKm = sg.fee_per_km ?? 0;
    if (base <= 0 && perKm <= 0) return sg.delivery_fee;
    return Math.ceil((base + distKm * perKm) / 5) * 5;
}

// Leaflet helpers
function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const key = positions.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (positions.length >= 2) map.fitBounds(positions as any, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

function MapClickHandler({ onPin }: { onPin: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) { onPin(e.latlng.lat, e.latlng.lng); },
    });
    return null;
}

async function fetchOsrmRoute(
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
    signal?: AbortSignal,
): Promise<{ coords: [number, number][]; durationMin: number } | null> {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal });
        const data = await res.json();
        if (data.code !== 'Ok') return null;
        const route = data.routes[0];
        return {
            coords:      route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
            durationMin: Math.round(route.duration / 60),
        };
    } catch {
        return null;
    }
}

export default function CheckoutPage({ stores, customer }: Props) {
    const { auth } = usePage<SharedData>().props;
    const idStatus = auth.user.id_verification_status;

    // Guard: should not reach here (backend redirects), but block just in case
    if (idStatus !== 'verified') {
        return (
            <CustomerLayout title="Checkout">
                <Head title="Checkout — LPG Portal" />
                <div className="max-w-lg mx-auto py-12 text-center">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 dark:border-amber-800 dark:bg-amber-900/20">
                        <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                            Identity Verification Required
                        </h2>
                        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                            You must verify your identity before placing orders.
                            {idStatus === 'pending' && ' Your documents are currently under review.'}
                            {idStatus === 'rejected' && ' Your verification was rejected — please re-upload your documents.'}
                        </p>
                        <Link
                            href="/customer/id-verification"
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                        >
                            <ShieldCheck className="h-4 w-4" />
                            {idStatus === 'rejected' ? 'Re-verify ID' : 'Verify Now'}
                        </Link>
                    </div>
                </div>
            </CustomerLayout>
        );
    }

    const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
    const [notes, setNotes]             = useState('');
    // One optional store coupon per store (keyed by store_id)
    const [selectedCoupons, setSelectedCoupons] = useState<Record<number, number | null>>({});
    const [loading, setLoading]         = useState(false);

    // Map state
    const hasStoreMap = stores.some((sg) => sg.store_lat && sg.store_lng);
    const [pin, setPin]             = useState<{ lat: number; lng: number } | null>(
        customer?.lat && customer?.lng ? { lat: customer.lat, lng: customer.lng } : null,
    );
    const [gpsLoading, setGpsLoading] = useState(false);
    const [osrmRoute, setOsrmRoute]   = useState<{ coords: [number, number][]; durationMin: number } | null>(null);
    const osrmAbortRef = useRef<AbortController | null>(null);

    // Per-store dynamic distances/fees (keyed by store_id)
    const [distFees, setDistFees] = useState<Record<number, { distKm: number; fee: number }>>({});

    useEffect(() => {
        if (!pin) { setDistFees({}); setOsrmRoute(null); return; }

        const newDistFees: Record<number, { distKm: number; fee: number }> = {};
        stores.forEach((sg) => {
            if (sg.store_lat && sg.store_lng) {
                const distKm = haversineKm(sg.store_lat, sg.store_lng, pin.lat, pin.lng);
                newDistFees[sg.store_id] = { distKm, fee: calcFee(sg, distKm) };
            }
        });
        setDistFees(newDistFees);

        // OSRM route for single store only
        if (stores.length === 1 && stores[0].store_lat && stores[0].store_lng) {
            osrmAbortRef.current?.abort();
            const ctrl = new AbortController();
            osrmAbortRef.current = ctrl;
            const sg = stores[0];
            fetchOsrmRoute(sg.store_lat!, sg.store_lng!, pin.lat, pin.lng, ctrl.signal).then((r) => {
                if (r) setOsrmRoute(r);
            });
        } else {
            setOsrmRoute(null);
        }
    }, [pin?.lat, pin?.lng]);

    function useGPS() {
        if (!navigator.geolocation) { toast.error('Geolocation not supported.'); return; }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => { setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); },
            () => { toast.error('Could not get location. Please click on the map.'); setGpsLoading(false); },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    }

    // Payment methods offered = those every store in this checkout allows
    const availableModes: PaymentMode[] = [
        'full',
        ...(stores.every((sg) => sg.allow_consignment) ? (['consignment'] as const) : []),
        ...(stores.every((sg) => sg.allow_cod) ? (['cod'] as const) : []),
    ];
    useEffect(() => {
        if (!availableModes.includes(paymentMode)) setPaymentMode('full');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableModes.join(',')]);

    // Per-store totals (mirrors CheckoutController@store)
    const storeTotals = stores.map((sg) => {
        const subtotal = sg.items.reduce((s, item) => {
            const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
            return s + price * item.quantity;
        }, 0);
        const dynamic  = distFees[sg.store_id];
        const fee      = dynamic ? dynamic.fee : sg.delivery_fee;
        const coupon   = sg.coupons.find((c) => c.id === selectedCoupons[sg.store_id]) ?? null;
        const discount = coupon ? Math.min(coupon.amount, subtotal) : 0;
        const total    = round2(subtotal - discount + fee);
        const down     = round2(total * sg.min_down_payment_percent / 100);
        return { store: sg, subtotal, fee, coupon, discount, total, down, balance: round2(total - down) };
    });

    const grandSubtotal = storeTotals.reduce((s, t) => s + t.subtotal, 0);
    const grandDelivery = storeTotals.reduce((s, t) => s + t.fee, 0);
    const grandDiscount = storeTotals.reduce((s, t) => s + t.discount, 0);
    const grandTotal    = round2(storeTotals.reduce((s, t) => s + t.total, 0));
    const downPayment   = round2(storeTotals.reduce((s, t) => s + t.down, 0));
    const balance       = round2(grandTotal - downPayment);
    const amountDue     = paymentMode === 'consignment' ? downPayment : paymentMode === 'cod' ? 0 : grandTotal;

    const pctValues  = [...new Set(stores.map((sg) => sg.min_down_payment_percent))];
    const dueValues  = [...new Set(stores.map((sg) => sg.consignment_due_days))];
    const pctLabel   = pctValues.length === 1 ? `${pctValues[0]}%` : `${Math.min(...pctValues)}–${Math.max(...pctValues)}%`;
    const dueLabel   = dueValues.length === 1 ? `${dueValues[0]} days` : `${Math.min(...dueValues)}–${Math.max(...dueValues)} days`;

    const modeDescriptions: Record<PaymentMode, string> = {
        full:        'Pay 100% now via GCash, Maya, Card, or GrabPay',
        consignment: `Pay ${pctLabel} down now, settle the balance within ${dueLabel} after delivery`,
        cod:         'Pay in cash to the rider when your order arrives',
    };

    // Estimated minutes (from OSRM, single store only)
    const estimatedMins = osrmRoute?.durationMin ?? null;

    async function placeOrder() {
        setLoading(true);
        try {
            const res = await axios.post<{ checkout_url?: string; redirect_url?: string; error?: string }>(
                '/customer/checkout',
                {
                    payment_mode:               paymentMode,
                    coupon_ids:                 Object.values(selectedCoupons).filter((id): id is number => !!id),
                    notes,
                    delivery_latitude:          pin?.lat  ?? null,
                    delivery_longitude:         pin?.lng  ?? null,
                    estimated_delivery_minutes: estimatedMins,
                },
            );
            if (res.data.redirect_url) {
                window.location.href = res.data.redirect_url;
            } else if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                toast.error(res.data.error ?? 'Unexpected response from server.');
                setLoading(false);
            }
        } catch (err) {
            let msg = 'Checkout failed. Please try again.';
            if (axios.isAxiosError(err)) {
                msg = err.response?.data?.error ?? err.response?.data?.message ?? msg;
            }
            toast.error(msg);
            setLoading(false);
        }
    }

    return (
        <CustomerLayout>
            <Head title="Checkout — LPG Portal" />

            <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Checkout</h1>

                {/* Delivery address */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            Delivery Address
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {customer ? (
                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                                <p className="font-semibold">{customer.name}</p>
                                <p>{customer.phone}</p>
                                <p>{formatAddress(customer.address, customer.barangay, customer.city)}</p>
                            </div>
                        ) : (
                            <div className="text-sm text-amber-700 dark:text-amber-400">
                                No delivery address on file.{' '}
                                <Link href="/customer/profile" className="text-blue-600 underline">
                                    Complete your profile
                                </Link>{' '}
                                to set your address.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Delivery location map */}
                {hasStoreMap && (
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Navigation className="h-4 w-4 text-blue-600" />
                                    Delivery Location
                                </CardTitle>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 text-xs"
                                    onClick={useGPS}
                                    disabled={gpsLoading}
                                >
                                    {gpsLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Crosshair className="h-3.5 w-3.5" />
                                    )}
                                    Use My Current Location
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Click on the map to pin your delivery location, or use GPS.
                            </p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <MapContainer
                                center={pin ? [pin.lat, pin.lng] : (customer?.lat && customer?.lng ? [customer.lat, customer.lng] : [14.28, 120.95])}
                                zoom={13}
                                style={{ height: 300, width: '100%' }}
                                scrollWheelZoom={false}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <MapClickHandler onPin={(lat, lng) => setPin({ lat, lng })} />
                                {/* Store pins */}
                                {stores.filter((sg) => sg.store_lat && sg.store_lng).map((sg) => (
                                    <Marker key={sg.store_id} position={[sg.store_lat!, sg.store_lng!]} />
                                ))}
                                {/* Customer pin */}
                                {pin && <Marker position={[pin.lat, pin.lng]} />}
                                {/* OSRM route (single store only) */}
                                {osrmRoute && (
                                    <Polyline positions={osrmRoute.coords} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }} />
                                )}
                                {/* Auto-fit when both pins present */}
                                {pin && stores.some((sg) => sg.store_lat) && (
                                    <FitBounds positions={[
                                        ...stores.filter((sg) => sg.store_lat && sg.store_lng).map((sg) => [sg.store_lat!, sg.store_lng!] as [number, number]),
                                        [pin.lat, pin.lng],
                                    ]} />
                                )}
                            </MapContainer>
                            {/* Distance & fee info per store */}
                            {pin && Object.keys(distFees).length > 0 && (
                                <div className="px-4 py-3 space-y-1.5 border-t border-gray-100 bg-blue-50/60 dark:bg-blue-900/10">
                                    {stores.filter((sg) => distFees[sg.store_id]).map((sg) => {
                                        const df = distFees[sg.store_id];
                                        return (
                                            <div key={sg.store_id} className="flex items-center justify-between text-sm">
                                                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                                    <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                    {sg.store_name}
                                                    <span className="text-xs text-gray-400">
                                                        {df.distKm.toFixed(1)} km
                                                        {osrmRoute && stores.length === 1 && ` road · ~${osrmRoute.durationMin} min`}
                                                    </span>
                                                </span>
                                                <span className="font-semibold text-blue-700 dark:text-blue-400">
                                                    {df.fee > 0 ? peso(df.fee) : 'Free'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {!pin && (
                                <div className="px-4 py-3 text-xs text-gray-400 text-center border-t border-gray-100">
                                    No pin set — flat delivery fee will apply
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Per-store order summaries */}
                {storeTotals.map(({ store: sg, subtotal: storeSubtotal, fee, discount }) => {
                    return (
                        <Card key={sg.store_id}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Store className="h-4 w-4 text-blue-600" />
                                    {sg.store_name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {sg.items.map(item => {
                                        const unitPrice = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
                                        return (
                                            <div key={item.product_id} className="py-3 flex items-center gap-3">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                                                ) : (
                                                    <div className="h-12 w-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                                                        <ShoppingCart className="h-5 w-5 text-blue-300" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                                                    <p className="text-xs text-gray-500">{item.brand} · {item.weight} · {item.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        {peso(unitPrice * item.quantity)}
                                                    </p>
                                                    <p className="text-xs text-gray-400">×{item.quantity}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-3 space-y-1.5">
                                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                        <span>Subtotal</span>
                                        <span>{peso(storeSubtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                        <span>Delivery fee</span>
                                        <span>{fee > 0 ? peso(fee) : 'Free'}</span>
                                    </div>
                                    {discount > 0 && (
                                        <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                                            <span>Store discount</span>
                                            <span>−{peso(discount)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Store coupons issued to this customer (refund resolutions) */}
                                {sg.coupons.length > 0 && (
                                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
                                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                            <TicketPercent className="h-3.5 w-3.5" />
                                            Your store coupons
                                        </p>
                                        <div className="space-y-1.5">
                                            {sg.coupons.map((c) => {
                                                const checked = selectedCoupons[sg.store_id] === c.id;
                                                return (
                                                    <label key={c.id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                                                        <span className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => setSelectedCoupons((prev) => ({ ...prev, [sg.store_id]: checked ? null : c.id }))}
                                                                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <span className="font-mono text-xs">{c.code}</span>
                                                            {c.expires_at && <span className="text-xs text-gray-400">until {c.expires_at}</span>}
                                                        </span>
                                                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">−{peso(c.amount)}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Grand total */}
                {stores.length > 1 && (
                    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
                        <CardContent className="pt-5 pb-4">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>All subtotals ({stores.length} stores)</span>
                                    <span>{peso(grandSubtotal)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>Total delivery fees</span>
                                    <span>{grandDelivery > 0 ? peso(grandDelivery) : 'Free'}</span>
                                </div>
                                {grandDiscount > 0 && (
                                    <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                                        <span>Store discounts</span>
                                        <span>−{peso(grandDiscount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-blue-200 dark:border-blue-700 mt-1">
                                    <span>Grand Total</span>
                                    <span>{peso(grandTotal)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Payment option */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-blue-600" />
                            Payment Option
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className={`grid gap-3 ${availableModes.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                            {availableModes.map((mode) => {
                                const { label, icon: Icon } = PAYMENT_MODE_META[mode];
                                const active = paymentMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setPaymentMode(mode)}
                                        className={`rounded-xl border-2 p-4 text-left transition-colors ${
                                            active
                                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                                            <span className={`font-semibold text-sm ${active ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                                {label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">{modeDescriptions[mode]}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {availableModes.length < 3 && (
                            <p className="text-xs text-gray-400">
                                {stores.length > 1
                                    ? 'Some payment options are hidden because not every store in this checkout offers them.'
                                    : 'Some payment options are not offered by this store.'}
                            </p>
                        )}

                        {/* Consignment breakdown */}
                        {paymentMode === 'consignment' && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 space-y-2 text-sm">
                                <p className="font-semibold text-amber-800 dark:text-amber-300">Consignment Breakdown</p>
                                <div className="flex justify-between text-gray-700 dark:text-gray-300">
                                    <span>Order Total</span>
                                    <span className="font-medium">{peso(grandTotal)}</span>
                                </div>
                                <div className="flex justify-between text-blue-700 dark:text-blue-400 font-semibold">
                                    <span>Down Payment ({pctLabel}) — Pay Now</span>
                                    <span>{peso(downPayment)}</span>
                                </div>
                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                    <span>Remaining Balance</span>
                                    <span className="font-medium">{peso(balance)}</span>
                                </div>
                                <p className="text-xs text-amber-600 dark:text-amber-500 pt-1 border-t border-amber-200 dark:border-amber-800">
                                    Your order will be delivered after the down payment. Pay the remaining balance online within {dueLabel} after delivery.
                                </p>
                            </div>
                        )}

                        {/* COD note */}
                        {paymentMode === 'cod' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-4 space-y-2 text-sm">
                                <div className="flex justify-between font-semibold text-emerald-800 dark:text-emerald-300">
                                    <span>Cash to prepare on delivery</span>
                                    <span>{peso(grandTotal)}</span>
                                </div>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                    No online payment needed. Please prepare the exact amount for the rider.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Order Notes (optional)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any special instructions for your delivery…"
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                    </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/customer/cart" className="sm:flex-none">
                        <Button variant="outline" className="w-full sm:w-auto">
                            Back to Cart
                        </Button>
                    </Link>
                    <Button
                        onClick={placeOrder}
                        disabled={loading || !customer}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {paymentMode === 'cod' ? 'Placing order…' : 'Redirecting to payment…'}
                            </>
                        ) : paymentMode === 'cod' || amountDue <= 0 ? (
                            <>
                                <Banknote className="h-4 w-4 mr-2" />
                                Place Order{paymentMode === 'cod' ? ` — Pay ${peso(grandTotal)} on Delivery` : ''}
                            </>
                        ) : (
                            <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                {paymentMode === 'consignment'
                                    ? `Pay Down Payment ${peso(downPayment)}`
                                    : `Pay ${peso(amountDue)} — Full Payment`}
                            </>
                        )}
                    </Button>
                </div>
                {!customer && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                        You need to{' '}
                        <Link href="/customer/profile" className="underline font-medium">complete your profile</Link>
                        {' '}before placing an order.
                    </p>
                )}
            </div>
        </CustomerLayout>
    );
}
