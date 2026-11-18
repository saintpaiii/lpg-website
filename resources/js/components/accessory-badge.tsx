import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Product::ACCESSORY_CATEGORIES (J7) */
export const ACCESSORY_CATEGORIES: Record<string, string> = {
    regulator: 'Regulator',
    hose: 'Hose',
    clamp: 'Hose clamp',
    stove: 'Stove',
    burner: 'Burner',
    valve_seal: 'Valve seal',
    other: 'Other',
};

/** Small "Accessory · Regulator" badge on product cards, the product page and the cart (J7). */
export function AccessoryBadge({ category, className }: { category?: string | null; className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', className)}
            data-testid="accessory-badge">
            <Wrench className="h-3 w-3" /> Accessory{category ? ` · ${ACCESSORY_CATEGORIES[category] ?? category}` : ''}
        </span>
    );
}
