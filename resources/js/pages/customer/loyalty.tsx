import { Head, Link } from '@inertiajs/react';
import { AlertTriangle, Award, Store } from 'lucide-react';
import TierBadge, { TIER_LABELS, type Tier } from '@/components/tier-badge';
import TrustScoreBar, { peso } from '@/components/trust-score-bar';
import { Card, CardContent } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type LoyaltyRecord = {
    id: number;
    store_id: number;
    store_name: string;
    store_logo: string | null;
    tier: Tier;
    trust_score: number;
    total_orders: number;
    total_spent: number;
    on_time_payments: number;
    late_payments: number;
    downpayment_percent: number;
    consignment_allowed: boolean;
    min_trust_score: number;
    next_tier: { tier: Tier; threshold: number; orders_needed: number; blocked_by_trust: boolean } | null;
    tier_rates: { [K in Tier]: number };
};

export default function MyLoyalty({ records }: { records: LoyaltyRecord[] }) {
    return (
        <CustomerLayout>
            <Head title="My Loyalty — LPG Portal" />
            <div className="space-y-5">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" /> My Loyalty</h1>
                    <p className="text-sm text-muted-foreground">
                        Your standing at each store with a loyalty program. Higher tiers mean a lower down payment on consignment orders.
                    </p>
                </div>

                {records.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center">
                        <Award className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                            You haven't earned loyalty status at any store yet. Complete orders to start building your loyalty!
                        </p>
                        <Link href="/customer/products" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">Browse products</Link>
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {records.map((r) => {
                            const progress = r.next_tier ? Math.min(100, (r.total_orders / r.next_tier.threshold) * 100) : 100;
                            return (
                                <Card key={r.id}>
                                    <CardContent className="space-y-4 pt-6">
                                        <Link href={`/customer/store/${r.store_id}`} className="flex items-center gap-3 hover:opacity-80">
                                            {r.store_logo
                                                ? <img src={r.store_logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                                                : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20"><Store className="h-5 w-5 text-blue-500" /></div>}
                                            <span className="font-semibold">{r.store_name}</span>
                                        </Link>

                                        <div className="flex flex-wrap items-center gap-5">
                                            <div className="text-center">
                                                <TierBadge tier={r.tier} size="lg" />
                                                <p className="mt-1 text-xs text-muted-foreground">tier</p>
                                            </div>
                                            <div className="min-w-48 flex-1 space-y-2">
                                                <div>
                                                    <p className="mb-1 text-xs font-medium text-muted-foreground">Trust Score</p>
                                                    <TrustScoreBar score={r.trust_score} />
                                                </div>
                                                <p className="text-sm">Down payment rate: <strong>{r.downpayment_percent}%</strong></p>
                                            </div>
                                        </div>

                                        {!r.consignment_allowed && (
                                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                                Consignment not available at this store. Improve your trust score (needs {r.min_trust_score}) by completing orders and paying on time.
                                            </div>
                                        )}

                                        <div>
                                            {r.next_tier ? (
                                                <>
                                                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                                                        <span>Progress to {TIER_LABELS[r.next_tier.tier]}</span>
                                                        <span className="tabular-nums">{r.total_orders}/{r.next_tier.threshold} orders</span>
                                                    </div>
                                                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <p className="mt-1.5 text-sm">
                                                        {r.next_tier.blocked_by_trust
                                                            ? `You have enough orders for ${TIER_LABELS[r.next_tier.tier]} — raise your trust score to 50 to be promoted.`
                                                            : `${r.next_tier.orders_needed} more order${r.next_tier.orders_needed === 1 ? '' : 's'} to reach ${TIER_LABELS[r.next_tier.tier]} tier (${r.tier_rates[r.next_tier.tier]}% down payment)`}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-sm font-semibold text-amber-700">👑 Highest tier reached!</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-3 divide-x rounded-lg border text-center text-sm">
                                            <div className="py-2"><p className="font-semibold">{r.total_orders}</p><p className="text-xs text-muted-foreground">Orders</p></div>
                                            <div className="py-2"><p className="font-semibold">{peso(r.total_spent)}</p><p className="text-xs text-muted-foreground">Spent</p></div>
                                            <div className="py-2"><p className="font-semibold">{r.on_time_payments}</p><p className="text-xs text-muted-foreground">On-time payments</p></div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </CustomerLayout>
    );
}
