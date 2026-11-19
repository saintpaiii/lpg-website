import { Head, Link, usePage } from '@inertiajs/react';
import { PlansDialogLink } from '@/components/plans-dialog-link';
import type { PlanCatalog } from '@/types/plans';
import axios from 'axios';
import {
    ArrowLeft, BadgeCheck, Building2, CheckSquare, FileText,
    Flame, Store, Upload, X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import InputError from '@/components/input-error';
import SellerTermsBox, { type SellerTerms } from '@/components/seller-terms-box';
import StorePinPicker from '@/components/store-pin-picker';
import { useAutoFillAddress } from '@/hooks/use-auto-fill-address';
import { lookupBarangay } from '@/components/address-map';
import { ApplicationHoursPolicy } from '@/components/store-hours-policy-cards';
import { appendHours, toWeek } from '@/components/store-hours-editor';
import { appendPolicy, defaultPolicy, type ExchangeOptions, type ExchangePolicyData } from '@/components/exchange-policy';
import { DOE_LTO_HELP, DTI_SEC_HELP, DtiSecKindToggle, StoreLogoPicker, type DtiSecKind } from '@/components/seller-application-fields';
import { DOCUMENT_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';
import { appendOtherRows, OtherDocumentsFields, StoreNameWarning, useStoreNameCheck, type OtherDocRow } from '@/components/other-documents-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthIndicator } from '@/components/ui/password-strength';
import { Spinner } from '@/components/ui/spinner';
import CameraCapture from '@/components/camera-capture';
import { SuffixSelect } from '@/components/suffix-select';

// ── Document field config ──────────────────────────────────────────────────────

type DocKey = 'valid_id' | 'bir_permit' | 'business_permit' | 'fsic_permit' | 'doe_lpg_license' | 'dti_sec_registration';

const DOC_FIELDS: { key: DocKey; label: string; hint: string }[] = [
    { key: 'valid_id',         label: 'Valid Government ID',                hint: "Owner's government-issued ID (JPG, PNG, WEBP, PDF · max 5 MB)" },
    { key: 'bir_permit',       label: 'BIR Certificate of Registration',   hint: 'Certificate of Registration from BIR (JPG, PNG, WEBP, PDF · max 5 MB)' },
    { key: 'business_permit',  label: "Business / Mayor's Permit",         hint: "Current Mayor's Permit or Business Permit (JPG, PNG, WEBP, PDF · max 5 MB)" },
    { key: 'fsic_permit',      label: 'FSIC (Fire Safety Inspection Certificate)', hint: 'Issued by the Bureau of Fire Protection — required for LPG businesses (JPG, PNG, WEBP, PDF · max 5 MB)' },
    // RA 11592: the DOE License to Operate IS the LTO — one upload
    { key: 'doe_lpg_license',  label: 'DOE License to Operate (LTO) — LPG Retail Outlet', hint: `${DOE_LTO_HELP} (JPG, PNG, WEBP, PDF · max 5 MB)` },
    { key: 'dti_sec_registration', label: 'DTI Business Name or SEC Registration', hint: `${DTI_SEC_HELP} (JPG, PNG, WEBP, PDF · max 5 MB)` },
];

const tomorrowIso = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ── File upload sub-component ─────────────────────────────────────────────────

function FileUploadField({
    id, label, hint, file, error, onFileChange, onClear,
}: {
    id: string;
    label: string;
    hint: string;
    file: File | null;
    error?: string;
    onFileChange: (f: File | null) => void;
    onClear: () => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState<string | null>(null);

    return (
        <div className="grid gap-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {label} <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">{hint}</p>

            {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                        <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-gray-700 dark:hover:border-blue-600"
                >
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to upload</span>
                    <span className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF · max 5 MB</span>
                </button>
            )}

            <input
                ref={ref}
                id={id}
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="hidden"
                onChange={async (e) => {
                    const picked = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    if (!picked) return;
                    // Any photo → real JPEG (a "validid.jpg" from Google is often a WEBP); PDFs unchanged
                    const { file: ready, problem: why } = await prepareDocumentFile(picked);
                    setProblem(why ?? (ready && ready.size > 5 * 1024 * 1024 ? 'The file must be 5 MB or smaller.' : null));
                    if (ready && ready.size <= 5 * 1024 * 1024) onFileChange(ready);
                }}
            />
            {(problem || error) && <p className="text-sm text-red-500">{problem ?? error}</p>}
        </div>
    );
}

// ── Agreement checkbox ────────────────────────────────────────────────────────

function AgreementCheckbox({
    checked, onChange, id, children,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    id: string;
    children: React.ReactNode;
}) {
    return (
        <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
            }`}>
                {checked && <CheckSquare className="h-3 w-3 text-white" />}
            </div>
            <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
            <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</span>
        </label>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Store Info', 'Documents', 'Terms'];

const BENEFITS = [
    { icon: Store,       title: 'Reach More Customers', desc: 'List your products on the LPG Marketplace and reach customers across Cavite.' },
    { icon: BadgeCheck,  title: 'Verified & Trusted',   desc: 'Your store gets a verified badge after document review, building customer trust.' },
    { icon: Building2,   title: 'Manage Your Store',    desc: 'Full dashboard for orders, inventory, deliveries, invoices, and reports.' },
];

/** Signed-in mode: a new "Continue with Google" user who chose "I only want to sell LPG" (no email / password fields) */
type SignedIn = { email: string; first_name: string; middle_name: string; last_name: string; suffix: string };

export default function SellerRegister({ seller_terms, plan_catalog, signed_in = null, exchange_options }: { seller_terms: SellerTerms; plan_catalog?: PlanCatalog | null; signed_in?: SignedIn | null; exchange_options?: ExchangeOptions }) {
    // J9: the free trial length comes from config (plans.trial_days), never hard-coded
    const trialDays = (usePage().props as { trial_days?: number }).trial_days ?? plan_catalog?.trial_days ?? 14;
    // J4 (optional): store hours (default open 24 hours) + refill tank exchange policy (default)
    const [hoursPolicy, setHoursPolicy] = useState<{ alwaysOpen: boolean; week: ReturnType<typeof toWeek>; policy: ExchangePolicyData }>(
        () => ({ alwaysOpen: true, week: toWeek(null), policy: defaultPolicy(exchange_options) }));
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors]         = useState<Record<string, string>>({});
    const [step, setStep]             = useState<1 | 2 | 3>(1);

    const [files, setFiles] = useState<Record<DocKey, File | null>>({
        valid_id:        null,
        bir_permit:      null,
        business_permit: null,
        fsic_permit:     null,
        doe_lpg_license: null,
        dti_sec_registration: null,
    });
    // DTI (single owner) or SEC (corporation / partnership) — required with the DTI/SEC upload
    const [dtiSecKind, setDtiSecKind] = useState<DtiSecKind | ''>('');

    const [fields, setFields] = useState({
        first_name:            signed_in?.first_name ?? '',
        middle_name:           signed_in?.middle_name ?? '',
        last_name:             signed_in?.last_name ?? '',
        suffix:                signed_in?.suffix ?? '',
        email:                 signed_in?.email ?? '',
        phone:                 '',
        password:              '',
        password_confirmation: '',
        store_name:            '',
        store_description:     '',
        store_address:         '',
        store_city:            '',
        store_barangay:        '',
        store_province:        'Cavite',
    });

    // The optional logo (no "valid until" dates: the admin reads them from the documents — J3)
    const [logo, setLogo] = useState<File | null>(null);
    // Owner's live-camera selfie (required, next to the valid ID) — no file upload
    const [selfie, setSelfie] = useState<File | null>(null);
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
    // Optional extra documents (DTI, barangay clearance, store photo…)
    const [otherDocs, setOtherDocs] = useState<OtherDocRow[]>([]);
    // "A store with this name already exists in …" (warning only)
    const nameCheck = useStoreNameCheck(fields.store_name);

    const [agreeTerms, setAgreeTerms]           = useState(false);
    const [agreeAuthentic, setAgreeAuthentic]   = useState(false);
    const [agreePlan, setAgreePlan] = useState(false);
    const allAgreed = agreeTerms && agreeAuthentic && agreePlan;

    function set(key: keyof typeof fields, value: string) {
        setFields((prev) => ({ ...prev, [key]: value }));
    }

    // No pin yet: start it at the chosen barangay (same as Start Selling) so the owner only drags it to the entrance.
    // A pin the owner already placed / dragged is never moved (checked again when the answer comes back).
    function autoPin(city: string, barangay: string) {
        if (pin || !city || !barangay) return;
        lookupBarangay(city, barangay).then((geo) => {
            if (!geo || geo.precision === 'none') return;
            setPin((p) => p ?? { lat: geo.latitude, lng: geo.longitude });
            setErrors((e) => ({ ...e, latitude: '', longitude: '' }));
        });
    }

    // Moving the store pin / "Use my current location" fills City + Barangay (and the street when it wasn't typed) —
    // same as Start Selling (become-seller)
    const autoFill = useAutoFillAddress({
        street: fields.store_address,
        apply: (a) => {
            setFields((f) => ({ ...f, store_city: a.city, store_barangay: a.barangay, store_address: a.street }));
            setErrors((e) => ({ ...e, store_city: '', store_barangay: '', store_address: a.street ? '' : (e.store_address ?? '') }));
        },
    });

    function setFile(key: DocKey, file: File | null) {
        setFiles((prev) => ({ ...prev, [key]: file }));
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
    }

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!allAgreed) return;
        setProcessing(true);
        setErrors({});

        const formData = new FormData();
        // Signed-in mode: the account is the Google one — no email / password sent
        Object.entries(fields).forEach(([k, v]) => {
            if (signed_in && ['email', 'password', 'password_confirmation'].includes(k)) return;
            formData.append(k, v);
        });
        for (const [key, file] of Object.entries(files)) {
            if (file) formData.append(key, file);
        }
        formData.append('dti_sec_kind', dtiSecKind);
        if (logo) formData.append('logo', logo);
        if (selfie) formData.append('selfie', selfie);
        appendOtherRows(formData, otherDocs);
        appendHours(formData, hoursPolicy.alwaysOpen, hoursPolicy.week);
        appendPolicy(formData, hoursPolicy.policy);
        formData.append('latitude', pin ? String(pin.lat) : '');
        formData.append('longitude', pin ? String(pin.lng) : '');
        formData.append('terms_agreed', '1');

        try {
            const res = await axios.post<{ redirect?: string }>('/seller/register', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Accept: 'application/json' },
            });
            window.location.href = res.data?.redirect ?? '/seller/pending';
        } catch (err: any) {
            const responseErrors = err?.response?.data?.errors ?? {};
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(responseErrors)) {
                mapped[key] = (messages as string[])[0];
            }
            setErrors(mapped);
            // Navigate back to offending step
            const step1Keys = ['first_name', 'middle_name', 'last_name', 'suffix', 'email', 'phone', 'password', 'password_confirmation',
                               'store_name', 'store_description', 'store_address', 'store_city', 'store_barangay', 'logo', 'latitude', 'longitude'];
            const step2Keys = [...DOC_FIELDS.map(d => d.key), 'selfie', 'dti_sec_kind'];
            if (step1Keys.some((k) => mapped[k])) setStep(1);
            else if (step2Keys.some((k) => mapped[k]) || Object.keys(mapped).some((k) => k.startsWith('other_documents'))) setStep(2);
            else setStep(3);
            setProcessing(false);
        }
    }

    return (
        <div className="flex min-h-screen">
            <Head title="Become a Seller — LPG Marketplace" />

            {/* Left panel — branding */}
            <div className="hidden lg:flex lg:w-5/12 flex-col items-center justify-center bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 px-12 text-white">
                <div className="max-w-sm text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                            <Flame className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <h1 className="mb-3 text-3xl font-bold leading-tight">
                        Start Selling LPG<br />on Our Platform
                    </h1>
                    <p className="text-blue-100 text-sm leading-relaxed mb-8">
                        Join the LPG Marketplace Cavite and grow your distribution business with our platform.
                    </p>

                    <div className="space-y-4 text-left">
                        {BENEFITS.map(({ icon: Icon, title, desc }) => (
                            <div key={title} className="flex items-start gap-3 bg-white/10 border border-white/15 rounded-xl p-3.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 shrink-0 mt-0.5">
                                    <Icon className="h-4.5 w-4.5 text-white" />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{title}</p>
                                    <p className="text-blue-100 text-xs mt-0.5 leading-relaxed">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="mt-8 text-xs text-blue-200">
                        Applications are reviewed within 1–3 business days.
                    </p>
                </div>
            </div>

            {/* Right panel — form */}
            <div className="flex w-full flex-col bg-gray-50 px-6 py-10 lg:w-7/12 dark:bg-gray-950 overflow-y-auto">
                <div>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>

                <div className="flex flex-1 items-start justify-center py-8">
                    <div className="w-full max-w-lg">

                        {/* Mobile logo */}
                        <div className="mb-6 flex flex-col items-center lg:hidden">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                                <Flame className="h-6 w-6 text-white" />
                            </div>
                            <h1 className="text-center text-xl font-bold text-gray-900 dark:text-white">
                                LPG Marketplace Cavite
                            </h1>
                        </div>

                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Seller Application
                            </h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Register your LPG distribution business on our platform
                            </p>
                            <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                                This makes a <strong>seller-only</strong> account — it can't place orders. If you also want to buy LPG,{' '}
                                <Link href={signed_in ? "/choose-account" : "/register"} className="font-semibold underline">{signed_in ? "choose to buy LPG instead" : "register as a customer"}</Link> and use <strong>Start Selling</strong> later.
                            </p>
                        </div>

                        {/* Step indicators */}
                        <div className="flex gap-1 mb-8">
                            {STEP_LABELS.map((label, i) => {
                                const s = (i + 1) as 1 | 2 | 3;
                                const done = step > s;
                                const active = step === s;
                                return (
                                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                                        <div className={`w-full h-1.5 rounded-full transition-colors ${done ? 'bg-blue-600' : active ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                        <span className={`text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
                                            Step {s}: {label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5" encType="multipart/form-data">

                            {/* ── Step 1: Account & Store Info ─────────────── */}
                            {step === 1 && (
                                <>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 1 of 3 — Account & Store Details</p>

                                    {/* Owner name: first / middle / last / suffix (the full name is built on the server) */}
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label htmlFor="first_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Owner first name <span className="text-red-500">*</span>
                                            </Label>
                                            <Input id="first_name" type="text" required autoFocus autoComplete="given-name" placeholder="Juan" className="h-11"
                                                value={fields.first_name} onChange={(e) => set('first_name', e.target.value)} />
                                            <InputError message={errors.first_name} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="middle_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Middle name <span className="font-normal text-muted-foreground">(optional)</span>
                                            </Label>
                                            <Input id="middle_name" type="text" autoComplete="additional-name" placeholder="Santos" className="h-11"
                                                value={fields.middle_name} onChange={(e) => set('middle_name', e.target.value)} />
                                            <InputError message={errors.middle_name} />
                                        </div>
                                    </div>
                                    <div className="grid gap-5 grid-cols-[1fr_6.5rem]">
                                        <div className="grid gap-2">
                                            <Label htmlFor="last_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Last name <span className="text-red-500">*</span>
                                            </Label>
                                            <Input id="last_name" type="text" required autoComplete="family-name" placeholder="Dela Cruz" className="h-11"
                                                value={fields.last_name} onChange={(e) => set('last_name', e.target.value)} />
                                            <InputError message={errors.last_name} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="suffix" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Suffix <span className="font-normal text-muted-foreground">(optional)</span>
                                            </Label>
                                            <SuffixSelect value={fields.suffix} onChange={(v) => set('suffix', v)} className="h-11" />
                                            <InputError message={errors.suffix} />
                                        </div>
                                    </div>

                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Phone number <span className="text-red-500">*</span>
                                            </Label>
                                            <Input type="tel" required placeholder="09xxxxxxxxx" className="h-11"
                                                maxLength={11}
                                                value={fields.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} />
                                            <InputError message={errors.phone} />
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="sr_email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Email address {!signed_in && <span className="text-red-500">*</span>}
                                        </Label>
                                        {signed_in ? (
                                            <>
                                                <Input id="sr_email" type="email" readOnly aria-readonly="true" className="h-11 bg-gray-100 dark:bg-gray-800" value={signed_in.email} />
                                                <p className="text-xs text-muted-foreground">Your Google account — you sign in with Google. You can set a password later with “Forgot password”.</p>
                                            </>
                                        ) : (
                                            <Input id="sr_email" type="email" required placeholder="you@example.com" className="h-11"
                                                value={fields.email} onChange={(e) => set('email', e.target.value)} />
                                        )}
                                        <InputError message={errors.email} />
                                    </div>

                                    {!signed_in && <>
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Password <span className="text-red-500">*</span>
                                            </Label>
                                            <PasswordInput required placeholder="••••••••" className="h-11"
                                                value={fields.password} onChange={(e) => set('password', e.target.value)} />
                                            <InputError message={errors.password} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Confirm password <span className="text-red-500">*</span>
                                            </Label>
                                            <PasswordInput required placeholder="••••••••" className="h-11"
                                                value={fields.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} />
                                            <InputError message={errors.password_confirmation} />
                                        </div>
                                    </div>
                                    <PasswordStrengthIndicator password={fields.password} />
                                    </>}

                                    <hr className="border-gray-200 dark:border-gray-800" />

                                    <div className="grid gap-2">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Store / business name <span className="text-red-500">*</span>
                                        </Label>
                                        <Input type="text" required placeholder="e.g. Petron Gasul Cavite" className="h-11"
                                            value={fields.store_name} onChange={(e) => set('store_name', e.target.value)} />
                                        <InputError message={errors.store_name} />
                                        <StoreNameWarning check={nameCheck} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Store description
                                        </Label>
                                        <textarea
                                            rows={3}
                                            placeholder="Briefly describe your LPG business and service area..."
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                                            value={fields.store_description}
                                            onChange={(e) => set('store_description', e.target.value)}
                                        />
                                        <InputError message={errors.store_description} />
                                    </div>

                                    <StoreLogoPicker file={logo} error={errors.logo} onChange={setLogo} />

                                    <AddressFields
                                        address={fields.store_address}
                                        city={fields.store_city}
                                        barangay={fields.store_barangay}
                                        onAddressChange={(v) => set('store_address', v)}
                                        onCityChange={(v) => { set('store_city', v); autoPin(v, fields.store_barangay); }}
                                        onBarangayChange={(v) => { set('store_barangay', v); autoPin(fields.store_city, v); }}
                                        errors={errors}
                                        errorKeys={{ address: 'store_address', city: 'store_city', barangay: 'store_barangay' }}
                                        requiredBarangay
                                        autoFill={autoFill}
                                    />

                                    <StorePinPicker latitude={pin?.lat ?? null} longitude={pin?.lng ?? null}
                                        onChange={(lat, lng) => { setPin({ lat, lng }); setErrors((e) => ({ ...e, latitude: '', longitude: '' })); }}
                                        autoFill={autoFill}
                                        error={errors.latitude || errors.longitude} />

                                    <ApplicationHoursPolicy {...hoursPolicy} options={exchange_options} onChange={setHoursPolicy} />

                                    <Button
                                        type="button"
                                        className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700 mt-2"
                                        onClick={() => {
                                            if (!pin) { setErrors((e) => ({ ...e, latitude: "Please pin your store's location on the map." })); return; }
                                            setStep(2);
                                        }}
                                    >
                                        Next: Upload Documents →
                                    </Button>
                                </>
                            )}

                            {/* ── Step 2: Document Uploads ──────────────────── */}
                            {step === 2 && (
                                <>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 2 of 3 — Upload Required Documents</p>

                                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
                                        All six documents are required for seller verification. Your application will be reviewed within 1–3 business days.
                                    </div>

                                    {DOC_FIELDS.map((doc) => (
                                        <div key={doc.key} className="space-y-2">
                                            <FileUploadField
                                                id={doc.key}
                                                label={doc.label}
                                                hint={doc.hint}
                                                file={files[doc.key]}
                                                error={errors[doc.key]}
                                                onFileChange={(f) => setFile(doc.key, f)}
                                                onClear={() => setFile(doc.key, null)}
                                            />
                                            {doc.key === 'valid_id' && (
                                                <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                                                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Owner selfie <span className="text-red-500">*</span>
                                                    </Label>
                                                    <CameraCapture
                                                        value={selfie}
                                                        onChange={(f) => { setSelfie(f); if (f) setErrors((p) => ({ ...p, selfie: '' })); }}
                                                        fileName="selfie.jpg"
                                                        hint="Take it now with your camera, holding the same ID next to your face. Uploading a picture is not allowed."
                                                        error={errors.selfie || null}
                                                    />
                                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                                        Your ID photo and selfie are compared by our face-matching provider (Face++) only to confirm it's you.
                                                        See our <a href="/privacy" target="_blank" rel="noopener" className="underline">Privacy Policy</a>.
                                                    </p>
                                                </div>
                                            )}
                                            {doc.key === 'dti_sec_registration' && (
                                                <DtiSecKindToggle value={dtiSecKind} error={errors.dti_sec_kind}
                                                    onChange={(v) => { setDtiSecKind(v); setErrors((p) => ({ ...p, dti_sec_kind: '' })); }} />
                                            )}
                                        </div>
                                    ))}

                                    <OtherDocumentsFields rows={otherDocs} onChange={setOtherDocs} errors={errors} minDate={tomorrowIso()} />

                                    <div className="flex gap-3 mt-2">
                                        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setStep(1)}>
                                            ← Back
                                        </Button>
                                        <Button
                                            type="button"
                                            className="h-11 flex-1 bg-blue-600 font-semibold text-white hover:bg-blue-700"
                                            onClick={() => {
                                                if (!selfie) { setErrors((e) => ({ ...e, selfie: 'Please take a selfie with your camera.' })); return; }
                                                setStep(3);
                                            }}
                                        >
                                            Next: Terms & Conditions →
                                        </Button>
                                    </div>
                                </>
                            )}

                            {/* ── Step 3: Terms & Conditions ────────────────── */}
                            {step === 3 && (
                                <>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 3 of 3 — Review & Agree to Terms</p>

                                    <SellerTermsBox terms={seller_terms} />

                                    {/* Agreement checkboxes */}
                                    <div className="space-y-3">
                                        <AgreementCheckbox checked={agreeTerms} onChange={setAgreeTerms} id="reg_agree_terms">
                                            I have read and agree to the Seller Terms and the{' '}
                                            <a href="/privacy" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="font-medium text-blue-600 underline dark:text-blue-400">Privacy Policy</a>
                                        </AgreementCheckbox>
                                        <AgreementCheckbox checked={agreeAuthentic} onChange={setAgreeAuthentic} id="reg_agree_authentic">
                                            I confirm that all uploaded documents are authentic and valid
                                        </AgreementCheckbox>
                                        <AgreementCheckbox checked={agreePlan} onChange={setAgreePlan} id="reg_agree_plan">
                                            I understand that my store gets a free {trialDays}-day Premium trial after approval, and then needs a monthly subscription plan to stay visible to customers. I keep 100% of my sales.
                                        </AgreementCheckbox>
                                        <PlansDialogLink catalog={plan_catalog} />
                                    </div>

                                    {errors.terms_agreed && (
                                        <p className="text-sm text-red-500">{errors.terms_agreed}</p>
                                    )}

                                    {!allAgreed && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                                            Please check all three boxes above to submit your application.
                                        </p>
                                    )}

                                    <div className="flex gap-3 mt-2">
                                        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setStep(2)}>
                                            ← Back
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={processing || !allAgreed}
                                            className="h-11 flex-1 bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {processing && <Spinner />}
                                            Submit Application
                                        </Button>
                                    </div>
                                </>
                            )}
                        </form>

                        {signed_in ? (
                            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Changed your mind?{' '}
                                <Link href="/choose-account" className="font-medium text-blue-600 hover:text-blue-700 dark:hover:text-blue-300">
                                    Use this account to buy LPG instead
                                </Link>
                            </p>
                        ) : (
                            <>
                                {step === 1 && <>
                                    <div className="mt-6 flex items-center gap-3">
                                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                        <span className="text-xs text-muted-foreground">or</span>
                                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                    </div>
                                    {/* A new Google account comes straight back here (signed in); an existing one just signs in */}
                                    <a
                                        href="/auth/google?intent=seller"
                                        className="mt-4 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                    >
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                        </svg>
                                        Continue with Google
                                    </a>
                                </>}

                                <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                    Already have an account?{' '}
                                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 dark:hover:text-blue-300">
                                        Sign in
                                    </Link>
                                </p>

                                <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                                    Want to order LPG instead?{' '}
                                    <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700 dark:hover:text-blue-300">
                                        Create a customer account
                                    </Link>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
