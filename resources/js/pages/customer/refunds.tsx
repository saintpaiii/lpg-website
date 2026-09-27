import { Head, Link, router } from '@inertiajs/react';
import { RefreshCcw, ShieldAlert, TicketPercent } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { RefundResolution } from '@/components/refund-resolution';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import CustomerLayout from '@/layouts/customer-layout';
import {
    peso,
    REASON_LABELS,
    REFUND_STATUS_LABELS,
    REFUND_STATUS_STYLES,
    RESOLUTION_LABELS,
    type RefundItem,
} from '@/lib/refunds';

type Coupon = {
    id: number;
    code: string;
    amount: number;
    store_name: string | null;
    expires_at: string | null;
};

type Props = {
    refunds: {
        data: RefundItem[];
        current_page: number;
        last_page: number;
        total: number;
    };
    coupons: Coupon[];
};

export default function CustomerRefunds({ refunds, coupons }: Props) {
    const [escalating, setEscalating] = useState<RefundItem | null>(null);
    const [reason, setReason]         = useState('');
    const [submitting, setSubmitting] = useState(false);

    function submitEscalation() {
        if (!escalating || !reason.trim()) return;
        setSubmitting(true);
        router.post(`/customer/refunds/${escalating.id}/escalate`, { escalation_reason: reason }, {
            preserveScroll: true,
            onSuccess: () => { setEscalating(null); setReason(''); },
            onError: () => toast.error('Could not escalate this request.'),
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <CustomerLayout>
            <Head title="My Refunds — LPG Portal" />

            <div className="space-y-5">
                <div className="flex items-center gap-2">
                    <RefreshCcw className="h-5 w-5 text-blue-500" />
                    <h1 className="text-xl font-bold">My Refunds</h1>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                    Refund requests are handled directly by the store. If you disagree with the store's decision,
                    you can escalate the request to the platform admin.
                </div>

                {/* Active store coupons */}
                {coupons.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10 p-4">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                            <TicketPercent className="h-4 w-4" />
                            Your store coupons
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {coupons.map((c) => (
                                <div key={c.id} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm dark:border-emerald-800 dark:bg-card">
                                    <div>
                                        <p className="font-mono text-xs font-semibold">{c.code}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {c.store_name}{c.expires_at && ` · until ${c.expires_at}`}
                                        </p>
                                    </div>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{peso(c.amount)}</span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                            Coupons appear at checkout when you order from the same store.
                        </p>
                    </div>
                )}

                {refunds.data.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center">
                        <RefreshCcw className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No refund requests yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">If you received a damaged product, open your order and click "Request Refund".</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {refunds.data.map((r) => (
                            <div key={r.id} className="rounded-xl border bg-white dark:bg-card p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link href={`/customer/orders/${r.order_id}`} className="font-semibold font-mono hover:underline">
                                                {r.order_number ?? '—'}
                                            </Link>
                                            <span className="text-sm font-bold text-blue-700">{peso(r.amount)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {r.store_name && <span>{r.store_name} · </span>}
                                            {REASON_LABELS[r.reason] ?? r.reason} · {r.created_at}
                                        </p>
                                        {r.preferred_resolution && (
                                            <p className="text-xs text-muted-foreground">
                                                You asked for: {RESOLUTION_LABELS[r.preferred_resolution]}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${REFUND_STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                        {REFUND_STATUS_LABELS[r.status] ?? r.status}
                                    </span>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>

                                <RefundResolution refund={r} />

                                {r.evidence_urls.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {r.evidence_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt={`Evidence ${i + 1}`} className="h-12 w-12 rounded border object-cover hover:opacity-80" />
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {r.can_escalate && (
                                    <div className="flex justify-end">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                            onClick={() => { setEscalating(r); setReason(''); }}
                                        >
                                            <ShieldAlert className="h-4 w-4" />
                                            Escalate to Admin
                                        </Button>
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

            <Dialog open={!!escalating} onOpenChange={(o) => { if (!o) setEscalating(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Escalate to Admin — {escalating?.order_number}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 text-sm">
                        <p className="text-muted-foreground">
                            A platform admin will review the store's decision. You can only escalate a request once.
                        </p>
                        <label className="text-xs font-medium">Why do you disagree? <span className="text-red-500">*</span></label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            placeholder="Explain why the store's decision is not acceptable…"
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEscalating(null)}>Cancel</Button>
                        <Button
                            onClick={submitEscalation}
                            disabled={submitting || !reason.trim()}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            {submitting ? 'Submitting…' : 'Escalate'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CustomerLayout>
    );
}
