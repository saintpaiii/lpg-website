import { Head, router } from '@inertiajs/react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { useState } from 'react';
import {
    BarChart2,
    Filter,
    Package,
    ShoppingCart,
    Truck,
    Users,
    Warehouse,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type SalesRow    = { date: string; orders_count: number; revenue: number };
type ProductRow  = { product_id: number; name: string; brand: string; units_sold: number; revenue: number; profit: number };
type CustomerRow = { customer_id: number; name: string; phone: string; orders_count: number; total_spent: number; last_order_at: string };
type DeliveryRow = { rider_id: number; name: string; total_deliveries: number; delivered: number; failed: number; success_rate: number };
type InventoryRow = { product_id: number; name: string; brand: string; current_stock: number; reorder_level: number; stock_in: number; stock_out: number; low_stock: boolean };

type SalesData = {
    chart: SalesRow[];
    total_revenue: number;
    total_orders: number;
    avg_order: number;
};

type ProductData  = { table: ProductRow[];  chart: { name: string; units_sold: number; revenue: number }[] };
type CustomerData = { table: CustomerRow[]; chart: { name: string; total_spent: number }[] };
type DeliveryData = {
    table: DeliveryRow[];
    chart: { name: string; delivered: number; failed: number }[];
    total_deliveries: number;
    total_delivered: number;
    success_rate: number;
};
type InventoryData = { table: InventoryRow[]; chart: { name: string; current_stock: number; reorder_level: number }[] };

type Props = {
    tab: string;
    date_from: string;
    date_to: string;
    sales?: SalesData;
    products?: ProductData;
    customers?: CustomerData;
    delivery?: DeliveryData;
    inventory?: InventoryData;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reports', href: '/admin/reports' }];

const TABS = [
    { key: 'sales',     label: 'Sales',     icon: ShoppingCart },
    { key: 'products',  label: 'Products',  icon: Package },
    { key: 'customers', label: 'Customers', icon: Users },
    { key: 'delivery',  label: 'Delivery',  icon: Truck },
    { key: 'inventory', label: 'Inventory', icon: Warehouse },
] as const;

const CHART_COLORS = {
    blue:   '#2563eb',
    green:  '#10b981',
    red:    '#ef4444',
    amber:  '#f59e0b',
    purple: '#8b5cf6',
    slate:  '#94a3b8',
};

const BAR_COLORS = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pTick(v: number) {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `₱${(v / 1_000).toFixed(1)}K`;
    return `₱${v}`;
}

function nTick(v: number) {
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return `${v}`;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function MoneyTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
            <p className="mb-1.5 font-semibold text-gray-700">{label}</p>
            {payload.map((p: any) => (
                <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                    {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') || p.name?.toLowerCase().includes('spent') || p.name?.toLowerCase().includes('₱')
                        ? peso(p.value)
                        : p.value
                    }
                </p>
            ))}
        </div>
    );
}

function RevenueTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
            <p className="mb-1.5 font-semibold text-gray-700">{label}</p>
            {payload.map((p: any) => (
                <p key={p.dataKey} style={{ color: p.color }}>
                    {p.name}: {p.name === 'Revenue' ? peso(p.value) : p.value}
                </p>
            ))}
        </div>
    );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ title, value, sub, color = 'blue' }: {
    title: string;
    value: string | number;
    sub?: string;
    color?: 'blue' | 'green' | 'red' | 'amber';
}) {
    const colors = {
        blue:  'text-blue-600',
        green: 'text-emerald-600',
        red:   'text-red-600',
        amber: 'text-amber-600',
    };
    return (
        <Card>
            <CardContent className="pt-5">
                <p className="text-sm text-gray-500">{title}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${colors[color]}`}>{value}</p>
                {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
            </CardContent>
        </Card>
    );
}

// ── Date Range Bar ────────────────────────────────────────────────────────────

function DateRangeBar({
    dateFrom,
    dateTo,
    tab,
}: {
    dateFrom: string;
    dateTo: string;
    tab: string;
}) {
    const [from, setFrom] = useState(dateFrom);
    const [to, setTo]     = useState(dateTo);

    function apply() {
        router.get('/admin/reports', { tab, date_from: from, date_to: to }, { preserveState: false });
    }

    function thisMonth() {
        const now  = new Date();
        const f    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const t    = new Date().toISOString().slice(0, 10);
        setFrom(f); setTo(t);
        router.get('/admin/reports', { tab, date_from: f, date_to: t }, { preserveState: false });
    }

    function last30() {
        const t = new Date().toISOString().slice(0, 10);
        const f = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
        setFrom(f); setTo(t);
        router.get('/admin/reports', { tab, date_from: f, date_to: t }, { preserveState: false });
    }

    function thisYear() {
        const now = new Date();
        const f   = `${now.getFullYear()}-01-01`;
        const t   = new Date().toISOString().slice(0, 10);
        setFrom(f); setTo(t);
        router.get('/admin/reports', { tab, date_from: f, date_to: t }, { preserveState: false });
    }

    return (
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
                            { label: 'This Month', fn: thisMonth },
                            { label: 'Last 30 Days', fn: last30 },
                            { label: 'This Year', fn: thisYear },
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
    );
}

// ── Tab 1: Sales ──────────────────────────────────────────────────────────────

function SalesTab({ data }: { data: SalesData }) {
    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                    title="Total Revenue"
                    value={peso(data.total_revenue)}
                    sub="from non-cancelled orders"
                    color="blue"
                />
                <SummaryCard
                    title="Total Orders"
                    value={data.total_orders.toLocaleString()}
                    sub="confirmed & completed"
                    color="green"
                />
                <SummaryCard
                    title="Avg Order Value"
                    value={peso(data.avg_order)}
                    sub="revenue per order"
                    color="amber"
                />
            </div>

            {/* Bar chart */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="h-4 w-4 text-blue-600" />
                        Daily Revenue
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.chart.length === 0 ? (
                        <EmptyChart message="No sales data for this period." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(v) => {
                                        const d = new Date(v);
                                        return `${d.getMonth() + 1}/${d.getDate()}`;
                                    }}
                                />
                                <YAxis
                                    yAxisId="revenue"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={pTick}
                                    width={70}
                                />
                                <YAxis
                                    yAxisId="count"
                                    orientation="right"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={nTick}
                                    width={40}
                                />
                                <Tooltip content={<RevenueTooltip />} />
                                <Legend />
                                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                                <Bar yAxisId="count" dataKey="orders_count" name="Orders" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Daily Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.chart.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3 text-right">Orders</th>
                                        <th className="px-4 py-3 text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.chart.map((row) => (
                                        <tr key={row.date} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5 text-gray-700">{row.date}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{row.orders_count}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-blue-700">{peso(row.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                                        <td className="px-4 py-2.5">Total</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{data.total_orders}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{peso(data.total_revenue)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Tab 2: Products ───────────────────────────────────────────────────────────

function ProductsTab({ data }: { data: ProductData }) {
    return (
        <div className="space-y-6">
            {/* Horizontal bar chart — top products by units sold */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="h-4 w-4 text-blue-600" />
                        Top Products by Units Sold
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.chart.length === 0 ? (
                        <EmptyChart message="No product sales data for this period." />
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(200, data.chart.length * 48)}>
                            <BarChart
                                data={data.chart}
                                layout="vertical"
                                margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={nTick} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11 }}
                                    width={140}
                                    tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 20) + '…' : v}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
                                                <p className="mb-1 font-semibold text-gray-700">{label}</p>
                                                <p className="text-blue-600">Units sold: {payload[0]?.value}</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="units_sold" name="Units Sold" radius={[0, 4, 4, 0]}>
                                    {data.chart.map((_, i) => (
                                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">All Products</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.table.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3 text-right">Units Sold</th>
                                        <th className="px-4 py-3 text-right">Revenue</th>
                                        <th className="px-4 py-3 text-right">Profit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.table.map((row) => (
                                        <tr key={row.product_id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium text-gray-900">{row.name}</p>
                                                {row.brand && <p className="text-xs text-gray-400">{row.brand}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{row.units_sold}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-blue-700">{peso(row.revenue)}</td>
                                            <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {peso(row.profit)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Tab 3: Customers ──────────────────────────────────────────────────────────

function CustomersTab({ data }: { data: CustomerData }) {
    return (
        <div className="space-y-6">
            {/* Horizontal bar chart */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="h-4 w-4 text-blue-600" />
                        Top 10 Customers by Spending
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.chart.length === 0 ? (
                        <EmptyChart message="No customer data for this period." />
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(200, data.chart.length * 48)}>
                            <BarChart
                                data={data.chart}
                                layout="vertical"
                                margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={pTick} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11 }}
                                    width={130}
                                    tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
                                                <p className="mb-1 font-semibold text-gray-700">{label}</p>
                                                <p className="text-blue-600">Total spent: {peso(payload[0]?.value as number)}</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="total_spent" name="Total Spent" radius={[0, 4, 4, 0]}>
                                    {data.chart.map((_, i) => (
                                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top 10 Customers</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.table.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">Customer</th>
                                        <th className="px-4 py-3 text-right">Orders</th>
                                        <th className="px-4 py-3 text-right">Total Spent</th>
                                        <th className="px-4 py-3">Last Order</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.table.map((row, i) => (
                                        <tr key={row.customer_id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium text-gray-900">{row.name}</p>
                                                {row.phone && <p className="text-xs text-gray-400">{row.phone}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{row.orders_count}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">{peso(row.total_spent)}</td>
                                            <td className="px-4 py-2.5 text-sm text-gray-500">{row.last_order_at}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Tab 4: Delivery ───────────────────────────────────────────────────────────

function DeliveryTab({ data }: { data: DeliveryData }) {
    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                    title="Total Deliveries"
                    value={data.total_deliveries.toLocaleString()}
                    color="blue"
                />
                <SummaryCard
                    title="Successfully Delivered"
                    value={data.total_delivered.toLocaleString()}
                    color="green"
                />
                <SummaryCard
                    title="Success Rate"
                    value={`${data.success_rate}%`}
                    color={data.success_rate >= 80 ? 'green' : data.success_rate >= 60 ? 'amber' : 'red'}
                />
            </div>

            {/* Grouped bar chart */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="h-4 w-4 text-blue-600" />
                        Deliveries per Rider
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.chart.length === 0 ? (
                        <EmptyChart message="No delivery data for this period." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(v: string) => v.split(' ')[0]}
                                />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
                                                <p className="mb-1.5 font-semibold text-gray-700">{label}</p>
                                                {payload.map((p: any) => (
                                                    <p key={p.dataKey} style={{ color: p.color }}>
                                                        {p.name}: {p.value}
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="delivered" name="Delivered" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="failed" name="Failed" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rider Performance</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.table.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Rider</th>
                                        <th className="px-4 py-3 text-right">Total</th>
                                        <th className="px-4 py-3 text-right">Delivered</th>
                                        <th className="px-4 py-3 text-right">Failed</th>
                                        <th className="px-4 py-3 text-right">Success Rate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.table.map((row) => (
                                        <tr key={row.rider_id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{row.total_deliveries}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{row.delivered}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-red-500">{row.failed}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                    row.success_rate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                                    row.success_rate >= 60 ? 'bg-amber-100 text-amber-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {row.success_rate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Tab 5: Inventory ──────────────────────────────────────────────────────────

function InventoryTab({ data }: { data: InventoryData }) {
    const lowStockCount = data.table.filter((r) => r.low_stock).length;

    return (
        <div className="space-y-6">
            {lowStockCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {lowStockCount} product{lowStockCount !== 1 ? 's are' : ' is'} at or below reorder level.
                </div>
            )}

            {/* Bar chart: current stock */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="h-4 w-4 text-blue-600" />
                        Current Stock Levels
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.chart.length === 0 ? (
                        <EmptyChart message="No inventory data." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 10 }}
                                    angle={-35}
                                    textAnchor="end"
                                    interval={0}
                                    tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v}
                                />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
                                                <p className="mb-1.5 font-semibold text-gray-700">{label}</p>
                                                {payload.map((p: any) => (
                                                    <p key={p.dataKey} style={{ color: p.color }}>
                                                        {p.name}: {p.value}
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Legend verticalAlign="top" />
                                <Bar dataKey="current_stock" name="Current Stock" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="reorder_level" name="Reorder Level" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Stock Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.table.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3 text-right">Stock In</th>
                                        <th className="px-4 py-3 text-right">Stock Out</th>
                                        <th className="px-4 py-3 text-right">Current Stock</th>
                                        <th className="px-4 py-3 text-right">Reorder Level</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.table.map((row) => (
                                        <tr key={row.product_id} className={`hover:bg-gray-50/60 ${row.low_stock ? 'bg-amber-50/40' : ''}`}>
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium text-gray-900">{row.name}</p>
                                                {row.brand && <p className="text-xs text-gray-400">{row.brand}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{row.stock_in}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-red-500">{row.stock_out}</td>
                                            <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.low_stock ? 'text-amber-600' : 'text-gray-900'}`}>
                                                {row.current_stock}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{row.reorder_level}</td>
                                            <td className="px-4 py-2.5">
                                                {row.low_stock ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                        <AlertTriangle className="h-3 w-3" /> Low
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Empty chart placeholder ───────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            <div className="text-center">
                <BarChart2 className="mx-auto mb-2 h-8 w-8 text-gray-200" />
                {message}
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage({
    tab,
    date_from,
    date_to,
    sales,
    products,
    customers,
    delivery,
    inventory,
}: Props) {

    function switchTab(newTab: string) {
        router.get('/admin/reports', { tab: newTab, date_from, date_to }, { preserveState: false });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
                    <p className="mt-0.5 text-sm text-gray-500">
                        Analytics and insights for {date_from} → {date_to}
                    </p>
                </div>

                {/* Date range */}
                <DateRangeBar dateFrom={date_from} dateTo={date_to} tab={tab} />

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-1 overflow-x-auto">
                        {TABS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => switchTab(key)}
                                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 pb-3 text-sm font-medium transition-colors ${
                                    tab === key
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab content */}
                {tab === 'sales'     && sales     && <SalesTab     data={sales} />}
                {tab === 'products'  && products  && <ProductsTab  data={products} />}
                {tab === 'customers' && customers && <CustomersTab data={customers} />}
                {tab === 'delivery'  && delivery  && <DeliveryTab  data={delivery} />}
                {tab === 'inventory' && inventory && <InventoryTab data={inventory} />}

            </div>
        </AppLayout>
    );
}
