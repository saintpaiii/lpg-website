import { router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NotePicker } from '@/components/reason-picker';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PHOTO_ACCEPT, preparePhotos } from '@/lib/resize-image';

export const MAX_REVIEW_PHOTOS = 3;
export const REVIEW_EDIT_DAYS  = 7;

/** The author's own review (order page / product page) */
export type MyReview = {
    id: number;
    product_id?: number;
    rating: number;
    review: string | null;
    photo_urls: string[];
    photo_paths: string[];
    created_at: string;
    edited: boolean;
    can_edit: boolean;
};

// ── Lightbox ────────────────────────────────────────────────────────────────

export function PhotoLightbox({ urls, index, onClose }: { urls: string[]; index: number | null; onClose: () => void }) {
    const [i, setI] = useState(index ?? 0);
    useEffect(() => { if (index !== null) setI(index); }, [index]);
    const many = urls.length > 1;
    const go = (d: number) => setI((cur) => (cur + d + urls.length) % urls.length);

    return (
        <Dialog open={index !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="max-w-[calc(100vw-1rem)] gap-2 p-2 sm:max-w-3xl"
                onKeyDown={(e) => { if (!many) return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}
            >
                <DialogHeader className="sr-only"><DialogTitle>Review photo</DialogTitle></DialogHeader>
                <div className="relative flex items-center justify-center">
                    {urls[i] && <img src={urls[i]} alt={`Review photo ${i + 1}`} className="max-h-[80vh] w-auto max-w-full rounded-md object-contain" />}
                    {many && (
                        <>
                            <button type="button" aria-label="Previous photo" onClick={() => go(-1)}
                                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70">
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button type="button" aria-label="Next photo" onClick={() => go(1)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70">
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </>
                    )}
                </div>
                {many && <p className="text-center text-xs text-gray-500">{i + 1} / {urls.length}</p>}
            </DialogContent>
        </Dialog>
    );
}

/** 64 px rounded thumbnails that open the lightbox */
export function PhotoThumbs({ urls, className = '' }: { urls: string[]; className?: string }) {
    const [open, setOpen] = useState<number | null>(null);
    if (!urls || urls.length === 0) return null;
    return (
        <>
            <div className={`flex flex-wrap gap-2 ${className}`}>
                {urls.map((u, i) => (
                    <button key={u} type="button" onClick={() => setOpen(i)}
                        className="h-16 w-16 overflow-hidden rounded-md border border-gray-200 transition-opacity hover:opacity-90 dark:border-gray-700">
                        <img src={u} alt={`Review photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                ))}
            </div>
            <PhotoLightbox urls={urls} index={open} onClose={() => setOpen(null)} />
        </>
    );
}

// ── Picker (new files + existing photos, each with ✕) ───────────────────────

function useObjectUrls(files: File[]): string[] {
    const [urls, setUrls] = useState<string[]>([]);
    useEffect(() => {
        const next = files.map((f) => URL.createObjectURL(f));
        setUrls(next);
        return () => next.forEach((u) => URL.revokeObjectURL(u));
    }, [files]);
    return urls;
}

export function PhotoPicker({ files, onFiles, existing = [], onRemoveExisting, max = MAX_REVIEW_PHOTOS, error, label = 'Add photos' }: {
    files: File[];
    onFiles: (files: File[]) => void;
    existing?: { path: string; url: string }[];
    onRemoveExisting?: (path: string) => void;
    max?: number;
    error?: string;
    label?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const previews = useObjectUrls(files);
    const left = max - existing.length - files.length;

    async function pick(list: FileList | null) {
        const picked = Array.from(list ?? []);
        if (inputRef.current) inputRef.current.value = '';
        if (picked.length === 0) return;
        setBusy(true);
        const { files: ok, problems } = await preparePhotos(picked);
        setBusy(false);
        const room = Math.max(0, max - existing.length - files.length);
        const msgs = [...problems];
        if (ok.length > room) msgs.push(`Up to ${max} photos — ${ok.length - room} not added.`);
        setProblem(msgs.length ? msgs.join(' ') : null);
        if (ok.length && room) onFiles([...files, ...ok.slice(0, room)]);
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {existing.map((p) => (
                    <div key={p.path} className="relative h-16 w-16">
                        <img src={p.url} alt="" className="h-full w-full rounded-md border object-cover" />
                        {onRemoveExisting && (
                            <button type="button" aria-label="Remove photo" onClick={() => onRemoveExisting(p.path)}
                                className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-0.5 text-white shadow hover:bg-red-600">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                ))}
                {previews.map((u, i) => (
                    <div key={u} className="relative h-16 w-16">
                        <img src={u} alt="" className="h-full w-full rounded-md border object-cover" />
                        <button type="button" aria-label="Remove photo" onClick={() => onFiles(files.filter((_, j) => j !== i))}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-0.5 text-white shadow hover:bg-red-600">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
                {left > 0 && (
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                        className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-gray-300 text-[10px] text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-60 dark:border-gray-600">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {busy ? 'Resizing' : 'Add'}
                    </button>
                )}
            </div>
            <input ref={inputRef} type="file" multiple accept={PHOTO_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files)} />
            <p className="text-xs text-gray-500">{label} (up to {max}) · JPG, PNG or WEBP</p>
            {(problem || error) && <p className="text-xs text-red-600">{problem ?? error}</p>}
        </div>
    );
}

// ── Stars ───────────────────────────────────────────────────────────────────

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" aria-label={`${s} star${s > 1 ? 's' : ''}`}
                    onClick={() => onChange(s)} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
                    className={`text-2xl leading-none transition-transform hover:scale-110 ${(hovered || value) >= s ? 'text-amber-400' : 'text-gray-300'}`}>
                    ★
                </button>
            ))}
        </div>
    );
}

/** First photo error in an Inertia errors bag under `prefix` (e.g. "ratings.0.photos" or "photos") */
export function photoError(errors: Record<string, string>, prefix: string): string | undefined {
    if (errors[prefix]) return errors[prefix];
    const key = Object.keys(errors).find((k) => k.startsWith(prefix + '.'));
    return key ? errors[key] : undefined;
}

// ── Edit dialog ─────────────────────────────────────────────────────────────

export function ReviewEditDialog({ review, productName, onClose }: { review: MyReview | null; productName?: string; onClose: () => void }) {
    const [stars, setStars]   = useState(0);
    const [text, setText]     = useState('');
    const [keep, setKeep]     = useState<string[]>([]);
    const [files, setFiles]   = useState<File[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!review) return;
        setStars(review.rating);
        setText(review.review ?? '');
        setKeep(review.photo_paths);
        setFiles([]);
        setErrors({});
    }, [review]);

    if (!review) return null;
    const existing = review.photo_paths
        .map((p, i) => ({ path: p, url: review.photo_urls[i] }))
        .filter((p) => keep.includes(p.path));

    function save() {
        if (!review || stars < 1) return;
        setSaving(true);
        // POST + _method=PUT: PHP can't read multipart files on a real PUT
        router.post(`/customer/ratings/${review.id}`, {
            _method: 'PUT',
            rating: stars,
            review: text,
            keep_photos: keep,
            photos: files,
        }, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => onClose(),
            onError: (e) => { setErrors(e); toast.error(e.photos ?? Object.values(e)[0] ?? 'Could not save your review.'); },
            onFinish: () => setSaving(false),
        });
    }

    return (
        <Dialog open={!!review} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit your review{productName ? ` — ${productName}` : ''}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <StarInput value={stars} onChange={setStars} />
                    {errors.rating && <p className="text-xs text-red-600">{errors.rating}</p>}
                    <NotePicker
                        context="review" value={text} onChange={setText} rows={3} maxLength={500}
                        placeholder="Write a review (optional)…" error={errors.review}
                        textareaClassName="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                    />
                    <PhotoPicker
                        files={files} onFiles={setFiles}
                        existing={existing} onRemoveExisting={(p) => setKeep((k) => k.filter((x) => x !== p))}
                        error={photoError(errors, 'photos')}
                    />
                    <p className="text-xs text-gray-400">You can edit a review for {REVIEW_EDIT_DAYS} days after posting.</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={save} disabled={saving || stars < 1} className="bg-amber-500 text-white hover:bg-amber-600">
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Edit / Delete buttons under the author's own review ─────────────────────

export function ReviewOwnerActions({ review, onEdit }: { review: Pick<MyReview, 'id' | 'can_edit'>; onEdit: () => void }) {
    const [confirm, setConfirm]   = useState(false);
    const [deleting, setDeleting] = useState(false);

    function remove() {
        setDeleting(true);
        router.delete(`/customer/ratings/${review.id}`, {
            preserveScroll: true,
            onSuccess: () => setConfirm(false),
            onError: () => toast.error('Could not delete your review.'),
            onFinish: () => setDeleting(false),
        });
    }

    return (
        <div className="flex items-center gap-1">
            {review.can_edit ? (
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        {/* span: a disabled button doesn't fire hover */}
                        <span className="inline-flex cursor-not-allowed items-center gap-1 rounded px-2 py-1 text-xs text-gray-400">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Editing closed after {REVIEW_EDIT_DAYS} days</TooltipContent>
                </Tooltip>
            )}
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <AlertDialog open={confirm} onOpenChange={(o) => !deleting && setConfirm(o)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete your review?</AlertDialogTitle>
                        <AlertDialogDescription>Delete your review? This can&apos;t be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); remove(); }}
                            disabled={deleting}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            {deleting ? 'Deleting…' : 'Delete review'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
