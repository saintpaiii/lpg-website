import { AlertCircle, Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { prepareDocumentFile } from '@/lib/resize-image';
import { cn } from '@/lib/utils';

/**
 * Live camera photo — selfies (ID verification, seller registration) and clock-in / clock-out photos.
 * The photo is taken on the spot from the camera (getUserMedia → canvas → JPEG); there is NO file / gallery upload.
 * If the camera is blocked or missing, it explains how to allow it and offers "Try again" — never an upload instead.
 *
 * The parent gets a JPEG File (≤ 2000 px, same as uploads) through onChange, or null when the photo is removed.
 */
export default function CameraCapture({
    value,
    onChange,
    facing = 'user',
    fileName = 'photo.jpg',
    startLabel = 'Open camera',
    hint,
    error,
    disabled = false,
    compact = false,
}: {
    value: File | null;
    onChange: (file: File | null) => void;
    /** 'user' = front camera (selfies), 'environment' = back camera */
    facing?: 'user' | 'environment';
    fileName?: string;
    startLabel?: string;
    hint?: string;
    error?: string | null;
    disabled?: boolean;
    /** Smaller preview (clock-in dialog) */
    compact?: boolean;
}) {
    const [mode, setMode]       = useState<'off' | 'starting' | 'active'>('off');
    const [problem, setProblem] = useState<'denied' | 'missing' | 'insecure' | 'other' | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const videoRef  = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Preview URL follows the value (also cleared when the parent resets the form)
    useEffect(() => {
        if (!value) { setPreview(null); return; }
        const url = URL.createObjectURL(value);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [value]);

    // Stop the camera when the component goes away (dialog closed, page left)
    useEffect(() => () => stop(), []);

    // The <video> exists only while active → attach the stream then
    useEffect(() => {
        if (mode === 'active' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [mode]);

    function stop() {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }

    async function start() {
        setProblem(null);
        // Cameras only work on https (or localhost); older browsers have no mediaDevices
        if (!window.isSecureContext) { setProblem('insecure'); return; }
        if (!navigator.mediaDevices?.getUserMedia) { setProblem('missing'); return; }
        setMode('starting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            setMode('active');
        } catch (e) {
            setMode('off');
            const name = (e as { name?: string })?.name ?? '';
            setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
                : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'other');
        }
    }

    function capture() {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const raw = new File([blob], fileName, { type: 'image/jpeg' });
            // Same size limit as uploads (longest side 2000 px)
            const { file = raw } = await prepareDocumentFile(raw, { allowPdf: false });
            stop();
            setMode('off');
            onChange(file);
        }, 'image/jpeg', 0.85);
    }

    function retake() {
        onChange(null);
        start();
    }

    const media = compact ? 'max-h-48' : 'max-h-72';

    return (
        <div className="space-y-2">
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

            {/* Taken photo */}
            {preview && mode !== 'active' && (
                <div className="relative">
                    <img src={preview} alt="Photo from the camera" className={cn('w-full rounded-lg border object-cover', media)} />
                    {!disabled && (
                        <div className="absolute top-2 right-2 flex gap-1.5">
                            <button type="button" onClick={retake}
                                className="flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
                                <RefreshCw className="h-3 w-3" /> Retake
                            </button>
                            <button type="button" onClick={() => onChange(null)}
                                className="flex items-center gap-1 rounded-full bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600">
                                <X className="h-3 w-3" /> Remove
                            </button>
                        </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">Photo taken with your camera just now.</p>
                </div>
            )}

            {/* Live camera */}
            {mode === 'active' && (
                <div className="space-y-2">
                    <video ref={videoRef} autoPlay playsInline muted
                        className={cn('w-full rounded-lg border bg-black object-cover', media, facing === 'user' && '-scale-x-100')} />
                    <div className="flex gap-2">
                        <Button type="button" onClick={capture} className="flex-1 bg-blue-600 text-white hover:bg-blue-700">
                            <Camera className="mr-1.5 h-4 w-4" /> Take photo
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { stop(); setMode('off'); }}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* No photo yet */}
            {!preview && mode !== 'active' && (
                <Button type="button" variant="outline" className="w-full" onClick={start} disabled={disabled || mode === 'starting'}>
                    <Camera className="mr-1.5 h-4 w-4" />
                    {mode === 'starting' ? 'Opening the camera…' : startLabel}
                </Button>
            )}

            {/* Camera blocked / missing: how to allow it, then Try again (no upload) */}
            {problem && !preview && mode !== 'active' && (
                <div role="alert" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <p className="flex items-start gap-1.5 font-medium">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {problem === 'denied' && 'The camera is blocked for this site. A live photo is required — uploading a picture is not allowed.'}
                        {problem === 'missing' && "No camera was found on this device. Use a phone or a laptop with a camera."}
                        {problem === 'insecure' && 'The camera only works on a secure (https) page. Open the site with https:// and try again.'}
                        {problem === 'other' && 'The camera could not start. Close other apps that use the camera, then try again.'}
                    </p>
                    {problem === 'denied' && (
                        <ul className="ml-5 list-disc space-y-0.5">
                            <li><strong>Chrome on a phone:</strong> tap the icon left of the address bar → <em>Permissions</em> → <em>Camera</em> → <em>Allow</em>.</li>
                            <li><strong>Chrome on a laptop:</strong> click the camera / settings icon in the address bar → <em>Always allow</em> → <em>Done</em>, or Settings → Privacy and security → Site settings → Camera.</li>
                            <li>Also check that the phone or computer lets the browser use the camera (system settings).</li>
                        </ul>
                    )}
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={start}>
                        <RefreshCw className="mr-1 h-3 w-3" /> Try again
                    </Button>
                </div>
            )}

            {error && (
                <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>
            )}
        </div>
    );
}
