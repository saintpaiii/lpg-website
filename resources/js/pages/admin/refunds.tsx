import { Head, Link, router } from '@inertiajs/react';
import { Gavel, RefreshCcw, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { RefundResolution } from '@/components/refund-resolution';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import {
    peso,
    REASON_LABELS,
    REFUND_STATUS_LABELS,
    REFUND_STATUS_STYLES,
    RESOLUTION_LABELS,
    type RefundItem,
} from '@/lib/refunds';
import type { BreadcrumbItem } from '@/types';

type Counts = { open: number; decided: number; all: number };

type Props = {
    items: { data: RefundItem[]; current_page: number; last_page: number; total: number };
    counts: Counts;
    tab: string;
    search: string;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Refund Disputes', href: '/admin/refunds' }];

const TABS: { key: string; label: string; countKey: keyof Counts }[] = [
    { key: 'open',    label: 'Awaiting Decision', countKey: 'open'    },
    { key: 'decided', label: 'Decided',           countKey: 'decided' },
    { key: 'all',     label: 'All',               countKey: 'all'     },
];

type Decision = 'favor_customer' | 'favor_seller';

export default function AdminRefundDisputes({ items, counts, tab, search }: Props) {
    const [searchInput, setSearchInput] = useState(search);
    const [deciding, setDeciding]       = useState<RefundItem | null>(null);
    const [decision, setDecision]       = useState<Decision>('favor_customer');
    const [notes, setNotes]             = useState('');
    const [submitting, setSubmitting]   = useState(false);

    function goTab(key: string) {
        router.get('/admin/refunds', { tab: key, search }, { preserveState: true, replace: true });
    }

    function doSearch(e: FormEvent) {
        e.preventDefault();
        router.get('/admin/refunds', { tab, search: searchInput }, { preserveState: true, replace: true });
    }

    function submitDecision() {
        if (!deciding || !notes.trim()) return;
        setSubmitting(true);
        router.patch(`/admin/refunds/${deciding.id}/decide`, { decision, admin_notes: notes }, {
            preserveScroll: true,
            onSuccess: () => setDeciding(null),
            onError: (errs) => toast.error(Object.values(errs)[0] ?? 'Could not record the decision.'),
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Refund Disputes" />

            <div className="p-6 space-y-5">
                <div>
                    <div className="flex items-center gap-2">
                        <RefreshCcw className="h-5 w-5 text-blue-500" />
                        <h1 className="text-xl font-bold">Refund Disputes</h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Sellers resolve refund requests directly. Only requests that a customer escalated appear here.
                    </p>
                </div>

                <form onSubmit={doSearch} className="flex gap-2 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search order # or store…"
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <Button type="submit" size="sm">Search</Button>
                    {search && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                            setSearchInput('');
                            router.get('/admin/refunds', { tab }, { preserveState: true, replace: true });
                        }}><X className="h-4 w-4" /></Button>
                    )}
                </form>

                <div className="flex gap-1 border-b">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => goTab(t.key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                        >
                            {t.label}
                            {counts[t.countKey] > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                    {counts[t.countKey]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {items.data.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                        No escalated refund disputes.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.data.map((r) => (
                            <div key={r.id} className="rounded-xl border bg-card p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-semibold">{r.order_number ?? '—'}</span>
                                            <span className="text-sm font-bold">{peso(r.amount)}</span>
                                            <span className="text-xs text-muted-foreground">of {peso(r.order_total)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            <span className="font-medium text-foreground">{r.store_name}</span>
                                            {' · '}{r.customer_name}{r.customer_email && ` (${r.customer_email})`}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {REASON_LABELS[r.reason] ?? r.reason} · requested {r.created_at}
                                            {r.preferred_resolution && ` · wants ${RESOLUTION_LABELS[r.preferred_resolution]}`}
                                        </p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REFUND_STATUS_STYLES[r.status]}`}>
                                        {REFUND_STATUS_LABELS[r.status]}
                                    </span>
                                </div>

                                <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">Customer's description</p>
                                    {r.description}
                                </div>

                                {r.evidence_urls.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {r.evidence_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt={`Evidence ${i + 1}`} className="h-16 w-16 rounded border object-cover hover:opacity-80" />
                                            </a>
                                        ))}
                                    </div>
                                )}

                                <RefundResolution refund={r} />

                                {!r.admin_decision && (
                                    <div className="flex justify-end">
                                        <Button size="sm" className="gap-1.5" onClick={() => { setDeciding(r); setDecision('favor_customer'); setNotes(''); }}>
                                            <Gavel className="h-4 w-4" /> Decide
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {items.last_page > 1 && (
                    <div className="flex justify-center gap-1 pt-2">
                        {Array.from({ length: items.last_page }, (_, i) => i + 1).map((p) => (
                            <Link key={p} href={`/admin/refunds?tab=${tab}&search=${encodeURIComponent(search)}&page=${p}`} preserveState
                                className={`px-3 py-1 rounded border text-sm ${p === items.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                                {p}
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={!!deciding} onOpenChange={(o) => { if (!o) setDeciding(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Gavel className="h-4 w-4" /> Decide Dispute — {deciding?.order_number}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <div className="grid gap-2">
                            {([
                                ['favor_customer', 'Rule in favor of the customer', 'The request re-opens and the seller must resolve it.'],
                                ['favor_seller', "Uphold the seller's decision", 'The dispute is closed as-is.'],
                            ] as [Decision, string, string][]).map(([key, label, hint]) => (
                                <label key={key} className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 ${decision === key ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                                    <input type="radio" name="decision" checked={decision === key} onChange={() => setDecision(key)} className="mt-0.5" />
                                    <span>
                                        <span className="block font-semibold">{label}</span>
                                        <span className="block text-xs text-muted-foreground">{hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Notes to both parties <span className="text-red-500">*</span></label>
                            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
                        <Button onClick={submitDecision} disabled={submitting || !notes.trim()}>
                            {submitting ? 'Saving…' : 'Record Decision'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
