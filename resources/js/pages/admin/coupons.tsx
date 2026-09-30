import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { TicketPercent } from 'lucide-react';
import { CouponManager, type CouponRow } from '@/components/coupon-manager';
import type { BreadcrumbItem } from '@/types';

type Props = {
    coupons: { data: CouponRow[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null };
    filters: { search?: string };
    commission_rate: number;
    suggested_code: string;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Coupons', href: '/admin/coupons' }];

export default function AdminCoupons({ coupons, filters, commission_rate, suggested_code }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Platform Coupons" />
            <div className="p-6 space-y-5">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><TicketPercent className="h-6 w-6 text-blue-600" /> Platform Coupons</h1>
                    <p className="text-sm text-muted-foreground">
                        Promo codes usable at every participating store. The discount cost is shared between the platform and the store,
                        and stores can opt out from their Coupons page.
                    </p>
                </div>
                <CouponManager
                    coupons={coupons}
                    filters={filters}
                    basePath="/admin/coupons"
                    isPlatform
                    commissionRate={commission_rate}
                    suggestedCode={suggested_code}
                    codePrefix="LPG"
                    audienceNote="All customers and sellers are notified when it's created."
                />
            </div>
        </AppLayout>
    );
}
