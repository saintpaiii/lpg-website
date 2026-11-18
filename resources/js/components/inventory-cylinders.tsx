import { router } from '@inertiajs/react';
import { AlertTriangle, ArrowUpDown, FileText, PackageX, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type Batch = {
    id: number; batch_code: string; remaining: number; received: number; requalification_due_on: string | null; manufactured_on: string | null;
    received_on: string | null; days_left: number | null; expired: boolean; supplier: string | null; source: string;
};
export type Incident = {
    id: number; product_id: number; product: string | null; quantity: number; reason: string; status: string; batch: string | null;
    supplier_id: number | null; supplier: string | null; was_empty: boolean; note: string | null; return_number: string | null; photo_url: string | null; created_at: string;
};
export type ReturnRow = { id: number; return_number: string; status: string; supplier: string | null; quantity: number; credited_amount: number | null; created_at: string };

/** "Batches" drawer: remaining qty + dates, sortable; expired batches get "Mark as expired". */
export function BatchesDialog({ open, onClose, productName, batches }: { open: boolean; onClose: () => void; productName: string; batches: Batch[] }) {
    const [sort, setSort] = useState<'requalification_due_on' | 'remaining' | 'received_on'>('requalification_due_on');
    const [dir, setDir] = useState<1 | -1>(1);
    const rows = useMemo(() => [...batches].sort((a, b) => {
        const x = a[sort] ?? '', y = b[sort] ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
    }), [batches, sort, dir]);
    const th = (key: typeof sort, label: string) => (
        <th className="px-3 py-2 text-left">
            <button type="button" className="inline-flex items-center gap-1" onClick={() => { if (sort === key) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setDir(1); } }}>
                {label} <ArrowUpDown className="h-3 w-3" />
            </button>
        </th>
    );
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 p-0">
                <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>Batches — {productName}</DialogTitle></DialogHeader>
                <div className="min-h-0 flex-1 overflow-auto" data-testid="batches-drawer">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground"><tr className="border-b">
                            <th className="px-3 py-2 text-left">Batch</th>{th('remaining', 'Left')}{th('requalification_due_on', 'Requalification')}{th('received_on', 'Received')}
                            <th className="px-3 py-2 text-left">Supplier</th><th className="px-3 py-2" />
                        </tr></thead>
                        <tbody className="divide-y">
                            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No batches with stock. Older stock (before batches) still sells.</td></tr>}
                            {rows.map((b) => (
                                <tr key={b.id} className={b.expired ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                                    <td className="px-3 py-2 font-mono text-xs">{b.batch_code}<span className="block text-[10px] text-muted-foreground">{b.source}</span></td>
                                    <td className="px-3 py-2 tabular-nums">{b.remaining}/{b.received}</td>
                                    <td className="px-3 py-2">{b.requalification_due_on ?? '—'}
                                        {b.days_left !== null && <span className={`ml-1 text-xs ${b.expired ? 'font-semibold text-red-600' : b.days_left <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                            {b.expired ? 'expired' : `in ${b.days_left} d`}</span>}
                                    </td>
                                    <td className="px-3 py-2">{b.received_on ?? '—'}</td>
                                    <td className="px-3 py-2">{b.supplier ?? '—'}</td>
                                    <td className="px-3 py-2 text-right">
                                        {b.expired && (
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600"
                                                onClick={() => { if (confirm(`Mark the ${b.remaining} cylinder(s) of batch ${b.batch_code} as expired? They are held aside (not sellable).`)) router.post(`/seller/inventory/batches/${b.id}/expire`, {}, { preserveScroll: true }); }}>
                                                Mark as expired
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** "Record damaged / expired": qty, reason, batch (default the oldest), note, photo (camera or file), empty or filled. */
export function DamagedDialog({ open, onClose, product, batches, reasons }: {
    open: boolean; onClose: () => void; product: { id: number; name: string } | null; batches: Batch[]; reasons: Record<string, string>;
}) {
    const [form, setForm] = useState({ quantity: '1', reason: 'leaking', cylinder_batch_id: '', note: '', was_empty: false });
    const [photo, setPhoto] = useState<File | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    if (!product) return null;
    const save = () => {
        setBusy(true);
        router.post(`/seller/inventory/${product.id}/damaged`, { ...form, was_empty: form.was_empty ? 1 : 0, photo }, {
            forceFormData: true, preserveScroll: true,
            onSuccess: () => { onClose(); setForm({ quantity: '1', reason: 'leaking', cylinder_batch_id: '', note: '', was_empty: false }); setPhoto(null); },
            onError: (e) => setErrors(e), onFinish: () => setBusy(false),
        });
    };
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="flex max-h-[90dvh] max-w-md flex-col gap-0 p-0">
                <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle className="flex items-center gap-2"><PackageX className="h-4 w-4 text-red-600" /> Damaged / expired — {product.name}</DialogTitle></DialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4" data-testid="damaged-form">
                    <label className="grid gap-1 text-sm">Quantity<Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></label>
                    {errors.quantity && <p className="text-xs text-red-600">{errors.quantity}</p>}
                    <label className="grid gap-1 text-sm">Reason
                        <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2">
                            {Object.entries(reasons).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.was_empty} onChange={(e) => setForm((f) => ({ ...f, was_empty: e.target.checked }))} /> This was an EMPTY cylinder</label>
                    {!form.was_empty && batches.length > 0 && (
                        <label className="grid gap-1 text-sm">Batch
                            <select value={form.cylinder_batch_id} onChange={(e) => setForm((f) => ({ ...f, cylinder_batch_id: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2">
                                <option value="">Oldest batch (default)</option>
                                {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_code} · {b.remaining} left · requal. {b.requalification_due_on ?? '—'}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="grid gap-1 text-sm">Note<Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional" /></label>
                    <label className="grid gap-1 text-sm">Photo (optional)
                        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-xs" />
                    </label>
                    <p className="text-xs text-muted-foreground">They are held aside (not sellable) until you return them to the supplier or dispose of them.</p>
                </div>
                <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button className="bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Record'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Held damaged / expired cylinders → "Return to supplier" (grouped per supplier) or "Dispose". */
export function HeldCylindersCard({ incidents, suppliers }: { incidents: Incident[]; suppliers: { id: number; name: string }[] }) {
    const [picked, setPicked] = useState<number[]>([]);
    const [supplierId, setSupplierId] = useState('');
    const [returning, setReturning] = useState(false);
    const held = incidents.filter((i) => i.status === 'held');
    if (incidents.length === 0) return null;
    // Default supplier = the batch's supplier of the first ticked cylinder
    const choose = (ids: number[]) => {
        setReturning(true);
        const first = held.find((i) => ids.includes(i.id) && i.supplier_id);
        setSupplierId(first?.supplier_id ? String(first.supplier_id) : suppliers[0] ? String(suppliers[0].id) : '');
    };
    return (
        <Card data-testid="held-cylinders">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-red-600" /> Damaged / expired cylinders</CardTitle></CardHeader>
            <CardContent className="space-y-3 overflow-x-auto p-0">
                <table className="w-full text-sm">
                    <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2" /><th className="px-4 py-2">Cylinder</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Batch / supplier</th><th className="px-4 py-2">Status</th><th /></tr></thead>
                    <tbody className="divide-y">
                        {incidents.map((i) => (
                            <tr key={i.id}>
                                <td className="px-4 py-2">{i.status === 'held' && <input type="checkbox" aria-label={`Select ${i.product}`} checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />}</td>
                                <td className="px-4 py-2">{i.product}{i.was_empty && <span className="ml-1 text-xs text-muted-foreground">(empty)</span>}<span className="block text-[11px] text-muted-foreground">{i.created_at}{i.note ? ` · ${i.note}` : ''}</span></td>
                                <td className="px-4 py-2 text-right tabular-nums">{i.quantity}</td>
                                <td className="px-4 py-2">{i.reason}{i.photo_url && <a href={i.photo_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs text-blue-600 underline">photo</a>}</td>
                                <td className="px-4 py-2 text-xs">{i.batch ?? '—'}{i.supplier ? ` · ${i.supplier}` : ''}</td>
                                <td className="px-4 py-2 text-xs">{i.status === 'held' ? 'Held' : `Sent back (${i.return_number})`}</td>
                                <td className="px-4 py-2 text-right">
                                    {i.status === 'held' && (
                                        <button type="button" className="text-xs text-red-600 underline" onClick={() => { if (confirm('Dispose of these cylinders? They leave your stock for good.')) router.post(`/seller/inventory/incidents/${i.id}/dispose`, {}, { preserveScroll: true }); }}>Dispose</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {held.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                        <Button size="sm" variant="outline" className="h-8 gap-1" disabled={picked.length === 0} onClick={() => choose(picked)}>
                            <Truck className="h-3.5 w-3.5" /> Return to supplier ({picked.length})
                        </Button>
                        <span className="text-xs text-muted-foreground">Tick held cylinders of one supplier to send them back together.</span>
                    </div>
                )}
            </CardContent>
            {returning && picked.length > 0 && (
                <ReturnConfirm ids={picked} suppliers={suppliers} supplierId={supplierId} setSupplierId={setSupplierId} onDone={() => { setPicked([]); setReturning(false); }} />
            )}
        </Card>
    );
}

function ReturnConfirm({ ids, suppliers, supplierId, setSupplierId, onDone }: { ids: number[]; suppliers: { id: number; name: string }[]; supplierId: string; setSupplierId: (v: string) => void; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3 text-sm">
            <span>Return {ids.length} item(s) to</span>
            <select aria-label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button size="sm" className="h-8" disabled={!supplierId || open} onClick={() => { setOpen(true); router.post('/seller/supplier-returns', { supplier_id: Number(supplierId), incident_ids: ids }, { preserveScroll: true, onFinish: () => { setOpen(false); onDone(); } }); }}>
                Create return
            </Button>
        </div>
    );
}

/** Supplier returns: slip PDF + outcome (replaced / credited / rejected). */
export function ReturnsCard({ returns }: { returns: ReturnRow[] }) {
    const [target, setTarget] = useState<ReturnRow | null>(null);
    const [form, setForm] = useState({ outcome: 'replaced', requalification_due_on: '', manufactured_on: '', batch_code: '', credited_amount: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    if (returns.length === 0) return null;
    const save = () => target && router.post(`/seller/supplier-returns/${target.id}/outcome`, form, {
        preserveScroll: true, onSuccess: () => setTarget(null), onError: (e) => setErrors(e),
    });
    return (
        <Card data-testid="supplier-returns">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Supplier returns</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                    <tbody className="divide-y">
                        {returns.map((r) => (
                            <tr key={r.id}>
                                <td className="px-4 py-2 font-mono text-xs">{r.return_number}<span className="block font-sans text-[11px] text-muted-foreground">{r.created_at}</span></td>
                                <td className="px-4 py-2">{r.supplier}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{r.quantity} cyl.</td>
                                <td className="px-4 py-2 capitalize">{r.status}{r.credited_amount !== null && ` · ₱${r.credited_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</td>
                                <td className="px-4 py-2 text-right">
                                    <a href={`/seller/supplier-returns/${r.id}/slip`} target="_blank" rel="noopener noreferrer" className="mr-3 inline-flex items-center gap-1 text-xs text-blue-600 underline"><FileText className="h-3 w-3" /> Slip</a>
                                    {['open', 'sent'].includes(r.status) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setErrors({}); setTarget(r); }}>Record outcome</Button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
            <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Outcome — {target?.return_number}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="flex gap-2" role="radiogroup">
                            {(['replaced', 'credited', 'rejected'] as const).map((o) => (
                                <button key={o} type="button" role="radio" aria-checked={form.outcome === o} onClick={() => setForm((f) => ({ ...f, outcome: o }))}
                                    className={`rounded-md border px-3 py-1.5 text-sm capitalize ${form.outcome === o ? 'border-blue-600 bg-blue-600 text-white' : ''}`}>{o}</button>
                            ))}
                        </div>
                        {form.outcome === 'replaced' && <>
                            <label className="grid gap-1 text-sm">Requalification date of the replacements *<Input type="date" value={form.requalification_due_on} onChange={(e) => setForm((f) => ({ ...f, requalification_due_on: e.target.value }))} /></label>
                            <label className="grid gap-1 text-sm">Manufactured (optional)<Input type="date" value={form.manufactured_on} onChange={(e) => setForm((f) => ({ ...f, manufactured_on: e.target.value }))} /></label>
                            <label className="grid gap-1 text-sm">Batch code (optional)<Input value={form.batch_code} onChange={(e) => setForm((f) => ({ ...f, batch_code: e.target.value }))} /></label>
                        </>}
                        {form.outcome === 'credited' && <label className="grid gap-1 text-sm">Credited amount (₱)<Input type="number" min="0" step="0.01" value={form.credited_amount} onChange={(e) => setForm((f) => ({ ...f, credited_amount: e.target.value }))} /></label>}
                        {form.outcome === 'rejected' && <p className="text-sm text-muted-foreground">The cylinders stay held as damaged — you can dispose of them afterwards.</p>}
                        {Object.values(errors).map((e) => <p key={e} className="text-xs text-red-600">{e}</p>)}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
