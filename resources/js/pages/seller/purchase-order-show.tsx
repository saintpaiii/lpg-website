import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, Clock, Download, FileText, PackageCheck, Send, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { PaymentBadge, type CatalogProduct, type PaymentInfo, type PoAbilities } from './purchase-orders';

type Item = {
    id: number; product_id: number; name: string | null; is_lpg: boolean; quantity_ordered: number; quantity_received: number; remaining: number;
    min_order_qty: number; unit_cost: number; line_total: number; empties_sent: number; empties_in_stock: number; reorder: string | null;
};
type Payment = { id: number; amount: number; paid_on: string; method: string; method_label: string; reference: string | null; note: string | null; is_credit: boolean; recorded_by: string | null };
type Po = PaymentInfo & {
    id: number; po_number: string; status: string; status_label: string; source: 'manual' | 'auto'; notes: string | null; subtotal: number;
    expected_on: string | null; created_at: string; sent_at: string | null; received_at: string | null; created_by: string | null; sent_by: string | null;
    any_received: boolean; supplier: { id: number; name: string; email: string | null; phone: string | null; lead_time_days: number }; items: Item[];
    payment_terms: string | null; payments: Payment[]; below_minimum: string[];
};
type ReceiveRow = { quantity: string; requalification_due_on: string; manufactured_on: string; batch_code: string; empties_sent: string };

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const firstError = (e: Record<string, string>) => Object.values(e)[0];

/** J7 — one purchase order: lines, totals, timeline; Send / Receive / Cancel / PDF. K6: supplier payments. */
export default function PurchaseOrderShow({ po, catalog, can, methods }: { po: Po; catalog: CatalogProduct[]; can: PoAbilities; methods: Record<string, string> }) {
    const isDraft = po.status === 'draft';
    const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries([
        ...catalog.map((c) => [c.product_id, '']), ...po.items.map((i) => [i.product_id, String(i.quantity_ordered)]),
    ]));
    const [cost, setCost] = useState<Record<number, string>>(() => Object.fromEntries([
        ...catalog.map((c) => [c.product_id, String(c.unit_cost)]), ...po.items.map((i) => [i.product_id, String(i.unit_cost)]),
    ]));
    const [notes, setNotes] = useState(po.notes ?? '');
    const [receiving, setReceiving] = useState(false);
    const [rows, setRows] = useState<Record<number, ReceiveRow>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [paying, setPaying] = useState(false);
    const [pay, setPay] = useState({ amount: '', paid_on: today(), method: 'bank_transfer', reference: '', note: '' });
    const [payErrors, setPayErrors] = useState<Record<string, string>>({});
    const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
    const [due, setDue] = useState(po.payment_due_on ?? '');

    // K6: only lines with something left to receive (a fully received LPG line has nothing to enter)
    const openItems = po.items.filter((i) => i.remaining > 0);
    const minOf = (pid: number) => po.items.find((i) => i.product_id === pid)?.min_order_qty ?? catalog.find((c) => c.product_id === pid)?.min_order_qty ?? 1;

    const lines = isDraft
        ? [...new Map([...po.items.map((i) => [i.product_id, i.name ?? '']), ...catalog.map((c) => [c.product_id, c.name])] as [number, string][]).entries()]
        : [];
    const saveDraft = () => router.put(`/seller/purchase-orders/${po.id}`, {
        lines: lines.map(([pid]) => ({ product_id: pid, quantity: Number(qty[pid]) || 0, unit_cost: Number(cost[pid]) || 0 })), notes, expected_on: po.expected_on,
    }, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });
    const send = () => router.post(`/seller/purchase-orders/${po.id}/send`, {}, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });
    const cancel = () => router.post(`/seller/purchase-orders/${po.id}/cancel`, {}, {
        preserveScroll: true, onError: (e) => toast.error(firstError(e)), onFinish: () => setCancelOpen(false),
    });
    const openReceive = () => {
        setErrors({});
        setRows(Object.fromEntries(openItems.map((i) => [i.id, { quantity: String(i.remaining), requalification_due_on: '', manufactured_on: '', batch_code: '', empties_sent: '' }])));
        setReceiving(true);
    };
    const receive = () => {
        setBusy(true);
        router.post(`/seller/purchase-orders/${po.id}/receive`, { rows }, {
            preserveScroll: true, onSuccess: () => setReceiving(false), onError: (e) => setErrors(e), onFinish: () => setBusy(false),
        });
    };
    const setRow = (id: number, k: keyof ReceiveRow, v: string) => setRows((m) => ({ ...m, [id]: { ...m[id], [k]: v } }));

    const openPay = () => {
        setPayErrors({});
        setPay({ amount: po.balance.toFixed(2), paid_on: today(), method: 'bank_transfer', reference: '', note: '' });
        setPaying(true);
    };
    const recordPayment = () => {
        setBusy(true);
        router.post(`/seller/purchase-orders/${po.id}/payments`, pay, {
            preserveScroll: true, onSuccess: () => setPaying(false), onError: (e) => setPayErrors(e), onFinish: () => setBusy(false),
        });
    };
    const deletePayment = () => {
        if (!deleteTarget) return;
        router.delete(`/seller/purchase-orders/${po.id}/payments/${deleteTarget.id}`, { preserveScroll: true, onFinish: () => setDeleteTarget(null) });
    };
    const saveDue = () => router.patch(`/seller/purchase-orders/${po.id}/due-date`, { payment_due_on: due || null }, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });

    const timeline = [
        { done: true, label: `Created${po.created_by ? ` by ${po.created_by}` : ''}`, at: po.created_at },
        { done: !!po.sent_at, label: `Sent${po.sent_by ? ` by ${po.sent_by}` : ''}`, at: po.sent_at },
        { done: po.any_received, label: 'Receiving', at: null },
        { done: po.status === 'received', label: 'Received', at: po.received_at },
    ];
    const showPayments = !['draft', 'cancelled'].includes(po.status);

    return (
        <AppLayout breadcrumbs={[{ title: 'Purchase Orders', href: '/seller/purchase-orders' }, { title: po.po_number, href: `/seller/purchase-orders/${po.id}` }]}>
            <Head title={po.po_number} />
            <div className="space-y-5 p-4 sm:p-6">
                <Link href="/seller/purchase-orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Purchase orders</Link>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                            {po.po_number}
                            {po.source === 'auto' && <span className="inline-flex items-center gap-1 rounded bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300"><Sparkles className="h-3 w-3" /> Auto-reorder draft</span>}
                        </h1>
                        <p className="text-sm break-words text-muted-foreground">{po.supplier.name}{po.supplier.email ? ` · ${po.supplier.email}` : ' · no email'} · lead time {po.supplier.lead_time_days} day(s)</p>
                    </div>
                    <div className="flex flex-wrap gap-2" data-testid="po-actions">
                        <a href={`/seller/purchase-orders/${po.id}/pdf?download=1`} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"><Download className="h-4 w-4" /> Download PDF</a>
                        {isDraft && can.send && (
                            <Button className="gap-1 bg-blue-600 text-white hover:bg-blue-700" onClick={send}>
                                <Send className="h-4 w-4" /> {po.supplier.email ? 'Send by email' : 'Mark as sent'}
                            </Button>
                        )}
                        {['sent', 'partially_received'].includes(po.status) && can.receive && (
                            <Button className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={openReceive}><PackageCheck className="h-4 w-4" /> Receive</Button>
                        )}
                        {!po.any_received && !['received', 'cancelled'].includes(po.status) && can.send && (
                            <Button variant="outline" className="gap-1 text-red-600" onClick={() => setCancelOpen(true)}>
                                <Ban className="h-4 w-4" /> Cancel
                            </Button>
                        )}
                    </div>
                </div>

                {isDraft && !can.send && (
                    <p className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-300" data-testid="po-awaiting-approval">
                        <Clock className="h-4 w-4 shrink-0" /> Waiting for owner/manager approval — someone who can send purchase orders will review and send it.
                    </p>
                )}
                {/* K6: the supplier's minimum order — a draft may be below it, but it can't be sent */}
                {isDraft && po.below_minimum.length > 0 && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-300" data-testid="po-below-minimum">
                        <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" /> Below the supplier's minimum order — raise the quantity before sending:</p>
                        <ul className="mt-1 list-disc pl-9">{po.below_minimum.map((m) => <li key={m}>{m}</li>)}</ul>
                    </div>
                )}

                {/* Timeline */}
                <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {po.status === 'cancelled'
                        ? <li className="flex items-center gap-1.5 text-red-600"><Ban className="h-4 w-4" /> Cancelled</li>
                        : timeline.map((t) => (
                            <li key={t.label} className={`flex items-center gap-1.5 ${t.done ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                                {t.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />} {t.label}{t.at && <span className="text-xs text-muted-foreground">· {t.at}</span>}
                            </li>
                        ))}
                    {po.expected_on && <li className="text-muted-foreground">Expected {po.expected_on}</li>}
                </ol>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Lines</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                        <table className="w-full text-sm">
                            <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Received</th><th className="px-4 py-2 text-right">Unit cost</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
                            <tbody className="divide-y">
                                {isDraft && can.create ? lines.map(([pid, name]) => {
                                    const q = Number(qty[pid]) || 0;
                                    const min = minOf(pid);
                                    return (
                                        <tr key={pid}>
                                            <td className="px-4 py-2">
                                                {name}<span className="block text-xs text-muted-foreground">{po.items.find((i) => i.product_id === pid)?.reorder}</span>
                                                {q > 0 && q < min && <span className="mt-1 inline-block rounded bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300" data-testid="line-min-warning">Minimum order from this supplier is {min}</span>}
                                            </td>
                                            <td className="px-4 py-2"><Input aria-label={`Quantity of ${name}`} type="number" min="0" className="ml-auto h-8 w-20 text-right" value={qty[pid] ?? ''} onChange={(e) => setQty((m) => ({ ...m, [pid]: e.target.value }))} /></td>
                                            <td className="px-4 py-2 text-right">—</td>
                                            <td className="px-4 py-2"><Input aria-label={`Unit cost of ${name}`} type="number" min="0" step="0.01" className="ml-auto h-8 w-24 text-right" value={cost[pid] ?? ''} onChange={(e) => setCost((m) => ({ ...m, [pid]: e.target.value }))} /></td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(q * (Number(cost[pid]) || 0))}</td>
                                        </tr>
                                    );
                                }) : po.items.map((i) => (
                                    <tr key={i.id}>
                                        <td className="px-4 py-2">
                                            {i.name}{i.empties_sent > 0 && <span className="block text-xs text-muted-foreground">{i.empties_sent} empties handed over</span>}
                                            {isDraft && i.quantity_ordered < i.min_order_qty && <span className="mt-1 inline-block rounded bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300">Minimum order from this supplier is {i.min_order_qty}</span>}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">{i.quantity_ordered}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{i.quantity_received}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(i.unit_cost)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(i.line_total)}</td>
                                    </tr>
                                ))}
                                <tr className="font-semibold"><td colSpan={4} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right tabular-nums">{peso(po.subtotal)}</td></tr>
                            </tbody>
                        </table>
                        {isDraft && can.create && (
                            <div className="space-y-2 border-t p-4">
                                <textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for the supplier (optional)"
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                <Button size="sm" variant="outline" onClick={saveDraft}>Save draft</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
                {!isDraft && po.notes && <p className="text-sm text-muted-foreground">Notes: {po.notes}</p>}

                {/* K6: supplier payment — owed = what was RECEIVED (you pay for what arrived) */}
                {showPayments && (
                    <Card data-testid="po-payment">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex flex-wrap items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Payment to supplier <PaymentBadge p={po} /></CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm tabular-nums" data-testid="po-payment-summary">
                                Ordered {peso(po.subtotal)} · Received {peso(po.received_value)} · Paid {peso(po.amount_paid)} · <strong>Balance {peso(po.balance)}</strong>
                            </p>
                            <div className="flex flex-wrap items-end gap-3 text-sm">
                                <span className="text-muted-foreground">Payment terms: {po.payment_terms || '—'}</span>
                                {can.pay ? (
                                    <label className="flex items-center gap-2">
                                        <span className={po.overdue ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground'}>Due</span>
                                        <Input type="date" aria-label="Payment due date" className="h-8 w-40" value={due} onChange={(e) => setDue(e.target.value)} />
                                        {due !== (po.payment_due_on ?? '') && <Button size="sm" variant="outline" onClick={saveDue}>Save</Button>}
                                    </label>
                                ) : (
                                    <span className={po.overdue ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground'}>Due: {po.payment_due_label ?? '—'}</span>
                                )}
                                {can.pay && po.balance > 0 && (
                                    <Button size="sm" className="ml-auto gap-1 bg-blue-600 text-white hover:bg-blue-700" onClick={openPay}><Wallet className="h-4 w-4" /> Record payment</Button>
                                )}
                            </div>
                            {!po.payable && <p className="text-sm text-muted-foreground">Nothing received yet — the balance starts when stock arrives.</p>}
                            {po.payments.length > 0 && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Method</th><th className="py-1.5 pr-3">Reference / note</th><th className="py-1.5 pr-3 text-right">Amount</th><th /></tr></thead>
                                        <tbody className="divide-y">
                                            {po.payments.map((p) => (
                                                <tr key={p.id}>
                                                    <td className="py-1.5 pr-3 whitespace-nowrap">{p.paid_on}</td>
                                                    <td className="py-1.5 pr-3">{p.is_credit ? 'Return credit' : p.method_label}</td>
                                                    <td className="py-1.5 pr-3 text-muted-foreground">{[p.reference, p.note].filter(Boolean).join(' · ') || '—'}{p.recorded_by && <span className="block text-xs">by {p.recorded_by}</span>}</td>
                                                    <td className="py-1.5 pr-3 text-right tabular-nums">{peso(p.amount)}</td>
                                                    <td className="py-1.5 text-right">
                                                        {can.owner && (
                                                            <button type="button" aria-label={`Delete payment of ${peso(p.amount)}`} onClick={() => setDeleteTarget(p)} className="rounded p-1 text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Receive — one row per line still expected; LPG needs the requalification date of the batch */}
            <Dialog open={receiving} onOpenChange={setReceiving}>
                <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>Receive {po.po_number}</DialogTitle></DialogHeader>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4" data-testid="receive-body">
                        {openItems.map((i) => (
                            <div key={i.id} className="space-y-2 rounded-lg border p-3" data-testid="receive-line">
                                <p className="text-sm font-semibold">{i.name} <span className="font-normal text-muted-foreground">· {i.remaining} left to receive</span></p>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <label className="grid gap-1 text-xs">Qty received now
                                        <Input type="number" min="0" max={i.remaining} value={rows[i.id]?.quantity ?? ''} onChange={(e) => setRow(i.id, 'quantity', e.target.value)} />
                                    </label>
                                    {i.is_lpg && <>
                                        <label className="grid gap-1 text-xs">Requalification date *
                                            <Input type="date" value={rows[i.id]?.requalification_due_on ?? ''} onChange={(e) => setRow(i.id, 'requalification_due_on', e.target.value)} />
                                        </label>
                                        <label className="grid gap-1 text-xs">Manufactured (optional)
                                            <Input type="date" max={today()} value={rows[i.id]?.manufactured_on ?? ''} onChange={(e) => setRow(i.id, 'manufactured_on', e.target.value)} />
                                        </label>
                                        <label className="grid gap-1 text-xs">Batch code (optional)
                                            <Input value={rows[i.id]?.batch_code ?? ''} placeholder="auto" onChange={(e) => setRow(i.id, 'batch_code', e.target.value)} />
                                        </label>
                                        <label className="grid gap-1 text-xs">Empties handed to supplier (have {i.empties_in_stock})
                                            <Input type="number" min="0" max={i.empties_in_stock} value={rows[i.id]?.empties_sent ?? ''} onChange={(e) => setRow(i.id, 'empties_sent', e.target.value)} />
                                        </label>
                                    </>}
                                </div>
                                {Object.entries(errors).filter(([k]) => k.startsWith(`rows.${i.id}.`)).map(([k, v]) => <p key={k} className="text-xs text-red-600">{v}</p>)}
                            </div>
                        ))}
                        {openItems.length === 0 && <p className="text-sm text-muted-foreground">Every line is fully received.</p>}
                        {errors.rows && <p className="text-sm text-red-600">{errors.rows}</p>}
                        {errors.status && <p className="text-sm text-red-600">{errors.status}</p>}
                    </div>
                    <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                        <Button variant="outline" onClick={() => setReceiving(false)}>Cancel</Button>
                        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy || openItems.length === 0} onClick={receive}>{busy ? 'Saving…' : 'Save received stock'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* K6: record a payment to the supplier */}
            <Dialog open={paying} onOpenChange={setPaying}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Record payment — {po.po_number}</DialogTitle></DialogHeader>
                    <div className="grid gap-3" data-testid="payment-form">
                        <p className="text-sm text-muted-foreground">Balance {peso(po.balance)} to {po.supplier.name}</p>
                        <label className="grid gap-1 text-sm">Amount (₱)
                            <Input type="number" min="0.01" step="0.01" max={po.balance} value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} />
                            {payErrors.amount && <span className="text-xs text-red-600">{payErrors.amount}</span>}
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-sm">Date paid
                                <Input type="date" max={today()} value={pay.paid_on} onChange={(e) => setPay((p) => ({ ...p, paid_on: e.target.value }))} />
                                {payErrors.paid_on && <span className="text-xs text-red-600">{payErrors.paid_on}</span>}
                            </label>
                            <label className="grid gap-1 text-sm">Method
                                <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                                    {Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                {payErrors.method && <span className="text-xs text-red-600">{payErrors.method}</span>}
                            </label>
                        </div>
                        <label className="grid gap-1 text-sm">Reference (check no. / transaction ref.)
                            <Input value={pay.reference} maxLength={100} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} />
                        </label>
                        <label className="grid gap-1 text-sm">Note (optional)
                            <Input value={pay.note} maxLength={500} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} />
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPaying(false)}>Cancel</Button>
                        <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy} onClick={recordPayment}>{busy ? 'Saving…' : 'Record payment'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* K6: the app's confirmation instead of the browser's confirm() */}
            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Cancel {po.po_number}?</AlertDialogTitle>
                        <AlertDialogDescription>The supplier will not be notified automatically.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={(e) => { e.preventDefault(); cancel(); }}>Cancel PO</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Delete this payment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget && `${peso(deleteTarget.amount)} on ${deleteTarget.paid_on}`} will be removed and the balance of {po.po_number} recalculated.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={(e) => { e.preventDefault(); deletePayment(); }}>Delete payment</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
