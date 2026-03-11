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
    ReferenceLine,
    Cell,
} from 'recharts';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    Brain,
    Calendar,
    Crown,
    Package,
    RefreshCw,
    ShoppingCart,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
    User,
    Warehouse,
    Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

type DemandForecast = {
    products: { product_id: number; name: string; brand: string; forecast: Record<string, number>; total: number }[];
    chart: Record<string, any>[];
    top_names: string[];
    day_columns: { key: string; label: string }[];
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

type BusinessInsights = {
    peak_day: string | null;
    peak_avg_orders: number;
    top_customer: { name: string; orders_count: number; total_spent: number } | null;
    best_seller: { name: string; units_sold: number } | null;
    revenue_projection: number | null;
    this_month_revenue: number;
    this_month_orders: number;
};

type Props = {
    reorderAlerts: ReorderAlert[];
    demandForecast: DemandForecast;
    salesTrend: SalesTrend;
    businessInsights: BusinessInsights;
    generatedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Decision Support System', href: '/admin/dss' }];

const FORECAST_COLORS = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function pesoFull(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pTick(v: number) {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `₱${(v / 1_000).toFixed(1)}K`;
    return `₱${v}`;
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({
    icon: Icon,
    title,
    subtitle,
    badge,
    badgeColor = 'blue',
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    badge?: string | number;
    badgeColor?: 'red' | 'amber' | 'blue' | 'emerald';
}) {
    const badgeStyles = {
        red:     'bg-red-100 text-red-700',
        amber:   'bg-amber-100 text-amber-700',
        blue:    'bg-blue-100 text-blue-700',
        emerald: 'bg-emerald-100 text-emerald-700',
    };

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <p className="text-sm text-gray-500">{subtitle}</p>
                </div>
            </div>
            {badge !== undefined && (
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badgeStyles[badgeColor]}`}>
                    {badge}
                </span>
            )}
        </div>
    );
}

// ── Section 1: Reorder Alerts ─────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    critical: {
        border:   'border-red-400',
        bg:       'bg-red-50',
        badge:    'bg-red-600 text-white',
        label:    'CRITICAL',
        stockBar: 'bg-red-500',
        icon:     'text-red-600',
        glow:     'shadow-red-100',
    },
    warning: {
        border:   'border-amber-400',
        bg:       'bg-amber-50',
        badge:    'bg-amber-500 text-white',
        label:    'WARNING',
        stockBar: 'bg-amber-500',
        icon:     'text-amber-600',
        glow:     'shadow-amber-100',
    },
    notice: {
        border:   'border-yellow-300',
        bg:       'bg-yellow-50',
        badge:    'bg-yellow-400 text-yellow-900',
        label:    'LOW STOCK',
        stockBar: 'bg-yellow-400',
        icon:     'text-yellow-600',
        glow:     'shadow-yellow-100',
    },
};

function AlertCard({ alert }: { alert: ReorderAlert }) {
    const cfg      = SEVERITY_CONFIG[alert.severity];
    const stockPct = alert.reorder_level > 0
        ? Math.min(100, Math.round((alert.current_stock / (alert.reorder_level * 2)) * 100))
        : 0;

    return (
        <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-4 shadow-md ${cfg.glow} transition-all hover:shadow-lg`}>
            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900 text-base">{alert.name}</p>
                    {alert.brand && <p className="text-xs text-gray-500">{alert.brand}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black tracking-wide ${cfg.badge}`}>
                    {cfg.label}
                </span>
            </div>

            {/* Stock bar */}
            <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>Current: <span className="font-bold text-gray-800">{alert.current_stock} units</span></span>
                    <span>Reorder: {alert.reorder_level}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                        className={`h-2 rounded-full ${cfg.stockBar} transition-all`}
                        style={{ width: `${Math.max(2, stockPct)}%` }}
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/80 p-2 text-center">
                    <p className="text-gray-500">Avg Daily Sales</p>
                    <p className="font-bold text-gray-900">
                        {alert.avg_daily_sales !== null ? `${alert.avg_daily_sales} units` : '—'}
                    </p>
                </div>
                <div className="rounded-lg bg-white/80 p-2 text-center">
                    <p className="text-gray-500">Days Until Stockout</p>
                    <p className={`font-bold ${alert.days_until_stockout !== null ? (alert.severity === 'critical' ? 'text-red-700' : alert.severity === 'warning' ? 'text-amber-700' : 'text-yellow-700') : 'text-gray-400'}`}>
                        {alert.days_until_stockout !== null ? `${alert.days_until_stockout} days` : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Recommendation */}
            <div className={`rounded-lg border ${cfg.border} bg-white/60 p-2.5 text-xs`}>
                <p className="font-semibold text-gray-700 mb-0.5">Recommendation</p>
                {alert.recommended_order !== null ? (
                    <p className="text-gray-600">
                        Order <span className="font-bold text-gray-900">{alert.recommended_order} units</span> of {alert.name}{' '}
                        <span className="font-semibold">{alert.days_to_order}</span>.
                    </p>
                ) : (
                    <p className="text-gray-500">Insufficient sales data — monitor stock level and reorder soon.</p>
                )}
            </div>
        </div>
    );
}

function ReorderAlertsSection({ alerts }: { alerts: ReorderAlert[] }) {
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const warning  = alerts.filter((a) => a.severity === 'warning').length;
    const notice   = alerts.filter((a) => a.severity === 'notice').length;

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={AlertTriangle}
                title="Reorder Alerts"
                subtitle="Products requiring immediate restocking attention"
                badge={alerts.length > 0 ? `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}` : 'All clear'}
                badgeColor={critical > 0 ? 'red' : warning > 0 ? 'amber' : 'emerald'}
            />

            {alerts.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-3">
                            <Warehouse className="h-7 w-7 text-emerald-600" />
                        </div>
                        <p className="font-semibold text-gray-700">All stock levels are healthy</p>
                        <p className="text-sm text-gray-400 mt-1">No products are below reorder level or at risk of stockout.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Severity summary */}
                    <div className="flex flex-wrap gap-3">
                        {critical > 0 && (
                            <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                                <Zap className="h-3.5 w-3.5" />
                                {critical} Critical
                            </div>
                        )}
                        {warning > 0 && (
                            <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {warning} Warning
                            </div>
                        )}
                        {notice > 0 && (
                            <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-700">
                                <Package className="h-3.5 w-3.5" />
                                {notice} Low Stock
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {alerts.map((a) => <AlertCard key={a.product_id} alert={a} />)}
                    </div>
                </>
            )}
        </section>
    );
}

// ── Section 2: Demand Forecast ────────────────────────────────────────────────

function DemandForecastSection({ data }: { data: DemandForecast }) {
    const hasData = data.chart.length > 0 && data.top_names.length > 0;

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={Target}
                title="7-Day Demand Forecast"
                subtitle="Simple Moving Average — predicted units per product for the next 7 days"
                badge={hasData ? `${data.products.length} product${data.products.length !== 1 ? 's' : ''}` : undefined}
            />

            <div className="grid gap-4 lg:grid-cols-5">
                {/* Chart */}
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                            Predicted Daily Units — Top Products
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!hasData ? (
                            <EmptyChart message="No sales history to generate a forecast." />
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="day"
                                        tick={{ fontSize: 12, fontWeight: 600 }}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const entry = data.chart.find((c) => c.day === label);
                                            return (
                                                <div className="rounded-lg border bg-white p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-gray-800 mb-1">{label} {entry?.date}</p>
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
                                    <Legend
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: 11 }}
                                    />
                                    {data.top_names.map((name, i) => (
                                        <Bar
                                            key={name}
                                            dataKey={name}
                                            fill={FORECAST_COLORS[i % FORECAST_COLORS.length]}
                                            radius={[4, 4, 0, 0]}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                            Weekly Totals
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!hasData ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-400">No data</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-400">
                                            <th className="px-3 py-2">Product</th>
                                            {data.day_columns.map((c) => (
                                                <th key={c.key} className="px-2 py-2 text-center">{c.key}</th>
                                            ))}
                                            <th className="px-3 py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {data.products.slice(0, 8).map((p, i) => (
                                            <tr key={p.product_id} className="hover:bg-gray-50/60">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className="inline-block h-2 w-2 rounded-full shrink-0"
                                                            style={{ background: FORECAST_COLORS[i % FORECAST_COLORS.length] }}
                                                        />
                                                        <span className="font-medium text-gray-800 truncate max-w-[80px]">{p.name}</span>
                                                    </div>
                                                </td>
                                                {data.day_columns.map((c) => (
                                                    <td key={c.key} className="px-2 py-2 text-center tabular-nums text-gray-600">
                                                        {p.forecast[c.key] ?? 0}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">
                                                    {p.total}
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
        </section>
    );
}

// ── Section 3: Sales Trend ────────────────────────────────────────────────────

function TrendBadge({ direction, percent }: { direction: string; percent: number }) {
    if (direction === 'increasing') {
        return (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <TrendingUp className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                    <p className="font-bold text-emerald-700 text-lg">+{percent}%</p>
                    <p className="text-xs text-emerald-600">vs last week — Increasing</p>
                </div>
            </div>
        );
    }
    if (direction === 'decreasing') {
        return (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
                <div>
                    <p className="font-bold text-red-700 text-lg">{percent}%</p>
                    <p className="text-xs text-red-600">vs last week — Decreasing</p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
            <ArrowRight className="h-6 w-6 text-blue-600 shrink-0" />
            <div>
                <p className="font-bold text-blue-700 text-lg">{percent > 0 ? '+' : ''}{percent}%</p>
                <p className="text-xs text-blue-600">vs last week — Stable</p>
            </div>
        </div>
    );
}

function SalesTrendSection({ data }: { data: SalesTrend }) {
    const lineColor = data.direction === 'increasing' ? '#10b981' : data.direction === 'decreasing' ? '#ef4444' : '#2563eb';

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={TrendingUp}
                title="Sales Trend Analysis"
                subtitle="Linear regression on 30-day revenue + week-over-week comparison"
            />

            <div className="grid gap-4 lg:grid-cols-4">
                {/* Stats */}
                <div className="space-y-3">
                    <TrendBadge direction={data.direction} percent={data.trend_percent} />

                    <Card>
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">This Week</p>
                                <p className="text-xl font-bold text-gray-900 tabular-nums">{pesoFull(data.this_week)}</p>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Last Week</p>
                                <p className="text-xl font-bold text-gray-500 tabular-nums">{pesoFull(data.last_week)}</p>
                            </div>
                            {data.peak_day && (
                                <>
                                    <Separator />
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Peak Day (30d)</p>
                                        <p className="font-bold text-gray-800">{data.peak_day.label}</p>
                                        <p className="text-sm text-emerald-600 font-semibold">{pesoFull(data.peak_day.revenue)}</p>
                                    </div>
                                </>
                            )}
                            <Separator />
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Trend Slope</p>
                                <p className="font-mono text-sm text-gray-700">
                                    {data.slope > 0 ? '+' : ''}{data.slope.toFixed(4)} ₱/day
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">Linear regression coefficient</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Chart */}
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                            Daily Revenue + Trend Line (Last 30 Days)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.chart.length === 0 ? (
                            <EmptyChart message="No sales data for the last 30 days." />
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 10 }}
                                        interval={4}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={pTick}
                                        width={65}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="rounded-lg border bg-white p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-gray-800 mb-1">{label}</p>
                                                    {payload.map((p: any) => (
                                                        <p key={p.dataKey} style={{ color: p.stroke }}>
                                                            {p.name}: {pesoFull(p.value)}
                                                        </p>
                                                    ))}
                                                    {payload[0] && (
                                                        <p className="text-gray-500 mt-1 text-xs">
                                                            Orders: {data.chart.find(d => d.label === label)?.orders_count ?? 0}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="revenue"
                                        name="Revenue"
                                        stroke={lineColor}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="trend"
                                        name="Trend Line"
                                        stroke="#94a3b8"
                                        strokeWidth={2}
                                        strokeDasharray="6 3"
                                        dot={false}
                                        activeDot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}

// ── Section 4: Business Insights ──────────────────────────────────────────────

function InsightCard({
    icon: Icon,
    iconBg,
    iconColor,
    label,
    value,
    sub,
    accent,
}: {
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                        <Icon className={`h-6 w-6 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
                        <p className="mt-1 font-bold text-gray-900 leading-tight text-base truncate">{value}</p>
                        {sub && <p className="mt-0.5 text-sm text-gray-500">{sub}</p>}
                        {accent && (
                            <p className="mt-1 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded px-2 py-0.5 inline-block">
                                {accent}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function BusinessInsightsSection({ data }: { data: BusinessInsights }) {
    return (
        <section className="space-y-4">
            <SectionHeader
                icon={Sparkles}
                title="Business Insights"
                subtitle="AI-driven recommendations derived from your operational data"
            />

            {/* Month KPIs */}
            <div className="grid gap-3 sm:grid-cols-2">
                <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 shadow-lg">
                    <CardContent className="pt-5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Revenue This Month</p>
                        <p className="mt-1 text-3xl font-black tabular-nums">{peso(data.this_month_revenue)}</p>
                        <p className="mt-1 text-sm text-blue-200">{data.this_month_orders} orders processed</p>
                    </CardContent>
                </Card>
                {data.revenue_projection !== null ? (
                    <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0 shadow-lg">
                        <CardContent className="pt-5">
                            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Projected Next Month</p>
                            <p className="mt-1 text-3xl font-black tabular-nums">{peso(data.revenue_projection)}</p>
                            <p className="mt-1 text-sm text-emerald-200">Based on 3-month growth trend</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex h-full items-center justify-center py-8 text-center text-sm text-gray-400">
                            <div>
                                <p className="font-medium">Projection unavailable</p>
                                <p className="text-xs mt-1">Needs 2+ months of data</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Insight cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InsightCard
                    icon={Calendar}
                    iconBg="bg-purple-100"
                    iconColor="text-purple-600"
                    label="Peak Day"
                    value={data.peak_day ?? 'Insufficient data'}
                    sub={data.peak_day ? `${data.peak_avg_orders} avg orders` : 'Need 90 days of history'}
                    accent={data.peak_day ? 'Busiest day of the week' : undefined}
                />
                <InsightCard
                    icon={User}
                    iconBg="bg-blue-100"
                    iconColor="text-blue-600"
                    label="Top Customer This Month"
                    value={data.top_customer?.name ?? 'No orders yet'}
                    sub={data.top_customer ? `${data.top_customer.orders_count} orders · ${pesoFull(data.top_customer.total_spent)}` : undefined}
                    accent={data.top_customer ? 'Most active customer' : undefined}
                />
                <InsightCard
                    icon={Crown}
                    iconBg="bg-amber-100"
                    iconColor="text-amber-600"
                    label="Best Seller This Month"
                    value={data.best_seller?.name ?? 'No sales yet'}
                    sub={data.best_seller ? `${data.best_seller.units_sold} units sold` : undefined}
                    accent={data.best_seller ? 'Highest demand product' : undefined}
                />
                <InsightCard
                    icon={ShoppingCart}
                    iconBg="bg-emerald-100"
                    iconColor="text-emerald-600"
                    label="Revenue Projection"
                    value={data.revenue_projection !== null ? peso(data.revenue_projection) : 'Calculating...'}
                    sub={data.revenue_projection !== null ? 'Estimated next month' : 'Need more historical data'}
                    accent={data.revenue_projection !== null ? 'Linear trend projection' : undefined}
                />
            </div>
        </section>
    );
}

// ── Empty chart ────────────────────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-gray-300">
            <Brain className="h-10 w-10" />
            <p className="text-sm text-gray-400">{message}</p>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DssPage({
    reorderAlerts,
    demandForecast,
    salesTrend,
    businessInsights,
    generatedAt,
}: Props) {
    const criticalCount = reorderAlerts.filter((a) => a.severity === 'critical').length;
    const warningCount  = reorderAlerts.filter((a) => a.severity === 'warning').length;

    function handleRefresh() {
        router.reload();
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Decision Support System" />

            {/* ── Hero Banner ────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-900 px-6 py-8">
                {/* Decorative circles */}
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10" />
                <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-indigo-500/10" />

                <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/30 backdrop-blur-sm">
                                <Brain className="h-5 w-5 text-blue-200" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-white tracking-tight">
                                    Decision Support System
                                </h1>
                                <p className="text-sm text-blue-300">
                                    AI-powered analytics for LPG distribution management
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Zap className="h-3 w-3" />
                                SMA Demand Forecast
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <TrendingUp className="h-3 w-3" />
                                Linear Regression Trend
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Target className="h-3 w-3" />
                                Stockout Prediction
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        {/* Alert summary pills */}
                        <div className="flex gap-2">
                            {criticalCount > 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-red-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    <Zap className="h-3.5 w-3.5" />
                                    {criticalCount} Critical
                                </div>
                            )}
                            {warningCount > 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {warningCount} Warning
                                </div>
                            )}
                            {criticalCount === 0 && warningCount === 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    All Systems OK
                                </div>
                            )}
                        </div>

                        {/* Trend indicator */}
                        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                            salesTrend.direction === 'increasing' ? 'bg-emerald-500/20 text-emerald-200' :
                            salesTrend.direction === 'decreasing' ? 'bg-red-500/20 text-red-200' :
                            'bg-blue-500/20 text-blue-200'
                        }`}>
                            {salesTrend.direction === 'increasing' ? <ArrowUpRight className="h-4 w-4" /> :
                             salesTrend.direction === 'decreasing' ? <ArrowDownRight className="h-4 w-4" /> :
                             <ArrowRight className="h-4 w-4" />}
                            Sales {salesTrend.direction === 'increasing' ? 'up' : salesTrend.direction === 'decreasing' ? 'down' : 'stable'}{' '}
                            {salesTrend.trend_percent > 0 ? '+' : ''}{salesTrend.trend_percent}% vs last week
                        </div>

                        {/* Generated at + refresh */}
                        <div className="flex items-center gap-2 text-xs text-blue-300">
                            <span>Generated: {generatedAt}</span>
                            <button
                                onClick={handleRefresh}
                                className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-blue-200 hover:bg-white/20 transition-colors"
                            >
                                <RefreshCw className="h-3 w-3" />
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            <div className="flex flex-1 flex-col gap-10 p-6">

                <ReorderAlertsSection alerts={reorderAlerts} />

                <Separator />

                <DemandForecastSection data={demandForecast} />

                <Separator />

                <SalesTrendSection data={salesTrend} />

                <Separator />

                <BusinessInsightsSection data={businessInsights} />

                {/* Footer note */}
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                    <Brain className="mx-auto mb-1.5 h-5 w-5 text-gray-300" />
                    DSS computations use Simple Moving Average for demand forecasting and Ordinary Least Squares
                    linear regression for trend analysis. All results exclude soft-deleted and cancelled records.
                    Computations are logged to the <code className="font-mono bg-gray-100 px-1 rounded">dss_logs</code> table for academic review.
                </div>
            </div>
        </AppLayout>
    );
}
