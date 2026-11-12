import { Head, router, useForm } from '@inertiajs/react';
import { Calculator, Info, Pencil, Plus, Settings2, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PayrollTabs } from '@/components/payroll-tabs';
import { peso, rateSourceLabel } from '@/components/payslip-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Rules = {
    payroll_period: string;
    overtime_multiplier: number;
};

type RoleRate = { id: number; name: string; is_starter: boolean; is_rider: boolean; members: number; hourly_rate: number | null };

type StaffRate = {
    id: number;
    name: string;
    role_names: string[];
    hourly_rate_override: number | null;
    effective_rate: number;
    rate_source: string;
};

/** A role with active staff (no personal rate) but no hourly rate — PayrollCalculator::rolesNeedingRate */
type NeedsRate = { id: number; name: string; people: number };

type Props = { settings: Rules; roles: RoleRate[]; needs_rate: NeedsRate[]; staff: StaffRate[] };

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Payroll', href: '/seller/payroll' },
    { title: 'Pay Rates & Rules', href: '/seller/payroll/settings' },
];

const selectCls = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30';

/** Standard meal break (PayrollCalculator::MEAL_BREAK_MINUTES / MEAL_BREAK_AFTER_HOURS) */
const MEAL_BREAK_MINUTES = 60;
const MEAL_BREAK_AFTER_HOURS = 5;
/** Overtime multiplier floor (Labor Code Art. 87) — PayrollCalculator::MIN_OVERTIME_MULTIPLIER */
const MIN_OT_MULTIPLIER = 1.25;

/**
 * Same rule as App\Services\PayrollCalculator::dayLine for the example day:
 * shift 8:00 AM – 5:00 PM, worked 8:05 AM – 6:40 PM.
 */
function exampleDay(rate: number, mult: number) {
    const shiftStart = 8 * 60, shiftEnd = 17 * 60, clockIn = 8 * 60 + 5, clockOut = 18 * 60 + 40;
    const windowMin = Math.max(0, Math.min(clockOut, shiftEnd) - Math.max(clockIn, shiftStart));
    const brk = windowMin >= MEAL_BREAK_AFTER_HOURS * 60 ? MEAL_BREAK_MINUTES : 0;
    const regH = Math.floor(Math.max(0, windowMin - brk) / 60);
    const otH = Math.floor(Math.max(0, clockOut - shiftEnd) / 60);
    const pay = Math.round((regH * rate + otH * rate * mult) * 100) / 100;
    return { regH, otH, brk, pay };
}

// ── Personal rate dialog ───────────────────────────────────────────────────────

function PersonalRateDialog({ staff, target, onClose }: { staff: StaffRate[]; target: StaffRate | 'new' | null; onClose: () => void }) {
    const [userId, setUserId] = useState<string>(target && target !== 'new' ? String(target.id) : '');
    const [rate, setRate] = useState<string>(target && target !== 'new' && target.hourly_rate_override !== null ? String(target.hourly_rate_override) : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function save() {
        if (!userId) return;
        setBusy(true);
        router.patch(`/seller/payroll/staff/${userId}/rate`, { hourly_rate_override: rate === '' ? null : rate }, {
            preserveScroll: true,
            onSuccess: onClose,
            onError: (e) => setError(e.hourly_rate_override ?? 'Could not save.'),
            onFinish: () => setBusy(false),
        });
    }

    return (
        <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-600" /> Personal hourly rate</DialogTitle>
                    <DialogDescription>Wins over the person's roles. Leave empty to go back to the role rate.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="pr-staff">Staff member</Label>
                        <select id="pr-staff" className={selectCls} value={userId} disabled={target !== 'new'} onChange={(e) => setUserId(e.target.value)}>
                            <option value="">Choose…</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}{s.role_names.length ? ` (${s.role_names.join(', ')})` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="pr-rate">₱ per hour</Label>
                        <Input id="pr-rate" type="number" step="0.01" min="1" max="10000" value={rate} placeholder="e.g. 80"
                            onChange={(e) => setRate(e.target.value)} />
                        {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={busy || !userId} onClick={save} className="bg-blue-600 text-white hover:bg-blue-700">Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollSettingsPage({ settings, roles, needs_rate, staff }: Props) {
    const form = useForm({
        payroll_period:         settings.payroll_period,
        overtime_multiplier:    String(settings.overtime_multiplier),
        rates: Object.fromEntries(roles.map((r) => [String(r.id), r.hourly_rate === null ? '' : String(r.hourly_rate)])) as Record<string, string>,
    });
    const [personal, setPersonal] = useState<StaffRate | 'new' | null>(null);

    const d = form.data;
    const needs = new Map(needs_rate.map((n) => [n.id, n]));

    // Live example for one role, at the rate TYPED in the form (not saved yet)
    const [exampleRoleId, setExampleRoleId] = useState<string>(
        () => String((roles.find((r) => r.hourly_rate !== null) ?? roles[0])?.id ?? ''),
    );
    const exampleRole = roles.find((r) => String(r.id) === exampleRoleId);
    const typedRate = (d.rates[exampleRoleId] ?? '').trim();
    const exampleRate = typedRate === '' ? null : Number(typedRate) || 0;
    // Payroll never pays overtime below ×1.25, so the example doesn't either
    const mult = Math.max(Number(d.overtime_multiplier) || MIN_OT_MULTIPLIER, MIN_OT_MULTIPLIER);
    const ex = useMemo(() => exampleDay(exampleRate ?? 0, mult), [exampleRate, mult]);
    const errors = form.errors as Record<string, string>;
    const withPersonal = staff.filter((s) => s.hourly_rate_override !== null);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        form.post('/seller/payroll/settings', { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll Settings" />

            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <Settings2 className="h-6 w-6 text-blue-600" />
                        Payroll Settings
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">Hourly rate per role, personal rates and the pay rules.</p>
                </div>

                <PayrollTabs active="settings" />

                <form onSubmit={submit} className="space-y-6">
                    {/* 1. Role rates */}
                    <Card data-tour="prs-rates">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-blue-600" /> Hourly rate per role</CardTitle>
                            <p className="text-xs text-gray-500">Each role has its own pay. Someone with several roles gets the highest rate. A personal rate (below) beats the role rate.</p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {roles.map((r) => {
                                    const empty = (d.rates[String(r.id)] ?? '').trim() === '';
                                    const needed = empty && needs.has(r.id);
                                    const err = errors[`rates.${r.id}`];
                                    return (
                                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                                        <div className="min-w-0">
                                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                                {r.name}
                                                {r.is_starter && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Starter</span>}
                                                {needed && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">No rate yet</span>}
                                            </p>
                                            <p className="text-xs text-gray-500">{r.members} staff</p>
                                            {empty && !needed && <p className="text-xs text-gray-400">No rate yet — needed before you give it to someone</p>}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm text-gray-500">₱</span>
                                            <Input type="number" step="0.01" min="1" max="10000"
                                                className={`h-8 w-32 text-right ${needed || err ? 'border-orange-400 focus-visible:ring-orange-300' : ''}`}
                                                value={d.rates[String(r.id)] ?? ''}
                                                placeholder="e.g. 65.00"
                                                onChange={(e) => form.setData('rates', { ...d.rates, [String(r.id)]: e.target.value })} />
                                            <span className="text-xs text-gray-500">/h</span>
                                        </div>
                                        {err && <p className="w-full text-xs text-red-500">{err}</p>}
                                    </div>
                                    );
                                })}
                            </div>
                            <p className="border-t px-4 py-2 text-xs text-gray-400">Check that rates meet the minimum wage for your region (DOLE – NWPC wage orders).</p>
                        </CardContent>
                    </Card>

                    {/* 3. Rules */}
                    <Card data-tour="prs-rules">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Rules</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-1.5 sm:max-w-xs">
                                <Label htmlFor="ot-mult">Overtime multiplier</Label>
                                <Input id="ot-mult" type="number" step="0.01" min="1.25" max="3" value={d.overtime_multiplier}
                                    onChange={(e) => form.setData('overtime_multiplier', e.target.value)} />
                                <p className="text-xs text-gray-400">1.25 = legal minimum (Labor Code Art. 87). You can pay more, e.g. 1.5.</p>
                                {errors.overtime_multiplier && <p className="text-xs text-red-500">{errors.overtime_multiplier}</p>}
                            </div>

                            {/* Standard rule for every store — not editable */}
                            <div className="grid gap-1.5">
                                <Label>Meal break</Label>
                                <p className="flex items-start gap-2 rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <span>
                                        <strong>Meal break: 60 minutes, unpaid</strong> (Labor Code Art. 85). Subtracted automatically when the person worked
                                        5 hours or more in their shift. Short coffee/rest breaks are paid.
                                    </span>
                                </p>
                            </div>

                            <div className="grid gap-1.5 sm:max-w-xs">
                                <Label htmlFor="period">Payroll period</Label>
                                <select id="period" className={selectCls} value={d.payroll_period} onChange={(e) => form.setData('payroll_period', e.target.value)}>
                                    <option value="weekly">Weekly</option>
                                    <option value="bi_weekly">Bi-Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>

                            {/* Live example — same rule as the payslip */}
                            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                    <Calculator className="h-4 w-4" /> Example for
                                    <select aria-label="Role for the example" value={exampleRoleId} onChange={(e) => setExampleRoleId(e.target.value)}
                                        className="h-7 rounded-md border border-blue-200 bg-white px-2 text-sm font-medium text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:outline-none dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </p>
                                {roles.length === 0 ? (
                                    <p className="mt-1">Create a role in Staff to see the example.</p>
                                ) : exampleRate === null ? (
                                    <p className="mt-1">Type a rate for {exampleRole?.name} to see the example.</p>
                                ) : (
                                    <>
                                        <p className="mt-1">
                                            Shift 8:00 AM – 5:00 PM, worked 8:05 AM – 6:40 PM → <strong>{ex.regH} h regular</strong> + <strong>{ex.otH} h overtime</strong> = <strong>{peso(ex.pay)}</strong>
                                        </p>
                                        <p className="mt-0.5 text-xs opacity-80">
                                            {ex.regH} × {peso(exampleRate)} + {ex.otH} × {peso(exampleRate * mult)}
                                            {' '}· {ex.brk} min unpaid meal break · early arrival and late minutes are not paid · whole hours only
                                        </p>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={form.processing} className="bg-blue-600 text-white hover:bg-blue-700">Save rates & rules</Button>
                    </div>
                </form>

                {/* 2. Personal rates (saved one by one) */}
                <Card data-tour="prs-personal">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-blue-600" /> Personal rates</CardTitle>
                            <p className="mt-0.5 text-xs text-gray-500">A personal rate wins over the person's roles.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setPersonal('new')} disabled={staff.length === 0}>
                            <Plus className="mr-1 h-4 w-4" /> Set personal rate
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {withPersonal.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-gray-400">Nobody has a personal rate.</p>
                        ) : (
                            <div className="divide-y">
                                {withPersonal.map((s) => (
                                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{s.name}</p>
                                            <p className="text-xs text-gray-500">{s.role_names.join(', ') || '—'}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="mr-2 font-semibold text-blue-700">{peso(s.hourly_rate_override)}/h</span>
                                            <Button size="sm" variant="ghost" className="h-8" onClick={() => setPersonal(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                                            <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:text-red-600" title="Remove personal rate"
                                                onClick={() => router.patch(`/seller/payroll/staff/${s.id}/rate`, { hourly_rate_override: null }, { preserveScroll: true })}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {staff.length > 0 && (
                            <details className="border-t px-4 py-2 text-xs text-gray-500">
                                <summary className="cursor-pointer select-none">Everyone's current rate</summary>
                                <ul className="mt-1.5 space-y-0.5">
                                    {staff.map((s) => (
                                        <li key={s.id}>
                                            {s.name}:{' '}
                                            {s.rate_source === 'none'
                                                ? <strong className="text-orange-600">No rate yet</strong>
                                                : <><strong>{peso(s.effective_rate)}/h</strong> ({rateSourceLabel(s.rate_source)})</>}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </CardContent>
                </Card>
            </div>

            {personal && <PersonalRateDialog key={personal === 'new' ? 'new' : personal.id} staff={staff} target={personal} onClose={() => setPersonal(null)} />}
        </AppLayout>
    );
}
