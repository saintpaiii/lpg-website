import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { InvoiceDocument, InvoiceStatusBadge, type InvoiceDoc } from '@/components/invoice-document';
import { Button } from '@/components/ui/button';
import CustomerLayout from '@/layouts/customer-layout';

/** The customer's invoice from the store (InvoiceService::viewData). */
export default function InvoiceShow({ doc }: { doc: InvoiceDoc }) {
    return (
        <CustomerLayout>
            <Head title={`Invoice ${doc.number} — LPG Portal`} />

            <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link href="/customer/invoices">
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Invoices
                            </Button>
                        </Link>
                        <h1 className="font-mono text-lg font-bold text-gray-900 sm:text-xl dark:text-white">{doc.number}</h1>
                        <InvoiceStatusBadge doc={doc} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href={`/invoices/${doc.id}/print`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5"><Printer className="h-4 w-4" /> Print</Button>
                        </a>
                        <a href={`/customer/invoices/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5"><FileDown className="h-4 w-4" /> Download PDF</Button>
                        </a>
                    </div>
                </div>

                <InvoiceDocument doc={doc} />
            </div>
        </CustomerLayout>
    );
}
