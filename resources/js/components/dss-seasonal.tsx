import { router } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, ChevronDown, Download, FileUp, Info, Lightbulb, Sparkles, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ChartPoint = { ym: string; label: string; actual: number | null; fitted: number | null; forecast: number | null; index: number };
type ForecastMonth = { ym: string; label: string; month: number; qty: number; index: number; normal: number };
export type SeasonalSeries = {
    key: string; kind: 'total' | 'group' | 'product'; label: string; unit: string; product_id?: number;
    method: 'cma' | 'mean' | 'none'; method_label: string; months: number; enough: boolean; basis?: 'months' | 'recent'; message: string | null;
    indices: Record<string, number>; peaks: number[]; lows: number[]; trend: { level: number; slope: number };
    current: { ym: string; label: string; qty: number; remaining_days: number; remaining_qty: number };
    forecast: ForecastMonth[]; next_30: number; next_90: number;
    backtest: { mape: number | null; mae: number; grade: 'Good' | 'Fair' | 'Weak' | null; months: { ym: string; label: string; actual: number; forecast: number }[] } | null;
    chart: ChartPoint[]; last_year: { d30: number; d90: number; known: boolean };
};
export type Seasonal = {
    series: SeasonalSeries[]; advice: { type: 'peak' | 'low' | 'history'; text: string; product_id?: number }[];
    has_demo: boolean; has_history: boolean; order_months: string[]; generated_at: string;
};
export type SalesImport = { batch: string; rows: number; units: number; from: string; to: string; imported_at: string; by: string | null };
type Preview = {
    token: string; rows: number; counts: Record<string, number>; problems: Record<string, number[]>; period: { from: string; to: string } | null;
    order_months: string[]; preview: { row: number; date: string; product: string; quantity: string; matched: string | null; problem: string | null }[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROBLEM_LABELS: Record<string, string> = {
    unknown_product: 'Unknown product', bad_date: 'Bad date', future_date: 'Future date', too_old: 'More than 5 years back', bad_quantity: 'Quantity ≤ 0 / not a whole number',
};
const pct = (i: number) => { const p = Math.round((i - 1) * 100); return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}%`; };
const vsLastYear = (now: number, then: number) => (then > 0 ? Math.round(((now - then) / then) * 100) : null);

/** J8 — Seller DSS "Seasonal": month-of-year pattern, trend + 3-month forecast, advice, past-sales import. */
export function SeasonalSection({ data, imports, can }: { data: Seasonal; imports: SalesImport[]; can: { import: boolean; owner: boolean } }) {
    const [key, setKey] = useState('total');
    const s = data.series.find((x) => x.key === key) ?? data.series[0];
    const products = data.series.filter((x) => x.kind === 'product');
    const [howOpen, setHowOpen] = useState(false);
    const [removeDemo, setRemoveDemo] = useState(false);
    const [deleteBatch, setDeleteBatch] = useState<SalesImport | null>(null);
    const [importOpen, setImportOpen] = useState(false);

    if (!s) return null;
    const unit = s.unit;

    return (
        <div className="min-w-0 space-y-4" data-testid="dss-seasonal">
            {/* Picker + badges */}
            <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Product" value={key} onChange={(e) => setKey(e.target.value)}
                    className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm">
                    {data.series.filter((x) => x.kind !== 'product').map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    {products.length > 0 && <optgroup label="Products">{products.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>}
                </select>
                {data.has_demo && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300" data-testid="demo-badge">
                        <Sparkles className="h-3 w-3" /> Includes demo history (generated)
                    </span>
                )}
                <span className="text-xs text-muted-foreground">Method: {s.method_label}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                    {can.import && <Button size="sm" variant="outline" className="gap-1" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" /> Import past sales</Button>}
                    {can.owner && data.has_demo && <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => setRemoveDemo(true)}><Trash2 className="h-4 w-4" /> Remove demo history</Button>}
                </div>
            </div>

            {s.message && (
                <p className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-300" data-testid="seasonal-not-enough">
                    <Info className="h-4 w-4 shrink-0" /> {s.message}{s.basis === 'recent' ? '' : ' The forecast below uses the plain trend.'}
                </p>
            )}

            {/* Advice */}
            {data.advice.length > 0 && (
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-amber-500" /> Seasonal advice</CardTitle></CardHeader>
                    <CardContent>
                        <ul className="space-y-2" data-testid="seasonal-advice">
                            {data.advice.map((a, i) => (
                                <li key={i} className={`flex gap-2 rounded-md px-3 py-2 text-sm ${a.type === 'peak' ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200' : a.type === 'low' ? 'bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200' : 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200'}`}>
                                    {a.type === 'peak' ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" /> : a.type === 'low' ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" /> : <FileUp className="mt-0.5 h-4 w-4 shrink-0" />}
                                    <span>{a.text}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2 text-xs text-muted-foreground">Advice only — auto-reorder keeps using its own formula.</p>
                    </CardContent>
                </Card>
            )}

            {/* Chart: actual (bars), fitted (line), forecast (dashed + lighter bars) */}
            <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">{s.label} — last 24 months and the next 3</CardTitle></CardHeader>
                <CardContent className="px-2 pb-4 sm:px-4">
                    {s.chart.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">No sales yet for this selection.</p>
                    ) : (
                        <div className="overflow-x-auto" data-testid="seasonal-chart" data-audit-scroll-ok>
                            <div className="min-w-[640px]">
                                <ResponsiveContainer width="100%" height={260}>
                                    <ComposedChart data={s.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                                        <YAxis tick={{ fontSize: 11 }} width={45} allowDecimals={false} />
                                        <Tooltip content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as ChartPoint;
                                            return (
                                                <div className="rounded-lg border bg-white p-2.5 text-xs shadow-xl dark:bg-gray-900">
                                                    <p className="mb-1 font-bold">{label}</p>
                                                    {p.actual !== null && <p>Actual: {p.actual} {unit}</p>}
                                                    {p.fitted !== null && <p className="text-muted-foreground">Fitted: {Math.round(p.fitted)}</p>}
                                                    {p.forecast !== null && <p className="text-indigo-600">Forecast: {p.forecast} {unit}</p>}
                                                    <p className="text-muted-foreground">Seasonal index: {p.index.toFixed(2)} ({pct(p.index)})</p>
                                                </div>
                                            );
                                        }} />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="forecast" name="Forecast" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                                        <Line type="monotone" dataKey="fitted" name="Fitted (trend × season)" stroke="#64748b" strokeWidth={2} dot={false} connectNulls={false} />
                                        <Line type="monotone" dataKey="forecast" name="Forecast line" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} legendType="none" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Seasonal pattern */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Seasonal pattern — {s.label}</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                        <table className="rt-cards w-full text-sm" data-testid="seasonal-pattern">
                            <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Index</th><th className="px-4 py-2 text-right">vs average</th><th className="px-4 py-2" /></tr></thead>
                            <tbody className="divide-y">
                                {MONTHS.map((m, i) => {
                                    const idx = s.indices[String(i + 1)] ?? 1;
                                    const peak = s.peaks.includes(i + 1);
                                    const low = s.lows.includes(i + 1);
                                    return (
                                        <tr key={m}>
                                            <td className="px-4 py-1.5">{m}</td>
                                            <td className="px-4 py-1.5 text-right tabular-nums">{idx.toFixed(2)}</td>
                                            <td className={`px-4 py-1.5 text-right tabular-nums ${idx > 1.005 ? 'text-emerald-700 dark:text-emerald-300' : idx < 0.995 ? 'text-red-600' : 'text-muted-foreground'}`}>{s.enough ? pct(idx) : '—'}</td>
                                            <td className="px-4 py-1.5">
                                                {peak && <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">peak</span>}
                                                {low && <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">low</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Method: {s.method_label}.</p>
                    </CardContent>
                </Card>

                {/* Forecast + accuracy */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Forecast — {s.label}</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                            {([['Next 30 days', s.next_30, s.last_year.d30], ['Next 90 days', s.next_90, s.last_year.d90]] as const).map(([label, now, then]) => {
                                const ch = s.last_year.known ? vsLastYear(now, then) : null;
                                return (
                                    <div key={label} className="rounded-lg border p-3">
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className="text-xl font-bold tabular-nums">{now} <span className="text-xs font-normal text-muted-foreground">{unit}</span></p>
                                        {ch !== null && <p className={`text-xs ${ch >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>{ch >= 0 ? '+' : '−'}{Math.abs(ch)}% vs same period last year ({then})</p>}
                                    </div>
                                );
                            })}
                        </div>
                        <ul className="divide-y rounded-lg border">
                            <li className="flex justify-between px-3 py-1.5"><span>{s.current.label} <span className="text-xs text-muted-foreground">(rest of the month, {s.current.remaining_days} days)</span></span><span className="tabular-nums">{s.current.remaining_qty}</span></li>
                            {s.forecast.map((f) => (
                                <li key={f.ym} className="flex justify-between px-3 py-1.5"><span>{f.label} <span className="text-xs text-muted-foreground">{s.enough ? pct(f.index) : ''}</span></span><span className="font-medium tabular-nums">{f.qty}</span></li>
                            ))}
                        </ul>
                        {s.backtest && s.backtest.mape !== null ? (
                            <p className="text-xs text-muted-foreground" data-testid="seasonal-accuracy">
                                Accuracy (last 3 months held out): MAPE <strong>{s.backtest.mape}%</strong> · MAE {s.backtest.mae} {unit} ·{' '}
                                <span className={`font-semibold ${s.backtest.grade === 'Good' ? 'text-emerald-700 dark:text-emerald-300' : s.backtest.grade === 'Fair' ? 'text-amber-700 dark:text-amber-300' : 'text-red-600'}`}>{s.backtest.grade}</span>
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Accuracy is shown once there are 15 months of history.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Per product: next 30 / 90 days */}
            {products.length > 0 && (
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Next 30 / 90 days per product</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                        <table className="rt-cards w-full text-sm" data-testid="seasonal-products">
                            <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Next 30 days</th><th className="px-4 py-2 text-right">Next 90 days</th><th className="px-4 py-2">Peak / low</th><th className="px-4 py-2">History</th></tr></thead>
                            <tbody className="divide-y">
                                {products.map((p) => {
                                    const c30 = p.last_year.known ? vsLastYear(p.next_30, p.last_year.d30) : null;
                                    const c90 = p.last_year.known ? vsLastYear(p.next_90, p.last_year.d90) : null;
                                    const tag = (c: number | null) => c === null ? null : <span className={`ml-1 text-xs ${c >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>{c >= 0 ? '+' : '−'}{Math.abs(c)}%</span>;
                                    return (
                                        <tr key={p.key} className="cursor-pointer hover:bg-muted/30" onClick={() => setKey(p.key)}>
                                            <td className="px-4 py-2 font-medium">{p.label}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{p.next_30} {p.unit}{tag(c30)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{p.next_90} {p.unit}{tag(c90)}</td>
                                            <td className="px-4 py-2 text-xs">{p.enough ? [...p.peaks.map((m) => `${MONTHS[m - 1]} ${pct(p.indices[String(m)])}`), ...p.lows.map((m) => `${MONTHS[m - 1]} ${pct(p.indices[String(m)])}`)].join(' · ') || '—' : '—'}</td>
                                            <td className="px-4 py-2 text-xs text-muted-foreground">{p.months} mo</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="border-t px-4 py-2 text-xs text-muted-foreground">% = change vs the same period last year (when the store has sales that old). Click a row to see its chart.</p>
                    </CardContent>
                </Card>
            )}

            {/* Imports */}
            {(imports.length > 0 || can.import) && (
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Imported past sales</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                        {imports.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-muted-foreground">No imports yet. Moving from a notebook or Excel? Import your past sales to see seasonal patterns sooner.</p>
                        ) : (
                            <table className="rt-cards w-full text-sm" data-testid="sales-imports">
                                <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-4 py-2">Imported</th><th className="px-4 py-2 text-right">Rows</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">By</th><th /></tr></thead>
                                <tbody className="divide-y">
                                    {imports.map((im) => (
                                        <tr key={im.batch}>
                                            <td className="px-4 py-2 whitespace-nowrap">{im.imported_at}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{im.rows} <span className="text-xs text-muted-foreground">({im.units} units)</span></td>
                                            <td className="px-4 py-2 whitespace-nowrap">{im.from} – {im.to}</td>
                                            <td className="px-4 py-2">{im.by ?? '—'}</td>
                                            <td className="px-4 py-2 text-right">{can.import && <button type="button" className="text-xs text-red-600 underline" onClick={() => setDeleteBatch(im)}>Delete this import</button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* How this works */}
            <Card>
                <button type="button" onClick={() => setHowOpen((o) => !o)} aria-expanded={howOpen} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold">
                    How this works <ChevronDown className={`h-4 w-4 transition-transform ${howOpen ? 'rotate-180' : ''}`} />
                </button>
                {howOpen && (
                    <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300" data-testid="seasonal-how">
                        <p><strong>Monthly sales</strong> = your platform orders (not cancelled) + the past sales you imported, per calendar month. Only complete months count (up to the last 36); the current month is forecast, not measured.</p>
                        <p><strong>Seasonal index</strong> — how a calendar month compares with an average month (1.00 = average, 1.28 = 28% more). With 24+ months: each month's sales ÷ the centered 12-month moving average around it, averaged per calendar month (ratio-to-moving-average). With 12–23 months: the average of that calendar month ÷ the average of all months (ratio-to-mean). The 12 indices are scaled to average exactly 1.00. Under 12 months there is no seasonality — every index is 1.00.</p>
                        <p><strong>Trend</strong> — each month's sales ÷ its index (the season removed), then a straight line through those numbers (least squares): a level plus a change per month.</p>
                        <p><strong>Forecast</strong> = (level + change × month number) × the month's index, never below 0. The next 30 / 90 days add up the daily rate (month forecast ÷ days in the month) over the exact days.</p>
                        <p><strong>Accuracy (MAPE)</strong> — the last 3 complete months are hidden, the model is fitted on the rest and forecasts them; MAPE is the average % error (months with 0 sales are skipped), MAE the average error in units. Good &lt; 15%, Fair 15–30%, Weak &gt; 30%. Shown from 15 months of history.</p>
                        <p><strong>Peak / low</strong> — the 2 highest indices at least 1.10 are peak months; the lowest index at most 0.90 is the low month. Advice appears when one starts within 45 days, using your usable stock, open purchase orders and the supplier's lead time. It does not change auto-reorder.</p>
                        {data.has_demo && <p className="rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-amber-900 dark:text-amber-300">Demo history is generated with assumed month factors (e.g. December +30%) — demo assumptions, not real sales.</p>}
                    </CardContent>
                )}
            </Card>

            <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

            <AlertDialog open={removeDemo} onOpenChange={setRemoveDemo}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Remove the demo history?</AlertDialogTitle>
                        <AlertDialogDescription>The generated sales history is deleted. Your orders and imported sales stay.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => router.delete('/seller/dss/sales-history/demo', { preserveScroll: true, preserveState: true })}>Remove demo history</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deleteBatch} onOpenChange={(o) => { if (!o) setDeleteBatch(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Delete this import?</AlertDialogTitle>
                        <AlertDialogDescription>{deleteBatch && `${deleteBatch.rows} row(s) from ${deleteBatch.from} – ${deleteBatch.to}, imported ${deleteBatch.imported_at}.`} Other imports are kept.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => { if (deleteBatch) router.delete(`/seller/dss/sales-history/imports/${deleteBatch.batch}`, { preserveScroll: true, preserveState: true }); setDeleteBatch(null); }}>
                            Delete import
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/** Upload → preview (first 20 rows + counts per problem) → Confirm import (valid rows only). */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const close = () => { setPreview(null); setError(null); onClose(); };
    const upload = async () => {
        const f = fileRef.current?.files?.[0];
        if (!f) { setError('Choose a CSV file.'); return; }
        setBusy(true); setError(null);
        try {
            const body = new FormData();
            body.append('file', f);
            const res = await axios.post<Preview>('/seller/dss/sales-history/preview', body, { headers: { Accept: 'application/json' } });
            setPreview(res.data);
        } catch (e) {
            setError(axios.isAxiosError(e) ? ((Object.values(e.response?.data?.errors ?? {})[0] as string[] | undefined)?.[0] ?? e.response?.data?.message ?? 'Upload failed.') : 'Upload failed.');
        } finally { setBusy(false); }
    };
    const confirm = () => {
        if (!preview) return;
        setBusy(true);
        router.post('/seller/dss/sales-history/import', { token: preview.token }, { preserveScroll: true, preserveState: true, onSuccess: close, onFinish: () => setBusy(false) });
    };
    const problems = useMemo(() => Object.entries(preview?.problems ?? {}), [preview]);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
            <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 p-0">
                <DialogHeader className="border-b px-6 pt-6 pb-3"><DialogTitle>Import past sales</DialogTitle></DialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm" data-testid="import-body">
                    {!preview ? (
                        <>
                            <p>A <strong>.csv</strong> file (max 2 MB, 20,000 rows) with the columns <code>date</code> (YYYY-MM-DD or MM/DD/YYYY), <code>product</code> (the product name as in your store, or its id) and <code>quantity</code> (whole number above 0). One row per day and product (or per sale).</p>
                            <a href="/seller/dss/sales-history/template" className="inline-flex items-center gap-1 text-blue-600 underline"><Download className="h-4 w-4" /> Download the template (with your product names)</a>
                            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="CSV file" className="block w-full text-sm" />
                            <p className="text-xs text-muted-foreground">Only sales that are NOT already orders on the platform — both are added up. Dates in the future or more than 5 years back are refused.</p>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2" data-testid="import-counts">
                                <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 font-semibold text-emerald-800 dark:text-emerald-300">{preview.counts.valid} valid</span>
                                {Object.entries(PROBLEM_LABELS).filter(([k]) => (preview.counts[k] ?? 0) > 0).map(([k, l]) => (
                                    <span key={k} className="rounded bg-red-100 dark:bg-red-900/40 px-2 py-1 text-red-800 dark:text-red-300">{preview.counts[k]} {l.toLowerCase()}</span>
                                ))}
                                <span className="text-xs text-muted-foreground self-center">of {preview.rows} row(s){preview.period && ` · ${preview.period.from} to ${preview.period.to}`}</span>
                            </div>
                            {problems.length > 0 && (
                                <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                                    {problems.map(([k, rows]) => <li key={k}>{PROBLEM_LABELS[k]}: row {rows.join(', ')}{(preview.counts[k] ?? 0) > rows.length ? '…' : ''}</li>)}
                                </ul>
                            )}
                            {preview.order_months.length > 0 && (
                                <p className="flex gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> These months already have platform orders: {preview.order_months.join(', ')}. Both are added up — import only sales that were NOT made on the platform.
                                </p>
                            )}
                            <div className="overflow-x-auto rounded border">
                                <table className="rt-cards w-full text-xs">
                                    <thead><tr className="border-b text-left text-muted-foreground"><th className="px-2 py-1">Row</th><th className="px-2 py-1">Date</th><th className="px-2 py-1">Product</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1">Status</th></tr></thead>
                                    <tbody className="divide-y">
                                        {preview.preview.map((r) => (
                                            <tr key={r.row} className={r.problem ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                                                <td className="px-2 py-1 tabular-nums">{r.row}</td><td className="px-2 py-1 whitespace-nowrap">{r.date}</td>
                                                <td className="px-2 py-1">{r.product}{r.matched && r.matched !== r.product && <span className="text-muted-foreground"> → {r.matched}</span>}</td>
                                                <td className="px-2 py-1 text-right tabular-nums">{r.quantity}</td><td className="px-2 py-1">{r.problem ?? 'OK'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground">Only the {preview.counts.valid} valid row(s) are imported.</p>
                        </>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
                    {preview ? <>
                        <Button variant="outline" onClick={() => setPreview(null)}>Choose another file</Button>
                        <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy || preview.counts.valid === 0} onClick={confirm}>{busy ? 'Importing…' : `Confirm import (${preview.counts.valid})`}</Button>
                    </> : <>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy} onClick={upload}>{busy ? 'Reading…' : 'Preview'}</Button>
                    </>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
