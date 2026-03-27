import { Head, router, useForm } from '@inertiajs/react';
import { ArrowLeft, MapPin, Package, ShoppingCart, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StarRating } from '@/components/ui/star-rating';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';
import { fmtDate } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

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
    delivery_fee: number;
    avg_rating: number;
    review_count: number;
};

type Review = {
    id: number;
    rating: number;
    review: string | null;
    user_name: string;
    created_at: string;
};

type RelatedProduct = {
    id: number;
    name: string;
    brand: string;
    weight: string;
    refill_price: number;
    purchase_price: number;
    image_url: string | null;
    stock: number;
    store_name: string;
    store_id: number;
    avg_rating: number;
    review_count: number;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    product:       Product;
    reviews:       Paginated<Review>;
    canRate:       boolean;
    ratingOrderId: number | null;
    fromStore:     RelatedProduct[];
    similar:       RelatedProduct[];
};

// ── Star picker (interactive) ─────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [hover, setHover] = useState(0);
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => onChange(i)}
                    className="text-2xl leading-none transition-colors focus:outline-none"
                >
                    <span className={(hover || value) >= i ? 'text-amber-400' : 'text-gray-300'}>★</span>
                </button>
            ))}
        </div>
    );
}

// ── Related product mini-card ─────────────────────────────────────────────────

function RelatedCard({ p }: { p: RelatedProduct }) {
    return (
        <button
            className="text-left w-full"
            onClick={() => router.visit(`/customer/products/${p.id}`)}
        >
            <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
                {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-28 object-cover" />
                ) : (
                    <div className="w-full h-28 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                        <Package className="h-8 w-8 text-blue-300" />
                    </div>
                )}
                <CardContent className="p-3">
                    <p className="font-semibold text-xs text-gray-900 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-500 mb-1">{p.brand} · {p.weight}</p>
                    <StarRating value={p.avg_rating} count={p.review_count} size="xs" />
                    <p className="mt-1.5 font-bold text-blue-600 text-sm">
                        ₱{p.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                    {p.stock === 0 && (
                        <span className="text-[10px] text-red-500 font-medium">Out of stock</span>
                    )}
                </CardContent>
            </Card>
        </button>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductShowPage({ product, reviews, canRate, ratingOrderId, fromStore, similar }: Props) {
    const [qty, setQty]     = useState(1);
    const [txType, setTxType] = useState<'refill' | 'new_purchase'>('refill');
    const [adding, setAdding] = useState(false);

    // Rating form
    const ratingForm = useForm({ rating: 0, review: '' });

    function addToCart() {
        if (adding) return;
        setAdding(true);
        router.post('/customer/cart/add', {
            product_id:       product.id,
            quantity:         qty,
            transaction_type: txType,
        }, {
            preserveScroll: true,
            onSuccess: () => { setAdding(false); toast.success(`${product.name} added to cart.`); },
            onError:   () => { setAdding(false); toast.error('Failed to add to cart.'); },
        });
    }

    function submitRating(e: React.FormEvent) {
        e.preventDefault();
        if (!ratingOrderId || ratingForm.data.rating === 0) return;
        ratingForm.post(`/customer/orders/${ratingOrderId}/rate`, {
            data: {
                ratings: [{
                    product_id: product.id,
                    rating:     ratingForm.data.rating,
                    review:     ratingForm.data.review || null,
                }],
            },
            preserveScroll: true,
            onSuccess: () => { toast.success('Thank you for your review!'); },
            onError:   () => { toast.error('Failed to submit review. Please try again.'); },
        });
    }

    const unitPrice = txType === 'refill' ? product.refill_price : product.purchase_price;

    return (
        <CustomerLayout>
            <Head title={`${product.name} — LPG Portal`} />

            <div className="space-y-8">
                {/* Back */}
                <button
                    onClick={() => router.visit('/customer/products')}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Products
                </button>

                {/* ── Main product info ───────────────────────────────────── */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Image */}
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 aspect-square max-h-[400px]">
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-20 w-20 text-blue-200" />
                            </div>
                        )}
                        {product.stock === 0 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
                                <span className="bg-white text-gray-800 font-bold px-4 py-2 rounded-full text-sm">Out of Stock</span>
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{product.name}</h1>
                            <p className="text-gray-500 mt-0.5">{product.brand} · {product.weight}</p>
                        </div>

                        {/* Rating */}
                        <StarRating value={product.avg_rating} count={product.review_count} size="sm" />

                        {/* Pricing */}
                        <div className="flex gap-6">
                            <div>
                                <p className="text-xs text-gray-400 mb-0.5">Refill</p>
                                <p className="text-2xl font-bold text-blue-600">
                                    ₱{product.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 mb-0.5">New Purchase</p>
                                <p className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
                                    ₱{product.purchase_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Stock */}
                        <p className="text-sm text-gray-500">
                            {product.stock > 0
                                ? <span className="text-green-600 font-medium">{product.stock} available</span>
                                : <span className="text-red-500 font-medium">Out of stock</span>
                            }
                        </p>

                        {/* Store */}
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5 text-sm">
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                                <button
                                    className="font-semibold hover:text-blue-600 hover:underline transition-colors"
                                    onClick={() => router.visit(`/customer/store/${product.store_id}`)}
                                >
                                    {product.store_name}
                                </button>
                            </div>
                            <p className="text-gray-500 pl-6">
                                {[product.store_barangay, product.store_city].filter(Boolean).join(', ')}
                            </p>
                            <p className="text-gray-500 pl-6">
                                Delivery fee: {product.delivery_fee > 0
                                    ? `₱${product.delivery_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                                    : 'Free'
                                }
                            </p>
                        </div>

                        {product.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{product.description}</p>
                        )}

                        {/* Add to cart controls */}
                        {product.stock > 0 && (
                            <div className="space-y-3">
                                {/* Transaction type */}
                                <div className="grid grid-cols-2 gap-2">
                                    {(['refill', 'new_purchase'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setTxType(t)}
                                            className={`rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                                                txType === t
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                                            }`}
                                        >
                                            {t === 'refill' ? 'Refill' : 'New Purchase'}
                                            <p className="text-xs mt-0.5 font-normal opacity-70">
                                                ₱{(t === 'refill' ? product.refill_price : product.purchase_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                {/* Quantity */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setQty(q => Math.max(1, q - 1))}
                                        disabled={qty <= 1}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                    >−</button>
                                    <span className="w-10 text-center font-semibold text-gray-900 dark:text-white">{qty}</span>
                                    <button
                                        onClick={() => setQty(q => Math.min(product.stock, q + 1))}
                                        disabled={qty >= product.stock}
                                        className="h-9 w-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                    >+</button>
                                    <span className="text-sm text-gray-500">
                                        Subtotal: <strong>₱{(unitPrice * qty).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                                    </span>
                                </div>

                                {/* Add to cart button */}
                                <Button
                                    onClick={addToCart}
                                    disabled={adding}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base"
                                >
                                    <ShoppingCart className="h-4 w-4 mr-2" />
                                    Add to Cart
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Reviews ────────────────────────────────────────────── */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Star className="h-4 w-4 text-amber-400" />
                                Reviews ({reviews.total})
                            </CardTitle>
                            {product.review_count > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm text-gray-500">Average:</span>
                                    <StarRating value={product.avg_rating} count={product.review_count} />
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {reviews.data.length === 0 ? (
                            <p className="text-sm text-gray-400 italic py-4 text-center">No reviews yet. Be the first to review this product!</p>
                        ) : (
                            <div className="space-y-4">
                                {reviews.data.map(r => (
                                    <div key={r.id} className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="flex">
                                                {[1,2,3,4,5].map(i => (
                                                    <span key={i} className={`text-sm ${i <= r.rating ? 'text-amber-400' : 'text-gray-300'}`}>★</span>
                                                ))}
                                            </span>
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.user_name}</span>
                                            <span className="text-xs text-gray-400">— {fmtDate(r.created_at)}</span>
                                        </div>
                                        {r.review && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed ml-0.5">"{r.review}"</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {reviews.last_page > 1 && (
                            <div className="flex justify-center gap-1 mt-4 flex-wrap">
                                {reviews.links.map((link, i) => (
                                    <button
                                        key={i}
                                        disabled={!link.url}
                                        onClick={() => link.url && router.visit(link.url, { preserveScroll: true })}
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
                    </CardContent>
                </Card>

                {/* ── Rate this product ───────────────────────────────────── */}
                {canRate && (
                    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Star className="h-4 w-4 text-amber-500" />
                                Rate this product
                            </CardTitle>
                            <p className="text-xs text-gray-500">You've purchased this product. Share your experience!</p>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={submitRating} className="space-y-3">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 mb-1.5">Your rating</p>
                                    <StarPicker value={ratingForm.data.rating} onChange={v => ratingForm.setData('rating', v)} />
                                    {ratingForm.errors.rating && <p className="text-xs text-red-500 mt-1">{ratingForm.errors.rating}</p>}
                                </div>
                                <div>
                                    <textarea
                                        value={ratingForm.data.review}
                                        onChange={e => ratingForm.setData('review', e.target.value)}
                                        placeholder="Write a review… (optional)"
                                        rows={3}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-800 dark:text-white"
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    disabled={ratingForm.data.rating === 0 || ratingForm.processing}
                                    className="bg-amber-500 hover:bg-amber-600 text-white"
                                >
                                    Submit Review
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* ── Related products ────────────────────────────────────── */}
                {fromStore.length > 0 && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">More from {product.store_name}</h2>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                            {fromStore.map(p => <RelatedCard key={p.id} p={p} />)}
                        </div>
                    </div>
                )}

                {similar.length > 0 && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Similar products ({product.weight})</h2>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                            {similar.map(p => <RelatedCard key={p.id} p={p} />)}
                        </div>
                    </div>
                )}
            </div>
        </CustomerLayout>
    );
}
