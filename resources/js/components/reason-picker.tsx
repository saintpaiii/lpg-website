import { useId, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { ChoiceSelect } from '@/components/choice-select';
import { NOTE_CATALOG, REASON_CATALOG } from '@/data/reason-catalog';
import type { NoteContext, ReasonContext, ReasonOption } from '@/data/reason-catalog';
import { cn } from '@/lib/utils';

/**
 * One pattern for every reason / notes box:  Reason ▾ ▸ Details ▾ (only the details of THAT reason, first one
 * pre-selected) ▸ a textarea only for "Other — type my own". Optional notes use NotePicker (one grouped dropdown).
 * Lists live in data/reason-catalog.ts.
 *
 *  - ReasonPicker      — the form has a reason field AND a notes field (reason = option value/key, notes = detail text)
 *  - ReasonTextPicker  — the form has ONE text field ("Reason — Detail", or the typed text for Other)
 *  - NotePicker        — optional note (no reason on the server)
 */

const OTHER = '__other';
const NONE = '__none';
const OTHER_LABEL = 'Other — type my own';

export const reasonTextareaClass =
    'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30';

/** Server value for a reason (differs only when several reasons share one, e.g. refund reasons). */
export function reasonSubmitValue(context: ReasonContext, value: string): string {
    return REASON_CATALOG[context].find((o) => o.value === value)?.submit ?? value;
}

export function reasonLabelOf(context: ReasonContext, value: string): string | undefined {
    return REASON_CATALOG[context].find((o) => o.value === value)?.label;
}

function focusSoon(ref: React.RefObject<HTMLTextAreaElement | null>) {
    requestAnimationFrame(() => ref.current?.focus());
}

type FieldsProps = {
    options: ReasonOption[];
    /** Chosen option value ('' = none yet) */
    reason: string;
    /** Chosen detail text, OTHER, or '' */
    detail: string;
    typed: string;
    onReason: (option: ReasonOption) => void;
    onDetail: (detail: string) => void;
    onTyped: (text: string) => void;
    reasonLabel: string;
    detailsLabel: string;
    required: boolean;
    maxLength?: number;
    rows: number;
    placeholder?: string;
    textareaClassName?: string;
    reasonError?: string;
    notesError?: string;
    disabled?: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

/** Reason ▾ / Details ▾ / textarea — shared by ReasonPicker and ReasonTextPicker. */
function ReasonFields({ textareaRef, ...p }: FieldsProps) {
    const uid = useId();
    const option = p.options.find((o) => o.value === p.reason);
    const hasDetails = !!option && option.details.length > 0;
    const showText = !!option && (!hasDetails || p.detail === OTHER);

    return (
        <div className="grid gap-3">
            <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-reason`}>
                    {p.reasonLabel}{p.required && <span className="text-red-500"> *</span>}
                </Label>
                <ChoiceSelect
                    id={`${uid}-reason`} label={p.reasonLabel} value={p.reason} disabled={p.disabled} placeholder="Choose a reason"
                    groups={[{ items: p.options.map((o) => ({ value: o.value, label: o.label })) }]}
                    onValueChange={(v) => { const o = p.options.find((x) => x.value === v); if (o) p.onReason(o); }}
                />
                {p.reasonError && <p className="text-xs text-red-500">{p.reasonError}</p>}
            </div>

            {hasDetails && (
                <div className="grid gap-1.5">
                    <Label htmlFor={`${uid}-detail`}>{p.detailsLabel}</Label>
                    <ChoiceSelect
                        id={`${uid}-detail`} label={p.detailsLabel} value={p.detail} onValueChange={p.onDetail} disabled={p.disabled}
                        placeholder="Choose a detail"
                        groups={[{ items: [...option!.details.map((d) => ({ value: d, label: d })), { value: OTHER, label: OTHER_LABEL }] }]}
                    />
                </div>
            )}

            {showText && (
                <div className="grid gap-1">
                    <Label htmlFor={`${uid}-text`} className="sr-only">Type your own</Label>
                    <textarea
                        ref={textareaRef}
                        id={`${uid}-text`}
                        value={p.typed}
                        onChange={(e) => p.onTyped(e.target.value)}
                        rows={p.rows}
                        maxLength={p.maxLength}
                        required
                        disabled={p.disabled}
                        placeholder={p.placeholder ?? 'Type your own…'}
                        aria-invalid={!!p.notesError || undefined}
                        className={p.textareaClassName ?? reasonTextareaClass}
                    />
                    <div className="flex items-start justify-between gap-2">
                        {p.notesError ? <p className="text-xs text-red-500">{p.notesError}</p> : <span className="text-[11px] text-muted-foreground">Required</span>}
                        {p.maxLength && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{p.typed.length}/{p.maxLength}</span>}
                    </div>
                </div>
            )}
            {!showText && p.notesError && <p className="text-xs text-red-500">{p.notesError}</p>}
        </div>
    );
}

type CommonProps = {
    context: ReasonContext;
    reasonLabel?: string;
    detailsLabel?: string;
    required?: boolean;
    maxLength?: number;
    rows?: number;
    placeholder?: string;
    textareaClassName?: string;
    disabled?: boolean;
};

/** Reason + notes as two fields: reason = option value (or key), notes = detail text / typed text. */
export function ReasonPicker({ context, reason, notes, onChange, errors = {}, reasonLabel = 'Reason', detailsLabel = 'Details', required = true, rows = 3, ...rest }: CommonProps & {
    reason: string;
    notes: string;
    onChange: (next: { reason: string; notes: string }) => void;
    errors?: { reason?: string; notes?: string };
}) {
    const options = REASON_CATALOG[context];
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const option = options.find((o) => o.value === reason);
    const detail = !option || option.details.length === 0 ? '' : option.details.includes(notes) ? notes : OTHER;

    return (
        <ReasonFields
            {...rest}
            options={options} reason={reason} detail={detail} typed={notes} rows={rows}
            reasonLabel={reasonLabel} detailsLabel={detailsLabel} required={required}
            reasonError={errors.reason} notesError={errors.notes} textareaRef={textareaRef}
            onReason={(o) => {
                onChange({ reason: o.value, notes: o.details[0] ?? '' });
                if (o.details.length === 0) focusSoon(textareaRef);
            }}
            onDetail={(d) => {
                onChange({ reason, notes: d === OTHER ? '' : d });
                if (d === OTHER) focusSoon(textareaRef);
            }}
            onTyped={(t) => onChange({ reason, notes: t })}
        />
    );
}

type TextState = { reason: string; detail: string; typed: string; emitted: string };
const EMPTY_TEXT: TextState = { reason: '', detail: '', typed: '', emitted: '' };

/** "Reason — Detail"; typed text for Other; '' until complete */
function composeText(options: ReasonOption[], s: TextState): string {
    const o = options.find((x) => x.value === s.reason);
    if (!o) return '';
    if (o.details.length === 0) return s.typed.trim() ? s.typed : '';
    if (s.detail === OTHER) return s.typed.trim() ? `${o.label} — ${s.typed}` : '';
    return s.detail ? `${o.label} — ${s.detail}` : '';
}

/** Reason ▸ Details for a form with ONE text field. Emits '' until a reason (and text for Other) is complete. */
export function ReasonTextPicker({ context, value, onChange, error, reasonLabel = 'Reason', detailsLabel = 'Details', required = true, rows = 3, maxLength, ...rest }: CommonProps & {
    value: string;
    onChange: (text: string) => void;
    error?: string;
}) {
    const options = REASON_CATALOG[context];
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [state, setState] = useState<TextState>(EMPTY_TEXT);
    // The parent cleared the field (form reset) → start over; text set from outside → shown as "Other"
    const s: TextState = state.emitted === value
        ? state
        : value === '' ? EMPTY_TEXT : { reason: options.find((o) => o.details.length === 0)?.value ?? '', detail: OTHER, typed: value, emitted: value };

    function update(next: Omit<TextState, 'emitted'>) {
        let text = composeText(options, { ...next, emitted: '' });
        if (maxLength) text = text.slice(0, maxLength);
        setState({ ...next, emitted: text });
        onChange(text);
    }

    return (
        <ReasonFields
            {...rest}
            options={options} reason={s.reason} detail={s.detail} typed={s.typed} rows={rows} maxLength={maxLength}
            reasonLabel={reasonLabel} detailsLabel={detailsLabel} required={required}
            notesError={error} textareaRef={textareaRef}
            onReason={(o) => {
                update({ reason: o.value, detail: o.details[0] ?? '', typed: '' });
                if (o.details.length === 0) focusSoon(textareaRef);
            }}
            onDetail={(d) => {
                update({ reason: s.reason, detail: d, typed: d === OTHER ? '' : s.typed });
                if (d === OTHER) focusSoon(textareaRef);
            }}
            onTyped={(t) => update({ reason: s.reason, detail: s.detail, typed: t })}
        />
    );
}

/** Optional note: one grouped "Add a note (optional)" dropdown; "Other — type my own" opens a textarea; "None" clears. */
export function NotePicker({ context, value, onChange, label, required = false, maxLength, rows = 3, placeholder, textareaClassName, error, disabled }: {
    context: NoteContext;
    value: string;
    onChange: (text: string) => void;
    /** Shown above the dropdown (omit when the page already has a label) */
    label?: string;
    /** e.g. a required safety note: no "None" option */
    required?: boolean;
    maxLength?: number;
    rows?: number;
    placeholder?: string;
    textareaClassName?: string;
    error?: string;
    disabled?: boolean;
}) {
    const groups = NOTE_CATALOG[context];
    const uid = useId();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [otherOpen, setOtherOpen] = useState(false);
    const isPreset = groups.some((g) => g.items.includes(value));
    const showText = !isPreset && (otherOpen || value !== '');
    const selected = isPreset ? value : showText ? OTHER : '';

    function pick(v: string) {
        if (v === NONE) { setOtherOpen(false); onChange(''); return; }
        if (v === OTHER) { setOtherOpen(true); onChange(''); focusSoon(textareaRef); return; }
        setOtherOpen(false);
        onChange(maxLength ? v.slice(0, maxLength) : v);
    }

    return (
        <div className="grid gap-1.5">
            {label && (
                <Label htmlFor={`${uid}-note`}>{label}{required && <span className="text-red-500"> *</span>}</Label>
            )}
            <ChoiceSelect
                id={`${uid}-note`}
                label={label ?? (required ? 'Choose a note' : 'Add a note')}
                value={selected}
                onValueChange={pick}
                disabled={disabled}
                placeholder={required ? 'Choose a note' : 'Add a note (optional)'}
                groups={[
                    ...(!required ? [{ items: [{ value: NONE, label: 'None', muted: true }] }] : []),
                    ...groups.map((g) => ({ label: g.group, items: g.items.map((item) => ({ value: item, label: item })) })),
                    { label: 'Other', items: [{ value: OTHER, label: OTHER_LABEL }] },
                ]}
            />
            {showText && (
                <textarea
                    ref={textareaRef}
                    aria-label="Type your own note"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    maxLength={maxLength}
                    disabled={disabled}
                    required={required}
                    placeholder={placeholder ?? 'Type your own…'}
                    className={cn(textareaClassName ?? reasonTextareaClass)}
                />
            )}
            {(error || (showText && maxLength)) && (
                <div className="flex items-start justify-between gap-2">
                    {error ? <p className="text-xs text-red-500">{error}</p> : <span />}
                    {showText && maxLength && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{value.length}/{maxLength}</span>}
                </div>
            )}
        </div>
    );
}
