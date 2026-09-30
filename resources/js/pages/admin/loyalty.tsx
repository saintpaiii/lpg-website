import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Star, Store, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import TierBadge, { TIER_DOTS, TIER_LABELS, type Tier } from '@/components/tier-badge';
import { peso, timeAgo, trustColor } from '@/components/trust-score-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BreadcrumbItem } from '@/types';

type Props = {
    stats: { stores_enabled: number; total_customers: number; avg_trust: number; tiers: { [K in Tier]: number } };
    top_stores: { id: number; store_name: string; customers: number }[];
    records: {
        data: { id: number; store_name: string; customer_name: string; tier: Tier; trust_score: number; total_orders: number; total_spent: number; last_order_at: string | null }[];
        current_page: number; last_page: number; total: number; from: number | null; to: number | null;
    };
    stores: { id: number; store_name: string }[];
    filters: { store_id?: string; tier?: string; search?: string };
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Loyalty', href: '/admin/loyalty' }];
const TIERS: Tier[] = ['new', 'regular', 'loyal', 'vip'];

export default function AdminLoyalty({ stats, top_stores, records, stores, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const maxTier = Math.max(1, ...TIERS.map((t) => stats.tiers[t]));

    function visit(params: Record<string, string | number>) {
        router.get('/admin/loyalty', { ...filters, search, ...params }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Loyalty" />
            <div className="p-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Star className="h-6 w-6 text-amber-500" /> Customer Loyalty</h1>
                    <p className="text-sm text-muted-foreground">Per-store loyalty tiers and trust scores across the platform (read-only monitoring).</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Stores with Loyalty Enabled</CardTitle>
                            <Store className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.stores_enabled}</div></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Customers in Program</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{stats.total_customers}</div></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Average Trust Score</CardTitle>
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${stats.total_customers ? trustColor(stats.avg_trust).text : ''}`}>
                                {stats.total_customers ? stats.avg_trust.toFixed(1) : '—'}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tier Distribution</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5">
                            {TIERS.map((t) => (
                                <div key={t} className="flex items-center gap-2 text-xs">
                                    <span className="w-14">{TIER_LABELS[t]}</span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                        <div className={`h-full ${TIER_DOTS[t]}`} style={{ width: `${(stats.tiers[t] / maxTier) * 100}%` }} />
                                    </div>
                                    <span className="w-6 text-right tabular-nums">{stats.tiers[t]}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {top_stores.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle className="text-base">Top Stores by Enrollment</CardTitle></CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            {top_stores.map((s, i) => (
                                <button key={s.id} type="button" onClick={() => visit({ store_id: s.id, page: 1 })}
                                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                                    <span className="text-muted-foreground">#{i + 1}</span> {s.store_name} · <strong>{s.customers}</strong>
                                </button>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                            <form onSubmit={(e: FormEvent) => { e.preventDefault(); visit({ page: 1 }); }} className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…"
                                    className="h-9 w-56 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </form>
                            <select value={filters.store_id ?? ''} onChange={(e) => visit({ store_id: e.target.value, page: 1 })}
                                className="h-9 rounded-md border bg-background px-3 text-sm">
                                <option value="">All stores</option>
                                {stores.map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                            </select>
                            <select value={filters.tier ?? ''} onChange={(e) => visit({ tier: e.target.value, page: 1 })}
                                className="h-9 rounded-md border bg-background px-3 text-sm">
                                <option value="">All tiers</option>
                                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                            </select>
                            {(filters.store_id || filters.tier || filters.search) && (
                                <Button size="sm" variant="ghost" onClick={() => { setSearch(''); router.get('/admin/loyalty'); }}>Clear</Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {records.data.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">No loyalty records yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-3 pr-4 font-medium">Store</th>
                                            <th className="pb-3 pr-4 font-medium">Customer</th>
                                            <th className="pb-3 pr-4 font-medium">Tier</th>
                                            <th className="pb-3 pr-4 text-right font-medium">Trust Score</th>
                                            <th className="pb-3 pr-4 text-right font-medium">Orders</th>
                                            <th className="pb-3 pr-4 text-right font-medium">Total Spent</th>
                                            <th className="pb-3 font-medium">Last Order</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {records.data.map((r) => (
                                            <tr key={r.id}>
                                                <td className="py-2.5 pr-4">{r.store_name}</td>
                                                <td className="py-2.5 pr-4 font-medium">{r.customer_name}</td>
                                                <td className="py-2.5 pr-4"><TierBadge tier={r.tier} size="sm" /></td>
                                                <td className={`py-2.5 pr-4 text-right font-semibold tabular-nums ${trustColor(r.trust_score).text}`}>{r.trust_score.toFixed(1)}</td>
                                                <td className="py-2.5 pr-4 text-right tabular-nums">{r.total_orders}</td>
                                                <td className="py-2.5 pr-4 text-right tabular-nums">{peso(r.total_spent)}</td>
                                                <td className="py-2.5 text-muted-foreground">{timeAgo(r.last_order_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {records.last_page > 1 && (
                            <div className="mt-4 flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">{records.from}–{records.to} of {records.total}</p>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" disabled={records.current_page === 1} onClick={() => visit({ page: records.current_page - 1 })}><ChevronLeft className="h-4 w-4" /></Button>
                                    <span className="px-2 py-1 text-sm">{records.current_page} / {records.last_page}</span>
                                    <Button variant="outline" size="sm" disabled={records.current_page === records.last_page} onClick={() => visit({ page: records.current_page + 1 })}><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
