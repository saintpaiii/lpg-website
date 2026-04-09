import { Head, router } from '@inertiajs/react';
import { Download, Flag, Search, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Reporter = { id: number; name: string; email: string };
type ReportedStore = { id: number; name: string };

type ReportItem = {
    id: number;
    type: 'buyer_report' | 'seller_report';
    category: string;
    subject: string;
    description: string;
    status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
    admin_notes: string | null;
    resolution: string | null;
    resolved_at: string | null;
    created_at: string;
    evidence_urls: string[];
    reporter: Reporter | null;
    reported: Reporter | null;
    reported_store: ReportedStore | null;
    order_number: string | null;
    resolver: { name: string } | null;
};

type PaginatedItems = {
    data: ReportItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
};

type Props = {
    items: PaginatedItems;
    counts: { pending: number; under_review: number; resolved: number; all: number };
    tab: string;
    search: string;
};

const CATEGORY_LABELS: Record<string, string> = {
    fraud:          'Fraud',
    fake_product:   'Fake Product',
    rude_behavior:  'Rude Behavior',
    non_delivery:   'Non-Delivery',
    overpricing:    'Overpricing',
    harassment:     'Harassment',
    counterfeit:    'Counterfeit',
    other:          'Other',
};

const STATUS_COLORS: Record<string, string> = {
    pending:      'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    resolved:     'bg-green-100 text-green-800',
    dismissed:    'bg-gray-100 text-gray-600',
};

const TABS = [
    { key: 'pending',      label: 'Pending',      countKey: 'pending' as const },
    { key: 'under_review', label: 'Under Review',  countKey: 'under_review' as const },
    { key: 'resolved',     label: 'Resolved',      countKey: 'resolved' as const },
    { key: 'all',          label: 'All',           countKey: 'all' as const },
];

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard',   href: '/admin/dashboard' },
    { title: 'User Reports', href: '/admin/user-reports' },
];

export default function AdminUserReports({ items, counts, tab, search }: Props) {
    const [searchInput, setSearchInput] = useState(search);
    const [selected, setSelected]       = useState<ReportItem | null>(null);
    const [editStatus, setEditStatus]   = useState('');
    const [editNotes, setEditNotes]     = useState('');
    const [editResolution, setEditResolution] = useState('');
    const [saving, setSaving]           = useState(false);
    const [lightbox, setLightbox]       = useState<string | null>(null);

    function goTab(t: string) {
        router.get('/admin/user-reports', { tab: t, search }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/user-reports', { tab, search: searchInput }, { preserveState: true, replace: true });
    }

    function openDetail(r: ReportItem) {
        setSelected(r);
        setEditStatus(r.status);
        setEditNotes(r.admin_notes ?? '');
        setEditResolution(r.resolution ?? '');
    }

    function saveUpdate() {
        if (!selected) return;
        setSaving(true);
        router.patch(`/admin/user-reports/${selected.id}`, {
            status:      editStatus,
            admin_notes: editNotes,
            resolution:  editResolution,
        }, {
            onSuccess: () => {
                toast.success('Report updated.');
                setSelected(null);
            },
            onError: () => toast.error('Failed to update report.'),
            onFinish: () => setSaving(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="User Reports" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Flag className="h-5 w-5 text-red-500" />
                        <h1 className="text-xl font-bold">User Reports</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href="/admin/user-reports/export" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1.5">
                            <Download className="h-3.5 w-3.5" /> Export CSV
                        </a>
                    </div>
                </div>

                {/* Search */}
                <form onSubmit={doSearch} className="flex gap-2 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search reporter, subject…"
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <Button type="submit" size="sm">Search</Button>
                    {search && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                            setSearchInput('');
                            router.get('/admin/user-reports', { tab }, { preserveState: true, replace: true });
                        }}><X className="h-4 w-4" /></Button>
                    )}
                </form>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => goTab(t.key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                tab === t.key
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
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
                                <th className="px-4 py-3 text-left font-medium">Subject</th>
                                <th className="px-4 py-3 text-left font-medium">Type</th>
                                <th className="px-4 py-3 text-left font-medium">Category</th>
                                <th className="px-4 py-3 text-left font-medium">Reporter</th>
                                <th className="px-4 py-3 text-left font-medium">Against</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-left font-medium">Date</th>
                                <th className="px-4 py-3 text-left font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.data.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                                        No reports found.
                                    </td>
                                </tr>
                            )}
                            {items.data.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30">
                                    <td className="px-4 py-3 max-w-xs">
                                        <p className="font-medium truncate">{r.subject}</p>
                                        {r.order_number && (
                                            <p className="text-xs text-muted-foreground font-mono">{r.order_number}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                            r.type === 'buyer_report'
                                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                                : 'bg-amber-100 text-amber-700 border-amber-200'
                                        }`}>
                                            {r.type === 'buyer_report' ? 'Buyer → Seller' : 'Seller → Buyer'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {CATEGORY_LABELS[r.category] ?? r.category}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium">{r.reporter?.name ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground">{r.reporter?.email}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        {r.type === 'buyer_report' ? (
                                            <p className="text-sm">{r.reported_store?.name ?? '—'}</p>
                                        ) : (
                                            <>
                                                <p className="text-sm font-medium">{r.reported?.name ?? '—'}</p>
                                                <p className="text-xs text-muted-foreground">{r.reported?.email}</p>
                                            </>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status]}`}>
                                            {r.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.created_at}</td>
                                    <td className="px-4 py-3">
                                        <Button size="sm" variant="outline" onClick={() => openDetail(r)}>
                                            Review
                                        </Button>
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
                                <button
                                    key={p}
                                    onClick={() => router.get('/admin/user-reports', { tab, search, page: p }, { preserveState: true })}
                                    className={`px-3 py-1 rounded border text-xs ${p === items.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Detail / Edit Dialog */}
            <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-red-500" />
                            Report #{selected?.id} — {selected?.subject}
                        </DialogTitle>
                    </DialogHeader>

                    {selected && (
                        <div className="space-y-4 text-sm">
                            {/* Meta row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                        selected.type === 'buyer_report'
                                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                                            : 'bg-amber-100 text-amber-700 border-amber-200'
                                    }`}>
                                        {selected.type === 'buyer_report' ? 'Buyer → Seller' : 'Seller → Buyer'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                                    <p className="font-medium">{CATEGORY_LABELS[selected.category] ?? selected.category}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Reporter</p>
                                    <p className="font-medium">{selected.reporter?.name}</p>
                                    <p className="text-xs text-muted-foreground">{selected.reporter?.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Reported</p>
                                    {selected.type === 'buyer_report' ? (
                                        <p className="font-medium">{selected.reported_store?.name ?? '—'} (Store)</p>
                                    ) : (
                                        <>
                                            <p className="font-medium">{selected.reported?.name ?? '—'}</p>
                                            <p className="text-xs text-muted-foreground">{selected.reported?.email}</p>
                                        </>
                                    )}
                                </div>
                                {selected.order_number && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-0.5">Order</p>
                                        <p className="font-mono">{selected.order_number}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Submitted</p>
                                    <p>{selected.created_at}</p>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Description</p>
                                <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{selected.description}</div>
                            </div>

                            {/* Evidence */}
                            {selected.evidence_urls.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Evidence ({selected.evidence_urls.length} file{selected.evidence_urls.length !== 1 ? 's' : ''})</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selected.evidence_urls.map((url, i) => (
                                            url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                                <button key={i} onClick={() => setLightbox(url)} className="rounded border overflow-hidden hover:opacity-90 transition-opacity">
                                                    <img src={url} alt={`Evidence ${i + 1}`} className="h-20 w-20 object-cover" />
                                                </button>
                                            ) : (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                   className="flex items-center gap-1.5 rounded border px-3 py-2 text-xs hover:bg-muted transition-colors">
                                                    File {i + 1}
                                                </a>
                                            )
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Admin actions */}
                            <div className="border-t pt-4 space-y-3">
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Status</label>
                                    <select
                                        value={editStatus}
                                        onChange={(e) => setEditStatus(e.target.value)}
                                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="under_review">Under Review</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="dismissed">Dismissed</option>
                                    </select>
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Admin Notes (internal)</label>
                                    <textarea
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                        placeholder="Internal notes visible only to admins…"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Resolution (sent to reporter)</label>
                                    <textarea
                                        value={editResolution}
                                        onChange={(e) => setEditResolution(e.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                        placeholder="Explain the outcome to the reporter…"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                        <Button onClick={saveUpdate} disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setLightbox(null)}
                >
                    <img src={lightbox} alt="Evidence" className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
                </div>
            )}
        </AppLayout>
    );
}
