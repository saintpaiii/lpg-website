import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Store } from 'lucide-react';
import type { CouponRow } from '@/components/coupon-manager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { peso } from '@/lib/coupons';
import type { BreadcrumbItem } from '@/types';

type Stats = {
    checkouts: number;
    orders: number;
    new_customers: number;
    revenue: number;
    discount_given: number;
    admin_absorbed: number;
    seller_absorbed: number;
    commission_waived: number;
};

type Use = {
    id: number;
    order_id: number;
    order_number: string | null;
    store_name: string | null;
    customer_name: string | null;
    discount: number;
    admin_absorbed: number;
    seller_absorbed: number;
    commission_rate: number | null;
    status: string | null;
    created_at: string | null;
};

type Props = {
    coupon: CouponRow;
    stats: Stats;
    participating: { id: number; store_name: string }[];
    excluded: { store_name: string | null; excluded_at: string | null }[];
    uses: Use[];
};

export default function AdminCouponShow({ coupon, stats, participating, excluded, uses }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Coupons', href: '/admin/coupons' },
        { title: coupon.code, href: `/admin/coupons/${coupon.id}` },
    ];

    const cards: [string, string, string?][] = [
        ['Total discount given', peso(stats.discount_given), 'text-red-600'],
        ['Admin absorbed', peso(stats.admin_absorbed), 'text-emerald-700'],
        ['Seller absorbed', peso(stats.seller_absorbed)],
        ['Commission waived', peso(stats.commission_waived)],
        ['Orders with coupon', `${stats.orders} (${stats.checkouts} checkout${stats.checkouts === 1 ? '' : 's'})`],
        ['New customers', String(stats.new_customers)],
        ['Revenue from coupon orders', peso(stats.revenue)],
        ['Participating stores', `${participating.length} of ${participating.length + excluded.length}`],
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={coupon.code} />
            <div className="p-6 space-y-6 max-w-6xl">
                <div className="flex items-center gap-3">
                    <Link href="/admin/coupons"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
                    <div>
                        <h1 className="text-xl font-bold font-mono">{coupon.code}</h1>
                        <p className="text-sm text-muted-foreground">
                            {coupon.label} · Admin covers {coupon.admin_share_percent}% ·{' '}
                            {coupon.seller_commission_during_promo != null ? `${coupon.seller_commission_during_promo}% promo commission` : 'normal commission'}
                            {coupon.featured_boost ? ' · Featured boost on' : ''} · {coupon.used_count} use(s)
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {cards.map(([label, value, cls]) => (
                        <Card key={label}>
                            <CardContent className="pt-5">
                                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                <p className={`mt-1 text-xl font-bold ${cls ?? ''}`}>{value}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    "Commission waived" is the difference between each store's normal commission rate and the promo rate on the original price.
                    "New customers" placed their first-ever order with this coupon. Cancelled orders are excluded.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> Participating ({participating.length})</CardTitle></CardHeader>
                        <CardContent className="flex flex-wrap gap-1.5">
                            {participating.length === 0
                                ? <p className="text-sm text-muted-foreground">No stores participating.</p>
                                : participating.map((s) => <span key={s.id} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">{s.store_name}</span>)}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-base">Opted out ({excluded.length})</CardTitle></CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {excluded.length === 0
                                ? <p className="text-muted-foreground">No stores have opted out.</p>
                                : excluded.map((e, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span>{e.store_name}</span>
                                        <span className="text-xs text-muted-foreground">{e.excluded_at}</span>
                                    </div>
                                ))}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader><CardTitle className="text-base">Orders using {coupon.code}</CardTitle></CardHeader>
                    <CardContent>
                        {uses.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No orders have used this coupon yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-3 pr-4 font-medium">Date</th>
                                            <th className="pb-3 pr-4 font-medium">Order</th>
                                            <th className="pb-3 pr-4 font-medium">Store</th>
                                            <th className="pb-3 pr-4 font-medium">Customer</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Discount</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Admin</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Seller</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Rate</th>
                                            <th className="pb-3 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {uses.map((u) => (
                                            <tr key={u.id}>
                                                <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{u.created_at}</td>
                                                <td className="py-2.5 pr-4 font-mono">{u.order_number}</td>
                                                <td className="py-2.5 pr-4">{u.store_name}</td>
                                                <td className="py-2.5 pr-4">{u.customer_name}</td>
                                                <td className="py-2.5 pr-4 text-right text-red-600">−{peso(u.discount)}</td>
                                                <td className="py-2.5 pr-4 text-right">{peso(u.admin_absorbed)}</td>
                                                <td className="py-2.5 pr-4 text-right">{peso(u.seller_absorbed)}</td>
                                                <td className="py-2.5 pr-4 text-right text-muted-foreground">{u.commission_rate != null ? `${u.commission_rate}%` : '—'}</td>
                                                <td className="py-2.5 capitalize">{u.status?.replace(/_/g, ' ')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
