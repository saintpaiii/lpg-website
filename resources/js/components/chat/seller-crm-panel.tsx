import { Link } from '@inertiajs/react';
import { orderStatusLabel } from '@/lib/order-status';
import axios from 'axios';
import { Loader2, Mail, Phone, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import TierBadge, { type Tier } from '@/components/tier-badge';
import TrustScoreBar from '@/components/trust-score-bar';
import { peso } from './format';
import type { ConversationHeader } from './types';

type CustomerCrm = {
    kind: 'customer';
    customer: {
        name: string; phone: string | null; email: string | null; member_since: string | null;
        loyalty_enabled: boolean;
        loyalty: { tier: Tier; trust_score: number; total_orders: number; total_spent: number } | null;
        total_orders: number; total_spent: number; open_balance: number;
        recent_orders: { id: number; order_number: string; status: string; fulfillment?: string; total: number; payment_mode: string; remaining_balance: number; ordered_at: string | null; url: string }[];
    };
};
type RiderCrm = { kind: 'rider'; rider: { name: string; phone: string | null; active_deliveries: number; delivered_today: number } };

const STATUS_STYLE: Record<string, string> = {
    pending: 'bg-muted text-foreground/80', confirmed: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', preparing: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    out_for_delivery: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300', delivered: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

/** Who this customer (or rider) is to the store — shown beside the chat. */
export default function SellerCrmPanel({ header }: { header: ConversationHeader }) {
    const [data, setData] = useState<CustomerCrm | RiderCrm | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setData(null); setError(false);
        axios.get(`/seller/messages/${header.id}/crm`)
            .then((r) => !cancelled && setData(r.data))
            .catch(() => !cancelled && setError(true));
        return () => { cancelled = true; };
    }, [header.id]);

    if (error) return <p className="p-4 text-sm text-muted-foreground">Could not load details.</p>;
    if (!data) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

    if (data.kind === 'rider') {
        const r = data.rider;
        return (
            <div className="space-y-4 p-4 text-sm">
                <div>
                    <p className="text-base font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">Rider</p>
                </div>
                {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-blue-600"><Phone className="h-4 w-4" /> {r.phone}</a>}
                <div className="grid grid-cols-2 gap-2">
                    <Stat label="Active deliveries" value={String(r.active_deliveries)} icon={<Truck className="h-4 w-4 text-amber-600" />} />
                    <Stat label="Delivered today" value={String(r.delivered_today)} />
                </div>
            </div>
        );
    }

    const c = data.customer;
    return (
        <div className="space-y-4 p-4 text-sm">
            <div>
                <p className="text-base font-semibold">{c.name}</p>
                {c.member_since && <p className="text-xs text-muted-foreground">Customer since {c.member_since}</p>}
            </div>
            <div className="space-y-1">
                {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-blue-600"><Phone className="h-4 w-4" /> {c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all text-muted-foreground"><Mail className="h-4 w-4 shrink-0" /> {c.email}</a>}
            </div>

            {c.loyalty_enabled && c.loyalty ? (
                <div className="space-y-2 rounded-lg border p-3">
                    <TierBadge tier={c.loyalty.tier} size="md" />
                    <div>
                        <p className="mb-1 text-xs text-muted-foreground">Trust score</p>
                        <TrustScoreBar score={c.loyalty.trust_score} />
                    </div>
                </div>
            ) : !c.loyalty_enabled ? (
                <p className="text-xs text-muted-foreground">Loyalty program is off</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
                <Stat label="Total orders" value={String(c.loyalty_enabled && c.loyalty ? c.loyalty.total_orders : c.total_orders)} />
                <Stat label="Total spent" value={peso(c.loyalty_enabled && c.loyalty ? c.loyalty.total_spent : c.total_spent)} />
            </div>

            {c.open_balance > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-800 dark:text-amber-300">
                    <p className="text-xs">Open balance (consignment)</p>
                    <p className="text-base font-semibold">{peso(c.open_balance)}</p>
                </div>
            )}

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent orders</p>
                {c.recent_orders.length === 0 ? <p className="text-xs text-muted-foreground">No orders yet.</p> : (
                    <ul className="space-y-1.5">
                        {c.recent_orders.map((o) => (
                            <li key={o.id}>
                                <Link href={o.url} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <span className="min-w-0">
                                        <span className="block font-mono text-xs">{o.order_number}</span>
                                        <span className={`mt-0.5 inline-block rounded px-1.5 py-px text-xs font-medium ${STATUS_STYLE[o.status] ?? 'bg-muted text-foreground/80'}`}>{orderStatusLabel(o.status, o.fulfillment)}</span>
                                    </span>
                                    <span className="shrink-0 text-right text-xs font-semibold">
                                        {peso(o.total)}
                                        {o.remaining_balance > 0 && <span className="block text-xs font-normal text-amber-700 dark:text-amber-300">bal. {peso(o.remaining_balance)}</span>}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div className="rounded-lg border p-2.5">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
            <p className="font-semibold">{value}</p>
        </div>
    );
}
