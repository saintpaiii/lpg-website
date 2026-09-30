import { Link, router } from '@inertiajs/react';
import { Calculator, ChevronLeft, ChevronRight, Pencil, Plus, Power, Search, Shuffle, TicketPercent, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { calculateDiscount, peso, splitCost, type CouponScope, type DiscountType } from '@/lib/coupons';

export type CouponRow = {
    id: number;
    code: string;
    type: 'platform' | 'store';
    store_name: string | null;
    scope: CouponScope;
    discount_type: DiscountType;
    discount_value: number;
    min_order_amount: number;
    max_discount_amount: number | null;
    max_uses: number | null;
    max_uses_per_user: number;
    used_count: number;
    starts_at: string | null;
    expires_at: string | null;
    is_active: boolean;
    admin_share_percent: number;
    seller_commission_during_promo: number | null;
    featured_boost: boolean;
    participating_stores: number | null;
    state: 'active' | 'scheduled' | 'expired' | 'used_up' | 'inactive';
    label: string;
    stats: { orders: number; discount_given: number; revenue: number; admin_absorbed: number; seller_absorbed: number };
    created_at: string;
};

type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null };

type FormState = {
    code: string;
    scope: CouponScope;
    discount_type: DiscountType;
    discount_value: string;
    min_order_amount: string;
    max_discount_amount: string;
    max_uses: string;
    max_uses_per_user: string;
    starts_at: string;
    expires_at: string;
    is_active: boolean;
    admin_share_percent: string;
    seller_commission_during_promo: string;
    featured_boost: boolean;
};

const STATE_STYLES: Record<CouponRow['state'], string> = {
    active:    'bg-green-100 text-green-800',
    scheduled: 'bg-blue-100 text-blue-800',
    expired:   'bg-gray-100 text-gray-600',
    used_up:   'bg-amber-100 text-amber-800',
    inactive:  'bg-gray-100 text-gray-500',
};

const STATE_LABELS: Record<CouponRow['state'], string> = {
    active: 'Active', scheduled: 'Scheduled', expired: 'Expired', used_up: 'Used up', inactive: 'Inactive',
};

const SCOPE_LABELS: Record<CouponScope, string> = { product: 'Products', shipping: 'Delivery fee', both: 'Products + delivery' };

const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function emptyForm(code: string): FormState {
    return {
        code, scope: 'product', discount_type: 'percentage', discount_value: '10', min_order_amount: '0',
        max_discount_amount: '', max_uses: '', max_uses_per_user: '1', starts_at: '', expires_at: '', is_active: true,
        admin_share_percent: '50', seller_commission_during_promo: '', featured_boost: true,
    };
}

function randomCode(prefix: string) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `${prefix}-${s}`;
}

export function CouponManager({ coupons, filters, basePath, isPlatform, commissionRate, suggestedCode, codePrefix, audienceNote }: {
    coupons: Paginated<CouponRow>;
    filters: { search?: string };
    basePath: string;
    isPlatform: boolean;
    commissionRate: number;
    suggestedCode: string;
    codePrefix: string;
    audienceNote: string;
}) {
    const [search, setSearch]       = useState(filters.search ?? '');
    const [editing, setEditing]     = useState<CouponRow | null>(null);
    const [formOpen, setFormOpen]   = useState(false);
    const [form, setForm]           = useState<FormState>(emptyForm(suggestedCode));
    const [errors, setErrors]       = useState<Record<string, string>>({});
    const [saving, setSaving]       = useState(false);
    const [deleting, setDeleting]   = useState<CouponRow | null>(null);

    function openCreate() {
        setEditing(null);
        setForm(emptyForm(suggestedCode));
        setErrors({});
        setFormOpen(true);
    }

    function openEdit(c: CouponRow) {
        setEditing(c);
        setForm({
            code: c.code, scope: c.scope, discount_type: c.discount_type, discount_value: String(c.discount_value),
            min_order_amount: String(c.min_order_amount), max_discount_amount: c.max_discount_amount != null ? String(c.max_discount_amount) : '',
            max_uses: c.max_uses != null ? String(c.max_uses) : '', max_uses_per_user: String(c.max_uses_per_user),
            starts_at: c.starts_at ?? '', expires_at: c.expires_at ?? '', is_active: c.is_active,
            admin_share_percent: String(c.admin_share_percent ?? 50),
            seller_commission_during_promo: c.seller_commission_during_promo != null ? String(c.seller_commission_during_promo) : '',
            featured_boost: c.featured_boost ?? true,
        });
        setErrors({});
        setFormOpen(true);
    }

    function set<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((f) => ({ ...f, [key]: value }));
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        const payload = {
            ...form,
            code: form.code.trim().toUpperCase(),
            max_discount_amount: form.discount_type === 'percentage' ? form.max_discount_amount || null : null,
            max_uses: form.max_uses || null,
            min_order_amount: form.min_order_amount || 0,
            starts_at: form.starts_at || null,
            expires_at: form.expires_at || null,
            admin_share_percent: isPlatform ? Number(form.admin_share_percent) || 0 : 0,
            seller_commission_during_promo: isPlatform && form.seller_commission_during_promo !== '' ? form.seller_commission_during_promo : null,
            featured_boost: isPlatform ? form.featured_boost : false,
        };
        const opts = {
            preserveScroll: true,
            onSuccess: () => setFormOpen(false),
            onError: (errs: Record<string, string>) => setErrors(errs),
            onFinish: () => setSaving(false),
        };
        if (editing) router.put(`${basePath}/${editing.id}`, payload, opts);
        else router.post(basePath, payload, opts);
    }

    function visit(params: Record<string, string | number> = {}) {
        router.get(basePath, { search, ...params }, { preserveScroll: true, preserveState: true });
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <form onSubmit={(e) => { e.preventDefault(); visit({ page: 1 }); }} className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code…"
                            className="h-9 w-52 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <Button type="submit" size="sm" variant="secondary">Search</Button>
                    {filters.search && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); router.get(basePath); }}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </form>
                <Button onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" /> Create Coupon</Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    {coupons.data.length === 0 ? (
                        <div className="py-14 text-center text-muted-foreground">
                            <TicketPercent className="mx-auto mb-2 h-8 w-8" />
                            No coupons yet. Create one to run a promo.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                        <th className="px-4 py-2.5 font-medium">Code</th>
                                        <th className="px-4 py-2.5 font-medium">Discount</th>
                                        <th className="px-4 py-2.5 font-medium">Limits</th>
                                        <th className="px-4 py-2.5 font-medium">Valid</th>
                                        <th className="px-4 py-2.5 font-medium">Status</th>
                                        {isPlatform && <th className="px-4 py-2.5 font-medium text-right">Stores</th>}
                                        <th className="px-4 py-2.5 font-medium text-right">Used</th>
                                        <th className="px-4 py-2.5 font-medium text-right">Discount Given</th>
                                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {coupons.data.map((c) => (
                                        <tr key={c.id} className="hover:bg-muted/20">
                                            <td className="px-4 py-3 font-mono font-semibold">
                                                {isPlatform
                                                    ? <Link href={`${basePath}/${c.id}`} className="text-blue-600 hover:underline">{c.code}</Link>
                                                    : c.code}
                                                {isPlatform && (
                                                    <p className="font-sans text-[11px] font-normal text-muted-foreground">
                                                        Admin {c.admin_share_percent}% · {c.seller_commission_during_promo != null ? `${c.seller_commission_during_promo}% promo rate` : 'normal rate'}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{c.label}</p>
                                                <p className="text-xs text-muted-foreground">On {SCOPE_LABELS[c.scope]}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {c.min_order_amount > 0 ? <p>Min {peso(c.min_order_amount)}</p> : <p>No minimum</p>}
                                                <p>{c.max_uses ? `${c.max_uses} total` : 'Unlimited'} · {c.max_uses_per_user}/customer</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                                <p>{c.starts_at ? `From ${c.starts_at}` : 'Starts now'}</p>
                                                <p>{c.expires_at ? `Until ${c.expires_at}` : 'No expiry'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[c.state]}`}>{STATE_LABELS[c.state]}</span>
                                            </td>
                                            {isPlatform && (
                                                <td className="px-4 py-3 text-right" title="Participating stores">{c.participating_stores ?? '—'}</td>
                                            )}
                                            <td className="px-4 py-3 text-right">
                                                {c.used_count}{c.max_uses ? <span className="text-muted-foreground">/{c.max_uses}</span> : ''}
                                            </td>
                                            <td className="px-4 py-3 text-right text-red-600">{c.stats.discount_given > 0 ? `−${peso(c.stats.discount_given)}` : '—'}</td>
                                            <td className="px-4 py-3 text-right font-medium">{c.stats.revenue > 0 ? peso(c.stats.revenue) : '—'}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(c)}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${c.is_active ? 'text-amber-600' : 'text-green-600'}`}
                                                        title={c.is_active ? 'Deactivate' : 'Activate'}
                                                        onClick={() => router.patch(`${basePath}/${c.id}/toggle`, {}, { preserveScroll: true })}>
                                                        <Power className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={() => setDeleting(c)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {coupons.last_page > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{coupons.from}–{coupons.to} of {coupons.total}</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={coupons.current_page === 1} onClick={() => visit({ page: coupons.current_page - 1 })}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-2 py-1 text-sm">{coupons.current_page} / {coupons.last_page}</span>
                        <Button variant="outline" size="sm" disabled={coupons.current_page === coupons.last_page} onClick={() => visit({ page: coupons.current_page + 1 })}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Create / edit */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.code}` : `Create ${isPlatform ? 'Platform' : 'Store'} Coupon`}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_320px]">
                        <div className="space-y-4 text-sm">
                            <Field label="Code" error={errors.code}>
                                <div className="flex gap-2">
                                    <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
                                        className={`${inputCls} font-mono uppercase`} placeholder="WELCOME10" />
                                    <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => set('code', randomCode(codePrefix))}>
                                        <Shuffle className="h-3.5 w-3.5" /> Generate
                                    </Button>
                                </div>
                            </Field>

                            <Field label="Discount applies to" error={errors.scope}>
                                <Radios value={form.scope} onChange={(v) => set('scope', v as CouponScope)}
                                    options={[['product', 'Product'], ['shipping', 'Shipping'], ['both', 'Both']]} />
                            </Field>

                            <Field label="Discount type" error={errors.discount_type}>
                                <Radios value={form.discount_type} onChange={(v) => set('discount_type', v as DiscountType)}
                                    options={[['percentage', 'Percentage'], ['fixed', 'Fixed Amount']]} />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Discount value" error={errors.discount_value}>
                                    <Affixed prefix={form.discount_type === 'fixed' ? '₱' : undefined} suffix={form.discount_type === 'percentage' ? '%' : undefined}>
                                        <input type="number" step="0.01" min="0.01" max={form.discount_type === 'percentage' ? 100 : undefined}
                                            value={form.discount_value} onChange={(e) => set('discount_value', e.target.value)} className={inputCls} />
                                    </Affixed>
                                    {form.discount_type === 'percentage' && <p className="text-xs text-muted-foreground">1–100%</p>}
                                </Field>
                                <Field label="Min order amount" error={errors.min_order_amount}>
                                    <Affixed prefix="₱">
                                        <input type="number" step="0.01" min="0" value={form.min_order_amount}
                                            onChange={(e) => set('min_order_amount', e.target.value)} className={inputCls} />
                                    </Affixed>
                                    <p className="text-xs text-muted-foreground">Items total, before delivery</p>
                                </Field>
                            </div>

                            {form.discount_type === 'percentage' && (
                                <Field label="Max discount cap (optional)" error={errors.max_discount_amount}>
                                    <Affixed prefix="₱">
                                        <input type="number" step="0.01" min="0" value={form.max_discount_amount}
                                            onChange={(e) => set('max_discount_amount', e.target.value)} className={inputCls} placeholder="No cap" />
                                    </Affixed>
                                    <p className="text-xs text-muted-foreground">Limits the maximum discount amount. E.g., 10% off but max ₱100.</p>
                                </Field>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Max total uses" error={errors.max_uses}>
                                    <input type="number" min="1" value={form.max_uses} onChange={(e) => set('max_uses', e.target.value)}
                                        className={inputCls} placeholder="Unlimited" />
                                </Field>
                                <Field label="Max uses per customer" error={errors.max_uses_per_user}>
                                    <input type="number" min="1" value={form.max_uses_per_user} onChange={(e) => set('max_uses_per_user', e.target.value)} className={inputCls} />
                                </Field>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Start date" error={errors.starts_at}>
                                    <input type="date" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={inputCls} />
                                    <p className="text-xs text-muted-foreground">Blank = starts immediately</p>
                                </Field>
                                <Field label="Expiry date" error={errors.expires_at}>
                                    <input type="date" value={form.expires_at} min={form.starts_at || undefined} onChange={(e) => set('expires_at', e.target.value)} className={inputCls} />
                                    <p className="text-xs text-muted-foreground">Blank = never expires</p>
                                </Field>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                                <div>
                                    <p className="font-medium">Active</p>
                                    <p className="text-xs text-muted-foreground">
                                        {editing ? 'Customers can use it while active.' : `Customers can use it while active. ${audienceNote}`}
                                    </p>
                                </div>
                                <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} />
                            </div>

                            {isPlatform && (
                                <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                                    <p className="font-semibold">Cost Sharing</p>
                                    <Field label={`Admin covers: ${form.admin_share_percent}% of discount`} error={errors.admin_share_percent}>
                                        <input type="range" min="0" max="100" step="5" value={form.admin_share_percent}
                                            onChange={(e) => set('admin_share_percent', e.target.value)} className="w-full accent-emerald-600" />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Admin covers {form.admin_share_percent}%</span>
                                            <span>Seller covers {100 - (Number(form.admin_share_percent) || 0)}%</span>
                                        </div>
                                    </Field>
                                    <Field label={`Commission rate during promo (normal: ${commissionRate}%)`} error={errors.seller_commission_during_promo}>
                                        <Affixed suffix="%">
                                            <input type="number" step="0.01" min="0" max="100" value={form.seller_commission_during_promo}
                                                onChange={(e) => set('seller_commission_during_promo', e.target.value)} className={inputCls}
                                                placeholder={`${commissionRate} (no change)`} />
                                        </Affixed>
                                        <p className="text-xs text-muted-foreground">Charged to participating stores on orders that use this coupon.</p>
                                    </Field>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">Feature participating stores</p>
                                            <p className="text-xs text-muted-foreground">Promo badge on their products and listed first while the promo runs.</p>
                                        </div>
                                        <Toggle checked={form.featured_boost} onChange={(v) => set('featured_boost', v)} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <LivePreview form={form} isPlatform={isPlatform} commissionRate={commissionRate} />

                        <DialogFooter className="md:col-span-2">
                            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Coupon'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete coupon {deleting?.code}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Customers will no longer be able to use it. Orders that already used it keep their discount.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                            onClick={() => { if (deleting) router.delete(`${basePath}/${deleting.id}`, { preserveScroll: true }); setDeleting(null); }}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ── Live preview calculator ──────────────────────────────────────────────────

function LivePreview({ form, isPlatform, commissionRate }: { form: FormState; isPlatform: boolean; commissionRate: number }) {
    const [items, setItems] = useState('1000');
    const [fee, setFee]     = useState('50');

    const product  = Math.max(0, Number(items) || 0);
    const shipping = Math.max(0, Number(fee) || 0);
    const minOrder = Number(form.min_order_amount) || 0;
    const qualifies = product >= minOrder;

    const d = qualifies
        ? calculateDiscount({
            scope: form.scope,
            discount_type: form.discount_type,
            discount_value: Number(form.discount_value) || 0,
            max_discount_amount: form.discount_type === 'percentage' && form.max_discount_amount ? Number(form.max_discount_amount) : null,
        }, product, shipping)
        : { product: 0, shipping: 0, total: 0 };

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const pays = r2(product + shipping - d.total);
    const capped = form.discount_type === 'percentage' && !!form.max_discount_amount
        && (Number(form.discount_value) || 0) / 100 * (form.scope === 'shipping' ? shipping : form.scope === 'both' ? product + shipping : product) > Number(form.max_discount_amount);

    // Cost sharing (platform coupons)
    const share      = isPlatform ? Math.min(100, Math.max(0, Number(form.admin_share_percent) || 0)) : 0;
    const cost       = splitCost(isPlatform ? 'platform' : 'store', d.total, share);
    const promoRate  = isPlatform && form.seller_commission_during_promo !== '' ? Number(form.seller_commission_during_promo) || 0 : commissionRate;
    // Commission is always charged on the original items price (before the coupon)
    const normalCommission = r2((product * commissionRate) / 100);
    const grossCommission  = r2((product * promoRate) / 100);
    const netCommission    = r2(grossCommission - cost.admin);
    const storeKeeps       = r2(pays - netCommission);

    return (
        <div className="h-fit space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/20 md:sticky md:top-0">
            <p className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-200"><Calculator className="h-4 w-4" /> Live Preview</p>

            <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs">
                    Example order
                    <Affixed prefix="₱"><input type="number" min="0" value={items} onChange={(e) => setItems(e.target.value)} className={inputCls} /></Affixed>
                </label>
                <label className="grid gap-1 text-xs">
                    Delivery fee
                    <Affixed prefix="₱"><input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} /></Affixed>
                </label>
            </div>

            <p className="text-xs text-muted-foreground">Example on a {peso(product)} order with {peso(shipping)} delivery fee:</p>

            <div className="space-y-1 rounded-lg bg-white p-3 dark:bg-card">
                <Line label="Items" value={peso(product)} />
                <Line label="Delivery fee" value={peso(shipping)} />
                {!qualifies ? (
                    <p className="py-1 text-xs font-medium text-amber-700">Coupon not applied — below the {peso(minOrder)} minimum order.</p>
                ) : (
                    <>
                        <Line label="Discount" value={`−${peso(d.total)}`} className="font-semibold text-red-600" />
                        {form.scope === 'both' && (
                            <p className="text-[11px] text-muted-foreground">{peso(d.product)} on items · {peso(d.shipping)} on delivery</p>
                        )}
                        {capped && <p className="text-[11px] text-amber-700">Capped at {peso(Number(form.max_discount_amount))}</p>}
                    </>
                )}
                <div className="mt-1 border-t pt-1.5">
                    <Line label="Customer pays" value={peso(pays)} className="text-base font-bold" />
                </div>
            </div>

            <div className="space-y-1 rounded-lg bg-white p-3 text-xs dark:bg-card">
                <p className="font-semibold">Who pays for the discount</p>
                <Line label={`Admin absorbs (${share}%)`} value={peso(cost.admin)} className={isPlatform ? 'text-green-700' : 'text-muted-foreground'} />
                <Line label={`Seller absorbs (${100 - share}%)`} value={peso(cost.seller)} className="text-red-600" />
            </div>

            <div className="space-y-1 rounded-lg bg-white p-3 text-xs dark:bg-card">
                <p className="font-semibold">Store's side</p>
                <Line label="Receives from customer" value={peso(pays)} />
                {isPlatform ? (
                    <>
                        <Line label={`Promo commission ${promoRate}% of ${peso(product)}`} value={`−${peso(grossCommission)}`} className="text-red-600" />
                        {promoRate !== commissionRate && (
                            <p className="text-[11px] text-muted-foreground">Normally {commissionRate}% = {peso(normalCommission)}</p>
                        )}
                        <Line label="Admin's share credited back" value={`+${peso(cost.admin)}`} className="text-green-700" />
                        <Line label="Net commission" value={netCommission < 0 ? `${peso(Math.abs(netCommission))} credit` : peso(netCommission)}
                            className={netCommission < 0 ? 'font-semibold text-green-700' : 'font-semibold'} />
                    </>
                ) : (
                    <Line label={`Commission ${commissionRate}% of original ${peso(product)}`} value={`−${peso(normalCommission)}`} className="text-red-600" />
                )}
                <div className="border-t pt-1">
                    <Line label="Store keeps" value={peso(isPlatform ? storeKeeps : r2(pays - normalCommission))} className="font-semibold" />
                </div>
                <p className="text-muted-foreground">
                    {isPlatform
                        ? "The admin's share is credited against the store's commission; a negative net is carried as a credit to the next commission invoice."
                        : 'Your store funds this discount — commission is still based on the original price.'}
                </p>
            </div>
        </div>
    );
}

// ── Small form helpers ───────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <label className="text-xs font-medium">{label}</label>
            {children}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}

function Radios({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(([v, label]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-1.5 ${value === v ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700'}`}>
                    <input type="radio" checked={value === v} onChange={() => onChange(v)} />
                    {label}
                </label>
            ))}
        </div>
    );
}

function Affixed({ prefix, suffix, children }: { prefix?: string; suffix?: string; children: React.ReactNode }) {
    return (
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
            <div className={`${prefix ? '[&_input]:pl-7' : ''} ${suffix ? '[&_input]:pr-8' : ''}`}>{children}</div>
            {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
        </div>
    );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );
}

function Line({ label, value, className = '' }: { label: string; value: string; className?: string }) {
    return (
        <div className={`flex justify-between gap-2 ${className}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
