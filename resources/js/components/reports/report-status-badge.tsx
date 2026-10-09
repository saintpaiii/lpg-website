import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    investigating: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    awaiting_confirmation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    dismissed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const ROUTE_LABEL: Record<string, string> = { store: 'Store', admin: 'Admin', both: 'Store + Admin' };

/** Status (label from the backend, which knows the viewer) + URGENT / With admin pills. */
export default function ReportStatusBadges({ status, label, verdict, urgent, escalated, route, showRoute = false, className }: {
    status: string;
    label: string;
    /** Outcome chip once closed, e.g. "Resolved · False report" */
    verdict?: string | null;
    urgent?: boolean;
    escalated?: boolean;
    route?: string;
    showRoute?: boolean;
    className?: string;
}) {
    const open = !['resolved', 'dismissed'].includes(status);
    return (
        <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
            {urgent && open && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    <AlertTriangle className="h-3 w-3" /> Urgent
                </span>
            )}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[status] ?? STATUS_STYLE.dismissed)}>
                {label}{!open && verdict ? ` · ${verdict}` : ''}
            </span>
            {escalated && open && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                    <ShieldAlert className="h-3 w-3" /> With admin
                </span>
            )}
            {showRoute && route && (
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300">{ROUTE_LABEL[route] ?? route}</span>
            )}
        </span>
    );
}
