import { Clock, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/** StoreHours::forCustomer() */
export type StoreHoursStatus = {
    open: boolean;
    always: boolean;
    label: string;
    opens_at: string | null;
    closed_today?: boolean;
    today?: string;
    closed_note?: string | null;
};

/** "Pick-up only — delivery not available right now" (J4: no rider / no delivery vehicle) */
export function PickupOnlyBadge({ className, short = false }: { className?: string; short?: boolean }) {
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300', className)}
            title="Pick-up only — delivery not available right now">
            <Store className="h-3 w-3 shrink-0" /> {short ? 'Pick-up only' : 'Pick-up only — delivery not available right now'}
        </span>
    );
}

/** "Open 24 hours" / "Open now · closes 6:00 PM" / "Closed · opens 8:00 AM tomorrow" */
export function StoreHoursBadge({ hours, className }: { hours?: StoreHoursStatus | null; className?: string }) {
    if (!hours) return null;
    return (
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium',
            hours.open ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400', className)}>
            <Clock className="h-3 w-3 shrink-0" /> {hours.label}
        </span>
    );
}

/** Amber note: the store is closed now (ordering is still allowed). */
export function ClosedNote({ note, className }: { note?: string | null; className?: string }) {
    if (!note) return null;
    return (
        <p className={cn('flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200', className)} role="note">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}
        </p>
    );
}
