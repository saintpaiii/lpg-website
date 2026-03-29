import { Head, Link, router } from '@inertiajs/react';
import { Eye, FileDown, Printer, Receipt, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Invoices',  href: '/seller/invoices'  },
];

type Invoice = {
    id: number;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
    payment_method: string | null;
    platform_commission: number;
    net_amount: number;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    customer: string;
    order_number: string;
    order_id: number;
    order_status: string | null;
};

type Counts = { all: number; paid: number; unpaid: number; partial: number };
type Paginated = { data: Invoice[]; current_page: number; last_page: number; total: number };

type Props = {
    invoices: Paginated;
    counts: Counts;
    tab: string;
    search: string;
    date_from: string;
    date_to: string;
};

const TABS = [
    { key: 'all',     label: 'All',     count_key: 'all'     },
    { key: 'paid',    label: 'Paid',    count_key: 'paid'    },
    { key: 'unpaid',  label: 'Unpaid',  count_key: 'unpaid'  },
    { key: 'partial', label: 'Partial', count_key: 'partial' },
] as const;

const PAY_COLORS: Record<string, string> = {
    paid:    'bg-green-100 text-green-700',
    unpaid:  'bg-red-100 text-red-700',
    partial: 'bg-yellow-100 text-yellow-700',
};

export default function SellerInvoices({ invoices, counts, tab, search, date_from, date_to }: Props) {
    const [searchVal, setSearchVal] = useState(search);
    const [dateFrom,  setDateFrom]  = useState(date_from);
    const [dateTo,    setDateTo]    = useState(date_to);

    function navigate(overrides: Record<string, string> = {}) {
        router.get('/seller/invoices', { tab, search: searchVal, date_from: dateFrom, date_to: dateTo, ...overrides }, { preserveState: true, replace: true });
    }

    function goTab(t: string) {
        navigate({ tab: t });
    }

    function doSearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        navigate();
    }

    function applyDates() { navigate(); }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/seller/invoices', { tab, search: searchVal, date_from: '', date_to: '' }, { preserveState: true, replace: true });
    }

    const totalAmount = invoices.data.reduce((s, i) => s + i.total_amount, 0);
    const totalNet    = invoices.data.reduce((s, i) => s + i.net_amount, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Invoices" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Receipt className="h-6 w-6 text-blue-600" />
                            Invoices
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Revenue after platform commission.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <form onSubmit={doSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Invoice # or customer…" className="pl-9 w-52" value={searchVal}
                                    onChange={(e) => setSearchVal(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">Search</Button>
                        </form>
                        <a href={`/seller/invoices/export?format=csv&tab=${tab}&search=${encodeURIComponent(searchVal)}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/invoices/export?format=pdf&tab=${tab}&search=${encodeURIComponent(searchVal)}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label, count_key }) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                            {counts[count_key] > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${tab === key ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>{counts[count_key]}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Date filter */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">From</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">To</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <Button size="sm" variant="secondary" onClick={applyDates}>Apply</Button>
                    {(dateFrom || dateTo) && <Button size="sm" variant="ghost" onClick={clearDates}>Clear</Button>}
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Commission</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Net</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.data.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No invoices found.</td></tr>
                                    ) : invoices.data.map((inv) => (
                                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-mono text-xs text-blue-600 font-medium">{inv.invoice_number}</p>
                                                <p className="text-xs text-muted-foreground">{inv.order_number}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">{inv.customer}</td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                ₱{inv.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-right text-red-600 hidden md:table-cell">
                                                −₱{inv.platform_commission.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                                ₱{inv.net_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAY_COLORS[inv.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                    {inv.payment_status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                {fmtDate(inv.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Link href={`/seller/invoices/${inv.id}`}>
                                                        <Button size="sm" variant="outline"
                                                            className="h-7 px-2.5 text-xs text-blue-600 border-blue-300 hover:bg-blue-50 gap-1">
                                                            <Eye className="h-3 w-3" />
                                                            View
                                                        </Button>
                                                    </Link>
                                                    {inv.order_status === 'delivered' && inv.payment_status === 'paid' && (
                                                        <a href={`/invoices/${inv.id}/print`} target="_blank" rel="noopener noreferrer">
                                                            <Button size="sm" variant="ghost"
                                                                className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50" title="Print Receipt">
                                                                <Printer className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {invoices.data.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t bg-muted/20">
                                            <td colSpan={2} className="px-4 py-2.5 text-sm text-muted-foreground">
                                                Page total ({invoices.data.length})
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold">
                                                ₱{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-2.5 hidden md:table-cell" />
                                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                                                ₱{totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {invoices.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{invoices.total} invoices</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: invoices.last_page }, (_, i) => i + 1).map((pg) => (
                                        <button key={pg}
                                            onClick={() => router.get('/seller/invoices', { tab, search: searchVal, page: pg })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${pg === invoices.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {pg}
                                        </button>
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
