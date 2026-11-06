// The store's invoice — one layout for the seller / customer / admin pages and the print page.
// Data: App\Services\InvoiceService::viewData() (the PDF uses the same data: resources/views/pdf/invoice.blade.php).

import type { PriceBreakdown } from '@/components/price-breakdown';

export type InvoiceDoc = {
    id: number;
    number: string;
    issued_at: string | null;
    due_date: string | null;
    status: 'unpaid' | 'partial' | 'paid' | 'voided' | string;
    is_void: boolean;
    /** Issued before store invoices: current store header, no tax block */
    is_old: boolean;
    vat_status: 'vat' | 'non_vat' | null;
    seller: { name: string; tin: string | null; address: string | null; phone: string | null; email: string | null };
    store_name: string;
    buyer: { name: string; address: string | null; phone: string | null; tin: string | null };
    order: { id: number; number: string; status: string; fulfillment: string; archived: boolean } | null;
    items: { description: string; qty: number; unit_price: number; amount: number }[];
    breakdown: PriceBreakdown;
    tax: { vatable_sales: number; vat_amount: number; vat_exempt: number; zero_rated: number } | null;
    payment: {
        status: string;
        method: string | null;
        method_label: string | null;
        paid_at: string | null;
        paid_amount: number;
        balance: number;
    };
};

export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceStatusBadge({ doc }: { doc: InvoiceDoc }) {
    const s = doc.is_void ? 'voided' : doc.status;
    const style: Record<string, string> = {
        paid:    'bg-emerald-100 text-emerald-700',
        partial: 'bg-amber-100 text-amber-700',
        unpaid:  'bg-red-100 text-red-700',
        voided:  'bg-gray-200 text-gray-600',
    };
    const label: Record<string, string> = { paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid', voided: 'VOID' };
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style[s] ?? 'bg-gray-100 text-gray-700'}`}>
            {label[s] ?? s}
        </span>
    );
}

function Row({ label, value, strong, green }: { label: string; value: string; strong?: boolean; green?: boolean }) {
    return (
        <div className={`flex justify-between gap-4 py-1 ${strong ? 'border-t-2 border-gray-900 pt-2 text-base font-bold dark:border-gray-200' : 'text-sm'}`}>
            <span className={strong ? '' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
            <span className={`tabular-nums ${green ? 'text-emerald-600' : ''}`}>{value}</span>
        </div>
    );
}

/** The invoice paper. Prints cleanly (white background, no shadows). */
export function InvoiceDocument({ doc }: { doc: InvoiceDoc }) {
    const b = doc.breakdown;
    const p = doc.payment;

    return (
        <div className="relative overflow-hidden rounded-lg border bg-white p-4 text-gray-900 shadow-sm sm:p-8 dark:bg-gray-950 dark:text-gray-100 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-gray-900 print:shadow-none">
            {doc.is_void && (
                <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="-rotate-[20deg] text-4xl font-black tracking-widest text-red-600/20 sm:text-6xl">VOID</span>
                </div>
            )}

            {/* Header: the STORE (the issuer) */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold break-words sm:text-xl">{doc.seller.name}</h2>
                    {doc.vat_status === 'vat' && doc.seller.tin && <p className="text-sm">VAT Reg. TIN: {doc.seller.tin}</p>}
                    {doc.vat_status === 'non_vat' && doc.seller.tin && <p className="text-sm">NON-VAT Reg. TIN: {doc.seller.tin}</p>}
                    {doc.seller.address && <p className="text-sm text-gray-500 dark:text-gray-400">{doc.seller.address}</p>}
                    {(doc.seller.phone || doc.seller.email) && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{[doc.seller.phone, doc.seller.email].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
                <div className="sm:text-right">
                    <p className="text-2xl font-black tracking-widest text-blue-900 dark:text-blue-300 print:text-blue-900">INVOICE</p>
                    <p className="font-mono font-semibold">No. {doc.number}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Date issued: {doc.issued_at}</p>
                    {doc.order && <p className="text-sm text-gray-500 dark:text-gray-400">Order: {doc.order.number}</p>}
                </div>
            </div>

            {doc.is_void && (
                <p className="mt-4 rounded-md border-2 border-red-600 px-3 py-1.5 text-center text-sm font-bold tracking-wide text-red-600">
                    VOID — order cancelled
                </p>
            )}

            {/* Sold to */}
            <div className="mt-5 rounded-md border px-3 py-2.5 text-sm">
                <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Sold to</p>
                <p className="font-semibold">{doc.buyer.name}</p>
                {doc.buyer.address && <p>{doc.buyer.address}</p>}
                {doc.buyer.tin && <p>TIN: {doc.buyer.tin}</p>}
            </div>

            {/* Items — a table on wide screens, stacked rows on phones */}
            <div className="mt-5">
                <table className="hidden w-full text-sm sm:table print:table">
                    <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-gray-900 print:bg-gray-50">
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Unit price</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {doc.items.map((i, k) => (
                            <tr key={k}>
                                <td className="px-3 py-2">{i.description}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{i.qty}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{peso(i.unit_price)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{peso(i.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <ul className="divide-y border-y sm:hidden print:hidden">
                    {doc.items.map((i, k) => (
                        <li key={k} className="py-2 text-sm">
                            <p className="font-medium">{i.description}</p>
                            <p className="flex justify-between text-gray-500 dark:text-gray-400">
                                <span>{i.qty} × {peso(i.unit_price)}</span>
                                <span className="text-gray-900 tabular-nums dark:text-gray-100">{peso(i.amount)}</span>
                            </p>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Totals + tax block */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
                <div className="order-2 sm:order-1 print:order-1">
                    {doc.tax ? (
                        <div className="rounded-md border px-3 py-1.5 text-sm">
                            <Row label="VATable sales" value={peso(doc.tax.vatable_sales)} />
                            <Row label="VAT (12%)" value={peso(doc.tax.vat_amount)} />
                            <Row label="VAT-exempt sales" value={peso(doc.tax.vat_exempt)} />
                            <Row label="Zero-rated sales" value={peso(doc.tax.zero_rated)} />
                        </div>
                    ) : doc.vat_status === 'non_vat' ? (
                        <p className="rounded-md border px-3 py-2 text-sm text-gray-500 dark:text-gray-400">NON-VAT — no VAT included.</p>
                    ) : null}
                </div>
                <div className="order-1 sm:order-2 print:order-2">
                    <Row label="Subtotal" value={peso(b.subtotal)} />
                    <Row label="Delivery fee" value={b.delivery_fee > 0 ? peso(b.delivery_fee) : 'Free'} />
                    {b.store_discount > 0 && <Row label="Store discount" value={`−${peso(b.store_discount)}`} green />}
                    {b.coupon_discount > 0 && <Row label={`Coupon${b.coupon_code ? ` (${b.coupon_code})` : ''}`} value={`−${peso(b.coupon_discount)}`} green />}
                    <Row label="TOTAL AMOUNT DUE" value={peso(b.grand_total)} strong />
                </div>
            </div>

            {/* Payment */}
            <div className="mt-5 rounded-md border px-3 py-2.5 text-sm">
                <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Payment</p>
                {doc.is_void ? (
                    <p className="font-bold text-red-600">VOID — order cancelled</p>
                ) : p.status === 'paid' ? (
                    <p className="font-semibold text-emerald-600">Paid</p>
                ) : p.status === 'partial' ? (
                    <p className="font-semibold">Partially paid {peso(p.paid_amount)} (balance {peso(p.balance)})</p>
                ) : (
                    <p className="font-semibold">Unpaid</p>
                )}
                {p.method_label && <p className="text-gray-500 dark:text-gray-400">Method: {p.method_label}</p>}
                {p.paid_at && <p className="text-gray-500 dark:text-gray-400">Paid on: {p.paid_at}</p>}
            </div>

            <div className="mt-6 border-t pt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                <p>System-generated invoice from LPG Platform. The store's BIR-registered invoice prevails until this system is registered with the BIR.</p>
                <p className="mt-1">Thank you for choosing {doc.store_name}!</p>
            </div>
        </div>
    );
}
