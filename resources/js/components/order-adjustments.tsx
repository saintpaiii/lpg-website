import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** HandoverAdjustmentService::present() */
export type OrderAdjustment = {
    id: number;
    product: string;
    quantity: number;
    reason: string;
    note: string | null;
    choice: 'new_purchase' | 'cancel';
    choice_label: string;
    amount_change: number;
    photo_url: string;
    stage: string;
    by: string | null;
    at: string;
    refund_request_id?: number | null;
};

const peso = (n: number) => '₱' + Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Adjusted at handover" — tanks not accepted (customer, seller and admin order pages). */
export default function OrderAdjustments({ adjustments, compact = false }: { adjustments?: OrderAdjustment[] | null; compact?: boolean }) {
    if (!adjustments || adjustments.length === 0) return null;
    const list = (
        <ul className="space-y-2 text-sm">
            {adjustments.map((a) => (
                <li key={a.id} className="flex gap-3">
                    <a href={a.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <img src={a.photo_url} alt={`Tank not accepted — ${a.reason}`} className="h-12 w-12 rounded border object-cover" />
                    </a>
                    <span className="min-w-0">
                        <span className="font-medium">{a.quantity} × {a.product}</span> — {a.choice_label}{' '}
                        <span className={a.amount_change >= 0 ? 'text-amber-700' : 'text-green-700'}>({a.amount_change >= 0 ? '+' : '−'}{peso(a.amount_change)})</span>
                        <span className="block text-xs text-muted-foreground">
                            {a.reason}{a.note ? ` — ${a.note}` : ''} · {a.stage} · {a.at}{a.by ? ` · ${a.by}` : ''}
                            {a.refund_request_id ? ' · refund requested' : ''}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
    if (compact) return <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/30"><p className="mb-1 text-xs font-semibold text-amber-800">Adjusted at handover</p>{list}</div>;
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" /> Adjusted at handover</CardTitle>
                <p className="text-xs text-muted-foreground">A tank was not accepted when the order was handed over. The invoice was updated (same number).</p>
            </CardHeader>
            <CardContent>{list}</CardContent>
        </Card>
    );
}
