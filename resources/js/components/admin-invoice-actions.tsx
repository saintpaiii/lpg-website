import { router } from '@inertiajs/react';
import { Bell, CheckCircle2, ChevronDown, Eye, FileDown, Slash } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fmtPeso, type CommissionInvoice } from '@/lib/commission';

const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** View / Mark as Paid / Waive / Send Reminder for an invoice (admin). */
export function AdminInvoiceActions({ invoice, showView = true, compact = true }: {
    invoice: CommissionInvoice;
    showView?: boolean;
    compact?: boolean;
}) {
    const [dialog, setDialog]       = useState<'paid' | 'waive' | null>(null);
    const [method, setMethod]       = useState('bank_transfer');
    const [reference, setReference] = useState('');
    const [notes, setNotes]         = useState('');
    const [busy, setBusy]           = useState(false);
    const unpaid = invoice.status === 'pending' || invoice.status === 'overdue';

    function open(d: 'paid' | 'waive') {
        setMethod('bank_transfer'); setReference(''); setNotes(''); setDialog(d);
    }

    function submit() {
        setBusy(true);
        const opts = { preserveScroll: true, onSuccess: () => setDialog(null), onFinish: () => setBusy(false) };
        if (dialog === 'paid') {
            router.patch(`/admin/commissions/${invoice.id}/mark-paid`, { payment_method: method, payment_reference: reference, notes }, opts);
        } else {
            router.patch(`/admin/commissions/${invoice.id}/waive`, { notes }, opts);
        }
    }

    function remind() {
        router.post(`/admin/commissions/${invoice.id}/remind`, {}, { preserveScroll: true });
    }

    return (
        <>
            {compact ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                            Actions <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        {showView && (
                            <DropdownMenuItem onClick={() => router.visit(`/admin/commissions/${invoice.id}`)}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> View
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                            <a href={`/admin/commissions/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                                <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
                            </a>
                        </DropdownMenuItem>
                        {unpaid && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => open('paid')}>
                                    <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-600" /> Mark as Paid
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={remind}>
                                    <Bell className="mr-2 h-3.5 w-3.5 text-amber-600" /> Send Reminder
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => open('waive')} className="text-blue-700">
                                    <Slash className="mr-2 h-3.5 w-3.5" /> Waive
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <a href={`/admin/commissions/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                        <FileDown className="h-4 w-4" /> PDF
                    </a>
                    {unpaid && (
                        <>
                            <Button size="sm" variant="outline" onClick={remind}><Bell className="mr-1 h-4 w-4" /> Send Reminder</Button>
                            <Button size="sm" variant="outline" onClick={() => open('waive')}><Slash className="mr-1 h-4 w-4" /> Waive</Button>
                            <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => open('paid')}>
                                <CheckCircle2 className="mr-1 h-4 w-4" /> Mark as Paid
                            </Button>
                        </>
                    )}
                </div>
            )}

            <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === 'paid' ? 'Mark as Paid' : 'Waive Invoice'} — {invoice.invoice_number}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">
                            {invoice.store_name} · {fmtPeso(invoice.commission_amount)} · {invoice.period_label}
                        </p>
                        {dialog === 'paid' ? (
                            <>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Payment method</label>
                                    <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                                        <option value="bank_transfer">Bank Transfer</option>
                                        <option value="gcash">GCash</option>
                                        <option value="paymongo">PayMongo</option>
                                        <option value="cash">Cash</option>
                                    </select>
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Reference number <span className="text-red-500">*</span></label>
                                    <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="e.g. bank or GCash reference" />
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs font-medium">Notes (optional)</label>
                                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
                                </div>
                            </>
                        ) : (
                            <div className="grid gap-1.5">
                                <label className="text-xs font-medium">Reason for waiving <span className="text-red-500">*</span></label>
                                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
                                <p className="text-xs text-muted-foreground">The seller will no longer owe this amount. This lifts a suspension if it was the only blocking invoice.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                        <Button
                            onClick={submit}
                            disabled={busy || (dialog === 'paid' ? !reference.trim() : !notes.trim())}
                            className={dialog === 'paid' ? 'bg-green-600 text-white hover:bg-green-700' : ''}
                        >
                            {busy ? 'Saving…' : dialog === 'paid' ? 'Confirm Payment' : 'Waive Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
