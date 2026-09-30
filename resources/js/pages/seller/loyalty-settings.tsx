import AppLayout from '@/layouts/app-layout';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Award, Info, ShieldAlert, Users } from 'lucide-react';
import { type FormEvent } from 'react';
import TierBadge, { TIER_DOTS, type Tier } from '@/components/tier-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BreadcrumbItem } from '@/types';

type Settings = {
    is_enabled: boolean;
    regular_threshold: number;
    loyal_threshold: number;
    vip_threshold: number;
    new_downpayment_percent: number;
    regular_downpayment_percent: number;
    loyal_downpayment_percent: number;
    vip_downpayment_percent: number;
    min_trust_score_for_consignment: number;
    inactivity_days: number;
};

type Props = {
    settings: Settings;
    store_default_dp: number;
    consignment_on: boolean;
    enrolled_customers: number;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Loyalty Program', href: '/seller/loyalty/settings' }];

type FormFields = Omit<Settings, 'is_enabled'>;

export default function LoyaltySettings({ settings, consignment_on, enrolled_customers }: Props) {
    const { is_enabled, ...initial } = settings;
    const { data, setData, put, processing, errors } = useForm<FormFields>(initial);

    function toggle() {
        router.post('/seller/loyalty/toggle', { is_enabled: !is_enabled }, { preserveScroll: true });
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        put('/seller/loyalty/settings', { preserveScroll: true });
    }

    const num = (key: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) => setData(key, e.target.value === '' ? ('' as unknown as number) : Number(e.target.value));

    // Live ordering checks (server validates too)
    const localErrors: Partial<Record<keyof FormFields, string>> = {};
    if (+data.regular_threshold >= +data.loyal_threshold) localErrors.loyal_threshold = 'Regular threshold must be less than Loyal threshold.';
    if (+data.loyal_threshold >= +data.vip_threshold) localErrors.vip_threshold = 'Loyal threshold must be less than VIP threshold.';
    if (+data.new_downpayment_percent < +data.regular_downpayment_percent) localErrors.regular_downpayment_percent = 'Cannot be higher than the New customer rate.';
    if (+data.regular_downpayment_percent < +data.loyal_downpayment_percent) localErrors.loyal_downpayment_percent = 'Cannot be higher than the Regular rate.';
    if (+data.loyal_downpayment_percent < +data.vip_downpayment_percent) localErrors.vip_downpayment_percent = 'Cannot be higher than the Loyal rate.';
    const err = (k: keyof FormFields) => errors[k] ?? localErrors[k];

    const preview: { tier: Tier; range: string; dp: number }[] = [
        { tier: 'new', range: `0–${Math.max(0, +data.regular_threshold - 1)} orders`, dp: +data.new_downpayment_percent },
        { tier: 'regular', range: `${data.regular_threshold}+ orders`, dp: +data.regular_downpayment_percent },
        { tier: 'loyal', range: `${data.loyal_threshold}+ orders`, dp: +data.loyal_downpayment_percent },
        { tier: 'vip', range: `${data.vip_threshold}+ orders`, dp: +data.vip_downpayment_percent },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Loyalty Program" />
            <div className="p-6 max-w-5xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="h-6 w-6 text-amber-500" /> Loyalty Program</h1>
                        <p className="text-sm text-muted-foreground">Reward repeat customers with better consignment terms at your store.</p>
                    </div>
                    <Link href="/seller/loyalty/customers">
                        <Button variant="outline" className="gap-1.5"><Users className="h-4 w-4" /> Customers ({enrolled_customers})</Button>
                    </Link>
                </div>

                {/* Enable toggle */}
                <Card className={is_enabled ? 'border-green-300 dark:border-green-800' : ''}>
                    <CardContent className="flex items-start justify-between gap-4 pt-6">
                        <div>
                            <p className="font-semibold">Enable Customer Loyalty Program</p>
                            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                {is_enabled
                                    ? 'Your loyalty program is running. Customers earn tiers from completed orders at your store, and their tier sets their consignment down payment.'
                                    : 'Enable the loyalty program to reward repeat customers with better consignment terms. Customers earn tiers based on completed orders and get lower down payment rates.'}
                            </p>
                            {is_enabled && !consignment_on && (
                                <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
                                    <Info className="h-4 w-4" /> Consignment is turned off in your store settings, so tier down payment rates won't apply until you enable it.
                                </p>
                            )}
                        </div>
                        <button type="button" role="switch" aria-checked={is_enabled} aria-label="Enable loyalty program" onClick={toggle}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${is_enabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${is_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </CardContent>
                </Card>

                {!is_enabled ? (
                    <p className="text-sm text-muted-foreground">
                        Consignment is a loyalty benefit — while the program is off, customers see only Full Payment and Cash on Delivery at checkout.
                    </p>
                ) : (
                    <form onSubmit={submit} className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Tier Requirements</CardTitle>
                                    <CardDescription>Completed (delivered) orders at your store. Promotion also needs a trust score of at least 50.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <NumberField id="regular_threshold" label="Orders for Regular tier" tier="regular" min={3} max={50} value={data.regular_threshold} onChange={num('regular_threshold')} error={err('regular_threshold')} />
                                    <NumberField id="loyal_threshold" label="Orders for Loyal tier" tier="loyal" min={5} max={100} value={data.loyal_threshold} onChange={num('loyal_threshold')} error={err('loyal_threshold')} />
                                    <NumberField id="vip_threshold" label="Orders for VIP tier" tier="vip" min={10} max={200} value={data.vip_threshold} onChange={num('vip_threshold')} error={err('vip_threshold')} />
                                    <hr />
                                    <NumberField id="min_trust_score_for_consignment" label="Min. trust score for consignment" min={0} max={100} step="0.01"
                                        value={data.min_trust_score_for_consignment} onChange={num('min_trust_score_for_consignment')} error={err('min_trust_score_for_consignment')}
                                        help="Customers below this score cannot use consignment payment" />
                                    <NumberField id="inactivity_days" label="Inactivity period (days)" min={30} max={365}
                                        value={data.inactivity_days} onChange={num('inactivity_days')} error={err('inactivity_days')}
                                        help="Customers without orders for this many days may lose their tier" />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Down Payment Rates</CardTitle>
                                    <CardDescription>Minimum down payment for consignment orders, 20–80%. Higher tiers should pay the same or less.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <NumberField id="new_downpayment_percent" label="New Customer" tier="new" suffix="%" min={20} max={80} value={data.new_downpayment_percent} onChange={num('new_downpayment_percent')} error={err('new_downpayment_percent')} />
                                    <NumberField id="regular_downpayment_percent" label="Regular Customer" tier="regular" suffix="%" min={20} max={80} value={data.regular_downpayment_percent} onChange={num('regular_downpayment_percent')} error={err('regular_downpayment_percent')} />
                                    <NumberField id="loyal_downpayment_percent" label="Loyal Customer" tier="loyal" suffix="%" min={20} max={80} value={data.loyal_downpayment_percent} onChange={num('loyal_downpayment_percent')} error={err('loyal_downpayment_percent')} />
                                    <NumberField id="vip_downpayment_percent" label="VIP Customer" tier="vip" suffix="%" min={20} max={80} value={data.vip_downpayment_percent} onChange={num('vip_downpayment_percent')} error={err('vip_downpayment_percent')} />
                                    <p className="text-xs text-muted-foreground">Consignment is only offered while the loyalty program is on, at the customer's tier rate.</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader><CardTitle className="text-base">Tier Preview</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                {preview.map((p) => (
                                    <div key={p.tier} className="flex flex-wrap items-center gap-3 text-sm">
                                        <span className={`h-2.5 w-2.5 rounded-full ${TIER_DOTS[p.tier]}`} />
                                        <span className="w-20"><TierBadge tier={p.tier} size="sm" /></span>
                                        <span className="w-32 text-muted-foreground">{p.range}</span>
                                        <span>→ <strong>{p.dp}%</strong> down payment</span>
                                    </div>
                                ))}
                                <p className="flex items-center gap-1.5 pt-2 text-sm text-red-600">
                                    <ShieldAlert className="h-4 w-4" /> Consignment blocked if trust score &lt; {data.min_trust_score_for_consignment}
                                </p>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={processing || Object.keys(localErrors).length > 0}>
                                {processing ? 'Saving…' : 'Save Settings'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </AppLayout>
    );
}

function NumberField({ id, label, tier, suffix, help, error, ...input }: {
    id: string; label: string; tier?: Tier; suffix?: string; help?: string; error?: string;
    min: number; max: number; step?: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id} className="flex items-center gap-2">
                {tier && <span className={`h-2.5 w-2.5 rounded-full ${TIER_DOTS[tier]}`} />}
                {label}
            </Label>
            <div className="relative">
                <Input id={id} type="number" {...input} className={suffix ? 'pr-8' : ''} />
                {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
            </div>
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}
