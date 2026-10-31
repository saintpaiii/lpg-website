import { useState } from 'react';
import { ReasonPicker } from '@/components/reason-picker';
import { Label } from '@/components/ui/label';

/** Options from config/delivery.php, passed as a page prop by the rider / seller delivery pages. */
export type FailOptions = {
    reasons: Record<string, string>;
    /** Reasons that don't need a redelivery date (customer refused, wrong item) */
    no_redelivery: string[];
    /** The range must start within this many days … */
    max_start_days: number;
    /** … and span at most this many days */
    max_range_days: number;
};

export type FailValues = {
    fail_reason: string;
    /** Estimated redelivery range, YYYY-MM-DD */
    redeliver_on: string;
    redeliver_until: string;
    notes: string;
};

export const emptyFailValues: FailValues = { fail_reason: '', redeliver_on: '', redeliver_until: '', notes: '' };

/** Shown as "Redelivery expected: …" to the customer and as a badge for the store */
export type FailInfo = {
    reason: string;
    reason_label: string | null;
    notes: string | null;
    redeliver_on: string | null;
    redeliver_until: string | null;
    /** "Oct 31 – Nov 2" (or "Oct 31") */
    range_label: string | null;
    /** "Redeliver Oct 31–Nov 2" */
    short: string | null;
    failed_at: string | null;
};

// ── Dates (YYYY-MM-DD, Asia/Manila — the server's rule) ─────────────────────────

const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/** YYYY-MM-DD plus n days (calendar arithmetic in UTC, so no DST/timezone drift). */
export function addDays(ymd: string, n: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const shortDate = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** "Oct 31 – Nov 2", or "Oct 31" when both ends are the same day */
export const rangeLabel = (from: string, until: string) =>
    !from ? '' : !until || until === from ? shortDate(from) : `${shortDate(from)} – ${shortDate(until)}`;

type Choice = 'tomorrow' | 'three' | 'week' | 'custom';

/** Quick choices: from tomorrow until today + N days */
const QUICK: { key: Exclude<Choice, 'custom'>; label: string; untilDays: number }[] = [
    { key: 'tomorrow', label: 'Tomorrow',      untilDays: 1 },
    { key: 'three',    label: 'Within 3 days', untilDays: 3 },
    { key: 'week',     label: 'Within a week', untilDays: 7 },
];

export const quickRange = (untilDays: number, today = manilaToday()) =>
    ({ redeliver_on: addDays(today, 1), redeliver_until: addDays(today, untilDays) });

export const needsRedeliveryDate = (options: FailOptions, reason: string) => !!reason && !options.no_redelivery.includes(reason);

/** Client-side check matching Delivery::failureRules (the server validates again). */
export function failValuesComplete(options: FailOptions, v: FailValues): boolean {
    if (!v.fail_reason) return false;
    if (needsRedeliveryDate(options, v.fail_reason)) {
        const today = manilaToday();
        if (!v.redeliver_on || !v.redeliver_until) return false;
        if (v.redeliver_on < today || v.redeliver_on > addDays(today, options.max_start_days)) return false;
        if (v.redeliver_until < v.redeliver_on || v.redeliver_until > addDays(v.redeliver_on, options.max_range_days)) return false;
    }
    // Every reason has a detail; "Other" (reason or detail) needs typed text
    if (!v.notes.trim()) return false;
    return true;
}

const dateInput = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Reason dropdown, "When can we deliver again?" range (hidden for refused / wrong item) and notes. */
export default function DeliveryFailFields({ options, values, onChange, errors = {} }: {
    options: FailOptions;
    values: FailValues;
    onChange: (patch: Partial<FailValues>) => void;
    errors?: Partial<Record<keyof FailValues, string>>;
}) {
    const today = manilaToday();
    const [choice, setChoice] = useState<Choice | null>(null);
    const showDate = needsRedeliveryDate(options, values.fail_reason);

    // Custom range limits (same as the server)
    const fromMax  = addDays(today, options.max_start_days);
    const untilMin = values.redeliver_on || today;
    const untilMax = addDays(values.redeliver_on || today, options.max_range_days);
    const badRange = !!values.redeliver_on && !!values.redeliver_until
        && (values.redeliver_until < values.redeliver_on || values.redeliver_until > untilMax);

    function pick(c: Choice) {
        setChoice(c);
        const q = QUICK.find((x) => x.key === c);
        if (q) onChange(quickRange(q.untilDays, today));
        // "Pick dates" keeps whatever is filled in so it can be adjusted
        else if (!values.redeliver_on) onChange(quickRange(1, today));
    }

    return (
        <div className="grid gap-3">
            {/* Reason ▸ Details (matched to the reason) ▸ "Other" = type your own */}
            <ReasonPicker
                context="failed_delivery"
                reason={values.fail_reason}
                notes={values.notes}
                onChange={(next) => onChange({ fail_reason: next.reason, notes: next.notes })}
                reasonLabel="Why didn't it push through?"
                maxLength={500}
                rows={2}
                placeholder="Describe what happened…"
                errors={{ reason: errors.fail_reason, notes: errors.notes }}
            />

            {showDate && (
                <div className="grid gap-2">
                    <Label>When can we deliver again? *</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Redelivery estimate">
                        {[...QUICK.map(({ key, label }) => ({ key: key as Choice, label })), { key: 'custom' as Choice, label: 'Pick dates' }].map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={choice === key}
                                onClick={() => pick(key)}
                                className={`min-h-10 rounded-md border px-2 text-sm font-medium transition-colors ${choice === key
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-input hover:bg-muted'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {choice === 'custom' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1">
                                <Label htmlFor="redeliver_on" className="text-xs">From</Label>
                                <input id="redeliver_on" type="date" min={today} max={fromMax} value={values.redeliver_on}
                                    onChange={(e) => onChange({ redeliver_on: e.target.value })} className={dateInput} />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="redeliver_until" className="text-xs">To</Label>
                                <input id="redeliver_until" type="date" min={untilMin} max={untilMax} value={values.redeliver_until}
                                    onChange={(e) => onChange({ redeliver_until: e.target.value })} className={dateInput} />
                            </div>
                        </div>
                    )}

                    {values.redeliver_on && values.redeliver_until && !badRange && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Estimated: <span className="font-semibold">{rangeLabel(values.redeliver_on, values.redeliver_until)}</span>
                        </p>
                    )}
                    {badRange && (
                        <p className="text-xs text-red-500">
                            {values.redeliver_until < values.redeliver_on
                                ? 'The "To" date cannot be before the "From" date.'
                                : `The range can be at most ${options.max_range_days} days.`}
                        </p>
                    )}
                    {errors.redeliver_on && <p className="text-xs text-red-500">{errors.redeliver_on}</p>}
                    {errors.redeliver_until && <p className="text-xs text-red-500">{errors.redeliver_until}</p>}
                </div>
            )}
        </div>
    );
}
