import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { AdminInvoiceActions } from '@/components/admin-invoice-actions';
import { CommissionInvoiceDetail } from '@/components/commission-invoice-detail';
import { Button } from '@/components/ui/button';
import type { CommissionInvoice, InvoiceLine } from '@/lib/commission';
import type { BreadcrumbItem } from '@/types';

export default function AdminCommissionInvoiceShow({ invoice, lines }: { invoice: CommissionInvoice; lines: InvoiceLine[] }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Commissions', href: '/admin/commissions' },
        { title: invoice.invoice_number, href: `/admin/commissions/${invoice.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice.invoice_number} />

            <div className="p-6 space-y-6 max-w-5xl">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/commissions">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold font-mono">{invoice.invoice_number}</h1>
                            <p className="text-sm text-muted-foreground">
                                {invoice.store_name}
                                {invoice.store_suspended && (
                                    <span className="ml-2 rounded bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">SUSPENDED</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <AdminInvoiceActions invoice={invoice} showView={false} compact={false} />
                </div>

                <CommissionInvoiceDetail invoice={invoice} lines={lines} />
            </div>
        </AppLayout>
    );
}
