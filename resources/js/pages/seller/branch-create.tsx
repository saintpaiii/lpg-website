import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, BadgeCheck, Building2, FileText, Upload, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import { lookupBarangay } from '@/components/address-map';
import { appendPolicy, defaultPolicy, type ExchangeOptions, type ExchangePolicyData } from '@/components/exchange-policy';
import InputError from '@/components/input-error';
import { DOE_LTO_HELP } from '@/components/seller-application-fields';
import { ApplicationHoursPolicy } from '@/components/store-hours-policy-cards';
import { appendHours, toWeek } from '@/components/store-hours-editor';
import StorePinPicker from '@/components/store-pin-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAutoFillAddress } from '@/hooks/use-auto-fill-address';
import AppLayout from '@/layouts/app-layout';
import { DOCUMENT_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';
import type { BreadcrumbItem } from '@/types';

type DocKey = 'business_permit' | 'fsic_permit' | 'doe_lpg_license';

type Props = {
    main: {
        id: number; name: string; city: string | null; province: string;
        exchange_policy: ExchangePolicyData;
        delivery: { allow_cod: boolean; allow_pickup: boolean; max_delivery_radius_km: number | null; rates: number };
        products: number;
    };
    exchangeOptions: ExchangeOptions;
    maxValidUntil: Record<DocKey, string>;
};

const DOCS: { key: DocKey; label: string; hint: string }[] = [
    { key: 'business_permit', label: "Business / Mayor's Permit", hint: "This branch's current Mayor's / Business Permit (from its city or municipality)." },
    { key: 'fsic_permit',     label: 'FSIC (Fire Safety Inspection Certificate)', hint: 'Issued by the Bureau of Fire Protection for this outlet.' },
    { key: 'doe_lpg_license', label: 'DOE License to Operate (LTO) — LPG Retail Outlet', hint: `${DOE_LTO_HELP} One per outlet.` },
];

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Branches', href: '/seller/branches' }, { title: 'Add branch', href: '/seller/branches/create' }];

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export default function BranchCreate({ main, exchangeOptions, maxValidUntil }: Props) {
    const [fields, setFields] = useState({ branch_name: '', address: '', city: main.city ?? '', barangay: '', province: main.province, phone: '' });
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
    const [files, setFiles] = useState<Record<DocKey, File | null>>({ business_permit: null, fsic_permit: null, doe_lpg_license: null });
    const [validUntil, setValidUntil] = useState<Record<DocKey, string>>({ business_permit: '', fsic_permit: '', doe_lpg_license: '' });
    const [hoursPolicy, setHoursPolicy] = useState<{ alwaysOpen: boolean; week: ReturnType<typeof toWeek>; policy: ExchangePolicyData }>(
        () => ({ alwaysOpen: true, week: toWeek(null), policy: main.exchange_policy ?? defaultPolicy(exchangeOptions) }));
    const [copyProducts, setCopyProducts] = useState(main.products > 0);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const set = (k: keyof typeof fields, v: string) => { setFields((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

    function autoPin(city: string, barangay: string) {
        if (pin || !city || !barangay) return;
        lookupBarangay(city, barangay).then((geo) => {
            if (!geo || geo.precision === 'none') return;
            setPin((p) => p ?? { lat: geo.latitude, lng: geo.longitude });
        });
    }
    const autoFill = useAutoFillAddress({
        street: fields.address,
        apply: (a) => setFields((f) => ({ ...f, city: a.city, barangay: a.barangay, address: a.street })),
    });

    function submit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!pin) { setErrors((x) => ({ ...x, latitude: "Please pin the branch's location on the map." })); return; }
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
        (Object.keys(files) as DocKey[]).forEach((k) => {
            if (files[k]) fd.append(k, files[k] as File);
            fd.append(`${k}_valid_until`, validUntil[k]);
        });
        fd.append('latitude', String(pin.lat));
        fd.append('longitude', String(pin.lng));
        appendHours(fd, hoursPolicy.alwaysOpen, hoursPolicy.week);
        appendPolicy(fd, hoursPolicy.policy);
        fd.append('copy_products', copyProducts ? '1' : '0');
        setProcessing(true);
        router.post('/seller/branches', fd, {
            forceFormData: true,
            onError: (errs) => { setErrors(errs as Record<string, string>); window.scrollTo({ top: 0, behavior: 'smooth' }); },
            onFinish: () => setProcessing(false),
        });
    }

    const errorList = Object.values(errors).filter(Boolean);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add branch" />
            <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
                <div>
                    <Link href="/seller/branches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Branches</Link>
                    <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6 text-blue-600" /> Add a branch</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Customers will see it as <strong>{main.name} — {fields.branch_name.trim() || 'Branch name'}</strong>. The platform reviews it before it opens.
                    </p>
                </div>

                {errorList.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
                        Please check the form: {errorList[0]}
                    </div>
                )}

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Branch</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="branch_name">Branch name <span className="text-red-500">*</span></Label>
                            <Input id="branch_name" maxLength={60} placeholder="e.g. Imus Branch" value={fields.branch_name} onChange={(e) => set('branch_name', e.target.value)} />
                            <InputError message={errors.branch_name} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="phone">Branch phone <span className="text-red-500">*</span></Label>
                            <Input id="phone" inputMode="tel" placeholder="09XXXXXXXXX or a landline" value={fields.phone} onChange={(e) => set('phone', e.target.value)} />
                            <InputError message={errors.phone} />
                        </div>
                        <AddressFields
                            address={fields.address} city={fields.city} barangay={fields.barangay}
                            onAddressChange={(v) => set('address', v)}
                            onCityChange={(v) => { set('city', v); autoPin(v, fields.barangay); }}
                            onBarangayChange={(v) => { set('barangay', v); autoPin(fields.city, v); }}
                            errors={errors} requiredBarangay autoFill={autoFill}
                        />
                        <StorePinPicker latitude={pin?.lat ?? null} longitude={pin?.lng ?? null}
                            onChange={(lat, lng) => { setPin({ lat, lng }); setErrors((x) => ({ ...x, latitude: '', longitude: '' })); }}
                            autoFill={autoFill} error={errors.latitude || errors.longitude} />
                        <ApplicationHoursPolicy {...hoursPolicy} options={exchangeOptions} onChange={setHoursPolicy} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Branch documents</CardTitle></CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-1 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {['BIR Certificate of Registration', 'DTI / SEC Registration', "Owner's valid ID + selfie"].map((d) => (
                                <p key={d} className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5" /> {d} — from main store, already accepted</p>
                            ))}
                        </div>
                        {DOCS.map((d) => (
                            <div key={d.key} className="grid gap-2 rounded-lg border p-3">
                                <DocUpload label={d.label} hint={d.hint} file={files[d.key]} error={errors[d.key]}
                                    onChange={(f) => { setFiles((x) => ({ ...x, [d.key]: f })); setErrors((x) => ({ ...x, [d.key]: '' })); }} />
                                <div className="grid gap-1">
                                    <Label htmlFor={`${d.key}_valid_until`} className="text-xs">Valid until <span className="text-red-500">*</span></Label>
                                    <Input id={`${d.key}_valid_until`} type="date" min={tomorrow()} max={maxValidUntil[d.key]} className="h-9 max-w-[12rem]"
                                        value={validUntil[d.key]} onChange={(e) => setValidUntil((x) => ({ ...x, [d.key]: e.target.value }))} />
                                    <InputError message={errors[`${d.key}_valid_until`]} />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Start from the main store</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p className="text-muted-foreground">
                            Delivery options are copied from {main.name} (cash on delivery {main.delivery.allow_cod ? 'on' : 'off'}, pick-up {main.delivery.allow_pickup ? 'on' : 'off'},
                            {' '}{main.delivery.rates} delivery fee {main.delivery.rates === 1 ? 'rate' : 'rates'}). Change them later in the branch's Settings.
                        </p>
                        <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={copyProducts} onChange={(e) => setCopyProducts(e.target.checked)} disabled={main.products === 0} />
                            <span>Copy products from the main store ({main.products}) — names, sizes and prices; stock starts at 0.</span>
                        </label>
                    </CardContent>
                </Card>

                <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="outline"><Link href="/seller/branches">Cancel</Link></Button>
                    <Button type="submit" disabled={processing} className="bg-blue-600 text-white hover:bg-blue-700">
                        {processing && <Spinner className="mr-1.5" />} Send for review
                    </Button>
                </div>
            </form>
        </AppLayout>
    );
}

function DocUpload({ label, hint, file, error, onChange }: { label: string; hint: string; file: File | null; error?: string; onChange: (f: File | null) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState<string | null>(null);
    return (
        <div className="grid gap-1.5">
            <Label className="text-sm">{label} <span className="text-red-500">*</span></Label>
            <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
            {file ? (
                <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
                    <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                    <button type="button" onClick={() => onChange(null)} aria-label="Remove" className="text-muted-foreground hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
            ) : (
                <button type="button" onClick={() => ref.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-4 text-sm text-muted-foreground hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20">
                    <Upload className="h-4 w-4" /> Upload (JPG, PNG, WEBP or PDF · max 5 MB)
                </button>
            )}
            <input ref={ref} type="file" accept={DOCUMENT_ACCEPT} className="hidden"
                onChange={async (e) => {
                    const picked = e.target.files?.[0]; e.target.value = '';
                    if (!picked) return;
                    const { file: ready, problem: why } = await prepareDocumentFile(picked);
                    setProblem(why ?? null);
                    if (ready) onChange(ready);
                }} />
            <InputError message={problem ?? error} />
        </div>
    );
}
