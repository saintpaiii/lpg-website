import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Banknote, Crosshair, Info, Loader2, MapPin, Minus, Navigation, Plus, Search, ShoppingCart, Star, Store as StoreIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import CustomerLayout from '@/layouts/customer-layout';
import { OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';
import { cn } from '@/lib/utils';

type Address = { id: number; label: string; full_text: string; lat: number; lng: number; is_default: boolean };
type Location = { label: string; lat: number; lng: number; address_id: number | null };
type Type = 'refill' | 'new_purchase';
type Sort = 'nearest' | 'cheapest';

type Result = {
    store: { id: number; name: string; logo_url: string | null; area: string; approximate_location: boolean; lat: number; lng: number };
    product: { id: number; name: string; brand: string | null; weight: string; size_label: string; image_url: string | null };
    type: Type;
    quantity: number;
    unit_price: number;
    subtotal: number;
    delivery_fee: number;
    total: number;
    distance_km: number;
    stock_left: number;
    avg_rating: number | null;
    rating_count: number;
    badges: ('Nearest' | 'Cheapest')[];
    allows_cod: boolean;
};

type Size = { kg: number; label: string };
type Summary = { count: number; requested_kg: number; used_kgs: number[]; exact: boolean; message: string | null };

type Props = {
    sizes: Size[];
    brands: string[];
    addresses: Address[];
    default_location: Location | null;
    initial: { size_kg: number | string | null; custom_kg: string | null; brand: string | null; type: string | null; quantity: string | null };
};

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPE_LABEL: Record<Type, string> = { refill: 'Refill', new_purchase: 'New tank' };
const OTHER = 'other';
const kgLabel = (kg: number) => `${Number(kg.toFixed(1))} kg`;
const validCustom = (v: string) => { const n = parseFloat(v); return v.trim() !== '' && !Number.isNaN(n) && n >= 0.5 && n <= 100; };

const selectCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white';

export default function FindStore({ sizes, brands, addresses, default_location, initial }: Props) {
    // Restore the last search from the URL (so Back returns to the same results)
    const qs = useMemo(() => new URLSearchParams(window.location.search), []);
    const pick = (key: string, fallback: string | null) => qs.get(key) ?? fallback;

    // Size: a listed size (its kg as a string) or OTHER with a typed kg.
    // ?weight=11kg from Browse arrives already parsed as initial.size_kg.
    const startKg = parseFloat(pick('size_kg', initial.size_kg != null ? String(initial.size_kg) : null) ?? '');
    const startCustom = pick('custom_kg', initial.custom_kg);
    const startListed = Number.isNaN(startKg) ? undefined : sizes.find((s) => Math.abs(s.kg - startKg) < 0.05);
    const [sizeChoice, setSizeChoice] = useState<string>(() => {
        if (startCustom || (!Number.isNaN(startKg) && !startListed)) return OTHER;
        return String((startListed ?? sizes.find((s) => s.kg === 11) ?? sizes[0])?.kg ?? '');
    });
    const [customKg, setCustomKg] = useState<string>(() => startCustom ?? (!Number.isNaN(startKg) && !startListed ? String(startKg) : ''));
    const isOther = sizeChoice === OTHER;
    const sizeReady = isOther ? validCustom(customKg) : sizeChoice !== '';
    const [brand, setBrand] = useState(pick('brand', initial.brand) ?? '');
    const [type, setType] = useState<Type>(pick('type', initial.type) === 'new_purchase' ? 'new_purchase' : 'refill');
    const [quantity, setQuantity] = useState(() => Math.min(20, Math.max(1, parseInt(pick('quantity', initial.quantity) ?? '1', 10) || 1)));

    const [location, setLocation] = useState<Location | null>(() => {
        const lat = parseFloat(qs.get('lat') ?? ''), lng = parseFloat(qs.get('lng') ?? '');
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            const addr = addresses.find((a) => String(a.id) === qs.get('address'));
            return addr ? { label: addr.full_text, lat: addr.lat, lng: addr.lng, address_id: addr.id } : { label: 'My current location', lat, lng, address_id: null };
        }
        return default_location;
    });
    const [locating, setLocating] = useState(false);
    const [locError, setLocError] = useState<string | null>(null);

    const [sort, setSort] = useState<Sort>(qs.get('sort') === 'cheapest' ? 'cheapest' : 'nearest');
    const [results, setResults] = useState<Result[] | null>(null);
    const [searched, setSearched] = useState<{ quantity: number; sizeText: string; type: Type; place: string } | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [showMap, setShowMap] = useState(false);
    const [adding, setAdding] = useState<number | null>(null);
    const [added, setAdded] = useState<Set<number>>(new Set());
    const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

    async function search(nextSort: Sort = sort) {
        if (!location || !sizeReady) return;
        setLoading(true);
        setError(null);
        setSelected(null);
        const size = isOther ? { custom_kg: parseFloat(customKg) } : { size_kg: parseFloat(sizeChoice) };
        const params = { ...size, brand: brand || undefined, type, quantity, lat: location.lat, lng: location.lng, sort: nextSort };

        // Keep the search in the URL
        const url = new URL(window.location.href);
        url.search = '';
        Object.entries({ ...params, address: location.address_id ?? undefined }).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));
        window.history.replaceState(window.history.state, '', url.toString());

        try {
            const res = await axios.get<{ results: Result[]; summary: Summary }>('/customer/find-store/results', { params });
            setResults(res.data.results);
            setSummary(res.data.summary);
            const used = res.data.summary.used_kgs;
            const sizeText = used.length ? used.map(kgLabel).join(' or ') : kgLabel(res.data.summary.requested_kg);
            setSearched({ quantity, sizeText, type, place: location.address_id ? (addresses.find((a) => a.id === location.address_id)?.label ?? location.label) : location.label });
        } catch (err) {
            setResults(null);
            setSummary(null);
            setError(axios.isAxiosError(err) && err.response?.status === 429
                ? 'Too many searches. Please wait a minute and try again.'
                : axios.isAxiosError(err) && !err.response
                    ? "We couldn't reach the server. Please check your internet connection and try again."
                    : 'Something went wrong while searching. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    // Coming back (or arriving from Browse with a size): run the search right away
    useEffect(() => {
        if (location && sizeReady && (startCustom || !Number.isNaN(startKg))) search();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function changeSort(next: Sort) {
        if (next === sort) return;
        setSort(next);
        if (results) search(next);
    }

    function useCurrentLocation() {
        setLocError(null);
        if (!navigator.geolocation) { setLocError("Couldn't get your location. Pick a saved address instead."); return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => { setLocation({ label: 'My current location', lat: pos.coords.latitude, lng: pos.coords.longitude, address_id: null }); setLocating(false); },
            () => { setLocError("Couldn't get your location. Pick a saved address instead."); setLocating(false); },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    function addToCart(r: Result) {
        setAdding(r.product.id);
        router.post('/customer/cart/add', { product_id: r.product.id, quantity: r.quantity, transaction_type: r.type }, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: (page) => {
                const flash = (page.props as { flash?: { error?: string | null } }).flash;
                if (!flash?.error) setAdded((s) => new Set(s).add(r.product.id));
            },
            onFinish: () => setAdding(null),
        });
    }

    function focusStore(storeId: number, fromMap: boolean) {
        setSelected(storeId);
        if (fromMap) cardRefs.current[storeId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return (
        <CustomerLayout title="Find a Store">
            <Head title="Find a Store — LPG Portal" />

            <div className="space-y-5">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Find a Store</h1>
                    <p className="mt-1 text-sm text-gray-500">Tell us what LPG you need and we'll list the stores that can deliver it to you — nearest first.</p>
                </div>

                {/* What do you need? */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">What do you need?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Size</span>
                                <div className="flex gap-2">
                                    <select className={selectCls} value={sizeChoice} onChange={(e) => setSizeChoice(e.target.value)}>
                                        {sizes.length === 0 && <option value="">No sizes available</option>}
                                        {sizes.map((s) => <option key={s.kg} value={String(s.kg)}>{s.label}</option>)}
                                        <option value={OTHER}>Other size…</option>
                                    </select>
                                    {isOther && (
                                        <div className="relative w-36 shrink-0">
                                            <input type="number" inputMode="decimal" step={0.1} min={0.5} max={100} autoFocus
                                                value={customKg} onChange={(e) => setCustomKg(e.target.value)}
                                                placeholder="Type kg, e.g. 15" aria-label="Size in kg"
                                                className={cn(selectCls, 'pr-9')} />
                                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">kg</span>
                                        </div>
                                    )}
                                </div>
                                {isOther && !validCustom(customKg) && (
                                    <span className="block text-xs text-red-600">Enter a size between 0.5 and 100 kg</span>
                                )}
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Brand</span>
                                <select className={selectCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                                    <option value="">Any brand</option>
                                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </label>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Type</span>
                                <div className="grid grid-cols-2 gap-1 rounded-lg border border-gray-300 p-1 dark:border-gray-700" role="radiogroup" aria-label="Type">
                                    {(['refill', 'new_purchase'] as Type[]).map((t) => (
                                        <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
                                            className={cn('rounded-md px-2 py-1.5 text-sm font-medium', type === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')}>
                                            {TYPE_LABEL[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Quantity</span>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Less">
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setQuantity((q) => Math.min(20, q + 1))} disabled={quantity >= 20} aria-label="More">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Deliver to */}
                        <div className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Deliver to</p>
                            {location ? (
                                <p className="flex items-start gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> {location.label}
                                </p>
                            ) : (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    Add your address first.{' '}
                                    <Link href="/customer/addresses" className="font-medium text-blue-600 hover:underline">Add an address</Link>
                                </p>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                {addresses.length > 0 && (
                                    <select className={cn(selectCls, 'sm:max-w-sm')} aria-label="Saved address"
                                        value={location?.address_id ?? ''}
                                        onChange={(e) => {
                                            const a = addresses.find((x) => String(x.id) === e.target.value);
                                            if (a) { setLocation({ label: a.full_text, lat: a.lat, lng: a.lng, address_id: a.id }); setLocError(null); }
                                        }}>
                                        {location && location.address_id === null && <option value="">{location.label}</option>}
                                        {addresses.map((a) => <option key={a.id} value={a.id}>{a.label}{a.is_default ? ' (default)' : ''} — {a.full_text}</option>)}
                                    </select>
                                )}
                                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={useCurrentLocation} disabled={locating}>
                                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                                    Use my current location
                                </Button>
                            </div>
                            {locError && <p className="text-xs text-red-600">{locError}</p>}
                        </div>

                        <Button className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 sm:w-auto" onClick={() => search()} disabled={!location || !sizeReady || loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Find stores
                        </Button>
                    </CardContent>
                </Card>

                {/* Results */}
                {(loading || results || error) && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {!loading && results && searched && (
                                    <>
                                        {results.length === 1 ? '1 store can' : `${results.length} stores can`} deliver{' '}
                                        <span className="font-medium text-gray-900 dark:text-white">{searched.quantity} × {searched.sizeText} {TYPE_LABEL[searched.type]}</span> to{' '}
                                        <span className="font-medium text-gray-900 dark:text-white">{searched.place}</span>
                                    </>
                                )}
                            </p>
                            <div className="flex items-center gap-2">
                                <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700" role="radiogroup" aria-label="Sort">
                                    {(['nearest', 'cheapest'] as Sort[]).map((s) => (
                                        <button key={s} type="button" role="radio" aria-checked={sort === s} onClick={() => changeSort(s)} disabled={loading}
                                            className={cn('rounded-md px-3 py-1 text-sm font-medium', sort === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')}>
                                            {s === 'nearest' ? 'Nearest' : 'Cheapest'}
                                        </button>
                                    ))}
                                </div>
                                {results && results.length > 0 && (
                                    <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowMap((v) => !v)}>
                                        {showMap ? 'Hide map' : 'Show map'}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {!loading && summary?.message && (
                            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                <Info className="mt-0.5 h-4 w-4 shrink-0" /> {summary.message}
                            </p>
                        )}

                        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

                        {loading && (
                            <div className="space-y-3">
                                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
                            </div>
                        )}

                        {!loading && results && results.length === 0 && (
                            <div className="rounded-xl border border-dashed p-8 text-center">
                                <StoreIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                                <p className="font-medium text-gray-800 dark:text-gray-200">No store can deliver this size to your location right now.</p>
                                <ul className="mt-2 space-y-0.5 text-sm text-gray-500">
                                    <li>Try another brand</li>
                                    <li>Try Any brand</li>
                                    <li>Try a different address</li>
                                </ul>
                            </div>
                        )}

                        {!loading && results && results.length > 0 && location && (
                            <div className="grid gap-4 lg:grid-cols-5">
                                <div className={cn('lg:sticky lg:top-4 lg:order-2 lg:col-span-2 lg:block lg:self-start', showMap ? 'block' : 'hidden')}>
                                    <ResultsMap results={results} customer={[location.lat, location.lng]} selected={selected} onSelect={(id) => focusStore(id, true)} />
                                </div>
                                <ol className="space-y-3 lg:order-1 lg:col-span-3">
                                    {results.map((r, i) => (
                                        <li key={r.store.id}>
                                            <ResultCard
                                                r={r} rank={i + 1}
                                                selected={selected === r.store.id}
                                                adding={adding === r.product.id}
                                                added={added.has(r.product.id)}
                                                cardRef={(el) => { cardRefs.current[r.store.id] = el; }}
                                                onSelect={() => focusStore(r.store.id, false)}
                                                onAdd={() => addToCart(r)}
                                            />
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </CustomerLayout>
    );
}

function ResultCard({ r, rank, selected, adding, added, cardRef, onSelect, onAdd }: {
    r: Result; rank: number; selected: boolean; adding: boolean; added: boolean;
    cardRef: (el: HTMLDivElement | null) => void; onSelect: () => void; onAdd: () => void;
}) {
    return (
        <div ref={cardRef} onClick={onSelect}
            className={cn('rounded-xl border bg-white p-4 transition-shadow dark:bg-gray-900',
                selected ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-gray-200 hover:shadow-sm dark:border-gray-800')}>
            <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">{rank}</span>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {r.store.logo_url
                            ? <img src={r.store.logo_url} alt="" className="h-7 w-7 rounded-full border object-cover" />
                            : <StoreIcon className="h-5 w-5 text-gray-400" />}
                        <span className="font-semibold text-gray-900 dark:text-white">{r.store.name}</span>
                        {r.badges.includes('Nearest') && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">Nearest</span>}
                        {r.badges.includes('Cheapest') && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Cheapest</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Navigation className="h-3.5 w-3.5" /> {r.distance_km.toFixed(1)} km away{r.store.approximate_location && <span className="text-gray-400">(approx. location)</span>}</span>
                        {r.avg_rating !== null && <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {r.avg_rating.toFixed(1)} ({r.rating_count})</span>}
                        <span>In stock: {r.stock_left}</span>
                        {r.allows_cod && <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><Banknote className="h-3.5 w-3.5" /> Cash on delivery available</span>}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="text-sm">
                            <p className="font-medium text-gray-800 dark:text-gray-200">
                                {r.product.name}{r.product.brand ? ` · ${r.product.brand}` : ''}
                                <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">{r.product.size_label}</span>
                            </p>
                            <p className="text-gray-500 tabular-nums">{peso(r.unit_price)} × {r.quantity}</p>
                            <p className="text-gray-500 tabular-nums">Delivery {peso(r.delivery_fee)}</p>
                        </div>
                        <div className="sm:text-right">
                            <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">Total {peso(r.total)}</p>
                            <p className="text-[11px] text-gray-500">Estimated total before coupons</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={onAdd} disabled={adding}>
                            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                            Add to cart
                        </Button>
                        <Link href={`/customer/store/${r.store.id}`}>
                            <Button size="sm" variant="outline">View store</Button>
                        </Link>
                        {added && <Link href="/customer/cart" className="text-sm font-medium text-blue-600 hover:underline">Go to cart</Link>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FitAll({ points }: { points: LatLng[] }) {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join(';');
    useEffect(() => {
        if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    // Leaflet needs a size refresh when the map is first shown (phones: "Show map")
    useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 150); return () => clearTimeout(t); }, [map]);
    return null;
}

function FlyTo({ to }: { to: LatLng | null }) {
    const map = useMap();
    useEffect(() => { if (to) map.panTo(to); }, [to, map]);
    return null;
}

function ResultsMap({ results, customer, selected, onSelect }: { results: Result[]; customer: LatLng; selected: number | null; onSelect: (storeId: number) => void }) {
    const points: LatLng[] = [customer, ...results.map((r) => [r.store.lat, r.store.lng] as LatLng)];
    const sel = results.find((r) => r.store.id === selected);
    return (
        <div className="h-[320px] overflow-hidden rounded-xl border lg:h-[520px]">
            <MapContainer center={customer} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                <FitAll points={points} />
                <FlyTo to={sel ? [sel.store.lat, sel.store.lng] : null} />
                <Marker position={customer} icon={pinIcon(PIN_COLORS.customer)} zIndexOffset={500}>
                    <Tooltip>Deliver here</Tooltip>
                </Marker>
                {results.map((r, i) => (
                    <Marker key={r.store.id} position={[r.store.lat, r.store.lng]}
                        icon={pinIcon(r.store.id === selected ? '#2563eb' : PIN_COLORS.store, i + 1)}
                        zIndexOffset={r.store.id === selected ? 1000 : 0}
                        eventHandlers={{ click: () => onSelect(r.store.id) }}>
                        <Tooltip>{i + 1}. {r.store.name} — {peso(r.total)}</Tooltip>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
