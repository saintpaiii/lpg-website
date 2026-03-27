import { Head, useForm } from '@inertiajs/react';
import {
    AlertCircle, CheckCircle2, CheckSquare, Clock, FileText,
    ScrollText, Shield, ShieldCheck, Store, Upload, XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

// ── Types ──────────────────────────────────────────────────────────────────────

type Application = {
    status: 'pending' | 'rejected';
    rejection_reason: string | null;
    created_at: string;
} | null;

type Props = {
    application: Application;
    has_valid_id: boolean;
};

// ── File field definitions ─────────────────────────────────────────────────────

const DOC_FIELDS = [
    {
        key: 'bir_permit' as const,
        label: 'BIR Certificate of Registration',
        description: 'Registration certificate from the Bureau of Internal Revenue',
    },
    {
        key: 'business_permit' as const,
        label: "Business Permit / Mayor's Permit",
        description: "Current Mayor's Permit or Business Permit from your LGU",
    },
    {
        key: 'fsic_permit' as const,
        label: 'FSIC (Fire Safety Inspection Certificate)',
        description: 'Issued by the Bureau of Fire Protection — required for LPG businesses',
    },
    {
        key: 'doe_lpg_license' as const,
        label: 'DOE LPG Retail License',
        description: 'Required license from the Department of Energy to sell LPG',
    },
    {
        key: 'lto_permit' as const,
        label: 'LTO (License to Operate)',
        description: 'License to Operate issued by the relevant regulatory agency',
    },
] as const;

type DocKey = typeof DOC_FIELDS[number]['key'];

const STEP_LABELS = ['Store Info', 'Documents', 'Terms & Conditions'];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BecomeSellerPage({ application, has_valid_id }: Props) {
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [agreeTerms, setAgreeTerms]       = useState(false);
    const [agreeAuthentic, setAgreeAuthentic] = useState(false);
    const [agreeCommission, setAgreeCommission] = useState(false);
    const allAgreed = agreeTerms && agreeAuthentic && agreeCommission;

    const { data, setData, post, processing, errors, progress } = useForm<{
        store_name: string;
        store_description: string;
        store_address: string;
        store_city: string;
        store_barangay: string;
        store_province: string;
        store_phone: string;
        bir_permit: File | null;
        business_permit: File | null;
        valid_id: File | null;
        fsic_permit: File | null;
        doe_lpg_license: File | null;
        lto_permit: File | null;
        terms_agreed: boolean;
    }>({
        store_name: '',
        store_description: '',
        store_address: '',
        store_city: '',
        store_barangay: '',
        store_province: 'Cavite',
        store_phone: '',
        bir_permit: null,
        business_permit: null,
        valid_id: null,
        fsic_permit: null,
        doe_lpg_license: null,
        lto_permit: null,
        terms_agreed: false,
    });

    const idRef   = useRef<HTMLInputElement>(null);
    const fileRefs = {
        bir_permit:      useRef<HTMLInputElement>(null),
        business_permit: useRef<HTMLInputElement>(null),
        fsic_permit:     useRef<HTMLInputElement>(null),
        doe_lpg_license: useRef<HTMLInputElement>(null),
        lto_permit:      useRef<HTMLInputElement>(null),
    };

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!allAgreed) return;
        setData('terms_agreed', true);
        post('/customer/become-seller', { forceFormData: true });
    }

    const isPending  = application?.status === 'pending';
    const isRejected = application?.status === 'rejected';

    return (
        <CustomerLayout>
            <Head title="Start Selling" />

            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Store className="h-6 w-6 text-blue-600" />
                        {isPending ? 'Application Under Review' : isRejected ? 'Application Rejected' : 'Start Selling'}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {isPending
                            ? 'Your seller application has been submitted and is being reviewed by our team.'
                            : isRejected
                            ? 'Your previous application was rejected. You can reapply with updated information.'
                            : 'Apply to open your own store on LPG Marketplace.'}
                    </p>
                </div>

                {/* Pending state */}
                {isPending && (
                    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-4">
                                <Clock className="h-8 w-8 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">Application Pending Review</p>
                                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                                        Submitted on {application?.created_at}. We typically review applications within 1–3 business days.
                                        You will be notified once a decision has been made.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Rejected state */}
                {isRejected && (
                    <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-4">
                                <XCircle className="h-8 w-8 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-red-800 dark:text-red-300">Application Rejected</p>
                                    {application?.rejection_reason && (
                                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                                            Reason: {application.rejection_reason}
                                        </p>
                                    )}
                                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                                        You may reapply by submitting updated information and documents below.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Application form */}
                {!isPending && (
                    <form onSubmit={submit} className="space-y-6">

                        {/* Step indicators */}
                        <div className="flex gap-1">
                            {STEP_LABELS.map((label, i) => {
                                const s = (i + 1) as 1 | 2 | 3;
                                const done = step > s;
                                const active = step === s;
                                return (
                                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                                        <div className={`w-full h-1.5 rounded-full transition-colors ${done ? 'bg-blue-600' : active ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                        <span className={`text-xs font-medium hidden sm:block ${active ? 'text-blue-600' : done ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {done ? <CheckCircle2 className="h-3.5 w-3.5 inline mr-0.5" /> : null}{label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Step 1: Store Information ─────────────────────────── */}
                        {step === 1 && (
                            <>
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Store className="h-4 w-4 text-blue-600" /> Store Information
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Store Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={data.store_name}
                                                onChange={e => setData('store_name', e.target.value)}
                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                                placeholder="e.g. Santos LPG Supply"
                                            />
                                            {errors.store_name && <p className="mt-1 text-xs text-red-600">{errors.store_name}</p>}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Description
                                            </label>
                                            <textarea
                                                value={data.store_description}
                                                onChange={e => setData('store_description', e.target.value)}
                                                rows={3}
                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                                placeholder="Brief description of your business…"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Store Phone <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={data.store_phone}
                                                onChange={e => setData('store_phone', e.target.value)}
                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                                placeholder="09XX-XXX-XXXX"
                                            />
                                            {errors.store_phone && <p className="mt-1 text-xs text-red-600">{errors.store_phone}</p>}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">Store Address</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <AddressFields
                                            address={data.store_address}
                                            city={data.store_city}
                                            barangay={data.store_barangay}
                                            onAddressChange={(v) => setData('store_address', v)}
                                            onCityChange={(v) => setData('store_city', v)}
                                            onBarangayChange={(v) => setData('store_barangay', v)}
                                            errors={errors}
                                            errorKeys={{ address: 'store_address', city: 'store_city', barangay: 'store_barangay' }}
                                            requiredBarangay
                                        />
                                    </CardContent>
                                </Card>

                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        onClick={() => setStep(2)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        Next: Upload Documents →
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* ── Step 2: Documents ─────────────────────────────────── */}
                        {step === 2 && (
                            <>
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-blue-600" /> Required Documents
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-5">
                                        {/* Valid ID — special case with "already on file" logic */}
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Valid Government ID <span className="text-red-500">{has_valid_id ? '' : '*'}</span>
                                            </p>
                                            {has_valid_id && (
                                                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 mb-2">
                                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                    Valid ID already on file. You may upload a new one to replace it.
                                                </div>
                                            )}
                                            <FileField
                                                label=""
                                                required={!has_valid_id}
                                                hint="Owner's government-issued ID — JPG, PNG, or PDF, max 5 MB"
                                                file={data.valid_id}
                                                error={errors.valid_id}
                                                inputRef={idRef}
                                                onChange={f => setData('valid_id', f)}
                                                hideLabel
                                            />
                                        </div>

                                        {/* Other required docs */}
                                        {DOC_FIELDS.map(doc => (
                                            <FileField
                                                key={doc.key}
                                                label={doc.label}
                                                description={doc.description}
                                                required
                                                hint="JPG, PNG, or PDF — max 5 MB"
                                                file={data[doc.key]}
                                                error={errors[doc.key]}
                                                inputRef={fileRefs[doc.key]}
                                                onChange={f => setData(doc.key, f)}
                                            />
                                        ))}
                                    </CardContent>
                                </Card>

                                {/* Upload progress */}
                                {progress && (
                                    <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
                                        Uploading… {progress.percentage}%
                                    </div>
                                )}

                                <div className="flex gap-3 justify-between">
                                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                                        ← Back
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => setStep(3)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        Next: Terms & Conditions →
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* ── Step 3: Terms & Conditions ────────────────────────── */}
                        {step === 3 && (
                            <>
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <ScrollText className="h-4 w-4 text-blue-600" /> Terms and Conditions
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {/* Scrollable terms text */}
                                        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4 mb-5">
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

                                        {/* Three checkboxes */}
                                        <div className="space-y-3">
                                            <AgreementCheckbox
                                                checked={agreeTerms}
                                                onChange={setAgreeTerms}
                                                id="agree_terms"
                                            >
                                                I have read and agree to the Terms and Conditions
                                            </AgreementCheckbox>
                                            <AgreementCheckbox
                                                checked={agreeAuthentic}
                                                onChange={setAgreeAuthentic}
                                                id="agree_authentic"
                                            >
                                                I confirm that all uploaded documents are authentic and valid
                                            </AgreementCheckbox>
                                            <AgreementCheckbox
                                                checked={agreeCommission}
                                                onChange={setAgreeCommission}
                                                id="agree_commission"
                                            >
                                                I understand and agree to the platform commission fee of{' '}
                                                <strong>5% per completed order</strong>
                                            </AgreementCheckbox>
                                        </div>

                                        {errors.terms_agreed && (
                                            <p className="mt-2 text-xs text-red-600">{errors.terms_agreed}</p>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Notice */}
                                <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                                    <span>
                                        Your application will be reviewed by our team. You will remain a customer until approved.
                                        Upon approval, you can access the Seller Dashboard from your account.
                                    </span>
                                </div>

                                <div className="flex gap-3 justify-between">
                                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                                        ← Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={processing || !allAgreed}
                                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {processing ? 'Submitting…' : isRejected ? 'Resubmit Application' : 'Submit Application'}
                                    </Button>
                                </div>

                                {!allAgreed && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                                        Please check all three boxes above to submit your application.
                                    </p>
                                )}
                            </>
                        )}
                    </form>
                )}
            </div>
        </CustomerLayout>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="sr-only"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</span>
        </label>
    );
}

function FileField({
    label,
    description,
    required,
    hint,
    file,
    error,
    inputRef,
    onChange,
    hideLabel,
}: {
    label: string;
    description?: string;
    required?: boolean;
    hint?: string;
    file: File | null;
    error?: string;
    inputRef: React.RefObject<HTMLInputElement>;
    onChange: (f: File | null) => void;
    hideLabel?: boolean;
}) {
    return (
        <div>
            {!hideLabel && (
                <div className="mb-1.5">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label} {required && <span className="text-red-500">*</span>}
                    </p>
                    {description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                    )}
                </div>
            )}
            <div
                className="flex items-center gap-3 rounded-md border border-dashed border-gray-300 px-4 py-3 cursor-pointer hover:border-blue-400 transition-colors dark:border-gray-600 dark:hover:border-blue-500"
                onClick={() => inputRef.current?.click()}
            >
                <Upload className="h-5 w-5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    {file ? (
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                    ) : (
                        <p className="text-sm text-gray-500">Click to upload</p>
                    )}
                    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                </div>
                {file && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = ''; }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <XCircle className="h-4 w-4" />
                    </button>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={e => onChange(e.target.files?.[0] ?? null)}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}
