import { cn } from '@/lib/utils';

/** Half payment (J5): 50% online now, the rest online before delivery or in cash to the rider. */
export type HalfPaymentOrder = {
    payment_mode?: string | null;
    payment_status?: string | null;
    down_payment_amount?: number | string | null;
    remaining_balance?: number | string | null;
    grand_total?: number | string | null;
};

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Same as Order::halfSplit(): 50% rounded UP to the centavo now, the rest later (₱1,615 → ₱807.50 + ₱807.50). */
export function halfSplit(grandTotal: number): [number, number] {
    const cents = Math.round(grandTotal * 100);
    const now = Math.ceil(cents / 2);
    return [now / 100, (cents - now) / 100];
}

/** "Half payment — ₱807.50 paid online, ₱807.50 remaining" (null when the order is not a half payment). */
export function halfPaymentText(o: HalfPaymentOrder): string | null {
    if (o.payment_mode !== 'half') return null;
    const first = Number(o.down_payment_amount ?? 0);
    const rest = Number(o.remaining_balance ?? 0);
    switch (o.payment_status) {
        case 'unpaid':
            return `Half payment — ${peso(first)} to pay online first, then ${peso(rest)}`;
        case 'partial':
            return `Half payment — ${peso(first)} paid online, ${peso(rest)} remaining`;
        case 'paid':
            return 'Half payment — paid in full';
        case 'to_refund':
            return 'Half payment — order cancelled, refund pending';
        case 'refunded':
            return 'Half payment — order cancelled, refunded';
        default:
            return 'Half payment';
    }
}

export default function HalfPaymentNote({ order, className }: { order: HalfPaymentOrder; className?: string }) {
    const text = halfPaymentText(order);
    if (!text) return null;
    const tone = order.payment_status === 'paid' ? 'text-emerald-700 dark:text-emerald-400'
        : order.payment_status === 'partial' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground';
    return <span className={cn(tone, className)} data-testid="half-payment-note">{text}</span>;
}
