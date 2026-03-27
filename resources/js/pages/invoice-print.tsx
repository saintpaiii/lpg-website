import { Head } from '@inertiajs/react';
import { Flame, Printer } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { formatAddress } from '@/data/cavite-locations';

type InvoiceItem = {
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { name: string; brand: string | null; weight_kg: number } | null;
};

type Invoice = {
    id: number;
    invoice_number: string;
    total_amount: number;
    payment_status: string;
    paid_amount: number;
    payment_method: string | null;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    customer: {
        name: string;
        phone: string | null;
        address: string | null;
        city: string | null;
        barangay: string | null;
    } | null;
    order: {
        order_number: string;
        status: string;
        transaction_type: string;
        ordered_at: string | null;
        delivered_at: string | null;
        items: InvoiceItem[];
    } | null;
};

type Company = {
    name: string;
    address: string;
    phone: string;
    email: string;
};

type Props = {
    invoice: Invoice;
    company: Company;
};

const PAY_STATUS_LABEL: Record<string, string> = {
    unpaid:  'UNPAID',
    paid:    'PAID',
    partial: 'PARTIALLY PAID',
};

export default function InvoicePrint({ invoice, company }: Props) {
    const balance = invoice.total_amount - invoice.paid_amount;

    return (
        <>
            <Head title={`Receipt ${invoice.invoice_number}`} />

            {/* Print button — hidden on actual print */}
            <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg hover:bg-blue-700 transition-colors"
                >
                    <Printer className="h-4 w-4" />
                    Print Receipt
                </button>
                <button
                    onClick={() => window.close()}
                    className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg hover:bg-gray-200 transition-colors"
                >
                    Close
                </button>
            </div>

            {/* Receipt wrapper */}
            <div className="min-h-screen bg-gray-100 print:bg-white flex items-start justify-center py-8 print:py-0">
                <div className="bg-white w-full max-w-2xl shadow-xl print:shadow-none print:max-w-none px-10 py-10 print:px-8 print:py-6">

                    {/* Header */}
                    <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 print:bg-blue-600 shrink-0">
                                <Flame className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
                                {company.address && <p className="text-xs text-gray-500 mt-0.5">{company.address}</p>}
                                <div className="flex gap-3 mt-0.5">
                                    {company.phone && <p className="text-xs text-gray-500">{company.phone}</p>}
                                    {company.email && <p className="text-xs text-gray-500">{company.email}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="text-right">
                            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-wide">Official Receipt</h2>
                            <p className="text-sm font-mono font-semibold text-blue-700 mt-1">{invoice.invoice_number}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Date: {fmtDate(invoice.created_at)}</p>
                            {invoice.due_date && (
                                <p className="text-xs text-gray-500">Due: {fmtDate(invoice.due_date)}</p>
                            )}
                        </div>
                    </div>

                    {/* Bill-to + Order info */}
                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Bill To</h3>
                            {invoice.customer ? (
                                <>
                                    <p className="font-semibold text-gray-900">{invoice.customer.name}</p>
                                    {invoice.customer.phone && <p className="text-sm text-gray-600">{invoice.customer.phone}</p>}
                                    {invoice.customer.address && <p className="text-sm text-gray-600">{invoice.customer.address}</p>}
                                    {(invoice.customer.barangay || invoice.customer.city) && (
                                        <p className="text-sm text-gray-600">
                                            {formatAddress(null, invoice.customer.barangay, invoice.customer.city)}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-gray-400">—</p>
                            )}
                        </div>

                        {invoice.order && (
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Order Details</h3>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between gap-4">
                                        <span className="text-gray-500">Order #</span>
                                        <span className="font-mono font-semibold text-gray-900">{invoice.order.order_number}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-gray-500">Type</span>
                                        <span className="font-medium">{invoice.order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</span>
                                    </div>
                                    {invoice.order.ordered_at && (
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Ordered</span>
                                            <span className="font-medium">{fmtDate(invoice.order.ordered_at)}</span>
                                        </div>
                                    )}
                                    {invoice.order.delivered_at && (
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Delivered</span>
                                            <span className="font-medium">{fmtDate(invoice.order.delivered_at)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-4">
                                        <span className="text-gray-500">Order Status</span>
                                        <span className="font-medium capitalize">{invoice.order.status.replace('_', ' ')}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Items table */}
                    {invoice.order?.items && invoice.order.items.length > 0 && (
                        <table className="w-full text-sm mb-6">
                            <thead>
                                <tr className="bg-gray-900 text-white">
                                    <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                                    <th className="px-4 py-2.5 text-center font-semibold">Qty</th>
                                    <th className="px-4 py-2.5 text-right font-semibold">Unit Price</th>
                                    <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.order.items.map((item, i) => (
                                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="px-4 py-2.5">
                                            <p className="font-medium text-gray-900">{item.product?.name ?? '—'}</p>
                                            {item.product?.brand && <p className="text-xs text-gray-500">{item.product.brand}</p>}
                                            {item.product?.weight_kg && <p className="text-xs text-gray-400">{item.product.weight_kg} kg</p>}
                                        </td>
                                        <td className="px-4 py-2.5 text-center text-gray-700">{item.quantity}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                            ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                                            ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Totals */}
                    <div className="flex justify-end mb-8">
                        <div className="w-64 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="tabular-nums">₱{invoice.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 font-bold text-base">
                                <span>Total</span>
                                <span className="tabular-nums">₱{invoice.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {invoice.paid_amount > 0 && (
                                <div className="flex justify-between text-emerald-700">
                                    <span>Amount Paid</span>
                                    <span className="tabular-nums">₱{invoice.paid_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {balance > 0 && (
                                <div className="flex justify-between text-red-600 font-semibold">
                                    <span>Balance Due</span>
                                    <span className="tabular-nums">₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment info + status stamp */}
                    <div className="flex items-end justify-between border-t pt-6">
                        <div className="space-y-1 text-sm text-gray-600">
                            {invoice.payment_method && (
                                <p><span className="font-medium">Payment Method:</span> {invoice.payment_method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                            )}
                            {invoice.paid_at && (
                                <p><span className="font-medium">Paid on:</span> {fmtDate(invoice.paid_at)}</p>
                            )}
                        </div>

                        <div className={`border-4 rounded px-4 py-2 text-center font-black text-lg tracking-widest uppercase rotate-[-8deg] ${
                            invoice.payment_status === 'paid'
                                ? 'border-emerald-500 text-emerald-600'
                                : invoice.payment_status === 'partial'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-red-500 text-red-600'
                        }`}>
                            {PAY_STATUS_LABEL[invoice.payment_status] ?? invoice.payment_status.toUpperCase()}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-10 pt-6 border-t text-center text-sm text-gray-400">
                        <p className="font-medium">Thank you for choosing {company.name}!</p>
                        <p className="text-xs mt-1">This is an official receipt. Please keep for your records.</p>
                    </div>
                </div>
            </div>
        </>
    );
}
