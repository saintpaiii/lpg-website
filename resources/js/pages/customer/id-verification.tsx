import { Head } from '@inertiajs/react';
import axios from 'axios';
import {
    AlertCircle,
    BadgeCheck,
    Camera,
    CheckCircle2,
    Clock,
    FileText,
    Flame,
    ShieldCheck,
    Upload,
    X,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import IdDetailsStep, { type IdDetails } from '@/components/customer/id-details-step';
import CameraCapture from '@/components/camera-capture';
import CustomerLayout from '@/layouts/customer-layout';
import { DOCUMENT_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';

type Props = {
    details: IdDetails;
    details_complete: boolean;
    status: 'pending' | 'verified' | 'rejected';
    rejection_reason: string | null;
    has_pending: boolean;
    /** Why the pending request wasn't approved automatically (plain words) */
    pending_reason?: string | null;
    valid_id_url: string | null;
    selfie_url: string | null;
};

const ACCEPTED_IDS = [
    'Philippine National ID (PhilSys)',
    "Driver's License",
    'Passport',
    'PhilHealth ID',
    'SSS / UMID ID',
    "Voter's ID",
    'Postal ID',
];

/** "1 Your details → 2 Upload ID & selfie" */
function Stepper({ step, detailsDone, onStep1 }: { step: 1 | 2; detailsDone: boolean; onStep1: () => void }) {
    const items = [
        { n: 1 as const, label: 'Your details' },
        { n: 2 as const, label: 'Upload ID & selfie' },
    ];
    return (
        <ol className="flex items-center gap-2 text-sm">
            {items.map(({ n, label }, i) => {
                const active = step === n;
                const done = n === 1 && detailsDone && step === 2;
                return (
                    <li key={n} className="flex min-w-0 items-center gap-2">
                        {i > 0 && <span className="h-px w-6 shrink-0 bg-gray-300 sm:w-10 dark:bg-gray-700" />}
                        <button
                            type="button"
                            onClick={n === 1 && step === 2 ? onStep1 : undefined}
                            disabled={!(n === 1 && step === 2)}
                            className="flex min-w-0 items-center gap-2 disabled:cursor-default"
                        >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                active ? 'bg-blue-600 text-white'
                                    : done ? 'bg-green-600 text-white'
                                        : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                            }`}>
                                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                            </span>
                            <span className={`truncate ${active ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'} ${done ? 'underline-offset-2 hover:underline' : ''}`}>
                                {label}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

export default function IdVerification({ details, details_complete, status, rejection_reason, has_pending, pending_reason = null, valid_id_url, selfie_url }: Props) {
    // Pending: "Retake / re-upload" shows the form again (the new submission replaces the pending one)
    const [retake, setRetake] = useState(false);
    // ── Step: 1 = your details (only when something is missing), 2 = upload ──
    const [step, setStep] = useState<1 | 2>(details_complete ? 2 : 1);

    // ── File states ──────────────────────────────────────────────────────────
    const [idFile, setIdFile]         = useState<File | null>(null);
    const [idPreview, setIdPreview]   = useState<string | null>(null);
    // Selfie: live camera photo only (CameraCapture) — no gallery / file upload
    const [selfieFile, setSelfieFile] = useState<File | null>(null);

    // ── Submit state ─────────────────────────────────────────────────────────
    const [processing, setProcessing]   = useState(false);
    const [errors, setErrors]           = useState<Record<string, string>>({});

    // ── ID file handler ───────────────────────────────────────────────────────
    async function handleIdFile(picked: File | undefined) {
        if (!picked) return;
        // Any photo → real JPEG (a "validid.jpg" from Google is often a WEBP); PDFs unchanged
        const { file, problem } = await prepareDocumentFile(picked);
        if (!file) {
            setErrors(p => ({ ...p, valid_id: problem ?? 'Use a JPG, PNG, WEBP or PDF file.' }));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setErrors(p => ({ ...p, valid_id: 'File must be 5 MB or smaller.' }));
            return;
        }
        setIdFile(file);
        setErrors(p => ({ ...p, valid_id: '' }));
        if (file.type === 'application/pdf') {
            setIdPreview('pdf');
        } else {
            setIdPreview(URL.createObjectURL(file));
        }
    }


    // ── Submit ────────────────────────────────────────────────────────────────
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const newErrors: Record<string, string> = {};
        if (!idFile) newErrors.valid_id = 'Please upload a photo of your valid ID.';
        if (!selfieFile) newErrors.selfie = 'Please provide a selfie photo.';
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setProcessing(true);
        setErrors({});

        const fd = new FormData();
        fd.append('valid_id', idFile!);
        fd.append('selfie', selfieFile!);
        fd.append('_method', 'POST');

        try {
            const res = await axios.post('/customer/id-verification', fd, {
                headers: { 'Content-Type': 'multipart/form-data', Accept: 'application/json' },
            });
            // Verified automatically → products; otherwise back here (waiting for the admin)
            window.location.href = typeof res.data?.redirect === 'string' ? res.data.redirect : '/customer/id-verification';
        } catch (err: any) {
            const responseErrors = err?.response?.data?.errors ?? {};
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(responseErrors)) {
                mapped[key] = (messages as string[])[0];
            }
            // Phone / address missing — back to step 1
            if (mapped.details) {
                toast.error(mapped.details);
                setStep(1);
                setProcessing(false);
                return;
            }
            if (Object.keys(mapped).length === 0 && err?.response?.data?.message) {
                toast.error(err.response.data.message);
            }
            setErrors(mapped);
            setProcessing(false);
        }
    }

    // ── Already pending ───────────────────────────────────────────────────────
    if (has_pending && status === 'pending' && !rejection_reason && !retake) {
        return (
            <CustomerLayout title="Identity Verification">
                <Head title="Identity Verification" />
                <div className="max-w-xl py-6">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-800 dark:bg-blue-900/20">
                        <Clock className="mx-auto mb-3 h-10 w-10 text-blue-500" />
                        <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                            Verification Under Review
                        </h2>
                        {pending_reason ? (
                            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                                We couldn't confirm your photo automatically ({pending_reason}). An admin will review it — usually within 24 hours.
                                You can wait, or retake your selfie / upload a clearer ID now.
                            </p>
                        ) : (
                            <>
                                <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                                    Your identity documents have been submitted and are currently being reviewed.
                                </p>
                                <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">
                                    We'll notify you as soon as it's approved — usually within 24 hours.
                                </p>
                            </>
                        )}
                        <Button type="button" variant="outline" className="mt-4 gap-1.5" onClick={() => { setRetake(true); setStep(2); }}>
                            <Camera className="h-4 w-4" /> Retake / re-upload
                        </Button>
                    </div>

                    {/* Show uploaded docs preview */}
                    {(valid_id_url || selfie_url) && (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            {valid_id_url && (
                                <div>
                                    <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted ID</p>
                                    <a href={valid_id_url} target="_blank" rel="noopener noreferrer">
                                        <img src={valid_id_url} alt="Valid ID" className="w-full rounded-lg border object-cover aspect-video hover:opacity-90 transition" />
                                    </a>
                                </div>
                            )}
                            {selfie_url && (
                                <div>
                                    <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted Selfie</p>
                                    <img src={selfie_url} alt="Selfie" className="w-full rounded-lg border object-cover aspect-video" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </CustomerLayout>
        );
    }

    return (
        <CustomerLayout title="Identity Verification">
            <Head title="Identity Verification" />

            <div className="max-w-2xl space-y-5 py-2">
                {/* Header */}
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                        <ShieldCheck className="h-6 w-6 text-blue-600" />
                        Identity Verification
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Verify your identity to place orders. You can still browse products while your verification is being reviewed.
                    </p>
                </div>

                {/* Rejection notice */}
                {status === 'rejected' && rejection_reason && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                        <div className="flex items-start gap-3">
                            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                            <div>
                                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                                    Verification Rejected — Please Re-upload
                                </p>
                                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                    <strong>Reason:</strong> {rejection_reason}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <Stepper step={step} detailsDone={details_complete} onStep1={() => setStep(1)} />

                {step === 1 && <IdDetailsStep details={details} onSaved={() => setStep(2)} />}

                {step === 2 && (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* ── Valid ID upload ── */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="h-4 w-4 text-blue-600" />
                                Upload Valid ID
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Accepted: {ACCEPTED_IDS.join(' · ')}
                            </p>
                            <p className="text-xs text-muted-foreground">File types: JPG, PNG, PDF · Max 5 MB</p>

                            {!idPreview ? (
                                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900">
                                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to upload ID</span>
                                    <span className="mt-1 text-xs text-muted-foreground">JPG, PNG or PDF</span>
                                    <input
                                        type="file"
                                        accept={DOCUMENT_ACCEPT}
                                        className="hidden"
                                        onChange={(e) => handleIdFile(e.target.files?.[0])}
                                    />
                                </label>
                            ) : (
                                <div className="relative">
                                    {idPreview === 'pdf' ? (
                                        <div className="flex items-center gap-3 rounded-lg border bg-gray-50 p-4 dark:bg-gray-900">
                                            <FileText className="h-8 w-8 text-red-500" />
                                            <div>
                                                <p className="text-sm font-medium">{idFile?.name}</p>
                                                <p className="text-xs text-muted-foreground">PDF document</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={idPreview} alt="Valid ID preview" className="w-full rounded-lg border object-contain max-h-52" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setIdFile(null); setIdPreview(null); }}
                                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}

                            {errors.valid_id && (
                                <p className="flex items-center gap-1 text-xs text-red-500">
                                    <AlertCircle className="h-3.5 w-3.5" /> {errors.valid_id}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Selfie: live camera only (no gallery / file upload) ── */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Camera className="h-4 w-4 text-blue-600" />
                                Take a Selfie
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Hold your valid ID next to your face. The selfie must be taken now with your camera — uploading a picture is not allowed.
                            </p>
                            <CameraCapture
                                value={selfieFile}
                                onChange={(f) => { setSelfieFile(f); if (f) setErrors((p) => ({ ...p, selfie: '' })); }}
                                fileName="selfie.jpg"
                                startLabel="Open camera"
                                error={errors.selfie || null}
                            />
                            <p className="text-xs text-muted-foreground">
                                Your ID photo and selfie are compared by our face-matching provider (Face++) only to confirm it's you.
                                See our <a href="/privacy" target="_blank" rel="noopener" className="underline">Privacy Policy</a>.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground" aria-live="polite">
                            {processing
                                ? 'Checking your photo… this can take up to 15 seconds.'
                                : 'When your selfie matches your ID you are verified right away; otherwise an admin reviews it — usually within 24 hours.'}
                        </p>
                        <Button
                            type="submit"
                            disabled={processing}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                        >
                            {processing ? (
                                <span className="flex items-center gap-2">
                                    <Flame className="h-4 w-4 animate-pulse" /> Checking your photo…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4" /> Submit for Verification
                                </span>
                            )}
                        </Button>
                    </div>
                </form>
                )}

                {/* Info box */}
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-900/20">
                    <p className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <BadgeCheck className="h-4 w-4" /> What happens next?
                    </p>
                    <ul className="mt-2 space-y-1 text-blue-600 dark:text-blue-400 text-xs">
                        <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            If your selfie matches your ID you're verified right away; otherwise our team reviews it, usually within 24 hours.
                        </li>
                        <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            You'll receive a notification when your identity is verified.
                        </li>
                        <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Once verified, you can place orders for LPG delivery.
                        </li>
                    </ul>
                </div>
            </div>
        </CustomerLayout>
    );
}
