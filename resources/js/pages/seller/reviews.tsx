import { Head, router } from '@inertiajs/react';
import { MessageSquare, Search, Star } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Reviews',   href: '/seller/reviews'   },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type Review = {
    id: number;
    rating: number;
    review: string | null;
    customer_name: string;
    product_name: string;
    product_brand: string;
    created_at: string;
};

type Paginated = {
    data: Review[];
    current_page: number;
    last_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    reviews: Paginated;
    avg: number;
    total: number;
    breakdown: Record<number, number>;
    filters: { search: string; product_id: string };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function Stars({ value, size = 'sm' }: { value: number; size?: 'xs' | 'sm' }) {
    return (
        <span className="flex gap-px">
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`${size === 'xs' ? 'text-xs' : 'text-sm'} ${i <= value ? 'text-amber-400' : 'text-gray-300'}`}>★</span>
            ))}
        </span>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SellerReviews({ reviews, avg, total, breakdown, filters }: Props) {
    const [search, setSearch] = useState(filters.search);

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/seller/reviews', { search: search || undefined }, { preserveState: true, replace: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reviews" />

            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Star className="h-6 w-6 text-amber-500" />
                            Customer Reviews
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Reviews left by customers for your store's products.
                        </p>
                    </div>
                    <form onSubmit={doSearch} className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by product…"
                                className="pl-9 w-52"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">Search</Button>
                    </form>
                </div>

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Overall rating */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Rating</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {total > 0 ? (
                                <>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-4xl font-bold text-gray-900 dark:text-white">{avg.toFixed(1)}</span>
                                        <span className="text-muted-foreground text-sm">/ 5</span>
                                    </div>
                                    <Stars value={Math.round(avg)} />
                                    <p className="text-xs text-muted-foreground mt-1">{total} review{total !== 1 ? 's' : ''}</p>
                                </>
                            ) : (
                                <p className="text-muted-foreground text-sm italic">No reviews yet</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Rating breakdown */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Rating Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count  = breakdown[star] ?? 0;
                                const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
                                return (
                                    <div key={star} className="flex items-center gap-2 text-sm">
                                        <span className="w-4 text-right text-amber-500 font-semibold">{star}</span>
                                        <span className="text-amber-400 text-xs">★</span>
                                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                                            <div
                                                className="h-full bg-amber-400 rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                {/* Reviews table */}
                <Card>
                    <CardContent className="p-0">
                        {reviews.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <MessageSquare className="mb-3 h-10 w-10" />
                                <p className="font-medium">No reviews found.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rating</th>
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Review</th>
                                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reviews.data.map((r) => (
                                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium">{r.product_name}</p>
                                                    {r.product_brand && (
                                                        <p className="text-xs text-muted-foreground">{r.product_brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{r.customer_name}</td>
                                                <td className="px-4 py-3">
                                                    <Stars value={r.rating} size="xs" />
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground max-w-xs">
                                                    {r.review ? (
                                                        <span className="italic">"{r.review}"</span>
                                                    ) : (
                                                        <span className="text-gray-300 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{r.created_at}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {reviews.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{reviews.total} review{reviews.total !== 1 ? 's' : ''}</span>
                                <div className="flex gap-1">
                                    {reviews.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                            className={`min-w-[32px] rounded px-2 py-1 text-xs ${link.active ? 'bg-blue-600 text-white' : link.url ? 'hover:bg-muted' : 'text-gray-300 cursor-not-allowed'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
