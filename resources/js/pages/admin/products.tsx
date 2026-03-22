import { Head, router } from '@inertiajs/react';
import { AlertTriangle, Package, Search, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type InventoryInfo = { quantity: number; reorder_level: number };

type Product = {
    id: number;
    name: string;
    brand: string | null;
    weight: string | null;
    weight_kg: number;
    refill_price: number;
    purchase_price: number;
    description: string | null;
    is_active: boolean;
    order_items_count: number;
    store_id: number | null;
    store_name: string | null;
    store_city: string | null;
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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Products', href: '/admin/products' }];

function peso(n: number) {
    return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2 }).format(n);
}

function StockCell({ inv }: { inv: InventoryInfo | null }) {
    if (!inv) return <span className="text-gray-400">—</span>;
    if (inv.quantity === 0) return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <AlertTriangle className="h-3 w-3" /> Out
        </span>
    );
    if (inv.quantity <= inv.reorder_level) return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" /> {inv.quantity} (low)
        </span>
    );
    return <span className="font-medium text-gray-700">{inv.quantity}</span>;
}

export default function ProductsPage({ products, filters }: Props) {
    const [search, setSearch]       = useState(filters.search ?? '');
    const [statusFilter, setStatus] = useState(filters.status ?? '');

    useEffect(() => {
        const t = setTimeout(() => {
            router.get('/admin/products', { search: search || undefined, status: statusFilter || undefined }, { preserveState: true, replace: true });
        }, 350);
        return () => clearTimeout(t);
    }, [search, statusFilter]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Products" />
            <div className="flex flex-1 flex-col gap-6 p-6">

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Products</h1>
                    <p className="mt-0.5 text-sm text-gray-500">
                        Read-only overview of all products across all stores — {products.total} total.
                    </p>
                </div>

                <Card>
                    <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input className="pl-9" placeholder="Search by name, brand, or store…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4 text-blue-600" />
                            All Store Products
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {products.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Package className="mb-3 h-10 w-10" />
                                <p className="font-medium">No products found</p>
                                <p className="mt-1 text-sm">Products are managed by individual sellers.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Brand</th>
                                            <th className="px-4 py-3">Weight</th>
                                            <th className="px-4 py-3 text-right">Refill</th>
                                            <th className="px-4 py-3 text-right">New Purchase</th>
                                            <th className="px-4 py-3 text-center">Stock</th>
                                            <th className="px-4 py-3">Store</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {products.data.map((p) => (
                                            <tr key={p.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3 font-medium text-gray-900">
                                                    {p.name}
                                                    {p.description && (
                                                        <p className="mt-0.5 text-xs font-normal text-gray-400 truncate max-w-[160px]">{p.description}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">{p.brand ?? '—'}</td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {p.weight ?? (p.weight_kg ? `${p.weight_kg} kg` : '—')}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-gray-900">₱{peso(p.refill_price)}</td>
                                                <td className="px-4 py-3 text-right text-gray-600">₱{peso(p.purchase_price)}</td>
                                                <td className="px-4 py-3 text-center"><StockCell inv={p.inventory} /></td>
                                                <td className="px-4 py-3">
                                                    {p.store_name ? (
                                                        <div className="flex items-center gap-1 text-xs">
                                                            <Store className="h-3 w-3 text-gray-400 shrink-0" />
                                                            <div>
                                                                <p className="font-medium text-gray-800">{p.store_name}</p>
                                                                {p.store_city && <p className="text-gray-400">{p.store_city}</p>}
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-xs text-gray-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {p.is_active ? (
                                                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {products.last_page > 1 && (
                            <div className="flex items-center justify-between border-t px-4 py-3">
                                <p className="text-sm text-gray-500">Showing {products.from}–{products.to} of {products.total}</p>
                                <div className="flex gap-1">
                                    {products.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                                            className={`min-w-[32px] rounded px-2 py-1 text-sm ${link.active ? 'bg-blue-600 text-white' : link.url ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
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
