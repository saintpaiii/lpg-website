import { Info } from 'lucide-react';
import { lowAccuracyNotice } from '@/lib/map';

/**
 * Amber notice for a rough "Use my current location" reading (computers without GPS).
 * The pin is placed but not used until the customer drags it or clicks "Use this spot".
 */
export default function LocationAccuracyNotice({ accuracyM, onConfirm }: { accuracyM: number; onConfirm: () => void }) {
    return (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex flex-1 items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {lowAccuracyNotice(accuracyM)}
            </span>
            <button type="button" onClick={onConfirm}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                Use this spot
            </button>
        </div>
    );
}
