import { Head } from '@inertiajs/react';
import { Bug } from 'lucide-react';
import { useState } from 'react';
import ReportList from '@/components/reports/report-list';
import type { Paginated, ReportListItem } from '@/components/reports/types';
import { useReportLive } from '@/components/reports/use-report-live';
import WebsiteProblemDialog from '@/components/reports/website-problem-dialog';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My website reports', href: '/seller/website-reports' }];

export default function SellerWebsiteReports({ reports }: { reports: Paginated<ReportListItem> }) {
    const [open, setOpen] = useState(false);
    useReportLive(['reports']);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My website reports" />
            <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">My website reports</h1>
                        <p className="text-sm text-muted-foreground">Problems with the website you reported. Only you and the platform admin see these.</p>
                    </div>
                    <Button className="gap-1.5" onClick={() => setOpen(true)}><Bug className="h-4 w-4" /> Report a website problem</Button>
                </div>
                <ReportList reports={reports} showStore={false} empty="No website problems reported." />
            </div>
            <WebsiteProblemDialog open={open} onOpenChange={setOpen} portal="store" />
        </AppLayout>
    );
}
