import { Head } from '@inertiajs/react';
import ReportDetail from '@/components/reports/report-detail';
import type { ReportDetail as Report } from '@/components/reports/types';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

export default function RiderReportShow({ report }: { report: Report }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'My Reports', href: '/rider/reports' },
        { title: report.category_label, href: `/rider/reports/${report.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Report — ${report.category_label}`} />
            <div className="p-3 sm:p-6">
                <ReportDetail report={report} portal="rider" backHref="/rider/reports" backLabel="My Reports" />
            </div>
        </AppLayout>
    );
}
