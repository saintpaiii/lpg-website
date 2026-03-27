import { Head, router } from '@inertiajs/react';
import { ArrowLeft, Award, BadgeCheck, MapPin, Phone, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { StarRating } from '@/components/ui/star-rating';
import CustomerLayout from '@/layouts/customer-layout';
import { formatAddress } from '@/data/cavite-locations';

// ── Types ──────────────────────────────────────────────────────────────────────

type StoreInfo = {
    id: number;
    store_name: string;
    description: string | null;
    city: string | null;
    barangay: string | null;
    province: string | null;
    phone: string | null;
    avg_rating: number;
    review_count: number;
    product_count: number;
    order_count: number;
    joined_at: string;
    is_top_rated: boolean;
    is_trusted: boolean;
};

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
    avg_rating: number;
    review_count: number;
};

type Review = {
    id: number;
    rating: number;
    review: string | null;
    customer_name: string;
    product_name: string;
    created_at: string;
};

type PaginatedProducts = {
    data: Product[];
    current_page: number;
    last_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    store: StoreInfo;
    products: PaginatedProducts;
    recent_reviews: Review[];
    search: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function StarsDisplay({ value, size = 'sm' }: { value: number; size?: 'xs' | 'sm' }) {
    const filled = Math.round(value);
    return (
        <span className="flex">
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`${size === 'xs' ? 'text-xs' : 'text-base'} ${i <= filled ? 'text-amber-400' : 'text-gray-300'}`}>★</span>
            ))}
        </span>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StorePage({ store, products, recent_reviews, search: initialSearch }: Props) {
    const [search, setSearch]       = useState(initialSearch);
    const [cartSubmitting, setCartSubmitting] = useState(false);

    const [cartDialog, setCartDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
    const [qty, setQty]               = useState(1);
    const [txType, setTxType]         = useState<'refill' | 'new_purchase'>('refill');
    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get(`/customer/store/${store.id}`, { search: search || undefined }, { preserveState: true, replace: true });
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

    const location = formatAddress(null, store.barangay ?? null, store.city ?? null);

    return (
        <CustomerLayout>
            <Head title={`${store.store_name} — LPG Portal`} />

            <div className="space-y-6">
                {/* Back */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 -ml-2"
                    onClick={() => router.visit('/customer/products')}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Browse
                </Button>

                {/* Store header */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{store.store_name}</h1>
                                    {store.is_top_rated && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                            <Award className="h-3 w-3" />
                                            Top Rated
                                        </span>
                                    )}
                                    {store.is_trusted && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                            <BadgeCheck className="h-3 w-3" />
                                            Trusted Seller
                                        </span>
                                    )}
                                </div>

                                {store.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xl">{store.description}</p>
                                )}

                                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                    {location && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {location}
                                        </span>
                                    )}
                                    {store.phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone className="h-3.5 w-3.5" />
                                            {store.phone}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="text-right space-y-1">
                                {store.avg_rating > 0 ? (
                                    <>
                                        <div className="flex items-center justify-end gap-1">
                                            <StarsDisplay value={store.avg_rating} />
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{store.avg_rating.toFixed(1)}</span>
                                        </div>
                                        <p className="text-xs text-gray-400">{store.review_count} review{store.review_count !== 1 ? 's' : ''}</p>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No reviews yet</p>
                                )}
                                <p className="text-xs text-gray-400">
                                    {store.product_count} product{store.product_count !== 1 ? 's' : ''}
                                    {store.order_count > 0 && ` · ${store.order_count} fulfilled`}
                                    {' · '}Joined {store.joined_at}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Search */}
                <form onSubmit={doSearch} className="flex gap-2 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search products…"
                            className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                    </div>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Search</Button>
                    {search && (
                        <Button type="button" variant="ghost" onClick={() => { setSearch(''); router.get(`/customer/store/${store.id}`); }}>
                            Clear
                        </Button>
                    )}
                </form>

                {/* Product grid */}
                {products.data.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <ShoppingCart className="h-10 w-10 mx-auto mb-3" />
                        <p className="font-medium">No products found.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {products.data.map((p) => (
                            <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow flex flex-col">
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
                                    <div className="mb-3">
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
                                        <Button
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-9"
                                            disabled={p.stock === 0}
                                            onClick={() => openCartDialog(p)}
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
                                            ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                            : 'border-gray-200 text-gray-300 cursor-not-allowed'
                                }`}
                            />
                        ))}
                    </div>
                )}

                {/* Recent reviews */}
                {recent_reviews.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Customer Reviews</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {recent_reviews.map((r) => (
                                <div key={r.id} className="border-b last:border-0 pb-4 last:pb-0">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{r.customer_name}</p>
                                            <p className="text-xs text-gray-400">{r.product_name} · {r.created_at}</p>
                                        </div>
                                        <StarsDisplay value={r.rating} size="xs" />
                                    </div>
                                    {r.review && (
                                        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 italic">"{r.review}"</p>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add to cart dialog */}
            <Dialog open={cartDialog.open} onOpenChange={(open) => setCartDialog((v) => ({ ...v, open }))}>
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
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Transaction Type</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['refill', 'new_purchase'] as const).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setTxType(t)}
                                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                                txType === t
                                                    ? 'bg-blue-600 border-blue-600 text-white'
                                                    : 'border-gray-200 text-gray-700 hover:border-blue-300'
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
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Quantity</p>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">−</button>
                                    <span className="w-10 text-center font-semibold text-gray-900 dark:text-white">{qty}</span>
                                    <button onClick={() => setQty((q) => Math.min(cartDialog.product!.stock, q + 1))} disabled={qty >= cartDialog.product.stock}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">+</button>
                                    <span className="text-xs text-gray-400">{cartDialog.product.stock} in stock</span>
                                </div>
                            </div>
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
                        <Button variant="outline" onClick={() => setCartDialog({ open: false, product: null })}>Cancel</Button>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={addToCart} disabled={cartSubmitting}>
                            <ShoppingCart className="h-4 w-4 mr-1.5" />
                            Add to Cart
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </CustomerLayout>
    );
}
