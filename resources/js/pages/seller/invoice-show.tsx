import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, FileDown, Printer } from 'lucide-react';
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
import { useStoreAccess } from '@/hooks/use-store-access';
import AppLayout from '@/layouts/app-layout';
import { InvoiceDocument, InvoiceStatusBadge, type InvoiceDoc } from '@/components/invoice-document';
import { PaymentReceiptsCard, type PaymentReceiptRow } from '@/components/payment-receipts-card';
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

    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    is_online: boolean;
    pay_ref: string | null;
    paid_via: string | null;
    customer: { name: string; phone: string | null; address: string; city: string | null } | null;
    order: { id: number; order_number: string; transaction_type: string; items: InvoiceItem[] } | null;
};

type Props = { invoice: Invoice; doc: InvoiceDoc; receipts: PaymentReceiptRow[] };


function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const COD_METHODS = ['cash', 'gcash', 'bank_transfer', 'maya'] as const;

export default function SellerInvoiceShow({ invoice, doc, receipts = [] }: Props) {
    // Staff with Invoices but not Orders: no "View Order" (it would open a 403 page)
    const { canOpen } = useStoreAccess();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Invoices',  href: '/seller/invoices'  },
        { title: invoice.invoice_number, href: `/seller/invoices/${invoice.id}` },
    ];

    // Never on a void invoice / cancelled order (the server refuses it too)
    const canRecordPayment = !invoice.is_online && !doc.is_void && doc.order?.status !== 'cancelled'
        && ['unpaid', 'partial'].includes(invoice.payment_status);

    const [recordOpen,     setRecordOpen]     = useState(false);
    const [recordMethod,   setRecordMethod]   = useState<string>('cash');
    const [recordAmount,   setRecordAmount]   = useState('');
    const [recordLoading,  setRecordLoading]  = useState(false);

    const grandTotal = doc.breakdown.grand_total;
    // What is still owed — "Amount Received" is added to what was already paid
    const remaining  = Math.max(0, Math.round((grandTotal - invoice.paid_amount) * 100) / 100);
    const [recordError, setRecordError] = useState<string | null>(null);

    function submitRecordPayment() {
        if (!recordAmount || parseFloat(recordAmount) <= 0) return;
        setRecordLoading(true);
        setRecordError(null);
        router.post(`/seller/invoices/${invoice.id}/record-payment`, {
            payment_method: recordMethod,
            amount: parseFloat(recordAmount),
        }, {
            preserveScroll: true,
            onSuccess: () => { setRecordOpen(false); },
            onError:   (errors) => {
                if (errors.amount) setRecordError(errors.amount);
                else toast.error('Failed to record payment. Please try again.');
            },
            onFinish:  () => setRecordLoading(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice.invoice_number} />

            <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
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
                                <InvoiceStatusBadge doc={doc} />
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
                                onClick={() => { setRecordAmount(remaining.toFixed(2)); setRecordError(null); setRecordOpen(true); }}
                            >
                                <Banknote className="h-4 w-4" />
                                Record Payment
                            </Button>
                        )}
                        {invoice.order && canOpen('/seller/orders') && (
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
                        <a href={`/seller/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="gap-1.5">
                                <FileDown className="h-4 w-4" />
                                Download PDF
                            </Button>
                        </a>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* The store's invoice (same layout as print / PDF / customer view) */}
                    <div className="lg:col-span-2">
                        <InvoiceDocument doc={doc} />
                    </div>

                    {/* Right panel */}
                    <div className="space-y-4">
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

                        <PaymentReceiptsCard receipts={receipts} />
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
                            Invoice <strong className="font-mono">{invoice.invoice_number}</strong> · Total: <strong>{fmt(grandTotal)}</strong>
                            {invoice.paid_amount > 0 && <> · Paid: <strong>{fmt(invoice.paid_amount)}</strong></>}
                            {' '}· Balance: <strong>{fmt(remaining)}</strong>
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
                                max={remaining}
                                value={recordAmount}
                                onChange={(e) => { setRecordAmount(e.target.value); setRecordError(null); }}
                                placeholder={remaining.toFixed(2)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-muted-foreground">Added to what was already paid. A receipt is issued for this amount.</p>
                            {recordError && <p className="text-xs text-red-600">{recordError}</p>}
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
