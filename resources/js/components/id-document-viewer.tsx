import { ExternalLink, FileText, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Whole (uncropped) preview of an ID / selfie with a full-screen viewer.
 * Private links don't show the file type, so a file that doesn't load as an image is shown as a PDF tile.
 */
export function IdDocumentTile({ url, label, height = 220 }: { url: string | null; label: string; height?: number }) {
    const [open, setOpen] = useState(false);
    const [isFile, setIsFile] = useState(false);   // not an image (e.g. PDF)
    const [zoomed, setZoomed] = useState(false);

    return (
        <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {!url ? (
                <div style={{ height }} className="flex items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">Not uploaded</div>
            ) : isFile ? (
                <div style={{ height }} className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-gray-50 dark:bg-gray-900">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500">PDF</span>
                    <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            ) : (
                <button type="button" onClick={() => { setZoomed(false); setOpen(true); }} style={{ height }}
                    className="group relative flex w-full items-center justify-center overflow-hidden rounded-lg border bg-gray-100 dark:bg-gray-900"
                    aria-label={`View ${label} full screen`}>
                    <img src={url} alt={label} onError={() => setIsFile(true)} className="max-h-full max-w-full object-contain" />
                    <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white opacity-80 group-hover:opacity-100">
                        <ZoomIn className="h-3 w-3" /> View
                    </span>
                </button>
            )}

            {url && !isFile && (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="max-h-[95vh] w-[95vw] max-w-[95vw] overflow-hidden p-3 sm:max-w-[95vw]">
                        <DialogHeader>
                            <DialogTitle className="flex flex-wrap items-center gap-3">
                                {label}
                                <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-normal text-blue-600 hover:underline">
                                    Open in new tab <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </DialogTitle>
                            <DialogDescription>{zoomed ? 'Click the image to fit it to the screen.' : 'Click the image to see it at full size.'}</DialogDescription>
                        </DialogHeader>
                        <div className={cn('max-h-[80vh] rounded bg-gray-100 dark:bg-gray-900', zoomed ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden')}>
                            <img src={url} alt={label} onClick={() => setZoomed((z) => !z)}
                                className={cn(zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-[78vh] max-w-full cursor-zoom-in object-contain')} />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

/** Things an admin should check before approving an ID. */
export function IdCheckHints() {
    return (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>The name on the ID matches the account name</li>
            <li>The face matches the selfie</li>
            <li>The ID is not expired</li>
            <li>The photo is clear and not edited</li>
        </ul>
    );
}
