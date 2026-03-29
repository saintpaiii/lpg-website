import AppLayout from '@/layouts/app-layout';
import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowDownCircle, ChevronLeft, ChevronRight, FileDown, Percent, TrendingUp, Wallet } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@/lib/utils';

interface WalletSummary {
    balance: number;
    total_earned: number;
    total_withdrawn: number;
    total_commission: number;
}

interface Transaction {
    id: number;
    type: 'credit' | 'withdrawal';
    amount: number;
    commission: number;
    running_balance: number;
    description: string;
    created_at: string;
}

interface WithdrawalRequest {
    id: number;
    amount: number;
    payment_method: string;
    account_name: string;
    account_number: string;
    bank_name: string | null;
    reference_number: string | null;
    status: 'pending' | 'approved' | 'released' | 'received' | 'rejected';
    rejection_reason: string | null;
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

interface Props {
    wallet: WalletSummary;
    transactions: Paginated<Transaction>;
    withdrawals: WithdrawalRequest[];
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

function accountLabel(w: WithdrawalRequest): string {
    if (w.payment_method === 'bank_transfer' && w.bank_name) {
        return `${w.bank_name} · ${w.account_name}`;
    }
    return w.account_name;
}

export default function SellerWallet({ wallet, transactions, withdrawals, date_from, date_to }: Props) {
    const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
    const [confirmReceived, setConfirmReceived] = useState<WithdrawalRequest | null>(null);
    const [dateFrom, setDateFrom] = useState(date_from);
    const [dateTo,   setDateTo]   = useState(date_to);

    const availableBalance = wallet.balance;

    const { data, setData, post, processing, errors, reset } = useForm({
        amount: '',
        payment_method: '',
        account_name: '',
        account_number: '',
        bank_name: '',
        notes: '',
    });

    function submitWithdraw(e: React.FormEvent) {
        e.preventDefault();
        post('/seller/wallet/withdraw', {
            preserveScroll: true,
            preserveState: true, // keeps dialog open when validation errors are returned
            onSuccess: () => { reset(); setShowWithdrawDialog(false); },
        });
    }

    function handleMarkReceived() {
        if (!confirmReceived) return;
        router.patch(`/seller/wallet/requests/${confirmReceived.id}/received`, {}, {
            onSuccess: () => setConfirmReceived(null),
        });
    }

    function paginate(page: number) {
        router.get('/seller/wallet', { page, date_from: dateFrom, date_to: dateTo }, { preserveScroll: true, preserveState: true });
    }

    function applyDates() {
        router.get('/seller/wallet', { date_from: dateFrom, date_to: dateTo }, { preserveScroll: true, preserveState: true });
    }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/seller/wallet', { date_from: '', date_to: '' }, { preserveScroll: true, preserveState: true });
    }

    function openWithdrawDialog() {
        reset();
        setShowWithdrawDialog(true);
    }

    const method = data.payment_method;

    return (
        <AppLayout>
            <Head title="Wallet" />
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h1 className="text-2xl font-bold">Wallet</h1>
                    <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/seller/wallet/export?format=csv&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/wallet/export?format=pdf&date_from=${dateFrom}&date_to=${dateTo}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                        <Button onClick={openWithdrawDialog} disabled={availableBalance < 100}>
                            Request Withdrawal
                        </Button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle>
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{fmt(availableBalance)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Earned</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(wallet.total_earned)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Net after platform commission</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Withdrawn</CardTitle>
                            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(wallet.total_withdrawn)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Successfully released</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Platform Commission</CardTitle>
                            <Percent className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">{fmt(wallet.total_commission)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Total deducted</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Transaction History */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle>Transaction History</CardTitle>
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">From</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">To</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                                </div>
                                <Button size="sm" variant="secondary" onClick={applyDates}>Apply</Button>
                                {(dateFrom || dateTo) && <Button size="sm" variant="ghost" onClick={clearDates}>Clear</Button>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {transactions.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Date</th>
                                                <th className="pb-3 pr-4 font-medium">Type</th>
                                                <th className="pb-3 pr-4 font-medium">Description</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Amount</th>
                                                <th className="pb-3 font-medium text-right">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {transactions.data.map((t) => (
                                                <tr key={t.id}>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                                                    <td className="py-3 pr-4">
                                                        <Badge className={t.type === 'credit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                                            {t.type === 'credit' ? 'Credit' : 'Withdrawal'}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground">{t.description}</td>
                                                    <td className={`py-3 pr-4 text-right font-medium ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {t.type === 'credit' ? '+' : '−'}{fmt(t.amount)}
                                                    </td>
                                                    <td className="py-3 text-right font-medium">{fmt(t.running_balance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {transactions.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {transactions.from}–{transactions.to} of {transactions.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={transactions.current_page === 1}
                                                onClick={() => paginate(transactions.current_page - 1)}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{transactions.current_page} / {transactions.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={transactions.current_page === transactions.last_page}
                                                onClick={() => paginate(transactions.current_page + 1)}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Withdrawal History */}
                {withdrawals.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Withdrawal Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-3 pr-4 font-medium">Date</th>
                                            <th className="pb-3 pr-4 font-medium">Amount</th>
                                            <th className="pb-3 pr-4 font-medium">Method</th>
                                            <th className="pb-3 pr-4 font-medium">Account</th>
                                            <th className="pb-3 pr-4 font-medium">Status</th>
                                            <th className="pb-3 font-medium">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {withdrawals.map((w) => (
                                            <tr key={w.id}>
                                                <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(w.requested_at)}</td>
                                                <td className="py-3 pr-4 font-medium">{fmt(w.amount)}</td>
                                                <td className="py-3 pr-4 capitalize">{w.payment_method.replace('_', ' ')}</td>
                                                <td className="py-3 pr-4">
                                                    <div>{accountLabel(w)}</div>
                                                    <div className="text-muted-foreground text-xs">{w.account_number}</div>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[w.status]}`}>
                                                        {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                                                    </span>
                                                    {w.status === 'rejected' && w.rejection_reason && (
                                                        <p className="text-xs text-red-600 mt-1">{w.rejection_reason}</p>
                                                    )}
                                                    {w.status === 'released' && w.released_at && (
                                                        <p className="text-xs text-muted-foreground mt-1">Released {fmtDate(w.released_at)}</p>
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    {w.status === 'released' && (
                                                        <Button size="sm" variant="outline" onClick={() => setConfirmReceived(w)}>
                                                            Confirm Received
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Request Withdrawal Dialog */}
            <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Request Withdrawal</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitWithdraw} className="space-y-4">
                        {/* Amount */}
                        <div>
                            <Label>Amount <span className="text-muted-foreground text-xs">(min ₱100, max {fmt(availableBalance)})</span></Label>
                            <Input
                                type="number"
                                min={100}
                                max={availableBalance}
                                step="0.01"
                                value={data.amount}
                                onChange={(e) => setData('amount', e.target.value)}
                                placeholder="Enter amount"
                                className="mt-1"
                            />
                            {errors.amount && <p className="text-sm text-red-600 mt-1">{errors.amount}</p>}
                        </div>

                        {/* Payment Method */}
                        <div>
                            <Label>Payment Method</Label>
                            <Select
                                value={data.payment_method}
                                onValueChange={(v) => {
                                    setData((prev) => ({
                                        ...prev,
                                        payment_method: v,
                                        account_name: '',
                                        account_number: '',
                                        bank_name: '',
                                    }));
                                }}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gcash">GCash</SelectItem>
                                    <SelectItem value="maya">Maya</SelectItem>
                                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.payment_method && <p className="text-sm text-red-600 mt-1">{errors.payment_method}</p>}
                        </div>

                        {/* Dynamic fields — GCash */}
                        {method === 'gcash' && (
                            <>
                                <div>
                                    <Label>GCash Name</Label>
                                    <Input
                                        value={data.account_name}
                                        onChange={(e) => setData('account_name', e.target.value)}
                                        placeholder="Full name on GCash"
                                        className="mt-1"
                                    />
                                    {errors.account_name && <p className="text-sm text-red-600 mt-1">{errors.account_name}</p>}
                                </div>
                                <div>
                                    <Label>GCash Number</Label>
                                    <Input
                                        value={data.account_number}
                                        onChange={(e) => setData('account_number', e.target.value)}
                                        placeholder="09XX XXX XXXX"
                                        className="mt-1"
                                    />
                                    {errors.account_number && <p className="text-sm text-red-600 mt-1">{errors.account_number}</p>}
                                </div>
                            </>
                        )}

                        {/* Dynamic fields — Maya */}
                        {method === 'maya' && (
                            <>
                                <div>
                                    <Label>Maya Name</Label>
                                    <Input
                                        value={data.account_name}
                                        onChange={(e) => setData('account_name', e.target.value)}
                                        placeholder="Full name on Maya"
                                        className="mt-1"
                                    />
                                    {errors.account_name && <p className="text-sm text-red-600 mt-1">{errors.account_name}</p>}
                                </div>
                                <div>
                                    <Label>Maya Number</Label>
                                    <Input
                                        value={data.account_number}
                                        onChange={(e) => setData('account_number', e.target.value)}
                                        placeholder="09XX XXX XXXX"
                                        className="mt-1"
                                    />
                                    {errors.account_number && <p className="text-sm text-red-600 mt-1">{errors.account_number}</p>}
                                </div>
                            </>
                        )}

                        {/* Dynamic fields — Bank Transfer */}
                        {method === 'bank_transfer' && (
                            <>
                                <div>
                                    <Label>Bank Name</Label>
                                    <Input
                                        value={data.bank_name}
                                        onChange={(e) => setData('bank_name', e.target.value)}
                                        placeholder="e.g. BDO, BPI, UnionBank"
                                        className="mt-1"
                                    />
                                    {errors.bank_name && <p className="text-sm text-red-600 mt-1">{errors.bank_name}</p>}
                                </div>
                                <div>
                                    <Label>Account Name</Label>
                                    <Input
                                        value={data.account_name}
                                        onChange={(e) => setData('account_name', e.target.value)}
                                        placeholder="Full name on bank account"
                                        className="mt-1"
                                    />
                                    {errors.account_name && <p className="text-sm text-red-600 mt-1">{errors.account_name}</p>}
                                </div>
                                <div>
                                    <Label>Account Number</Label>
                                    <Input
                                        value={data.account_number}
                                        onChange={(e) => setData('account_number', e.target.value)}
                                        placeholder="Bank account number"
                                        className="mt-1"
                                    />
                                    {errors.account_number && <p className="text-sm text-red-600 mt-1">{errors.account_number}</p>}
                                </div>
                            </>
                        )}

                        {/* Notes */}
                        {method && (
                            <div>
                                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                                <textarea
                                    value={data.notes}
                                    onChange={(e) => setData('notes', e.target.value)}
                                    placeholder="Additional notes for admin"
                                    rows={2}
                                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                {errors.notes && <p className="text-sm text-red-600 mt-1">{errors.notes}</p>}
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowWithdrawDialog(false)}>Cancel</Button>
                            <Button type="submit" disabled={processing || !method}>Submit Request</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Confirm Received AlertDialog */}
            <AlertDialog open={!!confirmReceived} onOpenChange={(o) => !o && setConfirmReceived(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Receipt</AlertDialogTitle>
                        <AlertDialogDescription>
                            Confirm that you have received the withdrawal of{' '}
                            <strong>{confirmReceived ? fmt(confirmReceived.amount) : ''}</strong>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleMarkReceived}>Yes, I Received It</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
