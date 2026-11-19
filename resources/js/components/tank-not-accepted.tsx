import { AlertTriangle, Camera, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** HandoverAdjustmentService::refillItems() */
export type RefillItem = { id: number; name: string; quantity: number; refill_price: number; purchase_price: number };

export type NotAcceptedRow = {
    key: number;
    order_item_id: number | '';
    quantity: number;
    reason: string;
    note: string;
    choice: 'new_purchase' | 'cancel' | '';
    photo: File | null;
};

export const NOT_ACCEPTED_REASONS: Record<string, string> = {
    wrong_brand: 'Wrong brand', dented: 'Dented / rusty', leaking: 'Leaking', valve: 'Valve / collar damaged',
    requalification: 'Past requalification date', other: 'Other',
};

let nextKey = 1;
const newRow = (items: RefillItem[]): NotAcceptedRow => ({ key: nextKey++, order_item_id: items.length === 1 ? items[0].id : '', quantity: 1, reason: '', note: '', choice: '', photo: null });

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Add the rows to the FormData the Delivered / Picked up request sends (not_accepted[i][...]). */
export function appendNotAccepted(fd: FormData, rows: NotAcceptedRow[]) {
    rows.forEach((r, i) => {
        fd.append(`not_accepted[${i}][order_item_id]`, String(r.order_item_id));
        fd.append(`not_accepted[${i}][quantity]`, String(r.quantity));
        fd.append(`not_accepted[${i}][reason]`, r.reason);
        fd.append(`not_accepted[${i}][note]`, r.note);
        fd.append(`not_accepted[${i}][choice]`, r.choice);
        if (r.photo) fd.append(`not_accepted[${i}][photo]`, r.photo);
    });
}

/** Same rows as a plain object for Inertia router.post (forceFormData) */
export function notAcceptedPayload(rows: NotAcceptedRow[]) {
    return rows.map((r) => ({ order_item_id: r.order_item_id, quantity: r.quantity, reason: r.reason, note: r.note, choice: r.choice, photo: r.photo }));
}

export function rowsComplete(rows: NotAcceptedRow[]): boolean {
    return rows.every((r) => r.order_item_id !== '' && r.quantity > 0 && r.reason && r.choice && r.photo && (r.reason !== 'other' || r.note.trim()));
}

/** + collect more (switch) / − less to pay (cancel), for the "amount changes by" line */
export function rowsAmountChange(rows: NotAcceptedRow[], items: RefillItem[]): number {
    return rows.reduce((sum, r) => {
        const it = items.find((i) => i.id === r.order_item_id);
        if (!it || !r.choice) return sum;
        return sum + (r.choice === 'new_purchase' ? (it.purchase_price - it.refill_price) * r.quantity : -it.refill_price * r.quantity);
    }, 0);
}

/**
 * "A tank was not accepted" (J4) — in the rider's Delivered dialog and the store's Picked up step. Per refill item:
 * how many, why, a REQUIRED photo (camera or file), and the customer's choice: switch to New Purchase (pay the
 * difference in cash now) or cancel that item.
 */
export default function TankNotAcceptedFields({ items, rows, onChange, currentTotal }: {
    items: RefillItem[];
    rows: NotAcceptedRow[];
    onChange: (rows: NotAcceptedRow[]) => void;
    /** The amount to collect before the change (shows the new amount) */
    currentTotal?: number;
}) {
    const [open, setOpen] = useState(rows.length > 0);
    if (items.length === 0) return null;
    const set = (key: number, patch: Partial<NotAcceptedRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const change = rowsAmountChange(rows, items);

    if (!open) {
        return (
            <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
                onClick={() => { setOpen(true); onChange([newRow(items)]); }}>
                <AlertTriangle className="h-4 w-4" /> A tank was not accepted
            </button>
        );
    }

    return (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> A tank was not accepted</p>
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setOpen(false); onChange([]); }}>Remove</button>
            </div>
            {rows.map((r, idx) => {
                const it = items.find((i) => i.id === r.order_item_id);
                return (
                    <div key={r.key} className="space-y-2 rounded-md border bg-background p-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Tank {idx + 1}</span>
                            {rows.length > 1 && <button type="button" aria-label="Remove this row" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}><X className="h-3.5 w-3.5" /></button>}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                            <select aria-label="Refill item" className="h-9 rounded-md border bg-background px-2" value={r.order_item_id}
                                onChange={(e) => set(r.key, { order_item_id: e.target.value ? Number(e.target.value) : '', quantity: 1 })}>
                                <option value="">Which item?</option>
                                {items.map((i) => <option key={i.id} value={i.id}>{i.name} (×{i.quantity})</option>)}
                            </select>
                            <input type="number" min={1} max={it?.quantity ?? 1} aria-label="How many tanks" className="h-9 rounded-md border bg-background px-2"
                                value={r.quantity} onChange={(e) => set(r.key, { quantity: Math.max(1, Math.min(it?.quantity ?? 1, Number(e.target.value) || 1)) })} />
                        </div>
                        <select aria-label="Why it was not accepted" className="h-9 w-full rounded-md border bg-background px-2" value={r.reason} onChange={(e) => set(r.key, { reason: e.target.value })}>
                            <option value="">Why was it not accepted?</option>
                            {Object.entries(NOT_ACCEPTED_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        {r.reason === 'other' && (
                            <input aria-label="Describe the problem" maxLength={300} placeholder="Describe the problem" className="h-9 w-full rounded-md border bg-background px-2"
                                value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} />
                        )}
                        <label className={cn('flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-2 py-2 text-xs', r.photo ? 'border-green-400 text-green-700 dark:text-green-300' : 'text-muted-foreground')}>
                            <Camera className="h-4 w-4" /> {r.photo ? `Photo: ${r.photo.name}` : 'Photo of the tank (required) — camera or file'}
                            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => set(r.key, { photo: e.target.files?.[0] ?? null })} />
                        </label>
                        <fieldset className="space-y-1">
                            <legend className="text-xs font-medium">The customer chooses:</legend>
                            <label className="flex items-start gap-2 text-xs">
                                <input type="radio" name={`choice-${r.key}`} checked={r.choice === 'new_purchase'} onChange={() => set(r.key, { choice: 'new_purchase' })} className="mt-0.5" />
                                <span><strong>Switch to New Purchase</strong>{it ? ` — collect ${peso((it.purchase_price - it.refill_price) * r.quantity)} more in cash now` : ''}</span>
                            </label>
                            <label className="flex items-start gap-2 text-xs">
                                <input type="radio" name={`choice-${r.key}`} checked={r.choice === 'cancel'} onChange={() => set(r.key, { choice: 'cancel' })} className="mt-0.5" />
                                <span><strong>Cancel this item</strong>{it ? ` — ${peso(it.refill_price * r.quantity)} less` : ''}</span>
                            </label>
                        </fieldset>
                    </div>
                );
            })}
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => onChange([...rows, newRow(items)])}><Plus className="h-3.5 w-3.5" /> Another tank</Button>
            {change !== 0 && (
                <p className="text-xs font-medium">
                    Order amount changes by {change > 0 ? '+' : '−'}{peso(Math.abs(change))}
                    {currentTotal !== undefined && <> · new total {peso(Math.max(0, currentTotal + change))}</>}
                </p>
            )}
        </div>
    );
}
