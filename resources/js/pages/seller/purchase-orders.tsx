import { Head, Link, router } from '@inertiajs/react';
import { PackagePlus, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

export type CatalogProduct = { product_id: number; name: string; unit_cost: number; min_order_qty: number; suggested: number };
export type CatalogSupplier = { id: number; name: string; email: string | null; lead_time_days: number; products: CatalogProduct[] };
type Row = { id: number; po_number: string; status: string; status_label: string; source: 'manual' | 'auto'; supplier: string | null; items: number; quantity: number; received: number; subtotal: number; expected_on: string | null; created_at: string };
type Paginated = { data: Row[]; current_page: number; last_page: number; links: { url: string | null; label: string; active: boolean }[] };
export type PoAbilities = { create: boolean; send: boolean; receive: boolean; suppliers: boolean };

const TABS = [['draft', 'Draft'], ['sent', 'Sent'], ['receiving', 'Receiving'], ['done', 'Done'], ['cancelled', 'Cancelled']] as const;
const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700', partially_received: 'bg-amber-100 text-amber-800',
    received: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700',
};
const breadcrumbs: BreadcrumbItem[] = [{ title: 'Inventory', href: '/seller/inventory' }, { title: 'Purchase Orders', href: '/seller/purchase-orders' }];
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

/** J7 — purchase orders to suppliers: Draft | Sent | Receiving | Done | Cancelled. */
export default function PurchaseOrdersPage({ orders, tab, counts, suppliers, can }: { orders: Paginated; tab: string; counts: Record<string, number>; suppliers: CatalogSupplier[]; can: PoAbilities }) {
    const [open, setOpen] = useState(false);
    const [supplierId, setSupplierId] = useState('');
    const [qty, setQty] = useState<Record<number, string>>({});
    const [cost, setCost] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const supplier = suppliers.find((s) => String(s.id) === supplierId);

    const pick = (id: string) => {
        setSupplierId(id);
        const s = suppliers.find((x) => String(x.id) === id);
        // Prefill: unit costs + the DSS suggestion for products at/below their reorder point
        setQty(Object.fromEntries((s?.products ?? []).map((p) => [p.product_id, p.suggested ? String(p.suggested) : ''])));
        setCost(Object.fromEntries((s?.products ?? []).map((p) => [p.product_id, String(p.unit_cost)])));
    };
    const total = (supplier?.products ?? []).reduce((t, p) => t + (Number(qty[p.product_id]) || 0) * (Number(cost[p.product_id]) || 0), 0);
    const create = () => {
        if (!supplier) return;
        setBusy(true);
        router.post('/seller/purchase-orders', {
            supplier_id: supplier.id,
            lines: supplier.products.map((p) => ({ product_id: p.product_id, quantity: Number(qty[p.product_id]) || 0, unit_cost: Number(cost[p.product_id]) || 0 })),
        }, { onFinish: () => setBusy(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchase Orders" />
            <div className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold"><PackagePlus className="h-6 w-6 text-blue-600" /> Purchase Orders</h1>
                        <p className="text-sm text-muted-foreground">Order stock from your suppliers. Auto-reorder drafts appear under Draft — they are never sent automatically.</p>
                    </div>
                    {can.create && (
                        <Button onClick={() => { setOpen(true); pick(suppliers[0] ? String(suppliers[0].id) : ''); }} disabled={suppliers.length === 0}
                            className="gap-1 bg-blue-600 text-white hover:bg-blue-700" title={suppliers.length === 0 ? 'Add a supplier first' : undefined}>
                            <Plus className="h-4 w-4" /> New purchase order
                        </Button>
                    )}
                </div>

                <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
                    {TABS.map(([key, label]) => (
                        <button key={key} role="tab" aria-selected={tab === key} onClick={() => router.get('/seller/purchase-orders', { tab: key }, { preserveState: true })}
                            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>
                            {label} <span className="ml-1 rounded-full bg-muted px-1.5 text-[11px]">{counts[key] ?? 0}</span>
                        </button>
                    ))}
                </div>

                <Card>
                    <CardContent className="overflow-x-auto p-0">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2">PO</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Items</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Expected</th><th className="px-4 py-2">Status</th></tr></thead>
                            <tbody className="divide-y">
                                {orders.data.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nothing here.</td></tr>}
                                {orders.data.map((o) => (
                                    <tr key={o.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-2 font-mono text-xs">
                                            <Link href={`/seller/purchase-orders/${o.id}`} className="font-semibold text-blue-600 hover:underline">{o.po_number}</Link>
                                            {o.source === 'auto' && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 py-px text-[10px] font-semibold text-violet-700"><Sparkles className="h-2.5 w-2.5" /> Auto</span>}
                                            <div className="text-[11px] text-muted-foreground">{o.created_at}</div>
                                        </td>
                                        <td className="px-4 py-2">{o.supplier}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{o.items} · {o.received}/{o.quantity}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(o.subtotal)}</td>
                                        <td className="px-4 py-2">{o.expected_on ?? '—'}</td>
                                        <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status]}`}>{o.status_label}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>New purchase order</DialogTitle></DialogHeader>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
                        <select aria-label="Supplier" value={supplierId} onChange={(e) => pick(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {supplier && supplier.products.length === 0 && <p className="text-sm text-muted-foreground">This supplier has no products yet — add them on the Suppliers page.</p>}
                        {supplier?.products.map((p) => (
                            <div key={p.product_id} className="grid grid-cols-[1fr_5rem_6rem] items-center gap-2 text-sm">
                                <span>{p.name}{p.suggested > 0 && <span className="ml-1 text-[11px] text-violet-700">DSS: {p.suggested}</span>}<span className="block text-[11px] text-muted-foreground">min {p.min_order_qty}</span></span>
                                <Input aria-label={`Quantity of ${p.name}`} type="number" min="0" className="h-8 text-right" value={qty[p.product_id] ?? ''} placeholder="0"
                                    onChange={(e) => setQty((m) => ({ ...m, [p.product_id]: e.target.value }))} />
                                <Input aria-label={`Unit cost of ${p.name}`} type="number" min="0" step="0.01" className="h-8 text-right" value={cost[p.product_id] ?? ''}
                                    onChange={(e) => setCost((m) => ({ ...m, [p.product_id]: e.target.value }))} />
                            </div>
                        ))}
                        {supplier && <p className="text-right text-sm font-semibold">Total {peso(total)}</p>}
                    </div>
                    <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy || !supplier || !supplier.products.some((p) => Number(qty[p.product_id]) > 0)} onClick={create}>{busy ? 'Saving…' : 'Create draft'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
