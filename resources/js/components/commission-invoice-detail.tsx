import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    fmtPeso,
    INVOICE_STATUS_LABELS,
    INVOICE_STATUS_STYLES,
    PAYMENT_METHOD_LABELS,
    type CommissionInvoice,
    type InvoiceLine,
} from '@/lib/commission';

const MODE_LABELS: Record<string, string> = { full: 'Full', consignment: 'Consignment', cod: 'COD' };

export function InvoiceStatusBadge({ invoice }: { invoice: CommissionInvoice }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${INVOICE_STATUS_STYLES[invoice.status]}`}>
            {INVOICE_STATUS_LABELS[invoice.status]}
            {invoice.status === 'overdue' && invoice.days_overdue > 0 && ` · ${invoice.days_overdue}d`}
        </span>
    );
}

/** Summary + per-order breakdown of a commission invoice. */
export function CommissionInvoiceDetail({ invoice, lines, orderHref }: {
    invoice: CommissionInvoice;
    lines: InvoiceLine[];
    orderHref?: (line: InvoiceLine) => string;
}) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Billing Period" value={invoice.period_label} />
                <Stat label="Orders" value={String(invoice.total_orders)} />
                <Stat label="Total Sales" value={fmtPeso(invoice.total_sales)} />
                <Stat label={`Commission (${invoice.commission_rate}%)`} value={fmtPeso(invoice.commission_amount)} strong />
            </div>

            <Card>
                <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
                    <Row label="Status"><InvoiceStatusBadge invoice={invoice} /></Row>
                    <Row label="Due Date">
                        <span className={invoice.status === 'overdue' ? 'font-semibold text-red-600' : ''}>{invoice.due_date}</span>
                    </Row>
                    <Row label="Issued">{invoice.created_at}</Row>
                    {invoice.paid_at && <Row label="Paid">{invoice.paid_at}</Row>}
                    {invoice.payment_method && <Row label="Method">{PAYMENT_METHOD_LABELS[invoice.payment_method] ?? invoice.payment_method}</Row>}
                    {invoice.payment_reference && (
                        <Row label="Reference"><span className="font-mono text-xs break-all">{invoice.payment_reference}</span></Row>
                    )}
                    {invoice.notes && <div className="sm:col-span-2"><Row label="Notes">{invoice.notes}</Row></div>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">Order Breakdown</CardTitle></CardHeader>
                <CardContent>
                    {lines.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No orders linked to this invoice.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-muted-foreground">
                                        <th className="pb-3 pr-4 font-medium">Delivered</th>
                                        <th className="pb-3 pr-4 font-medium">Order</th>
                                        <th className="pb-3 pr-4 font-medium">Payment</th>
                                        <th className="pb-3 pr-4 text-right font-medium">Order Total</th>
                                        <th className="pb-3 pr-4 text-right font-medium">Rate</th>
                                        <th className="pb-3 text-right font-medium">Commission</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {lines.map((l) => (
                                        <tr key={l.id}>
                                            <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{l.delivered_at}</td>
                                            <td className="py-2.5 pr-4 font-mono">
                                                {orderHref
                                                    ? <a href={orderHref(l)} className="text-blue-600 hover:underline">{l.order_number ?? '—'}</a>
                                                    : (l.order_number ?? '—')}
                                            </td>
                                            <td className="py-2.5 pr-4 text-muted-foreground">{l.payment_mode ? MODE_LABELS[l.payment_mode] : '—'}</td>
                                            <td className="py-2.5 pr-4 text-right">{fmtPeso(l.order_total)}</td>
                                            <td className="py-2.5 pr-4 text-right text-muted-foreground">{l.commission_rate}%</td>
                                            <td className="py-2.5 text-right font-medium">{fmtPeso(l.commission_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t font-semibold">
                                        <td className="pt-3 pr-4" colSpan={3}>Total</td>
                                        <td className="pt-3 pr-4 text-right">{fmtPeso(invoice.total_sales)}</td>
                                        <td />
                                        <td className="pt-3 text-right">{fmtPeso(invoice.commission_amount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <Card>
            <CardContent className="pt-5">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`mt-1 ${strong ? 'text-2xl font-bold' : 'text-lg font-semibold'}`}>{value}</p>
            </CardContent>
        </Card>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{children}</span>
        </div>
    );
}
