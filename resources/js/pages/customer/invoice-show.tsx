import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

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
    order: {
        order_number: string;
        status: string;
        ordered_at: string | null;
        items: {
            quantity: number;
            unit_price: number;
            subtotal: number;
            product: { name: string; brand: string | null } | null;
        }[];
    } | null;
};

type Props = { invoice: Invoice };

const PAY_STYLES: Record<string, string> = {
    unpaid:  'bg-red-100 text-red-700',
    paid:    'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
};

export default function InvoiceShow({ invoice }: Props) {
    return (
        <CustomerLayout>
            <Head title={`Invoice ${invoice.invoice_number} — LPG Portal`} />

            <div className="space-y-6 max-w-3xl mx-auto">
                {/* Back + header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/customer/invoices">
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Invoices
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white font-mono">{invoice.invoice_number}</h1>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAY_STYLES[invoice.payment_status] ?? 'bg-gray-100'}`}>
                            {invoice.payment_status.charAt(0).toUpperCase() + invoice.payment_status.slice(1)}
                        </span>
                    </div>
                    <a href={`/invoices/${invoice.id}/print`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Printer className="h-4 w-4" />
                            Print Receipt
                        </Button>
                    </a>
                </div>

                {/* Invoice details */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Invoice Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-6">
                            <div>
                                <p className="text-gray-500 text-xs">Invoice Number</p>
                                <p className="font-mono font-semibold">{invoice.invoice_number}</p>
                            </div>
                            {invoice.order && (
                                <div>
                                    <p className="text-gray-500 text-xs">Order Number</p>
                                    <p className="font-mono font-semibold">{invoice.order.order_number}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-gray-500 text-xs">Date Issued</p>
                                <p className="font-medium">{invoice.created_at}</p>
                            </div>
                            {invoice.due_date && (
                                <div>
                                    <p className="text-gray-500 text-xs">Due Date</p>
                                    <p className="font-medium">{invoice.due_date}</p>
                                </div>
                            )}
                            {invoice.paid_at && (
                                <div>
                                    <p className="text-gray-500 text-xs">Paid At</p>
                                    <p className="font-medium">{invoice.paid_at}</p>
                                </div>
                            )}
                            {invoice.payment_method && (
                                <div>
                                    <p className="text-gray-500 text-xs">Payment Method</p>
                                    <p className="font-medium capitalize">{invoice.payment_method.replace('_', ' ')}</p>
                                </div>
                            )}
                        </div>

                        {/* Items table */}
                        {invoice.order?.items && invoice.order.items.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-3 py-2">Product</th>
                                            <th className="px-3 py-2 text-center">Qty</th>
                                            <th className="px-3 py-2 text-right">Unit Price</th>
                                            <th className="px-3 py-2 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {invoice.order.items.map((item, i) => (
                                            <tr key={i}>
                                                <td className="px-3 py-2">
                                                    <p className="font-medium">{item.product?.name ?? '—'}</p>
                                                    {item.product?.brand && (
                                                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                                    ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t bg-gray-50">
                                            <td colSpan={3} className="px-3 py-2 text-right font-bold">Total Amount</td>
                                            <td className="px-3 py-2 text-right font-bold text-blue-700 tabular-nums">
                                                ₱{invoice.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                        {invoice.paid_amount > 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-3 py-2 text-right text-gray-500">Amount Paid</td>
                                                <td className="px-3 py-2 text-right text-emerald-600 font-semibold tabular-nums">
                                                    ₱{invoice.paid_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        )}
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </CustomerLayout>
    );
}
