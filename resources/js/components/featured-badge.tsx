import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "Featured" — stores on the Premium plan or the free trial. */
export function FeaturedBadge({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                className,
            )}
            title="Featured store"
        >
            <Star className="h-3 w-3 fill-current" /> Featured
        </span>
    );
}
