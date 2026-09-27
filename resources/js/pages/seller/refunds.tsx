import { Head, Link, router } from '@inertiajs/react';
import { Check, RefreshCcw, Search, X } from 'lucide-react';
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
    RETURN_METHOD_LABELS,
    type RefundItem,
    type RefundResolution as Resolution,
    type ReturnMethod,
} from '@/lib/refunds';
import type { BreadcrumbItem } from '@/types';

type Counts = { pending: number; approved: number; processed: number; rejected: number; escalated: number; all: number };

type Props = {
    items: { data: RefundItem[]; current_page: number; last_page: number; total: number };
    counts: Counts;
    tab: string;
    search: string;
    riders: { id: number; name: string }[];
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Refunds', href: '/seller/refunds' }];

const TABS: { key: string; label: string; countKey: keyof Counts }[] = [
    { key: 'pending',   label: 'Needs Action', countKey: 'pending'   },
    { key: 'approved',  label: 'In Progress',  countKey: 'approved'  },
    { key: 'processed', label: 'Resolved',     countKey: 'processed' },
    { key: 'rejected',  label: 'Rejected',     countKey: 'rejected'  },
    { key: 'escalated', label: 'Escalated',    countKey: 'escalated' },
    { key: 'all',       label: 'All',          countKey: 'all'       },
];

const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

type AcceptForm = {
    resolution: Resolution;
    rider_id: string;
    refund_reference: string;
    discount_amount: string;
    discount_valid_days: string;
    return_method: ReturnMethod | '';
    seller_notes: string;
};

export default function SellerRefunds({ items, counts, tab, search, riders }: Props) {
    const [searchInput, setSearchInput] = useState(search);
    const [accepting, setAccepting]     = useState<RefundItem | null>(null);
    const [rejecting, setRejecting]     = useState<RefundItem | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [form, setForm] = useState<AcceptForm>({
        resolution: 'replacement', rider_id: '', refund_reference: '', discount_amount: '',
        discount_valid_days: '30', return_method: '', seller_notes: '',
    });

    function goTab(key: string) {
        router.get('/seller/refunds', { tab: key, search }, { preserveState: true, replace: true });
    }

    function doSearch(e: FormEvent) {
        e.preventDefault();
        router.get('/seller/refunds', { tab, search: searchInput }, { preserveState: true, replace: true });
    }

    function openAccept(r: RefundItem) {
        setForm({
            resolution: r.preferred_resolution ?? 'replacement',
            rider_id: '',
            refund_reference: '',
            discount_amount: String(r.amount),
            discount_valid_days: '30',
            return_method: '',
            seller_notes: '',
        });
        setAccepting(r);
    }

    const acceptValid = form.resolution === 'replacement'
        ? !!form.rider_id
        : form.resolution === 'money_refund'
            ? !!form.refund_reference.trim()
            : Number(form.discount_amount) > 0;

    function submitAccept() {
        if (!accepting || !acceptValid) return;
        setSubmitting(true);
        router.patch(`/seller/refunds/${accepting.id}/accept`, {
            resolution:          form.resolution,
            rider_id:            form.resolution === 'replacement' ? form.rider_id : null,
            refund_reference:    form.resolution === 'money_refund' ? form.refund_reference : null,
            discount_amount:     form.resolution === 'store_discount' ? form.discount_amount : null,
            discount_valid_days: form.resolution === 'store_discount' ? form.discount_valid_days : null,
            return_method:       form.return_method || null,
            seller_notes:        form.seller_notes || null,
        }, {
            preserveScroll: true,
            onSuccess: () => setAccepting(null),
            onError: (errs) => toast.error(Object.values(errs)[0] ?? 'Could not accept this request.'),
            onFinish: () => setSubmitting(false),
        });
    }

    function submitReject() {
        if (!rejecting || !rejectReason.trim()) return;
        setSubmitting(true);
        router.patch(`/seller/refunds/${rejecting.id}/reject`, { seller_notes: rejectReason }, {
            preserveScroll: true,
            onSuccess: () => { setRejecting(null); setRejectReason(''); },
            onError: (errs) => toast.error(Object.values(errs)[0] ?? 'Could not reject this request.'),
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Refunds" />

            <div className="p-6 space-y-5">
                <div>
                    <div className="flex items-center gap-2">
                        <RefreshCcw className="h-5 w-5 text-blue-500" />
                        <h1 className="text-xl font-bold">Refund Requests</h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Resolve refund requests for your orders by sending a replacement, refunding the customer directly, or issuing a store discount.
                        Customers can escalate to the platform admin if they disagree.
                    </p>
                </div>

                <form onSubmit={doSearch} className="flex gap-2 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search by order number…"
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <Button type="submit" size="sm">Search</Button>
                    {search && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                            setSearchInput('');
                            router.get('/seller/refunds', { tab }, { preserveState: true, replace: true });
                        }}><X className="h-4 w-4" /></Button>
                    )}
                </form>

                <div className="flex gap-1 border-b overflow-x-auto">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => goTab(t.key)}
                            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                        >
                            {t.label}
                            {counts[t.countKey] > 0 && (
                                <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-xs font-semibold ${t.key === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-muted'}`}>
                                    {counts[t.countKey]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {items.data.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                        No refund requests here.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.data.map((r) => (
                            <div key={r.id} className="rounded-xl border bg-card p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link href={`/seller/orders/${r.order_id}`} className="font-mono font-semibold text-blue-600 hover:underline">
                                                {r.order_number ?? '—'}
                                            </Link>
                                            <span className="text-sm font-bold">{peso(r.amount)}</span>
                                            <span className="text-xs text-muted-foreground">of {peso(r.order_total)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {r.customer_name}{r.customer_phone && ` · ${r.customer_phone}`} · {REASON_LABELS[r.reason] ?? r.reason} · {r.created_at}
                                        </p>
                                        {r.preferred_resolution && (
                                            <p className="text-xs mt-0.5">
                                                Customer prefers: <span className="font-semibold">{RESOLUTION_LABELS[r.preferred_resolution]}</span>
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {r.escalated_to_admin && !r.admin_decision && (
                                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Escalated</span>
                                        )}
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REFUND_STATUS_STYLES[r.status]}`}>
                                            {REFUND_STATUS_LABELS[r.status]}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-sm text-muted-foreground">{r.description}</p>

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

                                {r.status === 'pending' && (
                                    <div className="flex justify-end gap-2">
                                        {r.admin_decision !== 'favor_customer' && (
                                            <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                                                onClick={() => { setRejecting(r); setRejectReason(''); }}>
                                                <X className="h-4 w-4" /> Reject
                                            </Button>
                                        )}
                                        <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => openAccept(r)}>
                                            <Check className="h-4 w-4" /> Accept
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
                            <Link key={p} href={`/seller/refunds?tab=${tab}&search=${encodeURIComponent(search)}&page=${p}`} preserveState
                                className={`px-3 py-1 rounded border text-sm ${p === items.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                                {p}
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Accept dialog */}
            <Dialog open={!!accepting} onOpenChange={(o) => { if (!o) setAccepting(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Accept Refund — {accepting?.order_number}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <div className="grid gap-2">
                            <label className="text-xs font-medium">Resolution</label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                {(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((key) => (
                                    <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, resolution: key }))}
                                        className={`rounded-lg border-2 px-3 py-2 text-left text-xs font-semibold transition-colors ${form.resolution === key ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'}`}>
                                        {RESOLUTION_LABELS[key]}
                                        {accepting?.preferred_resolution === key && <span className="block font-normal text-muted-foreground">Customer's choice</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {form.resolution === 'replacement' && (
                            <div className="grid gap-1.5">
                                <label className="text-xs font-medium">Assign rider for the replacement delivery <span className="text-red-500">*</span></label>
                                {riders.length === 0 ? (
                                    <p className="text-xs text-red-600">You have no active riders. Add a rider in Staff first.</p>
                                ) : (
                                    <select value={form.rider_id} onChange={(e) => setForm((f) => ({ ...f, rider_id: e.target.value }))} className={inputCls}>
                                        <option value="">Select a rider…</option>
                                        {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                )}
                                <p className="text-xs text-muted-foreground">A ₱0 replacement order with the same items is created and stock is deducted.</p>
                            </div>
                        )}

                        {form.resolution === 'money_refund' && (
                            <div className="grid gap-1.5">
                                <label className="text-xs font-medium">Refund reference # <span className="text-red-500">*</span></label>
                                <input value={form.refund_reference} onChange={(e) => setForm((f) => ({ ...f, refund_reference: e.target.value }))}
                                    placeholder="e.g. GCash / bank transfer reference" className={inputCls} />
                                <p className="text-xs text-muted-foreground">
                                    Send {accepting ? peso(accepting.amount) : ''} to the customer yourself (GCash, bank transfer, cash), then enter the reference here.
                                </p>
                            </div>
                        )}

                        {form.resolution === 'store_discount' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Discount amount (₱) <span className="text-red-500">*</span></label>
                                    <input type="number" min="1" max={accepting?.amount} step="0.01" value={form.discount_amount}
                                        onChange={(e) => setForm((f) => ({ ...f, discount_amount: e.target.value }))} className={inputCls} />
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Valid for (days)</label>
                                    <input type="number" min="1" max="365" value={form.discount_valid_days}
                                        onChange={(e) => setForm((f) => ({ ...f, discount_valid_days: e.target.value }))} className={inputCls} />
                                </div>
                                <p className="col-span-2 text-xs text-muted-foreground">
                                    A coupon code is generated for this customer and can be applied on their next order from your store.
                                </p>
                            </div>
                        )}

                        {form.resolution !== 'store_discount' && (
                            <div className="grid gap-1.5">
                                <label className="text-xs font-medium">Return of the item</label>
                                <select value={form.return_method} onChange={(e) => setForm((f) => ({ ...f, return_method: e.target.value as ReturnMethod | '' }))} className={inputCls}>
                                    <option value="">Not specified</option>
                                    {(Object.keys(RETURN_METHOD_LABELS) as ReturnMethod[]).map((k) => (
                                        <option key={k} value={k}>{RETURN_METHOD_LABELS[k]}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Note to customer (optional)</label>
                            <textarea rows={2} value={form.seller_notes} onChange={(e) => setForm((f) => ({ ...f, seller_notes: e.target.value }))}
                                className={`${inputCls} resize-none`} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAccepting(null)}>Cancel</Button>
                        <Button onClick={submitAccept} disabled={submitting || !acceptValid} className="bg-green-600 hover:bg-green-700 text-white">
                            {submitting ? 'Saving…' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject dialog */}
            <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject Refund — {rejecting?.order_number}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-1.5 text-sm">
                        <label className="text-xs font-medium">Reason <span className="text-red-500">*</span></label>
                        <textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Explain why this request is being rejected…" className={`${inputCls} resize-none`} />
                        <p className="text-xs text-muted-foreground">The customer will see this and may escalate to the platform admin.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
                        <Button onClick={submitReject} disabled={submitting || !rejectReason.trim()} className="bg-red-600 hover:bg-red-700 text-white">
                            {submitting ? 'Saving…' : 'Reject Request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
