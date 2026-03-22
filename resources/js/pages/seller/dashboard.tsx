import { Head, Link } from '@inertiajs/react';
import {
    AlertTriangle,
    BarChart3,
    Package,
    PhilippinePeso,
    ShoppingCart,
    TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/seller/dashboard' }];

type Stats = {
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    pendingOrders: number;
    revenueThisMonth: number;
    revenueAllTime: number;
    commissionRate: number;
    commissionThisMonth: number;
    netRevenueThisMonth: number;
};

type ChartPoint = { date: string; short: string; orders: number; revenue: number; net_revenue: number };
type RecentOrder = {
    id: number;
    order_number: string;
    customer: string;
    total_amount: number;
    status: string;
    created_at: string;
};
type LowStockItem = {
    product_id: number;
    product_name: string;
    brand: string;
    quantity: number;
    reorder_level: number;
};

type Props = {
    stats: Stats;
    ordersChart: ChartPoint[];
    recentOrders: RecentOrder[];
    lowStock: LowStockItem[];
};

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:        'bg-green-100 text-green-800',
    cancelled:        'bg-red-100 text-red-800',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SellerDashboard({ stats, ordersChart, recentOrders, lowStock }: Props) {
    const statCards = [
        {
            label: 'Products',
            value: stats.totalProducts,
            sub:   `${stats.activeProducts} active`,
            icon:  Package,
            color: 'text-blue-600',
            bg:    'bg-blue-50 dark:bg-blue-900/20',
            href:  '/seller/products',
        },
        {
            label: 'Total Orders',
            value: stats.totalOrders,
            sub:   `${stats.pendingOrders} pending`,
            icon:  ShoppingCart,
            color: 'text-violet-600',
            bg:    'bg-violet-50 dark:bg-violet-900/20',
            href:  '/seller/orders',
        },
        {
            label: 'Revenue This Month',
            value: fmt(stats.revenueThisMonth),
            sub:   `${fmt(stats.revenueAllTime)} all time`,
            icon:  PhilippinePeso,
            color: 'text-emerald-600',
            bg:    'bg-emerald-50 dark:bg-emerald-900/20',
            href:  null as string | null,
        },
        {
            label: 'Low Stock Alerts',
            value: lowStock.length,
            sub:   lowStock.length > 0 ? 'Items need reorder' : 'All stocked up',
            icon:  AlertTriangle,
            color: lowStock.length > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg:    lowStock.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
            href:  '/seller/inventory',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="p-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Store Dashboard</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Overview of your store's performance.
                    </p>
                </div>

                {/* Revenue breakdown cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Gross Revenue (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-emerald-600">{fmt(stats.revenueThisMonth)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{fmt(stats.revenueAllTime)} all time</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Platform Fee (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-amber-600">{fmt(stats.commissionThisMonth)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{stats.commissionRate}% commission rate</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Net Revenue (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(stats.netRevenueThisMonth)}</p>
                            <p className="text-xs text-muted-foreground mt-1">After platform commission</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Stat cards */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
                        <Card key={label} className="relative overflow-hidden">
                            <CardContent className="pt-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-muted-foreground">{label}</p>
                                        <p className="text-2xl font-bold mt-1 truncate">{value}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                                    </div>
                                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bg} shrink-0`}>
                                        <Icon className={`h-5 w-5 ${color}`} />
                                    </div>
                                </div>
                                {href && <Link href={href} className="absolute inset-0" aria-label={label} />}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Charts */}
                <div className="grid gap-6 lg:grid-cols-5">
                    <Card className="lg:col-span-3">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-blue-600" />
                                Orders — Last 30 Days
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={ordersChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="short" tick={{ fontSize: 11 }} interval={6} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v: number | undefined) => [v ?? 0, 'Orders']}
                                        labelFormatter={(_, p) => p[0]?.payload?.date ?? ''}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Bar dataKey="orders" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                                Gross vs Net Revenue — Last 30 Days
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" />Gross</span>
                                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-500 rounded" />Net</span>
                            </div>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={ordersChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="short" tick={{ fontSize: 11 }} interval={6} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v: number | undefined, name: string) => [fmt(v ?? 0), name === 'revenue' ? 'Gross' : 'Net']}
                                        labelFormatter={(_, p) => p[0]?.payload?.date ?? ''}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Line dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line dataKey="net_revenue" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* Recent orders */}
                    <Card className="lg:col-span-3">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4 text-violet-600" />
                                    Recent Orders
                                </CardTitle>
                                <Link href="/seller/orders" className="text-xs text-blue-600 hover:underline">View all</Link>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Order</th>
                                            <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                                            <th className="text-center px-4 py-2 font-medium text-muted-foreground">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="text-center py-8 text-muted-foreground">No orders yet.</td>
                                            </tr>
                                        ) : recentOrders.map((o) => (
                                            <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/seller/orders/${o.id}`} className="font-mono text-xs text-blue-600 hover:underline font-medium">
                                                        {o.order_number}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</p>
                                                </td>
                                                <td className="px-4 py-2.5 text-sm hidden sm:table-cell">{o.customer}</td>
                                                <td className="px-4 py-2.5 text-right font-medium text-sm">{fmt(o.total_amount)}</td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                                        {o.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Low stock */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    Low Stock
                                </CardTitle>
                                <Link href="/seller/inventory" className="text-xs text-blue-600 hover:underline">View inventory</Link>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {lowStock.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center px-4">All products are well stocked.</p>
                            ) : (
                                <div className="divide-y">
                                    {lowStock.map((item) => (
                                        <div key={item.product_id} className="flex items-center justify-between px-4 py-3 text-sm">
                                            <div>
                                                <p className="font-medium">{item.product_name}</p>
                                                <p className="text-xs text-muted-foreground">{item.brand}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-semibold ${item.quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                                    {item.quantity} left
                                                </p>
                                                <p className="text-xs text-muted-foreground">min {item.reorder_level}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
