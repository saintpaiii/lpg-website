import { Head, router, useForm } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    Eye,
    EyeOff,
    Image,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Banners', href: '/admin/banners' }];

const MAX_ACTIVE = 5;

type BannerRow = {
    id: number;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    cta_text: string | null;
    cta_url: string | null;
    is_active: boolean;
    display_order: number;
    deleted_at: string | null;
};

type Props = {
    banners: BannerRow[];
    activeCount: number;
};

type FormFields = {
    title: string;
    subtitle: string;
    cta_text: string;
    cta_url: string;
    is_active: boolean;
    display_order: number;
    image: File | null;
};

function BannerForm({
    open,
    onClose,
    banner,
    activeCount,
}: {
    open: boolean;
    onClose: () => void;
    banner: BannerRow | null;
    activeCount: number;
}) {
    const isEdit = banner !== null;
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(banner?.image_url ?? null);

    const { data, setData, post, put, processing, errors, reset } = useForm<FormFields>({
        title:         banner?.title ?? '',
        subtitle:      banner?.subtitle ?? '',
        cta_text:      banner?.cta_text ?? 'Shop Now',
        cta_url:       banner?.cta_url ?? '/customer/products',
        is_active:     banner?.is_active ?? true,
        display_order: banner?.display_order ?? 0,
        image:         null,
    });

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('image', file);
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const opts = {
            forceFormData: true,
            onSuccess: () => { reset(); onClose(); },
        };
        if (isEdit) {
            router.post(`/admin/banners/${banner!.id}`, { ...data, _method: 'PUT' }, opts);
        } else {
            post('/admin/banners', opts);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Banner' : 'New Banner'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    {/* Image upload */}
                    <div>
                        <Label>Banner Image</Label>
                        <div
                            className="mt-1.5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-600 cursor-pointer hover:border-blue-400 transition-colors p-4"
                            onClick={() => fileRef.current?.click()}
                        >
                            {preview ? (
                                <div className="relative w-full">
                                    <img src={preview} alt="preview" className="w-full h-32 object-cover rounded-lg" />
                                    <button
                                        type="button"
                                        className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                                        onClick={(e) => { e.stopPropagation(); setPreview(null); setData('image', null); if (fileRef.current) fileRef.current.value = ''; }}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Image className="h-8 w-8 text-gray-400" />
                                    <p className="text-sm text-gray-500">Click to upload image (JPG/PNG, max 3 MB)</p>
                                </>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                        {errors.image && <p className="text-xs text-red-500 mt-1">{errors.image}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <Label>Title</Label>
                            <Input className="mt-1" value={data.title} onChange={(e) => setData('title', e.target.value)} placeholder="e.g. Find the Best LPG Deals" />
                            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
                        </div>
                        <div className="col-span-2">
                            <Label>Subtitle</Label>
                            <Input className="mt-1" value={data.subtitle} onChange={(e) => setData('subtitle', e.target.value)} placeholder="e.g. Trusted LPG delivery in Cavite" />
                        </div>
                        <div>
                            <Label>Button Text</Label>
                            <Input className="mt-1" value={data.cta_text} onChange={(e) => setData('cta_text', e.target.value)} placeholder="Shop Now" />
                        </div>
                        <div>
                            <Label>Button URL</Label>
                            <Input className="mt-1" value={data.cta_url} onChange={(e) => setData('cta_url', e.target.value)} placeholder="/customer/products" />
                        </div>
                        <div>
                            <Label>Display Order</Label>
                            <Input type="number" className="mt-1" min={0} value={data.display_order} onChange={(e) => setData('display_order', parseInt(e.target.value) || 0)} />
                        </div>
                        <div className="flex items-end pb-0.5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={data.is_active}
                                    onChange={(e) => setData('is_active', e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300"
                                    disabled={!isEdit && !data.is_active && activeCount >= MAX_ACTIVE}
                                />
                                <span className="text-sm font-medium">Active</span>
                                {!isEdit && activeCount >= MAX_ACTIVE && (
                                    <span className="text-xs text-amber-600">(max {MAX_ACTIVE} reached)</span>
                                )}
                            </label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {processing ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Banner'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function BannersPage({ banners, activeCount }: Props) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editBanner, setEditBanner] = useState<BannerRow | null>(null);

    const activeBanners  = banners.filter((b) => !b.deleted_at && b.is_active);
    const inactiveBanners = banners.filter((b) => !b.deleted_at && !b.is_active);
    const archivedBanners = banners.filter((b) => b.deleted_at);

    function toggle(b: BannerRow) {
        router.patch(`/admin/banners/${b.id}/toggle`, {}, { preserveScroll: true });
    }

    function moveOrder(b: BannerRow, dir: 'up' | 'down') {
        const live = banners.filter((x) => !x.deleted_at).sort((a, z) => a.display_order - z.display_order);
        const idx = live.findIndex((x) => x.id === b.id);
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= live.length) return;
        const newOrder = live.map((x) => x.id);
        newOrder.splice(idx, 1);
        newOrder.splice(swapIdx, 0, b.id);
        router.post('/admin/banners/reorder', { order: newOrder }, { preserveScroll: true });
    }

    function destroy(b: BannerRow) {
        router.delete(`/admin/banners/${b.id}`, { preserveScroll: true });
    }

    function restore(b: BannerRow) {
        router.post(`/admin/banners/${b.id}/restore`, {}, { preserveScroll: true });
    }

    function forceDelete(b: BannerRow) {
        if (!confirm('Permanently delete this banner and its image? This cannot be undone.')) return;
        router.delete(`/admin/banners/${b.id}/force`, { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Banners" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Banners</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Manage the hero carousel on the customer browse page.
                            <span className={`ml-2 font-medium ${activeCount >= MAX_ACTIVE ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {activeCount}/{MAX_ACTIVE} active
                            </span>
                        </p>
                    </div>
                    <Button
                        onClick={() => setCreateOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="mr-1.5 h-4 w-4" />
                        New Banner
                    </Button>
                </div>

                {/* Active banners */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Eye className="h-4 w-4 text-emerald-600" />
                            Active Banners
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {activeBanners.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Image className="mb-3 h-9 w-9" />
                                <p className="font-medium">No active banners</p>
                                <p className="text-sm mt-1">Create a banner and activate it to show on the browse page.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {activeBanners.map((b, idx) => (
                                    <BannerListRow
                                        key={b.id}
                                        banner={b}
                                        isFirst={idx === 0}
                                        isLast={idx === activeBanners.length - 1}
                                        onEdit={() => setEditBanner(b)}
                                        onToggle={() => toggle(b)}
                                        onMoveUp={() => moveOrder(b, 'up')}
                                        onMoveDown={() => moveOrder(b, 'down')}
                                        onDelete={() => destroy(b)}
                                        canReorder
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Inactive banners */}
                {inactiveBanners.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <EyeOff className="h-4 w-4 text-gray-400" />
                                Inactive Banners
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {inactiveBanners.map((b) => (
                                    <BannerListRow
                                        key={b.id}
                                        banner={b}
                                        isFirst={false}
                                        isLast={false}
                                        onEdit={() => setEditBanner(b)}
                                        onToggle={() => toggle(b)}
                                        onMoveUp={() => {}}
                                        onMoveDown={() => {}}
                                        onDelete={() => destroy(b)}
                                        canReorder={false}
                                        activeCount={activeCount}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Archived */}
                {archivedBanners.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-gray-500">
                                <Trash2 className="h-4 w-4" />
                                Archived Banners
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {archivedBanners.map((b) => (
                                    <div key={b.id} className="flex items-center gap-4 px-4 py-3 opacity-60">
                                        {b.image_url ? (
                                            <img src={b.image_url} alt="" className="h-12 w-20 rounded-lg object-cover shrink-0" />
                                        ) : (
                                            <div className="h-12 w-20 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                                                <Image className="h-5 w-5 text-gray-400" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{b.title ?? '(no title)'}</p>
                                            <p className="text-xs text-gray-500 truncate">{b.subtitle ?? ''}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => restore(b)}
                                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                Restore
                                            </button>
                                            <button
                                                onClick={() => forceDelete(b)}
                                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <BannerForm
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                banner={null}
                activeCount={activeCount}
            />

            {editBanner && (
                <BannerForm
                    open
                    onClose={() => setEditBanner(null)}
                    banner={editBanner}
                    activeCount={activeCount}
                />
            )}
        </AppLayout>
    );
}

function BannerListRow({
    banner: b,
    isFirst,
    isLast,
    onEdit,
    onToggle,
    onMoveUp,
    onMoveDown,
    onDelete,
    canReorder,
    activeCount,
}: {
    banner: BannerRow;
    isFirst: boolean;
    isLast: boolean;
    onEdit: () => void;
    onToggle: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
    canReorder: boolean;
    activeCount?: number;
}) {
    return (
        <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
            {/* Reorder arrows */}
            {canReorder ? (
                <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                        onClick={onMoveUp}
                        disabled={isFirst}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={onMoveDown}
                        disabled={isLast}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : (
                <div className="w-6 shrink-0" />
            )}

            {/* Thumbnail */}
            {b.image_url ? (
                <img src={b.image_url} alt="" className="h-14 w-24 rounded-lg object-cover shrink-0 border border-gray-200" />
            ) : (
                <div className="h-14 w-24 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shrink-0">
                    <Image className="h-6 w-6 text-white/60" />
                </div>
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{b.title ?? <span className="text-gray-400 italic">No title</span>}</p>
                {b.subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{b.subtitle}</p>}
                {b.cta_text && (
                    <p className="text-xs text-blue-600 mt-0.5">
                        [{b.cta_text}] → {b.cta_url}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    onClick={onToggle}
                    title={b.is_active ? 'Deactivate' : 'Activate'}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        b.is_active
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                    } ${!b.is_active && (activeCount ?? 0) >= MAX_ACTIVE ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {b.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {b.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                    onClick={onEdit}
                    className="rounded-lg p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                >
                    <Pencil className="h-4 w-4" />
                </button>
                <button
                    onClick={onDelete}
                    className="rounded-lg p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Archive"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
