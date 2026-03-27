import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    CheckCircle2,
    KeyRound,
    LogIn,
    LogOut,
    Search,
    ShieldAlert,
    ShieldX,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { fmtDateTime } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/admin/dashboard' },
    { title: 'Auth Logs', href: '/admin/auth-logs' },
];

// ── Types ───────────────────────────────────────────────────────────────────────

type LogEntry = {
    id: number;
    user_id: number | null;
    user_name: string | null;
    email: string;
    action: string;
    ip_address: string;
    user_agent: string;
    status: 'success' | 'failed';
    failure_reason: string | null;
    created_at: string;
    created_ts: number;
};

type Paginated = {
    data: LogEntry[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
};

type SuspiciousIp = { ip_address: string; attempts: number };

type Filters = {
    status: string;
    action: string;
    search: string;
    date_from: string;
    date_to: string;
};

type Props = {
    logs: Paginated;
    successToday: number;
    failedToday: number;
    suspiciousIps: SuspiciousIp[];
    filters: Filters;
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    login_success:   { label: 'Login',            icon: LogIn,        color: 'text-emerald-600' },
    login_failed:    { label: 'Login Failed',      icon: ShieldX,      color: 'text-red-600'     },
    logout:          { label: 'Logout',            icon: LogOut,       color: 'text-blue-500'    },
    password_changed:{ label: 'Password Changed',  icon: KeyRound,     color: 'text-purple-600'  },
    account_locked:  { label: 'Account Locked',    icon: ShieldAlert,  color: 'text-orange-600'  },
};

const REASON_LABELS: Record<string, string> = {
    invalid_password:    'Invalid credentials',
    email_not_found:     'Invalid credentials',
    account_deactivated: 'Account deactivated',
    account_archived:    'Account archived',
    too_many_attempts:   'Too many attempts',
};

function parseBrowser(ua: string): string {
    if (!ua) return '—';
    if (/EdgA?\//.test(ua))  return 'Edge';
    if (/OPR\//.test(ua))    return 'Opera';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua))return 'Firefox';
    if (/Safari\//.test(ua)) return 'Safari';
    if (/MSIE|Trident/.test(ua)) return 'IE';
    if (/curl/.test(ua))     return 'cURL';
    if (/python/.test(ua))   return 'Python';
    return 'Other';
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function AuthLogs({ logs, successToday, failedToday, suspiciousIps, filters }: Props) {
    const [search,   setSearch]   = useState(filters.search);
    const [dateFrom, setDateFrom] = useState(filters.date_from);
    const [dateTo,   setDateTo]   = useState(filters.date_to);

    function apply(overrides: Partial<Filters> = {}) {
        router.get('/admin/auth-logs', {
            search:    search,
            date_from: dateFrom,
            date_to:   dateTo,
            status:    filters.status,
            action:    filters.action,
            ...overrides,
        }, { preserveState: true, replace: true });
    }

    function setStatus(v: string)  { apply({ status: v, action: filters.action }); }
    function setAction(v: string)  { apply({ action: v, status: filters.status }); }
    function clearFilters() {
        setSearch(''); setDateFrom(''); setDateTo('');
        router.get('/admin/auth-logs', {}, { preserveState: false, replace: true });
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        apply();
    }

    const hasFilters = !!(filters.search || filters.status || filters.action || filters.date_from || filters.date_to);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Auth Logs" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <ShieldAlert className="h-6 w-6 text-blue-600" />
                            Authentication Logs
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            All login, logout, and security events across the platform.
                        </p>
                    </div>

                    {/* Today's summary */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span className="font-semibold text-emerald-700">{successToday}</span>
                            <span className="text-emerald-600">logins today</span>
                        </div>
                        <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${failedToday > 10 ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                            <XCircle className={`h-4 w-4 ${failedToday > 10 ? 'text-red-600' : 'text-gray-400'}`} />
                            <span className={`font-semibold ${failedToday > 10 ? 'text-red-700' : 'text-gray-700'}`}>{failedToday}</span>
                            <span className={failedToday > 10 ? 'text-red-600' : 'text-gray-500'}>failed today</span>
                        </div>
                    </div>
                </div>

                {/* High failed attempts warning */}
                {failedToday > 10 && (
                    <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">
                            High number of failed login attempts today ({failedToday}). Review the logs below for suspicious activity.
                        </p>
                    </div>
                )}

                {/* Suspicious IPs */}
                {suspiciousIps.length > 0 && (
                    <div className="space-y-2">
                        {suspiciousIps.map((ip) => (
                            <div key={ip.ip_address}
                                className="flex items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3">
                                <ShieldAlert className="h-5 w-5 text-orange-600 shrink-0" />
                                <p className="text-sm text-orange-800">
                                    <span className="font-bold">⚠ {ip.attempts} failed attempts</span> from IP{' '}
                                    <code className="font-mono bg-orange-100 px-1.5 py-0.5 rounded text-orange-900">{ip.ip_address}</code>{' '}
                                    in the last hour.
                                </p>
                                <button
                                    onClick={() => setSearch(ip.ip_address)}
                                    className="ml-auto text-xs text-orange-700 underline hover:no-underline shrink-0">
                                    Filter by IP
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-3">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Email, name or IP…" className="pl-9 w-56" value={search}
                                onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">Search</Button>
                    </form>

                    {/* Status filter */}
                    <select
                        value={filters.status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                    </select>

                    {/* Action filter */}
                    <select
                        value={filters.action}
                        onChange={(e) => setAction(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Actions</option>
                        <option value="login_success">Login Success</option>
                        <option value="login_failed">Login Failed</option>
                        <option value="logout">Logout</option>
                        <option value="password_changed">Password Changed</option>
                        <option value="account_locked">Account Locked</option>
                    </select>

                    {/* Date range */}
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <Button variant="secondary" size="sm" onClick={() => apply()}>Apply Dates</Button>

                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                            Clear filters
                        </Button>
                    )}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date / Time</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User / Email</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">IP Address</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Browser</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-12 text-muted-foreground">
                                                No auth logs found.
                                            </td>
                                        </tr>
                                    ) : logs.data.map((log) => {
                                        const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, icon: ShieldAlert, color: 'text-gray-500' };
                                        const ActionIcon = cfg.icon;
                                        const isSuccess = log.status === 'success';
                                        const isSuspicious = suspiciousIps.some((s) => s.ip_address === log.ip_address);

                                        return (
                                            <tr key={log.id}
                                                className={`border-b last:border-0 transition-colors ${
                                                    isSuspicious ? 'bg-orange-50/60 hover:bg-orange-50' : 'hover:bg-muted/20'
                                                }`}
                                            >
                                                {/* Date */}
                                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                                    {log.created_at}
                                                </td>

                                                {/* User / Email */}
                                                <td className="px-4 py-3">
                                                    {log.user_name && (
                                                        <p className="font-medium text-sm">{log.user_name}</p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground font-mono">{log.email}</p>
                                                </td>

                                                {/* Action */}
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                                                        <ActionIcon className="h-3.5 w-3.5" />
                                                        {cfg.label}
                                                    </span>
                                                </td>

                                                {/* Status badge */}
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                        isSuccess
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : log.action === 'account_locked'
                                                                ? 'bg-orange-100 text-orange-700'
                                                                : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {isSuccess ? 'Success' : log.action === 'account_locked' ? 'Locked' : 'Failed'}
                                                    </span>
                                                </td>

                                                {/* IP */}
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <span className={`font-mono text-xs ${isSuspicious ? 'text-orange-700 font-semibold' : 'text-muted-foreground'}`}>
                                                        {log.ip_address}
                                                        {isSuspicious && ' ⚠'}
                                                    </span>
                                                </td>

                                                {/* Browser */}
                                                <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                                                    {parseBrowser(log.user_agent)}
                                                </td>

                                                {/* Details */}
                                                <td className="px-4 py-3">
                                                    {log.failure_reason ? (
                                                        <span className="text-xs text-red-600">
                                                            {REASON_LABELS[log.failure_reason] ?? log.failure_reason}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {logs.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{logs.total.toLocaleString()} entries</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: logs.last_page }, (_, i) => i + 1)
                                        .filter((pg) => pg === 1 || pg === logs.last_page || Math.abs(pg - logs.current_page) <= 2)
                                        .map((pg, idx, arr) => {
                                            const showEllipsis = idx > 0 && pg - arr[idx - 1] > 1;
                                            return (
                                                <span key={pg} className="flex items-center gap-1">
                                                    {showEllipsis && <span className="px-1 text-muted-foreground">…</span>}
                                                    <button
                                                        onClick={() => router.get('/admin/auth-logs', {
                                                            ...filters, search, date_from: dateFrom, date_to: dateTo, page: pg,
                                                        })}
                                                        className={`w-8 h-8 rounded text-xs font-medium ${
                                                            pg === logs.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'
                                                        }`}
                                                    >
                                                        {pg}
                                                    </button>
                                                </span>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
