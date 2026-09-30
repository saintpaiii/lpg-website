// Order price breakdown — produced by Order::priceBreakdown() on the server.
// Rows always add up to grand_total: what the customer pays / the rider collects.

export type PriceBreakdown = {
    subtotal: number;
    delivery_fee: number;
    store_discount: number;
    coupon_code: string | null;
    coupon_discount: number;
    coupon_on_delivery: number;
    grand_total: number;
};

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** <tfoot> rows for an order-items table. `labelSpan` = number of columns before the amount column. */
export function PriceBreakdownRows({ breakdown: b, labelSpan, totalLabel = 'Order Total', cellClass = 'px-4 py-2' }: {
    breakdown: PriceBreakdown;
    labelSpan: number;
    totalLabel?: string;
    cellClass?: string;
}) {
    const rows: { label: string; value: string; className?: string }[] = [
        { label: 'Subtotal', value: peso(b.subtotal) },
        { label: 'Delivery Fee', value: b.delivery_fee > 0 ? `+${peso(b.delivery_fee)}` : 'Free' },
    ];
    if (b.store_discount > 0) {
        rows.push({ label: 'Store Discount', value: `−${peso(b.store_discount)}`, className: 'text-emerald-600' });
    }
    if (b.coupon_discount > 0) {
        rows.push({
            label: `Coupon${b.coupon_code ? ` (${b.coupon_code})` : ''}${b.coupon_on_delivery > 0 && b.coupon_on_delivery === b.coupon_discount ? ' on delivery' : ''}`,
            value: `−${peso(b.coupon_discount)}`,
            className: 'text-emerald-600',
        });
    }

    return (
        <>
            {rows.map((r, i) => (
                <tr key={r.label} className={i === 0 ? 'border-t' : ''}>
                    <td colSpan={labelSpan} className={`${cellClass} text-right text-sm text-muted-foreground`}>{r.label}</td>
                    <td className={`${cellClass} text-right tabular-nums ${r.className ?? ''}`}>{r.value}</td>
                </tr>
            ))}
            <tr className="border-t-2">
                <td colSpan={labelSpan} className={`${cellClass} text-right font-bold`}>{totalLabel}</td>
                <td className={`${cellClass} text-right text-lg font-bold tabular-nums`}>{peso(b.grand_total)}</td>
            </tr>
        </>
    );
}
