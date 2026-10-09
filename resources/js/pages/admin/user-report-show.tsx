import { Head } from '@inertiajs/react';
import ReportDetail from '@/components/reports/report-detail';
import type { ReportDetail as Report } from '@/components/reports/types';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const SOURCE: Record<string, string> = { reporter: 'by the customer', auto: 'automatically (no store reply in 48 hours)', admin: 'by an admin (take over)' };

export default function AdminUserReportShow({ report }: { report: Report }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'User Reports', href: '/admin/user-reports' },
        { title: `#${report.id}`, href: `/admin/user-reports/${report.id}` },
    ];
    const a = report.admin;

    const side = a && (
        <div className="space-y-2 rounded-xl border p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Admin only</p>
            {a.reporter_email && <p><span className="text-gray-500">Reporter email: </span><a className="text-blue-600" href={`mailto:${a.reporter_email}`}>{a.reporter_email}</a></p>}
            {a.reporter_phone && <p><span className="text-gray-500">Reporter phone: </span><a className="text-blue-600" href={`tel:${a.reporter_phone}`}>{a.reporter_phone}</a></p>}
            {a.reported_email && <p><span className="text-gray-500">Reported user email: </span>{a.reported_email}</p>}
            <p><span className="text-gray-500">First store reply: </span>{a.store_first_response_at ?? '—'}</p>
            {a.escalation_source && <p><span className="text-gray-500">Sent to admin </span>{SOURCE[a.escalation_source] ?? a.escalation_source}</p>}
            {a.admin_notes && <p className="whitespace-pre-wrap rounded bg-yellow-50 p-2 text-xs dark:bg-yellow-900/20"><span className="font-medium">Old admin notes: </span>{a.admin_notes}</p>}
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Report #${report.id}`} />
            <div className="p-3 sm:p-6">
                <ReportDetail report={report} portal="admin" backHref="/admin/user-reports" backLabel="User Reports" side={side} />
            </div>
        </AppLayout>
    );
}
