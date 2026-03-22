import { Head, router, useForm } from '@inertiajs/react';
import { Minus, Plus, Search, Warehouse } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import AppLayout from '@/layouts/app-layout';
import { fmtDateTime } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Inventory', href: '/seller/inventory'  },
];

type InventoryRow = {
    id: number;
    quantity: number;
    reorder_level: number;
    product: { id: number; name: string; brand: string; is_active: boolean };
};

type Transaction = {
    id: number;
    type: string;
    quantity: number;
    reference: string | null;
    notes: string | null;
    created_at: string;
    product: { id: number; name: string; brand: string } | null;
    user: { name: string } | null;
};

type ProductOption = { id: number; name: string; brand: string };

type Props = {
    tab: 'overview' | 'transactions';
    inventories?: { data: InventoryRow[]; current_page: number; last_page: number; total: number };
    transactions?: { data: Transaction[]; current_page: number; last_page: number; total: number };
    productList: ProductOption[];
    filters: Record<string, string>;
};

type StockFormData = { quantity: string; notes: string };

const TX_COLORS: Record<string, string> = {
    in:         'text-green-600',
    out:        'text-red-600',
    order:      'text-orange-600',
    cancelled:  'text-blue-600',
    adjustment: 'text-gray-600',
};

export default function SellerInventory({ tab, inventories, transactions, productList, filters }: Props) {
    const [search, setSearch]       = useState(filters.search ?? '');
    const [stockTarget, setStockTarget] = useState<InventoryRow | null>(null);
    const [stockType, setStockType]     = useState<'in' | 'out'>('in');
    const [reorderTarget, setReorderTarget] = useState<InventoryRow | null>(null);
    const [reorderVal, setReorderVal]       = useState('');

    const { data, setData, post, processing, reset, errors } = useForm<StockFormData>({ quantity: '', notes: '' });

    function goTab(t: string) {
        router.get('/seller/inventory', { tab: t }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        router.get('/seller/inventory', { tab: 'overview', search }, { preserveState: true, replace: true });
    }

    function submitStock(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        const target = stockTarget;
        if (!target?.product?.id) return;
        const url = stockType === 'in'
            ? `/seller/inventory/${target.product.id}/stock-in`
            : `/seller/inventory/${target.product.id}/stock-out`;
        post(url, { onSuccess: () => { setStockTarget(null); reset(); } });
    }

    function submitReorder() {
        const target = reorderTarget;
        if (!target?.product?.id) return;
        router.patch(`/seller/inventory/${target.product.id}/reorder-level`, { reorder_level: reorderVal }, {
            onSuccess: () => setReorderTarget(null),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Inventory" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Warehouse className="h-6 w-6 text-blue-600" />
                            Inventory
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">Stock levels and transaction history for your products.</p>
                    </div>
                    {tab === 'overview' && (
                        <form onSubmit={doSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search products…" className="pl-9 w-48" value={search}
                                    onChange={(e) => setSearch(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">Search</Button>
                        </form>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {['overview', 'transactions'].map((t) => (
                        <button key={t} onClick={() => goTab(t)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {t === 'overview' ? 'Stock Overview' : 'Transactions'}
                        </button>
                    ))}
                </div>

                {tab === 'overview' && inventories && (
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Stock</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Reorder Level</th>
                                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventories.data.length === 0 ? (
                                            <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">No products found.</td></tr>
                                        ) : inventories.data.map((inv) => (
                                            <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium">{inv.product?.name ?? '—'}</p>
                                                    <p className="text-xs text-muted-foreground">{inv.product?.brand ?? ''}</p>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-bold text-lg ${inv.quantity === 0 ? 'text-red-600' : inv.quantity <= inv.reorder_level ? 'text-amber-600' : 'text-foreground'}`}>
                                                        {inv.quantity}
                                                    </span>
                                                    {inv.quantity <= inv.reorder_level && (
                                                        <p className="text-xs text-amber-600">Low stock</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-muted-foreground">
                                                    {inv.product?.id ? (
                                                        <button
                                                            onClick={() => { setReorderTarget(inv); setReorderVal(String(inv.reorder_level)); }}
                                                            className="hover:underline hover:text-blue-600">
                                                            {inv.reorder_level}
                                                        </button>
                                                    ) : (
                                                        <span>{inv.reorder_level}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {inv.product?.id ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button size="sm" variant="outline" className="h-7 text-xs"
                                                                onClick={() => { setStockTarget(inv); setStockType('in'); }}>
                                                                <Plus className="h-3 w-3 mr-1" /> In
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="h-7 text-xs"
                                                                onClick={() => { setStockTarget(inv); setStockType('out'); }}>
                                                                <Minus className="h-3 w-3 mr-1" /> Out
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {inventories.last_page > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                    <span>{inventories.total} products</span>
                                    <div className="flex gap-1">
                                        {Array.from({ length: inventories.last_page }, (_, i) => i + 1).map((pg) => (
                                            <button key={pg}
                                                onClick={() => router.get('/seller/inventory', { tab: 'overview', search, page: pg })}
                                                className={`w-8 h-8 rounded text-xs font-medium ${pg === inventories.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                                {pg}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {tab === 'transactions' && transactions && (
                    <Card>
                        <CardContent className="p-0">
                            {/* Filters */}
                            <div className="flex flex-wrap gap-3 p-4 border-b">
                                <Select value={filters.product_id ?? 'all'} onValueChange={(v) => router.get('/seller/inventory', { tab: 'transactions', ...filters, product_id: v === 'all' ? undefined : v }, { preserveState: true, replace: true })}>
                                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All products" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All products</SelectItem>
                                        {productList.map((p) => <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name} ({p.brand})</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={filters.type ?? 'all'} onValueChange={(v) => router.get('/seller/inventory', { tab: 'transactions', ...filters, type: v === 'all' ? undefined : v }, { preserveState: true, replace: true })}>
                                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                                    <SelectContent>
                                        {['all', 'in', 'out', 'order', 'cancelled', 'adjustment'].map((t) => (
                                            <SelectItem key={t} value={t} className="text-xs capitalize">{t === 'all' ? 'All types' : t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.data.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No transactions found.</td></tr>
                                        ) : transactions.data.map((tx) => (
                                            <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium">{tx.product?.name ?? '—'}</p>
                                                    <p className="text-xs text-muted-foreground">{tx.product?.brand ?? ''}</p>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-xs font-medium capitalize ${TX_COLORS[tx.type] ?? 'text-gray-600'}`}>{tx.type}</span>
                                                </td>
                                                <td className={`px-4 py-3 text-center font-bold ${TX_COLORS[tx.type] ?? ''}`}>
                                                    {['out', 'order'].includes(tx.type) ? `−${tx.quantity}` : `+${tx.quantity}`}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                                                    {tx.reference && <span className="font-mono">{tx.reference}</span>}
                                                    {tx.notes && <span className="ml-1">{tx.notes}</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                                                    {fmtDateTime(tx.created_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Stock In/Out dialog */}
            <AlertDialog open={!!stockTarget} onOpenChange={(o) => { if (!o) { setStockTarget(null); reset(); }}}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stock {stockType === 'in' ? 'In' : 'Out'} — {stockTarget?.product.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {stockType === 'in' ? 'Add stock to inventory.' : `Remove stock. Current: ${stockTarget?.quantity} unit(s).`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form onSubmit={submitStock} className="space-y-3">
                        <div className="grid gap-1.5">
                            <Label>Quantity <span className="text-red-500">*</span></Label>
                            <Input type="number" min="1" value={data.quantity} onChange={(e) => setData('quantity', e.target.value)} placeholder="0" />
                            {errors.quantity && <p className="text-xs text-red-500">{errors.quantity}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Notes</Label>
                            <Input value={data.notes} onChange={(e) => setData('notes', e.target.value)} placeholder="Optional" />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                            <Button type="submit" disabled={processing} className={stockType === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}>
                                {processing && <Spinner className="mr-1.5" />}
                                {stockType === 'in' ? 'Add Stock' : 'Remove Stock'}
                            </Button>
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reorder level dialog */}
            <AlertDialog open={!!reorderTarget} onOpenChange={(o) => { if (!o) setReorderTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Update Reorder Level</AlertDialogTitle>
                        <AlertDialogDescription>Set the minimum stock level for <strong>{reorderTarget?.product.name}</strong>.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input type="number" min="0" value={reorderVal} onChange={(e) => setReorderVal(e.target.value)} />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitReorder} className="bg-blue-600 hover:bg-blue-700">Update</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
