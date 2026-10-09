import { Head, router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import ReportList from '@/components/reports/report-list';
import type { Paginated, ReportListItem } from '@/components/reports/types';
import { useReportLive } from '@/components/reports/use-report-live';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Customer Reports', href: '/seller/customer-reports' }];

const TABS = [
    { key: 'needs_reply', label: 'Needs reply' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'waiting_customer', label: 'Waiting for customer' },
    { key: 'with_admin', label: 'With admin' },
    { key: 'closed', label: 'Closed' },
    { key: 'filed', label: 'Filed by us' },
] as const;

type Props = { reports: Paginated<ReportListItem>; tab: string; search: string; counts: Record<string, number>; storeWarnings: number };

export default function SellerCustomerReports({ reports, tab, search, counts, storeWarnings }: Props) {
    const [q, setQ] = useState(search);
    useReportLive(['reports', 'counts', 'storeWarnings']);

    const go = (params: Record<string, string>) => router.get('/seller/customer-reports', { tab, search: q, ...params }, { preserveState: true, preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customer Reports" />
            <div className="space-y-4 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Customer Reports</h1>
                    <p className="text-sm text-muted-foreground">
                        Problems customers and your riders reported. Reply within 48 hours, or the report goes to the platform admin.
                    </p>
                </div>

                {storeWarnings > 0 && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                        Your store has {storeWarnings} warning{storeWarnings === 1 ? '' : 's'} from the platform admin in the last 90 days.
                        Please respond to and solve customer problems quickly.
                    </p>
                )}

                <div className="flex flex-wrap gap-1 border-b">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" onClick={() => go({ tab: t.key, page: '1' })}
                            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
                            {t.label}
                            {(counts[t.key] ?? 0) > 0 && (
                                <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', t.key === 'needs_reply' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
                                    {counts[t.key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <form onSubmit={(e: FormEvent) => { e.preventDefault(); go({ page: '1' }); }} className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number or customer name" className="pl-8" aria-label="Search reports" />
                </form>

                <ReportList reports={reports} showReporter showStore={false}
                    empty={tab === 'needs_reply' ? 'Nothing needs a reply right now.' : 'No reports here.'} />
            </div>
        </AppLayout>
    );
}
