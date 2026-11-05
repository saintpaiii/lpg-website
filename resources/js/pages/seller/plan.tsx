import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, CalendarClock, Car, ChevronLeft, ChevronRight, Crown, FileDown, Loader2, Package, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PlanCardButton, PlanCards, peso } from '@/components/plan-cards';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { planStatus } from '@/lib/plans';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import type { CatalogPlan, PlanCatalog, PlanKey, PlanSummary } from '@/types/plans';

type PaymentRow = {
    id: number;
    receipt_number: string | null;
    plan: string;
    amount: number;
    method: 'paymongo' | 'cash' | 'trial' | 'gift';
    method_label: string;
    period: string;
    paid_at: string | null;
    status: 'paid' | 'pending' | 'cancelled';
    notes: string | null;
};

type Props = {
    plan: PlanSummary;
    catalog: PlanCatalog;
    usage: { products: number; staff: number; vehicles: number };
    payments: { data: PaymentRow[]; current_page: number; last_page: number; total: number };
    choose: PlanKey | null;
    paused: { products: number; staff: number; vehicles: number };
    /** SubscriptionService::previewPause per plan — null when nothing would change */
    previews: Partial<Record<PlanKey, PausePreview | null>>;
};

type PausePreview = {
    products: number;
    staff: number;
    vehicles: number;
    product_names: string[];
    staff_names: string[];
    vehicle_names: string[];
    locked_features: string[];
    /** No rider who can deliver would remain → products hidden from customers */
    hides_store?: boolean;
    usage: { products: number; staff: number; vehicles: number };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const listPhrase = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''));

/** "15 of your 30 published products, 5 staff accounts and 2 vehicles" */
function pausePhrase(p: PausePreview): string {
    return listPhrase([
        p.products > 0 && `${p.products} of your ${p.usage.products} published products`,
        p.staff > 0 && plural(p.staff, 'staff account', 'staff accounts'),
        p.vehicles > 0 && plural(p.vehicles, 'vehicle', 'vehicles'),
    ].filter(Boolean) as string[]);
}

/** "Products: A, B, C +2 more" */
const namesLine = (label: string, names: string[], total: number) =>
    names.length > 0 ? `${label}: ${names.join(', ')}${total > names.length ? ` +${total - names.length} more` : ''}` : null;

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Plan', href: '/seller/plan' }];

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function UsageBar({ icon: Icon, label, used, limit, paused = 0, pausedHref }: {
    icon: typeof Package; label: string; used: number; limit: number | null; paused?: number; pausedHref?: string;
}) {
    const pct = limit == null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
    const over = limit != null && used > limit;
    const full = limit != null && used >= limit;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium"><Icon className="h-4 w-4 text-muted-foreground" /> {label}</span>
                <span className={cn('tabular-nums', over && 'font-semibold text-red-600')}>{used} / {limit == null ? 'Unlimited' : limit}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', limit == null ? 'w-full bg-emerald-400/50' : over ? 'bg-red-500' : full ? 'bg-amber-500' : 'bg-blue-600')}
                    style={limit == null ? undefined : { width: `${pct}%` }} />
            </div>
            {paused > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                    {paused} paused (plan limit)
                    {pausedHref && <> · <Link href={pausedHref} className="font-medium underline">View</Link></>}
                </p>
            )}
        </div>
    );
}

export default function SellerPlan({ plan, catalog, usage, payments, choose, paused, previews }: Props) {
    const [confirming, setConfirming] = useState<CatalogPlan | null>(null);
    // A plan that pauses / locks something needs "I understand" before paying
    const [understood, setUnderstood] = useState(false);
    const preview = confirming ? (previews?.[confirming.key] ?? null) : null;
    const pausesSomething = !!preview && preview.products + preview.staff + preview.vehicles > 0;
    const open = (p: CatalogPlan) => { setError(null); setUnderstood(false); setConfirming(p); };
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const status = planStatus(plan);

    // ?choose=pro (from the popup) opens the confirm dialog for that plan
    useEffect(() => {
        const p = choose ? catalog.plans.find((x) => x.key === choose) : null;
        if (p) open(p);
    }, [choose]); // eslint-disable-line react-hooks/exhaustive-deps

    const totalDays = catalog.days;
    const progress = plan.active ? Math.min(100, Math.round((plan.days_left / totalDays) * 100)) : 0;

    function actionLabel(p: CatalogPlan): string {
        if (plan.active && plan.key === p.key) return 'Extend 30 days';
        if (plan.active && !plan.is_trial) return `Switch to ${p.name}`;
        return `Choose ${p.name}`;
    }

    async function pay() {
        if (!confirming) return;
        setPaying(true);
        setError(null);
        try {
            const res = await axios.post<{ checkout_url: string }>('/seller/plan/checkout', { plan_key: confirming.key });
            window.location.href = res.data.checkout_url;
        } catch (e: any) {
            setError(e?.response?.data?.message ?? 'Could not start payment. Please try again later.');
            setPaying(false);
        }
    }

    // Confirm dialog numbers
    const samePlan = !!confirming && plan.active && plan.key === confirming.key;
    const switching = !!confirming && plan.active && !samePlan;
    const newEnd = (() => {
        if (!confirming) return '';
        const base = samePlan && plan.expires_at ? new Date(plan.expires_at) : new Date();
        base.setDate(base.getDate() + totalDays);
        return fmtDate(base);
    })();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Plan" />
            <div className="space-y-6 p-4 sm:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold"><Crown className="h-6 w-6 text-amber-500" /> My Plan</h1>
                    <p className="text-sm text-muted-foreground">No commission — your store keeps 100% of its sales. Plans are prepaid for 30 days and never renew by themselves.</p>
                </div>

                {/* Current plan */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardContent className="space-y-4 pt-6">
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="text-2xl font-bold">{plan.active ? plan.name : (plan.last_name ?? 'No plan')}</p>
                                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', status.cls)}>{status.label}</span>
                            </div>
                            {plan.active ? (
                                <>
                                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <CalendarClock className="h-4 w-4" />
                                        Active until <strong className="text-foreground">{plan.expires_label}</strong> · {plan.days_left} day{plan.days_left === 1 ? '' : 's'} left
                                    </p>
                                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                                        <div className={cn('h-full rounded-full', plan.days_left <= 3 ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${progress}%` }} />
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p>
                                        {plan.last_key === 'none' ? 'Your store has no plan yet. ' : `Your plan ended on ${plan.expires_label}. `}
                                        Your products are hidden from customers. Choose a plan below to reopen your store.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Usage</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <UsageBar icon={Package} label="Published products" used={usage.products} limit={plan.limits.products}
                                paused={paused.products} pausedHref="/seller/products?tab=paused" />
                            <UsageBar icon={Users} label="Staff accounts" used={usage.staff} limit={plan.limits.staff}
                                paused={paused.staff} pausedHref="/seller/staff?tab=paused" />
                            <UsageBar icon={Car} label="Vehicles" used={usage.vehicles} limit={plan.limits.vehicles}
                                paused={paused.vehicles} pausedHref="/seller/vehicles?filter=paused" />
                        </CardContent>
                    </Card>
                </div>

                {/* Plans */}
                <div className="space-y-3 pt-2">
                    <h2 className="text-lg font-semibold">Plans</h2>
                    <PlanCards
                        catalog={catalog}
                        currentKey={plan.active ? (plan.is_trial ? null : plan.key) : null}
                        renderAction={(p) => (
                            <PlanCardButton variant={plan.active && plan.key === p.key ? 'default' : 'outline'} onClick={() => open(p)}>
                                {actionLabel(p)}
                            </PlanCardButton>
                        )}
                    />
                </div>

                {/* History */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        {payments.data.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-2.5">Receipt #</th>
                                            <th className="px-4 py-2.5">Plan</th>
                                            <th className="px-4 py-2.5 text-right">Amount</th>
                                            <th className="px-4 py-2.5">Method</th>
                                            <th className="px-4 py-2.5">Period</th>
                                            <th className="px-4 py-2.5">Paid on</th>
                                            <th className="px-4 py-2.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {payments.data.map((p) => (
                                            <tr key={p.id}>
                                                <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_number ?? '—'}</td>
                                                <td className="px-4 py-2.5">{p.plan}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{peso(p.amount)}</td>
                                                <td className="px-4 py-2.5">{p.method_label}</td>
                                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.period}</td>
                                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                                                    {p.status === 'pending' ? <span className="text-amber-600">Waiting for payment</span> : p.paid_at}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {p.status === 'paid' && p.receipt_number && (
                                                        <a href={`/seller/plan/receipts/${p.id}/pdf`} target="_blank" rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                                                            <FileDown className="h-3.5 w-3.5" /> Receipt
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {payments.last_page > 1 && (
                            <div className="flex items-center justify-end gap-2 border-t px-4 py-2">
                                <Button variant="outline" size="sm" disabled={payments.current_page === 1}
                                    onClick={() => router.get('/seller/plan', { page: payments.current_page - 1 }, { preserveScroll: true })}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm">{payments.current_page} / {payments.last_page}</span>
                                <Button variant="outline" size="sm" disabled={payments.current_page === payments.last_page}
                                    onClick={() => router.get('/seller/plan', { page: payments.current_page + 1 }, { preserveScroll: true })}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Confirm before paying */}
            <Dialog open={!!confirming} onOpenChange={(o) => { if (!o && !paying) setConfirming(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{confirming ? actionLabel(confirming) : ''}</DialogTitle>
                        <DialogDescription>You'll pay on PayMongo (GCash, Maya, card or GrabPay).</DialogDescription>
                    </DialogHeader>
                    {confirming && (
                        <div className="space-y-3 text-sm">
                            {samePlan ? (
                                <p>This adds 30 days. New end date: <strong>{newEnd}</strong>.</p>
                            ) : switching ? (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p>
                                        Your {plan.name} plan ({plan.days_left} day{plan.days_left === 1 ? '' : 's'} left) will end today and {confirming.name} starts
                                        now for 30 days (until <strong>{newEnd}</strong>). Remaining days are not refunded.
                                    </p>
                                </div>
                            ) : (
                                <p>{confirming.name} starts now for 30 days, until <strong>{newEnd}</strong>.</p>
                            )}
                            {/* What this plan pauses / locks (nothing is deleted) */}
                            {preview && (
                                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    <p className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <span>
                                            With {confirming.name}:{' '}
                                            {pausesSomething && `${pausePhrase(preview)} will be paused (not deleted). You can choose which ones stay active afterwards. `}
                                            {preview.locked_features.length > 0 && `${listPhrase(preview.locked_features)} will be locked.`}
                                            {preview.hides_store && ' No rider who can deliver would stay active — your products would be hidden from customers.'}
                                        </span>
                                    </p>
                                    {pausesSomething && (
                                        <ul className="space-y-0.5 pl-6 text-xs opacity-90">
                                            {[
                                                namesLine('Products', preview.product_names, preview.products),
                                                namesLine('Staff', preview.staff_names, preview.staff),
                                                namesLine('Vehicles', preview.vehicle_names, preview.vehicles),
                                            ].filter(Boolean).map((line) => <li key={line}>{line}</li>)}
                                        </ul>
                                    )}
                                    <label className="flex cursor-pointer items-center gap-2 pl-6 font-medium">
                                        <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
                                        I understand
                                    </label>
                                </div>
                            )}
                            <p className="text-base">Amount: <strong>{peso(confirming.price)}</strong></p>
                            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setConfirming(null)} disabled={paying}>Cancel</Button>
                        <Button onClick={pay} disabled={paying || (!!preview && !understood)}>
                            {paying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                            {paying ? 'Opening PayMongo…' : `Pay ${confirming ? peso(confirming.price) : ''}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
