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
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    Brain,
    Building2,
    Calendar,
    CheckCircle2,
    Crown,
    Lightbulb,
    Package,
    RefreshCw,
    ShoppingCart,
    Sparkles,
    Store,
    TrendingDown,
    TrendingUp,
    Users,
    Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

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

type TopStore = {
    id: number;
    store_name: string;
    city: string;
    orders_count: number;
    revenue: number;
    rank: number;
};

type CustomerGrowthPoint = {
    week: string;
    new_customers: number;
};

type TopProduct = {
    product_id: number;
    name: string;
    brand: string;
    units_sold: number;
    revenue: number;
};

type BusinessInsights = {
    peak_day: string | null;
    peak_avg_orders: number;
    top_store: { name: string; city: string; orders_count: number; total_revenue: number } | null;
    best_seller: { name: string; units_sold: number } | null;
    revenue_projection: number | null;
    this_month_revenue: number;
    this_month_orders: number;
    total_approved_stores: number;
};

type PlatformRec = {
    type: 'critical' | 'warning' | 'info' | 'success';
    text: string;
};

type PlatformInsights = {
    this_month_revenue: number;
    last_month_revenue: number;
    revenue_change_pct: number | null;
    sales_this_month: number;
    subscription_income_this_month: number;
    new_sellers_this_month: number;
    pending_verifications: number;
    new_customers_this_month: number;
    new_customers_last_month: number;
    customer_change_pct: number | null;
    active_stores_this_month: number;
    inactive_stores: number;
    total_approved_stores: number;
    order_success_rate: number | null;
    this_week_customers: number;
    recommendations: PlatformRec[];
};

type Props = {
    salesTrend: SalesTrend;
    topStores: TopStore[];
    customerGrowth: CustomerGrowthPoint[];
    topProducts: TopProduct[];
    businessInsights: BusinessInsights;
    platformInsights: PlatformInsights;
    generatedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Decision Support System', href: '/admin/dss' }];

// J10: dark enough for white numbers (≥ 3 : 1)
const STORE_COLORS = ['#2563eb', '#047857', '#b45309', '#dc2626', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f', '#c2410c', '#475569'];

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
        red:     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
        amber:   'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        blue:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
        emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    };

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-foreground">{title}</h2>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
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

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Brain className="h-10 w-10" />
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    );
}

// ── Section 1: Platform Revenue Trend ─────────────────────────────────────────

function TrendBadge({ direction, percent }: { direction: string; percent: number }) {
    if (direction === 'increasing') return (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
            <TrendingUp className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
                <p className="font-bold text-emerald-700 dark:text-emerald-300 text-lg">+{percent}%</p>
                <p className="text-xs text-emerald-600">vs last week — Increasing</p>
            </div>
        </div>
    );
    if (direction === 'decreasing') return (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3">
            <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
            <div>
                <p className="font-bold text-red-700 dark:text-red-300 text-lg">{percent}%</p>
                <p className="text-xs text-red-600">vs last week — Decreasing</p>
            </div>
        </div>
    );
    return (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3">
            <ArrowRight className="h-6 w-6 text-blue-600 shrink-0" />
            <div>
                <p className="font-bold text-blue-700 dark:text-blue-300 text-lg">{percent > 0 ? '+' : ''}{percent}%</p>
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
                title="Platform Revenue Trend"
                subtitle="Marketplace-wide daily revenue · Linear regression · Last 30 days"
            />
            <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-3">
                    <TrendBadge direction={data.direction} percent={data.trend_percent} />
                    <Card>
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">This Week</p>
                                <p className="text-xl font-bold text-foreground tabular-nums">{pesoFull(data.this_week)}</p>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Last Week</p>
                                <p className="text-xl font-bold text-muted-foreground tabular-nums">{pesoFull(data.last_week)}</p>
                            </div>
                            {data.peak_day && (
                                <>
                                    <Separator />
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Peak Day (30d)</p>
                                        <p className="font-bold text-foreground">{data.peak_day.label}</p>
                                        <p className="text-sm text-emerald-600 font-semibold">{pesoFull(data.peak_day.revenue)}</p>
                                        <p className="text-xs text-muted-foreground">{data.peak_day.orders_count} orders</p>
                                    </div>
                                </>
                            )}
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Trend Slope</p>
                                <p className="font-mono text-sm text-foreground/80">
                                    {data.slope > 0 ? '+' : ''}{data.slope.toFixed(4)} ₱/day
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">OLS regression coefficient</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Daily Platform Revenue + Trend Line (Last 30 Days)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.chart.length === 0 ? (
                            <EmptyChart message="No orders across the marketplace in the last 30 days." />
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={data.chart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={pTick} width={65} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const entry = data.chart.find((d) => d.label === label);
                                            return (
                                                <div className="rounded-lg border bg-card p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-foreground mb-1">{label}</p>
                                                    {payload.map((p: any) => (
                                                        <p key={p.dataKey} style={{ color: p.stroke }}>
                                                            {p.name}: {pesoFull(p.value)}
                                                        </p>
                                                    ))}
                                                    <p className="text-muted-foreground mt-1 text-xs">Orders: {entry?.orders_count ?? 0}</p>
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

// ── Section 2: Top Performing Stores ──────────────────────────────────────────

function TopStoresSection({ stores }: { stores: TopStore[] }) {
    const hasData = stores.length > 0 && stores.some((s) => s.orders_count > 0);

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={Building2}
                title="Top Performing Stores"
                subtitle="Ranked by order volume this month"
                badge={stores.length}
            />
            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Orders This Month — Top Stores
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!hasData ? (
                            <EmptyChart message="No orders recorded this month." />
                        ) : (
                            <ResponsiveContainer width="100%" height={Math.max(200, stores.length * 36)}>
                                <BarChart
                                    data={stores.filter((s) => s.orders_count > 0)}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <YAxis type="category" dataKey="store_name" tick={{ fontSize: 11 }} width={120} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const s = payload[0].payload as TopStore;
                                            return (
                                                <div className="rounded-lg border bg-card p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-foreground">{s.store_name}</p>
                                                    {s.city && <p className="text-xs text-muted-foreground">{s.city}</p>}
                                                    <p className="text-blue-600 font-semibold mt-1">{s.orders_count} orders</p>
                                                    <p className="text-emerald-600">{pesoFull(s.revenue)} revenue</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="orders_count" name="Orders" fill="#2563eb" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Leaderboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {stores.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No approved stores.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Store</th>
                                            <th className="px-2 py-2 text-center">Orders</th>
                                            <th className="px-3 py-2 text-right">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {stores.map((s, i) => (
                                            <tr key={s.id} className="hover:bg-muted/60">
                                                <td className="px-3 py-2.5">
                                                    <span
                                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                                                        style={{ background: STORE_COLORS[i % STORE_COLORS.length] }}
                                                    >
                                                        {s.rank}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <p className="font-medium text-foreground truncate max-w-[110px]">{s.store_name}</p>
                                                    {s.city && <p className="text-muted-foreground">{s.city}</p>}
                                                </td>
                                                <td className="px-2 py-2.5 text-center tabular-nums font-bold text-blue-700 dark:text-blue-300">{s.orders_count}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">{peso(s.revenue)}</td>
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

// ── Section 3: Customer Growth ─────────────────────────────────────────────────

function CustomerGrowthSection({ data }: { data: CustomerGrowthPoint[] }) {
    const totalNew     = data.reduce((s, w) => s + w.new_customers, 0);
    const thisWeek     = data[data.length - 1]?.new_customers ?? 0;
    const lastWeekVal  = data[data.length - 2]?.new_customers ?? 0;
    const growthPct    = lastWeekVal > 0 ? Math.round(((thisWeek - lastWeekVal) / lastWeekVal) * 100) : 0;

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={Users}
                title="Customer Growth"
                subtitle="New customer registrations per week · Last 12 weeks"
                badge={`+${totalNew} total`}
                badgeColor="emerald"
            />
            <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-3">
                    <Card>
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">This Week</p>
                                <p className="text-3xl font-black text-foreground tabular-nums">{thisWeek}</p>
                                <p className="text-sm text-muted-foreground">new customers</p>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Last Week</p>
                                <p className="text-xl font-bold text-muted-foreground tabular-nums">{lastWeekVal}</p>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Week-over-Week</p>
                                <p className={`font-bold text-lg ${growthPct > 0 ? 'text-emerald-600' : growthPct < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                    {growthPct > 0 ? '+' : ''}{growthPct}%
                                </p>
                            </div>
                            <Separator />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">12-Week Total</p>
                                <p className="text-xl font-bold text-foreground tabular-nums">{totalNew}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Weekly New Registrations (Last 12 Weeks)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {totalNew === 0 ? (
                            <EmptyChart message="No new customer registrations in the last 12 weeks." />
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={1} />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="rounded-lg border bg-card p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-foreground mb-1">Week of {label}</p>
                                                    <p className="text-emerald-600 font-semibold">{payload[0].value} new customers</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="new_customers"
                                        name="New Customers"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={{ fill: '#10b981', r: 4 }}
                                        activeDot={{ r: 6 }}
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

// ── Section 4: Top Products Across Marketplace ────────────────────────────────

function TopProductsSection({ products }: { products: TopProduct[] }) {
    const chartData = products.slice(0, 8);

    return (
        <section className="space-y-4">
            <SectionHeader
                icon={Package}
                title="Most Popular Products"
                subtitle="Highest-demand products across all stores · Last 30 days"
                badge={products.length > 0 ? `${products.length} products` : undefined}
            />
            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Units Sold — Top 8 Products
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {chartData.length === 0 ? (
                            <EmptyChart message="No sales data for the last 30 days." />
                        ) : (
                            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
                                <BarChart
                                    data={chartData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as TopProduct;
                                            return (
                                                <div className="rounded-lg border bg-card p-3 shadow-xl text-sm">
                                                    <p className="font-bold text-foreground">{p.name}</p>
                                                    {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                                                    <p className="text-blue-600 font-semibold mt-1">{p.units_sold} units sold</p>
                                                    <p className="text-emerald-600">{pesoFull(p.revenue)} revenue</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="units_sold" name="Units Sold" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Rankings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {products.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No sales data.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b bg-muted text-left text-xs font-semibold uppercase text-muted-foreground">
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Product</th>
                                            <th className="px-2 py-2 text-center">Units</th>
                                            <th className="px-3 py-2 text-right">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {products.map((p, i) => (
                                            <tr key={p.product_id} className="hover:bg-muted/60">
                                                <td className="px-3 py-2.5 text-muted-foreground font-bold">{i + 1}</td>
                                                <td className="px-3 py-2.5">
                                                    <p className="font-medium text-foreground truncate max-w-[100px]">{p.name}</p>
                                                    {p.brand && <p className="text-muted-foreground">{p.brand}</p>}
                                                </td>
                                                <td className="px-2 py-2.5 text-center tabular-nums font-bold text-purple-700 dark:text-purple-300">{p.units_sold}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">{peso(p.revenue)}</td>
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

// ── Section 5: Business Insights ──────────────────────────────────────────────

function InsightCard({
    icon: Icon, iconBg, iconColor, label, value, sub, accent,
}: {
    icon: React.ElementType; iconBg: string; iconColor: string;
    label: string; value: string; sub?: string; accent?: string;
}) {
    return (
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                        <Icon className={`h-6 w-6 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                        <p className="mt-1 font-bold text-foreground leading-tight text-base truncate">{value}</p>
                        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
                        {accent && (
                            <p className="mt-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded px-2 py-0.5 inline-block">
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
                title="Platform Business Insights"
                subtitle="Key metrics and projections for marketplace health this month"
            />
            <div className="grid gap-3 sm:grid-cols-3">
                <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 shadow-lg">
                    <CardContent className="pt-5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Platform Revenue This Month</p>
                        <p className="mt-1 text-3xl font-black tabular-nums">{peso(data.this_month_revenue)}</p>
                        <p className="mt-1 text-sm text-blue-200">{data.this_month_orders} orders · {data.total_approved_stores} active stores</p>
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
                        <CardContent className="flex h-full items-center justify-center py-8 text-center text-sm text-muted-foreground">
                            <div>
                                <p className="font-medium">Projection unavailable</p>
                                <p className="text-xs mt-1">Needs 2+ months of data</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
                <Card className="border-dashed">
                    <CardContent className="pt-5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active Stores</p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-foreground">{data.total_approved_stores}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Approved & operating</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InsightCard
                    icon={Calendar}
                    iconBg="bg-purple-100 dark:bg-purple-900/40"
                    iconColor="text-purple-600"
                    label="Peak Day"
                    value={data.peak_day ?? 'Insufficient data'}
                    sub={data.peak_day ? `${data.peak_avg_orders} avg orders` : 'Need 90 days of history'}
                    accent={data.peak_day ? 'Busiest day platform-wide' : undefined}
                />
                <InsightCard
                    icon={Store}
                    iconBg="bg-blue-100 dark:bg-blue-900/40"
                    iconColor="text-blue-600"
                    label="Top Store This Month"
                    value={data.top_store?.name ?? 'No orders yet'}
                    sub={data.top_store ? `${data.top_store.orders_count} orders · ${pesoFull(data.top_store.total_revenue)}` : undefined}
                    accent={data.top_store ? 'Highest order volume' : undefined}
                />
                <InsightCard
                    icon={Crown}
                    iconBg="bg-amber-100 dark:bg-amber-900/40"
                    iconColor="text-amber-600"
                    label="Best Seller This Month"
                    value={data.best_seller?.name ?? 'No sales yet'}
                    sub={data.best_seller ? `${data.best_seller.units_sold} units sold` : undefined}
                    accent={data.best_seller ? 'Highest demand product' : undefined}
                />
                <InsightCard
                    icon={ShoppingCart}
                    iconBg="bg-emerald-100 dark:bg-emerald-900/40"
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

// ── Platform Insights Section ──────────────────────────────────────────────────

function PlatformInsightsSection({ data, salesTrend, customerGrowth }: {
    data: PlatformInsights;
    salesTrend: SalesTrend;
    customerGrowth: CustomerGrowthPoint[];
}) {
    const revenueUp   = data.revenue_change_pct !== null && data.revenue_change_pct > 0;
    const revenueDown = data.revenue_change_pct !== null && data.revenue_change_pct < 0;

    // Revenue insight
    const revenueInsight = (() => {
        const pct = data.revenue_change_pct;
        if (pct === null) return { level: 'info', text: 'No prior month data to compare against. Platform revenue history will build over time.' };
        if (pct >= 20)  return { level: 'success', text: `Platform revenue is up ${pct}% from last month — strong marketplace growth. Top-performing stores are driving volume.` };
        if (pct >= 5)   return { level: 'success', text: `Revenue grew ${pct}% vs last month. Steady platform growth — monitor seller onboarding to sustain this.` };
        if (pct >= -5)  return { level: 'info',    text: `Revenue is roughly flat (${pct > 0 ? '+' : ''}${pct}% vs last month). Consider seller activation campaigns to push growth.` };
        if (pct >= -15) return { level: 'warning', text: `Revenue declined ${Math.abs(pct)}% from last month. Review inactive stores and underperforming products.` };
        return { level: 'warning', text: `Revenue dropped significantly (${pct}% vs last month). Immediate investigation of store activity and order completion is recommended.` };
    })();

    // Customer acquisition insight
    const customerInsight = (() => {
        const pct = data.customer_change_pct;
        if (pct === null) return { level: 'info', text: `${data.new_customers_this_month} new customers registered this month. Build baseline by tracking month-over-month.` };
        if (pct >= 20)  return { level: 'success', text: `Customer acquisition is up ${pct}% vs last month — ${data.new_customers_this_month} new customers this month. Great growth signal.` };
        if (pct >= 0)   return { level: 'info',    text: `${data.new_customers_this_month} new customers this month (+${pct}% vs last month). Consistent acquisition pace.` };
        return { level: 'warning', text: `New customer registrations dropped ${Math.abs(pct)}% vs last month (${data.new_customers_this_month} this month). Review onboarding and marketing.` };
    })();

    // Seller ecosystem insight
    const sellerInsight = (() => {
        const inactivePct = data.total_approved_stores > 0
            ? Math.round((data.inactive_stores / data.total_approved_stores) * 100)
            : 0;
        if (data.pending_verifications > 0 && inactivePct >= 30) {
            return { level: 'warning', text: `${data.pending_verifications} seller(s) pending approval and ${inactivePct}% of approved stores have no orders this month. Prioritize activating the ecosystem.` };
        }
        if (data.pending_verifications > 0) {
            return { level: 'info', text: `${data.pending_verifications} seller verification(s) pending review. ${data.active_stores_this_month} of ${data.total_approved_stores} approved stores placed orders this month.` };
        }
        if (inactivePct >= 40) {
            return { level: 'warning', text: `${inactivePct}% of approved stores (${data.inactive_stores}) have no orders this month. Consider a seller re-engagement campaign.` };
        }
        return { level: 'success', text: `${data.active_stores_this_month} of ${data.total_approved_stores} approved stores are active this month. No pending verifications.` };
    })();

    // Order completion insight
    const orderInsight = (() => {
        if (data.order_success_rate === null) return { level: 'info', text: 'No orders were delivered or cancelled in the last 30 days, so there is no completion rate yet.' };
        const r = data.order_success_rate;
        if (r >= 90) return { level: 'success', text: `Excellent platform order completion rate of ${r}% in the last 30 days (delivered ÷ delivered + cancelled). Sellers and riders are performing well.` };
        if (r >= 75) return { level: 'info',    text: `Order completion rate is ${r}% across the platform. Room for improvement — review cancelled and failed orders.` };
        return { level: 'warning', text: `Low platform completion rate of ${r}%. High cancellation or delivery failures across stores — investigate root causes.` };
    })();

    // Sales trend insight
    const trendInsight = (() => {
        const d = salesTrend.direction;
        const p = salesTrend.trend_percent;
        if (d === 'increasing') return { level: 'success', text: `Platform revenue has been increasing over the last 30 days (+${p}% vs prior week). The OLS regression trend line is positive.` };
        if (d === 'decreasing') return { level: 'warning', text: `Platform revenue trend is declining (−${p}% vs prior week). Review recent store performance and order patterns.` };
        return { level: 'info', text: `Platform revenue is stable over the last 30 days (${p}% variance). No strong growth or decline detected.` };
    })();

    const LEVEL_STYLE = {
        critical: { card: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40',         icon: 'bg-red-500',      text: 'text-red-800 dark:text-red-300' },
        warning:  { card: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40',     icon: 'bg-amber-500',    text: 'text-amber-800 dark:text-amber-300' },
        success:  { card: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40', icon: 'bg-emerald-500',  text: 'text-emerald-800 dark:text-emerald-300' },
        info:     { card: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',       icon: 'bg-blue-500',     text: 'text-blue-800 dark:text-blue-300' },
    } as const;
    type Level = keyof typeof LEVEL_STYLE;

    const REC_STYLE = {
        critical: { dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',     bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'         },
        warning:  { dot: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'     },
        success:  { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
        info:     { dot: 'bg-blue-500',    text: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'       },
    } as const;

    function InsightCard({ title, text, level, icon }: { title: string; text: string; level: Level; icon: React.ReactNode }) {
        const s = LEVEL_STYLE[level];
        return (
            <div className={`rounded-xl border p-4 ${s.card}`}>
                <div className="flex items-center gap-2.5 mb-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.icon}`}>{icon}</div>
                    <p className={`font-bold text-sm ${s.text}`}>{title}</p>
                </div>
                <p className={`text-sm leading-relaxed ${s.text} opacity-90`}>{text}</p>
            </div>
        );
    }

    return (
        <>
            {/* Insight cards */}
            <section className="space-y-4">
                <SectionHeader
                    icon={Lightbulb}
                    title="Platform Insights"
                    subtitle="Automated plain-language analysis of marketplace health"
                />

                {/* Summary stats row */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform Sales (This Month)</p>
                        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{pesoFull(data.sales_this_month)}</p>
                        <p className="text-xs text-muted-foreground">GMV of delivered orders</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription Income (This Month)</p>
                        <p className="text-2xl font-black text-violet-700 dark:text-violet-300 tabular-nums">{pesoFull(data.subscription_income_this_month)}</p>
                        <p className="text-xs text-muted-foreground">Store plans paid (PayMongo + cash)</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue vs Last Month</p>
                        <p className={`text-2xl font-black tabular-nums flex items-center gap-1 ${revenueUp ? 'text-emerald-600' : revenueDown ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {revenueUp ? <ArrowUpRight className="h-5 w-5" /> : revenueDown ? <ArrowDownRight className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                            {data.revenue_change_pct !== null ? `${data.revenue_change_pct > 0 ? '+' : ''}${data.revenue_change_pct}%` : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">vs {pesoFull(data.last_month_revenue)} last month</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Customers</p>
                        <p className="text-2xl font-black text-foreground tabular-nums">{data.new_customers_this_month}</p>
                        <p className="text-xs text-muted-foreground">{data.this_week_customers} this week</p>
                    </div>
                    <div className={`rounded-xl border p-4 space-y-1 ${data.pending_verifications > 0 ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40' : 'bg-card'}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Verifications</p>
                        <p className={`text-2xl font-black tabular-nums ${data.pending_verifications > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {data.pending_verifications}
                        </p>
                        <p className="text-xs text-muted-foreground">{data.active_stores_this_month}/{data.total_approved_stores} stores active</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InsightCard title="Revenue Performance" text={revenueInsight.text} level={revenueInsight.level as Level}
                        icon={<TrendingUp className="h-4 w-4 text-white" />} />
                    <InsightCard title="Sales Trend (30d)" text={trendInsight.text} level={trendInsight.level as Level}
                        icon={<Sparkles className="h-4 w-4 text-white" />} />
                    <InsightCard title="Customer Acquisition" text={customerInsight.text} level={customerInsight.level as Level}
                        icon={<Users className="h-4 w-4 text-white" />} />
                    <InsightCard title="Seller Ecosystem" text={sellerInsight.text} level={sellerInsight.level as Level}
                        icon={<Building2 className="h-4 w-4 text-white" />} />
                    <InsightCard title="Order Completion" text={orderInsight.text} level={orderInsight.level as Level}
                        icon={<ShoppingCart className="h-4 w-4 text-white" />} />
                </div>
            </section>

            {/* Recommendations */}
            <section className="space-y-4">
                <SectionHeader
                    icon={CheckCircle2}
                    title="Platform Recommendations"
                    subtitle="Actionable steps based on current marketplace data"
                />
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    {data.recommendations.map((rec, i) => {
                        const s = REC_STYLE[rec.type];
                        return (
                            <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${s.bg}`}>
                                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
                                <p className={`text-sm leading-relaxed ${s.text}`}>{rec.text}</p>
                            </div>
                        );
                    })}
                </div>
            </section>
        </>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DssPage({
    salesTrend,
    topStores,
    customerGrowth,
    topProducts,
    businessInsights,
    platformInsights,
    generatedAt,
}: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Decision Support System" />

            {/* ── Hero Banner ────────────────────────────────────────────────── */}
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
                                <h1 className="text-2xl font-black text-white tracking-tight">
                                    Decision Support System
                                </h1>
                                <p className="text-sm text-blue-300">
                                    Marketplace-wide analytics · Platform admin view
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <TrendingUp className="h-3 w-3" />
                                Revenue Trend (OLS)
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Building2 className="h-3 w-3" />
                                Store Rankings
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Users className="h-3 w-3" />
                                Customer Growth
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                                <Zap className="h-3 w-3" />
                                Top Products
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                            salesTrend.direction === 'increasing' ? 'bg-emerald-500/20 text-emerald-200' :
                            salesTrend.direction === 'decreasing' ? 'bg-red-500/20 text-red-200' :
                            'bg-blue-500/20 text-blue-200'
                        }`}>
                            {salesTrend.direction === 'increasing' ? <ArrowUpRight className="h-4 w-4" /> :
                             salesTrend.direction === 'decreasing' ? <ArrowDownRight className="h-4 w-4" /> :
                             <ArrowRight className="h-4 w-4" />}
                            Revenue {salesTrend.direction === 'increasing' ? 'up' : salesTrend.direction === 'decreasing' ? 'down' : 'stable'}{' '}
                            {salesTrend.trend_percent > 0 ? '+' : ''}{salesTrend.trend_percent}% vs last week
                        </div>
                        <div className="flex items-center gap-2 text-xs text-blue-300">
                            <span>Generated: {generatedAt}</span>
                            <button
                                onClick={() => router.reload()}
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

                <SalesTrendSection data={salesTrend} />

                <Separator />

                <TopStoresSection stores={topStores} />

                <Separator />

                <CustomerGrowthSection data={customerGrowth} />

                <Separator />

                <TopProductsSection products={topProducts} />

                <Separator />

                <BusinessInsightsSection data={businessInsights} />

                <Separator />

                <PlatformInsightsSection data={platformInsights} salesTrend={salesTrend} customerGrowth={customerGrowth} />

                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    <Brain className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
                    Admin DSS shows marketplace-wide metrics across all approved stores. Revenue trend uses Ordinary Least Squares linear regression.
                    Insights and recommendations are generated using rule-based IF/ELSE logic — not AI. All computations exclude soft-deleted and cancelled records.
                    Results are logged to the <code className="font-mono bg-muted px-1 rounded">dss_logs</code> table for academic review.
                </div>
            </div>
        </AppLayout>
    );
}
