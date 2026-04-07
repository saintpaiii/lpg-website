import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { Banknote, CreditCard, Crosshair, Loader2, MapPin, Navigation, ShoppingCart, Store } from 'lucide-react';
import { formatAddress } from '@/data/cavite-locations';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

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
    items: CartItem[];
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

type PaymentMode = 'full' | 'installment';

const PAYMENT_MODES: { value: PaymentMode; label: string; description: string; icon: React.ElementType }[] = [
    {
        value: 'full',
        label: 'Full Payment',
        description: 'Pay 100% upfront via GCash, Maya, Card, or GrabPay',
        icon: CreditCard,
    },
    {
        value: 'installment',
        label: 'Installment (50% Down)',
        description: 'Pay 50% now, settle remaining balance before delivery',
        icon: Banknote,
    },
];

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
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
    const [notes, setNotes]             = useState('');
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

    const grandSubtotal = stores.reduce((sum, sg) =>
        sum + sg.items.reduce((s, item) => {
            const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
            return s + price * item.quantity;
        }, 0), 0);

    const grandDelivery = stores.reduce((sum, sg) => {
        const dynamic = distFees[sg.store_id];
        return sum + (dynamic ? dynamic.fee : sg.delivery_fee);
    }, 0);
    const grandTotal    = grandSubtotal + grandDelivery;
    const downPayment   = Math.round(grandTotal * 0.5 * 100) / 100;
    const balance       = Math.round((grandTotal - downPayment) * 100) / 100;

    // Estimated minutes (from OSRM, single store only)
    const estimatedMins = osrmRoute?.durationMin ?? null;

    async function placeOrder() {
        setLoading(true);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(
                '/customer/checkout',
                {
                    payment_mode:               paymentMode,
                    notes,
                    delivery_latitude:          pin?.lat  ?? null,
                    delivery_longitude:         pin?.lng  ?? null,
                    estimated_delivery_minutes: estimatedMins,
                },
            );
            if (res.data.checkout_url) {
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
                {stores.map(sg => {
                    const storeSubtotal = sg.items.reduce((sum, item) => {
                        const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
                        return sum + price * item.quantity;
                    }, 0);

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
                                        <span>
                                            {(() => {
                                                const dynamic = distFees[sg.store_id];
                                                const fee = dynamic ? dynamic.fee : sg.delivery_fee;
                                                return fee > 0 ? peso(fee) : 'Free';
                                            })()}
                                        </span>
                                    </div>
                                </div>
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
                                <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-blue-200 dark:border-blue-700 mt-1">
                                    <span>Grand Total</span>
                                    <span>{peso(grandTotal)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Payment mode */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-blue-600" />
                            Payment Option
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {PAYMENT_MODES.map(m => {
                                const Icon = m.icon;
                                const active = paymentMode === m.value;
                                return (
                                    <button
                                        key={m.value}
                                        onClick={() => setPaymentMode(m.value)}
                                        className={`rounded-xl border-2 p-4 text-left transition-colors ${
                                            active
                                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                                            <span className={`font-semibold text-sm ${active ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                                {m.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">{m.description}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Installment breakdown */}
                        {paymentMode === 'installment' && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 space-y-2 text-sm">
                                <p className="font-semibold text-amber-800 dark:text-amber-300">Installment Breakdown</p>
                                <div className="flex justify-between text-gray-700 dark:text-gray-300">
                                    <span>Order Total</span>
                                    <span className="font-medium">{peso(grandTotal)}</span>
                                </div>
                                <div className="flex justify-between text-blue-700 dark:text-blue-400 font-semibold">
                                    <span>Down Payment (50%) — Pay Now</span>
                                    <span>{peso(downPayment)}</span>
                                </div>
                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                    <span>Remaining Balance</span>
                                    <span className="font-medium">{peso(balance)}</span>
                                </div>
                                <p className="text-xs text-amber-600 dark:text-amber-500 pt-1 border-t border-amber-200 dark:border-amber-800">
                                    The remaining balance must be paid before the rider is dispatched.
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
                                Redirecting to payment…
                            </>
                        ) : (
                            <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                {paymentMode === 'installment'
                                    ? `Pay Down Payment ${peso(downPayment)}`
                                    : `Pay ${peso(grandTotal)} — Full Payment`}
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
