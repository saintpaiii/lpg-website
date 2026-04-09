import { Head, Link } from '@inertiajs/react';
import { Flag } from 'lucide-react';
import CustomerLayout from '@/layouts/customer-layout';

type ReportItem = {
    id: number;
    type: string;
    category: string;
    subject: string;
    description: string;
    status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
    resolution: string | null;
    resolved_at: string | null;
    created_at: string;
    order_number: string | null;
    store_name: string | null;
    evidence_urls: string[];
};

type PaginatedReports = {
    data: ReportItem[];
    current_page: number;
    last_page: number;
    total: number;
};

type Props = { reports: PaginatedReports };

const CATEGORY_LABELS: Record<string, string> = {
    fraud:          'Fraud',
    fake_product:   'Fake / Wrong Product',
    rude_behavior:  'Rude Behavior',
    non_delivery:   'Non-Delivery',
    overpricing:    'Overpricing',
    harassment:     'Harassment',
    counterfeit:    'Counterfeit Product',
    other:          'Other',
};

const STATUS_STYLES: Record<string, string> = {
    pending:      'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    resolved:     'bg-green-100 text-green-800',
    dismissed:    'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
    pending:      'Pending',
    under_review: 'Under Review',
    resolved:     'Resolved',
    dismissed:    'Dismissed',
};

export default function CustomerReports({ reports }: Props) {
    return (
        <CustomerLayout>
            <Head title="My Reports — LPG Portal" />

            <div className="space-y-5">
                <div className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-red-500" />
                    <h1 className="text-xl font-bold">My Reports</h1>
                </div>

                {reports.data.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center">
                        <Flag className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">You haven't submitted any reports yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {reports.data.map((r) => (
                            <div key={r.id} className="rounded-xl border bg-white dark:bg-card p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="font-semibold">{r.subject}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {r.store_name && <span>vs. <strong>{r.store_name}</strong> · </span>}
                                            {r.order_number && <span className="font-mono">{r.order_number} · </span>}
                                            {CATEGORY_LABELS[r.category] ?? r.category} · {r.created_at}
                                        </p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                        {STATUS_LABELS[r.status] ?? r.status}
                                    </span>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>

                                {r.resolution && (
                                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm">
                                        <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Admin Resolution{r.resolved_at ? ` · ${r.resolved_at}` : ''}</p>
                                        <p className="text-green-800 dark:text-green-300">{r.resolution}</p>
                                    </div>
                                )}

                                {r.evidence_urls.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {r.evidence_urls.map((url, i) => (
                                            url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                    <img src={url} alt={`Evidence ${i + 1}`} className="h-12 w-12 rounded border object-cover hover:opacity-80" />
                                                </a>
                                            ) : (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                   className="text-xs text-blue-600 underline">
                                                    File {i + 1}
                                                </a>
                                            )
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {reports.last_page > 1 && (
                    <div className="flex justify-center gap-1 pt-2">
                        {Array.from({ length: reports.last_page }, (_, i) => i + 1).map((p) => (
                            <Link
                                key={p}
                                href={`/customer/reports?page=${p}`}
                                className={`px-3 py-1 rounded border text-sm ${p === reports.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            >
                                {p}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </CustomerLayout>
    );
}
