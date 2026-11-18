import { Head, router } from '@inertiajs/react';
import { AlertTriangle, Factory, Lock, Pencil, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type SupplierProductRow = { id: number; product_id: number; name: string | null; unit_cost: number; min_order_qty: number; is_preferred: boolean };
type Supplier = {
    id: number; name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null;
    lead_time_days: number; payment_terms: string | null; notes: string | null; is_active: boolean; products: SupplierProductRow[];
};
type ProductOption = { id: number; name: string; product_type: 'lpg' | 'accessory'; cost_price: number };

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/seller/inventory' },
    { title: 'Suppliers', href: '/seller/suppliers' },
];

const blank = { name: '', contact_person: '', phone: '', email: '', address: '', lead_time_days: '2', payment_terms: 'COD', notes: '', is_active: true };
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

/** J7 — suppliers (LPG refillers / distributors, accessory wholesalers) and what each supplies. */
export default function SuppliersPage({ suppliers, products, canManage, balances }: {
    suppliers: Supplier[]; products: ProductOption[];
    /** K6: only the owner (or a role with Purchase approvals) adds / edits suppliers and unit costs — the rest see them read-only */
    canManage: boolean;
    balances: Record<number, { owed: number; overdue: number }>;
}) {
    const [removeTarget, setRemoveTarget] = useState<Supplier | null>(null);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [link, setLink] = useState<Record<number, { product_id: string; unit_cost: string; min_order_qty: string }>>({});

    const openForm = (s: Supplier | null) => {
        setEditing(s);
        setErrors({});
        setForm(s ? { name: s.name, contact_person: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
            lead_time_days: String(s.lead_time_days), payment_terms: s.payment_terms ?? '', notes: s.notes ?? '', is_active: s.is_active } : blank);
        setOpen(true);
    };
    const save = () => {
        setBusy(true);
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false), onError: (e: Record<string, string>) => setErrors(e), onFinish: () => setBusy(false) };
        if (editing) router.put(`/seller/suppliers/${editing.id}`, form, opts);
        else router.post('/seller/suppliers', form, opts);
    };
    const addLink = (s: Supplier) => {
        const l = link[s.id];
        if (!l?.product_id) return;
        router.post(`/seller/suppliers/${s.id}/products`, { product_id: Number(l.product_id), unit_cost: Number(l.unit_cost || 0), min_order_qty: Number(l.min_order_qty || 1) },
            { preserveScroll: true, onSuccess: () => setLink((m) => ({ ...m, [s.id]: { product_id: '', unit_cost: '', min_order_qty: '1' } })) });
    };
    const field = (key: keyof typeof blank, label: string, props: Record<string, unknown> = {}) => (
        <div className="grid gap-1.5">
            <Label htmlFor={`sup-${key}`}>{label}</Label>
            <Input id={`sup-${key}`} value={String(form[key] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} {...props} />
            {errors[key] && <p className="text-xs text-red-500">{errors[key]}</p>}
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Suppliers" />
            <div className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold"><Factory className="h-6 w-6 text-blue-600" /> Suppliers</h1>
                        <p className="text-sm text-muted-foreground">Who you buy LPG and accessories from — costs, lead times and the preferred supplier per product (auto-reorder uses it).</p>
                    </div>
                    {canManage && <Button onClick={() => openForm(null)} className="gap-1 bg-blue-600 text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add supplier</Button>}
                </div>
                {!canManage && (
                    <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="suppliers-read-only">
                        <Lock className="h-4 w-4 shrink-0" /> View only — the store owner manages suppliers and unit costs.
                    </p>
                )}

                {suppliers.length === 0 && (
                    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No suppliers yet. Add your LPG supplier to create purchase orders and enable auto-reorder.</CardContent></Card>
                )}

                {suppliers.map((s) => (
                    <Card key={s.id} className={s.is_active ? '' : 'opacity-60'} data-testid={`supplier-${s.id}`}>
                        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
                            <div>
                                <CardTitle className="text-base">{s.name} {!s.is_active && <span className="ml-1 text-xs font-normal text-muted-foreground">(inactive)</span>}</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    {[s.contact_person, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'} · lead time {s.lead_time_days} day(s){s.payment_terms ? ` · ${s.payment_terms}` : ''}
                                </p>
                                {/* K6: received value − paid on this supplier's purchase orders */}
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm" data-testid="supplier-balance">
                                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> Balance owed: <strong className="tabular-nums">{peso(balances[s.id]?.owed ?? 0)}</strong>
                                    {(balances[s.id]?.overdue ?? 0) > 0 && <span className="font-medium text-red-700">({peso(balances[s.id].overdue)} overdue)</span>}
                                </p>
                            </div>
                            {canManage && (
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openForm(s)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-red-600" aria-label={`Remove ${s.name}`} onClick={() => setRemoveTarget(s)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                            <table className="w-full text-sm">
                                <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2">Product supplied</th><th className="px-4 py-2 text-right">Unit cost</th><th className="px-4 py-2 text-right">Min qty</th><th className="px-4 py-2 text-center">Preferred</th>{canManage && <th />}</tr></thead>
                                <tbody className="divide-y">
                                    {s.products.map((l) => (
                                        <tr key={l.id}>
                                            <td className="px-4 py-2">{l.name}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(l.unit_cost)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{l.min_order_qty}</td>
                                            <td className="px-4 py-2 text-center">
                                                {!canManage ? (l.is_preferred ? <Star className="mx-auto h-4 w-4 fill-amber-400 text-amber-500" aria-label="Preferred supplier" /> : null) : <button type="button" aria-label={l.is_preferred ? 'Preferred supplier' : 'Make preferred'} title={l.is_preferred ? 'Preferred supplier for this product' : 'Make preferred'}
                                                    onClick={() => router.post(`/seller/suppliers/${s.id}/products`, { product_id: l.product_id, unit_cost: l.unit_cost, min_order_qty: l.min_order_qty, is_preferred: !l.is_preferred }, { preserveScroll: true })}>
                                                    <Star className={`h-4 w-4 ${l.is_preferred ? 'fill-amber-400 text-amber-500' : 'text-gray-300'}`} />
                                                </button>}
                                            </td>
                                            {canManage && (
                                                <td className="px-2 py-2 text-right">
                                                    <button type="button" className="text-xs text-red-600" onClick={() => router.delete(`/seller/suppliers/${s.id}/products/${l.id}`, { preserveScroll: true })}>Remove</button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                    {s.products.length === 0 && !canManage && <tr><td colSpan={4} className="px-4 py-3 text-center text-muted-foreground">No products linked yet.</td></tr>}
                                    {canManage && <tr className="bg-muted/30">
                                        <td className="px-4 py-2">
                                            <select aria-label="Product" value={link[s.id]?.product_id ?? ''} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                onChange={(e) => { const p = products.find((x) => String(x.id) === e.target.value); setLink((m) => ({ ...m, [s.id]: { product_id: e.target.value, unit_cost: p ? String(p.cost_price) : '', min_order_qty: m[s.id]?.min_order_qty ?? '1' } })); }}>
                                                <option value="">Add a product…</option>
                                                {products.filter((p) => !s.products.some((l) => l.product_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.product_type === 'accessory' ? ' (accessory)' : ''}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2"><Input aria-label="Unit cost" type="number" min="0" step="0.01" className="h-8 text-right" value={link[s.id]?.unit_cost ?? ''} onChange={(e) => setLink((m) => ({ ...m, [s.id]: { ...(m[s.id] ?? { product_id: '', min_order_qty: '1' }), unit_cost: e.target.value } }))} /></td>
                                        <td className="px-4 py-2"><Input aria-label="Min order qty" type="number" min="1" className="h-8 text-right" value={link[s.id]?.min_order_qty ?? '1'} onChange={(e) => setLink((m) => ({ ...m, [s.id]: { ...(m[s.id] ?? { product_id: '', unit_cost: '' }), min_order_qty: e.target.value } }))} /></td>
                                        <td colSpan={2} className="px-4 py-2 text-right"><Button size="sm" className="h-8" disabled={!link[s.id]?.product_id} onClick={() => addLink(s)}>Add</Button></td>
                                    </tr>}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Add / edit — fits phone screens: scrolling body, sticky footer */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>{editing ? 'Edit supplier' : 'Add supplier'}</DialogTitle></DialogHeader>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4" data-testid="supplier-form-body">
                        {field('name', 'Name *', { placeholder: 'e.g. Petron Cavite Refilling Plant' })}
                        <div className="grid gap-3 sm:grid-cols-2">
                            {field('contact_person', 'Contact person')}
                            {field('phone', 'Phone', { placeholder: '09… or (046) 483-5678' })}
                        </div>
                        {field('email', 'Email (POs are emailed here)', { type: 'email' })}
                        {field('address', 'Address')}
                        <div className="grid gap-3 sm:grid-cols-2">
                            {field('lead_time_days', 'Lead time (days) *', { type: 'number', min: 0, max: 90 })}
                            {field('payment_terms', 'Payment terms', { placeholder: 'COD / 7 days / 30 days' })}
                        </div>
                        {field('notes', 'Notes')}
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active</label>
                    </div>
                    <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy || !form.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* K6: the app's confirmation instead of the browser's confirm() */}
            <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Remove {removeTarget?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Past purchase orders keep their history.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => { if (removeTarget) router.delete(`/seller/suppliers/${removeTarget.id}`, { preserveScroll: true }); setRemoveTarget(null); }}>
                            Remove supplier
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
