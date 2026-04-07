import { Head, router, usePage } from '@inertiajs/react';
import { CreditCard, MapPin, Minus, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import CustomerLayout from '@/layouts/customer-layout';
import { formatAddress } from '@/data/cavite-locations';
import type { FormEvent } from 'react';

type TransactionType = 'refill' | 'new_purchase';
type PaymentType = 'cod' | 'online';

type Product = {
    id: number;
    name: string;
    brand: string | null;
    weight_kg: number;
    selling_price: number;
    stock: number;
};

type CartItem = {
    product: Product;
    quantity: number;
};

type StoreDelivery = {
    latitude: number | null;
    longitude: number | null;
    base_delivery_fee: number;
    fee_per_km: number;
    max_delivery_radius_km: number;
};

type Props = {
    products: Product[];
    defaultAddress: { address: string; city: string; barangay: string; lat: number | null; lng: number | null } | null;
    storeDelivery: StoreDelivery | null;
};

// ── Haversine (client-side mirror of PHP version) ──────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcDeliveryFee(distKm: number, base: number, perKm: number): number {
    return Math.ceil((base + distKm * perKm) / 5) * 5;
}

// ── Map click handler (ref-based to avoid stale closures) ─────────────────────

function MapClickHandler({ onPickRef }: { onPickRef: React.RefObject<((lat: number, lng: number) => void) | null> }) {
    useMapEvents({
        click(e: LeafletMouseEvent) {
            onPickRef.current?.(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// ── FitBounds — auto-zoom the map to include both pins ────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length >= 2) {
            map.fitBounds(positions as any, { padding: [30, 30] });
        }
    }, [positions.map(p => p.join(',')).join('|')]);
    return null;
}

// ── OSRM fetch helper ──────────────────────────────────────────────────────────

async function fetchOsrmRoute(
    storeLat: number, storeLng: number,
    custLat: number, custLng: number,
    signal?: AbortSignal,
): Promise<{ coords: [number, number][]; distanceKm: number; durationMin: number } | null> {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${custLng},${custLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal });
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length) return null;
        const route = data.routes[0];
        return {
            coords:      (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
            distanceKm:  route.distance / 1000,
            durationMin: Math.round(route.duration / 60),
        };
    } catch {
        return null;
    }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrderCreate({ products, defaultAddress, storeDelivery }: Props) {
    const errors = (usePage().props as any).errors as Record<string, string> | undefined;
    const [cart, setCart]               = useState<CartItem[]>([]);
    const [qtyInputs, setQtyInputs]     = useState<Record<number, number>>({});
    const [transactionType, setTransactionType] = useState<TransactionType>('refill');
    const [paymentType, setPaymentType] = useState<PaymentType>('cod');
    const [notes, setNotes]             = useState('');
    const [processing, setProcessing]   = useState(false);

    // Delivery location pin
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
        defaultAddress?.lat && defaultAddress?.lng
            ? { lat: defaultAddress.lat, lng: defaultAddress.lng }
            : null,
    );

    const onPickRef = useRef<((lat: number, lng: number) => void) | null>(null);
    onPickRef.current = (lat, lng) => setPin({ lat, lng });

    // OSRM route state
    const [osrmRoute, setOsrmRoute] = useState<{ coords: [number, number][]; distanceKm: number; durationMin: number } | null>(null);
    const [osrmLoading, setOsrmLoading] = useState(false);

    // Fetch OSRM road route whenever pin changes (and store has coords)
    useEffect(() => {
        if (!storeDelivery?.latitude || !storeDelivery?.longitude || !pin) {
            setOsrmRoute(null);
            return;
        }
        const abort = new AbortController();
        setOsrmLoading(true);
        fetchOsrmRoute(storeDelivery.latitude, storeDelivery.longitude, pin.lat, pin.lng, abort.signal)
            .then((r) => { if (r) setOsrmRoute(r); else setOsrmRoute(null); })
            .finally(() => setOsrmLoading(false));
        return () => abort.abort();
    }, [pin?.lat, pin?.lng, storeDelivery?.latitude, storeDelivery?.longitude]);

    // Fix Leaflet default icon paths
    useEffect(() => {
        import('leaflet').then((L) => {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
        });
    }, []);

    // Derived delivery fee — prefer OSRM road distance, fall back to haversine
    const haversineDist = (storeDelivery?.latitude && storeDelivery?.longitude && pin)
        ? haversineKm(storeDelivery.latitude, storeDelivery.longitude, pin.lat, pin.lng)
        : null;
    const distKm = osrmRoute?.distanceKm ?? haversineDist;

    const outOfRadius = distKm !== null && storeDelivery !== null
        && distKm > storeDelivery.max_delivery_radius_km;

    const deliveryFee = (() => {
        if (!storeDelivery) return 0;
        if (distKm !== null) return calcDeliveryFee(distKm, storeDelivery.base_delivery_fee, storeDelivery.fee_per_km);
        return storeDelivery.base_delivery_fee; // flat base when no pin
    })();

    const productsTotal = cart.reduce((sum, c) => sum + c.product.selling_price * c.quantity, 0);
    const grandTotal    = productsTotal + deliveryFee;

    // Map center
    const mapCenter: [number, number] = pin
        ? [pin.lat, pin.lng]
        : storeDelivery?.latitude && storeDelivery?.longitude
            ? [storeDelivery.latitude, storeDelivery.longitude]
            : [14.4791, 120.8980];

    function getQty(productId: number) { return qtyInputs[productId] ?? 1; }

    function addToCart(product: Product) {
        const qty = getQty(product.id);
        setCart((prev) => {
            const existing = prev.find((c) => c.product.id === product.id);
            if (existing) {
                return prev.map((c) =>
                    c.product.id === product.id
                        ? { ...c, quantity: Math.min(c.quantity + qty, product.stock) }
                        : c
                );
            }
            return [...prev, { product, quantity: Math.min(qty, product.stock) }];
        });
    }

    function removeFromCart(productId: number) {
        setCart((prev) => prev.filter((c) => c.product.id !== productId));
    }

    function updateCartQty(productId: number, qty: number) {
        const product = products.find((p) => p.id === productId);
        if (!product) return;
        const clamped = Math.max(1, Math.min(qty, product.stock));
        setCart((prev) =>
            prev.map((c) => (c.product.id === productId ? { ...c, quantity: clamped } : c))
        );
    }

    function getCsrfToken(): string {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (cart.length === 0) return;
        if (outOfRadius) return;
        setProcessing(true);

        const payload = {
            transaction_type:            transactionType,
            payment_type:                paymentType,
            notes,
            delivery_latitude:           pin?.lat ?? null,
            delivery_longitude:          pin?.lng ?? null,
            delivery_distance_km:        osrmRoute?.distanceKm ?? distKm ?? null,
            estimated_delivery_minutes:  osrmRoute?.durationMin ?? null,
            items: cart.map((c) => ({ product_id: c.product.id, quantity: c.quantity })),
        };

        if (paymentType === 'cod') {
            router.post('/customer/orders', payload, {
                onFinish: () => setProcessing(false),
            });
        } else {
            fetch('/customer/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify(payload),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.checkout_url) {
                        window.location.href = data.checkout_url;
                    } else {
                        toast.error(data.error ?? 'Payment failed. Please try again.');
                        setProcessing(false);
                    }
                })
                .catch(() => {
                    toast.error('Network error. Please try again.');
                    setProcessing(false);
                });
        }
    }

    return (
        <CustomerLayout title="Place New Order">
            <Head title="Place Order — LPG Portal" />

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Product catalog */}
                <div className="lg:col-span-2 space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Available Products</h2>
                        <p className="text-sm text-gray-500">Click &quot;Add to Cart&quot; to select a product.</p>
                    </div>

                    {products.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-gray-400">
                                No products available at this time.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {products.map((product) => {
                                const inCart    = cart.find((c) => c.product.id === product.id);
                                const outOfStock = product.stock <= 0;
                                return (
                                    <Card key={product.id} className={`overflow-hidden transition-shadow hover:shadow-md ${outOfStock ? 'opacity-60' : ''}`}>
                                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                                            <p className="font-semibold text-white text-base">{product.name}</p>
                                            {product.brand && (
                                                <p className="text-blue-200 text-xs mt-0.5">{product.brand}</p>
                                            )}
                                        </div>
                                        <CardContent className="pt-4">
                                            <div className="flex justify-between items-center mb-3">
                                                <div>
                                                    <p className="text-xs text-gray-500">Weight</p>
                                                    <p className="font-semibold text-gray-900 dark:text-white">{product.weight_kg} kg</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">Price</p>
                                                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                                                        ₱{product.selling_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                            </div>

                                            <p className={`text-xs mb-3 ${product.stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
                                            </p>

                                            {!outOfStock && (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                                                        <button
                                                            type="button"
                                                            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
                                                            onClick={() => setQtyInputs((q) => ({ ...q, [product.id]: Math.max(1, (q[product.id] ?? 1) - 1) }))}
                                                        >
                                                            <Minus className="h-3.5 w-3.5" />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={product.stock}
                                                            value={getQty(product.id)}
                                                            onChange={(e) => setQtyInputs((q) => ({ ...q, [product.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                            className="w-10 text-center text-sm border-0 bg-transparent focus:outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
                                                            onClick={() => setQtyInputs((q) => ({ ...q, [product.id]: Math.min(product.stock, (q[product.id] ?? 1) + 1) }))}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className={`flex-1 text-xs font-semibold ${inCart ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                                        onClick={() => addToCart(product)}
                                                    >
                                                        <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                                                        {inCart ? 'Add More' : 'Add to Cart'}
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Cart + Order form */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Order</h2>

                    {/* Cart items */}
                    <Card>
                        <CardContent className="pt-4">
                            {cart.length === 0 ? (
                                <div className="py-8 text-center text-gray-400">
                                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">No items yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {cart.map((item) => (
                                        <div key={item.product.id} className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product.name}</p>
                                                <p className="text-xs text-gray-500">₱{item.product.selling_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })} each</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    className="h-6 w-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                                                    onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                                                <button
                                                    type="button"
                                                    className="h-6 w-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                                                    onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="h-6 w-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 ml-1"
                                                    onClick={() => removeFromCart(item.product.id)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {cart.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                                    <div className="flex justify-between text-sm text-gray-600">
                                        <span>Products</span>
                                        <span>₱{productsTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600">
                                        <span className="flex items-center gap-1">
                                            <Truck className="h-3.5 w-3.5" />
                                            Delivery
                                            {distKm !== null && !outOfRadius && (
                                                <span className="text-xs text-gray-400">
                                                    ({distKm.toFixed(1)} km{osrmRoute ? ` · ~${osrmRoute.durationMin} min` : ''})
                                                </span>
                                            )}
                                        </span>
                                        {outOfRadius ? (
                                            <span className="text-red-500 text-xs font-medium">Out of range</span>
                                        ) : (
                                            <span>₱{deliveryFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                        )}
                                    </div>
                                    {distKm !== null && !outOfRadius && storeDelivery && (
                                        <p className="text-xs text-gray-400">
                                            ₱{storeDelivery.base_delivery_fee} base + ₱{(deliveryFee - storeDelivery.base_delivery_fee).toFixed(0)} distance
                                        </p>
                                    )}
                                    <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-gray-100">
                                        <span>Total</span>
                                        <span>₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Order details form */}
                    <Card>
                        <CardContent className="pt-4 space-y-4">
                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium">Transaction Type</Label>
                                <div className="flex gap-3">
                                    {(['refill', 'new_purchase'] as const).map((v) => (
                                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="transaction_type"
                                                value={v}
                                                checked={transactionType === v}
                                                onChange={() => setTransactionType(v)}
                                                className="accent-blue-600"
                                            />
                                            <span className="text-sm">{v === 'refill' ? 'Refill' : 'New Purchase'}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium">Payment Method</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('cod')}
                                        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors ${
                                            paymentType === 'cod'
                                                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <Truck className="h-5 w-5" />
                                        <span>Cash on Delivery</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('online')}
                                        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors ${
                                            paymentType === 'online'
                                                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <CreditCard className="h-5 w-5" />
                                        <span>Pay Online</span>
                                    </button>
                                </div>
                                {paymentType === 'online' && (
                                    <p className="text-xs text-blue-600">
                                        GCash, Maya, Card &amp; GrabPay accepted via PayMongo secure checkout.
                                    </p>
                                )}
                                {errors?.payment_type && (
                                    <p className="text-xs text-red-500">{errors.payment_type}</p>
                                )}
                            </div>

                            {defaultAddress && (
                                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-300">
                                    <p className="font-semibold mb-0.5">Delivery address:</p>
                                    <p>{formatAddress(defaultAddress.address, defaultAddress.barangay, defaultAddress.city)}</p>
                                </div>
                            )}

                            {/* Delivery location map */}
                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-blue-600" />
                                    Delivery Location
                                    {!storeDelivery?.latitude && (
                                        <span className="text-xs font-normal text-muted-foreground">(not required)</span>
                                    )}
                                </Label>
                                <div className="rounded-lg overflow-hidden border border-gray-200 h-52">
                                    <MapContainer
                                        center={mapCenter}
                                        zoom={pin ? 14 : 12}
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <MapClickHandler onPickRef={onPickRef} />
                                        {/* Auto-fit when both pins exist */}
                                        {storeDelivery?.latitude && storeDelivery?.longitude && pin && (
                                            <FitBounds positions={[
                                                [storeDelivery.latitude, storeDelivery.longitude],
                                                [pin.lat, pin.lng],
                                            ]} />
                                        )}
                                        {/* Store pin + delivery radius */}
                                        {storeDelivery?.latitude && storeDelivery?.longitude && (
                                            <>
                                                <Marker position={[storeDelivery.latitude, storeDelivery.longitude]} />
                                                <Circle
                                                    center={[storeDelivery.latitude, storeDelivery.longitude]}
                                                    radius={storeDelivery.max_delivery_radius_km * 1000}
                                                    pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1, dashArray: '4' }}
                                                />
                                            </>
                                        )}
                                        {/* Customer pin */}
                                        {pin && <Marker position={[pin.lat, pin.lng]} />}
                                        {/* OSRM road route polyline */}
                                        {osrmRoute && (
                                            <Polyline
                                                positions={osrmRoute.coords}
                                                pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.7 }}
                                            />
                                        )}
                                    </MapContainer>
                                </div>
                                {pin ? (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3 text-emerald-500" />
                                                {osrmLoading ? 'Calculating route…' : osrmRoute
                                                    ? `${osrmRoute.distanceKm.toFixed(1)} km road · ~${osrmRoute.durationMin} min`
                                                    : distKm ? `${distKm.toFixed(1)} km (straight line)` : 'Pinned'}
                                            </span>
                                            <button type="button" className="text-red-500 underline" onClick={() => { setPin(null); setOsrmRoute(null); }}>
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">Click the map to pin your delivery location.</p>
                                )}
                                {outOfRadius && storeDelivery && (
                                    <p className="text-xs text-red-500 font-medium">
                                        This store does not deliver to your area ({distKm!.toFixed(1)} km away, max {storeDelivery.max_delivery_radius_km} km).
                                    </p>
                                )}
                                {errors?.delivery_latitude && (
                                    <p className="text-xs text-red-500">{errors.delivery_latitude}</p>
                                )}
                            </div>

                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium">Notes (optional)</Label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Special instructions, gate code, etc."
                                    rows={3}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <form onSubmit={handleSubmit}>
                        {errors?.items && (
                            <p className="text-xs text-red-500 mb-2">{errors.items}</p>
                        )}
                        <Button
                            type="submit"
                            disabled={processing || cart.length === 0 || outOfRadius}
                            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                        >
                            {processing
                                ? (paymentType === 'online' ? 'Redirecting to payment…' : 'Placing Order…')
                                : (paymentType === 'online'
                                    ? `Pay Online — ₱${grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                                    : `Place Order — ₱${grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
                            }
                        </Button>
                        {cart.length === 0 && (
                            <p className="text-xs text-center text-gray-400 mt-2">Add at least one product to place an order.</p>
                        )}
                        {outOfRadius && (
                            <p className="text-xs text-center text-red-500 mt-2">Your location is outside the delivery area.</p>
                        )}
                    </form>
                </div>
            </div>
        </CustomerLayout>
    );
}
