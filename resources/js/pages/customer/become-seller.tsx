import { Head, useForm } from '@inertiajs/react';
import { AlertCircle, CheckCircle2, Clock, FileText, Store, Upload, XCircle } from 'lucide-react';
import { useRef } from 'react';
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BecomeSellerPage({ application, has_valid_id }: Props) {
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
    });

    const birRef      = useRef<HTMLInputElement>(null);
    const bizRef      = useRef<HTMLInputElement>(null);
    const idRef       = useRef<HTMLInputElement>(null);

    function submit(e: React.FormEvent) {
        e.preventDefault();
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

                {/* Application form — shown when no application or when rejected */}
                {!isPending && (
                    <form onSubmit={submit} className="space-y-6">
                        {/* Store Info */}
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
                                    {errors.store_description && <p className="mt-1 text-xs text-red-600">{errors.store_description}</p>}
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

                        {/* Store Address */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Store Address</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Street / Building <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={data.store_address}
                                        onChange={e => setData('store_address', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        placeholder="Street address or building"
                                    />
                                    {errors.store_address && <p className="mt-1 text-xs text-red-600">{errors.store_address}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Barangay <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={data.store_barangay}
                                        onChange={e => setData('store_barangay', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        placeholder="Barangay"
                                    />
                                    {errors.store_barangay && <p className="mt-1 text-xs text-red-600">{errors.store_barangay}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        City / Municipality <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={data.store_city}
                                        onChange={e => setData('store_city', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        placeholder="City"
                                    />
                                    {errors.store_city && <p className="mt-1 text-xs text-red-600">{errors.store_city}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Province <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={data.store_province}
                                        onChange={e => setData('store_province', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                    />
                                    {errors.store_province && <p className="mt-1 text-xs text-red-600">{errors.store_province}</p>}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Documents */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-blue-600" /> Required Documents
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-5">
                                {/* BIR Permit */}
                                <FileField
                                    label="BIR Permit"
                                    required
                                    hint="JPG, PNG, or PDF — max 5 MB"
                                    file={data.bir_permit}
                                    error={errors.bir_permit}
                                    inputRef={birRef}
                                    onChange={f => setData('bir_permit', f)}
                                />

                                {/* Business Permit */}
                                <FileField
                                    label="Business Permit / Mayor's Permit"
                                    required
                                    hint="JPG, PNG, or PDF — max 5 MB"
                                    file={data.business_permit}
                                    error={errors.business_permit}
                                    inputRef={bizRef}
                                    onChange={f => setData('business_permit', f)}
                                />

                                {/* Valid ID */}
                                <div>
                                    {has_valid_id ? (
                                        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400">
                                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                                            Valid ID already on file from your registration. You may upload a new one to replace it.
                                        </div>
                                    ) : null}
                                    <div className={has_valid_id ? 'mt-2' : ''}>
                                        <FileField
                                            label="Valid Government ID"
                                            required={!has_valid_id}
                                            hint="JPG, PNG, or PDF — max 5 MB"
                                            file={data.valid_id}
                                            error={errors.valid_id}
                                            inputRef={idRef}
                                            onChange={f => setData('valid_id', f)}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Upload progress */}
                        {progress && (
                            <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
                                Uploading... {progress.percentage}%
                            </div>
                        )}

                        {/* Notice */}
                        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                            <span>
                                Your application will be reviewed by our team. You will remain a customer until approved.
                                Upon approval, you can access the Seller Dashboard from your account.
                            </span>
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={processing} className="bg-blue-600 hover:bg-blue-700">
                                {processing ? 'Submitting…' : isRejected ? 'Resubmit Application' : 'Submit Application'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </CustomerLayout>
    );
}

// ── File input sub-component ───────────────────────────────────────────────────

function FileField({
    label,
    required,
    hint,
    file,
    error,
    inputRef,
    onChange,
}: {
    label: string;
    required?: boolean;
    hint?: string;
    file: File | null;
    error?: string;
    inputRef: React.RefObject<HTMLInputElement>;
    onChange: (f: File | null) => void;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
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
