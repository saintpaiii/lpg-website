import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type InvoiceItem = { product: string; brand: string; qty: number; price: number; subtotal: number };

type Invoice = {
    id: number;
    invoice_number: string;
    total_amount: number;
    shipping_fee: number;
    paid_amount: number;
    payment_status: string;
    payment_method: string | null;
    platform_commission: number;
    net_amount: number;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    is_online: boolean;
    pay_ref: string | null;
    paid_via: string | null;
    customer: { name: string; phone: string | null; address: string; city: string } | null;
    order: { id: number; order_number: string; transaction_type: string; items: InvoiceItem[] } | null;
};

type Props = { invoice: Invoice };

const PAY_COLORS: Record<string, string> = {
    paid:    'bg-green-100 text-green-700 border-green-200',
    unpaid:  'bg-red-100 text-red-700 border-red-200',
    partial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    voided:  'bg-gray-100 text-gray-500 border-gray-200',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const COD_METHODS = ['cash', 'gcash', 'bank_transfer', 'maya'] as const;

export default function SellerInvoiceShow({ invoice }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Invoices',  href: '/seller/invoices'  },
        { title: invoice.invoice_number, href: `/seller/invoices/${invoice.id}` },
    ];

    const canRecordPayment = !invoice.is_online
        && ['unpaid', 'partial'].includes(invoice.payment_status);

    const [recordOpen,     setRecordOpen]     = useState(false);
    const [recordMethod,   setRecordMethod]   = useState<string>('cash');
    const [recordAmount,   setRecordAmount]   = useState('');
    const [recordLoading,  setRecordLoading]  = useState(false);

    const grandTotal = invoice.total_amount + invoice.shipping_fee;

    function submitRecordPayment() {
        if (!recordAmount || parseFloat(recordAmount) <= 0) return;
        setRecordLoading(true);
        router.post(`/seller/invoices/${invoice.id}/record-payment`, {
            payment_method: recordMethod,
            amount: parseFloat(recordAmount),
        }, {
            preserveScroll: true,
            onSuccess: () => { setRecordOpen(false); toast.success('Payment recorded successfully.'); },
            onError:   () => toast.error('Failed to record payment. Please try again.'),
            onFinish:  () => setRecordLoading(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice.invoice_number} />

            <div className="p-6 space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/seller/invoices">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-bold font-mono">{invoice.invoice_number}</h1>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PAY_COLORS[invoice.payment_status] ?? 'bg-gray-100 text-gray-700'}`}>
                                    {invoice.payment_status}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Issued {invoice.created_at}
                                {invoice.due_date && ` · Due ${invoice.due_date}`}
                                {invoice.paid_at && ` · Paid ${invoice.paid_at}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {canRecordPayment && (
                            <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                onClick={() => { setRecordAmount(String(grandTotal)); setRecordOpen(true); }}
                            >
                                <Banknote className="h-4 w-4" />
                                Record Payment
                            </Button>
                        )}
                        {invoice.order && (
                            <Link href={`/seller/orders/${invoice.order.id}`}>
                                <Button size="sm" variant="outline">View Order</Button>
                            </Link>
                        )}
                        <a href={`/invoices/${invoice.id}/print`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="gap-1.5">
                                <Printer className="h-4 w-4" />
                                Print
                            </Button>
                        </a>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Items */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Product</th>
                                        <th className="text-center px-4 py-2 font-medium text-muted-foreground">Qty</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Price</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(invoice.order?.items ?? []).map((item, idx) => (
                                        <tr key={idx} className="border-b last:border-0">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{item.product}</p>
                                                {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-center">{item.qty}</td>
                                            <td className="px-4 py-3 text-right">{fmt(item.price)}</td>
                                            <td className="px-4 py-3 text-right font-medium">{fmt(item.subtotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t">
                                        <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm">Subtotal</td>
                                        <td className="px-4 py-2 text-right font-semibold">{fmt(invoice.total_amount)}</td>
                                    </tr>
                                    {invoice.shipping_fee > 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm">Delivery Fee</td>
                                            <td className="px-4 py-2 text-right">{fmt(invoice.shipping_fee)}</td>
                                        </tr>
                                    )}
                                    {invoice.shipping_fee > 0 && (
                                        <tr className="border-t">
                                            <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm font-medium">Total</td>
                                            <td className="px-4 py-2 text-right font-semibold">{fmt(grandTotal)}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm">Platform Commission</td>
                                        <td className="px-4 py-2 text-right text-red-600 font-medium">−{fmt(invoice.platform_commission)}</td>
                                    </tr>
                                    <tr className="bg-muted/20">
                                        <td colSpan={3} className="px-4 py-3 text-right font-bold">Net Earnings</td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-700 text-lg">{fmt(invoice.net_amount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </CardContent>
                    </Card>

                    {/* Right panel */}
                    <div className="space-y-4">
                        {invoice.customer && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
                                <CardContent className="text-sm space-y-1">
                                    <p className="font-semibold">{invoice.customer.name}</p>
                                    {invoice.customer.phone && <p className="text-muted-foreground">{invoice.customer.phone}</p>}
                                    <p className="text-xs text-muted-foreground">{invoice.customer.address}, {invoice.customer.city}</p>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Payment</CardTitle></CardHeader>
                            <CardContent className="text-sm space-y-2">
                                {/* Method type */}
                                <div className="flex items-center gap-2">
                                    {invoice.is_online ? (
                                        <>
                                            <CreditCard className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                            <span className="text-muted-foreground">Online (PayMongo)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Banknote className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                                            <span className="text-muted-foreground">Cash on Delivery</span>
                                        </>
                                    )}
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status</span>
                                    <span className={`font-medium capitalize ${invoice.payment_status === 'paid' ? 'text-emerald-600' : invoice.payment_status === 'unpaid' ? 'text-red-600' : ''}`}>
                                        {invoice.payment_status === 'paid' && <CheckCircle2 className="inline h-3.5 w-3.5 mr-0.5 mb-0.5" />}
                                        {invoice.payment_status}
                                    </span>
                                </div>

                                {invoice.payment_method && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Method</span>
                                        <span className="capitalize">{invoice.payment_method.replace('_', ' ')}</span>
                                    </div>
                                )}

                                {invoice.paid_via && (
                                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                                        Paid via {invoice.paid_via}
                                    </p>
                                )}

                                {invoice.pay_ref && (
                                    <div className="pt-1 border-t">
                                        <p className="text-xs text-muted-foreground mb-0.5">Transaction Ref</p>
                                        <p className="font-mono text-xs break-all text-gray-700">{invoice.pay_ref}</p>
                                    </div>
                                )}

                                {!invoice.is_online && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Paid</span>
                                            <span>{fmt(invoice.paid_amount)}</span>
                                        </div>
                                        <div className="flex justify-between pt-1 border-t">
                                            <span className="text-muted-foreground">Balance</span>
                                            <span className={`font-semibold ${grandTotal - invoice.paid_amount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {fmt(Math.max(0, grandTotal - invoice.paid_amount))}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Record Payment Dialog */}
            <Dialog open={recordOpen} onOpenChange={(o) => !o && setRecordOpen(false)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-emerald-600" />
                            Record Payment
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                        <p className="text-sm text-muted-foreground">
                            Invoice <strong className="font-mono">{invoice.invoice_number}</strong> · Total due: <strong>{fmt(grandTotal)}</strong>
                        </p>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">Payment Method</label>
                            <select
                                value={recordMethod}
                                onChange={(e) => setRecordMethod(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {COD_METHODS.map((m) => (
                                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">Amount Received</label>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={recordAmount}
                                onChange={(e) => setRecordAmount(e.target.value)}
                                placeholder={String(grandTotal)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRecordOpen(false)} disabled={recordLoading}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={submitRecordPayment}
                            disabled={recordLoading || !recordAmount || parseFloat(recordAmount) <= 0}
                        >
                            {recordLoading ? 'Saving…' : 'Confirm Payment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
