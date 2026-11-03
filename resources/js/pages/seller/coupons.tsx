import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { TicketPercent } from 'lucide-react';
import { CouponManager, type CouponRow } from '@/components/coupon-manager';
import type { BreadcrumbItem } from '@/types';

type Props = {
    coupons: { data: CouponRow[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null };
    filters: { search?: string };
    suggested_code: string;
    customers_count: number;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Coupons', href: '/seller/coupons' }];

export default function SellerCoupons({ coupons, filters, suggested_code, customers_count }: Props) {
    const prefix = suggested_code.split('-')[0] || 'SHOP';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Coupons" />
            <div className="p-6 space-y-5">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><TicketPercent className="h-6 w-6 text-blue-600" /> Coupons</h1>
                    <p className="text-sm text-muted-foreground">
                        Run your own store promotions. Store coupons work only at your store, and your store covers the full discount.
                    </p>
                </div>

                <CouponManager
                    coupons={coupons}
                    filters={filters}
                    basePath="/seller/coupons"
                    suggestedCode={suggested_code}
                    codePrefix={prefix}
                    audienceNote={`Your ${customers_count} past customer(s) are notified when it's created.`}
                />
            </div>
        </AppLayout>
    );
}
