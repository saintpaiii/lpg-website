import { Head, router } from '@inertiajs/react';
import { CreditCard, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard',     href: '/admin/dashboard' },
    { title: 'Subscriptions', href: '/admin/subscriptions' },
];

type SubRow = {
    id: number;
    store_name: string;
    store_id: number;
    plan: string;
    amount: number;
    payment_method: string | null;
    status: string;
    starts_at: string | null;
    expires_at: string | null;
    created_at: string;
};

type Counts = { active: number; expired: number; cancelled: number };
type Paginated = { data: SubRow[]; current_page: number; last_page: number; total: number };

type Props = {
    subscriptions: Paginated;
    counts: Counts;
    tab: string;
    search: string;
};

const TABS = [
    { key: 'active',    label: 'Active',    count_key: 'active'    },
    { key: 'expired',   label: 'Expired',   count_key: 'expired'   },
    { key: 'cancelled', label: 'Cancelled', count_key: 'cancelled' },
] as const;

const STATUS_BADGE: Record<string, string> = {
    active:    'bg-green-100 text-green-800',
    expired:   'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
};

export default function Subscriptions({ subscriptions, counts, tab, search }: Props) {
    const [searchVal, setSearchVal] = useState(search);

    function goTab(t: string) {
        router.get('/admin/subscriptions', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/subscriptions', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    const totalRevenue = subscriptions.data.reduce((s, r) => s + r.amount, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Subscriptions" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <CreditCard className="h-6 w-6 text-blue-600" />
                            Store Subscriptions
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Manage premium plan subscriptions across all stores.
                        </p>
                    </div>
                    <form onSubmit={doSearch} className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search stores…"
                                className="pl-9 w-56"
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                            />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">Search</Button>
                    </form>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label, count_key }) => (
                        <button
                            key={key}
                            onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === key
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {label}
                            {counts[count_key] > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                                    tab === key ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                                }`}>
                                    {counts[count_key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Store</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Payment</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Period</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subscriptions.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-12 text-muted-foreground">
                                                No subscriptions found.
                                            </td>
                                        </tr>
                                    ) : subscriptions.data.map((s) => (
                                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{s.store_name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    s.plan === 'premium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {s.plan}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                ₱{s.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell capitalize">
                                                {s.payment_method ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                {s.starts_at ? fmtDate(s.starts_at) : '—'}
                                                {' → '}
                                                {s.expires_at ? fmtDate(s.expires_at) : 'Lifetime'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {subscriptions.data.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t bg-muted/20">
                                            <td colSpan={2} className="px-4 py-2.5 text-sm font-medium text-muted-foreground">
                                                Page total ({subscriptions.data.length} records)
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold">
                                                ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        {subscriptions.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{subscriptions.total} subscriptions</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: subscriptions.last_page }, (_, i) => i + 1).map((p) => (
                                        <button key={p}
                                            onClick={() => router.get('/admin/subscriptions', { tab, search: searchVal, page: p })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${p === subscriptions.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
