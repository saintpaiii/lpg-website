import AppLayout from '@/layouts/app-layout';
import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@/lib/utils';

interface WithdrawalRequest {
    id: number;
    store_id: number;
    store_name: string;
    owner_name: string;
    amount: number;
    payment_method: string;
    account_name: string;
    account_number: string;
    bank_name: string | null;
    reference_number: string | null;
    status: 'pending' | 'approved' | 'released' | 'received' | 'rejected';
    rejection_reason: string | null;
    notes: string | null;
    requested_at: string;
    released_at: string | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

interface Counts {
    pending: number;
    approved: number;
    released: number;
    all: number;
}

interface Props {
    requests: Paginated<WithdrawalRequest>;
    tab: string;
    counts: Counts;
    pending_total: number;
    date_from: string;
    date_to: string;
}

const fmt = (n: number) =>
    n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

const statusColors: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    released: 'bg-purple-100 text-purple-800',
    received: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
};

const TABS = [
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'released', label: 'Released / Received' },
    { key: 'all',      label: 'All' },
] as const;

export default function AdminWithdrawals({ requests, tab, counts, pending_total, date_from, date_to }: Props) {
    const [rejectTarget, setRejectTarget] = useState<WithdrawalRequest | null>(null);
    const [releaseTarget, setReleaseTarget] = useState<WithdrawalRequest | null>(null);
    const [approveTarget, setApproveTarget] = useState<WithdrawalRequest | null>(null);
    const [dateFrom, setDateFrom] = useState(date_from);
    const [dateTo,   setDateTo]   = useState(date_to);

    const rejectForm = useForm({ rejection_reason: '' });
    const releaseForm = useForm({ reference_number: '' });

    function switchTab(t: string) {
        router.get('/admin/withdrawals', { tab: t, date_from: dateFrom, date_to: dateTo }, { preserveScroll: true, preserveState: true });
    }

    function paginate(page: number) {
        router.get('/admin/withdrawals', { tab, page, date_from: dateFrom, date_to: dateTo }, { preserveScroll: true, preserveState: true });
    }

    function applyDates() {
        router.get('/admin/withdrawals', { tab, date_from: dateFrom, date_to: dateTo }, { preserveScroll: true, preserveState: true });
    }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/admin/withdrawals', { tab, date_from: '', date_to: '' }, { preserveScroll: true, preserveState: true });
    }

    function handleApprove() {
        if (!approveTarget) return;
        router.patch(`/admin/withdrawals/${approveTarget.id}/approve`, {}, {
            onSuccess: () => setApproveTarget(null),
        });
    }

    function handleReject(e: React.FormEvent) {
        e.preventDefault();
        if (!rejectTarget) return;
        rejectForm.patch(`/admin/withdrawals/${rejectTarget.id}/reject`, {
            onSuccess: () => { rejectForm.reset(); setRejectTarget(null); },
        });
    }

    function handleRelease(e: React.FormEvent) {
        e.preventDefault();
        if (!releaseTarget) return;
        releaseForm.patch(`/admin/withdrawals/${releaseTarget.id}/release`, {
            onSuccess: () => { releaseForm.reset(); setReleaseTarget(null); },
        });
    }

    const tabCount = (key: string) => {
        if (key === 'pending') return counts.pending;
        if (key === 'approved') return counts.approved;
        if (key === 'released') return counts.released;
        return counts.all;
    };

    return (
        <AppLayout>
            <Head title="Withdrawal Requests" />
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">Withdrawal Requests</h1>
                        {counts.pending > 0 && (
                            <div className="text-sm text-muted-foreground">
                                Pending total: <span className="font-semibold text-foreground">{fmt(pending_total)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/admin/withdrawals/export?format=csv&tab=${tab}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/admin/withdrawals/export?format=pdf&tab=${tab}&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => switchTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                tab === key
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {label}
                            {tabCount(key) > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                    {tabCount(key)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Date filter */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">From</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">To</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <Button size="sm" variant="secondary" onClick={applyDates}>Apply</Button>
                    {(dateFrom || dateTo) && <Button size="sm" variant="ghost" onClick={clearDates}>Clear</Button>}
                </div>

                <Card>
                    <CardContent className="pt-4">
                        {requests.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">No withdrawal requests found.</p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Store / Owner</th>
                                                <th className="pb-3 pr-4 font-medium">Amount</th>
                                                <th className="pb-3 pr-4 font-medium">Method</th>
                                                <th className="pb-3 pr-4 font-medium">Account</th>
                                                <th className="pb-3 pr-4 font-medium">Requested</th>
                                                <th className="pb-3 pr-4 font-medium">Status</th>
                                                <th className="pb-3 font-medium">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {requests.data.map((w) => (
                                                <tr key={w.id}>
                                                    <td className="py-3 pr-4">
                                                        <div className="font-medium">{w.store_name}</div>
                                                        <div className="text-muted-foreground text-xs">{w.owner_name}</div>
                                                        {w.notes && (
                                                            <div className="text-muted-foreground text-xs mt-0.5 italic">"{w.notes}"</div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4 font-semibold">{fmt(w.amount)}</td>
                                                    <td className="py-3 pr-4 capitalize">{w.payment_method.replace('_', ' ')}</td>
                                                    <td className="py-3 pr-4">
                                                        {w.bank_name && <div className="text-xs font-medium text-blue-700">{w.bank_name}</div>}
                                                        <div>{w.account_name}</div>
                                                        <div className="text-muted-foreground text-xs">{w.account_number}</div>
                                                        {w.reference_number && (
                                                            <div className="text-xs text-blue-600 mt-0.5">Ref: {w.reference_number}</div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{fmtDateTime(w.requested_at)}</td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[w.status]}`}>
                                                            {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                                                        </span>
                                                        {w.status === 'rejected' && w.rejection_reason && (
                                                            <p className="text-xs text-red-600 mt-1">{w.rejection_reason}</p>
                                                        )}
                                                        {w.released_at && (
                                                            <p className="text-xs text-muted-foreground mt-1">Released {fmtDate(w.released_at)}</p>
                                                        )}
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex flex-col gap-1">
                                                            {w.status === 'pending' && (
                                                                <>
                                                                    <Button size="sm" onClick={() => setApproveTarget(w)}>Approve</Button>
                                                                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(w)}>Reject</Button>
                                                                </>
                                                            )}
                                                            {w.status === 'approved' && (
                                                                <>
                                                                    <Button size="sm" variant="outline" onClick={() => setReleaseTarget(w)}>Mark Released</Button>
                                                                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(w)}>Reject</Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {requests.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {requests.from}–{requests.to} of {requests.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={requests.current_page === 1}
                                                onClick={() => paginate(requests.current_page - 1)}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{requests.current_page} / {requests.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={requests.current_page === requests.last_page}
                                                onClick={() => paginate(requests.current_page + 1)}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Approve AlertDialog */}
            <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve Withdrawal</AlertDialogTitle>
                        <AlertDialogDescription>
                            Approve the withdrawal of <strong>{approveTarget ? fmt(approveTarget.amount) : ''}</strong> for{' '}
                            <strong>{approveTarget?.store_name}</strong>? The amount will be deducted from their wallet when you mark it as released.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reject Dialog */}
            <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Withdrawal</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleReject} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Rejecting withdrawal of <strong>{rejectTarget ? fmt(rejectTarget.amount) : ''}</strong> for{' '}
                            <strong>{rejectTarget?.store_name}</strong>.
                        </p>
                        <div>
                            <Label>Reason for Rejection</Label>
                            <textarea
                                value={rejectForm.data.rejection_reason}
                                onChange={(e) => rejectForm.setData('rejection_reason', e.target.value)}
                                rows={3}
                                placeholder="Explain why this request is being rejected..."
                                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            {rejectForm.errors.rejection_reason && (
                                <p className="text-sm text-red-600 mt-1">{rejectForm.errors.rejection_reason}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
                            <Button type="submit" variant="destructive" disabled={rejectForm.processing}>Reject</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Mark Released Dialog */}
            <Dialog open={!!releaseTarget} onOpenChange={(o) => !o && setReleaseTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark as Released</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleRelease} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Enter the reference number for the payment of{' '}
                            <strong>{releaseTarget ? fmt(releaseTarget.amount) : ''}</strong> to{' '}
                            <strong>{releaseTarget?.store_name}</strong> via{' '}
                            <span className="capitalize">{releaseTarget?.payment_method.replace('_', ' ')}</span>.
                        </p>
                        <div className="text-sm bg-muted rounded p-3 space-y-0.5">
                            {releaseTarget?.bank_name && <div><span className="text-muted-foreground">Bank:</span> {releaseTarget.bank_name}</div>}
                            <div><span className="text-muted-foreground">Account Name:</span> {releaseTarget?.account_name}</div>
                            <div><span className="text-muted-foreground">Account No.:</span> {releaseTarget?.account_number}</div>
                        </div>
                        <div>
                            <Label>Reference Number</Label>
                            <Input
                                value={releaseForm.data.reference_number}
                                onChange={(e) => releaseForm.setData('reference_number', e.target.value)}
                                placeholder="Transaction / reference number"
                                className="mt-1"
                            />
                            {releaseForm.errors.reference_number && (
                                <p className="text-sm text-red-600 mt-1">{releaseForm.errors.reference_number}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setReleaseTarget(null)}>Cancel</Button>
                            <Button type="submit" disabled={releaseForm.processing}>Confirm Release</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
