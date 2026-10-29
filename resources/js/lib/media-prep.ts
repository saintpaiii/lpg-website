// Prepares product photos / videos in the browser before upload (no packages):
// photos are shrunk to 1600 px JPEG when large; videos are checked (≤ 30 s, playable) and get a poster frame.

export type PreparedMedia = {
    kind: 'image' | 'video';
    file: File;
    poster: Blob | null;      // videos only
    width: number | null;
    height: number | null;
    duration: number | null;  // seconds, videos only
    previewUrl: string;       // object URL for the tile (photo or poster)
};

export class MediaPrepError extends Error {}

const MAX_SIDE = 1600;
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30.5;
const VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_UNPLAYABLE = "This video can't be played in all browsers. Please upload an MP4 (H.264) video.";

export const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(f.name);

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new MediaPrepError('This file is not a photo we can read. Please use JPG, PNG or WebP.'));
        img.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaPrepError('Could not process this photo.'))), 'image/jpeg', quality));
}

async function prepareImage(file: File): Promise<PreparedMedia> {
    if (!IMAGE_TYPES.includes(file.type)) throw new MediaPrepError(`"${file.name}" is not a JPG, PNG or WebP photo.`);
    const srcUrl = URL.createObjectURL(file);
    try {
        const img = await loadImage(srcUrl);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const long = Math.max(w, h);

        if (long <= MAX_SIDE && file.size <= RESIZE_ABOVE_BYTES) {
            return { kind: 'image', file, poster: null, width: w, height: h, duration: null, previewUrl: URL.createObjectURL(file) };
        }

        // Shrink to 1600 px and re-encode as JPEG — fill white first so transparent PNGs don't turn black
        const scale = Math.min(1, MAX_SIDE / long);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new MediaPrepError('Could not process this photo.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        const blob = await canvasToBlob(canvas);
        const out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        return { kind: 'image', file: out, poster: null, width: cw, height: ch, duration: null, previewUrl: URL.createObjectURL(out) };
    } finally {
        URL.revokeObjectURL(srcUrl);
    }
}

function prepareVideo(file: File): Promise<PreparedMedia> {
    const type = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : file.type);
    if (type && !VIDEO_TYPES.includes(type)) return Promise.reject(new MediaPrepError('Videos must be MP4, MOV or WebM.'));
    if (file.size > MAX_VIDEO_BYTES) return Promise.reject(new MediaPrepError('Videos can be up to 20 MB.'));

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        let done = false;
        const finish = (fn: () => void) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
            fn();
        };
        const fail = (msg = VIDEO_UNPLAYABLE) => finish(() => reject(new MediaPrepError(msg)));
        const timer = setTimeout(() => fail(), 8000);

        video.onerror = () => fail();
        video.onloadedmetadata = () => {
            const d = video.duration;
            if (!Number.isFinite(d)) return fail();
            if (d > MAX_VIDEO_SECONDS) return fail('Videos can be up to 30 seconds.');
            video.currentTime = Math.min(0.5, d / 2);
        };
        video.onseeked = () => {
            if (!video.videoWidth) return fail();
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return fail();
                ctx.drawImage(video, 0, 0);
                const width = video.videoWidth;
                const height = video.videoHeight;
                const duration = video.duration;
                canvasToBlob(canvas, 0.8).then((poster) => finish(() => resolve({
                    kind: 'video', file, poster, width, height, duration, previewUrl: URL.createObjectURL(poster),
                })), () => fail());
            } catch {
                fail();
            }
        };
        video.src = url;
    });
}

/** Shrinks photos / checks videos. Rejects with a MediaPrepError carrying a plain-language message. */
export function prepareMedia(file: File): Promise<PreparedMedia> {
    return isVideoFile(file) ? prepareVideo(file) : prepareImage(file);
}

/** "0:12" */
export const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds == null || !Number.isFinite(seconds)) return '';
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
