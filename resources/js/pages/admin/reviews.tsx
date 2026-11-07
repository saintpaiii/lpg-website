import { Head, router } from '@inertiajs/react';
import { ImageOff, Search, Star, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PhotoLightbox } from '@/components/review-photos';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reviews', href: '/admin/reviews' }];

type Review = {
    id: number;
    rating: number;
    review: string | null;
    photo_urls: string[];
    edited: boolean;
    created_at: string;
    customer_name: string;
    customer_email: string | null;
    product_name: string;
    store_name: string;
    photos_removed_by_admin: number;
};

type Props = {
    reviews: {
        data: Review[];
        current_page: number;
        last_page: number;
        total: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    filters: { with_photos: boolean; rating: number | ''; store: string };
};

function Stars({ value }: { value: number }) {
    return (
        <span className="text-sm leading-none" aria-label={`${value} of 5 stars`}>
            <span className="text-amber-400">{'★'.repeat(value)}</span>
            <span className="text-gray-300">{'★'.repeat(5 - value)}</span>
        </span>
    );
}

export default function AdminReviews({ reviews, filters }: Props) {
    const [store, setStore] = useState(filters.store);
    const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
    const [removing, setRemoving] = useState<{ review: Review; index: number } | null>(null);
    const [deleting, setDeleting] = useState<Review | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    function apply(next: Partial<Props['filters']>) {
        const f = { ...filters, store, ...next };
        router.get('/admin/reviews', {
            with_photos: f.with_photos ? 1 : undefined,
            rating: f.rating || undefined,
            store: f.store || undefined,
        }, { preserveState: true, preserveScroll: true, replace: true });
    }

    function onSearch(e: FormEvent) {
        e.preventDefault();
        apply({ store });
    }

    function removePhoto() {
        if (!removing) return;
        setBusy(true);
        router.post(`/admin/reviews/${removing.review.id}/photos/${removing.index}/remove`, {}, {
            preserveScroll: true,
            onSuccess: () => setRemoving(null),
            onError: () => toast.error('Could not remove the photo.'),
            onFinish: () => setBusy(false),
        });
    }

    function deleteReview() {
        if (!deleting || !reason.trim()) return;
        setBusy(true);
        router.delete(`/admin/reviews/${deleting.id}`, {
            data: { reason },
            preserveScroll: true,
            onSuccess: () => { setDeleting(null); setReason(''); },
            onError: (e) => toast.error(e.reason ?? 'Could not delete the review.'),
            onFinish: () => setBusy(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reviews" />
            <div className="space-y-4 p-4 md:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold"><Star className="h-5 w-5 text-amber-400" /> Reviews</h1>
                    <p className="text-sm text-muted-foreground">Customer reviews across all stores. Remove photos or reviews that break the review rules — the customer is told.</p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button" aria-pressed={filters.with_photos} onClick={() => apply({ with_photos: !filters.with_photos })}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${filters.with_photos ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300'}`}
                    >
                        With photos
                    </button>
                    <select
                        value={filters.rating} onChange={(e) => apply({ rating: e.target.value ? Number(e.target.value) : '' })}
                        className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Filter by stars"
                    >
                        <option value="">All ratings</option>
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
                    </select>
                    <form onSubmit={onSearch} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                        <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Search store…" className="h-8 min-w-0 sm:w-56" />
                        <Button type="submit" size="sm" variant="outline" className="h-8"><Search className="h-4 w-4" /></Button>
                    </form>
                    <span className="ml-auto text-sm text-muted-foreground">{reviews.total} review{reviews.total === 1 ? '' : 's'}</span>
                </div>

                {reviews.data.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No reviews match these filters.</CardContent></Card>
                ) : (
                    <div className="space-y-3">
                        {reviews.data.map((r) => (
                            <Card key={r.id}>
                                <CardContent className="space-y-2 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                <Stars value={r.rating} />
                                                <span className="text-sm font-medium">{r.product_name}</span>
                                                <span className="text-xs text-muted-foreground">at {r.store_name}</span>
                                            </div>
                                            <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                                {r.customer_name}{r.customer_email ? ` · ${r.customer_email}` : ''} · {r.created_at}{r.edited ? ' (edited)' : ''}
                                                {r.photos_removed_by_admin > 0 && <> · <span className="text-red-600">{r.photos_removed_by_admin} photo{r.photos_removed_by_admin > 1 ? 's' : ''} removed before</span></>}
                                            </p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-7 gap-1 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50" onClick={() => { setReason(''); setDeleting(r); }}>
                                            <Trash2 className="h-3.5 w-3.5" /> Delete review
                                        </Button>
                                    </div>
                                    {r.review && <p className="break-words text-sm text-gray-700 dark:text-gray-300">"{r.review}"</p>}
                                    {r.photo_urls.length > 0 && (
                                        <div className="flex flex-wrap gap-3">
                                            {r.photo_urls.map((u, i) => (
                                                <div key={u} className="relative">
                                                    <button type="button" onClick={() => setLightbox({ urls: r.photo_urls, index: i })}
                                                        className="h-16 w-16 overflow-hidden rounded-md border hover:opacity-90">
                                                        <img src={u} alt={`Photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                                                    </button>
                                                    <button type="button" title="Remove photo" aria-label="Remove photo" onClick={() => setRemoving({ review: r, index: i })}
                                                        className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-700">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {reviews.last_page > 1 && (
                    <div className="flex flex-wrap justify-center gap-1">
                        {reviews.links.map((l, i) => (
                            <button
                                key={i} disabled={!l.url} onClick={() => l.url && router.visit(l.url, { preserveScroll: true })}
                                dangerouslySetInnerHTML={{ __html: l.label }}
                                className={`min-w-[32px] rounded px-2 py-1 text-sm ${l.active ? 'bg-blue-600 text-white' : l.url ? 'text-gray-600 hover:bg-gray-100' : 'pointer-events-none text-gray-300'}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            <PhotoLightbox urls={lightbox?.urls ?? []} index={lightbox?.index ?? null} onClose={() => setLightbox(null)} />

            {/* Remove one photo */}
            <AlertDialog open={!!removing} onOpenChange={(o) => !o && !busy && setRemoving(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><ImageOff className="h-4 w-4 text-red-600" /> Remove this photo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The photo is deleted for good. The customer is told: &quot;A photo in your review of {removing?.review.product_name} was removed because it broke the review rules.&quot;
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {removing && <img src={removing.review.photo_urls[removing.index]} alt="" className="mx-auto max-h-48 rounded-md object-contain" />}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); removePhoto(); }} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
                            {busy ? 'Removing…' : 'Remove photo'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete review (reason required) */}
            <Dialog open={!!deleting} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete this review?</DialogTitle>
                        <DialogDescription>
                            {deleting?.customer_name}&apos;s review of {deleting?.product_name} and its photos are deleted for good. The customer sees your reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <label htmlFor="del-reason" className="text-xs font-medium">Reason <span className="text-red-500">*</span></label>
                        <textarea
                            id="del-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Offensive language, unrelated photos, personal information…"
                            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
                        <Button variant="destructive" onClick={deleteReview} disabled={busy || !reason.trim()}>
                            {busy ? 'Deleting…' : 'Delete review'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
