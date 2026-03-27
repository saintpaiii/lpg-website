import { Head, Link } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    BadgeCheck,
    CheckCircle2,
    PhilippinePeso,
    ShieldAlert,
    ShoppingCart,
    Store,
    TrendingUp,
    UserPlus,
    Users,
    XCircle,
} from 'lucide-react';
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
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/admin/dashboard' }];

type Stats = {
    totalStores: number;
    pendingStores: number;
    approvedStores: number;
    totalUsers: number;
    newUsersThisWeek: number;
    totalOrders: number;
    ordersToday: number;
    totalCommissions: number;
    commissionsThisMonth: number;
    commissionsToday: number;
    pendingVerifications: number;
};

type CommissionPoint  = { week: string; commission: number };
type RegistrationPoint = { week: string; users: number };
type OrderPoint       = { date: string; orders: number };
type ActivityItem     = { type: string; message: string; time: string };

type AuthStats = { successToday: number; failedToday: number; suspiciousCount: number };

type Props = {
    stats: Stats;
    commissionsChart: CommissionPoint[];
    registrationsChart: RegistrationPoint[];
    ordersChart: OrderPoint[];
    recentActivity: ActivityItem[];
    authStats: AuthStats;
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ACTIVITY_CONFIG: Record<string, { icon: typeof Store; color: string; bg: string }> = {
    store_application: { icon: Store,    color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20'  },
    store_approved:    { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    user_registered:   { icon: UserPlus, color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20'   },
};

export default function Dashboard({
    stats,
    commissionsChart,
    registrationsChart,
    ordersChart,
    recentActivity,
    authStats,
}: Props) {
    const statCards = [
        {
            label: 'Total Users',
            value: stats.totalUsers.toLocaleString(),
            sub:   `+${stats.newUsersThisWeek} this week`,
            icon:  Users,
            color: 'text-blue-600',
            bg:    'bg-blue-50 dark:bg-blue-900/20',
            href:  '/admin/users',
        },
        {
            label: 'Total Stores',
            value: stats.totalStores.toLocaleString(),
            sub:   `${stats.approvedStores} approved`,
            icon:  Store,
            color: 'text-emerald-600',
            bg:    'bg-emerald-50 dark:bg-emerald-900/20',
            href:  '/admin/stores',
        },
        {
            label: 'Total Orders',
            value: stats.totalOrders.toLocaleString(),
            sub:   `${stats.ordersToday} today`,
            icon:  ShoppingCart,
            color: 'text-violet-600',
            bg:    'bg-violet-50 dark:bg-violet-900/20',
            href:  '/admin/orders',
        },
        {
            label: 'Commission Earned',
            value: fmt(stats.totalCommissions),
            sub:   `${fmt(stats.commissionsThisMonth)} this month`,
            icon:  PhilippinePeso,
            color: 'text-amber-600',
            bg:    'bg-amber-50 dark:bg-amber-900/20',
            href:  null as string | null,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Marketplace overview — {stats.approvedStores} active store{stats.approvedStores !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {stats.pendingStores > 0 && (
                            <Link href="/admin/stores?tab=pending">
                                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                    <Store className="h-4 w-4" />
                                    {stats.pendingStores} store{stats.pendingStores !== 1 ? 's' : ''} pending
                                </div>
                            </Link>
                        )}
                        {stats.pendingVerifications > 0 && (
                            <Link href="/admin/verifications">
                                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                                    <BadgeCheck className="h-4 w-4" />
                                    {stats.pendingVerifications} ID{stats.pendingVerifications !== 1 ? 's' : ''} to verify
                                </div>
                            </Link>
                        )}
                    </div>
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

                {/* Quick action cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Link href="/admin/stores?tab=pending">
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="pt-5 pb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                                    <Store className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending Stores</p>
                                    <p className="text-2xl font-bold text-amber-600">{stats.pendingStores}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link href="/admin/verifications">
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="pt-5 pb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                    <BadgeCheck className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending Verifications</p>
                                    <p className="text-2xl font-bold text-blue-600">{stats.pendingVerifications}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link href="/admin/stores?tab=approved">
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="pt-5 pb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Approved Stores</p>
                                    <p className="text-2xl font-bold text-emerald-600">{stats.approvedStores}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                </div>

                {/* Charts */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Commissions per week */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <PhilippinePeso className="h-4 w-4 text-amber-600" />
                                Commission Earned — Last 12 Weeks
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={commissionsChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v: number) => [fmt(v), 'Commission']}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Bar dataKey="commission" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* New registrations per week */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Users className="h-4 w-4 text-blue-600" />
                                New Registrations — Last 12 Weeks
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={registrationsChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v: number) => [v, 'Users']}
                                        contentStyle={{ fontSize: 12 }}
                                    />
                                    <Bar dataKey="users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Orders trend */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-violet-600" />
                            Platform Orders — Last 14 Days
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={ordersChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={1} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    formatter={(v: number) => [v, 'Orders']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Line dataKey="orders" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Auth Activity card */}
                <Card className={authStats.suspiciousCount > 0 ? 'border-orange-300' : authStats.failedToday > 10 ? 'border-red-300' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-blue-600" />
                                Recent Auth Activity
                            </span>
                            <Link href="/admin/auth-logs" className="text-xs text-blue-600 hover:underline font-normal">
                                View all
                            </Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    <span className="text-2xl font-black text-emerald-700">{authStats.successToday}</span>
                                </div>
                                <p className="text-xs text-emerald-600">Successful logins today</p>
                            </div>
                            <div className={`rounded-lg border p-3 text-center ${authStats.failedToday > 10 ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                    <XCircle className={`h-4 w-4 ${authStats.failedToday > 10 ? 'text-red-600' : 'text-gray-400'}`} />
                                    <span className={`text-2xl font-black ${authStats.failedToday > 10 ? 'text-red-700' : 'text-gray-700'}`}>{authStats.failedToday}</span>
                                </div>
                                <p className={`text-xs ${authStats.failedToday > 10 ? 'text-red-600' : 'text-gray-500'}`}>Failed attempts today</p>
                            </div>
                        </div>
                        {authStats.suspiciousCount > 0 && (
                            <div className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                                <p className="text-orange-800 text-xs">
                                    <span className="font-bold">{authStats.suspiciousCount} IP(s)</span> with 5+ failed attempts in the last hour.{' '}
                                    <Link href="/admin/auth-logs" className="underline">Review now</Link>
                                </p>
                            </div>
                        )}
                        {authStats.failedToday > 10 && authStats.suspiciousCount === 0 && (
                            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                                <p className="text-xs text-red-700 font-medium">High number of failed login attempts today.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent activity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="h-4 w-4 text-gray-500" />
                            Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recentActivity.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">No recent activity.</p>
                        ) : (
                            <div className="space-y-3">
                                {recentActivity.map((item, i) => {
                                    const cfg = ACTIVITY_CONFIG[item.type] ?? ACTIVITY_CONFIG.user_registered;
                                    const Icon = cfg.icon;
                                    return (
                                        <div key={i} className="flex items-start gap-3">
                                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                                                <Icon className={`h-4 w-4 ${cfg.color}`} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium leading-tight">{item.message}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
