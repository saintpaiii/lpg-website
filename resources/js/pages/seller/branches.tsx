import { Head, Link, router } from '@inertiajs/react';
import { ArrowRightLeft, Building2, Crown, LayoutGrid, Lock, MapPin, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { openUpgrade } from '@/lib/plans';
import type { BreadcrumbItem } from '@/types';

type Row = {
    id: number; name: string; branch_name: string | null; is_main: boolean; status: string; address: string;
    plan: string; plan_key: string; days_left: number; manager: { id: number; name: string; email: string } | null; created_at: string | null;
};

type Props = {
    main: { id: number; name: string; plan: string };
    stores: Row[];
    canAdd: boolean;
    blocker: string | null;
    trialDays: number;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Branches', href: '/seller/branches' }];

const STATUS: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending review', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    approved:  { label: 'Approved',       cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    rejected:  { label: 'Sent back',      cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    suspended: { label: 'Suspended',      cls: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

export default function Branches({ main, stores, canAdd, blocker, trialDays }: Props) {
    const branches = stores.filter((s) => !s.is_main);
    const switchTo = (id: number) => router.post('/seller/switch-store', { store_id: id });
    // "Add manager": open the branch, then Staff → Add Staff with the Branch Manager role ticked
    const addManager = (id: number) => router.get('/seller/staff', { store: id, add: 'branch_manager' });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Branches" />
            <div className="space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6 text-blue-600" /> Branches</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            More outlets under {main.name}. Each branch is its own store for customers, with its own plan, staff and stock.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {canAdd && branches.some((b) => b.status === 'approved') && (
                            <Button asChild variant="outline"><Link href="/seller/main-dashboard"><LayoutGrid className="mr-1.5 h-4 w-4" /> Main dashboard</Link></Button>
                        )}
                        {canAdd ? (
                            <Button asChild className="bg-blue-600 text-white hover:bg-blue-700" data-testid="add-branch"><Link href="/seller/branches/create"><Plus className="mr-1.5 h-4 w-4" /> Add branch</Link></Button>
                        ) : (
                            <Button disabled title={blocker ?? undefined} data-testid="add-branch"><Lock className="mr-1.5 h-4 w-4" /> Add branch</Button>
                        )}
                    </div>
                </div>

                {!canAdd && blocker && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="branches-locked">
                        <Crown className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">{blocker} Your main store is on <strong>{main.plan}</strong>.</span>
                        <Button size="sm" variant="outline" onClick={() => openUpgrade('branches')}>See Premium</Button>
                    </div>
                )}

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Your stores</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {stores.map((s) => {
                                const st = STATUS[s.status] ?? { label: s.status, cls: 'bg-muted text-foreground/80' };
                                return (
                                    <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="branch-row">
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 font-medium">
                                                <span className="truncate">{s.is_main ? `${s.name}` : s.branch_name}</span>
                                                {s.is_main && <span className="rounded bg-blue-100 px-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Main</span>}
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{s.address}</span></p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Plan: <strong>{s.plan}</strong>{s.plan_key !== 'none' ? ` · ${s.days_left} day${s.days_left === 1 ? '' : 's'} left` : ''}
                                                {!s.is_main && <> · Manager: {s.manager ? <strong>{s.manager.name}</strong> : <span className="italic">none</span>}</>}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {s.status === 'approved' && (
                                                <Button size="sm" variant="outline" onClick={() => switchTo(s.id)}><ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Open</Button>
                                            )}
                                            {!s.is_main && s.status === 'approved' && (
                                                <Button size="sm" variant="outline" onClick={() => router.get('/seller/plan', { store: s.id })}><Crown className="mr-1 h-3.5 w-3.5" /> Plan</Button>
                                            )}
                                            {!s.is_main && s.status === 'approved' && !s.manager && (
                                                <Button size="sm" onClick={() => addManager(s.id)} className="bg-blue-600 text-white hover:bg-blue-700"><UserPlus className="mr-1 h-3.5 w-3.5" /> Add manager</Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {branches.length === 0 && (
                            <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">No branches yet.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="space-y-1.5 pt-5 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">How branches work</p>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>Branches need your main store on a <strong>paid Premium</strong> plan (the free trial doesn't include them).</li>
                            <li>Each branch uploads its own Business / Mayor's Permit, FSIC and DOE License to Operate; your BIR, DTI / SEC and ID are reused from the main store. The platform reviews the branch first.</li>
                            <li>An approved branch gets its own free {trialDays}-day Premium trial, then needs its own plan (Basic, Pro or Premium).</li>
                            <li>Customers see it as its own store, named "{main.name} — Branch name". Orders, chats, ratings and deliveries are per branch.</li>
                            <li>A Branch Manager runs one branch (all store modules, staff included) but can't change plans, other branches or the main dashboard.</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
