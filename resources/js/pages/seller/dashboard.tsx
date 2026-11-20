import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    BarChart3,
    Crown,
    Package,
    Receipt,
    ShoppingCart,
    TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStoreAccess } from '@/hooks/use-store-access';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/seller/dashboard' }];

type Stats = {
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    pendingOrders: number;
    revenueThisMonth: number;
    /** K9: part of revenueThisMonth that is delivery fees */
    deliveryFeesThisMonth?: number;
    revenueAllTime: number;
    deliveredThisMonth: number;
    averageOrderValue: number;
    unpaidInvoices: number;
    unpaidInvoicesAmount: number;
};

type ChartPoint = { date: string; short: string; orders: number; revenue: number };
type RecentOrder = {
    id: number;
    order_number: string;
    customer: string;
    total_amount: number;
    /** What the customer pays: items + delivery fee (shown instead of total_amount) */
    grand_total: number;
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
    /** J4: opening status + the "Closed today" switch */
    hours_status?: { open: boolean; label: string };
    closed_today?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
    confirmed:        'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
    preparing:        'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300',
    out_for_delivery: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
    delivered:        'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
    cancelled:        'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SellerDashboard({ stats, ordersChart, recentOrders, lowStock, hours_status, closed_today = false }: Props) {
    const { auth, plan } = usePage<SharedData>().props;
    // Staff without a module see its numbers but no links into it (they would get a 403 page)
    const { canOpen } = useStoreAccess();
    const canOrders = canOpen('/seller/orders');
    const canInventory = canOpen('/seller/inventory');
    const statCards = [
        {
            label: 'Products',
            value: stats.totalProducts,
            sub:   `${stats.activeProducts} active`,
            icon:  Package,
            color: 'text-blue-600',
            bg:    'bg-blue-50 dark:bg-blue-900/20',
            href:  canOpen('/seller/products') ? '/seller/products' : null,
        },
        {
            label: 'Total Orders',
            value: stats.totalOrders,
            sub:   `${stats.pendingOrders} pending`,
            icon:  ShoppingCart,
            color: 'text-violet-600',
            bg:    'bg-violet-50 dark:bg-violet-900/20',
            href:  canOrders ? '/seller/orders' : null,
        },
        {
            // K11: was a second "Revenue This Month" (the same number as the card above)
            label: 'Unpaid Invoices',
            value: stats.unpaidInvoices,
            sub:   stats.unpaidInvoices > 0 ? `${fmt(stats.unpaidInvoicesAmount)} still to collect` : 'Everything is paid',
            icon:  Receipt,
            color: stats.unpaidInvoices > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg:    stats.unpaidInvoices > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
            href:  (canOpen('/seller/invoices') ? '/seller/invoices' : null) as string | null,
        },
        {
            label: 'Low Stock Alerts',
            value: lowStock.length,
            sub:   lowStock.length > 0 ? 'Items need reorder' : 'All stocked up',
            icon:  AlertTriangle,
            color: lowStock.length > 0 ? 'text-amber-600' : 'text-emerald-600',
            bg:    lowStock.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
            href:  canInventory ? '/seller/inventory' : null,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Store Dashboard</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Overview of your store's performance.
                        </p>
                        {/* J4: opening status + "Closed today" (needs Settings access) */}
                        {hours_status && (
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                                <span className={hours_status.open ? 'font-medium text-green-700 dark:text-green-300' : 'font-medium text-red-600'} data-testid="dashboard-hours">{hours_status.label}</span>
                                {canOpen('/seller/settings') && (
                                    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium">
                                        <input type="checkbox" aria-label="Closed today" checked={closed_today}
                                            onChange={(e) => router.post('/seller/settings/closed-today', { closed: e.target.checked }, { preserveScroll: true })} />
                                        Closed today
                                    </label>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Store plan (owner) */}
                    {plan && auth.user.role === 'seller' && (
                        <Link href="/seller/plan"
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/40 ${
                                !plan.active ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                                    : plan.days_left <= 3 ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-card'
                            }`}>
                            <Crown className="h-4 w-4 text-amber-500" />
                            <span className="font-medium">
                                {plan.active ? `${plan.name} · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left` : 'No active plan — store hidden'}
                            </span>
                            <span className="text-xs font-semibold text-blue-600">Manage</span>
                        </Link>
                    )}
                </div>

                {/* Sales this month — the store keeps the full amount */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 border-l-emerald-500">
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Revenue (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-emerald-600">{fmt(stats.revenueThisMonth)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{fmt(stats.revenueAllTime)} all time{stats.deliveryFeesThisMonth ? ` · of which delivery fees ${fmt(stats.deliveryFeesThisMonth)}` : ''}</p>
                            <p className="text-xs text-muted-foreground">Delivered and paid orders, items + delivery fee</p>
                        </CardContent>
                    </Card>
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 border-l-blue-500">
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Delivered Orders (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.deliveredThisMonth.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground mt-1">Delivered and paid</p>
                        </CardContent>
                    </Card>
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 border-l-violet-500">
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Average Order Value (This Month)</p>
                            <p className="text-2xl font-bold mt-1 text-violet-600">{fmt(stats.averageOrderValue)}</p>
                            <p className="text-xs text-muted-foreground mt-1">Revenue ÷ delivered and paid orders</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Stat cards */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
                        <Card key={label} className="relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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
                    <Card className="lg:col-span-3 hover:shadow-md transition-shadow duration-200">
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

                    <Card className="lg:col-span-2 hover:shadow-md transition-shadow duration-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                                Revenue — Last 30 Days
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={ordersChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="short" tick={{ fontSize: 11 }} interval={6} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v: number | undefined) => [fmt(v ?? 0), 'Revenue']}
                                        labelFormatter={(_, p) => p[0]?.payload?.date ?? ''}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Line dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* Recent orders */}
                    <Card className="lg:col-span-3 hover:shadow-md transition-shadow duration-200">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4 text-violet-600" />
                                    Recent Orders
                                </CardTitle>
                                {canOrders && <Link href="/seller/orders" className="text-xs text-blue-600 hover:underline">View all</Link>}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="rt-cards w-full text-sm">
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
                                                    {canOrders ? (
                                                        <Link href={`/seller/orders/${o.id}`} className="font-mono text-xs text-blue-600 hover:underline font-medium">
                                                            {o.order_number}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-mono text-xs font-medium">{o.order_number}</span>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</p>
                                                </td>
                                                <td className="px-4 py-2.5 text-sm hidden sm:table-cell">{o.customer}</td>
                                                <td className="px-4 py-2.5 text-right font-medium text-sm">{fmt(o.grand_total)}</td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-muted text-foreground/80'}`}>
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
                    <Card className="lg:col-span-2 hover:shadow-md transition-shadow duration-200">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    Low Stock
                                </CardTitle>
                                {canInventory && <Link href="/seller/inventory" className="text-xs text-blue-600 hover:underline">View inventory</Link>}
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
