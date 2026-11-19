import { Head, router } from '@inertiajs/react';
import { AlertTriangle, ArrowDownUp, Brain, Clock, Download, FileDown, LayoutGrid, Lightbulb, PackageX, RefreshCcw, ShoppingCart, Timer, Truck, UserCheck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NewTransferDialog, TransfersList, type TransferRow } from '@/components/stock-transfers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Row = {
    id: number; name: string; short: string; is_main: boolean; sales: number; delivery_fees?: number; no_cost?: number; prev_sales: number; growth: number | null; orders: number;
    by_status: Record<string, number>; delivered: number; aov: number; cancel_rate: number; cancelled: number; delivery_min: number | null; deliveries: number;
    refunds: number; refund_amount: number; rating: number | null; stock_value: number; low_stock: number; expiring: number; on_duty: number; incoming: number;
    plan: string; plan_active: boolean; days_left: number; alerts: number;
};
type Suggestion = { size: string; quantity: number; from_store_id: number; from_name: string; from_product_id: number; to_store_id: number; to_name: string; to_product_id: number; text: string; why: string };
type Note = { type: string; tone: 'good' | 'bad' | 'warn' | 'info'; store_id: number; text: string; why?: string; suggestion?: number };
type Dashboard = {
    stores: { id: number; name: string; short: string; is_main: boolean }[];
    rows: Row[];
    totals: { sales: number; delivery_fees?: number; no_cost?: number; orders: number; by_status: Record<string, number>; delivered: number; delivery_min: number | null; refunds: number; refund_amount: number; low_stock: number; expiring: number; on_duty: number; stock_value: number } | null;
    charts: { sales: Record<string, number | string>[]; orders: Record<string, number | string>[] };
    notes: Note[];
    suggestions: Suggestion[];
};
type Props = {
    period: { key: string; from: string; to: string; options: Record<string, string> };
    dashboard: Dashboard;
    transfers: TransferRow[];
    activeStoreId: number | null;
    rules: { cancel_rate: number; slow_factor: number; plan_days: number; min_orders: number };
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Main Dashboard', href: '/seller/main-dashboard' }];
const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#4b5563'];
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const TONE: Record<string, string> = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    bad:  'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
};

type SortKey = 'name' | 'sales' | 'orders' | 'aov' | 'cancel_rate' | 'delivery_min' | 'rating' | 'stock_value' | 'days_left' | 'alerts';

export default function MainDashboard({ period, dashboard, transfers, rules }: Props) {
    const [from, setFrom] = useState(period.from);
    const [to, setTo] = useState(period.to);
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'sales', dir: -1 });
    const [transferPreset, setTransferPreset] = useState<Suggestion | null | 'blank'>(null);
    const t = dashboard.totals;

    const rows = useMemo(() => [...dashboard.rows].sort((a, b) => {
        const av = a[sort.key] ?? -1; const bv = b[sort.key] ?? -1;
        return (typeof av === 'string' ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
    }), [dashboard.rows, sort]);

    const go = (key: string, extra: Record<string, string> = {}) => router.get('/seller/main-dashboard', { period: key, ...extra }, { preserveState: true, preserveScroll: true });
    const query = new URLSearchParams({ period: period.key, ...(period.key === 'custom' ? { from: period.from, to: period.to } : {}) }).toString();
    const switchTo = (id: number) => router.post('/seller/switch-store', { store_id: id });
    const th = (key: SortKey, label: string, right = true) => (
        <th className={`cursor-pointer select-none px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
            <span className="inline-flex items-center gap-1">{label}{sort.key === key && <ArrowDownUp className="h-3 w-3" />}</span>
        </th>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Main Dashboard" />
            <div className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><LayoutGrid className="h-6 w-6 text-blue-600" /> Main Dashboard</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">All your stores together — {dashboard.stores.length} approved ({period.from} to {period.to}).</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild><a href={`/seller/main-dashboard/export?format=csv&${query}`}><Download className="mr-1 h-4 w-4" /> CSV</a></Button>
                        <Button variant="outline" size="sm" asChild><a href={`/seller/main-dashboard/export?format=pdf&${query}`} target="_blank" rel="noreferrer"><FileDown className="mr-1 h-4 w-4" /> PDF</a></Button>
                        <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setTransferPreset('blank')} disabled={dashboard.stores.length < 2}>
                            <Truck className="mr-1 h-4 w-4" /> New transfer
                        </Button>
                    </div>
                </div>

                {/* Period */}
                <div className="flex flex-wrap items-center gap-2" data-testid="period-picker">
                    {Object.entries(period.options).filter(([k]) => k !== 'custom').map(([k, label]) => (
                        <Button key={k} size="sm" variant={period.key === k ? 'default' : 'outline'} onClick={() => go(k)}>{label}</Button>
                    ))}
                    <div className="flex flex-wrap items-center gap-1">
                        <Input type="date" className="h-8 w-[9.5rem]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="date" className="h-8 w-[9.5rem]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
                        <Button size="sm" variant={period.key === 'custom' ? 'default' : 'outline'} onClick={() => go('custom', { from, to })}>Apply</Button>
                    </div>
                </div>

                {/* Totals */}
                {t && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="main-totals">
                        <Stat icon={Wallet} label="Sales (delivered + paid)" value={peso(t.sales)} sub={`items + delivery fee · of which delivery fees ${peso(t.delivery_fees ?? 0)}`} />
                        <Stat icon={ShoppingCart} label="Orders" value={String(t.orders)} sub={`${t.delivered} delivered · ${t.by_status.cancelled ?? 0} cancelled · ${t.by_status.pending ?? 0} pending`} />
                        <Stat icon={Timer} label="Avg delivery time" value={t.delivery_min !== null ? `${t.delivery_min} min` : '—'} sub="assigned → delivered" />
                        <Stat icon={RefreshCcw} label="Refund requests" value={String(t.refunds)} sub={peso(t.refund_amount)} />
                        <Stat icon={PackageX} label="Low-stock items" value={String(t.low_stock)} />
                        <Stat icon={AlertTriangle} label="Cylinders expiring ≤ 30 days" value={String(t.expiring)} />
                        <Stat icon={UserCheck} label="Staff on duty now" value={String(t.on_duty)} />
                        <Stat icon={Clock} label="Stock value (at cost where known, else selling price)" value={peso(t.stock_value)}
                            sub={t.no_cost ? `${t.no_cost} product${t.no_cost === 1 ? ' has' : 's have'} no cost yet — receive a purchase order or set a cost` : 'usable stock × unit cost'} />
                    </div>
                )}

                {/* DSS notes */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-violet-600" /> What to look at</CardTitle></CardHeader>
                    <CardContent className="space-y-2" data-testid="main-notes">
                        {dashboard.notes.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>}
                        {dashboard.notes.map((n, i) => (
                            <div key={i} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${TONE[n.tone]}`}>
                                <Lightbulb className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 flex-1">{n.text}{n.why && <span className="block text-xs opacity-80">{n.why}</span>}</span>
                                {n.type === 'transfer' && n.suggestion !== undefined && dashboard.suggestions[n.suggestion] && (
                                    <Button size="sm" variant="outline" onClick={() => setTransferPreset(dashboard.suggestions[n.suggestion as number])}>Create transfer</Button>
                                )}
                                {n.type === 'plan' && <Button size="sm" variant="outline" onClick={() => router.get('/seller/plan', { store: n.store_id })}>Renew</Button>}
                            </div>
                        ))}
                        <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">How these notes are made</summary>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                <li>Growth = sales of this period vs the previous period of the same length.</li>
                                <li>"Check" when {rules.cancel_rate}% or more of a store's orders were cancelled (at least {rules.min_orders} orders), or its deliveries take {rules.slow_factor}× the average of all stores or longer.</li>
                                <li>"Renew" when a store's plan ends within {rules.plan_days} days (or has ended).</li>
                                <li>"Transfer" when one store is at or below its reorder point for a cylinder size while another has more than twice its reorder point — enough to bring the low store to twice its reorder point.</li>
                            </ul>
                        </details>
                    </CardContent>
                </Card>

                {/* Comparison */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Branch comparison</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="rt-cards w-full min-w-[860px] text-sm" data-testid="comparison">
                                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        {th('name', 'Store', false)}{th('sales', 'Sales')}{th('orders', 'Orders')}{th('aov', 'Avg order')}{th('cancel_rate', 'Cancel %')}
                                        {th('delivery_min', 'Delivery')}{th('rating', 'Rating')}{th('stock_value', 'Stock value*')}{th('days_left', 'Plan')}{th('alerts', 'Alerts')}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => switchTo(r.id)} title={`Open ${r.name}`}>
                                            <td className="px-3 py-2 font-medium">{r.is_main ? <>{r.name} <span className="text-xs text-blue-600">(main)</span></> : r.short}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{peso(r.sales)}{r.growth !== null && <span className={`block text-xs ${r.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.growth >= 0 ? '+' : ''}{r.growth}%</span>}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.orders}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{peso(r.aov)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${r.cancel_rate >= rules.cancel_rate ? 'font-semibold text-red-600' : ''}`}>{r.cancel_rate}%</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.delivery_min !== null ? `${r.delivery_min} min` : '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.rating ?? '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{peso(r.stock_value)}</td>
                                            <td className={`px-3 py-2 text-right text-xs ${!r.plan_active || r.days_left <= rules.plan_days ? 'text-red-600' : ''}`}>{r.plan}<span className="block">{r.plan_active ? `${r.days_left}d left` : 'ended'}</span></td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.alerts}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                            Sales = what customers paid (items + delivery fee) for delivered and paid orders — the same as Revenue and the receipts.
                            {' '}*Stock value = usable stock × cost price (else the last purchase order cost, else the selling price).
                        </p>
                    </CardContent>
                </Card>

                {/* Charts */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Sales per store">
                        <LineChart data={dashboard.charts.sales}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => `₱${Number(v).toLocaleString()}`} />
                            <Tooltip formatter={(v) => peso(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {dashboard.stores.map((s, i) => <Line key={s.id} type="monotone" dataKey={`s${s.id}`} name={s.is_main ? `${s.name} (main)` : s.short} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
                        </LineChart>
                    </ChartCard>
                    <ChartCard title="Orders per store">
                        <BarChart data={dashboard.charts.orders}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {dashboard.stores.map((s, i) => <Bar key={s.id} dataKey={`s${s.id}`} name={s.is_main ? `${s.name} (main)` : s.short} fill={COLORS[i % COLORS.length]} />)}
                        </BarChart>
                    </ChartCard>
                </div>

                {/* Transfers */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-blue-600" /> Stock transfers</CardTitle></CardHeader>
                    <CardContent className="p-0"><TransfersList transfers={transfers} /></CardContent>
                </Card>
            </div>

            {transferPreset && (
                <NewTransferDialog open onClose={() => setTransferPreset(null)}
                    preset={transferPreset === 'blank' ? null : {
                        from_store_id: transferPreset.from_store_id, to_store_id: transferPreset.to_store_id,
                        from_product_id: transferPreset.from_product_id, to_product_id: transferPreset.to_product_id, quantity: transferPreset.quantity,
                    }} />
            )}
        </AppLayout>
    );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
    return (
        <Card>
            <CardContent className="space-y-0.5 p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <p className="text-xl font-bold tabular-nums">{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto"><div className="h-64 min-w-[480px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></div>
            </CardContent>
        </Card>
    );
}
