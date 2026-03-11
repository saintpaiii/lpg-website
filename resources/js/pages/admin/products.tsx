import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Edit2,
    Package,
    Plus,
    PowerOff,
    Search,
    Trash2,
    Zap,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type InventoryInfo = {
    quantity: number;
    reorder_level: number;
};

type Product = {
    id: number;
    name: string;
    brand: string | null;
    weight_kg: number;
    selling_price: number;
    cost_price: number;
    description: string | null;
    is_active: boolean;
    order_items_count: number;
    inventory: InventoryInfo | null;
};

type PaginatedProducts = {
    data: Product[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    products: PaginatedProducts;
    filters: { search?: string; status?: string };
};

type ProductForm = {
    name: string;
    brand: string;
    weight_kg: string;
    selling_price: string;
    cost_price: string;
    description: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Products', href: '/admin/products' }];

const emptyForm: ProductForm = {
    name: '',
    brand: '',
    weight_kg: '',
    selling_price: '',
    cost_price: '',
    description: '',
};

function peso(n: number): string {
    return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function StockCell({ inv }: { inv: InventoryInfo | null }) {
    if (!inv) return <span className="text-gray-400">—</span>;

    const isOut  = inv.quantity === 0;
    const isLow  = inv.quantity > 0 && inv.quantity <= inv.reorder_level;

    if (isOut) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" /> Out of stock
            </span>
        );
    }
    if (isLow) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" /> {inv.quantity} (low)
            </span>
        );
    }
    return <span className="font-medium text-gray-700">{inv.quantity}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProductsPage({ products, filters }: Props) {
    const { auth } = usePage<SharedData>().props;

    // ── Search / filter state ──────────────────────────────────────────────────
    const [search, setSearch]         = useState(filters.search ?? '');
    const [statusFilter, setStatus]   = useState(filters.status ?? '');

    useEffect(() => {
        const t = setTimeout(() => {
            router.get(
                '/admin/products',
                { search: search || undefined, status: statusFilter || undefined },
                { preserveState: true, replace: true },
            );
        }, 350);
        return () => clearTimeout(t);
    }, [search, statusFilter]);

    // ── Add / Edit dialog ──────────────────────────────────────────────────────
    const [dialogOpen, setDialogOpen]   = useState(false);
    const [editing, setEditing]         = useState<Product | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } =
        useForm<ProductForm>(emptyForm);

    // Live-compute profit from form fields
    const profit = (parseFloat(data.selling_price) || 0) - (parseFloat(data.cost_price) || 0);

    function openAdd() {
        setEditing(null);
        reset();
        clearErrors();
        setDialogOpen(true);
    }

    function openEdit(p: Product) {
        setEditing(p);
        setData({
            name:          p.name,
            brand:         p.brand ?? '',
            weight_kg:     p.weight_kg.toString(),
            selling_price: p.selling_price.toString(),
            cost_price:    p.cost_price.toString(),
            description:   p.description ?? '',
        });
        clearErrors();
        setDialogOpen(true);
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (editing) {
            put(`/admin/products/${editing.id}`, {
                onSuccess: () => { setDialogOpen(false); toast.success('Product updated.'); },
            });
        } else {
            post('/admin/products', {
                onSuccess: () => { setDialogOpen(false); reset(); toast.success('Product added.'); },
            });
        }
    }

    // ── Toggle active ──────────────────────────────────────────────────────────
    function handleToggle(p: Product) {
        router.patch(`/admin/products/${p.id}/toggle`, {}, {
            onSuccess: () => toast.success(p.is_active ? 'Product deactivated.' : 'Product activated.'),
        });
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

    function handleDelete() {
        if (!deleteTarget) return;
        router.delete(`/admin/products/${deleteTarget.id}`, {
            onSuccess: () => { setDeleteTarget(null); toast.success('Product deleted.'); },
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Products" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            {products.total} product{products.total !== 1 ? 's' : ''} total
                        </p>
                    </div>
                    <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Product
                    </Button>
                </div>

                {/* ── Filters ─────────────────────────────────────────────── */}
                <Card>
                    <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                className="pl-9"
                                placeholder="Search by name or brand…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Select
                            value={statusFilter || 'all'}
                            onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
                        >
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* ── Table ───────────────────────────────────────────────── */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4 text-blue-600" />
                            Product List
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {products.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Package className="mb-3 h-10 w-10" />
                                <p className="font-medium">No products found</p>
                                <p className="mt-1 text-sm">Try adjusting your search or add a new product.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Brand</th>
                                            <th className="px-4 py-3 text-right">Weight (kg)</th>
                                            <th className="px-4 py-3 text-right">Selling Price</th>
                                            <th className="px-4 py-3 text-right">Cost Price</th>
                                            <th className="px-4 py-3 text-right">Profit</th>
                                            <th className="px-4 py-3 text-center">Stock</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {products.data.map((p) => {
                                            const profit = p.selling_price - p.cost_price;
                                            return (
                                                <tr key={p.id} className="hover:bg-gray-50/60">
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        {p.name}
                                                        {p.description && (
                                                            <p className="mt-0.5 text-xs font-normal text-gray-400 truncate max-w-[160px]">
                                                                {p.description}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">{p.brand ?? '—'}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">{p.weight_kg}</td>
                                                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                                                        ₱{peso(p.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-600">
                                                        ₱{peso(p.cost_price)}
                                                    </td>
                                                    <td className={`px-4 py-3 text-right font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        ₱{peso(profit)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <StockCell inv={p.inventory} />
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {p.is_active ? (
                                                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                                                                Inactive
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => openEdit(p)}
                                                                title="Edit"
                                                                className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                                                            >
                                                                <Edit2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleToggle(p)}
                                                                title={p.is_active ? 'Deactivate' : 'Activate'}
                                                                className={`h-8 w-8 p-0 ${p.is_active ? 'text-gray-500 hover:text-amber-600' : 'text-gray-400 hover:text-emerald-600'}`}
                                                            >
                                                                {p.is_active ? (
                                                                    <PowerOff className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <Zap className="h-3.5 w-3.5" />
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setDeleteTarget(p)}
                                                                title={p.order_items_count > 0 ? 'Cannot delete — has orders' : 'Delete'}
                                                                disabled={p.order_items_count > 0}
                                                                className="h-8 w-8 p-0 text-gray-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {products.last_page > 1 && (
                            <div className="flex items-center justify-between border-t px-4 py-3">
                                <p className="text-sm text-gray-500">
                                    Showing {products.from}–{products.to} of {products.total}
                                </p>
                                <div className="flex gap-1">
                                    {products.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                                            className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                                                link.active
                                                    ? 'bg-blue-600 text-white'
                                                    : link.url
                                                    ? 'hover:bg-gray-100 text-gray-600'
                                                    : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Add / Edit Dialog ────────────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4">

                        {/* Name */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                placeholder="e.g. 11kg Petron Gasul"
                            />
                            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                        </div>

                        {/* Brand + Weight */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="brand">Brand</Label>
                                <Input
                                    id="brand"
                                    value={data.brand}
                                    onChange={(e) => setData('brand', e.target.value)}
                                    placeholder="e.g. Petron, Solane"
                                />
                                {errors.brand && <p className="text-xs text-red-500">{errors.brand}</p>}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="weight_kg">Weight (kg) *</Label>
                                <Input
                                    id="weight_kg"
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={data.weight_kg}
                                    onChange={(e) => setData('weight_kg', e.target.value)}
                                    placeholder="11"
                                />
                                {errors.weight_kg && <p className="text-xs text-red-500">{errors.weight_kg}</p>}
                            </div>
                        </div>

                        {/* Selling Price + Cost Price */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="selling_price">Selling Price (₱) *</Label>
                                <Input
                                    id="selling_price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={data.selling_price}
                                    onChange={(e) => setData('selling_price', e.target.value)}
                                    placeholder="850"
                                />
                                {errors.selling_price && <p className="text-xs text-red-500">{errors.selling_price}</p>}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="cost_price">Cost Price (₱) *</Label>
                                <Input
                                    id="cost_price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={data.cost_price}
                                    onChange={(e) => setData('cost_price', e.target.value)}
                                    placeholder="700"
                                />
                                {errors.cost_price && <p className="text-xs text-red-500">{errors.cost_price}</p>}
                            </div>
                        </div>

                        {/* Live profit preview */}
                        {(data.selling_price || data.cost_price) && (
                            <div className={`rounded-md px-3 py-2 text-sm font-medium ${profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                Profit per unit: ₱{peso(profit)}
                            </div>
                        )}

                        {/* Description */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="description">Description</Label>
                            <textarea
                                id="description"
                                rows={2}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                placeholder="Optional notes about this product…"
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                            />
                        </div>

                        {!editing && (
                            <p className="text-xs text-gray-500">
                                Stock will start at 0. Use Inventory to add stock after creating.
                            </p>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {processing ? 'Saving…' : editing ? 'Save Changes' : 'Add Product'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation ───────────────────────────────────── */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Product</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete <strong>{deleteTarget?.name}</strong>? This will also remove its inventory record and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
