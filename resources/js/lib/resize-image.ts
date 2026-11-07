/**
 * Shrink a photo in the browser before upload (longest side ≤ 1600 px, JPEG quality 0.85) so uploads stay well
 * under the server's PHP limits. Files that are already small enough, or that the browser can't decode, are
 * returned unchanged (the server still validates them).
 */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

const MAX_SIDE = 1600;
const QUALITY  = 0.85;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** HEIC / HEIF (iPhone default) can't be shown or resized by most browsers. */
export function isHeic(file: File): boolean {
    return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** null = OK; otherwise the message to show for this file. */
export function photoProblem(file: File): string | null {
    if (isHeic(file)) return "iPhone HEIC photos aren't supported — choose JPG or PNG";
    if (!OK_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG or WEBP photos.`;
    return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
        img.src = url;
    });
}

export async function resizeImage(file: File, maxSide = MAX_SIDE, quality = QUALITY): Promise<File> {
    if (!OK_TYPES.includes(file.type)) return file;
    try {
        const img   = await loadImage(file);
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        // Small already and not huge on disk → keep the original (no quality loss)
        if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;

        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        // PNG transparency → white instead of black in the JPEG
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
        if (!blob || blob.size >= file.size) return file;
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        return file;
    }
}

/**
 * Check + resize a picked list. Returns the usable files and the problems (one message per rejected file).
 */
export async function preparePhotos(files: File[]): Promise<{ files: File[]; problems: string[] }> {
    const ok: File[] = [];
    const problems: string[] = [];
    for (const f of files) {
        const p = photoProblem(f);
        if (p) { problems.push(p); continue; }
        ok.push(await resizeImage(f));
    }
    return { files: ok, problems: Array.from(new Set(problems)) };
}
