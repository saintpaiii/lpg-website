import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { AlertTriangle, ArrowLeft, FileDown } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { CommissionInvoiceDetail } from '@/components/commission-invoice-detail';
import { PayCommissionButton } from '@/components/pay-commission-button';
import { Button } from '@/components/ui/button';
import { fmtPeso, type CommissionInvoice, type InvoiceLine } from '@/lib/commission';
import type { BreadcrumbItem } from '@/types';

export default function SellerCommissionShow({ invoice, lines, suspend_after }: {
    invoice: CommissionInvoice;
    lines: InvoiceLine[];
    suspend_after: number;
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Commission', href: '/seller/commission' },
        { title: invoice.invoice_number, href: `/seller/commission/${invoice.id}` },
    ];
    const unpaid = invoice.status === 'pending' || invoice.status === 'overdue';

    // Feedback after returning from PayMongo
    useEffect(() => {
        const url = new URL(window.location.href);
        const val = url.searchParams.get('payment');
        if (!val) return;
        if (val === 'success') {
            if (invoice.status === 'paid') toast.success('Payment received — thank you!');
            else toast.info('Payment is being processed. This page will update once PayMongo confirms it.');
        } else if (val === 'cancelled') {
            toast.error('Payment was cancelled.');
        }
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice.invoice_number} />

            <div className="p-6 space-y-6 max-w-5xl">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/seller/commission">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold font-mono">{invoice.invoice_number}</h1>
                            <p className="text-sm text-muted-foreground">Commission invoice · {invoice.period_label}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/seller/commission/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                            <FileDown className="h-4 w-4" /> Download PDF
                        </a>
                        {unpaid && (
                            <PayCommissionButton invoiceId={invoice.id} size="default"
                                label={`Pay ${fmtPeso(invoice.commission_amount)}`}
                                className={`text-white ${invoice.status === 'overdue' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`} />
                        )}
                    </div>
                </div>

                {invoice.status === 'overdue' && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        This invoice is {invoice.days_overdue} day(s) overdue.
                        {invoice.store_suspended
                            ? ' Your store is suspended until it is paid.'
                            : ` Stores are suspended ${suspend_after} day(s) after the due date — pay now to avoid suspension.`}
                    </div>
                )}

                <CommissionInvoiceDetail invoice={invoice} lines={lines} orderHref={(l) => `/seller/orders/${l.order_id}`} />
            </div>
        </AppLayout>
    );
}
