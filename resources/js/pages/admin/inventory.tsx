import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    CheckCircle2,
    Filter,
    History,
    Package,
    Store,
    Warehouse,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type ProductRef = {
    id: number;
    name: string;
    brand: string | null;
    is_active?: boolean;
    store_name?: string | null;
    store_city?: string | null;
};

type InventoryRow = {
    id: number;
    quantity: number;
    reorder_level: number;
    product: ProductRef;
};

type TransactionType = 'in' | 'out' | 'adjustment' | 'order' | 'cancelled';

type TransactionRow = {
    id: number;
    type: TransactionType;
    quantity: number;
    reference: string | null;
    notes: string | null;
    created_at: string;
    product: { id: number; name: string; brand: string | null } | null;
    user: { name: string } | null;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type OverviewProps = {
    tab: 'overview';
    inventories: Paginated<InventoryRow>;
    productList: { id: number; name: string; brand: string | null }[];
    filters: { search?: string; tab?: string };
};

type TransactionsProps = {
    tab: 'transactions';
    transactions: Paginated<TransactionRow>;
    productList: { id: number; name: string; brand: string | null }[];
    filters: { product_id?: string; type?: string; date_from?: string; date_to?: string; tab?: string };
};

type Props = OverviewProps | TransactionsProps;

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Inventory', href: '/admin/inventory' }];

const TX_LABELS: Record<TransactionType, string> = {
    in:         'Stock In',
    out:        'Stock Out',
    adjustment: 'Adjustment',
    order:      'Order',
    cancelled:  'Cancelled',
};

const TX_VARIANTS: Record<TransactionType, string> = {
    in:         'bg-emerald-100 text-emerald-700',
    out:        'bg-amber-100 text-amber-700',
    adjustment: 'bg-blue-100 text-blue-700',
    order:      'bg-purple-100 text-purple-700',
    cancelled:  'bg-gray-100 text-gray-500',
};

// ── Small components ───────────────────────────────────────────────────────────

function StockStatusBadge({ qty, reorder }: { qty: number; reorder: number }) {
    if (qty === 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-3 w-3" /> Critical
            </span>
        );
    }
    if (qty <= reorder) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Low
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> OK
        </span>
    );
}

function TxTypeBadge({ type }: { type: TransactionType }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TX_VARIANTS[type]}`}>
            {TX_LABELS[type]}
        </span>
    );
}

function Pagination({ data, onVisit }: { data: Paginated<any>; onVisit: (url: string) => void }) {
    if (data.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
                Showing {data.from}–{data.to} of {data.total}
            </p>
            <div className="flex gap-1">
                {data.links.map((link, i) => (
                    <button
                        key={i}
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url!)}
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
    );
}


// ── Stock Overview tab ─────────────────────────────────────────────────────────

function StockOverview({ inventories, filters }: OverviewProps) {
    const [search, setSearch] = useState(filters.search ?? '');

    function doSearch(val: string) {
        setSearch(val);
        router.get('/admin/inventory', { tab: 'overview', search: val || undefined }, { preserveState: true, replace: true });
    }

    const lowCount      = inventories.data.filter(i => i.quantity > 0 && i.quantity <= i.reorder_level).length;
    const criticalCount = inventories.data.filter(i => i.quantity === 0).length;

    return (
        <>
            {/* Summary chips */}
            {(criticalCount > 0 || lowCount > 0) && (
                <div className="flex flex-wrap gap-2">
                    {criticalCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {criticalCount} out of stock
                        </span>
                    )}
                    {lowCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {lowCount} low stock
                        </span>
                    )}
                </div>
            )}

            {/* Search */}
            <Card>
                <CardContent className="pt-5">
                    <div className="relative max-w-sm">
                        <Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                            className="pl-9"
                            placeholder="Search by product or brand…"
                            value={search}
                            onChange={(e) => doSearch(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Warehouse className="h-4 w-4 text-blue-600" />
                        Stock Levels
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {inventories.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <Warehouse className="mb-3 h-10 w-10" />
                            <p className="font-medium">No inventory records found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3">Brand</th>
                                        <th className="px-4 py-3">Store</th>
                                        <th className="px-4 py-3 text-right">Stock</th>
                                        <th className="px-4 py-3 text-right">Reorder At</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {inventories.data.map((row) => (
                                        <tr key={row.id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                {row.product.name}
                                                {!row.product.is_active && (
                                                    <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{row.product.brand ?? '—'}</td>
                                            <td className="px-4 py-3">
                                                {row.product.store_name ? (
                                                    <div className="flex items-center gap-1 text-xs">
                                                        <Store className="h-3 w-3 text-gray-400 shrink-0" />
                                                        <div>
                                                            <p className="font-medium text-gray-800">{row.product.store_name}</p>
                                                            {row.product.store_city && <p className="text-gray-400">{row.product.store_city}</p>}
                                                        </div>
                                                    </div>
                                                ) : <span className="text-xs text-gray-400">—</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold tabular-nums ${
                                                row.quantity === 0
                                                    ? 'text-red-600'
                                                    : row.quantity <= row.reorder_level
                                                    ? 'text-amber-600'
                                                    : 'text-gray-900'
                                            }`}>
                                                {row.quantity}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                                                {row.reorder_level}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <StockStatusBadge qty={row.quantity} reorder={row.reorder_level} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination
                        data={inventories}
                        onVisit={(url) => router.visit(url, { preserveState: true })}
                    />
                </CardContent>
            </Card>

        </>
    );
}

// ── Transaction History tab ────────────────────────────────────────────────────

function TransactionHistory({ transactions, productList, filters }: TransactionsProps) {
    const [productId, setProductId] = useState(filters.product_id ?? '');
    const [type, setType]           = useState(filters.type ?? '');
    const [dateFrom, setDateFrom]   = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]       = useState(filters.date_to ?? '');

    function applyFilters() {
        router.get(
            '/admin/inventory',
            {
                tab:        'transactions',
                product_id: productId || undefined,
                type:       type || undefined,
                date_from:  dateFrom || undefined,
                date_to:    dateTo || undefined,
            },
            { preserveState: true, replace: true },
        );
    }

    function clearFilters() {
        setProductId('');
        setType('');
        setDateFrom('');
        setDateTo('');
        router.get('/admin/inventory', { tab: 'transactions' }, { preserveState: false });
    }

    const hasFilters = productId || type || dateFrom || dateTo;

    return (
        <>
            {/* Filters */}
            <Card>
                <CardContent className="pt-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Product */}
                        <Select
                            value={productId || 'all'}
                            onValueChange={(v) => setProductId(v === 'all' ? '' : v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="All products" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All products</SelectItem>
                                {productList.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                        {p.name}{p.brand ? ` (${p.brand})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Type */}
                        <Select
                            value={type || 'all'}
                            onValueChange={(v) => setType(v === 'all' ? '' : v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="in">Stock In</SelectItem>
                                <SelectItem value="out">Stock Out</SelectItem>
                                <SelectItem value="adjustment">Adjustment</SelectItem>
                                <SelectItem value="order">Order</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Date From */}
                        <div className="grid gap-1">
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                placeholder="From date"
                            />
                        </div>

                        {/* Date To */}
                        <div className="grid gap-1">
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                placeholder="To date"
                            />
                        </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Filter className="mr-1.5 h-3.5 w-3.5" />
                            Apply Filters
                        </Button>
                        {hasFilters && (
                            <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4 text-blue-600" />
                        Transaction History
                        <span className="ml-auto text-sm font-normal text-gray-400">
                            {transactions.total} record{transactions.total !== 1 ? 's' : ''}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {transactions.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <History className="mb-3 h-10 w-10" />
                            <p className="font-medium">No transactions found</p>
                            <p className="mt-1 text-sm">Try adjusting your filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Date & Time</th>
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3 text-right">Qty</th>
                                        <th className="px-4 py-3">Notes / Reference</th>
                                        <th className="px-4 py-3">Done By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {transactions.data.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-gray-50/60">
                                            <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                                                {fmtDate(tx.created_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {tx.product ? (
                                                    <span className="font-medium text-gray-900">
                                                        {tx.product.name}
                                                        {tx.product.brand && (
                                                            <span className="ml-1 text-xs text-gray-400">
                                                                ({tx.product.brand})
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <TxTypeBadge type={tx.type} />
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold tabular-nums ${
                                                tx.type === 'in' ? 'text-emerald-600' :
                                                tx.type === 'out' || tx.type === 'order' ? 'text-amber-600' :
                                                'text-gray-700'
                                            }`}>
                                                {tx.type === 'in' ? '+' : tx.type === 'out' || tx.type === 'order' ? '−' : ''}
                                                {tx.quantity}
                                            </td>
                                            <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">
                                                {tx.reference && (
                                                    <span className="mr-1 font-mono text-xs text-blue-600">
                                                        [{tx.reference}]
                                                    </span>
                                                )}
                                                {tx.notes ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {tx.user?.name ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination
                        data={transactions}
                        onVisit={(url) => router.visit(url, { preserveState: true })}
                    />
                </CardContent>
            </Card>
        </>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InventoryPage(props: Props) {
    const { tab } = props;

    function switchTab(newTab: string) {
        router.get('/admin/inventory', { tab: newTab }, { preserveState: false });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Inventory" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
                    <p className="mt-0.5 text-sm text-gray-500">
                        Read-only overview of stock levels across all stores. Sellers manage their own inventory.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
                    <button
                        onClick={() => switchTab('overview')}
                        className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            tab === 'overview'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Warehouse className="h-3.5 w-3.5" />
                        Stock Overview
                    </button>
                    <button
                        onClick={() => switchTab('transactions')}
                        className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            tab === 'transactions'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <History className="h-3.5 w-3.5" />
                        Transaction History
                    </button>
                </div>

                {/* Tab content */}
                {tab === 'overview'
                    ? <StockOverview {...(props as OverviewProps)} />
                    : <TransactionHistory {...(props as TransactionsProps)} />
                }
            </div>
        </AppLayout>
    );
}
