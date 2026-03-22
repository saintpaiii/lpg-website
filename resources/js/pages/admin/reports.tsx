import { Head, router } from '@inertiajs/react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend,
} from 'recharts';
import { useState } from 'react';
import {
    BarChart2,
    Filter,
    PhilippinePeso,
    ShoppingCart,
    Star,
    Store,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reports', href: '/admin/reports' }];

// ── Types ──────────────────────────────────────────────────────────────────────

type StoreBreakdown = {
    store_id: number; store_name: string; city: string;
    commission_rate: number; orders: number; gmv: number; commission: number;
};
type CommissionData = {
    total_commission: number; total_gmv: number;
    monthly_chart: { month: string; commission: number }[];
    store_breakdown: StoreBreakdown[];
};

type UsersData = {
    total_users: number; total_buyers: number; total_sellers: number;
    new_in_range: number; verified_users: number;
    weekly_chart: { week: string; buyers: number; sellers: number }[];
    by_role: { role: string; count: number }[];
};

type TopStore = {
    id: number; store_name: string; city: string; status: string;
    orders_count: number; gmv: number; rank: number;
};
type StoresData = {
    total: number; approved: number; pending: number; rejected: number; suspended: number;
    top_stores: TopStore[];
    status_chart: { name: string; value: number; color: string }[];
};

type OrdersData = {
    total_orders: number;
    status_chart: { name: string; value: number; color: string }[];
    payment_chart: { method: string; count: number }[];
    daily_trend: { date: string; orders: number; gmv: number }[];
};

type TopRatedStore = {
    id: number; store_name: string; city: string;
    avg_rating: number; review_count: number; rank: number;
};
type RatingsData = {
    platform_avg: number;
    total_reviews: number;
    breakdown: Record<number, number>;
    top_rated: TopRatedStore[];
    monthly_chart: { month: string; count: number }[];
};

type Props = {
    tab: string;
    date_from: string; date_from_raw: string;
    date_to: string;   date_to_raw: string;
    commission?: CommissionData;
    users?: UsersData;
    stores?: StoresData;
    orders?: OrdersData;
    ratings?: RatingsData;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'commission', label: 'Commission', icon: PhilippinePeso },
    { key: 'users',      label: 'Users',      icon: Users          },
    { key: 'stores',     label: 'Stores',     icon: Store          },
    { key: 'orders',     label: 'Orders',     icon: ShoppingCart   },
    { key: 'ratings',    label: 'Ratings',    icon: Star           },
] as const;

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </CardContent>
        </Card>
    );
}

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

// ── Tab 1: Commission ──────────────────────────────────────────────────────────

function CommissionTab({ data }: { data: CommissionData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Total Commission Earned" value={fmt(data.total_commission)} color="text-amber-600" />
                <StatCard label="Total GMV (Gross Merchandise Value)" value={fmt(data.total_gmv)} color="text-emerald-600" />
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <PhilippinePeso className="h-4 w-4 text-amber-600" />
                        Commission by Month — Last 12 Months
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.monthly_chart.every(r => r.commission === 0) ? (
                        <EmptyChart message="No commission data yet." />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={data.monthly_chart} margin={{ top: 4, right: 10, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: number) => [fmt(v), 'Commission']} contentStyle={{ fontSize: 12 }} />
                                <Bar dataKey="commission" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Store Commission Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.store_breakdown.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No store sales in this period.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <th className="px-4 py-3">Store</th>
                                        <th className="px-4 py-3 text-right">Orders</th>
                                        <th className="px-4 py-3 text-right">GMV</th>
                                        <th className="px-4 py-3 text-right">Rate</th>
                                        <th className="px-4 py-3 text-right">Commission</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.store_breakdown.map((row) => (
                                        <tr key={row.store_id} className="hover:bg-muted/20">
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium">{row.store_name}</p>
                                                {row.city && <p className="text-xs text-muted-foreground">{row.city}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{row.orders}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.gmv)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{row.commission_rate}%</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-600">{fmt(row.commission)}</td>
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

// ── Tab 2: Users ───────────────────────────────────────────────────────────────

function UsersTab({ data }: { data: UsersData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Users"    value={data.total_users.toLocaleString()}   color="text-blue-600" />
                <StatCard label="Buyers"          value={data.total_buyers.toLocaleString()}   color="text-blue-600" />
                <StatCard label="Sellers"          value={data.total_sellers.toLocaleString()}  color="text-emerald-600" />
                <StatCard label="ID Verified"     value={data.verified_users.toLocaleString()} color="text-violet-600"
                    sub={`${data.new_in_range} registered in period`} />
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        New Registrations — Last 12 Weeks
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={data.weekly_chart} margin={{ top: 4, right: 10, left: 0, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend verticalAlign="top" />
                            <Bar dataKey="buyers"  name="Buyers"  fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                            <Bar dataKey="sellers" name="Sellers" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Users by Role</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {data.by_role.map((r) => {
                            const pct = data.total_users > 0 ? Math.round((r.count / data.total_users) * 100) : 0;
                            return (
                                <div key={r.role}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="capitalize font-medium">{r.role.replace('_', ' ')}</span>
                                        <span className="text-muted-foreground">{r.count.toLocaleString()} ({pct}%)</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ── Tab 3: Stores ──────────────────────────────────────────────────────────────

function StoresTab({ data }: { data: StoresData }) {
    const statusConfig: Record<string, string> = {
        approved:  'bg-emerald-100 text-emerald-700',
        pending:   'bg-yellow-100 text-yellow-700',
        rejected:  'bg-red-100 text-red-700',
        suspended: 'bg-gray-100 text-gray-600',
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Stores"    value={data.total}     />
                <StatCard label="Approved"         value={data.approved}  color="text-emerald-600" />
                <StatCard label="Pending Approval" value={data.pending}   color="text-amber-600" />
                <StatCard label="Rejected / Suspended" value={data.rejected + data.suspended} color="text-red-600" />
            </div>

            {/* Status breakdown visual */}
            {data.total > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Store Status Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.status_chart.filter(s => s.value > 0).map((s) => {
                                const pct = Math.round((s.value / data.total) * 100);
                                return (
                                    <div key={s.name}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="font-medium">{s.name}</span>
                                            <span className="text-muted-foreground">{s.value} ({pct}%)</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top Stores by Order Volume</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.top_stores.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No store data available.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">Store</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Orders</th>
                                        <th className="px-4 py-3 text-right">GMV</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.top_stores.map((s) => (
                                        <tr key={s.id} className="hover:bg-muted/20">
                                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{s.rank}</td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium">{s.store_name}</p>
                                                {s.city && <p className="text-xs text-muted-foreground">{s.city}</p>}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{s.orders_count.toLocaleString()}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(s.gmv)}</td>
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

// ── Tab 4: Orders ──────────────────────────────────────────────────────────────

function OrdersTab({ data }: { data: OrdersData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-1">
                <StatCard label="Total Orders in Period" value={data.total_orders.toLocaleString()} color="text-violet-600" />
            </div>

            {/* Order status breakdown */}
            {data.status_chart.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Orders by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.status_chart.map((s) => {
                                const pct = data.total_orders > 0 ? Math.round((s.value / data.total_orders) * 100) : 0;
                                return (
                                    <div key={s.name}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="font-medium capitalize">{s.name}</span>
                                            <span className="text-muted-foreground">{s.value.toLocaleString()} ({pct}%)</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payment method breakdown */}
            {data.payment_chart.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Orders by Payment Method</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart
                                data={data.payment_chart}
                                layout="vertical"
                                margin={{ top: 4, right: 40, left: 60, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                <YAxis dataKey="method" type="category" tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(v: number) => [v, 'Orders']} contentStyle={{ fontSize: 12 }} />
                                <Bar dataKey="count" name="Orders" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Daily trend */}
            {data.daily_trend.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BarChart2 className="h-4 w-4 text-violet-600" />
                            Daily Order Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={data.daily_trend} margin={{ top: 4, right: 10, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: number) => [v, 'Orders']} contentStyle={{ fontSize: 12 }} />
                                <Line dataKey="orders" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// ── Tab 5: Ratings ─────────────────────────────────────────────────────────────

function RatingsTab({ data }: { data: RatingsData }) {
    const total = data.total_reviews;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                    <CardContent className="pt-5 pb-4">
                        <p className="text-sm text-muted-foreground">Platform Average Rating</p>
                        {total > 0 ? (
                            <>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-3xl font-bold text-amber-500">{data.platform_avg.toFixed(2)}</span>
                                    <span className="text-muted-foreground text-sm">/ 5</span>
                                </div>
                                <div className="flex gap-px mt-1">
                                    {[1,2,3,4,5].map((i) => (
                                        <span key={i} className={`text-sm ${i <= Math.round(data.platform_avg) ? 'text-amber-400' : 'text-gray-300'}`}>★</span>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{total.toLocaleString()} review{total !== 1 ? 's' : ''}</p>
                            </>
                        ) : (
                            <p className="text-muted-foreground text-sm italic mt-1">No reviews yet</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Rating Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const count = data.breakdown[star] ?? 0;
                            const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                                <div key={star} className="flex items-center gap-2 text-sm">
                                    <span className="w-4 text-right text-amber-500 font-semibold">{star}</span>
                                    <span className="text-amber-400 text-xs">★</span>
                                    <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            {/* Monthly review volume */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        Review Volume — Last 12 Months
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.monthly_chart.every(r => r.count === 0) ? (
                        <EmptyChart message="No reviews submitted yet." />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={data.monthly_chart} margin={{ top: 4, right: 10, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: number) => [v, 'Reviews']} contentStyle={{ fontSize: 12 }} />
                                <Bar dataKey="count" name="Reviews" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Top-rated stores */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top Rated Stores</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {data.top_rated.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No stores have 5 or more reviews yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">Store</th>
                                        <th className="px-4 py-3">Rating</th>
                                        <th className="px-4 py-3 text-right">Reviews</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.top_rated.map((s) => (
                                        <tr key={s.id} className="hover:bg-muted/20">
                                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{s.rank}</td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-medium">{s.store_name}</p>
                                                {s.city && <p className="text-xs text-muted-foreground">{s.city}</p>}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-amber-400 text-sm">★</span>
                                                    <span className="font-semibold tabular-nums">{s.avg_rating.toFixed(2)}</span>
                                                    {s.avg_rating >= 4.5 && (
                                                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">Top Rated</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{s.review_count.toLocaleString()}</td>
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage({
    tab,
    date_from_raw,
    date_to_raw,
    commission,
    users,
    stores,
    orders,
    ratings,
}: Props) {
    const [fromVal, setFromVal] = useState(date_from_raw);
    const [toVal,   setToVal]   = useState(date_to_raw);

    function switchTab(newTab: string) {
        router.get('/admin/reports', { tab: newTab, date_from: fromVal, date_to: toVal }, { preserveState: false });
    }

    function applyDates() {
        router.get('/admin/reports', { tab, date_from: fromVal, date_to: toVal }, { preserveState: false });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />

            <div className="flex flex-1 flex-col gap-6 p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">Platform-wide analytics</p>
                    </div>

                    {/* Date range filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Input
                            type="date"
                            value={fromVal}
                            onChange={(e) => setFromVal(e.target.value)}
                            className="w-36 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                            type="date"
                            value={toVal}
                            onChange={(e) => setToVal(e.target.value)}
                            className="w-36 text-sm"
                        />
                        <Button size="sm" onClick={applyDates}>Apply</Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b">
                    <nav className="flex gap-1">
                        {TABS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => switchTab(key)}
                                className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                                    tab === key
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab content */}
                {tab === 'commission' && commission && <CommissionTab data={commission} />}
                {tab === 'users'      && users      && <UsersTab      data={users}      />}
                {tab === 'stores'     && stores     && <StoresTab     data={stores}     />}
                {tab === 'orders'     && orders     && <OrdersTab     data={orders}     />}
                {tab === 'ratings'    && ratings    && <RatingsTab    data={ratings}    />}
            </div>
        </AppLayout>
    );
}
