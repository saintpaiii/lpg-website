import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Filter, ImageIcon, MapPin, Pencil, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { StarRating } from '@/components/ui/star-rating';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import CustomerLayout from '@/layouts/customer-layout';
import { formatCity } from '@/data/cavite-locations';

type Product = {
    id: number;
    name: string;
    brand: string;
    weight: string;
    weight_kg: number;
    description: string | null;
    refill_price: number;
    purchase_price: number;
    image_url: string | null;
    stock: number;
    store_id: number;
    store_name: string;
    store_city: string;
    store_barangay: string;
    store_province: string;
    delivery_fee: number;
    avg_rating: number;
    review_count: number;
};

type PaginatedProducts = {
    data: Product[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type Filters = {
    search?: string;
    city?: string;
    brand?: string;
    weight?: string;
    min_price?: string;
    max_price?: string;
    sort?: string;
};

type BannerItem = {
    id: number;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    cta_text: string | null;
    cta_url: string | null;
};

type AdminBannerItem = BannerItem & {
    is_active: boolean;
    display_order: number;
};

type Props = {
    products: PaginatedProducts;
    filters: Filters;
    cities: string[];
    brands: string[];
    weights: string[];
    banners: BannerItem[];
    adminBanners?: AdminBannerItem[];
    isAdminPreview?: boolean;
};

export default function ProductsPage({ products, filters, cities, brands, weights, banners, adminBanners = [], isAdminPreview = false }: Props) {
    const [filterOpen, setFilterOpen] = useState(false);
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort]     = useState(filters.sort ?? 'newest');

    // Add to cart dialog
    const [cartDialog, setCartDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
    const [qty, setQty]               = useState(1);
    const [txType, setTxType]         = useState<'refill' | 'new_purchase'>('refill');

    const [cartSubmitting, setCartSubmitting] = useState(false);
    const [bannerPanelOpen, setBannerPanelOpen] = useState(false);

    function applyFilters(extra: Partial<Filters> = {}) {
        router.get('/customer/products', { search, sort, ...filters, ...extra }, {
            preserveState: true,
            replace: true,
        });
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        applyFilters({ search });
    }

    function clearFilter(key: keyof Filters) {
        const updated = { ...filters, [key]: undefined };
        router.get('/customer/products', { search, sort, ...updated }, { preserveState: true, replace: true });
    }

    function openCartDialog(product: Product) {
        setCartDialog({ open: true, product });
        setQty(1);
        setTxType('refill');
    }

    function addToCart() {
        if (!cartDialog.product || cartSubmitting) return;
        setCartSubmitting(true);
        router.post('/customer/cart/add', {
            product_id:       cartDialog.product.id,
            quantity:         qty,
            transaction_type: txType,
        }, {
            onSuccess: () => {
                setCartSubmitting(false);
                setCartDialog({ open: false, product: null });
            },
            onError: () => {
                setCartSubmitting(false);
                toast.error('Failed to add item to cart.');
            },
        });
    }

    // Carousel state
    const [slide, setSlide] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasBanners = banners.length > 0;

    const nextSlide = useCallback(() => setSlide((s) => (s + 1) % (hasBanners ? banners.length : 1)), [banners.length, hasBanners]);
    const prevSlide = useCallback(() => setSlide((s) => (s - 1 + (hasBanners ? banners.length : 1)) % (hasBanners ? banners.length : 1)), [banners.length, hasBanners]);

    useEffect(() => {
        if (!hasBanners || banners.length <= 1) return;
        timerRef.current = setInterval(nextSlide, 5000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [hasBanners, banners.length, nextSlide]);

    function goToSlide(idx: number) {
        if (timerRef.current) clearInterval(timerRef.current);
        setSlide(idx);
        if (hasBanners && banners.length > 1) {
            timerRef.current = setInterval(nextSlide, 5000);
        }
    }

    const activeFilters = [
        filters.city   && { key: 'city',      label: `City: ${filters.city}` },
        filters.brand  && { key: 'brand',     label: `Brand: ${filters.brand}` },
        filters.weight && { key: 'weight',    label: `Weight: ${filters.weight}` },
        filters.min_price && { key: 'min_price', label: `Min: ₱${filters.min_price}` },
        filters.max_price && { key: 'max_price', label: `Max: ₱${filters.max_price}` },
    ].filter(Boolean) as { key: keyof Filters; label: string }[];

    return (
        <CustomerLayout>
            <Head title="Browse Products — LPG Portal" />

            {/* Hero Carousel */}
            <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 mb-8">
                <div className="relative overflow-hidden" style={{ minHeight: 240 }}>
                    {hasBanners ? (
                        <>
                            {/* Slides */}
                            <div
                                className="flex transition-transform duration-500 ease-in-out"
                                style={{ transform: `translateX(-${slide * 100}%)` }}
                            >
                                {banners.map((b) => (
                                    <div
                                        key={b.id}
                                        className="relative shrink-0 w-full"
                                        style={{ minHeight: 240 }}
                                    >
                                        {b.image_url ? (
                                            <img
                                                src={b.image_url}
                                                alt={b.title ?? ''}
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800" />
                                        )}
                                        {/* Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                                        {/* Content */}
                                        <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 sm:px-10 py-12 sm:py-16 text-center" style={{ minHeight: 240 }}>
                                            {b.title && (
                                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight drop-shadow-lg max-w-2xl">
                                                    {b.title}
                                                </h1>
                                            )}
                                            {b.subtitle && (
                                                <p className="text-blue-100 text-sm sm:text-base max-w-lg drop-shadow">
                                                    {b.subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Prev / Next */}
                            {banners.length > 1 && (
                                <>
                                    <button
                                        onClick={() => { prevSlide(); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = setInterval(nextSlide, 5000); } }}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 p-1.5 text-white transition-colors"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={() => { nextSlide(); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = setInterval(nextSlide, 5000); } }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 p-1.5 text-white transition-colors"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                    {/* Dots */}
                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                                        {banners.map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => goToSlide(i)}
                                                className={`rounded-full transition-all duration-300 ${
                                                    i === slide
                                                        ? 'bg-white w-5 h-2'
                                                        : 'bg-white/50 w-2 h-2 hover:bg-white/80'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        /* Fallback gradient hero */
                        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 dark:from-blue-900 dark:via-blue-800 dark:to-slate-900 px-6 sm:px-10 py-12 sm:py-16 text-center" style={{ minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight drop-shadow">
                                Find the Best LPG Deals in Cavite
                            </h1>
                            <p className="text-blue-100 text-sm sm:text-base mb-7 max-w-lg mx-auto">
                                Browse products from verified sellers near you. Fast delivery, great prices.
                            </p>
                        </div>
                    )}

                    {/* Search overlay (always shown at bottom of hero) */}
                    <div className="relative z-10 bg-white/10 backdrop-blur-sm border-t border-white/10 px-4 sm:px-6 py-3">
                        <form onSubmit={handleSearch} className="max-w-lg mx-auto">
                            <div className="flex rounded-xl overflow-hidden shadow-xl bg-white dark:bg-gray-800">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Search by name, brand, or size…"
                                        className="w-full pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white bg-transparent focus:outline-none placeholder:text-gray-400"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-sm transition-colors"
                                >
                                    Search
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Sort + filter controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
                    {/* Sort */}
                    <select
                        value={sort}
                        onChange={e => { setSort(e.target.value); applyFilters({ sort: e.target.value }); }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                    >
                        <option value="newest">Newest First</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                    </select>
                </div>

                {/* Filter toggle row */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setFilterOpen(v => !v)}
                        className="gap-1.5"
                    >
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilters.length > 0 && (
                            <span className="ml-1 h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                                {activeFilters.length}
                            </span>
                        )}
                    </Button>
                </div>

                {/* Filter panel */}
                {filterOpen && (
                    <Card>
                        <CardContent className="pt-4 pb-4">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">City</label>
                                    <select
                                        value={filters.city ?? ''}
                                        onChange={e => applyFilters({ city: e.target.value || undefined })}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                    >
                                        <option value="">All cities</option>
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Brand</label>
                                    <select
                                        value={filters.brand ?? ''}
                                        onChange={e => applyFilters({ brand: e.target.value || undefined })}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                    >
                                        <option value="">All brands</option>
                                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Size / Weight</label>
                                    <select
                                        value={filters.weight ?? ''}
                                        onChange={e => applyFilters({ weight: e.target.value || undefined })}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                    >
                                        <option value="">All sizes</option>
                                        {weights.map(w => <option key={w} value={w}>{w}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Price Range (Refill ₱)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            placeholder="Min"
                                            value={filters.min_price ?? ''}
                                            onChange={e => applyFilters({ min_price: e.target.value || undefined })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Max"
                                            value={filters.max_price ?? ''}
                                            onChange={e => applyFilters({ max_price: e.target.value || undefined })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Active filter chips */}
                {activeFilters.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {activeFilters.map(f => (
                            <button
                                key={f.key}
                                onClick={() => clearFilter(f.key)}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-medium hover:bg-blue-100 transition-colors"
                            >
                                {f.label}
                                <X className="h-3 w-3" />
                            </button>
                        ))}
                        <button
                            onClick={() => router.get('/customer/products')}
                            className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1 text-xs font-medium hover:bg-gray-200 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>
                )}

                {/* Product grid */}
                {products.data.length === 0 ? (
                    <div className="text-center py-20">
                        <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 font-medium">No products available yet.</p>
                        <p className="text-sm text-gray-400 mt-1">Check back later or try adjusting your filters.</p>
                        <Button variant="outline" className="mt-4" onClick={() => router.get('/customer/products')}>
                            Clear Filters
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                        {products.data.map(p => (
                            <Card
                                key={p.id}
                                className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col cursor-pointer"
                                onClick={() => router.visit(`/customer/products/${p.id}`)}
                            >
                                <div className="relative">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} className="w-full h-40 object-cover" />
                                    ) : (
                                        <div className="w-full h-40 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center">
                                            <ShoppingCart className="h-10 w-10 text-blue-300" />
                                        </div>
                                    )}
                                    {p.stock === 0 && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1 rounded-full">Out of Stock</span>
                                        </div>
                                    )}
                                </div>
                                <CardContent className="p-4 flex flex-col flex-1">
                                    <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight mb-0.5">{p.name}</h3>
                                    <p className="text-xs text-gray-500 mb-2">{p.brand} · {p.weight}</p>
                                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-1.5">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        <button
                                            className="hover:text-blue-600 hover:underline transition-colors text-left"
                                            onClick={(e) => { e.stopPropagation(); router.visit(`/customer/store/${p.store_id}`); }}
                                        >
                                            {p.store_name}
                                        </button>
                                        <span>· {formatCity(p.store_city)}</span>
                                    </div>
                                    <div className="mb-2">
                                        <StarRating value={p.avg_rating} count={p.review_count} size="xs" />
                                    </div>
                                    <div className="mt-auto">
                                        <div className="flex items-end justify-between gap-2 mb-3">
                                            <div>
                                                <p className="text-[10px] text-gray-400">Refill</p>
                                                <p className="font-bold text-blue-600 text-base">
                                                    ₱{p.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400">New purchase</p>
                                                <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                                                    ₱{p.purchase_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                        {p.delivery_fee > 0 && (
                                            <p className="text-[10px] text-gray-400 mb-2">
                                                + ₱{p.delivery_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })} delivery fee
                                            </p>
                                        )}
                                        {isAdminPreview ? (
                                            <div className="w-full rounded-lg bg-gray-100 text-gray-400 text-xs font-medium h-9 flex items-center justify-center gap-1.5 border border-dashed border-gray-300">
                                                <ShoppingCart className="h-3.5 w-3.5" />
                                                Cart disabled in preview
                                            </div>
                                        ) : (
                                            <Button
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-9"
                                                disabled={p.stock === 0}
                                                onClick={(e) => { e.stopPropagation(); openCartDialog(p); }}
                                            >
                                                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                                                Add to Cart
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {products.last_page > 1 && (
                    <div className="flex justify-center gap-1 flex-wrap">
                        {products.links.map((link, i) => (
                            <button
                                key={i}
                                disabled={!link.url}
                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                dangerouslySetInnerHTML={{ __html: link.label }}
                                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                    link.active
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : link.url
                                            ? 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                                            : 'border-gray-200 text-gray-300 cursor-not-allowed'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Add to cart dialog */}
            <Dialog open={cartDialog.open} onOpenChange={open => setCartDialog(v => ({ ...v, open }))}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add to Cart</DialogTitle>
                    </DialogHeader>
                    {cartDialog.product && (
                        <div className="space-y-4">
                            <div className="flex gap-3 items-start">
                                {cartDialog.product.image_url ? (
                                    <img src={cartDialog.product.image_url} alt={cartDialog.product.name} className="h-16 w-16 rounded-lg object-cover shrink-0" />
                                ) : (
                                    <div className="h-16 w-16 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                        <ShoppingCart className="h-6 w-6 text-blue-300" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white">{cartDialog.product.name}</p>
                                    <p className="text-xs text-gray-500">{cartDialog.product.brand} · {cartDialog.product.weight}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{cartDialog.product.store_name}</p>
                                </div>
                            </div>

                            {/* Transaction type */}
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Transaction Type</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['refill', 'new_purchase'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setTxType(t)}
                                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                                txType === t
                                                    ? 'bg-blue-600 border-blue-600 text-white'
                                                    : 'border-gray-200 text-gray-700 hover:border-blue-300 dark:border-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <p>{t === 'refill' ? 'Refill' : 'New Purchase'}</p>
                                            <p className="text-xs mt-0.5 opacity-80">
                                                ₱{(t === 'refill' ? cartDialog.product!.refill_price : cartDialog.product!.purchase_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quantity */}
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Quantity</p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setQty(q => Math.max(1, q - 1))}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        disabled={qty <= 1}
                                    >
                                        −
                                    </button>
                                    <span className="w-10 text-center font-semibold text-gray-900 dark:text-white">{qty}</span>
                                    <button
                                        onClick={() => setQty(q => Math.min(cartDialog.product!.stock, q + 1))}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        disabled={qty >= cartDialog.product.stock}
                                    >
                                        +
                                    </button>
                                    <span className="text-xs text-gray-400">{cartDialog.product.stock} in stock</span>
                                </div>
                            </div>

                            {/* Subtotal */}
                            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Subtotal</span>
                                    <span className="font-bold text-gray-900 dark:text-white">
                                        ₱{((txType === 'refill' ? cartDialog.product.refill_price : cartDialog.product.purchase_price) * qty).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCartDialog({ open: false, product: null })}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={addToCart}
                            disabled={cartSubmitting}
                        >
                            <ShoppingCart className="h-4 w-4 mr-1.5" />
                            Add to Cart
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Floating "Edit Banners" button for admin */}
            {isAdminPreview && (
                <button
                    onClick={() => setBannerPanelOpen(true)}
                    className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                    <ImageIcon className="h-4 w-4" />
                    Edit Banners
                </button>
            )}

            {/* Admin Banner Management Slide-over */}
            {isAdminPreview && bannerPanelOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/30"
                        onClick={() => setBannerPanelOpen(false)}
                    />
                    {/* Panel */}
                    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col">
                        <AdminBannerPanel
                            banners={adminBanners}
                            onClose={() => setBannerPanelOpen(false)}
                        />
                    </div>
                </>
            )}

        </CustomerLayout>
    );
}

// ── Admin Banner Management Panel ────────────────────────────────────────────

type BannerFormData = {
    title: string;
    subtitle: string;
    is_active: boolean;
    display_order: number;
    image: File | null;
};

function AdminBannerPanel({ banners, onClose }: { banners: AdminBannerItem[]; onClose: () => void }) {
    const [mode, setMode]         = useState<'list' | 'create' | 'edit'>('list');
    const [editId, setEditId]     = useState<number | null>(null);
    const [form, setForm]         = useState<BannerFormData>({
        title: '', subtitle: '', is_active: true, display_order: 1, image: null,
    });
    const [preview, setPreview]   = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const sorted = [...banners].sort((a, b) => a.display_order - b.display_order);

    function openCreate() {
        setMode('create');
        setEditId(null);
        setForm({ title: '', subtitle: '', is_active: true, display_order: banners.length + 1, image: null });
        setPreview(null);
    }

    function openEdit(b: AdminBannerItem) {
        setMode('edit');
        setEditId(b.id);
        setForm({ title: b.title ?? '', subtitle: b.subtitle ?? '', is_active: b.is_active, display_order: b.display_order, image: null });
        setPreview(b.image_url);
    }

    function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setForm(f => ({ ...f, image: file }));
        setPreview(URL.createObjectURL(file));
    }

    function handleSubmit() {
        if (submitting) return;
        setSubmitting(true);
        const data: Record<string, unknown> = {
            title:         form.title,
            subtitle:      form.subtitle,
            is_active:     form.is_active ? '1' : '0',
            display_order: String(form.display_order),
        };
        if (form.image) data.image = form.image;

        if (mode === 'create') {
            router.post('/admin/banners', data, {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: () => { setSubmitting(false); setMode('list'); },
                onError:   () => setSubmitting(false),
            });
        } else if (mode === 'edit' && editId) {
            router.post(`/admin/banners/${editId}`, { ...data, _method: 'PUT' }, {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: () => { setSubmitting(false); setMode('list'); },
                onError:   () => setSubmitting(false),
            });
        }
    }

    function handleToggle(id: number) {
        router.patch(`/admin/banners/${id}/toggle`, {}, { preserveScroll: true });
    }

    function handleDelete(id: number) {
        if (!confirm('Delete this banner?')) return;
        router.delete(`/admin/banners/${id}`, { preserveScroll: true });
    }

    function handleReorder(id: number, direction: 'up' | 'down') {
        const list  = [...sorted];
        const idx   = list.findIndex(b => b.id === id);
        const swap  = direction === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= list.length) return;
        [list[idx], list[swap]] = [list[swap], list[idx]];
        router.post('/admin/banners/reorder', { order: list.map(b => b.id) }, { preserveScroll: true });
    }

    // ── Form view (create / edit) ────────────────────────────────────────────
    if (mode === 'create' || mode === 'edit') {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-800 shrink-0">
                    <button onClick={() => setMode('list')} className="text-sm text-blue-600 hover:underline">← Back</button>
                    <h3 className="font-semibold text-sm text-gray-800 dark:text-white">{mode === 'create' ? 'New Banner' : 'Edit Banner'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Image upload */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Banner Image</label>
                        <div
                            className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                            onClick={() => fileRef.current?.click()}
                        >
                            {preview ? (
                                <img src={preview} alt="" className="w-full h-32 object-cover" />
                            ) : (
                                <div className="h-32 flex flex-col items-center justify-center text-gray-400 gap-1">
                                    <ImageIcon className="h-8 w-8" />
                                    <span className="text-xs">Click to upload image</span>
                                </div>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Title</label>
                        <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Headline text" />
                    </div>

                    {/* Subtitle */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Subtitle</label>
                        <input type="text" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Supporting text" />
                    </div>

                    {/* Display order */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Display Order</label>
                        <input type="number" min={1} value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 1 }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    {/* Active */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Active (visible to customers)</span>
                    </label>
                </div>

                <div className="border-t px-4 py-3 flex gap-2 shrink-0">
                    <button onClick={() => setMode('list')}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Save Banner'}
                    </button>
                </div>
            </div>
        );
    }

    // ── List view ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-800 shrink-0">
                <h3 className="font-semibold text-sm text-gray-800 dark:text-white">Banner Management</h3>
                <div className="flex items-center gap-2">
                    <button onClick={openCreate}
                        className="flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 text-xs font-medium transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                        New
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {sorted.length === 0 && (
                    <div className="py-12 text-center text-gray-400 text-sm">
                        No banners yet.
                        <br />
                        <button onClick={openCreate} className="mt-2 text-blue-600 hover:underline text-xs">Add your first banner</button>
                    </div>
                )}
                {sorted.map((b, idx) => (
                    <div key={b.id} className={`flex items-center gap-2 px-3 py-2.5 ${!b.is_active ? 'opacity-60' : ''}`}>
                        {/* Thumbnail */}
                        <div className="shrink-0 h-11 w-16 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                            {b.image_url
                                ? <img src={b.image_url} alt="" className="h-full w-full object-cover" />
                                : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-gray-300" /></div>
                            }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{b.title || '(no title)'}</p>
                            <p className="text-[10px] text-gray-400 truncate">{b.subtitle || '—'}</p>
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {b.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>

                        {/* Up / down */}
                        <div className="flex flex-col items-center gap-0.5 shrink-0 text-gray-400">
                            <button onClick={() => handleReorder(b.id, 'up')} disabled={idx === 0}
                                className="h-5 w-5 flex items-center justify-center hover:text-gray-700 disabled:opacity-20 text-xs leading-none transition-colors">▲</button>
                            <button onClick={() => handleReorder(b.id, 'down')} disabled={idx === sorted.length - 1}
                                className="h-5 w-5 flex items-center justify-center hover:text-gray-700 disabled:opacity-20 text-xs leading-none transition-colors">▼</button>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleToggle(b.id)} title={b.is_active ? 'Deactivate' : 'Activate'}
                                className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                {b.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => openEdit(b)}
                                className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(b.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-md border border-red-100 text-red-400 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/30 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
