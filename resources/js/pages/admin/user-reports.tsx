import { Head, router } from '@inertiajs/react';
import { BellRing, Download, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { relativeTime } from '@/components/chat/format';
import ReportList from '@/components/reports/report-list';
import ReportStatusBadges from '@/components/reports/report-status-badge';
import type { Paginated, ReportListItem } from '@/components/reports/types';
import { useReportLive } from '@/components/reports/use-report-live';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'User Reports', href: '/admin/user-reports' }];

const TABS = [
    { key: 'needs_admin', label: 'Needs admin' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'escalated', label: 'With admin (sent by customer or automatically)' },
    { key: 'store_no_reply', label: "Store hasn't replied" },
    { key: 'monitoring', label: 'Monitoring' },
    { key: 'website', label: 'Website problems' },
    { key: 'open', label: 'All open' },
    { key: 'closed', label: 'Closed' },
    { key: 'store_response', label: 'Store response' },
] as const;

type StoreRow = {
    store_id: number; store_name: string; received: number; replied_24h: number;
    avg_hours: number | null; fixed_by_store: number; sent_to_admin: number; warnings_90d: number;
};

type MonitoringRow = ReportListItem & { last_store_activity_at: string | null; idle_since: string; reminded_at: string | null };

type Props = {
    items: Paginated<ReportListItem> | null;
    monitoringIdle: number;
    tab: string;
    search: string;
    counts: Record<string, number>;
    storeResponse: StoreRow[] | null;
};

export default function AdminUserReports({ items, tab, search, counts, storeResponse, monitoringIdle }: Props) {
    const [q, setQ] = useState(search);
    useReportLive(['items', 'counts', 'storeResponse', 'monitoringIdle']);

    const go = (params: Record<string, string>) => router.get('/admin/user-reports', { tab, search: q, ...params }, { preserveState: true, preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="User Reports" />
            <div className="space-y-4 p-3 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">User Reports</h1>
                        <p className="text-sm text-muted-foreground">Reports from customers, stores and riders.</p>
                    </div>
                    <a href="/admin/user-reports/export"><Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button></a>
                </div>

                <div className="flex flex-wrap gap-1 border-b">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" onClick={() => go({ tab: t.key, page: '1' })}
                            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
                            {t.label}
                            {t.key === 'monitoring' && monitoringIdle > 0 && (
                                <span className="ml-1 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" title="A store hasn't responded for 24+ hours" />
                            )}
                            {(counts[t.key] ?? 0) > 0 && (
                                <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                    t.key === 'needs_admin' || t.key === 'urgent' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600')}>{counts[t.key]}</span>
                            )}
                        </button>
                    ))}
                </div>

                {tab === 'store_response' ? (
                    <StoreResponse rows={storeResponse ?? []} />
                ) : (
                    <>
                        <form onSubmit={(e: FormEvent) => { e.preventDefault(); go({ page: '1' }); }} className="relative max-w-sm">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject, reporter, store or order" className="pl-8" aria-label="Search reports" />
                        </form>
                        {items && tab === 'monitoring' && <MonitoringList rows={items as Paginated<MonitoringRow>} />}
                        {items && tab !== 'monitoring' && <ReportList reports={items} showReporter showRoute highlightWaiting empty="No reports here." />}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

function StoreResponse({ rows }: { rows: StoreRow[] }) {
    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                Last 90 days. For each store: customer reports it had to handle, how many it answered within 24 hours, its average time
                to the first reply, how many it fixed without the admin, how many ended up with the admin, and its warnings (valid complaints
                and false reports it filed). Stores are never suspended automatically. Slowest stores first.
            </p>
            {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-500">No store-handled customer reports in the last 90 days.</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                            <tr>
                                <th className="px-4 py-2.5 font-medium">Store</th>
                                <th className="px-4 py-2.5 text-right font-medium">Reports received</th>
                                <th className="px-4 py-2.5 text-right font-medium">Replied within 24h</th>
                                <th className="px-4 py-2.5 text-right font-medium">Average first reply</th>
                                <th className="px-4 py-2.5 text-right font-medium">Fixed by store</th>
                                <th className="px-4 py-2.5 text-right font-medium">Sent to admin</th>
                                <th className="px-4 py-2.5 text-right font-medium">Warnings (90 days)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.map((r) => (
                                <tr key={r.store_id}>
                                    <td className="px-4 py-2.5 font-medium">{r.store_name}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.received}</td>
                                    <td className={cn('px-4 py-2.5 text-right tabular-nums', r.replied_24h < 50 && 'text-red-600')}>{r.replied_24h}%</td>
                                    <td className={cn('px-4 py-2.5 text-right tabular-nums', (r.avg_hours === null || r.avg_hours > 24) && 'text-red-600')}>
                                        {r.avg_hours === null ? 'Never replied' : `${r.avg_hours.toFixed(1)} h`}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.fixed_by_store}%</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sent_to_admin}%</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <span className="tabular-nums">{r.warnings_90d}</span>
                                        {r.warnings_90d >= 3 && (
                                            <a href={`/admin/stores/${r.store_id}`} className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                                3+ warnings in 90 days — consider suspending
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const ago = (iso: string) => {
    const t = relativeTime(iso);
    return t === 'now' ? 'just now' : /^\d+[mh]$/.test(t) ? `${t} ago` : t;
};

/** Every open store-handled report the admin is watching: urgent first, then longest without store activity. */
function MonitoringList({ rows }: { rows: Paginated<MonitoringRow> }) {
    if (rows.data.length === 0) {
        return <p className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-500">No store-handled reports are open right now.</p>;
    }
    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Open reports the stores are handling. Red means the store hasn't done anything for 24 hours or more.</p>
            <ul className="space-y-2">
                {rows.data.map((r) => {
                    const idleHours = (Date.now() - new Date(r.idle_since).getTime()) / 3600_000;
                    const reminded = !!r.reminded_at && Date.now() - new Date(r.reminded_at).getTime() < 3600_000;
                    return (
                        <li key={r.id}>
                            <div role="link" tabIndex={0} onClick={() => router.visit(r.link)} onKeyDown={(e) => e.key === 'Enter' && router.visit(r.link)}
                                className={cn('flex cursor-pointer flex-col gap-2 rounded-lg border bg-white px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center dark:bg-gray-950 dark:hover:bg-gray-900',
                                    r.is_urgent && 'border-red-300 ring-1 ring-red-200')}>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold">{r.category_label}</span>
                                        <ReportStatusBadges status={r.status} label={r.status_label} urgent={r.is_urgent} />
                                    </div>
                                    <p className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                                        {r.store && <span>{r.store.name}</span>}
                                        {r.order_number && <span className="font-mono">{r.order_number}</span>}
                                        <span className={cn(idleHours >= 24 && 'font-semibold text-red-600')}>
                                            Last store activity: {r.last_store_activity_at ? ago(r.last_store_activity_at) : 'No response yet'}
                                        </span>
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {r.reminded_at && <span className="text-[11px] text-gray-500">Reminded {ago(r.reminded_at)}</span>}
                                    <Button size="sm" variant="outline" className="gap-1.5" disabled={reminded}
                                        onClick={() => router.post(`/admin/user-reports/${r.id}/remind-store`, {}, { preserveScroll: true, preserveState: true })}>
                                        <BellRing className="h-3.5 w-3.5" /> Remind the store
                                    </Button>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
