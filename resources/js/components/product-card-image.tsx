import { Images, Package, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card picture: the cover, cross-fading to the 2nd photo on desktop hover (loaded on first hover),
 * with small "photos" / "Video" badges. Extra overlays (promo, out of stock) go in children.
 */
export default function ProductCardImage({ imageUrl, hoverUrl, name, photoCount = 0, hasVideo = false, className, children }: {
    imageUrl: string | null;
    hoverUrl?: string | null;
    name: string;
    photoCount?: number;
    hasVideo?: boolean;
    className?: string;   // height, e.g. "h-40"
    children?: ReactNode;
}) {
    const [hovered, setHovered] = useState(false);   // load the 2nd photo only once someone hovers

    return (
        <div className={cn('group/card relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20', className)}
            onMouseEnter={() => setHovered(true)}>
            {imageUrl ? (
                <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full w-full items-center justify-center"><Package className="h-10 w-10 text-blue-300" /></div>
            )}
            {hoverUrl && hovered && (
                <img src={hoverUrl} alt="" aria-hidden
                    className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 md:block motion-reduce:transition-none" />
            )}
            {(photoCount > 1 || hasVideo) && (
                <div className="pointer-events-none absolute right-1.5 bottom-1.5 z-10 flex gap-1">
                    {photoCount > 1 && (
                        <span className="flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
                            <Images className="h-3 w-3" /> {photoCount}
                        </span>
                    )}
                    {hasVideo && (
                        <span className="flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
                            <Play className="h-3 w-3 fill-white" /> Video
                        </span>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}
