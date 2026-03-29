import { Head, router } from '@inertiajs/react';
import {
    BarChart3,
    FileDown,
    FileText,
    Filter,
    Search,
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

type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'to_refund' | 'refunded';

type InvoiceRow = {
    id: number;
    invoice_number: string;
    payment_status: PaymentStatus;
    total_amount: number;
    paid_amount: number;
    balance: number;
    payment_method: string | null;
    paid_at: string | null;
    due_date: string | null;
    created_at: string;
    customer: {
        id: number;
        name: string;
        phone: string | null;
    } | null;
    order: {
        id: number;
        order_number: string;
        status: string;
    } | null;
    platform_commission: number | null;
    net_amount: number | null;
};

type Summary = {
    total_count: number;
    total_billed: number;
    total_collected: number;
    total_outstanding: number;
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

type Props = {
    invoices: Paginated<InvoiceRow>;
    summary: Summary | null;
    filters: {
        payment_status?: string;
        date_from?: string;
        date_to?: string;
        search?: string;
    };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Invoices', href: '/admin/invoices' }];

const STATUS_STYLES: Record<PaymentStatus, string> = {
    unpaid:    'bg-red-100 text-red-700',
    partial:   'bg-amber-100 text-amber-700',
    paid:      'bg-emerald-100 text-emerald-700',
    to_refund: 'bg-orange-100 text-orange-700',
    refunded:  'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
    unpaid:    'Unpaid',
    partial:   'Partial',
    paid:      'Paid',
    to_refund: 'To Refund',
    refunded:  'Refunded',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

// ── Small components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentStatus }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvoicesPage({ invoices, summary, filters }: Props) {
    const [search, setSearch]       = useState(filters.search ?? '');
    const [payStatus, setPayStatus] = useState(filters.payment_status ?? '');
    const [dateFrom, setDateFrom]   = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]       = useState(filters.date_to ?? '');

    function applyFilters() {
        router.get(
            '/admin/invoices',
            {
                search:         search || undefined,
                payment_status: payStatus || undefined,
                date_from:      dateFrom || undefined,
                date_to:        dateTo || undefined,
            },
            { preserveState: true, replace: true },
        );
    }

    function clearFilters() {
        setSearch(''); setPayStatus(''); setDateFrom(''); setDateTo('');
        router.get('/admin/invoices', {}, { preserveState: false });
    }

    const hasFilters = search || payStatus || dateFrom || dateTo;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Invoices" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                        <p className="mt-0.5 text-sm text-gray-500">Platform-wide invoice monitoring. Payment recording is handled by each seller.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/admin/invoices/export?format=csv&payment_status=${encodeURIComponent(payStatus)}&search=${encodeURIComponent(search)}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/admin/invoices/export?format=pdf&payment_status=${encodeURIComponent(payStatus)}&search=${encodeURIComponent(search)}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Summary cards */}
                {summary && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.total_count}</div>
                                <p className="text-xs text-muted-foreground">all time</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Billed</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{peso(summary.total_billed)}</div>
                                <p className="text-xs text-muted-foreground">gross revenue</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Collected</CardTitle>
                                <BarChart3 className="h-4 w-4 text-emerald-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-emerald-600">{peso(summary.total_collected)}</div>
                                <p className="text-xs text-muted-foreground">payments received</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                                <BarChart3 className="h-4 w-4 text-red-400" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">{peso(summary.total_outstanding)}</div>
                                <p className="text-xs text-muted-foreground">unpaid balance</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Filters */}
                <Card>
                    <CardContent className="pt-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    className="pl-8"
                                    placeholder="Invoice#, Order#, Customer…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                />
                            </div>
                            <Select value={payStatus || 'all'} onValueChange={(v) => setPayStatus(v === 'all' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="unpaid">Unpaid</SelectItem>
                                    <SelectItem value="partial">Partial</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
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
                            <FileText className="h-4 w-4 text-blue-600" />
                            Invoices
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {invoices.total} record{invoices.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {invoices.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <FileText className="mb-3 h-10 w-10" />
                                <p className="font-medium">No invoices found</p>
                                <p className="mt-1 text-sm">Invoices are created automatically when orders are confirmed.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Invoice #</th>
                                            <th className="px-4 py-3">Order #</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 text-right">Paid</th>
                                            <th className="px-4 py-3 text-right">Balance</th>
                                            <th className="px-4 py-3 text-right hidden xl:table-cell">Commission</th>
                                            <th className="px-4 py-3 text-right hidden xl:table-cell">Net</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {invoices.data.map((inv) => (
                                            <tr
                                                key={inv.id}
                                                className="cursor-pointer hover:bg-gray-50/60"
                                                onClick={() => router.visit(`/admin/invoices/${inv.id}`)}
                                            >
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs font-semibold text-blue-600">
                                                        {inv.invoice_number}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs text-gray-500">
                                                        {inv.order?.order_number ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900">{inv.customer?.name ?? '—'}</p>
                                                    {inv.customer?.phone && (
                                                        <p className="text-xs text-gray-400">{inv.customer.phone}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                                                    {peso(inv.total_amount)}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                                                    {peso(inv.paid_amount)}
                                                </td>
                                                <td className={`px-4 py-3 text-right tabular-nums font-medium ${inv.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                    {peso(inv.balance)}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums text-amber-700 text-xs hidden xl:table-cell">
                                                    {inv.platform_commission != null ? peso(inv.platform_commission) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums text-blue-700 text-xs hidden xl:table-cell">
                                                    {inv.net_amount != null ? peso(inv.net_amount) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={inv.payment_status} />
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                                                    {fmtDate(inv.created_at)}
                                                    {inv.due_date && (
                                                        <p className="text-gray-400">Due: {fmtDate(inv.due_date)}</p>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Pagination
                            data={invoices}
                            onVisit={(url) => router.visit(url, { preserveState: true })}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
