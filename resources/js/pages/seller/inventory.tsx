import { Head, router, useForm } from '@inertiajs/react';
import { Layers, Lock, Minus, PackageX, Plus, Search, Truck, Warehouse } from 'lucide-react';
import { NewTransferDialog, TransfersList, type TransferRow } from '@/components/stock-transfers';
import { BatchesDialog, DamagedDialog, HeldCylindersCard, ReturnsCard, type Batch, type Incident, type ReturnRow } from '@/components/inventory-cylinders';
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
import { NotePicker } from '@/components/reason-picker';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Inventory', href: '/seller/inventory'  },
];

type InventoryRow = {
    id: number;
    /** FILLED (sellable incl. expired batches) */
    quantity: number;
    reorder_level: number;
    /** J7: filled minus expired batches */
    usable?: number;
    /** K6: filled stock with no batch (from before J7) — "Add dates to old stock" */
    undated?: number;
    empty_quantity?: number;
    damaged_quantity?: number;
    expired?: number;
    expiring?: { qty: number; days: number } | null;
    batches?: Batch[];
    reorder?: { text: string; due: boolean; suggested_qty: number; supplier_name: string | null } | null;
    product: { id: number; name: string; brand: string; is_active: boolean; product_type?: 'lpg' | 'accessory' };
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
    tab: 'overview' | 'transactions' | 'transfers';
    inventories?: { data: InventoryRow[]; current_page: number; last_page: number; total: number };
    transactions?: { data: Transaction[]; current_page: number; last_page: number; total: number };
    productList: ProductOption[];
    filters: Record<string, string>;
    /** J7 */
    incidents?: Incident[];
    returns?: ReturnRow[];
    suppliers?: { id: number; name: string }[];
    reasons?: Record<string, string>;
    /** J9: stock transfers in / out of this store */
    transfers?: TransferRow[];
    transferCan?: { send: boolean; reason: string | null };
    storeId?: number;
};

type StockFormData = { quantity: string; notes: string; requalification_due_on: string; manufactured_on: string; batch_code: string };

const TX_COLORS: Record<string, string> = {
    in:         'text-green-600',
    out:        'text-red-600',
    order:      'text-orange-600',
    cancelled:  'text-blue-600',
    adjustment: 'text-muted-foreground',
    empty_in:   'text-sky-600',
    empty_out:  'text-sky-700 dark:text-sky-300',
    damaged:    'text-red-700 dark:text-red-300',
    expired:    'text-red-700 dark:text-red-300',
    returned_to_supplier: 'text-purple-600',
    transfer_out: 'text-violet-700 dark:text-violet-300',
    transfer_in:  'text-violet-600',
};

export default function SellerInventory({ tab, inventories, transactions, productList, filters, incidents = [], returns = [], suppliers = [], reasons = {}, transfers = [], transferCan, storeId }: Props) {
    // J9: New stock transfer dialog (Transfers tab)
    const [newTransfer, setNewTransfer] = useState(false);
    // J7: batches drawer (also opened from an expiry notification: ?batches=<product id>) + damaged dialog
    const [batchesFor, setBatchesFor] = useState<InventoryRow | null>(() => inventories?.data.find((i) => String(i.product.id) === filters.batches) ?? null);
    const [damagedFor, setDamagedFor] = useState<InventoryRow | null>(null);
    const [search, setSearch]       = useState(filters.search ?? '');
    const [stockTarget, setStockTarget] = useState<InventoryRow | null>(null);
    const [stockType, setStockType]     = useState<'in' | 'out'>('in');
    const [reorderTarget, setReorderTarget] = useState<InventoryRow | null>(null);
    const [reorderVal, setReorderVal]       = useState('');

    const { data, setData, post, processing, reset, errors } = useForm<StockFormData>({ quantity: '', notes: '', requalification_due_on: '', manufactured_on: '', batch_code: '' });
    const isLpg = (inv: InventoryRow | null) => (inv?.product?.product_type ?? 'lpg') === 'lpg';

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
                <div className="flex gap-1 overflow-x-auto border-b scrollbar-none [&>button]:shrink-0 [&>button]:whitespace-nowrap">
                    {['overview', 'transactions', 'transfers'].map((t) => (
                        <button key={t} onClick={() => goTab(t)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {t === 'overview' ? 'Stock Overview' : t === 'transactions' ? 'Transactions' : 'Transfers'}
                        </button>
                    ))}
                </div>

                {tab === 'overview' && inventories && (
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="rt-cards w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Filled</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground" title="Empty cylinders collected on refills">Empty</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground" title="Held aside — not sellable">Damaged</th>
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Reorder Level</th>
                                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventories.data.length === 0 ? (
                                            <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No products found.</td></tr>
                                        ) : inventories.data.map((inv) => (
                                            <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium">{inv.product?.name ?? '—'}</p>
                                                    <p className="text-xs text-muted-foreground">{inv.product?.product_type === 'accessory' ? 'Accessory' : inv.product?.brand ?? ''}</p>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {inv.expiring && <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-px text-xs font-semibold text-amber-800 dark:text-amber-300" data-testid="expiring-badge">Expiring soon: {inv.expiring.qty} (in {inv.expiring.days} days)</span>}
                                                        {!!inv.expired && <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-px text-xs font-semibold text-red-700 dark:text-red-300" data-testid="expired-badge">Expired: {inv.expired}</span>}
                                                    </div>
                                                    {inv.reorder && <p className={`mt-1 text-xs ${inv.reorder.due ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground'}`} title="How auto-reorder decides">{inv.reorder.text}</p>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-bold text-lg ${inv.quantity === 0 ? 'text-red-600' : inv.quantity <= inv.reorder_level ? 'text-amber-600' : 'text-foreground'}`}>
                                                        {inv.quantity}
                                                    </span>
                                                    {inv.quantity <= inv.reorder_level && (
                                                        <p className="text-xs text-amber-600">Low stock</p>
                                                    )}
                                                    {inv.usable !== undefined && inv.usable !== inv.quantity && <p className="text-xs text-red-600">{inv.usable} usable</p>}
                                                </td>
                                                <td className="px-4 py-3 text-center tabular-nums">{isLpg(inv) ? inv.empty_quantity ?? 0 : '—'}</td>
                                                <td className={`px-4 py-3 text-center tabular-nums ${inv.damaged_quantity ? 'font-semibold text-red-600' : ''}`}>{isLpg(inv) ? inv.damaged_quantity ?? 0 : '—'}</td>
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
                                                            {isLpg(inv) && <>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBatchesFor(inv)} aria-label={`Batches of ${inv.product.name}`}>
                                                                    <Layers className="h-3 w-3 mr-1" /> Batches
                                                                </Button>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => setDamagedFor(inv)} aria-label={`Record damaged ${inv.product.name}`}>
                                                                    <PackageX className="h-3 w-3 mr-1" /> Damaged
                                                                </Button>
                                                            </>}
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

                {tab === 'overview' && <HeldCylindersCard incidents={incidents} suppliers={suppliers} />}
                {tab === 'overview' && <ReturnsCard returns={returns} />}

                {/* J9: stock transfers between the owner's stores */}
                {tab === 'transfers' && (
                    <Card>
                        <CardContent className="p-0">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                                <p className="text-sm text-muted-foreground">Stock sent to or received from the owner's other stores.</p>
                                {transferCan?.send ? (
                                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setNewTransfer(true)} data-testid="new-transfer">
                                        <Truck className="mr-1.5 h-4 w-4" /> New transfer
                                    </Button>
                                ) : (
                                    <Button size="sm" disabled title={transferCan?.reason ?? undefined}><Lock className="mr-1.5 h-4 w-4" /> New transfer</Button>
                                )}
                            </div>
                            {!transferCan?.send && transferCan?.reason && <p className="border-b px-4 py-2 text-xs text-muted-foreground">{transferCan.reason}</p>}
                            <TransfersList transfers={transfers} storeId={storeId} />
                        </CardContent>
                    </Card>
                )}
                {newTransfer && <NewTransferDialog open={newTransfer} onClose={() => setNewTransfer(false)} preset={{ from_store_id: storeId }} />}

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
                                        {['all', 'in', 'out', 'order', 'cancelled', 'adjustment', 'empty_in', 'empty_out', 'damaged', 'expired', 'returned_to_supplier', 'transfer_out', 'transfer_in'].map((t) => (
                                            <SelectItem key={t} value={t} className="text-xs capitalize">{t === 'all' ? 'All types' : t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="rt-cards w-full text-sm">
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
                                                    <span className={`text-xs font-medium capitalize ${TX_COLORS[tx.type] ?? 'text-muted-foreground'}`}>{tx.type.replace(/_/g, ' ')}</span>
                                                </td>
                                                <td className={`px-4 py-3 text-center font-bold ${TX_COLORS[tx.type] ?? ''}`}>
                                                    {['out', 'order', 'empty_out', 'damaged', 'expired', 'returned_to_supplier', 'transfer_out'].includes(tx.type) ? `−${tx.quantity}` : `+${tx.quantity}`}
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
                        {stockType === 'in' && isLpg(stockTarget) && (
                            <div className="grid gap-2 sm:grid-cols-3" data-testid="stock-in-batch">
                                <div className="grid gap-1.5">
                                    <Label>Requalification date <span className="text-red-500">*</span></Label>
                                    <Input type="date" value={data.requalification_due_on} onChange={(e) => setData('requalification_due_on', e.target.value)} />
                                    {errors.requalification_due_on && <p className="text-xs text-red-500">{errors.requalification_due_on}</p>}
                                </div>
                                <div className="grid gap-1.5"><Label>Manufactured</Label><Input type="date" value={data.manufactured_on} onChange={(e) => setData('manufactured_on', e.target.value)} /></div>
                                <div className="grid gap-1.5"><Label>Batch code</Label><Input value={data.batch_code} placeholder="auto" onChange={(e) => setData('batch_code', e.target.value)} /></div>
                                <p className="text-xs text-muted-foreground sm:col-span-3">The date stamped on the cylinder collar. Orders sell the oldest batch first; expired cylinders are never sold.</p>
                            </div>
                        )}
                        <div className="grid gap-1.5">
                            <Label>Notes</Label>
                            <NotePicker
                                context="stock_note"
                                value={data.notes}
                                onChange={(v) => setData('notes', v)}
                                rows={2}
                                placeholder="Optional"
                            />
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

            {/* J7: batches + damaged */}
            {/* The row is re-read from the page props so the drawer updates after "Mark as expired" / "Add dates to old stock" */}
            <BatchesDialog open={!!batchesFor} onClose={() => setBatchesFor(null)} productId={batchesFor?.product.id ?? 0} productName={batchesFor?.product.name ?? ''}
                batches={(inventories?.data.find((i) => i.id === batchesFor?.id) ?? batchesFor)?.batches ?? []}
                undated={(inventories?.data.find((i) => i.id === batchesFor?.id) ?? batchesFor)?.undated ?? 0} />
            <DamagedDialog open={!!damagedFor} onClose={() => setDamagedFor(null)} product={damagedFor?.product ?? null} batches={damagedFor?.batches ?? []} reasons={reasons} />

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
