import { Head, Link } from '@inertiajs/react';
import { Phone } from 'lucide-react';
import ReportDetail from '@/components/reports/report-detail';
import type { ReportDetail as Report } from '@/components/reports/types';
import TierBadge, { type Tier } from '@/components/tier-badge';
import TrustScoreBar from '@/components/trust-score-bar';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Props = {
    report: Report;
    customer: { name: string; phone: string | null } | null;
    loyalty: { tier: Tier; trust_score: number } | null;
};

export default function SellerCustomerReportShow({ report, customer, loyalty }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Customer Reports', href: '/seller/customer-reports' },
        { title: report.category_label, href: `/seller/customer-reports/${report.id}` },
    ];

    const side = customer && (
        <div className="space-y-3 rounded-xl border p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</p>
            <p className="font-semibold">{customer.name}</p>
            {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-blue-600"><Phone className="h-4 w-4" /> {customer.phone}</a>}
            {report.order?.link && <Link href={report.order.link} className="block text-blue-600 hover:underline">View order {report.order.order_number}</Link>}
            {loyalty && (
                <div className="space-y-2 border-t pt-3">
                    <TierBadge tier={loyalty.tier} size="md" />
                    <div>
                        <p className="mb-1 text-xs text-gray-500">Trust score</p>
                        <TrustScoreBar score={loyalty.trust_score} />
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Report — ${report.category_label}`} />
            <div className="p-3 sm:p-6">
                <ReportDetail report={report} portal="seller" backHref="/seller/customer-reports" backLabel="Customer Reports"
                    side={side} liveProps={['report', 'customer', 'loyalty']} />
            </div>
        </AppLayout>
    );
}
