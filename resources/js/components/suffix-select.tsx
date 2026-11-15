import { cn } from '@/lib/utils';

/** Name suffixes (same list as User::SUFFIXES on the server). '' = none. */
export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

/** First + middle + last + suffix, e.g. "Juan Santos Dela Cruz Jr." (same rule as User::composeName). */
export function composeName(first?: string | null, middle?: string | null, last?: string | null, suffix?: string | null): string {
    return [first, middle, last, suffix].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * "Suffix (optional)" dropdown shown next to Last name: None, Jr., Sr., II, III, IV, V.
 * A native select (works the same on phones), styled like the text inputs.
 */
export function SuffixSelect({ id = 'suffix', value, onChange, className, disabled }: {
    id?: string;
    value: string | null | undefined;
    onChange: (value: string) => void;
    className?: string;
    disabled?: boolean;
}) {
    return (
        <select
            id={id}
            name="suffix"
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
                'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
                className,
            )}
        >
            <option value="">None</option>
            {NAME_SUFFIXES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
    );
}
