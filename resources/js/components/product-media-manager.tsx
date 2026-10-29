import { ChevronLeft, ChevronRight, Loader2, Play, Plus, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatDuration, MediaPrepError, prepareMedia, type PreparedMedia, isVideoFile } from '@/lib/media-prep';
import { cn } from '@/lib/utils';

export const MAX_PHOTOS = 8;
export const MAX_VIDEOS = 1;

/** One tile: an existing media row, or a new file being prepared / ready to upload. */
export type MediaItem = {
    key: string;
    kind: 'image' | 'video';
    existingId: number | null;
    thumb: string | null;           // photo or video poster
    duration: number | null;
    preparing: boolean;
    prepared: PreparedMedia | null; // new items only
};

export type ExistingMedia = { id: number; type: 'image' | 'video'; url: string; poster_url: string | null; duration: number | null };

let seq = 0;
export const itemsFromExisting = (media: ExistingMedia[]): MediaItem[] => media.map((m) => ({
    key: `id-${m.id}`, kind: m.type, existingId: m.id, thumb: m.type === 'video' ? m.poster_url : m.url,
    duration: m.duration, preparing: false, prepared: null,
}));

/** A video can't be the cover while there are photos: keep it at position 2. */
function keepPhotoFirst(items: MediaItem[]): { items: MediaItem[]; moved: boolean } {
    if (items[0]?.kind === 'video' && items.some((i) => i.kind === 'image')) {
        const [video, ...rest] = items;
        return { items: [rest[0], video, ...rest.slice(1)], moved: true };
    }
    return { items, moved: false };
}

/**
 * Seller "Photos & video" editor: square tiles, first photo = cover, drag to reorder (desktop) or ‹ › (phones),
 * remove ✕, "+ Add" (multi-file, also drop files on the section). Photos are resized and videos checked before upload.
 */
export default function ProductMediaManager({ items, onChange, serverErrors }: {
    items: MediaItem[];
    onChange: (updater: (prev: MediaItem[]) => MediaItem[]) => void;
    serverErrors: string[];
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragKey, setDragKey] = useState<string | null>(null);
    const [notices, setNotices] = useState<string[]>([]);

    const photos = items.filter((i) => i.kind === 'image').length;
    const videos = items.filter((i) => i.kind === 'video').length;

    function apply(next: MediaItem[]) {
        const { items: fixed, moved } = keepPhotoFirst(next);
        if (moved) setNotices((n) => [...n.filter((x) => x !== 'The cover must be a photo.'), 'The cover must be a photo.']);
        return fixed;
    }

    function addFiles(files: FileList | File[]) {
        const list = Array.from(files);
        const msgs: string[] = [];
        let p = photos;
        let v = videos;
        const accepted: { item: MediaItem; file: File }[] = [];
        for (const file of list) {
            const video = isVideoFile(file);
            if (video && v >= MAX_VIDEOS) { msgs.push('You can add 1 video.'); continue; }
            if (!video && p >= MAX_PHOTOS) { msgs.push(`You can add up to ${MAX_PHOTOS} photos.`); continue; }
            video ? v++ : p++;
            accepted.push({
                file,
                item: { key: `new-${++seq}`, kind: video ? 'video' : 'image', existingId: null, thumb: null, duration: null, preparing: true, prepared: null },
            });
        }
        setNotices([...new Set(msgs)]);
        if (!accepted.length) return;
        onChange((prev) => apply([...prev, ...accepted.map((a) => a.item)]));

        for (const { item, file } of accepted) {
            prepareMedia(file).then((prepared) => {
                onChange((prev) => prev.map((i) => (i.key === item.key
                    ? { ...i, preparing: false, prepared, thumb: prepared.previewUrl, duration: prepared.duration }
                    : i)));
            }).catch((e: unknown) => {
                const msg = e instanceof MediaPrepError ? e.message : `"${file.name}" could not be added.`;
                setNotices((n) => [...n, `${file.name}: ${msg}`]);
                onChange((prev) => prev.filter((i) => i.key !== item.key));
            });
        }
    }

    function remove(key: string) {
        setNotices([]);
        onChange((prev) => prev.filter((i) => i.key !== key));
    }

    function move(index: number, dir: -1 | 1) {
        const j = index + dir;
        if (j < 0 || j >= items.length) return;
        setNotices([]);
        onChange((prev) => {
            const next = [...prev];
            [next[index], next[j]] = [next[j], next[index]];
            return apply(next);
        });
    }

    // ── HTML5 drag-and-drop reorder (desktop) ──
    function onTileDragOver(e: DragEvent, overKey: string) {
        if (!dragKey) return;   // file drags are handled by the section
        e.preventDefault();
        if (dragKey === overKey) return;
        onChange((prev) => {
            const from = prev.findIndex((i) => i.key === dragKey);
            const to = prev.findIndex((i) => i.key === overKey);
            if (from < 0 || to < 0) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }
    function onTileDragEnd() {
        setDragKey(null);
        setNotices([]);
        onChange((prev) => apply(prev));
    }

    function onSectionDrop(e: DragEvent) {
        e.preventDefault();
        if (!dragKey && e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    }

    const coverKey = items.find((i) => i.kind === 'image')?.key;
    const canAdd = photos < MAX_PHOTOS || videos < MAX_VIDEOS;

    return (
        <div className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={onSectionDrop}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Photos &amp; video</p>
                <p className="text-xs text-muted-foreground">{photos} / {MAX_PHOTOS} photos · {videos} / {MAX_VIDEOS} video</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {items.map((item, index) => (
                    <div key={item.key}
                        draggable={!item.preparing}
                        onDragStart={(e) => { setDragKey(item.key); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => onTileDragOver(e, item.key)}
                        onDragEnd={onTileDragEnd}
                        className={cn('group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-shadow',
                            dragKey === item.key && 'scale-[1.03] opacity-80 shadow-lg ring-2 ring-blue-400')}>
                        {item.thumb ? (
                            <img src={item.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{item.kind === 'video' ? 'Video' : 'Photo'}</div>
                        )}

                        {item.preparing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/60">
                                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            </div>
                        )}
                        {item.kind === 'video' && !item.preparing && (
                            <span className="absolute inset-0 flex items-center justify-center">
                                <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                                    <Play className="h-3 w-3 fill-white" /> {formatDuration(item.duration)}
                                </span>
                            </span>
                        )}
                        {item.key === coverKey && (
                            <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>
                        )}

                        <button type="button" onClick={() => remove(item.key)} aria-label="Remove"
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                            <X className="h-3.5 w-3.5" />
                        </button>

                        <div className="absolute inset-x-1 bottom-1 flex justify-between">
                            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move left"
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-gray-700 shadow disabled:invisible dark:bg-black/60 dark:text-white">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move right"
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-gray-700 shadow disabled:invisible dark:bg-black/60 dark:text-white">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {canAdd && (
                    <button type="button" onClick={() => inputRef.current?.click()}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-600">
                        <Plus className="h-5 w-5" /> Add
                    </button>
                )}
            </div>

            <input ref={inputRef} type="file" multiple className="hidden"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />

            <p className="text-xs text-muted-foreground">The first photo is the cover customers see first. Video: MP4, up to 30 seconds, 20 MB.</p>

            {[...notices, ...serverErrors].length > 0 && (
                <ul className="space-y-0.5 text-xs text-red-600">
                    {[...new Set([...notices, ...serverErrors])].map((m) => <li key={m}>{m}</li>)}
                </ul>
            )}
        </div>
    );
}
