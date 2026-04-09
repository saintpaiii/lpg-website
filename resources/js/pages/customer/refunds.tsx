import { Head, Link } from '@inertiajs/react';
import { RefreshCcw, Wallet } from 'lucide-react';
import CustomerLayout from '@/layouts/customer-layout';

type RefundItem = {
    id: number;
    order_number: string | null;
    store_name: string | null;
    amount: number;
    reason: string;
    description: string;
    status: 'pending' | 'approved' | 'rejected' | 'processed';
    admin_notes: string | null;
    processed_at: string | null;
    created_at: string;
    evidence_urls: string[];
};

type Props = {
    refunds: {
        data: RefundItem[];
        current_page: number;
        last_page: number;
        total: number;
    };
    credits_balance: number;
};

const REASON_LABELS: Record<string, string> = {
    damaged_product: 'Damaged Product',
    leaking_tank:    'Leaking Tank',
    wrong_product:   'Wrong Product',
    missing_items:   'Missing Items',
    quality_issue:   'Quality Issue',
    other:           'Other',
};

const STATUS_STYLES: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    approved:  'bg-blue-100 text-blue-800',
    processed: 'bg-green-100 text-green-800',
    rejected:  'bg-red-100 text-red-700',
};

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function CustomerRefunds({ refunds, credits_balance }: Props) {
    return (
        <CustomerLayout>
            <Head title="My Refunds — LPG Portal" />

            <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <RefreshCcw className="h-5 w-5 text-blue-500" />
                        <h1 className="text-xl font-bold">My Refunds</h1>
                    </div>

                    {/* Credits balance card */}
                    <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-4 py-2">
                        <Wallet className="h-4 w-4 text-green-600 shrink-0" />
                        <div>
                            <p className="text-xs text-green-700 dark:text-green-400">Platform Credits</p>
                            <p className="text-lg font-bold text-green-700 dark:text-green-400">{peso(credits_balance)}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                    Platform credits are automatically applied at checkout. They never expire.
                </div>

                {refunds.data.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center">
                        <RefreshCcw className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No refund requests yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">If you received a damaged product, open your order and click "Request Refund".</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {refunds.data.map((r) => (
                            <div key={r.id} className="rounded-xl border bg-white dark:bg-card p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold font-mono">{r.order_number ?? '—'}</p>
                                            <span className="text-sm font-bold text-blue-700">{peso(r.amount)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {r.store_name && <span>{r.store_name} · </span>}
                                            {REASON_LABELS[r.reason] ?? r.reason} · {r.created_at}
                                        </p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                        {r.status}
                                    </span>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>

                                {r.status === 'processed' && (
                                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm">
                                        <p className="text-green-700 dark:text-green-400 font-medium">
                                            ✓ {peso(r.amount)} has been credited to your platform credits
                                            {r.processed_at && ` on ${r.processed_at}`}.
                                        </p>
                                    </div>
                                )}

                                {r.status === 'rejected' && r.admin_notes && (
                                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm">
                                        <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-0.5">Rejection Reason</p>
                                        <p className="text-red-700 dark:text-red-300">{r.admin_notes}</p>
                                    </div>
                                )}

                                {r.evidence_urls.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {r.evidence_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt={`Evidence ${i + 1}`} className="h-12 w-12 rounded border object-cover hover:opacity-80" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {refunds.last_page > 1 && (
                    <div className="flex justify-center gap-1 pt-2">
                        {Array.from({ length: refunds.last_page }, (_, i) => i + 1).map((p) => (
                            <Link key={p} href={`/customer/refunds?page=${p}`}
                                className={`px-3 py-1 rounded border text-sm ${p === refunds.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                                {p}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </CustomerLayout>
    );
}
