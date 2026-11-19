import { router } from '@inertiajs/react';
import axios from 'axios';
import { ArrowRight, FileDown, PackagePlus, Plus, Trash2, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmtDateTime } from '@/lib/utils';

/** J9 — stock transfers between the owner's stores: list (with Receive / Cancel / slip) and the New transfer dialog. */

export type TransferRow = {
    id: number; number: string; status: 'sent' | 'received' | 'cancelled'; status_label: string;
    from: { id: number; name: string | null }; to: { id: number; name: string | null };
    notes: string | null; sent_by: string | null; sent_at: string | null; received_by: string | null; received_at: string | null;
    can_receive: boolean; can_cancel: boolean;
    items: { id: number; from: string | null; to: string | null; empties: boolean; quantity: number; received: number | null; lost: number }[];
};

const STATUS_CLS: Record<string, string> = {
    sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    received: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function TransfersList({ transfers, storeId, empty = 'No transfers yet.' }: { transfers: TransferRow[]; storeId?: number; empty?: string }) {
    const [receiving, setReceiving] = useState<TransferRow | null>(null);
    const [cancelling, setCancelling] = useState<TransferRow | null>(null);

    if (transfers.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>;

    return (
        <>
            <div className="divide-y" data-testid="transfers-list">
                {transfers.map((t) => {
                    const dir = storeId ? (t.to.id === storeId ? 'in' : 'out') : null;
                    return (
                        <div key={t.id} className="space-y-1.5 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold">{t.number}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[t.status] ?? ''}`}>{t.status_label}</span>
                                {dir && <span className={`rounded px-1.5 text-[11px] font-semibold ${dir === 'in' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'}`}>{dir === 'in' ? 'Incoming' : 'Outgoing'}</span>}
                                <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                                    <span className="truncate">{t.from.name}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{t.to.name}</span>
                                </span>
                                <div className="ml-auto flex flex-wrap gap-2">
                                    <Button size="sm" variant="ghost" asChild><a href={`/seller/transfers/${t.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="mr-1 h-3.5 w-3.5" /> Slip</a></Button>
                                    {t.can_cancel && <Button size="sm" variant="outline" onClick={() => setCancelling(t)}>Cancel</Button>}
                                    {t.can_receive && <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setReceiving(t)}>Receive</Button>}
                                </div>
                            </div>
                            <ul className="text-sm">
                                {t.items.map((i) => (
                                    <li key={i.id} className="flex flex-wrap gap-x-2">
                                        <span className="tabular-nums font-medium">{i.quantity} ×</span>
                                        <span>{i.from}{i.empties ? ' (empty)' : ''}</span>
                                        {i.to && i.to !== i.from && <span className="text-muted-foreground">→ {i.to}</span>}
                                        {i.received !== null && i.received < i.quantity && (
                                            <span className="text-red-600">· received {i.received}, {i.lost} lost in transfer</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                Sent {t.sent_at ? fmtDateTime(t.sent_at) : '—'}{t.sent_by ? ` by ${t.sent_by}` : ''}
                                {t.received_at && ` · received ${fmtDateTime(t.received_at)}${t.received_by ? ` by ${t.received_by}` : ''}`}
                                {t.notes && ` · ${t.notes}`}
                            </p>
                        </div>
                    );
                })}
            </div>

            {receiving && <ReceiveDialog transfer={receiving} onClose={() => setReceiving(null)} />}

            <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel {cancelling?.number}?</AlertDialogTitle>
                        <AlertDialogDescription>Everything goes back to {cancelling?.from.name}'s stock (to the same batches). Nothing arrives at {cancelling?.to.name}.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => cancelling && router.post(`/seller/transfers/${cancelling.id}/cancel`, {}, { preserveScroll: true, onFinish: () => setCancelling(null) })}>
                            Cancel transfer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function ReceiveDialog({ transfer, onClose }: { transfer: TransferRow; onClose: () => void }) {
    const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(transfer.items.map((i) => [i.id, String(i.quantity)])));
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const short = transfer.items.reduce((n, i) => n + Math.max(0, i.quantity - (Number(qty[i.id]) || 0)), 0);

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Receive {transfer.number}</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">Count what arrived from {transfer.from.name}. Anything missing is recorded at the sending store as lost in transfer.</p>
                <div className="space-y-2">
                    {transfer.items.map((i) => (
                        <div key={i.id} className="flex items-center gap-3">
                            <Label htmlFor={`rcv-${i.id}`} className="min-w-0 flex-1 text-sm font-normal">{i.to ?? i.from}{i.empties ? ' (empty)' : ''} <span className="text-muted-foreground">· sent {i.quantity}</span></Label>
                            <Input id={`rcv-${i.id}`} type="number" min={0} max={i.quantity} className="h-9 w-24" value={qty[i.id] ?? ''}
                                onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} />
                        </div>
                    ))}
                    {Object.values(errors)[0] && <p className="text-sm text-red-600">{Object.values(errors)[0]}</p>}
                    {short > 0 && <p className="text-sm text-amber-700">{short} missing — will be recorded as lost in transfer.</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button disabled={processing} className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => {
                        setProcessing(true);
                        router.post(`/seller/transfers/${transfer.id}/receive`, { received: Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, Number(v) || 0])) }, {
                            preserveScroll: true, onSuccess: onClose, onError: (e) => setErrors(e as Record<string, string>), onFinish: () => setProcessing(false),
                        });
                    }}>Confirm received</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type OptionProduct = { id: number; name: string; type: string; is_lpg?: boolean; usable?: number; empties?: number; suggest_to?: number | null; active?: boolean };
type Options = { stores: { id: number; name: string }[]; from_store_id: number; to_store_id: number | null; from: OptionProduct[]; to: OptionProduct[] };
type Line = { from_product_id: string; to_product_id: string; quantity: string; empties: boolean };

/** New transfer (optionally preset by a DSS suggestion: from / to store, product and quantity). */
export function NewTransferDialog({ open, onClose, preset }: {
    open: boolean; onClose: () => void;
    preset?: { from_store_id?: number; to_store_id?: number; from_product_id?: number; to_product_id?: number; quantity?: number } | null;
}) {
    const [opts, setOpts] = useState<Options | null>(null);
    const [fromId, setFromId] = useState<number | null>(preset?.from_store_id ?? null);
    const [toId, setToId] = useState<number | null>(preset?.to_store_id ?? null);
    const [lines, setLines] = useState<Line[]>([]);
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Load the two stores' products (again when a store changes)
    useEffect(() => {
        if (!open) return;
        setLoadError(null);
        axios.get<Options>('/seller/transfers/options', { params: { from_store_id: fromId ?? undefined, to_store_id: toId ?? undefined } })
            .then((r) => {
                setOpts(r.data);
                if (fromId === null) setFromId(r.data.from_store_id);
                setLines((ls) => {
                    if (ls.length > 0 || !preset?.from_product_id) return ls.length ? ls : [{ from_product_id: '', to_product_id: '', quantity: '', empties: false }];
                    return [{ from_product_id: String(preset.from_product_id), to_product_id: String(preset.to_product_id ?? ''), quantity: String(preset.quantity ?? ''), empties: false }];
                });
            })
            .catch((e) => setLoadError(e?.response?.data?.message ?? "Couldn't load the stores' products."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, fromId, toId]);

    const fromP = (id: string) => opts?.from.find((p) => String(p.id) === id);
    const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

    function pickFrom(i: number, id: string) {
        const p = fromP(id);
        setLine(i, { from_product_id: id, to_product_id: p?.suggest_to ? String(p.suggest_to) : '' });
    }

    async function createInDestination(i: number) {
        if (!toId) return;
        try {
            const r = await axios.post<OptionProduct>('/seller/transfers/create-product', { from_product_id: Number(lines[i].from_product_id), to_store_id: toId });
            setOpts((o) => (o ? { ...o, to: o.to.some((p) => p.id === r.data.id) ? o.to : [...o.to, r.data] } : o));
            setLine(i, { to_product_id: String(r.data.id) });
        } catch {
            setErrors((e) => ({ ...e, [`lines.${i}.to_product_id`]: "Couldn't create the product in the receiving store." }));
        }
    }

    function submit() {
        setProcessing(true);
        router.post('/seller/transfers', {
            from_store_id: fromId, to_store_id: toId, notes,
            lines: lines.filter((l) => l.from_product_id).map((l) => ({ ...l, quantity: Number(l.quantity) || 0, empties: l.empties ? 1 : 0 })),
        }, {
            preserveScroll: true,
            onSuccess: () => { setLines([]); setNotes(''); onClose(); },
            onError: (e) => setErrors(e as Record<string, string>),
            onFinish: () => setProcessing(false),
        });
    }

    const err = (k: string) => errors[k];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-blue-600" /> New stock transfer</DialogTitle></DialogHeader>
                {loadError && <p className="text-sm text-red-600">{loadError}</p>}
                {opts && (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1">
                                <Label htmlFor="tr-from">From</Label>
                                <select id="tr-from" className="h-9 rounded-md border bg-background px-2 text-sm" value={fromId ?? ''}
                                    onChange={(e) => { setFromId(Number(e.target.value)); setLines([{ from_product_id: '', to_product_id: '', quantity: '', empties: false }]); }}>
                                    {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                {err('from_store_id') && <p className="text-xs text-red-600">{err('from_store_id')}</p>}
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="tr-to">To</Label>
                                <select id="tr-to" className="h-9 rounded-md border bg-background px-2 text-sm" value={toId ?? ''}
                                    onChange={(e) => { setToId(Number(e.target.value) || null); setLines((ls) => ls.map((l) => ({ ...l, to_product_id: '' }))); }}>
                                    <option value="">Choose a store…</option>
                                    {opts.stores.filter((s) => s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                {err('to_store_id') && <p className="text-xs text-red-600">{err('to_store_id')}</p>}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {lines.map((l, i) => {
                                const p = fromP(l.from_product_id);
                                const max = l.empties ? p?.empties ?? 0 : p?.usable ?? 0;
                                return (
                                    <div key={i} className="space-y-2 rounded-md border p-3">
                                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
                                            <select aria-label="Product to send" className="h-9 rounded-md border bg-background px-2 text-sm" value={l.from_product_id} onChange={(e) => pickFrom(i, e.target.value)}>
                                                <option value="">Product…</option>
                                                {opts.from.map((fp) => <option key={fp.id} value={fp.id}>{fp.name} ({fp.usable} usable)</option>)}
                                            </select>
                                            <select aria-label="Product in the receiving store" className="h-9 rounded-md border bg-background px-2 text-sm" value={l.to_product_id} disabled={!toId}
                                                onChange={(e) => setLine(i, { to_product_id: e.target.value })}>
                                                <option value="">{toId ? 'Receiving product…' : 'Choose "To" first'}</option>
                                                {opts.to.filter((tp) => !p || tp.type === p.type).map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.active === false ? ' (inactive)' : ''}</option>)}
                                            </select>
                                            <Input aria-label="Quantity" type="number" min={1} max={max || undefined} placeholder="Qty" className="h-9" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                                            <Button type="button" size="icon" variant="ghost" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {p && <span>Max {max} {l.empties ? 'empty' : 'usable (no expired cylinders)'}</span>}
                                            {p?.is_lpg && (
                                                <label className="flex items-center gap-1.5"><input type="checkbox" checked={l.empties} onChange={(e) => setLine(i, { empties: e.target.checked })} /> Empty cylinders</label>
                                            )}
                                            {p && toId && !l.to_product_id && (
                                                <button type="button" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline" onClick={() => createInDestination(i)}>
                                                    <PackagePlus className="h-3.5 w-3.5" /> Create it in the receiving store
                                                </button>
                                            )}
                                        </div>
                                        {['from_product_id', 'to_product_id', 'quantity', 'empties'].map((k) => err(`lines.${i}.${k}`) && <p key={k} className="text-xs text-red-600">{err(`lines.${i}.${k}`)}</p>)}
                                    </div>
                                );
                            })}
                            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { from_product_id: '', to_product_id: '', quantity: '', empties: false }])}>
                                <Plus className="mr-1 h-3.5 w-3.5" /> Add product
                            </Button>
                            {err('lines') && <p className="text-xs text-red-600">{err('lines')}</p>}
                        </div>

                        <div className="grid gap-1">
                            <Label htmlFor="tr-notes">Notes (optional)</Label>
                            <Input id="tr-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. driver, plate number" />
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button disabled={processing || !opts || !toId} className="bg-blue-600 text-white hover:bg-blue-700" onClick={submit}>Send transfer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
