import { Link } from '@inertiajs/react';
import { AlertTriangle, ArrowLeft, Bike, Globe, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import OrderSummaryCard from './order-summary-card';
import ReportActions from './report-actions';
import ReportStatusBadges from './report-status-badge';
import ReportSteps from './report-steps';
import ReportTimeline from './report-timeline';
import type { ReportDetail as Report, ReportPortal } from './types';
import { useReportLive } from './use-report-live';

const SIDE_LABEL: Record<string, string> = { customer: 'Customer', store: 'Store', rider: 'Rider' };

/** Report page body shared by every portal: header + steps, timeline, actions, side cards. */
export default function ReportDetail({ report, portal, backHref, backLabel, side, liveProps = ['report'] }: {
    report: Report;
    portal: ReportPortal;
    backHref: string;
    backLabel: string;
    side?: ReactNode;
    liveProps?: string[];
}) {
    useReportLive(liveProps, report.id);
    const open = !['resolved', 'dismissed'].includes(report.status);
    const warnings = report.store_warnings ?? 0;

    const sideCards = (
        <>
            {side}
            {report.order_summary && <OrderSummaryCard summary={report.order_summary} />}
            {(report.store_warnings !== undefined && report.store_warnings !== null) && (
                <div className={`space-y-1 rounded-xl border p-4 text-sm ${warnings >= 3 ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : ''}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Store warnings (90 days)</p>
                    <p className="text-2xl font-bold">{warnings}</p>
                    {portal === 'admin' && warnings >= 3 && report.admin?.store_id && (
                        <Link href={`/admin/stores/${report.admin.store_id}`} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <AlertTriangle className="h-3 w-3" /> 3+ warnings in 90 days — consider suspending
                        </Link>
                    )}
                    {report.rider && (
                        <p className="flex items-center gap-1.5 pt-1 text-xs text-gray-600"><Bike className="h-3.5 w-3.5" /> Rider {report.rider.name}: {report.rider.warnings} warning(s) in 90 days</p>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4">
            <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>

            {(report.my_false_reports ?? 0) > 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    You have {report.my_false_reports} warning{report.my_false_reports === 1 ? '' : 's'} for false reports.
                </p>
            )}

            <div className={report.is_urgent && open ? 'space-y-4 rounded-xl border-2 border-red-300 p-4' : 'space-y-4 rounded-xl border p-4'}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-bold">
                            {report.is_system && <Globe className="h-5 w-5 text-gray-500" />}{report.category_label}
                        </h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            {report.is_system ? <>Website problem · {report.system_area}</> : <>
                                {report.store && <>{report.store.name} · </>}
                                {report.order && (report.order.link
                                    ? <Link href={report.order.link} className="font-mono text-blue-600 hover:underline">{report.order.order_number}</Link>
                                    : <span className="font-mono">{report.order.order_number}</span>)}
                            </>}
                        </p>
                    </div>
                    <ReportStatusBadges status={report.status} label={report.status_label} verdict={report.verdict_label} urgent={report.is_urgent}
                        escalated={report.escalated} route={report.route} showRoute={portal === 'admin' && !report.is_system} />
                </div>

                <ReportSteps steps={report.steps} />

                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div><dt className="inline text-gray-500">Reported by: </dt><dd className="inline">{report.reporter.name} ({SIDE_LABEL[report.reporter.side] ?? report.reporter.side})</dd></div>
                    <div><dt className="inline text-gray-500">About: </dt><dd className="inline">{report.target.name}</dd></div>
                    {report.admin?.page_url && (
                        <div className="sm:col-span-2"><dt className="inline text-gray-500">Page: </dt>
                            <dd className="inline break-all"><a href={report.admin.page_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{report.admin.page_url}</a></dd></div>
                    )}
                    {report.admin?.user_agent && (
                        <div className="sm:col-span-2"><dt className="inline text-gray-500">Browser: </dt><dd className="inline break-all text-xs">{report.admin.user_agent}</dd></div>
                    )}
                </dl>
                {report.escalated && report.escalation_reason && (
                    <p className="flex items-start gap-1.5 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Sent to the admin: {report.escalation_reason}
                    </p>
                )}
                {!open && report.resolution && (
                    <p className="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
                        <span className="font-medium">Outcome{report.verdict_label ? ` (${report.verdict_label})` : ''}: </span>{report.resolution}
                    </p>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="min-w-0 space-y-4">
                    <ReportTimeline report={report} />
                    <ReportActions report={report} portal={portal} />
                </div>
                <aside className="space-y-4">{sideCards}</aside>
            </div>
        </div>
    );
}
