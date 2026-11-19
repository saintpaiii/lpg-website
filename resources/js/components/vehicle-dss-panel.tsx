import { router } from '@inertiajs/react';
import { Clock, MessageSquare, Scissors, Sparkles, Store } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** VehicleDssService::forOrders() — one order (J6) */
export type OrderDss = {
    recommended_rider_id: number | null;
    /** "Juan — Tricycle ABC-123: fits 75/150 kg, 1 stop, 2.1 km away" */
    recommended_text: string | null;
    /** No free rider can take it but a store vehicle could */
    wait_hint: string | null;
    /** No store vehicle can carry it in one trip */
    split: { trips: { vehicle: string; items: Record<string, number>; kg: number; text: string }[]; text: string } | null;
    split_message: string | null;
    /** rider id → why they can't take it (null = can) */
    reasons: Record<string, string | null>;
};

/**
 * Vehicle DSS box in the "Assign rider" dialogs and on the order page: the recommended rider (★ + one-line reason),
 * "wait for X" when nobody free fits, and the split-into-trips suggestion with "Message the customer" (prefilled).
 */
export default function VehicleDssPanel({ dss, orderId, onUseRecommended }: { dss: OrderDss | null | undefined; orderId: number; onUseRecommended?: (id: number) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    if (!dss) return null;

    const send = (body: string) => {
        setSending(true);
        router.post(`/seller/orders/${orderId}/dss-message`, { body }, { preserveScroll: true, onFinish: () => { setSending(false); setDraft(null); } });
    };
    const pickupText = 'Hi! Your order is more than our vehicles can carry in one trip. Would you like to pick it up at the store instead? We will prepare it for you.';

    return (
        <div className="space-y-2 text-xs" data-testid="vehicle-dss">
            {dss.recommended_text && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="dss-recommended">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1 break-words">
                        <span className="mr-1 rounded bg-emerald-600 px-1.5 py-px text-xs font-bold text-white">Recommended</span>
                        {dss.recommended_text}
                    </div>
                    {onUseRecommended && dss.recommended_rider_id && (
                        <button type="button" className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-300 underline" onClick={() => onUseRecommended(dss.recommended_rider_id!)}>Use</button>
                    )}
                </div>
            )}
            {dss.wait_hint && (
                <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="dss-wait">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {dss.wait_hint}
                </p>
            )}
            {dss.split && (
                <div className="space-y-1.5 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200" data-testid="dss-split">
                    <p className="flex items-center gap-1.5 font-semibold"><Scissors className="h-3.5 w-3.5" /> No vehicle can carry this in one trip — split into {dss.split.trips.length} trips</p>
                    <ul className="ml-5 list-disc">
                        {dss.split.trips.map((t, i) => <li key={i}>Trip {i + 1}: {t.text}</li>)}
                    </ul>
                    <p>Or ask the customer to pick it up at the store. (A suggestion only — the order is not split automatically.)</p>
                    {draft === null ? (
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setDraft(dss.split_message ?? '')}>
                                <MessageSquare className="h-3 w-3" /> Message the customer
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setDraft(pickupText)}>
                                <Store className="h-3 w-3" /> Ask customer to pick up
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} aria-label="Message to the customer"
                                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground" />
                            <div className="flex gap-2">
                                <Button type="button" size="sm" className="h-7 bg-blue-600 text-xs text-white hover:bg-blue-700" disabled={sending || !draft.trim()} onClick={() => send(draft)}>
                                    {sending ? 'Sending…' : 'Send to chat'}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft(null)}>Cancel</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
