import AppLayout from '@/layouts/app-layout';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Award, ChevronLeft, ChevronRight, Crown, FileDown, Search, ShieldCheck, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import TierBadge, { type Tier } from '@/components/tier-badge';
import { peso, timeAgo, trustColor } from '@/components/trust-score-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BreadcrumbItem } from '@/types';

type Row = {
    id: number;
    customer_name: string;
    customer_email: string;
    tier: Tier;
    trust_score: number;
    total_orders: number;
    total_spent: number;
    cancelled_orders: number;
    on_time_payments: number;
    late_payments: number;
    last_order_at: string | null;
    consignment_eligible: boolean;
};

type Props = {
    enabled: boolean;
    settings: { min_trust_score_for_consignment: number };
    stats: { total: number; vip: number; avg_trust: number; eligible: number };
    customers: { data: Row[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null };
    filters: { search: string; tier: string; sort_by: string; sort_dir: 'asc' | 'desc' };
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Loyalty Customers', href: '/seller/loyalty/customers' }];

export default function LoyaltyCustomers({ enabled, settings, stats, customers, filters }: Props) {
    const [search, setSearch] = useState(filters.search);

    function visit(params: Record<string, string | number>) {
        router.get('/seller/loyalty/customers', { ...filters, search, ...params }, { preserveState: true, preserveScroll: true, replace: true });
    }

    function sortBy(col: string) {
        const dir = filters.sort_by === col && filters.sort_dir === 'desc' ? 'asc' : 'desc';
        visit({ sort_by: col, sort_dir: dir, page: 1 });
    }

    const exportQs = new URLSearchParams({ search, tier: filters.tier, sort_by: filters.sort_by, sort_dir: filters.sort_dir }).toString();

    if (!enabled) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Loyalty Customers" />
                <div className="p-6">
                    <Card className="max-w-xl">
                        <CardContent className="space-y-3 py-10 text-center">
                            <Award className="mx-auto h-10 w-10 text-amber-400" />
                            <p className="font-medium">Enable the Loyalty Program in settings to see customer data</p>
                            <Link href="/seller/loyalty/settings"><Button>Go to Loyalty Settings</Button></Link>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    const SortHead = ({ col, label, right }: { col: string; label: string; right?: boolean }) => (
        <th className={`px-4 py-2.5 font-medium ${right ? 'text-right' : 'text-left'}`}>
            <button type="button" onClick={() => sortBy(col)} className="inline-flex items-center gap-1 hover:text-foreground">
                {label}
                {filters.sort_by === col && (filters.sort_dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
            </button>
        </th>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Loyalty Customers" />
            <div className="p-6 space-y-5">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-blue-600" /> Loyalty Customers</h1>
                    <p className="text-sm text-muted-foreground">Tiers and trust scores are calculated automatically from orders, cancellations and payments.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Stat title="Total Customers" value={String(stats.total)} icon={Users} />
                    <Stat title="VIP Customers" value={String(stats.vip)} icon={Crown} />
                    <Stat title="Average Trust Score" value={stats.total ? stats.avg_trust.toFixed(1) : '—'} icon={ShieldCheck} className={stats.total ? trustColor(stats.avg_trust).text : ''} />
                    <Stat title="Consignment Eligible" value={`${stats.eligible} / ${stats.total}`} icon={Award} note={`Trust score ≥ ${settings.min_trust_score_for_consignment}`} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={(e: FormEvent) => { e.preventDefault(); visit({ page: 1 }); }} className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…"
                            className="h-9 w-60 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </form>
                    <select value={filters.tier} onChange={(e) => visit({ tier: e.target.value, page: 1 })}
                        className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">All tiers</option>
                        <option value="new">New</option>
                        <option value="regular">Regular</option>
                        <option value="loyal">Loyal</option>
                        <option value="vip">VIP</option>
                    </select>
                    <a href={`/seller/loyalty/customers/export?${exportQs}`}
                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                        <FileDown className="h-4 w-4" /> CSV
                    </a>
                </div>

                <Card>
                    <CardContent className="p-0">
                        {customers.data.length === 0 ? (
                            <p className="py-12 text-center text-sm text-muted-foreground">
                                No customers yet. Customers appear here after their first completed order at your store.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b bg-muted/30 text-muted-foreground">
                                        <tr>
                                            <SortHead col="customer_name" label="Customer" />
                                            <th className="px-4 py-2.5 text-left font-medium">Email</th>
                                            <SortHead col="tier" label="Tier" />
                                            <SortHead col="trust_score" label="Trust Score" right />
                                            <SortHead col="total_orders" label="Orders" right />
                                            <SortHead col="total_spent" label="Total Spent" right />
                                            <SortHead col="last_order_at" label="Last Order" />
                                            <th className="px-4 py-2.5 text-left font-medium">Consignment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {customers.data.map((c) => (
                                            <tr key={c.id} className="hover:bg-muted/20">
                                                <td className="px-4 py-3 font-medium">{c.customer_name}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{c.customer_email}</td>
                                                <td className="px-4 py-3"><TierBadge tier={c.tier} size="sm" /></td>
                                                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${trustColor(c.trust_score).text}`}
                                                    title={`${c.cancelled_orders} cancelled · ${c.on_time_payments} on-time · ${c.late_payments} late`}>
                                                    {c.trust_score.toFixed(1)}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">{c.total_orders}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{peso(c.total_spent)}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{timeAgo(c.last_order_at)}</td>
                                                <td className="px-4 py-3">
                                                    {c.consignment_eligible
                                                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Eligible</span>
                                                        : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Not Eligible</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {customers.last_page > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{customers.from}–{customers.to} of {customers.total}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={customers.current_page === 1} onClick={() => visit({ page: customers.current_page - 1 })}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="px-2 py-1 text-sm">{customers.current_page} / {customers.last_page}</span>
                            <Button variant="outline" size="sm" disabled={customers.current_page === customers.last_page} onClick={() => visit({ page: customers.current_page + 1 })}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function Stat({ title, value, icon: Icon, note, className = '' }: { title: string; value: string; icon: React.ElementType; note?: string; className?: string }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${className}`}>{value}</div>
                {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}
