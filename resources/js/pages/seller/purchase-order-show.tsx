import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Ban, CheckCircle2, Clock, Download, FileText, PackageCheck, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { CatalogProduct, PoAbilities } from './purchase-orders';

type Item = {
    id: number; product_id: number; name: string | null; is_lpg: boolean; quantity_ordered: number; quantity_received: number; remaining: number;
    unit_cost: number; line_total: number; empties_sent: number; empties_in_stock: number; reorder: string | null;
};
type Po = {
    id: number; po_number: string; status: string; status_label: string; source: 'manual' | 'auto'; notes: string | null; subtotal: number;
    expected_on: string | null; created_at: string; sent_at: string | null; received_at: string | null; created_by: string | null; sent_by: string | null;
    any_received: boolean; supplier: { id: number; name: string; email: string | null; phone: string | null; lead_time_days: number }; items: Item[];
};
type ReceiveRow = { quantity: string; requalification_due_on: string; manufactured_on: string; batch_code: string; empties_sent: string };

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

/** J7 — one purchase order: lines, totals, timeline; Send / Receive / Cancel / PDF. */
export default function PurchaseOrderShow({ po, catalog, can }: { po: Po; catalog: CatalogProduct[]; can: PoAbilities }) {
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

    const lines = isDraft
        ? [...new Map([...po.items.map((i) => [i.product_id, i.name ?? '']), ...catalog.map((c) => [c.product_id, c.name])] as [number, string][]).entries()]
        : [];
    const saveDraft = () => router.put(`/seller/purchase-orders/${po.id}`, {
        lines: lines.map(([pid]) => ({ product_id: pid, quantity: Number(qty[pid]) || 0, unit_cost: Number(cost[pid]) || 0 })), notes, expected_on: po.expected_on,
    }, { preserveScroll: true });
    const openReceive = () => {
        setErrors({});
        setRows(Object.fromEntries(po.items.map((i) => [i.id, { quantity: String(i.remaining), requalification_due_on: '', manufactured_on: '', batch_code: '', empties_sent: '' }])));
        setReceiving(true);
    };
    const receive = () => {
        setBusy(true);
        router.post(`/seller/purchase-orders/${po.id}/receive`, { rows }, {
            preserveScroll: true, onSuccess: () => setReceiving(false), onError: (e) => setErrors(e), onFinish: () => setBusy(false),
        });
    };
    const setRow = (id: number, k: keyof ReceiveRow, v: string) => setRows((m) => ({ ...m, [id]: { ...m[id], [k]: v } }));

    const timeline = [
        { done: true, label: `Created${po.created_by ? ` by ${po.created_by}` : ''}`, at: po.created_at },
        { done: !!po.sent_at, label: `Sent${po.sent_by ? ` by ${po.sent_by}` : ''}`, at: po.sent_at },
        { done: po.any_received, label: 'Receiving', at: null },
        { done: po.status === 'received', label: 'Received', at: po.received_at },
    ];

    return (
        <AppLayout breadcrumbs={[{ title: 'Purchase Orders', href: '/seller/purchase-orders' }, { title: po.po_number, href: `/seller/purchase-orders/${po.id}` }]}>
            <Head title={po.po_number} />
            <div className="space-y-5 p-4 sm:p-6">
                <Link href="/seller/purchase-orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Purchase orders</Link>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold">
                            {po.po_number}
                            {po.source === 'auto' && <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-700"><Sparkles className="h-3 w-3" /> Auto-reorder draft</span>}
                        </h1>
                        <p className="text-sm text-muted-foreground">{po.supplier.name}{po.supplier.email ? ` · ${po.supplier.email}` : ' · no email'} · lead time {po.supplier.lead_time_days} day(s)</p>
                    </div>
                    <div className="flex flex-wrap gap-2" data-testid="po-actions">
                        <a href={`/seller/purchase-orders/${po.id}/pdf?download=1`} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"><Download className="h-4 w-4" /> Download PDF</a>
                        {isDraft && can.send && (
                            <Button className="gap-1 bg-blue-600 text-white hover:bg-blue-700" onClick={() => router.post(`/seller/purchase-orders/${po.id}/send`, {}, { preserveScroll: true })}>
                                <Send className="h-4 w-4" /> {po.supplier.email ? 'Send by email' : 'Mark as sent'}
                            </Button>
                        )}
                        {['sent', 'partially_received'].includes(po.status) && can.receive && (
                            <Button className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={openReceive}><PackageCheck className="h-4 w-4" /> Receive</Button>
                        )}
                        {!po.any_received && !['received', 'cancelled'].includes(po.status) && can.send && (
                            <Button variant="outline" className="gap-1 text-red-600" onClick={() => { if (confirm(`Cancel ${po.po_number}?`)) router.post(`/seller/purchase-orders/${po.id}/cancel`, {}, { preserveScroll: true }); }}>
                                <Ban className="h-4 w-4" /> Cancel
                            </Button>
                        )}
                    </div>
                </div>

                {isDraft && !can.send && (
                    <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="po-awaiting-approval">
                        <Clock className="h-4 w-4" /> Waiting for owner/manager approval — someone who can send purchase orders will review and send it.
                    </p>
                )}

                {/* Timeline */}
                <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {po.status === 'cancelled'
                        ? <li className="flex items-center gap-1.5 text-red-600"><Ban className="h-4 w-4" /> Cancelled</li>
                        : timeline.map((t) => (
                            <li key={t.label} className={`flex items-center gap-1.5 ${t.done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
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
                                {isDraft && can.create ? lines.map(([pid, name]) => (
                                    <tr key={pid}>
                                        <td className="px-4 py-2">{name}<span className="block text-[11px] text-muted-foreground">{po.items.find((i) => i.product_id === pid)?.reorder}</span></td>
                                        <td className="px-4 py-2"><Input aria-label={`Quantity of ${name}`} type="number" min="0" className="ml-auto h-8 w-20 text-right" value={qty[pid] ?? ''} onChange={(e) => setQty((m) => ({ ...m, [pid]: e.target.value }))} /></td>
                                        <td className="px-4 py-2 text-right">—</td>
                                        <td className="px-4 py-2"><Input aria-label={`Unit cost of ${name}`} type="number" min="0" step="0.01" className="ml-auto h-8 w-24 text-right" value={cost[pid] ?? ''} onChange={(e) => setCost((m) => ({ ...m, [pid]: e.target.value }))} /></td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso((Number(qty[pid]) || 0) * (Number(cost[pid]) || 0))}</td>
                                    </tr>
                                )) : po.items.map((i) => (
                                    <tr key={i.id}>
                                        <td className="px-4 py-2">{i.name}{i.empties_sent > 0 && <span className="block text-[11px] text-muted-foreground">{i.empties_sent} empties handed over</span>}</td>
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
            </div>

            {/* Receive — one row per line; LPG needs the requalification date of the batch */}
            <Dialog open={receiving} onOpenChange={setReceiving}>
                <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>Receive {po.po_number}</DialogTitle></DialogHeader>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4" data-testid="receive-body">
                        {po.items.filter((i) => i.remaining > 0 || i.is_lpg).map((i) => (
                            <div key={i.id} className="space-y-2 rounded-lg border p-3">
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
                                            <Input type="date" value={rows[i.id]?.manufactured_on ?? ''} onChange={(e) => setRow(i.id, 'manufactured_on', e.target.value)} />
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
                        {errors.rows && <p className="text-sm text-red-600">{errors.rows}</p>}
                        {errors.status && <p className="text-sm text-red-600">{errors.status}</p>}
                    </div>
                    <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                        <Button variant="outline" onClick={() => setReceiving(false)}>Cancel</Button>
                        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy} onClick={receive}>{busy ? 'Saving…' : 'Save received stock'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
