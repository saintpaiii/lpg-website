import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, PackagePlus, Plus, Sparkles, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

export type CatalogProduct = { product_id: number; name: string; unit_cost: number; min_order_qty: number; suggested: number };
export type CatalogSupplier = { id: number; name: string; email: string | null; lead_time_days: number; products: CatalogProduct[] };
type Row = { id: number; po_number: string; status: string; status_label: string; source: 'manual' | 'auto'; supplier: string | null; items: number; quantity: number; received: number; subtotal: number; expected_on: string | null; created_at: string } & PaymentInfo;
/** K6: supplier payment columns of a PO */
export type PaymentInfo = {
    payment_status: 'unpaid' | 'partial' | 'paid'; payment_label: string; received_value: number; amount_paid: number; balance: number;
    payment_due_on: string | null; payment_due_label: string | null; overdue: boolean; payable: boolean;
};
type Payables = { owed: number; count: number; overdue: number; overdue_count: number };
type Paginated = { data: Row[]; current_page: number; last_page: number; links: { url: string | null; label: string; active: boolean }[] };
export type PoAbilities = { create: boolean; send: boolean; receive: boolean; suppliers: boolean; pay: boolean; owner: boolean };

const TABS = [['draft', 'Draft'], ['sent', 'Sent'], ['receiving', 'Receiving'], ['done', 'Done'], ['cancelled', 'Cancelled'], ['unpaid', 'Unpaid to suppliers']] as const;
export const PAYMENT_STYLE: Record<string, string> = { unpaid: 'bg-muted text-foreground/80', partial: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300', paid: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };

/** "Unpaid" / "Partial" / "Paid" + a red "Overdue" — nothing to pay before anything is received. */
export function PaymentBadge({ p }: { p: PaymentInfo }) {
    if (!p.payable) return <span className="text-xs text-muted-foreground">—</span>;
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STYLE[p.payment_status]}`}>{p.payment_label}</span>
            {p.overdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" data-testid="overdue-badge">Overdue</span>}
        </span>
    );
}
const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-muted text-foreground/80', sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', partially_received: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    received: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};
const breadcrumbs: BreadcrumbItem[] = [{ title: 'Inventory', href: '/seller/inventory' }, { title: 'Purchase Orders', href: '/seller/purchase-orders' }];
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

/** J7 — purchase orders to suppliers: Draft | Sent | Receiving | Done | Cancelled. */
export default function PurchaseOrdersPage({ orders, tab, counts, payables, suppliers, can }: { orders: Paginated; tab: string; counts: Record<string, number>; payables: Payables; suppliers: CatalogSupplier[]; can: PoAbilities }) {
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

                {/* K6: what the store owes its suppliers (received value − paid) */}
                <button type="button" onClick={() => router.get('/seller/purchase-orders', { tab: 'unpaid' }, { preserveState: true })} data-testid="payables-card"
                    className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-left text-sm sm:w-auto ${payables.overdue_count > 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40' : 'bg-card'}`}>
                    <Wallet className={`h-5 w-5 ${payables.overdue_count > 0 ? 'text-red-600' : 'text-blue-600'}`} />
                    <span>Unpaid to suppliers: <strong className="tabular-nums">{peso(payables.owed)}</strong></span>
                    {payables.overdue_count > 0 && <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4" /> {payables.overdue_count} overdue ({peso(payables.overdue)})</span>}
                </button>

                <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
                    {TABS.map(([key, label]) => (
                        <button key={key} role="tab" aria-selected={tab === key} onClick={() => router.get('/seller/purchase-orders', { tab: key }, { preserveState: true })}
                            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>
                            {label} <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-foreground">{counts[key] ?? 0}</span>
                        </button>
                    ))}
                </div>

                <Card>
                    <CardContent className="overflow-x-auto p-0">
                        <table className="rt-cards w-full text-sm">
                            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2">PO</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Items</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">{tab === 'unpaid' ? 'Due' : 'Expected'}</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Payment</th></tr></thead>
                            <tbody className="divide-y">
                                {orders.data.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{tab === 'unpaid' ? 'Nothing owed to suppliers.' : 'Nothing here.'}</td></tr>}
                                {orders.data.map((o) => (
                                    <tr key={o.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-2 font-mono text-xs">
                                            <Link href={`/seller/purchase-orders/${o.id}`} className="font-semibold text-blue-600 hover:underline">{o.po_number}</Link>
                                            {o.source === 'auto' && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-violet-100 dark:bg-violet-900/40 px-1 py-px text-xs font-semibold text-violet-700 dark:text-violet-300"><Sparkles className="h-2.5 w-2.5" /> Auto</span>}
                                            <div className="text-xs text-muted-foreground">{o.created_at}</div>
                                        </td>
                                        <td className="px-4 py-2">{o.supplier}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{o.items} · {o.received}/{o.quantity}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(o.subtotal)}{o.payable && o.balance > 0 && <span className="block text-xs text-muted-foreground">Balance {peso(o.balance)}</span>}</td>
                                        <td className="px-4 py-2">{tab === 'unpaid' ? (o.payment_due_label ?? '—') : (o.expected_on ?? '—')}</td>
                                        <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status]}`}>{o.status_label}</span></td>
                                        <td className="px-4 py-2"><PaymentBadge p={o} /></td>
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
                            <div key={p.product_id} className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] items-center gap-2 text-sm">
                                <span>{p.name}{p.suggested > 0 && <span className="ml-1 text-xs text-violet-700 dark:text-violet-300">DSS: {p.suggested}</span>}<span className="block text-xs text-muted-foreground">min {p.min_order_qty}</span></span>
                                <Input aria-label={`Quantity of ${p.name}`} type="number" min="0" className="h-8 text-right" value={qty[p.product_id] ?? ''} placeholder="0"
                                    onChange={(e) => setQty((m) => ({ ...m, [p.product_id]: e.target.value }))} />
                                <Input aria-label={`Unit cost of ${p.name}`} type="number" min="0" step="0.01" className="h-8 text-right" value={cost[p.product_id] ?? ''}
                                    onChange={(e) => setCost((m) => ({ ...m, [p.product_id]: e.target.value }))} />
                                {/* K6: a draft may be below the supplier's minimum — sending it isn't allowed */}
                                {Number(qty[p.product_id]) > 0 && Number(qty[p.product_id]) < p.min_order_qty && (
                                    <p className="col-span-3 -mt-1 rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-xs text-amber-800 dark:text-amber-300" data-testid="min-warning">Minimum order from this supplier is {p.min_order_qty}</p>
                                )}
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
