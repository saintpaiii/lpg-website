import { FileDown, ReceiptText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** One acknowledgement receipt per payment (PaymentReceiptService::listFor). */
export type PaymentReceiptRow = {
    id: number;
    receipt_number: string;
    received_at: string | null;
    amount: number;
    method_label: string;
    kind_label: string;
    balance_after: number;
    pdf_url: string;
};

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentReceiptsCard({ receipts }: { receipts: PaymentReceiptRow[] }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <ReceiptText className="h-4 w-4 text-blue-600" />
                    Payment receipts
                </CardTitle>
            </CardHeader>
            <CardContent>
                {receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                    <ul className="divide-y">
                        {receipts.map((r) => (
                            <li key={r.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                                <div className="min-w-0 text-sm">
                                    <p className="font-mono text-xs font-semibold break-all">{r.receipt_number}</p>
                                    <p className="text-xs text-muted-foreground">{r.received_at}</p>
                                    <p className="mt-0.5">
                                        <span className="font-semibold">{peso(r.amount)}</span>
                                        <span className="text-muted-foreground"> · {r.method_label} · {r.kind_label}</span>
                                    </p>
                                </div>
                                <a
                                    href={r.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                                    aria-label={`Receipt ${r.receipt_number} PDF`}
                                >
                                    <FileDown className="h-3.5 w-3.5" />
                                    PDF
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
