import { ChevronLeft, ChevronRight, Maximize2, Package, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatDuration } from '@/lib/media-prep';
import { cn } from '@/lib/utils';

export type GalleryMedia = {
    id: number;
    type: 'image' | 'video';
    url: string;
    poster_url: string | null;
    duration: number | null;
    width: number | null;
    height: number | null;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const on = () => setReduced(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return reduced;
}

/** Which slide is mostly visible in a snap track (IntersectionObserver, 60 %). */
function useActiveSlide(trackRef: RefObject<HTMLDivElement | null>, count: number, enabled = true): [number, (i: number) => void] {
    const [active, setActive] = useState(0);
    useEffect(() => {
        const track = trackRef.current;
        if (!track || !enabled) return;
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
            }
        }, { root: track, threshold: 0.6 });
        Array.from(track.children).forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [trackRef, count, enabled]);
    return [active, setActive];
}

function scrollToSlide(track: HTMLDivElement | null, index: number, smooth: boolean) {
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' as ScrollBehavior });
}

const roundBtn = 'flex items-center justify-center rounded-full bg-white/80 text-gray-800 shadow-md backdrop-blur hover:bg-white dark:bg-black/50 dark:text-white dark:hover:bg-black/70';

// ── video ────────────────────────────────────────────────────────────────────

/** Muted, inline, looping; plays only while its slide is active (never with sound on its own). */
function SlideVideo({ item, active, reduced, nativeControls = false }: { item: GalleryMedia; active: boolean; reduced: boolean; nativeControls?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || failed) return;
        if (active && !reduced && !nativeControls) {
            el.muted = true;          // set in code too — iOS needs the property for inline autoplay
            setMuted(true);
            el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
            el.pause();
            setPlaying(false);
        }
    }, [active, reduced, failed, nativeControls]);

    if (failed) {
        return (
            <div className="relative flex h-full w-full items-center justify-center">
                {item.poster_url && <img src={item.poster_url} alt="" className="max-h-full max-w-full object-contain" />}
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">Video can't play on this device</span>
            </div>
        );
    }

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <video
                ref={ref}
                src={item.url}
                poster={item.poster_url ?? undefined}
                muted
                playsInline
                loop
                preload="metadata"
                controls={nativeControls}
                onError={() => setFailed(true)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="max-h-full max-w-full object-contain"
            />
            {!nativeControls && (
                <div className="absolute bottom-3 left-3 z-20 flex gap-1.5">
                    <button type="button" className={cn(roundBtn, 'h-8 w-8')} aria-label={playing ? 'Pause video' : 'Play video'}
                        onClick={(e) => {
                            e.stopPropagation();
                            const el = ref.current;
                            if (!el) return;
                            if (el.paused) el.play().catch(() => undefined); else el.pause();
                        }}>
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button type="button" className={cn(roundBtn, 'h-8 w-8')} aria-label={muted ? 'Unmute' : 'Mute'}
                        onClick={(e) => {
                            e.stopPropagation();
                            const el = ref.current;
                            if (!el) return;
                            el.muted = !el.muted;
                            setMuted(el.muted);
                        }}>
                        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                </div>
            )}
        </div>
    );
}

// ── slide ────────────────────────────────────────────────────────────────────

/** One slide (stage or full-screen viewer). Photos are never cropped; a blurred copy fills the sides near the active slide. */
function Slide({ item, index, active, near, reduced, name, variant, onOpen, zoom, onImagePointerUp }: {
    item: GalleryMedia;
    index: number;
    active: boolean;
    near: boolean;
    reduced: boolean;
    name: string;
    variant: 'stage' | 'viewer';
    onOpen?: () => void;
    zoom?: { x: number; y: number } | null;
    onImagePointerUp?: (e: PointerEvent<HTMLImageElement>) => void;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const backdrop = item.type === 'image' ? item.url : item.poster_url;

    // Zoomed (viewer): centre the tapped point
    useEffect(() => {
        const box = boxRef.current;
        if (!zoom || !box) return;
        const img = box.querySelector('img');
        if (!img) return;
        const center = () => {
            box.scrollLeft = zoom.x * img.clientWidth - box.clientWidth / 2;
            box.scrollTop = zoom.y * img.clientHeight - box.clientHeight / 2;
        };
        if (img.complete) center(); else img.addEventListener('load', center, { once: true });
    }, [zoom]);

    return (
        <div data-index={index}
            className={cn('relative h-full w-full shrink-0 snap-center snap-always overflow-hidden',
                variant === 'stage' && !reduced && 'transition-[opacity,transform] duration-300 ease-out',
                variant === 'stage' && !reduced && (active ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-70'))}>
            {variant === 'stage' && near && backdrop && (
                <img src={backdrop} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
            )}

            {item.type === 'video' ? (
                <SlideVideo item={item} active={active} reduced={reduced} nativeControls={variant === 'viewer'} />
            ) : zoom ? (
                <div ref={boxRef} className="h-full w-full overflow-auto">
                    <img src={item.url} alt={name} onPointerUp={onImagePointerUp} draggable={false}
                        className="max-w-none cursor-zoom-out select-none" style={{ width: '200%' }} />
                </div>
            ) : (
                <button type="button" tabIndex={-1} onClick={onOpen} className={cn('relative flex h-full w-full items-center justify-center', variant === 'stage' && 'cursor-zoom-in')}
                    aria-label={variant === 'stage' ? `Open ${name} photo ${index + 1} full screen` : undefined}>
                    <img src={item.url} alt={`${name} — photo ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} draggable={false}
                        onPointerUp={onImagePointerUp}
                        className="relative max-h-full max-w-full select-none object-contain" />
                </button>
            )}
        </div>
    );
}

// ── gallery ──────────────────────────────────────────────────────────────────

/**
 * Product page gallery: swipeable snap track (one slide per flick), arrows, dots, counter, thumbnails,
 * muted autoplaying video on its active slide, and a full-screen viewer with double-tap zoom.
 */
export default function ProductGallery({ media, name, outOfStock }: { media: GalleryMedia[]; name: string; outOfStock: boolean }) {
    const reduced = useReducedMotion();
    const trackRef = useRef<HTMLDivElement>(null);
    const [active] = useActiveSlide(trackRef, media.length);
    const [viewerAt, setViewerAt] = useState<number | null>(null);
    const many = media.length > 1;

    const go = useCallback((i: number) => scrollToSlide(trackRef.current, Math.max(0, Math.min(media.length - 1, i)), !reduced), [media.length, reduced]);

    function onKey(e: KeyboardEvent) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
    }

    // Keep the stage on the same slide after the viewer closes
    function closeViewer(index: number) {
        setViewerAt(null);
        requestAnimationFrame(() => scrollToSlide(trackRef.current, index, false));
    }

    // Re-snap after a resize (e.g. phone rotation)
    useEffect(() => {
        const onResize = () => scrollToSlide(trackRef.current, active, false);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [active]);

    if (media.length === 0) {
        return (
            <div className="relative flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 lg:aspect-[4/3] lg:max-h-[460px] dark:from-blue-900/20 dark:to-blue-800/20">
                <Package className="h-20 w-20 text-blue-200" />
                {outOfStock && <OutOfStock />}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div tabIndex={0} onKeyDown={onKey} aria-roledescription="carousel" aria-label={`${name} photos`}
                className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:aspect-[4/3] lg:max-h-[460px] dark:from-blue-900/20 dark:to-blue-800/20">
                <div ref={trackRef}
                    className={cn('scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain', !reduced && 'scroll-smooth')}>
                    {media.map((m, i) => (
                        <Slide key={m.id} item={m} index={i} name={name} variant="stage" reduced={reduced}
                            active={i === active} near={Math.abs(i - active) <= 1}
                            onOpen={() => setViewerAt(i)} />
                    ))}
                </div>

                {outOfStock && <OutOfStock />}

                <button type="button" onClick={() => setViewerAt(active)} aria-label="Full screen"
                    className={cn(roundBtn, 'absolute left-3 top-3 z-20 h-8 w-8')}>
                    <Maximize2 className="h-4 w-4" />
                </button>

                {many && (
                    <>
                        <span className="absolute right-3 top-3 z-20 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
                            {active + 1} / {media.length}
                        </span>
                        {active > 0 && (
                            <button type="button" onClick={() => go(active - 1)} aria-label="Previous"
                                className={cn(roundBtn, 'absolute left-2 top-1/2 z-20 h-8 w-8 -translate-y-1/2 transition-opacity lg:left-3 lg:h-10 lg:w-10 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100')}>
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                        )}
                        {active < media.length - 1 && (
                            <button type="button" onClick={() => go(active + 1)} aria-label="Next"
                                className={cn(roundBtn, 'absolute right-2 top-1/2 z-20 h-8 w-8 -translate-y-1/2 transition-opacity lg:right-3 lg:h-10 lg:w-10 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100')}>
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        )}
                        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm">
                            {media.map((m, i) => (
                                <button key={m.id} type="button" onClick={() => go(i)} aria-label={`Go to item ${i + 1}`}
                                    className={cn('h-1.5 rounded-full bg-white transition-[width,opacity] duration-300', i === active ? 'w-5 opacity-100' : 'w-1.5 opacity-60')} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {many && (
                <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
                    {media.map((m, i) => (
                        <button key={m.id} type="button" onClick={() => go(i)} aria-label={`Show item ${i + 1}`}
                            className={cn('relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-gray-100 transition-opacity dark:bg-gray-800',
                                i === active ? 'opacity-100 ring-2 ring-blue-600' : 'opacity-60 hover:opacity-90')}>
                            {(m.type === 'image' ? m.url : m.poster_url) && (
                                <img src={(m.type === 'image' ? m.url : m.poster_url) as string} alt="" loading="lazy" className="h-full w-full object-cover" />
                            )}
                            {m.type === 'video' && (
                                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/55 py-0.5 text-[10px] text-white">
                                    <Play className="h-2.5 w-2.5 fill-white" /> {formatDuration(m.duration)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {viewerAt !== null && (
                <FullScreenViewer media={media} name={name} startAt={viewerAt} reduced={reduced} onClose={closeViewer} />
            )}
        </div>
    );
}

function OutOfStock() {
    return (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-gray-800">Out of Stock</span>
        </div>
    );
}

// ── full-screen viewer ───────────────────────────────────────────────────────

function FullScreenViewer({ media, name, startAt, reduced, onClose }: {
    media: GalleryMedia[]; name: string; startAt: number; reduced: boolean; onClose: (index: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [active, setActive] = useActiveSlide(trackRef, media.length, ready);
    const [zoom, setZoom] = useState<{ index: number; x: number; y: number } | null>(null);
    const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

    // Open on the tapped slide
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            scrollToSlide(trackRef.current, startAt, false);
            setActive(startAt);
            setReady(true);
        });
        return () => cancelAnimationFrame(id);
    }, [startAt, setActive]);

    const go = (i: number) => {
        setZoom(null);
        scrollToSlide(trackRef.current, Math.max(0, Math.min(media.length - 1, i)), !reduced);
    };

    // Double-tap (pointer timing — iOS doesn't fire dblclick reliably) toggles 200 % zoom at the tapped point
    function onImagePointerUp(index: number, e: PointerEvent<HTMLImageElement>) {
        const now = Date.now();
        const prev = lastTap.current;
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        if (!prev || now - prev.t > 300 || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 25) return;
        lastTap.current = null;
        if (zoom) { setZoom(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setZoom({ index, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(active); }}>
            <DialogContent
                className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 bg-black/95 p-0 sm:max-w-none [&>[data-slot=dialog-close]]:hidden"
                onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
                }}>
                <DialogTitle className="sr-only">{name} — photos</DialogTitle>

                <div ref={trackRef}
                    className={cn('scrollbar-none flex h-full', zoom ? 'overflow-hidden' : 'snap-x snap-mandatory overflow-x-auto overscroll-x-contain', !reduced && !zoom && 'scroll-smooth')}>
                    {media.map((m, i) => (
                        <Slide key={m.id} item={m} index={i} name={name} variant="viewer" reduced={reduced}
                            active={i === active} near={false}
                            zoom={zoom?.index === i ? zoom : null}
                            onImagePointerUp={(e) => onImagePointerUp(i, e)} />
                    ))}
                </div>

                <button type="button" onClick={() => onClose(active)} aria-label="Close"
                    className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
                    <X className="h-5 w-5" />
                </button>
                {media.length > 1 && (
                    <>
                        <span className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-white/15 px-3 py-0.5 text-sm text-white tabular-nums">
                            {active + 1} / {media.length}
                        </span>
                        {active > 0 && (
                            <button type="button" onClick={() => go(active - 1)} aria-label="Previous"
                                className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
                                <ChevronLeft className="h-6 w-6" />
                            </button>
                        )}
                        {active < media.length - 1 && (
                            <button type="button" onClick={() => go(active + 1)} aria-label="Next"
                                className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
                                <ChevronRight className="h-6 w-6" />
                            </button>
                        )}
                    </>
                )}
                <p className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 text-xs text-white/60">
                    {zoom ? 'Double-tap to zoom out' : 'Double-tap a photo to zoom'}
                </p>
            </DialogContent>
        </Dialog>
    );
}
