import { Head } from '@inertiajs/react';
import ReportDetail from '@/components/reports/report-detail';
import type { ReportDetail as Report } from '@/components/reports/types';
import CustomerLayout from '@/layouts/customer-layout';

export default function CustomerReportShow({ report }: { report: Report }) {
    return (
        <CustomerLayout title="My Reports">
            <Head title={`Report — ${report.category_label}`} />
            <ReportDetail report={report} portal="customer" backHref="/customer/reports" backLabel="My Reports" />
        </CustomerLayout>
    );
}
