import { Head } from '@inertiajs/react';
import ReportList from '@/components/reports/report-list';
import ReportTabs from '@/components/reports/report-tabs';
import type { Paginated, ReportListItem } from '@/components/reports/types';
import { useReportLive } from '@/components/reports/use-report-live';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Reports', href: '/rider/reports' }];

export default function RiderReports({ reports, tab }: { reports: Paginated<ReportListItem>; tab: string }) {
    useReportLive(['reports']);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Reports" />
            <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">My Reports</h1>
                    <p className="text-sm text-muted-foreground">Customers you reported (your store and the platform admin see these) and website problems.</p>
                </div>
                <ReportTabs base="/rider/reports" tab={tab} />
                <ReportList reports={reports}
                    empty={tab === 'website' ? 'No website problems reported.' : 'No reports yet. You can report a customer from a delivery.'} />
            </div>
        </AppLayout>
    );
}
