import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Banknote, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileDown, Store } from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

type Status = 'pending' | 'collected' | 'failed';

interface Summary {
    total_earned: number;
    collected: number;
    pending: number;
    this_month: number;
    gross_sales: number;
    orders: number;
}

interface StoreRow {
    store_id: number;
    store_name: string;
    orders: number;
    gross_sales: number;
    commission_total: number;
    collected: number;
    pending: number;
}

interface CommissionRow {
    id: number;
    order_number: string | null;
    payment_mode: 'full' | 'consignment' | 'cod' | null;
    store_name: string | null;
    order_total: number;
    commission_rate: number;
    commission_amount: number;
    seller_amount: number;
    status: Status;
    collected_at: string | null;
    created_at: string;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

interface Props {
    summary: Summary;
    by_store: StoreRow[];
    commissions: Paginated<CommissionRow>;
    stores: { id: number; store_name: string }[];
    filters: { status?: string; store_id?: string; date_from?: string; date_to?: string; search?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Commissions', href: '/admin/commissions' }];

const fmt = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

const STATUS_STYLES: Record<Status, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    collected: 'bg-green-100 text-green-800',
    failed:    'bg-red-100 text-red-700',
};

const MODE_LABELS: Record<string, string> = { full: 'Full', consignment: 'Consignment', cod: 'COD' };

const inputCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function AdminCommissions({ summary, by_store, commissions, stores, filters }: Props) {
    const [status,   setStatus]   = useState(filters.status ?? '');
    const [storeId,  setStoreId]  = useState(filters.store_id ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo,   setDateTo]   = useState(filters.date_to ?? '');
    const [search,   setSearch]   = useState(filters.search ?? '');

    const params = { status, store_id: storeId, date_from: dateFrom, date_to: dateTo, search };

    function visit(extra: Record<string, string | number> = {}) {
        router.get('/admin/commissions', { ...params, ...extra }, { preserveScroll: true, preserveState: true });
    }

    function clearFilters() {
        setStatus(''); setStoreId(''); setDateFrom(''); setDateTo(''); setSearch('');
        router.get('/admin/commissions', {}, { preserveScroll: true, preserveState: true });
    }

    function setCommissionStatus(c: CommissionRow, next: Status) {
        router.patch(`/admin/commissions/${c.id}/status`, { status: next }, { preserveScroll: true });
    }

    const exportQs = new URLSearchParams(params).toString();
    const hasFilters = Object.values(params).some(Boolean);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Commissions" />

            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">Commissions</h1>
                        <p className="text-sm text-muted-foreground">Platform commission on every delivered and fully paid order.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/admin/commissions/export?format=csv&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/admin/commissions/export?format=pdf&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Commissions Earned</CardTitle>
                            <Banknote className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(summary.total_earned)}</div>
                            <p className="text-xs text-muted-foreground mt-1">{summary.orders} orders · {fmt(summary.gross_sales)} gross sales</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Collected</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{fmt(summary.collected)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Settled by stores</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Collection</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">{fmt(summary.pending)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Not yet settled</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(summary.this_month)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Commission since the 1st</p>
                        </CardContent>
                    </Card>
                </div>

                {/* By store */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> By Store</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {by_store.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">No commissions recorded yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-3 pr-4 font-medium">Store</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Orders</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Gross Sales</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Commission</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Collected</th>
                                            <th className="pb-3 font-medium text-right">Pending</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {by_store.map((s) => (
                                            <tr key={s.store_id} className="cursor-pointer hover:bg-muted/30"
                                                onClick={() => { setStoreId(String(s.store_id)); visit({ store_id: s.store_id }); }}>
                                                <td className="py-3 pr-4 font-medium">{s.store_name}</td>
                                                <td className="py-3 pr-4 text-right">{s.orders}</td>
                                                <td className="py-3 pr-4 text-right">{fmt(s.gross_sales)}</td>
                                                <td className="py-3 pr-4 text-right font-semibold">{fmt(s.commission_total)}</td>
                                                <td className="py-3 pr-4 text-right text-green-600">{fmt(s.collected)}</td>
                                                <td className="py-3 text-right text-orange-600">{fmt(s.pending)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Detailed table */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle>All Commissions</CardTitle>
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Order #</label>
                                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ORD-…" className={`${inputCls} w-32`} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Store</label>
                                    <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={`${inputCls} w-40`}>
                                        <option value="">All stores</option>
                                        {stores.map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Status</label>
                                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                                        <option value="">All</option>
                                        <option value="pending">Pending</option>
                                        <option value="collected">Collected</option>
                                        <option value="failed">Failed</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">From</label>
                                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} w-36`} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">To</label>
                                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} w-36`} />
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => visit()}>Apply</Button>
                                {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {commissions.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No commissions match these filters.</p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Date</th>
                                                <th className="pb-3 pr-4 font-medium">Store</th>
                                                <th className="pb-3 pr-4 font-medium">Order</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Order Total</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Rate</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Commission</th>
                                                <th className="pb-3 pr-4 font-medium">Status</th>
                                                <th className="pb-3 font-medium"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {commissions.data.map((c) => (
                                                <tr key={c.id}>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{c.created_at}</td>
                                                    <td className="py-3 pr-4">{c.store_name ?? '—'}</td>
                                                    <td className="py-3 pr-4">
                                                        <span className="font-mono">{c.order_number ?? '—'}</span>
                                                        {c.payment_mode && <span className="ml-1.5 text-xs text-muted-foreground">{MODE_LABELS[c.payment_mode]}</span>}
                                                    </td>
                                                    <td className="py-3 pr-4 text-right">{fmt(c.order_total)}</td>
                                                    <td className="py-3 pr-4 text-right text-muted-foreground">{c.commission_rate}%</td>
                                                    <td className="py-3 pr-4 text-right font-semibold">{fmt(c.commission_amount)}</td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                                                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                                                        </span>
                                                        {c.collected_at && <p className="text-xs text-muted-foreground mt-0.5">{c.collected_at}</p>}
                                                    </td>
                                                    <td className="py-3 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs">
                                                                    Mark <ChevronDown className="ml-1 h-3 w-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                {(['collected', 'pending', 'failed'] as Status[]).filter((s) => s !== c.status).map((s) => (
                                                                    <DropdownMenuItem key={s} onClick={() => setCommissionStatus(c, s)} className={s === 'failed' ? 'text-red-600' : ''}>
                                                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {commissions.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {commissions.from}–{commissions.to} of {commissions.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={commissions.current_page === 1}
                                                onClick={() => visit({ page: commissions.current_page - 1 })}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{commissions.current_page} / {commissions.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={commissions.current_page === commissions.last_page}
                                                onClick={() => visit({ page: commissions.current_page + 1 })}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
