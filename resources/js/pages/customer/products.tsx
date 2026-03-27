import { Head, router } from '@inertiajs/react';
import { Filter, MapPin, Search, ShoppingCart, X } from 'lucide-react';
import { StarRating } from '@/components/ui/star-rating';
import { useState } from 'react';
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

type Props = {
    products: PaginatedProducts;
    filters: Filters;
    cities: string[];
    brands: string[];
    weights: string[];
};

export default function ProductsPage({ products, filters, cities, brands, weights }: Props) {
    const [filterOpen, setFilterOpen] = useState(false);
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort]     = useState(filters.sort ?? 'newest');

    // Add to cart dialog
    const [cartDialog, setCartDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
    const [qty, setQty]               = useState(1);
    const [txType, setTxType]         = useState<'refill' | 'new_purchase'>('refill');

    const [cartSubmitting, setCartSubmitting] = useState(false);

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

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Browse Products</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {products.total} product{products.total !== 1 ? 's' : ''} available
                        </p>
                    </div>
                    {/* Sort */}
                    <select
                        value={sort}
                        onChange={e => { setSort(e.target.value); applyFilters({ sort: e.target.value }); }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                    >
                        <option value="newest">Newest First</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="newest">Newest</option>
                    </select>
                </div>

                {/* Search + Filter row */}
                <div className="flex gap-2">
                    <form onSubmit={handleSearch} className="flex flex-1 gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name, brand, or size…"
                                className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            />
                        </div>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                            Search
                        </Button>
                    </form>
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
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {products.data.map(p => (
                            <Card
                                key={p.id}
                                className="overflow-hidden hover:shadow-md transition-shadow flex flex-col cursor-pointer"
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
                                        <Button
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-9"
                                            disabled={p.stock === 0}
                                            onClick={(e) => { e.stopPropagation(); openCartDialog(p); }}
                                        >
                                            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                                            Add to Cart
                                        </Button>
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

        </CustomerLayout>
    );
}
