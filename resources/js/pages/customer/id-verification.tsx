import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import {
    AlertCircle,
    BadgeCheck,
    Camera,
    CheckCircle2,
    Clock,
    FileText,
    Flame,
    RefreshCw,
    ShieldCheck,
    Upload,
    X,
    XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type Props = {
    status: 'pending' | 'verified' | 'rejected';
    rejection_reason: string | null;
    has_pending: boolean;
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

export default function IdVerification({ status, rejection_reason, has_pending, valid_id_url, selfie_url }: Props) {
    // ── File states ──────────────────────────────────────────────────────────
    const [idFile, setIdFile]         = useState<File | null>(null);
    const [idPreview, setIdPreview]   = useState<string | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

    // ── Camera states ────────────────────────────────────────────────────────
    const [cameraMode, setCameraMode]     = useState<'off' | 'active' | 'captured'>('off');
    const [cameraError, setCameraError]   = useState<string | null>(null);
    const videoRef  = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // ── Submit state ─────────────────────────────────────────────────────────
    const [processing, setProcessing]   = useState(false);
    const [errors, setErrors]           = useState<Record<string, string>>({});

    // Cleanup camera on unmount
    useEffect(() => {
        return () => stopCamera();
    }, []);

    // ── ID file handler ───────────────────────────────────────────────────────
    function handleIdFile(file: File | undefined) {
        if (!file) return;
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

    // ── Selfie upload handler ─────────────────────────────────────────────────
    function handleSelfieFile(file: File | undefined) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setErrors(p => ({ ...p, selfie: 'File must be 5 MB or smaller.' }));
            return;
        }
        setSelfieFile(file);
        setSelfiePreview(URL.createObjectURL(file));
        setErrors(p => ({ ...p, selfie: '' }));
        setCameraMode('off');
    }

    // ── Camera helpers ────────────────────────────────────────────────────────
    async function startCamera() {
        setCameraError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setCameraMode('active');
        } catch {
            setCameraError('Camera access denied or unavailable. Please upload a photo instead.');
        }
    }

    function capturePhoto() {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);

        canvas.toBlob(
            (blob) => {
                if (!blob) return;
                const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
                setSelfieFile(file);
                setSelfiePreview(URL.createObjectURL(blob));
                setErrors(p => ({ ...p, selfie: '' }));
                setCameraMode('captured');
                stopCamera();
            },
            'image/jpeg',
            0.85,
        );
    }

    function stopCamera() {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }

    function retakePhoto() {
        setSelfieFile(null);
        setSelfiePreview(null);
        setCameraMode('off');
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
            await axios.post('/customer/id-verification', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            window.location.href = '/customer/products';
        } catch (err: any) {
            const responseErrors = err?.response?.data?.errors ?? {};
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(responseErrors)) {
                mapped[key] = (messages as string[])[0];
            }
            if (Object.keys(mapped).length === 0 && err?.response?.data?.message) {
                toast.error(err.response.data.message);
            }
            setErrors(mapped);
            setProcessing(false);
        }
    }

    // ── Already pending ───────────────────────────────────────────────────────
    if (has_pending && status === 'pending' && !rejection_reason) {
        return (
            <CustomerLayout title="Identity Verification">
                <Head title="Identity Verification" />
                <Toaster position="top-right" richColors />
                <div className="max-w-xl py-6">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-800 dark:bg-blue-900/20">
                        <Clock className="mx-auto mb-3 h-10 w-10 text-blue-500" />
                        <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                            Verification Under Review
                        </h2>
                        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                            Your identity documents have been submitted and are currently being reviewed.
                            This usually takes 1–2 business days.
                        </p>
                        <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">
                            You can browse products and add them to your cart while you wait.
                        </p>
                        <Link
                            href="/customer/products"
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            Browse Products
                        </Link>
                    </div>

                    {/* Show uploaded docs preview */}
                    {(valid_id_url || selfie_url) && (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            {valid_id_url && (
                                <div>
                                    <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Submitted ID</p>
                                    <a href={valid_id_url} target="_blank" rel="noopener noreferrer">
                                        <img src={valid_id_url} alt="Valid ID" className="w-full rounded-lg border object-cover aspect-video hover:opacity-90 transition" />
                                    </a>
                                </div>
                            )}
                            {selfie_url && (
                                <div>
                                    <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Submitted Selfie</p>
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
            <Toaster position="top-right" richColors />

            <div className="max-w-2xl space-y-5 py-2">
                {/* Header */}
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                        <ShieldCheck className="h-6 w-6 text-blue-600" />
                        Identity Verification
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
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

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* ── Valid ID upload ── */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="h-4 w-4 text-blue-600" />
                                Step 1 — Upload Valid ID
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-gray-500">
                                Accepted: {ACCEPTED_IDS.join(' · ')}
                            </p>
                            <p className="text-xs text-gray-400">File types: JPG, PNG, PDF · Max 5 MB</p>

                            {!idPreview ? (
                                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900">
                                    <Upload className="mb-2 h-8 w-8 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to upload ID</span>
                                    <span className="mt-1 text-xs text-gray-400">JPG, PNG or PDF</span>
                                    <input
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.pdf"
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
                                                <p className="text-xs text-gray-400">PDF document</p>
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

                    {/* ── Selfie ── */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Camera className="h-4 w-4 text-blue-600" />
                                Step 2 — Take or Upload a Selfie
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-gray-500">
                                Hold your valid ID next to your face for the best result.
                            </p>
                            <p className="text-xs text-gray-400">File types: JPG, PNG · Max 5 MB</p>

                            {/* Preview captured/uploaded selfie */}
                            {selfiePreview && (
                                <div className="relative">
                                    <img src={selfiePreview} alt="Selfie preview" className="w-full rounded-lg border object-cover max-h-64" />
                                    <button
                                        type="button"
                                        onClick={retakePhoto}
                                        className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                                    >
                                        <RefreshCw className="h-3 w-3" /> Retake
                                    </button>
                                </div>
                            )}

                            {/* Camera view */}
                            {cameraMode === 'active' && (
                                <div className="space-y-2">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full rounded-lg border bg-black"
                                    />
                                    <canvas ref={canvasRef} className="hidden" />
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            onClick={capturePhoto}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            <Camera className="h-4 w-4 mr-1.5" />
                                            Capture Photo
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => { stopCamera(); setCameraMode('off'); }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Action buttons when no selfie yet */}
                            {!selfiePreview && cameraMode !== 'active' && (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={startCamera}
                                    >
                                        <Camera className="h-4 w-4 mr-1.5" />
                                        Use Camera
                                    </Button>

                                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                        <Upload className="h-4 w-4" />
                                        Upload from Gallery
                                        <input
                                            type="file"
                                            accept=".jpg,.jpeg,.png"
                                            className="hidden"
                                            onChange={(e) => handleSelfieFile(e.target.files?.[0])}
                                        />
                                    </label>
                                </div>
                            )}

                            {cameraError && (
                                <p className="flex items-center gap-1 text-xs text-amber-600">
                                    <AlertCircle className="h-3.5 w-3.5" /> {cameraError}
                                </p>
                            )}
                            {errors.selfie && (
                                <p className="flex items-center gap-1 text-xs text-red-500">
                                    <AlertCircle className="h-3.5 w-3.5" /> {errors.selfie}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex items-center justify-between gap-4">
                        <Link
                            href="/customer/products"
                            className="text-sm text-gray-500 hover:text-blue-600 hover:underline"
                        >
                            Skip for now — browse products
                        </Link>
                        <Button
                            type="submit"
                            disabled={processing}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                        >
                            {processing ? (
                                <span className="flex items-center gap-2">
                                    <Flame className="h-4 w-4 animate-pulse" /> Submitting…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4" /> Submit for Verification
                                </span>
                            )}
                        </Button>
                    </div>
                </form>

                {/* Info box */}
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-900/20">
                    <p className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <BadgeCheck className="h-4 w-4" /> What happens next?
                    </p>
                    <ul className="mt-2 space-y-1 text-blue-600 dark:text-blue-400 text-xs">
                        <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Our team reviews your documents within 1–2 business days.
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
