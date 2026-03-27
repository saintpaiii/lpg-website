import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import {
    ArrowLeft, BadgeCheck, Building2, CheckSquare, FileText,
    Flame, ScrollText, Store, Upload, X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthIndicator } from '@/components/ui/password-strength';
import { Spinner } from '@/components/ui/spinner';

// ── Document field config ──────────────────────────────────────────────────────

type DocKey = 'valid_id' | 'bir_permit' | 'business_permit' | 'fsic_permit' | 'doe_lpg_license' | 'lto_permit';

const DOC_FIELDS: { key: DocKey; label: string; hint: string }[] = [
    { key: 'valid_id',         label: 'Valid Government ID',                hint: "Owner's government-issued ID (JPG, PNG, PDF · max 5 MB)" },
    { key: 'bir_permit',       label: 'BIR Certificate of Registration',   hint: 'Certificate of Registration from BIR (JPG, PNG, PDF · max 5 MB)' },
    { key: 'business_permit',  label: "Business / Mayor's Permit",         hint: "Current Mayor's Permit or Business Permit (JPG, PNG, PDF · max 5 MB)" },
    { key: 'fsic_permit',      label: 'FSIC (Fire Safety Inspection Certificate)', hint: 'Issued by the Bureau of Fire Protection — required for LPG businesses (JPG, PNG, PDF · max 5 MB)' },
    { key: 'doe_lpg_license',  label: 'DOE LPG Retail License',            hint: 'Required license from the Department of Energy to sell LPG (JPG, PNG, PDF · max 5 MB)' },
    { key: 'lto_permit',       label: 'LTO (License to Operate)',          hint: 'License to Operate issued by the relevant regulatory agency (JPG, PNG, PDF · max 5 MB)' },
];

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

    return (
        <div className="grid gap-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {label} <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-gray-500 -mt-1">{hint}</p>

            {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                        <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-gray-700 dark:hover:border-blue-600"
                >
                    <Upload className="h-7 w-7 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to upload</span>
                    <span className="text-xs text-gray-500">JPG, PNG or PDF · max 5 MB</span>
                </button>
            )}

            <input
                ref={ref}
                id={id}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
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

// ── Terms section helper ──────────────────────────────────────────────────────

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
            <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                {children}
            </ul>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Store Info', 'Documents', 'Terms'];

const BENEFITS = [
    { icon: Store,       title: 'Reach More Customers', desc: 'List your products on the LPG Marketplace and reach customers across Cavite.' },
    { icon: BadgeCheck,  title: 'Verified & Trusted',   desc: 'Your store gets a verified badge after document review, building customer trust.' },
    { icon: Building2,   title: 'Manage Your Store',    desc: 'Full dashboard for orders, inventory, deliveries, invoices, and reports.' },
];

export default function SellerRegister() {
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors]         = useState<Record<string, string>>({});
    const [step, setStep]             = useState<1 | 2 | 3>(1);

    const [files, setFiles] = useState<Record<DocKey, File | null>>({
        valid_id:        null,
        bir_permit:      null,
        business_permit: null,
        fsic_permit:     null,
        doe_lpg_license: null,
        lto_permit:      null,
    });

    const [fields, setFields] = useState({
        name:                  '',
        email:                 '',
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

    const [agreeTerms, setAgreeTerms]           = useState(false);
    const [agreeAuthentic, setAgreeAuthentic]   = useState(false);
    const [agreeCommission, setAgreeCommission] = useState(false);
    const allAgreed = agreeTerms && agreeAuthentic && agreeCommission;

    function set(key: keyof typeof fields, value: string) {
        setFields((prev) => ({ ...prev, [key]: value }));
    }

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
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
        for (const [key, file] of Object.entries(files)) {
            if (file) formData.append(key, file);
        }
        formData.append('terms_agreed', '1');

        try {
            await axios.post('/seller/register', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            window.location.href = '/seller/pending';
        } catch (err: any) {
            const responseErrors = err?.response?.data?.errors ?? {};
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(responseErrors)) {
                mapped[key] = (messages as string[])[0];
            }
            setErrors(mapped);
            // Navigate back to offending step
            const step1Keys = ['name', 'email', 'phone', 'password', 'password_confirmation',
                               'store_name', 'store_description', 'store_address', 'store_city', 'store_barangay'];
            const step2Keys = DOC_FIELDS.map(d => d.key);
            if (step1Keys.some((k) => mapped[k])) setStep(1);
            else if (step2Keys.some((k) => mapped[k])) setStep(2);
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
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
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
                                        <span className={`text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-blue-400' : 'text-gray-400'}`}>
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
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 1 of 3 — Account & Store Details</p>

                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Owner full name <span className="text-red-500">*</span>
                                            </Label>
                                            <Input type="text" required autoFocus placeholder="Juan dela Cruz" className="h-11"
                                                value={fields.name} onChange={(e) => set('name', e.target.value)} />
                                            <InputError message={errors.name} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Phone number <span className="text-red-500">*</span>
                                            </Label>
                                            <Input type="tel" required placeholder="09xx-xxx-xxxx" className="h-11"
                                                value={fields.phone} onChange={(e) => set('phone', e.target.value)} />
                                            <InputError message={errors.phone} />
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Email address <span className="text-red-500">*</span>
                                        </Label>
                                        <Input type="email" required placeholder="you@example.com" className="h-11"
                                            value={fields.email} onChange={(e) => set('email', e.target.value)} />
                                        <InputError message={errors.email} />
                                    </div>

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

                                    <hr className="border-gray-200 dark:border-gray-800" />

                                    <div className="grid gap-2">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Store / business name <span className="text-red-500">*</span>
                                        </Label>
                                        <Input type="text" required placeholder="e.g. Petron Gasul Cavite" className="h-11"
                                            value={fields.store_name} onChange={(e) => set('store_name', e.target.value)} />
                                        <InputError message={errors.store_name} />
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

                                    <AddressFields
                                        address={fields.store_address}
                                        city={fields.store_city}
                                        barangay={fields.store_barangay}
                                        onAddressChange={(v) => set('store_address', v)}
                                        onCityChange={(v) => set('store_city', v)}
                                        onBarangayChange={(v) => set('store_barangay', v)}
                                        errors={errors}
                                        errorKeys={{ address: 'store_address', city: 'store_city', barangay: 'store_barangay' }}
                                        requiredBarangay
                                    />

                                    <Button
                                        type="button"
                                        className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700 mt-2"
                                        onClick={() => setStep(2)}
                                    >
                                        Next: Upload Documents →
                                    </Button>
                                </>
                            )}

                            {/* ── Step 2: Document Uploads ──────────────────── */}
                            {step === 2 && (
                                <>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 2 of 3 — Upload Required Documents</p>

                                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
                                        All six documents are required for seller verification. Your application will be reviewed within 1–3 business days.
                                    </div>

                                    {DOC_FIELDS.map((doc) => (
                                        <FileUploadField
                                            key={doc.key}
                                            id={doc.key}
                                            label={doc.label}
                                            hint={doc.hint}
                                            file={files[doc.key]}
                                            error={errors[doc.key]}
                                            onFileChange={(f) => setFile(doc.key, f)}
                                            onClear={() => setFile(doc.key, null)}
                                        />
                                    ))}

                                    <div className="flex gap-3 mt-2">
                                        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setStep(1)}>
                                            ← Back
                                        </Button>
                                        <Button
                                            type="button"
                                            className="h-11 flex-1 bg-blue-600 font-semibold text-white hover:bg-blue-700"
                                            onClick={() => setStep(3)}
                                        >
                                            Next: Terms & Conditions →
                                        </Button>
                                    </div>
                                </>
                            )}

                            {/* ── Step 3: Terms & Conditions ────────────────── */}
                            {step === 3 && (
                                <>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 3 of 3 — Review & Agree to Terms</p>

                                    {/* Scrollable terms */}
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                            <ScrollText className="h-4 w-4 text-blue-600" />
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">Terms and Conditions</span>
                                        </div>
                                        <div className="max-h-72 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4">
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                By registering as a seller on LPG Distribution Cavite, you agree to the following:
                                            </p>

                                            <TermsSection title="1. Platform Commission">
                                                <li>The platform charges a <strong>5% commission</strong> on every completed order (based on product subtotal, excluding delivery fee)</li>
                                                <li>Commission is automatically deducted from your earnings</li>
                                                <li>Commission rate may be adjusted by the platform administrator</li>
                                            </TermsSection>

                                            <TermsSection title="2. Payment Processing">
                                                <li>Online payments are processed through PayMongo</li>
                                                <li>COD payments are recorded by the seller</li>
                                                <li>Platform earnings are settled after order delivery</li>
                                            </TermsSection>

                                            <TermsSection title="3. Store Requirements">
                                                <li>You must maintain valid and up-to-date permits (BIR, Business Permit, FSIC, DOE License, LTO)</li>
                                                <li>Expired permits may result in store suspension</li>
                                                <li>You are responsible for product quality and safety</li>
                                            </TermsSection>

                                            <TermsSection title="4. Order Fulfillment">
                                                <li>You must process orders within 24 hours</li>
                                                <li>Delivery must be completed within the agreed timeframe</li>
                                                <li>Repeated order cancellations may result in penalties or suspension</li>
                                            </TermsSection>

                                            <TermsSection title="5. Account Conduct">
                                                <li>Fraudulent activity will result in permanent ban</li>
                                                <li>The platform reserves the right to suspend or terminate seller accounts for violations</li>
                                                <li>All uploaded documents must be authentic</li>
                                            </TermsSection>

                                            <TermsSection title="6. Data Privacy">
                                                <li>Your store information and documents are kept confidential</li>
                                                <li>Customer data shared with you is for order fulfillment only</li>
                                                <li>You must comply with the Data Privacy Act of 2012</li>
                                            </TermsSection>

                                            <TermsSection title="7. Liability">
                                                <li>The platform is not liable for disputes between sellers and customers</li>
                                                <li>Sellers are responsible for their own tax obligations</li>
                                                <li>Product liability rests with the seller</li>
                                            </TermsSection>
                                        </div>
                                    </div>

                                    {/* Agreement checkboxes */}
                                    <div className="space-y-3">
                                        <AgreementCheckbox checked={agreeTerms} onChange={setAgreeTerms} id="reg_agree_terms">
                                            I have read and agree to the Terms and Conditions
                                        </AgreementCheckbox>
                                        <AgreementCheckbox checked={agreeAuthentic} onChange={setAgreeAuthentic} id="reg_agree_authentic">
                                            I confirm that all uploaded documents are authentic and valid
                                        </AgreementCheckbox>
                                        <AgreementCheckbox checked={agreeCommission} onChange={setAgreeCommission} id="reg_agree_commission">
                                            I understand and agree to the platform commission fee of{' '}
                                            <strong>5% per completed order</strong>
                                        </AgreementCheckbox>
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

                        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            Already have an account?{' '}
                            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                                Sign in
                            </Link>
                        </p>

                        <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                            Want to order LPG instead?{' '}
                            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
                                Create a customer account
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
