import { Head, Link, router, useForm } from '@inertiajs/react';
import { CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Crown, FileDown, Gift, HandCoins, Hourglass, PhilippinePeso, Search, Store, Wallet, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { peso } from '@/components/plan-cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { ADMIN_PLAN_STATUS } from '@/lib/plans';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import type { CatalogPlan, PlanCatalog } from '@/types/plans';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard',     href: '/admin/dashboard' },
    { title: 'Subscriptions', href: '/admin/subscriptions' },
];

type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number };

type StoreRow = {
    id: number;
    store_name: string;
    city: string | null;
    plan_key: string;
    plan: string;
    status: 'trial' | 'active' | 'ending' | 'expired' | 'none';
    expires: string | null;
    days_left: number;
    total_paid: number;
};

type PaymentRow = {
    id: number;
    receipt_number: string | null;
    store_id: number;
    store_name: string;
    plan: string;
    amount: number;
    method: 'paymongo' | 'cash' | 'trial' | 'gift';
    method_label: string;
    reference: string | null;
    period: string;
    paid_at: string | null;
    status: string;
    notes: string | null;
};

type Props = {
    tab: 'stores' | 'payments' | 'plans';
    summary: { income_month: number; income_total: number; active_paid: number; on_trial: number; ending_soon: number; expired: number };
    stores: Paginated<StoreRow> | null;
    payments: Paginated<PaymentRow> | null;
    plans: PlanCatalog;
    filters: { search?: string; plan?: string; status?: string; date_from?: string; date_to?: string; method?: string };
};

const METHOD_STYLES: Record<string, string> = {
    paymongo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    cash:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    trial:    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    gift:     'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function Pager({ page, onPage }: { page: Paginated<unknown>; onPage: (n: number) => void }) {
    if (page.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-2">
            <Button variant="outline" size="sm" disabled={page.current_page === 1} onClick={() => onPage(page.current_page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm">{page.current_page} / {page.last_page}</span>
            <Button variant="outline" size="sm" disabled={page.current_page === page.last_page} onClick={() => onPage(page.current_page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
    );
}

export default function AdminSubscriptions({ tab, summary, stores, payments, plans, filters }: Props) {
    const [f, setF] = useState({ search: filters.search ?? '', plan: filters.plan ?? '', status: filters.status ?? '',
        date_from: filters.date_from ?? '', date_to: filters.date_to ?? '', method: filters.method ?? '' });
    const [giveFor, setGiveFor] = useState<StoreRow | null>(null);
    const [cashFor, setCashFor] = useState<StoreRow | null>(null);

    function visit(params: Record<string, string | number> = {}) {
        router.get('/admin/subscriptions', { tab, ...f, ...params }, { preserveScroll: true, preserveState: true });
    }

    function goTab(t: Props['tab']) {
        router.get('/admin/subscriptions', { tab: t }, { preserveScroll: true });
    }

    const cards = [
        { label: 'Income this month', value: peso(summary.income_month), icon: PhilippinePeso, color: 'text-emerald-600' },
        { label: 'Income all time',   value: peso(summary.income_total), icon: Wallet,         color: 'text-emerald-700' },
        { label: 'Active paid stores', value: summary.active_paid,       icon: Crown,          color: 'text-blue-600' },
        { label: 'On trial',          value: summary.on_trial,           icon: Gift,           color: 'text-violet-600' },
        { label: 'Ending in ≤ 3 days', value: summary.ending_soon,       icon: Hourglass,      color: 'text-amber-600' },
        { label: 'Expired',           value: summary.expired,            icon: CalendarClock,  color: 'text-red-600' },
    ];

    const exportQs = new URLSearchParams({ date_from: f.date_from, date_to: f.date_to, method: f.method, search: f.search }).toString();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Subscriptions" />
            <div className="space-y-5 p-4 sm:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold"><Crown className="h-6 w-6 text-amber-500" /> Subscriptions</h1>
                    <p className="text-sm text-muted-foreground">Store plans and plan income. Stores without an active plan are hidden from customers.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {cards.map(({ label, value, icon: Icon, color }) => (
                        <Card key={label}>
                            <CardContent className="pt-5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs text-muted-foreground">{label}</p>
                                    <Icon className={cn('h-4 w-4', color)} />
                                </div>
                                <p className={cn('mt-1 text-xl font-bold', color)}>{value}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="flex gap-1 border-b">
                    {([['stores', 'Stores'], ['payments', 'Payments'], ['plans', 'Plans']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Stores ── */}
                {tab === 'stores' && stores && (
                    <Card>
                        <CardHeader className="pb-3">
                            <form onSubmit={(e) => { e.preventDefault(); visit({ page: 1 }); }} className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search store…" className="h-9 w-52 pl-8" />
                                </div>
                                <select className={selectCls} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
                                    <option value="">All plans</option>
                                    <option value="trial">Free trial</option>
                                    {plans.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                                    <option value="none">No plan</option>
                                </select>
                                <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                                    <option value="">All statuses</option>
                                    {Object.entries(ADMIN_PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                                <Button type="submit" size="sm" variant="secondary">Apply</Button>
                            </form>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-2.5">Store</th>
                                            <th className="px-4 py-2.5">Plan</th>
                                            <th className="px-4 py-2.5">Status</th>
                                            <th className="px-4 py-2.5">Expires</th>
                                            <th className="px-4 py-2.5 text-right">Days left</th>
                                            <th className="px-4 py-2.5 text-right">Total paid</th>
                                            <th className="px-4 py-2.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stores.data.length === 0 && (
                                            <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No stores found.</td></tr>
                                        )}
                                        {stores.data.map((s) => (
                                            <tr key={s.id} className="hover:bg-muted/20">
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/admin/stores/${s.id}`} className="font-medium text-blue-600 hover:underline">{s.store_name}</Link>
                                                    {s.city && <p className="text-xs text-muted-foreground">{s.city}</p>}
                                                </td>
                                                <td className="px-4 py-2.5">{s.plan}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ADMIN_PLAN_STATUS[s.status]?.cls)}>{ADMIN_PLAN_STATUS[s.status]?.label}</span>
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{s.expires ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{s.status === 'expired' || s.status === 'none' ? '—' : s.days_left}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{peso(s.total_paid)}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setGiveFor(s)}>
                                                            <CalendarPlus className="h-3.5 w-3.5" /> Give free days
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setCashFor(s)}>
                                                            <HandCoins className="h-3.5 w-3.5" /> Record cash
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pager page={stores} onPage={(n) => visit({ page: n })} />
                        </CardContent>
                    </Card>
                )}

                {/* ── Payments ── */}
                {tab === 'payments' && payments && (
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <form onSubmit={(e) => { e.preventDefault(); visit({ page: 1 }); }} className="flex flex-wrap items-end gap-2">
                                    <div className="grid gap-1">
                                        <Label className="text-xs">Search</Label>
                                        <Input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Store or receipt #" className="h-9 w-48" />
                                    </div>
                                    <div className="grid gap-1">
                                        <Label className="text-xs">From</Label>
                                        <Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} className="h-9 w-40" />
                                    </div>
                                    <div className="grid gap-1">
                                        <Label className="text-xs">To</Label>
                                        <Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} className="h-9 w-40" />
                                    </div>
                                    <div className="grid gap-1">
                                        <Label className="text-xs">Method</Label>
                                        <select className={selectCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                                            <option value="">All methods</option>
                                            <option value="paymongo">PayMongo</option>
                                            <option value="cash">Cash</option>
                                            <option value="trial">Free trial</option>
                                            <option value="gift">Free days</option>
                                        </select>
                                    </div>
                                    <Button type="submit" size="sm" variant="secondary">Apply</Button>
                                </form>
                                <div className="flex gap-2">
                                    <a href={`/admin/subscriptions/export?format=csv&${exportQs}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
                                        <FileDown className="h-4 w-4" /> CSV
                                    </a>
                                    <a href={`/admin/subscriptions/export?format=pdf&${exportQs}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
                                        <FileDown className="h-4 w-4" /> PDF
                                    </a>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-2.5">Receipt #</th>
                                            <th className="px-4 py-2.5">Store</th>
                                            <th className="px-4 py-2.5">Plan</th>
                                            <th className="px-4 py-2.5 text-right">Amount</th>
                                            <th className="px-4 py-2.5">Method</th>
                                            <th className="px-4 py-2.5">Period</th>
                                            <th className="px-4 py-2.5">Paid at</th>
                                            <th className="px-4 py-2.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {payments.data.length === 0 && (
                                            <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No payments found.</td></tr>
                                        )}
                                        {payments.data.map((p) => (
                                            <tr key={p.id} className="hover:bg-muted/20">
                                                <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_number ?? '—'}</td>
                                                <td className="px-4 py-2.5"><Link href={`/admin/stores/${p.store_id}`} className="text-blue-600 hover:underline">{p.store_name}</Link></td>
                                                <td className="px-4 py-2.5">{p.plan}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{peso(p.amount)}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', METHOD_STYLES[p.method])} title={p.notes ?? p.reference ?? undefined}>{p.method_label}</span>
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.period}</td>
                                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.paid_at}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {p.receipt_number && (
                                                        <a href={`/admin/subscriptions/payments/${p.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                                                            <FileDown className="h-3.5 w-3.5" /> Receipt
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pager page={payments} onPage={(n) => visit({ page: n })} />
                        </CardContent>
                    </Card>
                )}

                {/* ── Plans ── */}
                {tab === 'plans' && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Price changes apply to the next purchase only. Empty limit = unlimited.</p>
                        <div className="grid gap-4 md:grid-cols-3">
                            {plans.plans.map((p) => <PlanEditor key={p.key} plan={p} catalog={plans} />)}
                        </div>
                    </div>
                )}
            </div>

            {/* Give free days */}
            <GiveDaysDialog store={giveFor} onClose={() => setGiveFor(null)} />
            {/* Record cash payment */}
            <RecordCashDialog store={cashFor} plans={plans.plans} onClose={() => setCashFor(null)} />
        </AppLayout>
    );
}

function GiveDaysDialog({ store, onClose }: { store: StoreRow | null; onClose: () => void }) {
    const form = useForm({ days: '7', reason: '' });

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!store) return;
        form.post(`/admin/subscriptions/stores/${store.id}/give-days`, {
            preserveScroll: true,
            onSuccess: () => { form.reset(); onClose(); },
        });
    }

    return (
        <Dialog open={!!store} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Give free days — {store?.store_name}</DialogTitle>
                    <DialogDescription>
                        {store && (store.status === 'expired' || store.status === 'none')
                            ? 'The store gets its last paid plan (Basic if it never paid) from today.'
                            : 'The days are added after the current end date.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="gd-days">Days (1–90)</Label>
                        <Input id="gd-days" type="number" min={1} max={90} value={form.data.days} onChange={(e) => form.setData('days', e.target.value)} />
                        {form.errors.days && <p className="text-xs text-red-600">{form.errors.days}</p>}
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="gd-reason">Reason</Label>
                        <Input id="gd-reason" value={form.data.reason} maxLength={255} onChange={(e) => form.setData('reason', e.target.value)} placeholder="e.g. Compensation for downtime" />
                        {form.errors.reason && <p className="text-xs text-red-600">{form.errors.reason}</p>}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={form.processing}>Give {form.data.days || 0} day(s)</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RecordCashDialog({ store, plans, onClose }: { store: StoreRow | null; plans: CatalogPlan[]; onClose: () => void }) {
    const form = useForm({ plan_key: 'basic', reference: '' });
    const chosen = plans.find((p) => p.key === form.data.plan_key);

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!store) return;
        form.post(`/admin/subscriptions/stores/${store.id}/record-cash`, {
            preserveScroll: true,
            onSuccess: () => { form.reset(); onClose(); },
        });
    }

    return (
        <Dialog open={!!store} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Record cash payment — {store?.store_name}</DialogTitle>
                    <DialogDescription>Same plan while active → 30 days are added. A different plan starts today.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="rc-plan">Plan</Label>
                        <select id="rc-plan" className={cn(selectCls, 'w-full')} value={form.data.plan_key} onChange={(e) => form.setData('plan_key', e.target.value)}>
                            {plans.map((p) => <option key={p.key} value={p.key}>{p.name} — {peso(p.price)}</option>)}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="rc-ref">Reference (optional)</Label>
                        <Input id="rc-ref" value={form.data.reference} maxLength={100} onChange={(e) => form.setData('reference', e.target.value)} placeholder="OR number, bank ref…" />
                        {form.errors.reference && <p className="text-xs text-red-600">{form.errors.reference}</p>}
                    </div>
                    <p className="text-sm">Amount: <strong>{chosen ? peso(chosen.price) : '—'}</strong></p>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={form.processing}>Record payment</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function PlanEditor({ plan, catalog }: { plan: CatalogPlan; catalog: PlanCatalog }) {
    const form = useForm({
        price: String(plan.price),
        max_products: plan.limits.products != null ? String(plan.limits.products) : '',
        max_staff: plan.limits.staff != null ? String(plan.limits.staff) : '',
        max_vehicles: plan.limits.vehicles != null ? String(plan.limits.vehicles) : '',
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!plan.id) return;
        form.transform((d) => ({
            price: d.price,
            max_products: d.max_products === '' ? null : d.max_products,
            max_staff: d.max_staff === '' ? null : d.max_staff,
            max_vehicles: d.max_vehicles === '' ? null : d.max_vehicles,
        }));
        form.put(`/admin/subscriptions/plans/${plan.id}`, { preserveScroll: true });
    }

    const limitField = (key: 'max_products' | 'max_staff' | 'max_vehicles', label: string) => (
        <div className="grid gap-1">
            <Label className="text-xs">{label}</Label>
            <Input type="number" min={1} max={10000} placeholder="Unlimited" value={form.data[key]} onChange={(e) => form.setData(key, e.target.value)} />
            {form.errors[key] && <p className="text-xs text-red-600">{form.errors[key]}</p>}
        </div>
    );

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4 text-blue-600" /> {plan.name}</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid gap-1">
                        <Label className="text-xs">Price per {catalog.days} days (₱)</Label>
                        <Input type="number" min={0} max={100000} step="0.01" value={form.data.price} onChange={(e) => form.setData('price', e.target.value)} />
                        {form.errors.price && <p className="text-xs text-red-600">{form.errors.price}</p>}
                    </div>
                    {limitField('max_products', 'Max published products')}
                    {limitField('max_staff', 'Max staff accounts (riders count)')}
                    {limitField('max_vehicles', 'Max vehicles')}
                    <ul className="space-y-1 border-t pt-3 text-xs">
                        {Object.entries(catalog.feature_labels).map(([key, label]) => {
                            const has = plan.features.includes(key);
                            return (
                                <li key={key} className={cn('flex items-center gap-1.5', !has && 'text-muted-foreground')}>
                                    {has ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-gray-400" />} {label}
                                </li>
                            );
                        })}
                    </ul>
                    <Button type="submit" className="w-full" disabled={form.processing || !form.isDirty}>Save {plan.name}</Button>
                </form>
            </CardContent>
        </Card>
    );
}
