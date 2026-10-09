import { Link } from '@inertiajs/react';
import { ChevronRight, Flag } from 'lucide-react';
import { relativeTime } from '@/components/chat/format';
import { cn } from '@/lib/utils';
import ReportStatusBadges from './report-status-badge';
import type { Paginated, ReportListItem } from './types';

const SIDE: Record<string, string> = { customer: 'Customer', store: 'Store', rider: 'Rider' };
const ROLE: Record<string, string> = { customer: 'Customer', seller: 'Store owner', seller_staff: 'Store staff', rider: 'Rider' };

/** "just now", "3h ago", or a date for older activity. */
const activityLabel = (iso: string | null) => {
    const t = relativeTime(iso);
    return t === 'now' ? 'just now' : /^\d+[mh]$/.test(t) ? `${t} ago` : t;
};

/** Report rows (mobile-friendly cards) + simple pagination. */
export default function ReportList({ reports, empty, showReporter = false, showStore = true, showRoute = false, highlightWaiting = false }: {
    reports: Paginated<ReportListItem>;
    empty: string;
    showReporter?: boolean;
    showStore?: boolean;
    showRoute?: boolean;
    /** Red waiting time when an open report has had no activity for over 48 h (admin view). */
    highlightWaiting?: boolean;
}) {
    if (reports.data.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-sm text-gray-500">
                <Flag className="h-8 w-8 text-gray-300" /> {empty}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <ul className="space-y-2">
                {reports.data.map((r) => {
                    const open = !['resolved', 'dismissed'].includes(r.status);
                    const stale = highlightWaiting && open && r.last_activity_at && Date.now() - new Date(r.last_activity_at).getTime() > 48 * 3600_000;
                    return (
                        <li key={r.id}>
                            <Link href={r.link} className={cn('flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900',
                                r.is_urgent && open && 'border-red-300 ring-1 ring-red-200')}>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold">{r.category_label}</span>
                                        <ReportStatusBadges status={r.status} label={r.status_label} verdict={r.verdict_label} urgent={r.is_urgent} escalated={r.escalated} route={r.route} showRoute={showRoute} />
                                    </div>
                                    <p className="truncate text-sm text-gray-600 dark:text-gray-400">{r.subject}</p>
                                    <p className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                                        {r.order_number && <span className="font-mono">{r.order_number}</span>}
                                        {showStore && r.store && <span>{r.store.name}</span>}
                                        {showReporter && <span>By {r.reporter.name} ({r.is_system ? (ROLE[r.reporter.role ?? ''] ?? SIDE[r.reporter.side]) : (SIDE[r.reporter.side] ?? r.reporter.side)})</span>}
                                        {r.is_system && r.page_url && <span className="max-w-[16rem] truncate">Page: {r.page_url.replace(/^https?:\/\/[^/]+/, '')}</span>}
                                        {r.is_system
                                            ? <span>{r.system_area} · {r.screenshots} screenshot{r.screenshots === 1 ? '' : 's'}</span>
                                            : <span>About: {r.target.name}</span>}
                                        <span className={cn(stale && 'font-semibold text-red-600')}>{activityLabel(r.last_activity_at)}</span>
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                            </Link>
                        </li>
                    );
                })}
            </ul>

            {reports.last_page > 1 && reports.links && (
                <nav className="flex flex-wrap justify-center gap-1 pt-2" aria-label="Pages">
                    {reports.links.map((l, i) => l.url ? (
                        <Link key={i} href={l.url} preserveScroll
                            className={cn('rounded-md border px-3 py-1 text-sm', l.active ? 'bg-blue-600 text-white' : 'hover:bg-gray-50')}>
                            {l.label.replace('&laquo;', '«').replace('&raquo;', '»')}
                        </Link>
                    ) : null)}
                </nav>
            )}
        </div>
    );
}
