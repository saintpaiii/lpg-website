import { Head, router } from '@inertiajs/react';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    Brain,
    CalendarDays,
    CheckCircle2,
    Crown,
    Lightbulb,
    Package,
    RefreshCw,
    ShoppingCart,
    Target,
    TrendingDown,
    TrendingUp,
    Truck,
    Users,
    Warehouse,
    Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'notice';

type ReorderAlert = {
    product_id: number;
    name: string;
    brand: string;
    current_stock: number;
    reorder_level: number;
    avg_daily_sales: number | null;
    days_until_stockout: number | null;
    recommended_order: number | null;
    days_to_order: string;
    severity: Severity;
};

type TopProduct = {
    product_id: number;
    name: string;
    brand: string;
    units_sold: number;
    revenue: number;
};

type TrendPoint = {
    date: string;
    label: string;
    revenue: number;
    orders_count: number;
    trend: number;
};

type SalesTrend = {
    chart: TrendPoint[];
    direction: 'increasing' | 'stable' | 'decreasing';
    trend_percent: number;
    this_week: number;
    last_week: number;
    peak_day: TrendPoint | null;
    slope: number;
};

type ForecastProduct = {
    product_id: number;
    name: string;
    brand: string;
    forecast: Record<string, number>;
    total: number;
};

type DemandForecast = {
    products: ForecastProduct[];
    chart: Record<string, any>[];
    top_names: string[];
    day_columns: { key: string; label: string }[];
};

type Recommendation = {
    type: 'critical' | 'warning' | 'info' | 'success';
    text: string;
};

type Insights = {
    this_month_revenue: number;
    last_month_revenue: number;
    this_month_orders: number;
    last_month_orders: number;
    revenue_change_pct: number | null;
    projected_revenue: number;
    days_elapsed: number;
    days_in_month: number;
    this_month_customers: number;
    repeat_customers: number;
    repeat_rate: number;
    busiest_day: string | null;
    delivery_success_rate: number | null;
    avg_delivery_hours: number | null;
    total_deliveries: number;
    failed_deliveries: number;
    low_stock_count: number;
    recommendations: Recommendation[];
};

type Props = {
    reorderAlerts: ReorderAlert[];
    salesTrend: SalesTrend;
    topProducts: TopProduct[];
    demandForecast: DemandForecast;
    insights: Insights;
    generatedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'DSS', href: '/seller/dss' },
];

const FORECAST_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

type Tab = 'overview' | 'forecast' | 'trends';

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pTick(v: number) {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `₱${(v / 1_000).toFixed(1)}K`;
    return `₱${v}`;
}

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-300">
            <Brain className="h-8 w-8" />
            <p className="text-sm text-gray-400">{message}</p>
        </div>
    );
}

// ── Reorder Alerts ─────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    critical: { border: 'border-red-400',    bg: 'bg-red-50 dark:bg-red-950/30',    badge: 'bg-red-600 text-white',            label: 'CRITICAL',  stockBar: 'bg-red-500',    glow: 'shadow-red-100'    },
    warning:  { border: 'border-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/30', badge: 'bg-amber-500 text-white',          label: 'WARNING',   stockBar: 'bg-amber-500',  glow: 'shadow-amber-100'  },
    notice:   { border: 'border-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-950/20', badge: 'bg-yellow-400 text-yellow-900', label: 'LOW STOCK', stockBar: 'bg-yellow-400', glow: 'shadow-yellow-100' },
};

function AlertCard({ alert }: { alert: ReorderAlert }) {
    const cfg      = SEVERITY_CONFIG[alert.severity];
    const stockPct = alert.reorder_level > 0
        ? Math.min(100, Math.round((alert.current_stock / (alert.reorder_level * 2)) * 100))
        : 0;
    return (
        <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-3 shadow-sm transition-all hover:shadow-md`}>
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900 dark:text-white text-sm">{alert.name}</p>
                    {alert.brand && <p className="text-xs text-gray-500">{alert.brand}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black tracking-wide ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <div className="mb-2">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>Stock: <span className="font-bold text-gray-800 dark:text-gray-200">{alert.current_stock}</span></span>
                    <span>Reorder: {alert.reorder_level}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className={`h-1.5 rounded-full ${cfg.stockBar}`} style={{ width: `${Math.max(2, stockPct)}%` }} />
                </div>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-1.5 text-xs">
                <div className="rounded-lg bg-white/80 dark:bg-gray-800/50 p-1.5 text-center">
                    <p className="text-gray-500">Daily Avg</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{alert.avg_daily_sales !== null ? `${alert.avg_daily_sales}u` : '—'}</p>
                </div>
                <div className="rounded-lg bg-white/80 dark:bg-gray-800/50 p-1.5 text-center">
                    <p className="text-gray-500">Stockout</p>
                    <p className={`font-bold ${alert.days_until_stockout !== null ? (alert.severity === 'critical' ? 'text-red-700' : alert.severity === 'warning' ? 'text-amber-700' : 'text-yellow-700') : 'text-gray-400'}`}>
                        {alert.days_until_stockout !== null ? `${alert.days_until_stockout}d` : 'N/A'}
                    </p>
                </div>
            </div>
            <div className={`rounded-lg border ${cfg.border} bg-white/60 dark:bg-gray-800/40 p-2 text-xs`}>
                {alert.recommended_order !== null ? (
                    <p className="text-gray-600 dark:text-gray-300">Order <span className="font-bold text-gray-900 dark:text-white">{alert.recommended_order} units</span> <span className="font-semibold">{alert.days_to_order}</span>.</p>
                ) : (
                    <p className="text-gray-500">Insufficient data — monitor and reorder soon.</p>
                )}
            </div>
        </div>
    );
}

// ── Sales Trend ────────────────────────────────────────────────────────────────

function SalesTrendSection({ data }: { data: SalesTrend }) {
    const lineColor = data.direction === 'increasing' ? '#10b981' : data.direction === 'decreasing' ? '#ef4444' : '#2563eb';

    return (
        <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-4">
                <div className="space-y-2">
                    {/* Trend badge */}
                    {data.direction === 'increasing' ? (
                        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                            <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0" />
                            <div>
                                <p className="font-bold text-emerald-700 dark:text-emerald-400">+{data.trend_percent}%</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-500">vs last week</p>
                            </div>
                        </div>
                    ) : data.direction === 'decreasing' ? (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
                            <TrendingDown className="h-5 w-5 text-red-600 shrink-0" />
                            <div>
                                <p className="font-bold text-red-700 dark:text-red-400">{data.trend_percent}%</p>
                                <p className="text-xs text-red-600 dark:text-red-500">vs last week</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                            <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                            <div>
                                <p className="font-bold text-blue-700 dark:text-blue-400">{data.trend_percent > 0 ? '+' : ''}{data.trend_percent}%</p>
                                <p className="text-xs text-blue-600 dark:text-blue-500">Stable</p>
                            </div>
                        </div>
                    )}

                    <Card>
                        <CardContent className="py-3 px-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">This Week</span>
                                <span className="font-bold tabular-nums text-sm">{peso(data.this_week)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Last Week</span>
                                <span className="font-bold text-gray-400 tabular-nums text-sm">{peso(data.last_week)}</span>
                            </div>
                            {data.peak_day && (
                                <div className="border-t pt-2">
                                    <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Peak Day (30d)</p>
                                    <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">{data.peak_day.label}</p>
                                    <p className="text-sm text-emerald-600 font-semibold">{peso(data.peak_day.revenue)}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card className="lg:col-span-3">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Revenue + Trend Line (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {data.chart.length === 0 ? (
                            <EmptyChart message="No sales data for the last 30 days." />
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={pTick} width={65} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="rounded-lg border bg-white dark:bg-gray-900 p-2.5 shadow-xl text-xs">
                                                    <p className="font-bold text-gray-800 dark:text-white mb-1">{label}</p>
                                                    {payload.map((p: any) => (
                                                        <p key={p.dataKey} style={{ color: p.stroke }}>
                                                            {p.name}: {peso(p.value)}
                                                        </p>
                                                    ))}
                                                    {payload[0] && (
                                                        <p className="text-gray-500 mt-1 text-xs">
                                                            Orders: {data.chart.find((d) => d.label === label)?.orders_count ?? 0}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="trend" name="Trend Line" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ── Top Products ───────────────────────────────────────────────────────────────

function TopProductsSection({ products }: { products: TopProduct[] }) {
    if (products.length === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-10">
                    <ShoppingCart className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="font-medium text-gray-500 text-sm">No sales data yet</p>
                    <p className="text-xs text-gray-400 mt-1">Process some orders to see your top-selling products.</p>
                </CardContent>
            </Card>
        );
    }
    return (
        <Card>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50 dark:bg-gray-800/50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-2.5">#</th>
                                <th className="px-4 py-2.5">Product</th>
                                <th className="px-4 py-2.5 text-center">Units Sold</th>
                                <th className="px-4 py-2.5 text-right">Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {products.map((p, idx) => (
                                <tr key={p.product_id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                                    <td className="px-4 py-2.5 text-gray-400 font-bold">{idx + 1}</td>
                                    <td className="px-4 py-2.5">
                                        <p className="font-medium">{p.name}</p>
                                        <p className="text-xs text-gray-400">{p.brand}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                            {p.units_sold} units
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{peso(p.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Demand Forecast ────────────────────────────────────────────────────────────

function DemandForecastSection({ data }: { data: DemandForecast }) {
    const hasData = data.chart.length > 0 && data.top_names.length > 0;

    return (
        <div className="space-y-3">
            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Predicted Daily Units — Top Products (SMA)</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {!hasData ? (
                            <EmptyChart message="No sales history to generate a forecast." />
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 600 }} />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const entry = data.chart.find((c) => c.day === label);
                                            return (
                                                <div className="rounded-lg border bg-white dark:bg-gray-900 p-2.5 shadow-xl text-xs">
                                                    <p className="font-bold text-gray-800 dark:text-white mb-1">{label} {entry?.date}</p>
                                                    {payload.map((p: any) => (
                                                        <p key={p.dataKey} style={{ color: p.fill }} className="flex items-center gap-1.5">
                                                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.fill }} />
                                                            {p.dataKey}: <span className="font-semibold">{p.value} units</span>
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    {data.top_names.map((name, i) => (
                                        <Bar key={name} dataKey={name} fill={FORECAST_COLORS[i % FORECAST_COLORS.length]} radius={[4, 4, 0, 0]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Weekly Totals</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!hasData ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b bg-gray-50 dark:bg-gray-800/50 text-left text-xs font-semibold uppercase text-gray-400">
                                            <th className="px-3 py-2">Product</th>
                                            {data.day_columns.map((c) => (
                                                <th key={c.key} className="px-2 py-2 text-center">{c.key}</th>
                                            ))}
                                            <th className="px-3 py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {data.products.slice(0, 8).map((p, i) => (
                                            <tr key={p.product_id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: FORECAST_COLORS[i % FORECAST_COLORS.length] }} />
                                                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px]">{p.name}</span>
                                                    </div>
                                                </td>
                                                {data.day_columns.map((c) => (
                                                    <td key={c.key} className="px-2 py-2 text-center tabular-nums text-gray-600 dark:text-gray-400">{p.forecast[c.key] ?? 0}</td>
                                                ))}
                                                <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700 dark:text-blue-400">{p.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ── Monthly Summary ─────────────────────────────────────────────────────────────

function MonthlySummaryCards({ data }: { data: Insights }) {
    const pct  = data.revenue_change_pct;
    const up   = pct !== null && pct > 0;
    const down = pct !== null && pct < 0;

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow duration-150">
                <CardContent className="pt-4 pb-3 px-4 space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">This Month Revenue</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{peso(data.this_month_revenue)}</p>
                    {pct !== null ? (
                        <p className={`text-xs font-semibold flex items-center gap-0.5 ${up ? 'text-emerald-600' : down ? 'text-red-500' : 'text-gray-400'}`}>
                            {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                            {pct > 0 ? '+' : ''}{pct}% vs last month
                        </p>
                    ) : (
                        <p className="text-xs text-gray-400">No prior month data</p>
                    )}
                </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 hover:shadow-md transition-shadow duration-150">
                <CardContent className="pt-4 pb-3 px-4 space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Projected (Month End)</p>
                    <p className="text-xl font-black text-blue-700 dark:text-blue-400 tabular-nums">{peso(data.projected_revenue)}</p>
                    <p className="text-xs text-blue-400">Day {data.days_elapsed}/{data.days_in_month} average</p>
                </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow duration-150">
                <CardContent className="pt-4 pb-3 px-4 space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Orders This Month</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{data.this_month_orders}</p>
                    <p className="text-xs text-gray-400">Last month: {data.last_month_orders}</p>
                </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow duration-150">
                <CardContent className="pt-4 pb-3 px-4 space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Unique Customers</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{data.this_month_customers}</p>
                    <p className="text-xs text-gray-400">{data.repeat_rate}% repeat ({data.repeat_customers} reorders)</p>
                </CardContent>
            </Card>
        </div>
    );
}

// ── Insights Section ────────────────────────────────────────────────────────────

function InsightsSection({ data, reorderAlerts }: { data: Insights; reorderAlerts: ReorderAlert[] }) {
    const criticalCount = reorderAlerts.filter((a) => a.severity === 'critical').length;

    const salesInsight = (() => {
        const pct = data.revenue_change_pct;
        if (pct === null) return { level: 'info', text: 'Not enough history to compare months yet. Keep recording orders to unlock month-over-month analysis.' };
        if (pct >= 20) return { level: 'success', text: `Outstanding! Revenue is up ${pct}% compared to last month.` };
        if (pct >= 5)  return { level: 'success', text: `Good progress — revenue is up ${pct}% from last month.` };
        if (pct >= -5) return { level: 'info',    text: `Revenue is roughly the same as last month (${pct > 0 ? '+' : ''}${pct}%). Consider small promotions.` };
        if (pct >= -15)return { level: 'warning', text: `Revenue is down ${Math.abs(pct)}% from last month. Review underperforming products or days.` };
        return { level: 'warning', text: `Revenue dropped ${pct}% vs last month. Investigate order volume and pricing urgently.` };
    })();

    const stockInsight = (() => {
        if (criticalCount > 0) return { level: 'critical', text: `${criticalCount} product(s) are completely out of stock — restock immediately.` };
        if (data.low_stock_count > 0) return { level: 'warning', text: `${data.low_stock_count} product(s) below reorder level. Order replenishments soon.` };
        return { level: 'success', text: 'All products are above their reorder levels. Stock health is good.' };
    })();

    const customerInsight = (() => {
        if (data.this_month_customers === 0) return { level: 'info', text: 'No customer orders recorded this month yet.' };
        if (data.repeat_rate >= 50) return { level: 'success', text: `Excellent! ${data.repeat_rate}% of customers reordered — strong loyalty.` };
        if (data.repeat_rate >= 30) return { level: 'info', text: `${data.repeat_rate}% repeat rate. Decent — consider loyalty rewards to push this higher.` };
        return { level: 'warning', text: `Only ${data.repeat_rate}% reordered. Most buyers are one-time. Improve follow-up and loyalty offers.` };
    })();

    const projectionInsight = (() => {
        if (data.last_month_revenue === 0) return { level: 'info', text: `On track for ${peso(data.projected_revenue)} this month (${peso(Math.round(data.this_month_revenue / data.days_elapsed))}/day avg).` };
        const pctVsLast = Math.round(((data.projected_revenue - data.last_month_revenue) / data.last_month_revenue) * 100);
        if (pctVsLast > 10) return { level: 'success', text: `Projected ${peso(data.projected_revenue)} — ${pctVsLast}% above last month's ${peso(data.last_month_revenue)}.` };
        if (pctVsLast >= -5) return { level: 'info', text: `Projected ${peso(data.projected_revenue)} — roughly in line with last month.` };
        return { level: 'warning', text: `Projected ${peso(data.projected_revenue)} — ${Math.abs(pctVsLast)}% below last month. Increase order volume.` };
    })();

    const deliveryInsight = (() => {
        if (data.total_deliveries === 0) return { level: 'info', text: 'No deliveries recorded in the last 30 days.' };
        const rate = data.delivery_success_rate ?? 0;
        const timeText = data.avg_delivery_hours !== null ? ` Avg time: ${data.avg_delivery_hours}h.` : '';
        if (rate >= 95) return { level: 'success', text: `Excellent! ${rate}% delivery success in 30 days.${timeText}` };
        if (rate >= 85) return { level: 'info',    text: `Good — ${rate}% delivery success rate.${timeText} ${data.failed_deliveries} failed.` };
        return { level: 'warning', text: `${rate}% success rate — ${data.failed_deliveries} of ${data.total_deliveries} failed.${timeText} Review rider assignments.` };
    })();

    const LEVEL_STYLE = {
        critical: { card: 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800',       icon: 'bg-red-500',     text: 'text-red-800 dark:text-red-300' },
        warning:  { card: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800', icon: 'bg-amber-500',   text: 'text-amber-800 dark:text-amber-300' },
        success:  { card: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800', icon: 'bg-emerald-500', text: 'text-emerald-800 dark:text-emerald-300' },
        info:     { card: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800',    icon: 'bg-blue-500',    text: 'text-blue-800 dark:text-blue-300' },
    } as const;

    type Level = keyof typeof LEVEL_STYLE;

    function InsightCard({ title, text, level, icon }: { title: string; text: string; level: Level; icon: React.ReactNode }) {
        const s = LEVEL_STYLE[level];
        return (
            <div className={`rounded-lg border p-3 ${s.card}`}>
                <div className="flex items-center gap-2 mb-1.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md ${s.icon} shrink-0`}>
                        {icon}
                    </div>
                    <p className={`font-bold text-xs ${s.text}`}>{title}</p>
                </div>
                <p className={`text-xs leading-relaxed ${s.text} opacity-90`}>{text}</p>
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InsightCard title="Sales Performance" text={salesInsight.text} level={salesInsight.level as Level}
                icon={<TrendingUp className="h-3.5 w-3.5 text-white" />} />
            <InsightCard title="Stock Health" text={stockInsight.text} level={stockInsight.level as Level}
                icon={<Warehouse className="h-3.5 w-3.5 text-white" />} />
            <InsightCard title="Customer Loyalty" text={customerInsight.text} level={customerInsight.level as Level}
                icon={<Users className="h-3.5 w-3.5 text-white" />} />
            <InsightCard title="Revenue Projection" text={projectionInsight.text} level={projectionInsight.level as Level}
                icon={<Target className="h-3.5 w-3.5 text-white" />} />
            <InsightCard title="Delivery Performance" text={deliveryInsight.text} level={deliveryInsight.level as Level}
                icon={<Truck className="h-3.5 w-3.5 text-white" />} />
            {data.busiest_day && (
                <InsightCard title="Peak Day" level="info"
                    text={`${data.busiest_day} is your busiest day. Prioritize stock and rider availability.`}
                    icon={<CalendarDays className="h-3.5 w-3.5 text-white" />} />
            )}
        </div>
    );
}

// ── Recommendations ─────────────────────────────────────────────────────────────

function RecommendationsCard({ recs }: { recs: Recommendation[] }) {
    const REC_STYLE = {
        critical: { dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',       bg: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'     },
        warning:  { dot: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' },
        success:  { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' },
        info:     { dot: 'bg-blue-500',    text: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'   },
    } as const;

    return (
        <Card>
            <CardContent className="py-3 px-4 space-y-2">
                {recs.map((rec, i) => {
                    const s = REC_STYLE[rec.type];
                    return (
                        <div key={i} className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${s.bg}`}>
                            <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                            <p className={`text-xs leading-relaxed ${s.text}`}>{rec.text}</p>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SellerDss({ reorderAlerts, salesTrend, topProducts, demandForecast, insights, generatedAt }: Props) {
    const criticalCount = reorderAlerts.filter((a) => a.severity === 'critical').length;
    const warningCount  = reorderAlerts.filter((a) => a.severity === 'warning').length;
    const [tab, setTab]  = useState<Tab>('overview');

    const tabs: { key: Tab; label: string; icon: typeof Brain }[] = [
        { key: 'overview',  label: 'Overview',            icon: CalendarDays },
        { key: 'forecast',  label: 'Forecast & Alerts',   icon: AlertTriangle },
        { key: 'trends',    label: 'Trends & Products',   icon: TrendingUp },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="DSS — Decision Support" />

            {/* Slim hero */}
            <div className="bg-gradient-to-r from-slate-800 via-blue-900 to-indigo-900 px-4 sm:px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    {/* Left: title */}
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/30">
                            <Brain className="h-4 w-4 text-blue-200" />
                        </div>
                        <div>
                            <h1 className="text-base font-black text-white leading-tight">Decision Support System</h1>
                            <p className="text-xs text-blue-300">
                                <span className="hidden sm:inline">SMA Forecast · Linear Regression · Stockout Prediction · </span>
                                Generated: {generatedAt}
                            </p>
                        </div>
                    </div>

                    {/* Right: status + refresh */}
                    <div className="flex items-center gap-2">
                        {criticalCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-bold text-white">
                                <Zap className="h-3 w-3" /> {criticalCount} Critical
                            </span>
                        )}
                        {warningCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-xs font-bold text-white">
                                <AlertTriangle className="h-3 w-3" /> {warningCount} Warning
                            </span>
                        )}
                        {criticalCount === 0 && warningCount === 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-bold text-white">
                                All Systems OK
                            </span>
                        )}
                        <span className={`hidden sm:flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            salesTrend.direction === 'increasing' ? 'bg-emerald-500/20 text-emerald-200' :
                            salesTrend.direction === 'decreasing' ? 'bg-red-500/20 text-red-200' :
                            'bg-blue-500/20 text-blue-200'
                        }`}>
                            {salesTrend.direction === 'increasing' ? <ArrowUpRight className="h-3 w-3" /> :
                             salesTrend.direction === 'decreasing' ? <ArrowDownRight className="h-3 w-3" /> :
                             <ArrowRight className="h-3 w-3" />}
                            {salesTrend.trend_percent > 0 ? '+' : ''}{salesTrend.trend_percent}% vs last week
                        </span>
                        <button
                            onClick={() => router.reload()}
                            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-blue-200 hover:bg-white/20 transition-colors"
                        >
                            <RefreshCw className="h-3 w-3" /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 sm:px-6">
                <div className="flex gap-0.5 -mb-px">
                    {tabs.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                tab === key
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                            {key === 'forecast' && reorderAlerts.length > 0 && (
                                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                                    criticalCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                    {reorderAlerts.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">

                {/* ── Tab 1: Overview ── */}
                {tab === 'overview' && (
                    <>
                        {/* Section header */}
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <CalendarDays className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Monthly Summary</h2>
                                <p className="text-xs text-gray-500">Day {insights.days_elapsed} of {insights.days_in_month}</p>
                            </div>
                        </div>
                        <MonthlySummaryCards data={insights} />

                        <div className="flex items-center gap-2 pt-1">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <Lightbulb className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Automated Insights</h2>
                                <p className="text-xs text-gray-500">Plain-language analysis of your store performance</p>
                            </div>
                        </div>
                        <InsightsSection data={insights} reorderAlerts={reorderAlerts} />

                        <div className="flex items-center gap-2 pt-1">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <CheckCircle2 className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Actionable Recommendations</h2>
                                <p className="text-xs text-gray-500">Steps you can take right now based on your data</p>
                            </div>
                        </div>
                        <RecommendationsCard recs={insights.recommendations} />
                    </>
                )}

                {/* ── Tab 2: Forecast & Alerts ── */}
                {tab === 'forecast' && (
                    <>
                        {/* Reorder Alerts */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                    <AlertTriangle className="h-4 w-4 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Reorder Alerts</h2>
                                    <p className="text-xs text-gray-500">Stockout prediction — products needing attention</p>
                                </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                criticalCount > 0 ? 'bg-red-100 text-red-700' :
                                warningCount > 0  ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-100 text-emerald-700'
                            }`}>
                                {reorderAlerts.length > 0 ? `${reorderAlerts.length} alert${reorderAlerts.length !== 1 ? 's' : ''}` : 'All clear'}
                            </span>
                        </div>

                        {reorderAlerts.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-10">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mb-2">
                                        <Warehouse className="h-6 w-6 text-emerald-600" />
                                    </div>
                                    <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">All stock levels are healthy</p>
                                    <p className="text-xs text-gray-400 mt-1">No products are below reorder level.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {criticalCount > 0 && (
                                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                                            <Zap className="h-3 w-3" /> {criticalCount} Critical
                                        </span>
                                    )}
                                    {warningCount > 0 && (
                                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                            <AlertTriangle className="h-3 w-3" /> {warningCount} Warning
                                        </span>
                                    )}
                                    {reorderAlerts.filter((a) => a.severity === 'notice').length > 0 && (
                                        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
                                            <Package className="h-3 w-3" /> {reorderAlerts.filter((a) => a.severity === 'notice').length} Low Stock
                                        </span>
                                    )}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {reorderAlerts.map((a) => <AlertCard key={a.product_id} alert={a} />)}
                                </div>
                            </>
                        )}

                        {/* Demand Forecast */}
                        <div className="flex items-center gap-2 pt-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <Target className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">7-Day Demand Forecast (SMA)</h2>
                                <p className="text-xs text-gray-500">Simple Moving Average — predicted units per product</p>
                            </div>
                            {demandForecast.products.length > 0 && (
                                <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                    {demandForecast.products.length} product{demandForecast.products.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <DemandForecastSection data={demandForecast} />
                    </>
                )}

                {/* ── Tab 3: Trends & Products ── */}
                {tab === 'trends' && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <TrendingUp className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sales Trend</h2>
                                <p className="text-xs text-gray-500">30-day revenue with linear regression trend line</p>
                            </div>
                        </div>
                        <SalesTrendSection data={salesTrend} />

                        <div className="flex items-center gap-2 pt-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
                                <Crown className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Top Products</h2>
                                <p className="text-xs text-gray-500">Best-selling products in the last 30 days</p>
                            </div>
                        </div>
                        <TopProductsSection products={topProducts} />
                    </>
                )}

                {/* Footer note */}
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3 text-center text-xs text-gray-400 mt-2">
                    DSS uses Simple Moving Average (demand forecast) and OLS linear regression (trend). Insights use rule-based logic — not AI. Scoped to your store, excludes cancelled orders.
                </div>
            </div>
        </AppLayout>
    );
}
