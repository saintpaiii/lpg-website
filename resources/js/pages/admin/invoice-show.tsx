import { Head } from '@inertiajs/react';
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { InvoiceDocument, InvoiceStatusBadge, type InvoiceDoc } from '@/components/invoice-document';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Invoice = {
    id: number;
    invoice_number: string;
    deleted_at: string | null;
    customer: { id: number; name: string; phone: string | null; email: string | null } | null;
    order: { id: number; order_number: string; notes: string | null; ordered_at: string | null; delivered_at: string | null } | null;
};

type Props = { invoice: Invoice; doc: InvoiceDoc };

// ── Page ───────────────────────────────────────────────────────────────────────

/**
 * Admin view (read-only platform monitoring). The invoice itself is the STORE's (InvoiceService::viewData) —
 * the same layout as the seller / customer pages and the print / PDF.
 */
export default function InvoiceShowPage({ invoice, doc }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Invoices', href: '/admin/invoices' },
        { title: doc.number, href: `/admin/invoices/${doc.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Invoice ${doc.number}`} />

            <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" onClick={() => history.back()} className="flex items-center gap-1.5 text-gray-600">
                            <ArrowLeft className="h-4 w-4" /> Back to Invoices
                        </Button>
                        <InvoiceStatusBadge doc={doc} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <a href={`/invoices/${doc.id}/print`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5"><Printer className="h-4 w-4" /> Print</Button>
                        </a>
                        <a href={`/admin/invoices/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5"><FileDown className="h-4 w-4" /> Download PDF</Button>
                        </a>
                    </div>
                </div>

                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                    Read-only (platform monitoring). This invoice is issued by the store.
                    {invoice.deleted_at && ' It is archived.'}
                    {doc.order?.archived && ' Its order is archived.'}
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <InvoiceDocument doc={doc} />
                    </div>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Customer</CardTitle></CardHeader>
                            <CardContent className="space-y-0.5 text-sm">
                                <p className="font-semibold">{invoice.customer?.name ?? doc.buyer.name}</p>
                                {invoice.customer?.phone && <p className="text-gray-500">{invoice.customer.phone}</p>}
                                {invoice.customer?.email && <p className="text-gray-500">{invoice.customer.email}</p>}
                            </CardContent>
                        </Card>

                        {invoice.order && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">Order</CardTitle></CardHeader>
                                <CardContent className="space-y-1 text-sm">
                                    <p className="font-mono font-semibold">{invoice.order.order_number}</p>
                                    {invoice.order.ordered_at && <p className="text-gray-500">Ordered {invoice.order.ordered_at}</p>}
                                    {invoice.order.delivered_at && <p className="text-emerald-600">Delivered {invoice.order.delivered_at}</p>}
                                    {invoice.order.notes && <p className="whitespace-pre-line text-gray-600">{invoice.order.notes}</p>}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
