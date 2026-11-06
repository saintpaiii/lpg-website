import { Head } from '@inertiajs/react';
import { FileDown, Printer } from 'lucide-react';
import { InvoiceDocument, type InvoiceDoc } from '@/components/invoice-document';

/** Printable invoice — the store's invoice (InvoiceService::viewData). */
export default function InvoicePrint({ doc }: { doc: InvoiceDoc }) {
    return (
        <>
            <Head title={`Invoice ${doc.number}`} />
            <style>{`@media print { @page { size: A4 portrait; margin: 14mm; } }`}</style>

            <div className="min-h-screen bg-gray-100 px-4 py-6 print:bg-white print:p-0">
                <div className="mx-auto max-w-3xl">
                    <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
                        <button type="button" onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    </div>
                    <InvoiceDocument doc={doc} />
                    <p className="mt-3 text-center text-xs text-gray-400 print:hidden">
                        <FileDown className="mr-1 inline h-3.5 w-3.5" />Tip: choose "Save as PDF" in the print dialog, or use Download PDF on the invoice page.
                    </p>
                </div>
            </div>
        </>
    );
}
