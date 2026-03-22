import { Head, Link, router, useForm } from '@inertiajs/react';
import { ImageIcon, MessageSquare, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Products',  href: '/seller/products'  },
];

type Product = {
    id: number;
    name: string;
    brand: string;
    weight: string;
    description: string | null;
    refill_price: number;
    purchase_price: number;
    is_active: boolean;
    image_url: string | null;
    stock: number;
    reorder_level: number;
    avg_rating: number;
    review_count: number;
    created_at: string;
    deleted_at: string | null;
};

type Counts = { active: number; inactive: number; archived: number };
type Paginated = { data: Product[]; current_page: number; last_page: number; total: number };

type Props = {
    products: Paginated;
    counts: Counts;
    tab: string;
    search: string;
};

const TABS = [
    { key: 'active',   label: 'Active',   count_key: 'active'   },
    { key: 'inactive', label: 'Inactive', count_key: 'inactive' },
    { key: 'archived', label: 'Archived', count_key: 'archived' },
] as const;

type FormData = {
    name: string;
    brand: string;
    weight: string;
    description: string;
    refill_price: string;
    purchase_price: string;
    stock: string;
    reorder_level: string;
    image: File | null;
};

const EMPTY_FORM: FormData = {
    name: '', brand: '', weight: '', description: '',
    refill_price: '', purchase_price: '', stock: '', reorder_level: '10', image: null,
};

export default function SellerProducts({ products, counts, tab, search }: Props) {
    const [searchVal, setSearchVal] = useState(search);
    const [showForm, setShowForm]   = useState(false);
    const [editing, setEditing]     = useState<Product | null>(null);
    const [archiveTarget, setArchiveTarget]       = useState<Product | null>(null);
    const [forceDeleteTarget, setForceDeleteTarget] = useState<Product | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const { data, setData, post, processing, errors, reset, transform } = useForm<FormData>(EMPTY_FORM);

    function goTab(t: string) {
        router.get('/seller/products', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        router.get('/seller/products', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    function openCreate() {
        setEditing(null);
        reset();
        setPreview(null);
        setShowForm(true);
    }

    function openEdit(p: Product) {
        setEditing(p);
        setData({
            name: p.name, brand: p.brand, weight: p.weight,
            description: p.description ?? '', refill_price: String(p.refill_price),
            purchase_price: String(p.purchase_price), stock: String(p.stock),
            reorder_level: String(p.reorder_level), image: null,
        });
        setPreview(p.image_url);
        setShowForm(true);
    }

    function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('image', file);
        if (file) setPreview(URL.createObjectURL(file));
    }

    function submitForm(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        if (editing) {
            // PHP only parses multipart bodies for POST requests.
            // Use method spoofing (POST + _method=PUT) so $_POST and $_FILES are populated.
            transform(d => ({ ...d, _method: 'PUT' }));
            post(`/seller/products/${editing.id}`, {
                forceFormData: true,
                onSuccess: () => { setShowForm(false); reset(); },
            });
        } else {
            transform(d => d);
            post('/seller/products', {
                forceFormData: true,
                onSuccess: () => { setShowForm(false); reset(); },
            });
        }
    }

    function toggleProduct(p: Product) {
        router.patch(`/seller/products/${p.id}/toggle`);
    }

    function submitArchive() {
        router.delete(`/seller/products/${archiveTarget?.id}`, {
            onSuccess: () => setArchiveTarget(null),
        });
    }

    function submitForceDelete() {
        router.delete(`/seller/products/${forceDeleteTarget?.id}/force`, {
            onSuccess: () => setForceDeleteTarget(null),
        });
    }

    function restore(p: Product) {
        router.post(`/seller/products/${p.id}/restore`);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Products" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Package className="h-6 w-6 text-blue-600" />
                            Products
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Manage your store's product catalog.{' '}
                            <Link href="/seller/reviews" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                View Reviews
                            </Link>
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <form onSubmit={doSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search…" className="pl-9 w-48" value={searchVal}
                                    onChange={(e) => setSearchVal(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">Search</Button>
                        </form>
                        {tab !== 'archived' && (
                            <Button onClick={openCreate} size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Add Product
                            </Button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label, count_key }) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                            {counts[count_key] > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${tab === key ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                                    {counts[count_key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">Image</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Refill</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">New Purchase</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Stock</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Rating</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.data.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No products found.</td></tr>
                                    ) : products.data.map((p) => (
                                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded object-cover" />
                                                ) : (
                                                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{p.name}</p>
                                                <p className="text-xs text-muted-foreground">{p.brand} {p.weight && `· ${p.weight}`}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                ₱{p.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                ₱{p.purchase_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center hidden md:table-cell">
                                                <span className={`font-semibold ${p.stock <= p.reorder_level ? 'text-red-600' : 'text-foreground'}`}>
                                                    {p.stock}
                                                </span>
                                                <span className="text-xs text-muted-foreground"> / min {p.reorder_level}</span>
                                            </td>
                                            <td className="px-4 py-3 hidden lg:table-cell">
                                                {p.review_count > 0 ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-amber-400 text-xs">★</span>
                                                        <span className="text-sm font-medium">{p.avg_rating.toFixed(1)}</span>
                                                        <span className="text-xs text-muted-foreground">({p.review_count})</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {tab === 'archived' ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restore(p)}>Restore</Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => setForceDeleteTarget(p)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleProduct(p)}>
                                                            {p.is_active ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(p)}>
                                                            <Pencil className="h-3 w-3 mr-1" /> Edit
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => setArchiveTarget(p)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {products.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{products.total} products</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: products.last_page }, (_, i) => i + 1).map((pg) => (
                                        <button key={pg}
                                            onClick={() => router.get('/seller/products', { tab, search: searchVal, page: pg })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${pg === products.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {pg}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add/Edit Product Dialog */}
            <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); reset(); }}}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitForm} className="space-y-4">
                        {/* Image */}
                        <div className="grid gap-1.5">
                            <Label>Product Image {!editing && <span className="text-muted-foreground text-xs">(optional)</span>}</Label>
                            <div className="flex items-center gap-3">
                                <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                    {preview ? (
                                        <img src={preview} className="h-full w-full object-cover" alt="" />
                                    ) : (
                                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <input ref={fileRef} type="file" accept="image/jpg,image/jpeg,image/png"
                                        className="hidden" onChange={handleImageChange} />
                                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                                        Choose Image
                                    </Button>
                                    <p className="text-xs text-muted-foreground mt-1">JPG/PNG, max 5MB</p>
                                    {errors.image && <p className="text-xs text-red-500">{errors.image}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Name + Brand */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
                                <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)}
                                    placeholder="e.g. Gasul LPG" />
                                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="brand">Brand</Label>
                                <Input id="brand" value={data.brand} onChange={(e) => setData('brand', e.target.value)}
                                    placeholder="e.g. Petron" />
                            </div>
                        </div>

                        {/* Weight + Description */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="weight">Size/Weight</Label>
                                <Input id="weight" value={data.weight} onChange={(e) => setData('weight', e.target.value)}
                                    placeholder="e.g. 11kg" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="description">Description</Label>
                                <Input id="description" value={data.description} onChange={(e) => setData('description', e.target.value)}
                                    placeholder="Optional" />
                            </div>
                        </div>

                        {/* Prices */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="refill_price">Refill Price (₱) <span className="text-red-500">*</span></Label>
                                <Input id="refill_price" type="number" min="0" step="0.01" value={data.refill_price}
                                    onChange={(e) => setData('refill_price', e.target.value)} placeholder="0.00" />
                                {errors.refill_price && <p className="text-xs text-red-500">{errors.refill_price}</p>}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="purchase_price">New Purchase Price (₱) <span className="text-red-500">*</span></Label>
                                <Input id="purchase_price" type="number" min="0" step="0.01" value={data.purchase_price}
                                    onChange={(e) => setData('purchase_price', e.target.value)} placeholder="0.00" />
                                {errors.purchase_price && <p className="text-xs text-red-500">{errors.purchase_price}</p>}
                            </div>
                        </div>

                        {/* Stock + Reorder (only on create) */}
                        {!editing && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="stock">Initial Stock <span className="text-red-500">*</span></Label>
                                    <Input id="stock" type="number" min="0" value={data.stock}
                                        onChange={(e) => setData('stock', e.target.value)} placeholder="0" />
                                    {errors.stock && <p className="text-xs text-red-500">{errors.stock}</p>}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="reorder_level">Reorder Level <span className="text-red-500">*</span></Label>
                                    <Input id="reorder_level" type="number" min="0" value={data.reorder_level}
                                        onChange={(e) => setData('reorder_level', e.target.value)} />
                                    {errors.reorder_level && <p className="text-xs text-red-500">{errors.reorder_level}</p>}
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
                            <Button type="submit" disabled={processing}>
                                {processing && <Spinner className="mr-1.5" />}
                                {editing ? 'Save Changes' : 'Add Product'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Archive confirm */}
            <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archive Product</AlertDialogTitle>
                        <AlertDialogDescription>Archive <strong>{archiveTarget?.name}</strong>? It can be restored later.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitArchive} className="bg-red-600 hover:bg-red-700">Archive</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Force delete confirm */}
            <AlertDialog open={!!forceDeleteTarget} onOpenChange={(o) => { if (!o) setForceDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Permanently</AlertDialogTitle>
                        <AlertDialogDescription>Permanently delete <strong>{forceDeleteTarget?.name}</strong>? This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitForceDelete} className="bg-red-600 hover:bg-red-700">Delete Permanently</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
