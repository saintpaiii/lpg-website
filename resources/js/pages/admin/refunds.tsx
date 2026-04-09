import { Head, router } from '@inertiajs/react';
import { RefreshCcw, Search, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type RefundItem = {
    id: number;
    order_number: string | null;
    order_total: number;
    store_name: string | null;
    customer_name: string | null;
    customer_email: string | null;
    amount: number;
    reason: string;
    description: string;
    status: 'pending' | 'approved' | 'rejected' | 'processed';
    admin_notes: string | null;
    processed_at: string | null;
    created_at: string;
    evidence_urls: string[];
};

type PaginatedItems = {
    data: RefundItem[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
};

type Props = {
    items: PaginatedItems;
    counts: { pending: number; approved: number; rejected: number; all: number };
    tab: string;
    search: string;
};

const REASON_LABELS: Record<string, string> = {
    damaged_product: 'Damaged Product',
    leaking_tank:    'Leaking Tank',
    wrong_product:   'Wrong Product',
    missing_items:   'Missing Items',
    quality_issue:   'Quality Issue',
    other:           'Other',
};

const STATUS_COLORS: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    approved:  'bg-blue-100 text-blue-800',
    processed: 'bg-green-100 text-green-800',
    rejected:  'bg-red-100 text-red-700',
};

const TABS = [
    { key: 'pending',  label: 'Pending',  countKey: 'pending'  as const },
    { key: 'approved', label: 'Approved', countKey: 'approved' as const },
    { key: 'rejected', label: 'Rejected', countKey: 'rejected' as const },
    { key: 'all',      label: 'All',      countKey: 'all'      as const },
];

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/admin/dashboard' },
    { title: 'Refunds',   href: '/admin/refunds' },
];

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function AdminRefunds({ items, counts, tab, search }: Props) {
    const [searchInput, setSearchInput] = useState(search);
    const [selected,    setSelected]    = useState<RefundItem | null>(null);
    const [approveOpen, setApproveOpen] = useState(false);
    const [rejectOpen,  setRejectOpen]  = useState(false);
    const [adminNotes,  setAdminNotes]  = useState('');
    const [lightbox,    setLightbox]    = useState<string | null>(null);

    function goTab(t: string) {
        router.get('/admin/refunds', { tab: t, search }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/refunds', { tab, search: searchInput }, { preserveState: true, replace: true });
    }

    function openApprove(r: RefundItem) {
        setSelected(r);
        setAdminNotes('');
        setApproveOpen(true);
    }

    function openReject(r: RefundItem) {
        setSelected(r);
        setAdminNotes('');
        setRejectOpen(true);
    }

    function submitApprove() {
        if (!selected) return;
        router.patch(`/admin/refunds/${selected.id}/approve`, { admin_notes: adminNotes }, {
            onSuccess: () => { toast.success('Refund approved. Credits issued.'); setApproveOpen(false); },
            onError:   () => toast.error('Failed to approve refund.'),
        });
    }

    function submitReject() {
        if (!selected || !adminNotes.trim()) return;
        router.patch(`/admin/refunds/${selected.id}/reject`, { admin_notes: adminNotes }, {
            onSuccess: () => { toast.success('Refund rejected.'); setRejectOpen(false); },
            onError:   () => toast.error('Failed to reject refund.'),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Refunds" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-2">
                    <RefreshCcw className="h-5 w-5 text-blue-500" />
                    <h1 className="text-xl font-bold">Refund Requests</h1>
                </div>

                {/* Search */}
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
                            router.get('/admin/refunds', { tab }, { preserveState: true, replace: true });
                        }}><X className="h-4 w-4" /></Button>
                    )}
                </form>

                {/* Tabs */}
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

                {/* Table */}
                <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Order</th>
                                <th className="px-4 py-3 text-left font-medium">Customer</th>
                                <th className="px-4 py-3 text-left font-medium">Store</th>
                                <th className="px-4 py-3 text-left font-medium">Reason</th>
                                <th className="px-4 py-3 text-right font-medium">Amount</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-left font-medium">Date</th>
                                <th className="px-4 py-3 text-left font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.data.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No refund requests found.</td></tr>
                            )}
                            {items.data.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30">
                                    <td className="px-4 py-3">
                                        <p className="font-mono font-medium">{r.order_number ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground">Total: {peso(r.order_total)}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium">{r.customer_name ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground">{r.customer_email}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm">{r.store_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{REASON_LABELS[r.reason] ?? r.reason}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{peso(r.amount)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.created_at}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                            {r.status === 'pending' && (
                                                <>
                                                    <Button size="sm" onClick={() => openApprove(r)} className="bg-green-600 hover:bg-green-700 text-white text-xs">Approve</Button>
                                                    <Button size="sm" variant="outline" onClick={() => openReject(r)} className="border-red-300 text-red-600 hover:bg-red-50 text-xs">Reject</Button>
                                                </>
                                            )}
                                            {r.status !== 'pending' && (
                                                <Button size="sm" variant="outline" onClick={() => { setSelected(r); }}>View</Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {items.last_page > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Showing {items.from ?? 0}–{items.to ?? 0} of {items.total}</span>
                        <div className="flex gap-1">
                            {Array.from({ length: items.last_page }, (_, i) => i + 1).map((p) => (
                                <button key={p}
                                    onClick={() => router.get('/admin/refunds', { tab, search, page: p }, { preserveState: true })}
                                    className={`px-3 py-1 rounded border text-xs ${p === items.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                                >{p}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Detail view dialog (non-pending) */}
            {selected && !approveOpen && !rejectOpen && (
                <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Refund #{selected.id} — {selected.order_number}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-3">
                                <div><p className="text-xs text-muted-foreground mb-0.5">Customer</p><p className="font-medium">{selected.customer_name}</p></div>
                                <div><p className="text-xs text-muted-foreground mb-0.5">Amount</p><p className="font-bold text-blue-700">{peso(selected.amount)}</p></div>
                                <div><p className="text-xs text-muted-foreground mb-0.5">Reason</p><p>{REASON_LABELS[selected.reason] ?? selected.reason}</p></div>
                                <div><p className="text-xs text-muted-foreground mb-0.5">Status</p>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[selected.status] ?? 'bg-gray-100'}`}>{selected.status}</span>
                                </div>
                            </div>
                            <div><p className="text-xs text-muted-foreground mb-1">Description</p>
                                <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap">{selected.description}</div>
                            </div>
                            {selected.admin_notes && (
                                <div><p className="text-xs text-muted-foreground mb-1">Admin Notes</p>
                                    <div className="rounded-md border bg-muted/30 p-3">{selected.admin_notes}</div>
                                </div>
                            )}
                            {selected.evidence_urls.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Evidence</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selected.evidence_urls.map((url, i) => (
                                            <button key={i} onClick={() => setLightbox(url)} className="rounded border overflow-hidden hover:opacity-90">
                                                <img src={url} alt={`Evidence ${i+1}`} className="h-20 w-20 object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Approve dialog */}
            <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve Refund</AlertDialogTitle>
                        <AlertDialogDescription>
                            Credit <strong>{selected ? peso(selected.amount) : ''}</strong> in platform credits to the customer for order <strong>{selected?.order_number}</strong>?
                            {selected && selected.amount > 0 && ' The seller wallet will be deducted if they already received payment.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-1 pb-2">
                        <label className="text-sm font-medium block mb-1">Admin Notes (optional)</label>
                        <textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            placeholder="Internal notes…"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitApprove} className="bg-green-600 hover:bg-green-700">
                            Approve & Issue Credits
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reject dialog */}
            <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Refund</AlertDialogTitle>
                        <AlertDialogDescription>
                            Reject the refund request for order <strong>{selected?.order_number}</strong>? The customer will be notified.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-1 pb-2">
                        <label className="text-sm font-medium block mb-1">Reason <span className="text-red-500">*</span></label>
                        <textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            placeholder="Explain why the refund is rejected…"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitReject} disabled={!adminNotes.trim()} className="bg-red-600 hover:bg-red-700">
                            Reject Refund
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="Evidence" className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
                </div>
            )}
        </AppLayout>
    );
}
