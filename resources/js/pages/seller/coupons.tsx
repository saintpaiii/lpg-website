import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { AlertTriangle, BadgePercent, Flame, Megaphone, TicketPercent } from 'lucide-react';
import { useState } from 'react';
import { CouponManager, type CouponRow } from '@/components/coupon-manager';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { peso } from '@/lib/coupons';
import type { BreadcrumbItem } from '@/types';

type Promotion = {
    id: number;
    code: string;
    label: string;
    min_order_amount: number;
    admin_share_percent: number;
    promo_rate: number;
    normal_rate: number;
    featured_boost: boolean;
    starts_at: string | null;
    expires_at: string | null;
    state: 'active' | 'scheduled' | 'expired' | 'used_up' | 'inactive';
    participating: boolean;
    my_orders: number;
    my_discount: number;
    my_cost: number;
};

type Props = {
    tab: 'mine' | 'platform';
    promotions: Promotion[];
    coupons: { data: CouponRow[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null };
    filters: { search?: string };
    commission_rate: number;
    suggested_code: string;
    customers_count: number;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Coupons', href: '/seller/coupons' }];

export default function SellerCoupons({ tab, promotions, coupons, filters, commission_rate, suggested_code, customers_count }: Props) {
    const prefix = suggested_code.split('-')[0] || 'SHOP';
    const [optingOut, setOptingOut] = useState<Promotion | null>(null);

    function goTab(t: 'mine' | 'platform') {
        router.get('/seller/coupons', { tab: t }, { preserveState: true, preserveScroll: true, replace: true });
    }

    function setParticipation(p: Promotion, participate: boolean) {
        router.patch(`/seller/coupons/platform/${p.id}/participation`, { participate }, {
            preserveScroll: true,
            onSuccess: () => setOptingOut(null),
        });
    }

    const participatingCount = promotions.filter((p) => p.participating).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Coupons" />
            <div className="p-6 space-y-5">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><TicketPercent className="h-6 w-6 text-blue-600" /> Coupons</h1>
                    <p className="text-sm text-muted-foreground">Run your own store promos and choose which platform promotions to join.</p>
                </div>

                <div className="flex gap-1 border-b">
                    {([['mine', 'My Coupons', coupons.total], ['platform', 'Platform Promotions', promotions.length]] as const).map(([key, label, n]) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                            {n > 0 && <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">{n}</span>}
                        </button>
                    ))}
                </div>

                {tab === 'mine' ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Store coupons work only at your store. Your store covers the full discount, and the {commission_rate}% platform
                            commission is still calculated on the original price.
                        </p>
                        <CouponManager
                            coupons={coupons}
                            filters={filters}
                            basePath="/seller/coupons"
                            isPlatform={false}
                            commissionRate={commission_rate}
                            suggestedCode={suggested_code}
                            codePrefix={prefix}
                            audienceNote={`Your ${customers_count} past customer(s) are notified when it's created.`}
                        />
                    </>
                ) : promotions.length === 0 ? (
                    <Card>
                        <CardContent className="py-14 text-center text-muted-foreground">
                            <Megaphone className="mx-auto mb-2 h-8 w-8" />
                            No platform promotions are running right now.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Platform promotions are funded jointly by the platform and participating stores. You're opted in by default —
                            currently participating in {participatingCount} of {promotions.length}.
                        </p>
                        {promotions.map((p) => (
                            <Card key={p.id} className={p.participating ? 'border-emerald-200 dark:border-emerald-900' : 'opacity-80'}>
                                <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-lg font-bold">{p.code}</span>
                                            <span className="text-base font-semibold">— {p.label}</span>
                                            {p.state === 'scheduled' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Starts {p.starts_at}</span>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {p.min_order_amount > 0 ? `Min order ${peso(p.min_order_amount)} · ` : ''}
                                            {p.expires_at ? `Until ${p.expires_at}` : 'No end date'}
                                        </p>
                                        <ul className="space-y-1">
                                            <li className="flex items-center gap-2">
                                                <BadgePercent className="h-4 w-4 text-red-500" />
                                                Your cost: <strong>{100 - p.admin_share_percent}% of the discount</strong> (admin covers {p.admin_share_percent}%)
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <BadgePercent className="h-4 w-4 text-emerald-600" />
                                                Your commission during promo: <strong>{p.promo_rate}%</strong>
                                                {p.promo_rate !== p.normal_rate && <span className="text-muted-foreground">(instead of {p.normal_rate}%)</span>}
                                            </li>
                                            {p.featured_boost && (
                                                <li className="flex items-center gap-2">
                                                    <Flame className="h-4 w-4 text-orange-500" />
                                                    Benefits: featured placement and a 🔥 Promo badge on your products
                                                </li>
                                            )}
                                        </ul>
                                        {p.my_orders > 0 && (
                                            <p className="text-xs text-muted-foreground">
                                                So far: {p.my_orders} order(s) · {peso(p.my_discount)} discounted · your share {peso(p.my_cost)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-medium ${p.participating ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                                                {p.participating ? 'Participating' : 'Not participating'}
                                            </span>
                                            <button type="button" role="switch" aria-checked={p.participating} aria-label={`Participate in ${p.code}`}
                                                onClick={() => (p.participating ? setOptingOut(p) : setParticipation(p, true))}
                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${p.participating ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${p.participating ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                        {!p.participating && <p className="text-xs text-muted-foreground">Your products are excluded from this coupon.</p>}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={!!optingOut} onOpenChange={(o) => { if (!o) setOptingOut(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" /> Opt out of {optingOut?.code}?
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Your products won't be eligible. Customers may choose participating stores.
                        {optingOut?.featured_boost && ' You will also lose the featured placement and Promo badge for this promotion.'}
                        {' '}You can opt back in at any time.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOptingOut(null)}>Keep participating</Button>
                        <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={() => optingOut && setParticipation(optingOut, false)}>
                            Opt out
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
