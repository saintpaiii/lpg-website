import { router, useForm } from '@inertiajs/react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { usePlan } from '@/hooks/use-plan';
import type { SharedData } from '@/types';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { FEATURE_INFO, openUpgrade } from '@/lib/plans';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ModuleLevel = 'view' | 'full';

export type StoreRoleRow = {
    id: number;
    name: string;
    is_rider: boolean;
    is_starter: boolean;
    starter_key: string | null;
    /** Staff with this role (archived ones included) */
    members: number;
    /** ₱ per hour (Payroll); null = no rate yet */
    hourly_rate: number | null;
    modules: Record<string, ModuleLevel>;
};

export type ModuleDef = {
    key: string;
    label: string;
    description: string;
    view_only: boolean;
    /** Plan feature the module needs (payroll / loyalty / dss), null = every plan */
    feature?: string | null;
};

/** A starter role definition offered as "Start from" for a new role (config/staff_modules.php 'starters') */
export type RoleTemplate = { key: string; name: string; is_rider: boolean; modules: Record<string, ModuleLevel> };

// ── Work days ──────────────────────────────────────────────────────────────────

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];

/** "Mon–Sat", "Mon–Fri", "Every day", "Mon, Wed, Fri" */
export function fmtWorkDays(days?: number[] | null): string {
    const d = [...new Set(days?.length ? days : DEFAULT_WORK_DAYS)].sort((a, b) => a - b);
    if (d.length === 7) return 'Every day';
    const consecutive = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    if (consecutive && d.length >= 3) return `${DAY_NAMES[d[0] - 1]}–${DAY_NAMES[d[d.length - 1] - 1]}`;
    return d.map((v) => DAY_NAMES[v - 1]).join(', ');
}

export function WorkDaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => {
                const day = i + 1;
                const on = value.includes(day);
                return (
                    <label key={day}
                        className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium select-none ${on ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-gray-200 text-gray-500 dark:border-gray-700'}`}>
                        <input type="checkbox" className="h-3 w-3 accent-blue-600" checked={on}
                            onChange={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b))} />
                        {name}
                    </label>
                );
            })}
        </div>
    );
}

/** "₱65/h" after a role name, or an orange "No rate" tag — only when the plan has Payroll */
function RoleRateTag({ rate }: { rate: number | null }) {
    if (rate == null) {
        return <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">No rate</span>;
    }
    return <span className="shrink-0 text-xs font-normal text-gray-500">₱{Number(rate.toFixed(2)).toLocaleString('en-PH')}/h</span>;
}

// ── Role picker (Add / Edit staff) ─────────────────────────────────────────────

export function RolesChecklist({ roles, value, onChange }: { roles: StoreRoleRow[]; value: number[]; onChange: (ids: number[]) => void }) {
    const showRate = usePlan().has('payroll');
    const chosen = roles.filter((r) => value.includes(r.id));
    const riderMixed = chosen.some((r) => r.is_rider) && chosen.some((r) => !r.is_rider);
    return (
        <div className="grid gap-1.5">
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {roles.map((r) => {
                    const on = value.includes(r.id);
                    return (
                        <label key={r.id} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${on ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={on}
                                onChange={() => onChange(on ? value.filter((id) => id !== r.id) : [...value, r.id])} />
                            <span className="truncate">{r.name}</span>
                            {r.is_rider && <Truck className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="Delivers orders" />}
                            {showRate && <RoleRateTag rate={r.hourly_rate} />}
                        </label>
                    );
                })}
            </div>
            {riderMixed && (
                <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    This person delivers orders AND has store roles: they use the rider app and can switch to the store portal for the other roles (not Messages / Customer Reports).
                </p>
            )}
        </div>
    );
}

// ── Roles tab ──────────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<'off' | ModuleLevel, string> = { off: 'Off', view: 'View only', full: 'Full access' };

const LEVEL_RANK: Record<'off' | ModuleLevel, number> = { off: 0, view: 1, full: 2 };

/**
 * Off / View only / Full access. `disabled` locks the whole control; `lockedAbove` disables only the levels above
 * it (a module the plan lacks: "Off" stays clickable so the owner can remove it).
 */
function LevelControl({ value, viewOnly, disabled, lockedAbove, onChange }: {
    value: 'off' | ModuleLevel;
    viewOnly: boolean;
    disabled: boolean;
    lockedAbove?: 'off' | ModuleLevel | null;
    onChange: (v: 'off' | ModuleLevel) => void;
}) {
    const options: ('off' | ModuleLevel)[] = viewOnly ? ['off', 'view'] : ['off', 'view', 'full'];
    return (
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border text-xs" role="radiogroup">
            {options.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={value === o}
                    disabled={disabled || (lockedAbove != null && LEVEL_RANK[o] > LEVEL_RANK[lockedAbove])}
                    onClick={() => onChange(o)}
                    className={`px-2.5 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${value === o
                        ? (o === 'full' ? 'bg-blue-600 text-white' : o === 'view' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100')
                        : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800'}`}>
                    {LEVEL_LABEL[o]}
                </button>
            ))}
        </div>
    );
}

/**
 * New / edit role dialog. From the Add / Edit Staff form it is opened ON TOP of that dialog with `onCreated`:
 * it then only reloads `roles` + `flash` (the staff form keeps what was typed) and hands back the new role's id.
 */
export function RoleEditor({ role, modules, canEdit, open, onClose, templates = [], roles = [], onCreated }: {
    role: StoreRoleRow | null;
    modules: ModuleDef[];
    canEdit: boolean;
    open: boolean;
    onClose: () => void;
    /** "Start from" starter definitions (new roles only) */
    templates?: RoleTemplate[];
    /** Existing roles, offered as "Copy of …" (custom ones only) */
    roles?: StoreRoleRow[];
    onCreated?: (roleId: number) => void;
}) {
    const isNew = !role;
    const { has } = usePlan();
    // With Payroll on the plan every role has its own hourly pay (required)
    const payrollEnabled = has('payroll');
    const { data, setData, post, put, processing, errors, reset } = useForm<{ name: string; is_rider: boolean; hourly_rate: string; modules: Record<string, 'off' | ModuleLevel> }>({
        name: role?.name ?? '',
        is_rider: role?.is_rider ?? false,
        hourly_rate: role?.hourly_rate != null ? String(role.hourly_rate) : '',
        modules: Object.fromEntries(modules.map((m) => [m.key, role?.modules?.[m.key] ?? 'off'])),
    });
    const readOnly = !canEdit;
    const [startFrom, setStartFrom] = useState('');

    /** Plan feature a module needs but the store lacks, else null */
    const lockOf = (m: ModuleDef) => (m.feature && !has(m.feature) ? m.feature : null);
    const copyable = roles.filter((r) => !r.is_starter);

    /** "Usually: Cashier (full), HR (view)" per module, from the starters */
    const usually = useMemo(() => Object.fromEntries(modules.map((m) => [m.key,
        templates.filter((t) => t.modules[m.key]).map((t) => `${t.name} (${t.modules[m.key] === 'full' ? 'full' : 'view'})`).join(', '),
    ])), [modules, templates]);

    function applyStart(value: string) {
        setStartFrom(value);
        let src: { is_rider: boolean; modules: Record<string, ModuleLevel> } = { is_rider: false, modules: {} };
        if (value.startsWith('tpl:')) src = templates.find((t) => t.key === value.slice(4)) ?? src;
        // "Copy of {role}" also copies that role's rate (templates don't fill a rate)
        const copied = value.startsWith('role:') ? roles.find((r) => String(r.id) === value.slice(5)) : undefined;
        if (copied) src = copied;
        setData((prev) => ({
            ...prev,
            is_rider: src.is_rider,
            hourly_rate: copied?.hourly_rate != null ? String(copied.hourly_rate) : prev.hourly_rate,
            modules: Object.fromEntries(modules.map((m) => {
                let level: 'off' | ModuleLevel = src.modules[m.key] ?? 'off';
                if (lockOf(m)) level = 'off';                        // the plan doesn't have it
                if (level === 'full' && m.view_only) level = 'view';
                return [m.key, level];
            })),
        }));
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        // This dialog can sit on top of the staff form: don't let the submit bubble to it (React bubbles through portals)
        e.stopPropagation();
        if (readOnly) return;
        if (isNew && onCreated) {
            post('/seller/roles', {
                preserveState: true,
                preserveScroll: true,
                only: ['roles', 'flash'],
                onSuccess: (page) => {
                    const id = (page.props as unknown as SharedData).flash?.created_role_id;
                    if (id) onCreated(id);
                    onClose();
                },
            });
            return;
        }
        const opts = { preserveScroll: true, onSuccess: () => { reset(); onClose(); } };
        if (isNew) post('/seller/roles', opts);
        else put(`/seller/roles/${role!.id}`, opts);
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                        {isNew ? 'New role' : readOnly ? role!.name : `Edit role: ${role!.name}`}
                        {role?.is_starter && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Starter</span>}
                    </DialogTitle>
                    <DialogDescription>
                        Choose what people with this role can do in each part of the store portal. Someone with several roles gets the highest level of each.
                    </DialogDescription>
                </DialogHeader>

                {readOnly && (
                    <button type="button" onClick={() => openUpgrade('custom_roles')}
                        className="flex w-full items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <Lock className="h-4 w-4 shrink-0" /> 🔒 Custom roles are a Pro feature — upgrade to edit roles.
                    </button>
                )}

                <form onSubmit={submit} className="grid gap-4">
                    {isNew && !readOnly && (templates.length > 0 || copyable.length > 0) && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="role-start">Start from</Label>
                            <select id="role-start" value={startFrom} onChange={(e) => applyStart(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30">
                                <option value="">Blank (everything Off)</option>
                                {templates.length > 0 && (
                                    <optgroup label="Ready-made">
                                        {templates.map((t) => <option key={t.key} value={`tpl:${t.key}`}>{t.name}</option>)}
                                    </optgroup>
                                )}
                                {copyable.length > 0 && (
                                    <optgroup label="Your roles">
                                        {copyable.map((r) => <option key={r.id} value={`role:${r.id}`}>Copy of {r.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                            <p className="text-xs text-gray-500">Fills the access below — then change what you want and give it a name.</p>
                        </div>
                    )}

                    <div className="grid gap-1.5">
                        <Label htmlFor="role-name">Name</Label>
                        <Input id="role-name" maxLength={40} value={data.name} disabled={readOnly}
                            onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Delivery Boy, Cashier + Rider" />
                        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                    </div>

                    {payrollEnabled && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="role-rate">Hourly pay (₱)</Label>
                            <Input id="role-rate" type="number" step="0.01" min="1" max="10000" required={!readOnly} disabled={readOnly}
                                className="sm:max-w-[12rem]" value={data.hourly_rate} placeholder="e.g. 65.00"
                                onChange={(e) => setData('hourly_rate', e.target.value)} />
                            <p className="text-xs text-gray-500">Paid for each whole hour worked. Overtime adds the multiplier from Payroll Settings.</p>
                            {errors.hourly_rate && <p className="text-xs text-red-500">{errors.hourly_rate}</p>}
                        </div>
                    )}

                    <label className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${readOnly ? 'opacity-70' : 'cursor-pointer'}`}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={data.is_rider} disabled={readOnly}
                            onChange={(e) => setData('is_rider', e.target.checked)} />
                        <span>
                            <span className="font-medium">Delivers orders (rider)</span>
                            <span className="block text-xs text-gray-500">Needs a driver's license and picks a vehicle at clock-in. Uses the rider app.</span>
                        </span>
                    </label>

                    <div className="divide-y rounded-md border">
                        {modules.map((m) => {
                            const lock = lockOf(m);
                            return (
                                <div key={m.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                            {m.label}
                                            {lock && (
                                                <button type="button" onClick={() => openUpgrade(lock)}
                                                    className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200">
                                                    <Lock className="h-2.5 w-2.5" /> {FEATURE_INFO[lock]?.plan ?? 'Pro'}
                                                </button>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-500">{m.description}</p>
                                        {usually[m.key] && <p className="mt-0.5 text-[11px] text-gray-400">Usually: {usually[m.key]}</p>}
                                    </div>
                                    <LevelControl value={data.modules[m.key] ?? 'off'} viewOnly={m.view_only} disabled={readOnly}
                                        // Locked by plan: keep or lower what the role already had (the server checks the same)
                                        lockedAbove={lock ? (role?.modules?.[m.key] ?? 'off') : null}
                                        onChange={(v) => setData('modules', { ...data.modules, [m.key]: v })} />
                                </div>
                            );
                        })}
                    </div>
                    {errors.modules && <p className="text-xs text-red-500">{errors.modules}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
                        {!readOnly && (
                            <Button type="submit" disabled={processing || !data.name.trim()} className="bg-blue-600 text-white hover:bg-blue-700">
                                {processing && <Spinner className="mr-1.5" />}
                                {isNew ? 'Create role' : 'Save role'}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function RolesTab({ roles, modules, canEdit, templates = [] }: { roles: StoreRoleRow[]; modules: ModuleDef[]; canEdit: boolean; templates?: RoleTemplate[] }) {
    const [editing, setEditing] = useState<StoreRoleRow | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<StoreRoleRow | null>(null);
    const labelOf = Object.fromEntries(modules.map((m) => [m.key, m.label]));
    const showRate = usePlan().has('payroll');

    function newRole() {
        if (!canEdit) {
            openUpgrade('custom_roles');
            return;
        }
        setCreating(true);
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-blue-600" /> Roles
                </CardTitle>
                <Button size="sm" onClick={newRole} className={canEdit ? 'bg-blue-600 text-white hover:bg-blue-700' : ''} variant={canEdit ? 'default' : 'outline'}>
                    {canEdit ? <Plus className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-3.5 w-3.5" />} New role
                    {!canEdit && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">Pro</span>}
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                    A role = a name + what it can open. Give one or more roles to each staff member.
                </p>
                {!canEdit && (
                    <button type="button" onClick={() => openUpgrade('custom_roles')}
                        className="flex w-full items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <Lock className="h-4 w-4 shrink-0" />
                        🔒 Custom roles are a Pro feature. You can assign the roles below; creating and editing roles needs Pro.
                    </button>
                )}
                <div className="divide-y rounded-md border">
                    {roles.map((r) => {
                        const parts = Object.entries(r.modules).map(([k, l]) => `${labelOf[k] ?? k}${l === 'view' ? ' (view)' : ''}`);
                        return (
                            <div key={r.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                        {r.name}
                                        {showRate && <RoleRateTag rate={r.hourly_rate} />}
                                        {r.is_starter && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Starter</span>}
                                        {r.is_rider && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"><Truck className="h-3 w-3" /> Delivers orders</span>}
                                        <span className="text-xs font-normal text-gray-500">· {r.members} staff</span>
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500">{parts.length ? parts.join(' · ') : 'No modules'}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(r)}>
                                        {canEdit ? <><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</> : 'View'}
                                    </Button>
                                    {canEdit && !r.is_starter && (
                                        <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                                            onClick={() => setDeleting(r)} title={r.members > 0 ? `Remove it from ${r.members} staff first` : 'Delete role'}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>

            {(creating || editing) && (
                <RoleEditor key={editing?.id ?? 'new'} role={editing} modules={modules} canEdit={canEdit} open
                    templates={templates} roles={roles}
                    onClose={() => { setCreating(false); setEditing(null); }} />
            )}

            <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete role "{deleting?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting && deleting.members > 0
                                ? `Remove it from ${deleting.members} staff first — a role that is assigned can't be deleted.`
                                : 'Nobody has this role. Deleting it cannot be undone.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        {deleting && deleting.members === 0 && (
                            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                                onClick={() => router.delete(`/seller/roles/${deleting.id}`, { preserveScroll: true, onFinish: () => setDeleting(null) })}>
                                Delete
                            </AlertDialogAction>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
