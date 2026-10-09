import { Head } from '@inertiajs/react';
import ReportList from '@/components/reports/report-list';
import ReportTabs from '@/components/reports/report-tabs';
import type { Paginated, ReportListItem } from '@/components/reports/types';
import { useReportLive } from '@/components/reports/use-report-live';
import CustomerLayout from '@/layouts/customer-layout';

type Props = { reports: Paginated<ReportListItem>; tab: string; falseReports: number };

export default function CustomerReports({ reports, tab, falseReports }: Props) {
    useReportLive(['reports', 'falseReports']);

    return (
        <CustomerLayout title="My Reports">
            <Head title="My Reports" />
            <div className="mx-auto w-full max-w-4xl space-y-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Reports</h1>
                    <p className="text-sm text-muted-foreground">Problems you reported. Open one to see replies or add details.</p>
                </div>
                {falseReports > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                        You have {falseReports} warning{falseReports === 1 ? '' : 's'} for false reports.
                    </p>
                )}
                <ReportTabs base="/customer/reports" tab={tab} />
                <ReportList reports={reports} showStore={tab !== 'website'}
                    empty={tab === 'website' ? 'No website problems reported. Use "Report a website problem" in the menu if something on the site isn\'t working.'
                        : 'No reports yet. You can report a problem from any of your orders.'} />
            </div>
        </CustomerLayout>
    );
}
