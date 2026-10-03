import { Head, Link, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Banknote, CreditCard, Crosshair, Handshake, Loader2, MapPin, Navigation, ShieldCheck, ShoppingCart, Store, TicketPercent } from 'lucide-react';
import { formatAddress } from '@/data/cavite-locations';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import AddressSearchMap, { locationFromSaved, type ChangeReason, type DeliveryLocation, type SavedAddress } from '@/components/address-search-map';
import { fetchRoute, PIN_COLORS, pinIcon } from '@/lib/map';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';
import { allocateDiscount, type CouponRules } from '@/lib/coupons';
import TierBadge, { TIER_LABELS, type Tier } from '@/components/tier-badge';
import type { SharedData } from '@/types';

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
    // Backend decides: store allows consignment + loyalty program on + customer's trust score qualifies
    consignment_available: boolean;
    loyalty: {
        loyalty_enabled: boolean;
        tier: Tier | null;
        trust_score: number | null;
        downpayment_percent: number | null;
        consignment_allowed: boolean;
        blocked_reason: 'loyalty_disabled' | 'low_trust' | null;
    };
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
    pin_source?: 'barangay' | 'city' | null;
    pin_message?: string | null;
    address_lat?: number | null;
    address_lng?: number | null;
} | null;

type Props = {
    stores: StoreGroup[];
    customer: CustomerInfo;
    savedAddresses?: SavedAddress[];
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

/** Pins further than this from the chosen address get a non-blocking "check your pin" note. */
const PIN_WARN_KM = 3;

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

/** Store → customer road route via the cached /api/route proxy (null when routing is unavailable). */
async function fetchOsrmRoute(
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
    signal?: AbortSignal,
): Promise<{ coords: [number, number][]; durationMin: number } | null> {
    const r = await fetchRoute([[fromLat, fromLng], [toLat, toLng]], signal);
    return r.ok ? { coords: r.coords, durationMin: r.durationMin ?? 0 } : null;
}

export default function CheckoutPage({ stores, customer, savedAddresses = [] }: Props) {
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

    // Each store's order has its own payment option (and consignment down payment %)
    const [paymentModes, setPaymentModes] = useState<Record<number, PaymentMode>>(
        () => Object.fromEntries(stores.map((sg) => [sg.store_id, 'full' as PaymentMode])),
    );
    const [dpPercents, setDpPercents] = useState<Record<number, number>>(
        () => Object.fromEntries(stores.map((sg) => [sg.store_id, sg.min_down_payment_percent])),
    );
    const [notes, setNotes]             = useState('');
    // Promo coupon (platform or store)
    const [promo, setPromo]             = useState<CouponRules | null>(null);
    const [couponInput, setCouponInput] = useState('');
    const [couponError, setCouponError] = useState<string | null>(null);
    const [applying, setApplying]       = useState(false);

    async function applyCoupon() {
        const code = couponInput.trim();
        if (!code) return;
        setApplying(true);
        setCouponError(null);
        try {
            const res = await axios.post<{ coupon: CouponRules }>('/customer/checkout/coupon', { code });
            setPromo(res.data.coupon);
            setCouponInput('');
        } catch (err) {
            setPromo(null);
            setCouponError(axios.isAxiosError(err) ? (err.response?.data?.error ?? err.response?.data?.message ?? 'Could not apply this coupon.') : 'Could not apply this coupon.');
        }
        setApplying(false);
    }
    // One optional store coupon per store (keyed by store_id)
    const [selectedCoupons, setSelectedCoupons] = useState<Record<number, number | null>>({});
    const [loading, setLoading]         = useState(false);

    // Delivery location: the default saved address (or the profile address, pinned at its barangay).
    // The customer can pick another saved address, search a new one, and drag/tap the pin.
    const [addresses, setAddresses] = useState<SavedAddress[]>(savedAddresses);
    const [delivery, setDelivery] = useState<DeliveryLocation>(() => {
        const def = savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
        return def ? locationFromSaved(def) : {
            addressId: null,
            line: customer?.address ?? '',
            barangay: customer?.barangay ?? '',
            city: customer?.city ?? '',
            lat: customer?.lat ?? null,
            lng: customer?.lng ?? null,
        };
    });
    // Where the chosen address itself is (for "Move pin back") — updated whenever the address changes, not on drags
    const [anchor, setAnchor] = useState<{ lat: number; lng: number } | null>(
        delivery.lat != null && delivery.lng != null ? { lat: delivery.lat, lng: delivery.lng } : null,
    );
    const [pinIsAuto, setPinIsAuto] = useState(savedAddresses.length === 0 && (customer?.pin_source === 'barangay' || customer?.pin_source === 'city'));

    function handleDeliveryChange(next: DeliveryLocation, reason: ChangeReason) {
        setDelivery(next);
        if (reason === 'pin') { setPinIsAuto(false); return; }
        if (next.lat != null && next.lng != null) setAnchor({ lat: next.lat, lng: next.lng });
    }
    const handlePinChange = useCallback((lat: number, lng: number) => {
        setDelivery((d) => ({ ...d, lat, lng }));
        setPinIsAuto(false);
    }, []);

    const pin = delivery.lat != null && delivery.lng != null ? { lat: delivery.lat, lng: delivery.lng } : null;

    // How far the pin has drifted from the chosen address — only a reminder, never blocks the order
    const pinDriftKm = pin && anchor ? haversineKm(anchor.lat, anchor.lng, pin.lat, pin.lng) : null;
    const deliveryText = formatAddress(delivery.line, delivery.barangay, delivery.city);
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
            (pos) => { handlePinChange(+pos.coords.latitude.toFixed(7), +pos.coords.longitude.toFixed(7)); setGpsLoading(false); },
            () => { toast.error('Could not get location. Please click on the map.'); setGpsLoading(false); },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    }

    // Payment options per store. Consignment only when the backend marks it available for
    // THIS store (loyalty program on + customer's trust score qualifies); COD if the store allows it.
    const modesFor = (sg: StoreGroup): PaymentMode[] => [
        'full',
        ...(sg.consignment_available ? (['consignment'] as const) : []),
        ...(sg.allow_cod ? (['cod'] as const) : []),
    ];
    const modeOf = (sg: StoreGroup): PaymentMode => {
        const m = paymentModes[sg.store_id] ?? 'full';
        return modesFor(sg).includes(m) ? m : 'full';
    };
    // Down payment %: tier minimum from the backend, the customer may choose to pay more (max 90%)
    const dpOf = (sg: StoreGroup) => Math.min(90, Math.max(sg.min_down_payment_percent, dpPercents[sg.store_id] ?? sg.min_down_payment_percent));

    // Per-store totals (mirrors CheckoutController@store)
    const baseTotals = stores.map((sg) => {
        const subtotal = sg.items.reduce((s, item) => {
            const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
            return s + price * item.quantity;
        }, 0);
        const dynamic  = distFees[sg.store_id];
        const fee      = dynamic ? dynamic.fee : sg.delivery_fee;
        const coupon   = sg.coupons.find((c) => c.id === selectedCoupons[sg.store_id]) ?? null;
        const discount = coupon ? Math.min(coupon.amount, subtotal) : 0;
        return { store: sg, subtotal, fee, coupon, discount };
    });

    // Promo coupon spread across the orders (recomputed live as delivery fees change)
    const promoCuts = promo
        ? allocateDiscount(promo, Object.fromEntries(baseTotals.map((t) => [t.store.store_id, { product: round2(t.subtotal - t.discount), shipping: t.fee }])))
        : {};
    const promoTotal = round2(Object.values(promoCuts).reduce((s, d) => s + d.total, 0));

    const storeTotals = baseTotals.map((t) => {
        const promoCut = promoCuts[t.store.store_id] ?? { product: 0, shipping: 0, total: 0 };
        const total    = round2(t.subtotal - t.discount + t.fee - promoCut.total);
        const mode     = modeOf(t.store);
        const dpPct    = dpOf(t.store);
        const down     = mode === 'consignment' ? round2(total * dpPct / 100) : 0;
        // Charged online now: full → everything, consignment → down payment, COD → nothing
        const payNow   = mode === 'full' ? total : mode === 'consignment' ? down : 0;
        return { ...t, promoCut, total, mode, dpPct, down, balance: round2(total - down), payNow };
    });

    const grandSubtotal = storeTotals.reduce((s, t) => s + t.subtotal, 0);
    const grandDelivery = storeTotals.reduce((s, t) => s + t.fee, 0);
    const grandDiscount = storeTotals.reduce((s, t) => s + t.discount, 0);
    const grandTotal    = round2(storeTotals.reduce((s, t) => s + t.total, 0));
    const payNowTotal   = round2(storeTotals.reduce((s, t) => s + t.payNow, 0));
    const codTotal      = round2(storeTotals.filter((t) => t.mode === 'cod').reduce((s, t) => s + t.total, 0));
    const balanceTotal  = round2(storeTotals.filter((t) => t.mode === 'consignment').reduce((s, t) => s + t.balance, 0));

    const modeDescription = (sg: StoreGroup, mode: PaymentMode) => ({
        full:        'Pay 100% now via GCash, Maya, Card, or GrabPay',
        consignment: `Pay ${sg.min_down_payment_percent}% down now, settle the balance within ${sg.consignment_due_days} days after delivery`,
        cod:         'Pay in cash to the rider when your order arrives',
    })[mode];

    // Estimated minutes (from OSRM, single store only)
    const estimatedMins = osrmRoute?.durationMin ?? null;

    async function placeOrder() {
        if (delivery.addressId === null && !delivery.line.trim() && !(delivery.barangay && delivery.city)) {
            toast.error('Please complete your delivery address (house no. / street, barangay and city).');
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post<{ checkout_url?: string; redirect_url?: string; error?: string }>(
                '/customer/checkout',
                {
                    payment_modes:              Object.fromEntries(stores.map((sg) => [sg.store_id, modeOf(sg)])),
                    down_payment_percents:      Object.fromEntries(stores.filter((sg) => modeOf(sg) === 'consignment').map((sg) => [sg.store_id, dpOf(sg)])),
                    coupon_ids:                 Object.values(selectedCoupons).filter((id): id is number => !!id),
                    coupon_code:                promo?.code ?? null,
                    notes,
                    delivery_latitude:          pin?.lat ?? null,
                    delivery_longitude:         pin?.lng ?? null,
                    delivery_address:           delivery.line.trim() || null,
                    delivery_barangay:          delivery.barangay || null,
                    delivery_city:              delivery.city || null,
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
                                <p>{deliveryText || formatAddress(customer.address, customer.barangay, customer.city)}</p>
                                {delivery.addressId !== null && (
                                    <p className="text-xs text-gray-500">{addresses.find((a) => a.id === delivery.addressId)?.label ?? 'Saved address'}</p>
                                )}
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

                {/* Delivery location — auto-pinned from the customer's barangay, draggable */}
                {customer && (
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
                                {pin
                                    ? 'Your pin is auto-placed based on your address. Drag it or tap the map to adjust for accuracy.'
                                    : 'Search your address or tap the map to pin your delivery location, or use GPS.'}
                            </p>
                            {pinDriftKm !== null && pinDriftKm > PIN_WARN_KM && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                    <span>
                                        Your pin is {pinDriftKm.toFixed(1)} km from {deliveryText || 'your address'}. Make sure it marks where you want the delivery — you can still place the order.
                                    </span>
                                    <button type="button" className="font-semibold underline"
                                        onClick={() => anchor && handlePinChange(anchor.lat, anchor.lng)}>
                                        Move pin back to my address
                                    </button>
                                </div>
                            )}
                            {customer.pin_message && pinIsAuto && (
                                <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                    {customer.pin_message}
                                </p>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-0 px-4 pb-0">
                            <AddressSearchMap
                                savedAddresses={addresses}
                                value={delivery}
                                onChange={handleDeliveryChange}
                                onSaved={(list) => setAddresses(list)}
                                height="300px"
                                fitTo={stores.filter((sg) => sg.store_lat && sg.store_lng).map((sg) => [sg.store_lat!, sg.store_lng!] as [number, number])}
                            >
                                {/* Store pins */}
                                {stores.filter((sg) => sg.store_lat && sg.store_lng).map((sg) => (
                                    <Marker key={sg.store_id} position={[sg.store_lat!, sg.store_lng!]} icon={pinIcon(PIN_COLORS.store)} />
                                ))}
                                {/* OSRM route (single store only) */}
                                {osrmRoute && (
                                    <Polyline positions={osrmRoute.coords} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }} />
                                )}
                            </AddressSearchMap>
                        </CardContent>
                        <CardContent className="p-0">
                            {/* Distance & fee info per store */}
                            {pin && Object.keys(distFees).length > 0 && (
                                <div className="mt-3 px-4 py-3 space-y-1.5 border-t border-gray-100 bg-blue-50/60 dark:bg-blue-900/10">
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
                                <div className="mt-3 px-4 py-3 text-xs text-gray-400 text-center border-t border-gray-100">
                                    No pin set — flat delivery fee will apply. Your order will still be placed at your barangay for the rider's map.
                                </div>
                            )}
                            <div className="h-3" />
                        </CardContent>
                    </Card>
                )}

                {/* Per-store order summaries */}
                {storeTotals.map(({ store: sg, subtotal: storeSubtotal, fee, discount, promoCut, total, mode, dpPct, down, balance }) => {
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
                                    {promo?.type === 'platform' && (promo.excluded_store_ids ?? []).includes(sg.store_id) && (
                                        <p className="text-xs text-gray-400">This store isn't participating in {promo.code}.</p>
                                    )}
                                    {promo && promoCut.total > 0 && (
                                        <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                                            <span>Coupon {promo.code}{promoCut.shipping > 0 && promoCut.product === 0 ? ' (delivery)' : ''}</span>
                                            <span>−{peso(promoCut.total)}</span>
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

                                {/* Payment option — per store */}
                                <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                                        <CreditCard className="h-4 w-4 text-blue-600" /> Payment Option
                                    </p>
                                    <div className={`grid gap-2 ${modesFor(sg).length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                                        {modesFor(sg).map((m) => {
                                            const { label, icon: Icon } = PAYMENT_MODE_META[m];
                                            const active = mode === m;
                                            return (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setPaymentModes((prev) => ({ ...prev, [sg.store_id]: m }))}
                                                    className={`rounded-xl border-2 p-3 text-left transition-colors ${
                                                        active ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                                    }`}
                                                >
                                                    <div className="mb-1 flex items-center gap-2">
                                                        <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                                                        <span className={`text-sm font-semibold ${active ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{label}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500">{modeDescription(sg, m)}</p>
                                                    {m === 'consignment' && sg.loyalty.tier && (
                                                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                                                            <TierBadge tier={sg.loyalty.tier} size="sm" />
                                                            <span>Your tier: {TIER_LABELS[sg.loyalty.tier]} — Minimum down payment: <strong>{sg.min_down_payment_percent}%</strong></span>
                                                        </p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {sg.allow_consignment && sg.loyalty.blocked_reason === 'low_trust' && (
                                        <p className="mt-2 text-xs text-gray-400">Consignment not available for this store.</p>
                                    )}

                                    {/* Consignment breakdown for THIS store */}
                                    {mode === 'consignment' && (
                                        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
                                            <div className="flex items-center justify-between gap-3">
                                                <label htmlFor={`dp-${sg.store_id}`} className="font-medium text-amber-800 dark:text-amber-300">
                                                    Down payment: {dpPct}%
                                                </label>
                                                <span className="text-xs text-amber-700 dark:text-amber-400">min {sg.min_down_payment_percent}% · max 90%</span>
                                            </div>
                                            <input
                                                id={`dp-${sg.store_id}`}
                                                type="range"
                                                min={sg.min_down_payment_percent}
                                                max={90}
                                                step={5}
                                                value={dpPct}
                                                onChange={(e) => setDpPercents((prev) => ({ ...prev, [sg.store_id]: Number(e.target.value) }))}
                                                className="w-full accent-amber-600"
                                            />
                                            <div className="flex justify-between text-gray-700 dark:text-gray-300">
                                                <span>Order total</span><span className="font-medium">{peso(total)}</span>
                                            </div>
                                            <div className="flex justify-between font-semibold text-blue-700 dark:text-blue-400">
                                                <span>Down payment — pay now</span><span>{peso(down)}</span>
                                            </div>
                                            <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                                <span>Balance — due {sg.consignment_due_days} days after delivery</span><span className="font-medium">{peso(balance)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {mode === 'cod' && (
                                        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                            Prepare <strong>{peso(total)}</strong> in cash for the rider.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Apply coupon */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TicketPercent className="h-4 w-4 text-blue-600" />
                            Apply Coupon
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {promo ? (
                            <div className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-900/20">
                                <div className="text-sm">
                                    {promoTotal > 0 ? (
                                        <p className="font-semibold text-green-800 dark:text-green-300">
                                            ✅ Coupon {promo.code} applied: −{peso(promoTotal)}
                                        </p>
                                    ) : (
                                        <p className="font-semibold text-amber-700">Coupon {promo.code} doesn't reduce this order.</p>
                                    )}
                                    <p className="text-xs text-green-700 dark:text-green-400">
                                        {promo.label}{promo.type === 'store' && promo.store_name ? ` · ${promo.store_name} only` : ''}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">New total: <strong>{peso(grandTotal)}</strong></p>
                                </div>
                                <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => { setPromo(null); setCouponError(null); }}>
                                    Remove
                                </Button>
                            </div>
                        ) : (
                            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}>
                                <input
                                    value={couponInput}
                                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                                    placeholder="Enter coupon code"
                                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                />
                                <Button type="submit" variant="outline" disabled={applying || !couponInput.trim()}>
                                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                                </Button>
                            </form>
                        )}
                        {couponError && (
                            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                                {couponError}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Grand total — shared across all stores */}
                <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
                    <CardContent className="pt-5 pb-4">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                <span>{stores.length > 1 ? `All subtotals (${stores.length} stores)` : 'Subtotal'}</span>
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
                            {promo && promoTotal > 0 && (
                                <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                                    <span>Coupon {promo.code}</span>
                                    <span>−{peso(promoTotal)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-blue-200 dark:border-blue-700 mt-1">
                                <span>Grand Total</span>
                                <span>{peso(grandTotal)}</span>
                            </div>

                            {/* How the grand total gets paid, given each store's payment option */}
                            <div className="mt-2 space-y-1 border-t border-blue-200 pt-2 text-sm dark:border-blue-700">
                                <div className="flex justify-between text-blue-700 dark:text-blue-400">
                                    <span>Pay now online (PayMongo)</span>
                                    <span className="font-semibold">{peso(payNowTotal)}</span>
                                </div>
                                {codTotal > 0 && (
                                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                        <span>Cash on delivery</span>
                                        <span>{peso(codTotal)}</span>
                                    </div>
                                )}
                                {balanceTotal > 0 && (
                                    <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                        <span>Consignment balance (after delivery)</span>
                                        <span>{peso(balanceTotal)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
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
                                {payNowTotal > 0 ? 'Redirecting to payment…' : 'Placing order…'}
                            </>
                        ) : (
                            <>
                                {payNowTotal > 0 ? <CreditCard className="h-4 w-4 mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
                                Place Order{stores.length > 1 ? 's' : ''} — {peso(grandTotal)}
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
