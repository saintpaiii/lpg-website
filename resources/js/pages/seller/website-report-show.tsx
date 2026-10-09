import { Head } from '@inertiajs/react';
import ReportDetail from '@/components/reports/report-detail';
import type { ReportDetail as Report } from '@/components/reports/types';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

export default function SellerWebsiteReportShow({ report }: { report: Report }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'My website reports', href: '/seller/website-reports' },
        { title: report.category_label, href: `/seller/website-reports/${report.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Website problem — ${report.category_label}`} />
            <div className="p-3 sm:p-6">
                <ReportDetail report={report} portal="seller" backHref="/seller/website-reports" backLabel="My website reports" />
            </div>
        </AppLayout>
    );
}
