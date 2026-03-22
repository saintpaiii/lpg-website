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
    Crown,
    Package,
    RefreshCw,
    ShoppingCart,
    Target,
    TrendingDown,
    TrendingUp,
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

type Props = {
    reorderAlerts: ReorderAlert[];
    salesTrend: SalesTrend;
    topProducts: TopProduct[];
    demandForecast: DemandForecast;
    generatedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'DSS', href: '/seller/dss' },
];

const FORECAST_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-300">
            <Brain className="h-10 w-10" />
            <p className="text-sm text-gray-400">{message}</p>
        </div>
    );
}

// ── Reorder Alerts ─────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    critical: { border: 'border-red-400',    bg: 'bg-red-50',    badge: 'bg-red-600 text-white',            label: 'CRITICAL',  stockBar: 'bg-red-500',    glow: 'shadow-red-100'    },
    warning:  { border: 'border-amber-400',  bg: 'bg-amber-50',  badge: 'bg-amber-500 text-white',          label: 'WARNING',   stockBar: 'bg-amber-500',  glow: 'shadow-amber-100'  },
    notice:   { border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-400 text-yellow-900',    label: 'LOW STOCK', stockBar: 'bg-yellow-400', glow: 'shadow-yellow-100' },
};

function AlertCard({ alert }: { alert: ReorderAlert }) {
    const cfg      = SEVERITY_CONFIG[alert.severity];
    const stockPct = alert.reorder_level > 0
        ? Math.min(100, Math.round((alert.current_stock / (alert.reorder_level * 2)) * 100))
        : 0;
    return (
        <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-4 shadow-md ${cfg.glow} transition-all hover:shadow-lg`}>
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900 text-base">{alert.name}</p>
                    {alert.brand && <p className="text-xs text-gray-500">{alert.brand}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black tracking-wide ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>Current: <span className="font-bold text-gray-800">{alert.current_stock} units</span></span>
                    <span>Reorder: {alert.reorder_level}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                    <div className={`h-2 rounded-full ${cfg.stockBar} transition-all`} style={{ width: `${Math.max(2, stockPct)}%` }} />
                </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/80 p-2 text-center">
                    <p className="text-gray-500">Avg Daily Sales</p>
                    <p className="font-bold text-gray-900">{alert.avg_daily_sales !== null ? `${alert.avg_daily_sales} units` : '—'}</p>
                </div>
                <div className="rounded-lg bg-white/80 p-2 text-center">
                    <p className="text-gray-500">Days Until Stockout</p>
                    <p className={`font-bold ${alert.days_until_stockout !== null ? (alert.severity === 'critical' ? 'text-red-700' : alert.severity === 'warning' ? 'text-amber-700' : 'text-yellow-700') : 'text-gray-400'}`}>
                        {alert.days_until_stockout !== null ? `${alert.days_until_stockout} days` : 'N/A'}
                    </p>
                </div>
            </div>
            <div className={`rounded-lg border ${cfg.border} bg-white/60 p-2.5 text-xs`}>
                <p className="font-semibold text-gray-700 mb-0.5">Recommendation</p>
                {alert.recommended_order !== null ? (
                    <p className="text-gray-600">Order <span className="font-bold text-gray-900">{alert.recommended_order} units</span> of {alert.name} <span className="font-semibold">{alert.days_to_order}</span>.</p>
                ) : (
                    <p className="text-gray-500">Insufficient sales data — monitor stock and reorder soon.</p>
                )}
            </div>
        </div>
    );
}

// ── Sales Trend ────────────────────────────────────────────────────────────────

function SalesTrendSection({ data }: { data: SalesTrend }) {
    const lineColor = data.direction === 'increasing' ? '#10b981' : data.direction === 'decreasing' ? '#ef4444' : '#2563eb';

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                    <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Sales Trend</h2>
                    <p className="text-sm text-gray-500">30-day revenue trend with week-over-week comparison</p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-3">
                    {/* Trend badge */}
                    {data.direction === 'increasing' ? (
                        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                            <TrendingUp className="h-6 w-6 text-emerald-600 shrink-0" />
                            <div>
                                <p className="font-bold text-emerald-700 text-lg">+{data.trend_percent}%</p>
                                <p className="text-xs text-emerald-600">vs last week — Increasing</p>
                            </div>
                        </div>
                    ) : data.direction === 'decreasing' ? (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                            <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
                            <div>
                                <p className="font-bold text-red-700 text-lg">{data.trend_percent}%</p>
                                <p className="text-xs text-red-600">vs last week — Decreasing</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                            <ArrowRight className="h-6 w-6 text-blue-600 shrink-0" />
                            <div>
                                <p className="font-bold text-blue-700 text-lg">{data.trend_percent > 0 ? '+' : ''}{data.trend_percent}%</p>
                                <p className="text-xs text-blue-600">vs last week — Stable</p>
                            </div>
                        </div>
                    )}

                    <Card>
                        <CardContent className="pt-4 space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500 uppercase text-xs font-semibold tracking-wide">This Week</span>
                                <span className="font-bold tabular-nums">{peso(data.this_week)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 uppercase text-xs font-semibold tracking-wide">Last Week</span>
                                <span className="font-bold text-gray-400 tabular-nums">{peso(data.last_week)}</span>
                            </div>
                            {data.peak_day && (
                                <div className="border-t pt-3">
                                    <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Peak Day (30d)</p>
                                    <p className="font-bold text-gray-800">{data.peak_day.label}</p>
                                    <p className="text-sm text-emerald-600 font-semibold">{peso(data.peak_day.revenue)}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Daily Revenue + Trend Line (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.chart.length === 0 ? (
                            <EmptyChart message="No sales data for the last 30 days." />
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={pTick} width={65} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="rounded-lg border bg-white p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-gray-800 mb-1">{label}</p>
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
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                                    <Line type="monotone" dataKey="trend" name="Trend Line" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}

// ── Top Products ───────────────────────────────────────────────────────────────

function TopProductsSection({ products }: { products: TopProduct[] }) {
    return (
        <section className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                    <Crown className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Top Products</h2>
                    <p className="text-sm text-gray-500">Best-selling products in the last 30 days</p>
                </div>
            </div>

            {products.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <ShoppingCart className="h-10 w-10 text-gray-300 mb-3" />
                        <p className="font-medium text-gray-500">No sales data yet</p>
                        <p className="text-sm text-gray-400 mt-1">Process some orders to see your top-selling products.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3 text-center">Units Sold</th>
                                        <th className="px-4 py-3 text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {products.map((p, idx) => (
                                        <tr key={p.product_id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3 text-gray-400 font-bold">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{p.name}</p>
                                                <p className="text-xs text-gray-400">{p.brand}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                                    {p.units_sold} units
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{peso(p.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </section>
    );
}

// ── Demand Forecast ────────────────────────────────────────────────────────────

function DemandForecastSection({ data }: { data: DemandForecast }) {
    const hasData = data.chart.length > 0 && data.top_names.length > 0;

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                    <Target className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">7-Day Demand Forecast</h2>
                    <p className="text-sm text-gray-500">Simple Moving Average — predicted units per product for the next 7 days</p>
                </div>
                {hasData && (
                    <span className="ml-auto rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                        {data.products.length} product{data.products.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Predicted Daily Units — Top Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!hasData ? (
                            <EmptyChart message="No sales history to generate a forecast." />
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={data.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 600 }} />
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
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Weekly Totals</CardTitle>
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
                                                        <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: FORECAST_COLORS[i % FORECAST_COLORS.length] }} />
                                                        <span className="font-medium text-gray-800 truncate max-w-[80px]">{p.name}</span>
                                                    </div>
                                                </td>
                                                {data.day_columns.map((c) => (
                                                    <td key={c.key} className="px-2 py-2 text-center tabular-nums text-gray-600">{p.forecast[c.key] ?? 0}</td>
                                                ))}
                                                <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">{p.total}</td>
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SellerDss({ reorderAlerts, salesTrend, topProducts, demandForecast, generatedAt }: Props) {
    const criticalCount = reorderAlerts.filter((a) => a.severity === 'critical').length;
    const warningCount  = reorderAlerts.filter((a) => a.severity === 'warning').length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Decision Support System" />

            {/* Hero Banner */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-900 px-6 py-8">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10" />
                <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-indigo-500/10" />

                <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/30 backdrop-blur-sm">
                                <Brain className="h-5 w-5 text-blue-200" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-white tracking-tight">Decision Support System</h1>
                                <p className="text-sm text-blue-300">Store analytics and intelligent recommendations</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Zap className="h-3 w-3" /> SMA Demand Forecast
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <TrendingUp className="h-3 w-3" /> Linear Regression Trend
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Target className="h-3 w-3" /> Stockout Prediction
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className="flex gap-2">
                            {criticalCount > 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-red-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    <Zap className="h-3.5 w-3.5" /> {criticalCount} Critical
                                </div>
                            )}
                            {warningCount > 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} Warning
                                </div>
                            )}
                            {criticalCount === 0 && warningCount === 0 && (
                                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1.5 text-sm font-bold text-white">
                                    All Systems OK
                                </div>
                            )}
                        </div>

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

                        <div className="flex items-center gap-2 text-xs text-blue-300">
                            <span>Generated: {generatedAt}</span>
                            <button
                                onClick={() => router.reload()}
                                className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-blue-200 hover:bg-white/20 transition-colors"
                            >
                                <RefreshCw className="h-3 w-3" /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-10 p-6">

                {/* Reorder Alerts */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                                <AlertTriangle className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Reorder Alerts</h2>
                                <p className="text-sm text-gray-500">Products requiring immediate restocking attention</p>
                            </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            criticalCount > 0 ? 'bg-red-100 text-red-700' :
                            warningCount > 0  ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                        }`}>
                            {reorderAlerts.length > 0 ? `${reorderAlerts.length} alert${reorderAlerts.length !== 1 ? 's' : ''}` : 'All clear'}
                        </span>
                    </div>

                    {reorderAlerts.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-3">
                                    <Warehouse className="h-7 w-7 text-emerald-600" />
                                </div>
                                <p className="font-semibold text-gray-700">All stock levels are healthy</p>
                                <p className="text-sm text-gray-400 mt-1">No products are below reorder level.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-3">
                                {criticalCount > 0 && (
                                    <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                                        <Zap className="h-3.5 w-3.5" /> {criticalCount} Critical
                                    </div>
                                )}
                                {warningCount > 0 && (
                                    <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} Warning
                                    </div>
                                )}
                                {reorderAlerts.filter((a) => a.severity === 'notice').length > 0 && (
                                    <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-700">
                                        <Package className="h-3.5 w-3.5" /> {reorderAlerts.filter((a) => a.severity === 'notice').length} Low Stock
                                    </div>
                                )}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {reorderAlerts.map((a) => <AlertCard key={a.product_id} alert={a} />)}
                            </div>
                        </>
                    )}
                </section>

                <Separator />

                <SalesTrendSection data={salesTrend} />

                <Separator />

                <TopProductsSection products={topProducts} />

                <Separator />

                <DemandForecastSection data={demandForecast} />

                {/* Footer note */}
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                    <Brain className="mx-auto mb-1.5 h-5 w-5 text-gray-300" />
                    DSS computations use Simple Moving Average for demand forecasting and Ordinary Least Squares
                    linear regression for trend analysis. All results are scoped to your store and exclude cancelled orders.
                </div>
            </div>
        </AppLayout>
    );
}
