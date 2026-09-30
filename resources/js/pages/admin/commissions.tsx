import AppLayout from '@/layouts/app-layout';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { AdminInvoiceActions } from '@/components/admin-invoice-actions';
import { InvoiceStatusBadge } from '@/components/commission-invoice-detail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileDown, FilePlus2, Hourglass, Loader2, Wallet } from 'lucide-react';
import { fmtPeso, type CommissionInvoice } from '@/lib/commission';
import type { BreadcrumbItem } from '@/types';

interface Summary {
    total_owed: number;
    total_collected: number;
    total_overdue: number;
    overdue_count: number;
    uninvoiced_amount: number;
    uninvoiced_orders: number;
    suspended_stores: number;
}

type Counts = { all: number; pending: number; paid: number; overdue: number; waived: number };

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
    counts: Counts;
    invoices: Paginated<CommissionInvoice>;
    stores: { id: number; store_name: string }[];
    filters: { tab: string; store_id?: string; date_from?: string; date_to?: string; search?: string };
    billing: { period: 'weekly' | 'monthly'; due_days: number; suspend_after: number };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Commissions', href: '/admin/commissions' }];

const TABS: { key: keyof Counts; label: string }[] = [
    { key: 'all',     label: 'All'     },
    { key: 'pending', label: 'Pending' },
    { key: 'paid',    label: 'Paid'    },
    { key: 'overdue', label: 'Overdue' },
    { key: 'waived',  label: 'Waived'  },
];

type PeriodChoice = 'this_week' | 'this_month' | 'last_month' | 'custom';

const PERIOD_OPTIONS: { value: PeriodChoice; label: string }[] = [
    { value: 'this_week',  label: 'This Week'  },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'custom',     label: 'Custom Range' },
];

type Preview = {
    stores: number;
    orders: number;
    total: number;
    range: string;
    breakdown: { store_name: string; orders: number; amount: number }[];
};

const inputCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function AdminCommissions({ summary, counts, invoices, stores, filters, billing }: Props) {
    const [storeId,  setStoreId]  = useState(filters.store_id ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo,   setDateTo]   = useState(filters.date_to ?? '');
    const [search,   setSearch]   = useState(filters.search ?? '');
    const tab = filters.tab ?? 'all';

    const [genOpen, setGenOpen]     = useState(false);
    const [genPeriod, setGenPeriod] = useState<PeriodChoice>('this_month');
    const [genFrom, setGenFrom]     = useState('');
    const [genTo, setGenTo]         = useState('');
    const [generating, setGenerating] = useState(false);
    const [preview, setPreview]     = useState<Preview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Live preview of what will be billed for the chosen period
    useEffect(() => {
        if (!genOpen) return;
        if (genPeriod === 'custom' && (!genFrom || !genTo)) { setPreview(null); return; }
        let cancelled = false;
        setPreviewLoading(true);
        axios.get<Preview>('/admin/commissions/preview', { params: { period: genPeriod, date_from: genFrom, date_to: genTo } })
            .then((res) => { if (!cancelled) setPreview(res.data); })
            .catch(() => { if (!cancelled) setPreview(null); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; };
    }, [genOpen, genPeriod, genFrom, genTo]);

    const params = { tab, store_id: storeId, date_from: dateFrom, date_to: dateTo, search };

    function visit(extra: Record<string, string | number> = {}) {
        router.get('/admin/commissions', { ...params, ...extra }, { preserveScroll: true, preserveState: true });
    }

    function clearFilters() {
        setStoreId(''); setDateFrom(''); setDateTo(''); setSearch('');
        router.get('/admin/commissions', { tab }, { preserveScroll: true, preserveState: true });
    }

    function generate() {
        setGenerating(true);
        router.post('/admin/commissions/generate', { period: genPeriod, date_from: genFrom, date_to: genTo }, {
            preserveScroll: true,
            onSuccess: () => setGenOpen(false),
            onFinish: () => setGenerating(false),
        });
    }

    const exportQs = new URLSearchParams(params).toString();
    const hasFilters = !!(storeId || dateFrom || dateTo || search);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Commissions" />

            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">Commissions</h1>
                        <p className="text-sm text-muted-foreground">
                            Stores are billed {billing.period} for commission on delivered and paid orders.
                            Invoices are due {billing.due_days} days after issue; stores are suspended {billing.suspend_after} day(s) after the due date.
                        </p>
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
                        <Button onClick={() => setGenOpen(true)} className="gap-1.5">
                            <FilePlus2 className="h-4 w-4" /> Generate Invoices
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <SummaryCard title="Total Owed" icon={Wallet} value={fmtPeso(summary.total_owed)} note="Pending + overdue invoices" />
                    <SummaryCard title="Total Collected" icon={CheckCircle2} value={fmtPeso(summary.total_collected)} valueClass="text-green-600" note="Paid invoices" />
                    <SummaryCard title="Total Overdue" icon={AlertTriangle} value={fmtPeso(summary.total_overdue)} valueClass="text-red-600"
                        note={`${summary.overdue_count} invoice(s) · ${summary.suspended_stores} store(s) suspended`} />
                    <SummaryCard title="Not Yet Invoiced" icon={Hourglass} value={fmtPeso(summary.uninvoiced_amount)}
                        note={`${summary.uninvoiced_orders} completed order(s) awaiting billing`} />
                </div>

                <Card>
                    <CardHeader className="space-y-4">
                        <div className="flex gap-1 border-b overflow-x-auto">
                            {TABS.map((t) => (
                                <button key={t.key} onClick={() => visit({ tab: t.key, page: 1 })}
                                    className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                                    {t.label}
                                    {counts[t.key] > 0 && (
                                        <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-xs font-semibold ${t.key === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-muted'}`}>
                                            {counts[t.key]}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground font-medium">Search</label>
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice # or store" className={`${inputCls} w-44`} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground font-medium">Store</label>
                                <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={`${inputCls} w-44`}>
                                    <option value="">All stores</option>
                                    {stores.map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground font-medium">Period from</label>
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} w-36`} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground font-medium">Period to</label>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} w-36`} />
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => visit({ page: 1 })}>Apply</Button>
                            {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {invoices.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">
                                No commission invoices here. Use <strong>Generate Invoices</strong> to bill stores for a period.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Store</th>
                                                <th className="pb-3 pr-4 font-medium">Invoice #</th>
                                                <th className="pb-3 pr-4 font-medium">Period</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Orders</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Sales</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Commission</th>
                                                <th className="pb-3 pr-4 font-medium">Status</th>
                                                <th className="pb-3 pr-4 font-medium">Due Date</th>
                                                <th className="pb-3 font-medium text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {invoices.data.map((i) => (
                                                <tr key={i.id} className={i.status === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                                                    <td className="py-3 pr-4">
                                                        <span className="font-medium">{i.store_name ?? '—'}</span>
                                                        {i.store_suspended && (
                                                            <span className="ml-1.5 rounded bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">SUSPENDED</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <Link href={`/admin/commissions/${i.id}`} className="font-mono text-blue-600 hover:underline">{i.invoice_number}</Link>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{i.period_label}</td>
                                                    <td className="py-3 pr-4 text-right">{i.total_orders}</td>
                                                    <td className="py-3 pr-4 text-right">{fmtPeso(i.total_sales)}</td>
                                                    <td className="py-3 pr-4 text-right font-semibold">{fmtPeso(i.commission_amount)}</td>
                                                    <td className="py-3 pr-4"><InvoiceStatusBadge invoice={i} /></td>
                                                    <td className={`py-3 pr-4 whitespace-nowrap ${i.status === 'overdue' ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                                                        {i.due_date}
                                                    </td>
                                                    <td className="py-3 text-right"><AdminInvoiceActions invoice={i} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {invoices.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">{invoices.from}–{invoices.to} of {invoices.total}</p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={invoices.current_page === 1}
                                                onClick={() => visit({ page: invoices.current_page - 1 })}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{invoices.current_page} / {invoices.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={invoices.current_page === invoices.last_page}
                                                onClick={() => visit({ page: invoices.current_page + 1 })}>
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

            {/* Generate invoices */}
            <Dialog open={genOpen} onOpenChange={setGenOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><FilePlus2 className="h-4 w-4" /> Generate Commission Invoices</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <p className="text-muted-foreground">
                            Creates one invoice per store for its not-yet-invoiced commissions in the selected period.
                            Stores with ₱0 commission are skipped, and each seller is notified.
                        </p>
                        <div className="grid gap-2">
                            {PERIOD_OPTIONS.map((p) => (
                                <label key={p.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 ${genPeriod === p.value ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                    <input type="radio" name="gen-period" checked={genPeriod === p.value} onChange={() => setGenPeriod(p.value)} />
                                    <span className="font-medium">{p.label}</span>
                                </label>
                            ))}
                        </div>
                        {genPeriod === 'custom' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1">
                                    <label className="text-xs font-medium">From</label>
                                    <input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} className={inputCls} />
                                </div>
                                <div className="grid gap-1">
                                    <label className="text-xs font-medium">To</label>
                                    <input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                        )}
                        <div className="rounded-lg border bg-muted/30 p-3">
                            {previewLoading ? (
                                <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</p>
                            ) : preview ? (
                                preview.stores > 0 ? (
                                    <div className="space-y-2">
                                        <p className="font-semibold">
                                            {preview.stores} store{preview.stores > 1 ? 's' : ''}, total commission: {fmtPeso(preview.total)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{preview.range} · {preview.orders} order(s)</p>
                                        <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                                            {preview.breakdown.map((b) => (
                                                <li key={b.store_name} className="flex justify-between">
                                                    <span>{b.store_name} <span className="text-muted-foreground">({b.orders})</span></span>
                                                    <span className="font-medium">{fmtPeso(b.amount)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">No uninvoiced commissions in {preview.range}.</p>
                                )
                            ) : (
                                <p className="text-muted-foreground">Pick a period to see what will be billed.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">Invoices will be due {billing.due_days} days from today.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
                        <Button onClick={generate} disabled={generating || previewLoading || !preview || preview.stores === 0}>
                            {generating ? 'Generating…' : 'Generate'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

function SummaryCard({ title, icon: Icon, value, note, valueClass = '' }: {
    title: string; icon: React.ElementType; value: string; note: string; valueClass?: string;
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{note}</p>
            </CardContent>
        </Card>
    );
}
