import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { FileDown, Filter, LineChart as LineChartIcon, PhilippinePeso, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Reports', href: '/seller/reports' },
];

type ChartRow = {
    date: string;
    orders: number;
    gross: number;
    commission: number;
    net: number;
};

type Summary = {
    gross_revenue: number;
    platform_fees: number;
    net_revenue: number;
    total_orders: number;
    commission_rate: number;
};

type Props = {
    date_from: string;
    date_to: string;
    summary: Summary;
    chart: ChartRow[];
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pTick(v: number) {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `₱${(v / 1_000).toFixed(0)}K`;
    return `₱${v}`;
}

export default function SellerReports({ date_from, date_to, summary, chart }: Props) {
    const [from, setFrom] = useState(date_from);
    const [to, setTo]     = useState(date_to);

    function apply() {
        router.get('/seller/reports', { date_from: from, date_to: to }, { preserveState: false });
    }

    function thisMonth() {
        const now = new Date();
        const f = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const t = new Date().toISOString().slice(0, 10);
        setFrom(f); setTo(t);
        router.get('/seller/reports', { date_from: f, date_to: t }, { preserveState: false });
    }

    function last30() {
        const t = new Date();
        const f = new Date(t); f.setDate(f.getDate() - 29);
        const fs = f.toISOString().slice(0, 10);
        const ts = t.toISOString().slice(0, 10);
        setFrom(fs); setTo(ts);
        router.get('/seller/reports', { date_from: fs, date_to: ts }, { preserveState: false });
    }

    function thisYear() {
        const now = new Date();
        const f = `${now.getFullYear()}-01-01`;
        const t = new Date().toISOString().slice(0, 10);
        setFrom(f); setTo(t);
        router.get('/seller/reports', { date_from: f, date_to: t }, { preserveState: false });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />

            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Revenue Reports</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Track your gross revenue, platform fees, and net earnings.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/seller/reports/export?format=csv&date_from=${from}&date_to=${to}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/reports/export?format=pdf&date_from=${from}&date_to=${to}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Date range */}
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-500">Date Range:</span>
                            <Input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="w-36 h-8 text-sm"
                            />
                            <span className="text-gray-400 text-sm">to</span>
                            <Input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="w-36 h-8 text-sm"
                            />
                            <Button size="sm" onClick={apply} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                                <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                            <div className="ml-2 flex gap-1">
                                {[
                                    { label: 'This Month',    fn: thisMonth },
                                    { label: 'Last 30 Days',  fn: last30    },
                                    { label: 'This Year',     fn: thisYear  },
                                ].map(({ label, fn }) => (
                                    <button
                                        key={label}
                                        onClick={fn}
                                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Gross Revenue</p>
                                    <p className="text-2xl font-bold mt-1 text-emerald-600">{fmt(summary.gross_revenue)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{summary.total_orders} orders</p>
                                </div>
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
                                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Platform Fees</p>
                                    <p className="text-2xl font-bold mt-1 text-amber-600">{fmt(summary.platform_fees)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{summary.commission_rate}% commission rate</p>
                                </div>
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20 shrink-0">
                                    <PhilippinePeso className="h-5 w-5 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Net Revenue</p>
                                    <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(summary.net_revenue)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">After platform commission</p>
                                </div>
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 shrink-0">
                                    <TrendingDown className="h-5 w-5 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Fee Percentage</p>
                                    <p className="text-2xl font-bold mt-1 text-gray-700">
                                        {summary.gross_revenue > 0
                                            ? ((summary.platform_fees / summary.gross_revenue) * 100).toFixed(1)
                                            : '0.0'}%
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Actual fees paid</p>
                                </div>
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0">
                                    <LineChartIcon className="h-5 w-5 text-gray-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Gross vs Net chart */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <LineChartIcon className="h-4 w-4 text-emerald-600" />
                            Gross vs Net Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {chart.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-12 text-center">No data for this period.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(v) => {
                                            const d = new Date(v);
                                            return `${d.getMonth() + 1}/${d.getDate()}`;
                                        }}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={pTick} width={70} />
                                    <Tooltip
                                        formatter={(v: number | undefined, name: string) => [fmt(v ?? 0), name]}
                                        labelFormatter={(v) => {
                                            const d = new Date(v);
                                            return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
                                        }}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Legend />
                                    <Line dataKey="gross" name="Gross Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line dataKey="commission" name="Platform Fee" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                    <Line dataKey="net" name="Net Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Daily breakdown table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Daily Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {chart.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-400">No data for this period.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3 text-right">Orders</th>
                                            <th className="px-4 py-3 text-right">Gross Revenue</th>
                                            <th className="px-4 py-3 text-right">Platform Fee</th>
                                            <th className="px-4 py-3 text-right">Net Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {chart.map((row) => (
                                            <tr key={row.date} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-2.5 text-gray-700">{row.date}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{row.orders}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(row.gross)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{fmt(row.commission)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 font-medium">{fmt(row.net)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                                            <td className="px-4 py-2.5">Total</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{summary.total_orders}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(summary.gross_revenue)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{fmt(summary.platform_fees)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{fmt(summary.net_revenue)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
