import { Head } from '@inertiajs/react';
import {
    AlertTriangle,
    Package,
    ShoppingCart,
    TrendingUp,
    Truck,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes/admin';
import type { BreadcrumbItem } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stats = {
    ordersToday: number;
    revenueToday: number;
    pendingOrders: number;
    lowStockAlerts: number;
    activeDeliveries: number;
};

type SalesDay = {
    date: string;
    full: string;
    orders: number;
    revenue: number;
};

type StatusSlice = {
    status: string;
    count: number;
};

type RecentOrder = {
    order_number: string;
    customer_name: string;
    total_amount: number;
    status: string;
    created_at: string;
};

type LowStockProduct = {
    name: string;
    quantity: number;
    reorder_level: number;
    critical: boolean;
};

type ActiveDelivery = {
    order_number: string;
    rider_name: string;
    status: string;
};

type Props = {
    stats: Stats;
    salesChart: SalesDay[];
    statusChart: StatusSlice[];
    recentOrders: RecentOrder[];
    lowStockProducts: LowStockProduct[];
    activeDeliveries: ActiveDelivery[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: dashboard() }];

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#6b7280'];

const ORDER_STATUS_STYLES: Record<string, string> = {
    pending:          'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    confirmed:        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    preparing:        'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    out_for_delivery: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    delivered:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    cancelled:        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const DELIVERY_STATUS_STYLES: Record<string, string> = {
    assigned:   'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    picked_up:  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    in_transit: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    delivered:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    failed:     'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function fmt(n: number): string {
    return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2 }).format(n);
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
    const cls = map[status] ?? 'bg-gray-100 text-gray-700';
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

// ── Tooltip formatters ────────────────────────────────────────────────────────

function SalesTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1">
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-blue-600">Orders: {payload[0]?.value}</p>
            <p className="text-emerald-600">Revenue: ₱{fmt(payload[1]?.value ?? 0)}</p>
        </div>
    );
}

function PieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1">
            <p className="font-semibold">{payload[0].name}</p>
            <p>{payload[0].value} orders</p>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard({
    stats,
    salesChart,
    statusChart,
    recentOrders,
    lowStockProducts,
    activeDeliveries,
}: Props) {
    const statCards = [
        {
            label: 'Orders Today',
            value: stats.ordersToday.toString(),
            icon: ShoppingCart,
            color: 'text-blue-600',
            bg:    'bg-blue-50 dark:bg-blue-950',
            sub:   'total orders placed today',
        },
        {
            label: 'Revenue Today',
            value: `₱${fmt(stats.revenueToday)}`,
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg:    'bg-emerald-50 dark:bg-emerald-950',
            sub:   'from paid orders',
        },
        {
            label: 'Pending Orders',
            value: stats.pendingOrders.toString(),
            icon: Package,
            color: 'text-amber-600',
            bg:    'bg-amber-50 dark:bg-amber-950',
            sub:   'awaiting confirmation',
        },
        {
            label: 'Low Stock Alerts',
            value: stats.lowStockAlerts.toString(),
            icon: AlertTriangle,
            color: 'text-red-600',
            bg:    'bg-red-50 dark:bg-red-950',
            sub:   'products below reorder level',
        },
        {
            label: 'Active Deliveries',
            value: stats.activeDeliveries.toString(),
            icon: Truck,
            color: 'text-blue-600',
            bg:    'bg-blue-50 dark:bg-blue-950',
            sub:   'in transit right now',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="flex flex-col gap-6 p-6">

                {/* ── Page header ─────────────────────────────────────── */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Welcome back — here's what's happening today.
                    </p>
                </div>

                {/* ── Row 1: 5 stat cards ─────────────────────────────── */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    {statCards.map((card) => (
                        <Card key={card.label} className="py-5">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                                        {card.label}
                                    </CardDescription>
                                    <div className={`rounded-lg p-1.5 ${card.bg}`}>
                                        <card.icon className={`h-4 w-4 ${card.color}`} />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-2xl font-bold tracking-tight ${card.color}`}>
                                    {card.value}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* ── Row 2: Charts ───────────────────────────────────── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

                    {/* Bar chart — 60% width */}
                    <Card className="lg:col-span-3">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Daily Sales — Last 7 Days</CardTitle>
                            <CardDescription className="text-xs">Orders placed and revenue collected</CardDescription>
                        </CardHeader>
                        <CardContent className="pb-4">
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart
                                    data={salesChart}
                                    margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                                    barGap={4}
                                >
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        className="fill-muted-foreground"
                                    />
                                    <YAxis
                                        yAxisId="orders"
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        className="fill-muted-foreground"
                                        allowDecimals={false}
                                    />
                                    <YAxis
                                        yAxisId="revenue"
                                        orientation="right"
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        className="fill-muted-foreground"
                                        tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip content={<SalesTooltip />} />
                                    <Legend
                                        iconType="square"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: 11 }}
                                    />
                                    <Bar
                                        yAxisId="orders"
                                        dataKey="orders"
                                        name="Orders"
                                        fill="#3b82f6"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={32}
                                    />
                                    <Bar
                                        yAxisId="revenue"
                                        dataKey="revenue"
                                        name="Revenue (₱)"
                                        fill="#10b981"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={32}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Pie chart — 40% width */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Order Status Breakdown</CardTitle>
                            <CardDescription className="text-xs">All-time distribution by status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {statusChart.length === 0 ? (
                                <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                                    No orders yet
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie
                                            data={statusChart}
                                            dataKey="count"
                                            nameKey="status"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={90}
                                            paddingAngle={3}
                                        >
                                            {statusChart.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<PieTooltip />} />
                                        <Legend
                                            iconType="circle"
                                            iconSize={8}
                                            wrapperStyle={{ fontSize: 11 }}
                                            formatter={(value) => (
                                                <span className="text-foreground">{value}</span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Row 3: Tables ───────────────────────────────────── */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

                    {/* Recent orders — spans 1 col on xl (but full-width on smaller) */}
                    <Card className="xl:col-span-1">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
                            <CardDescription className="text-xs">Last 10 orders placed</CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {recentOrders.length === 0 ? (
                                <p className="px-6 pb-4 text-sm text-muted-foreground">No orders yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs text-muted-foreground">
                                                <th className="pb-2 pl-6 pr-3 font-medium">Order #</th>
                                                <th className="pb-2 pr-3 font-medium">Customer</th>
                                                <th className="pb-2 pr-3 font-medium">Total</th>
                                                <th className="pb-2 pr-3 font-medium">Status</th>
                                                <th className="pb-2 pr-6 font-medium">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentOrders.map((order) => (
                                                <tr
                                                    key={order.order_number}
                                                    className="border-b last:border-0 transition-colors hover:bg-muted/40"
                                                >
                                                    <td className="py-2.5 pl-6 pr-3 font-mono text-xs text-muted-foreground">
                                                        {order.order_number}
                                                    </td>
                                                    <td className="py-2.5 pr-3 font-medium">{order.customer_name}</td>
                                                    <td className="py-2.5 pr-3 text-xs">₱{fmt(order.total_amount)}</td>
                                                    <td className="py-2.5 pr-3">
                                                        <StatusBadge status={order.status} map={ORDER_STATUS_STYLES} />
                                                    </td>
                                                    <td className="py-2.5 pr-6 text-xs text-muted-foreground whitespace-nowrap">
                                                        {order.created_at}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Low stock products */}
                    <Card className="xl:col-span-1">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Low Stock Products</CardTitle>
                            <CardDescription className="text-xs">Products at or below reorder level</CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {lowStockProducts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 pb-6 pt-4 text-center">
                                    <Package className="mb-2 h-8 w-8 text-emerald-400" />
                                    <p className="text-sm font-medium text-emerald-600">All stock levels are healthy</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs text-muted-foreground">
                                                <th className="pb-2 pl-6 pr-3 font-medium">Product</th>
                                                <th className="pb-2 pr-3 font-medium">Stock</th>
                                                <th className="pb-2 pr-3 font-medium">Reorder At</th>
                                                <th className="pb-2 pr-6 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lowStockProducts.map((p) => (
                                                <tr
                                                    key={p.name}
                                                    className="border-b last:border-0 transition-colors hover:bg-muted/40"
                                                >
                                                    <td className="py-2.5 pl-6 pr-3 font-medium">{p.name}</td>
                                                    <td className={`py-2.5 pr-3 font-bold ${p.critical ? 'text-red-600' : 'text-amber-600'}`}>
                                                        {p.quantity}
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-muted-foreground">{p.reorder_level}</td>
                                                    <td className="py-2.5 pr-6">
                                                        {p.critical ? (
                                                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                                                                Out of stock
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                                                Low stock
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

                    {/* Active deliveries */}
                    <Card className="xl:col-span-1">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Active Deliveries</CardTitle>
                            <CardDescription className="text-xs">Currently out for delivery</CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {activeDeliveries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 pb-6 pt-4 text-center">
                                    <Truck className="mb-2 h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">No active deliveries</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs text-muted-foreground">
                                                <th className="pb-2 pl-6 pr-3 font-medium">Order #</th>
                                                <th className="pb-2 pr-3 font-medium">Rider</th>
                                                <th className="pb-2 pr-6 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeDeliveries.map((d, i) => (
                                                <tr
                                                    key={i}
                                                    className="border-b last:border-0 transition-colors hover:bg-muted/40"
                                                >
                                                    <td className="py-2.5 pl-6 pr-3 font-mono text-xs text-muted-foreground">
                                                        {d.order_number}
                                                    </td>
                                                    <td className="py-2.5 pr-3 font-medium">{d.rider_name}</td>
                                                    <td className="py-2.5 pr-6">
                                                        <StatusBadge status={d.status} map={DELIVERY_STATUS_STYLES} />
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

            </div>
        </AppLayout>
    );
}
