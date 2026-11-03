import { Check, ChevronDown } from 'lucide-react';
import { useSyncExternalStore, useState } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type ChoiceItem = { value: string; label: string; muted?: boolean };
export type ChoiceGroup = { label?: string; items: ChoiceItem[] };

const PHONE_QUERY = '(max-width: 639px)';

function subscribe(cb: () => void) {
    if (typeof window === 'undefined') return () => {};
    const mql = window.matchMedia(PHONE_QUERY);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
}

/** Phones (< 640 px) get a bottom sheet instead of a popup list. */
function useIsPhone(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(PHONE_QUERY).matches,
        () => false,
    );
}

/**
 * A roomy dropdown: on desktop / tablet a Select whose list flips up when there's no room below and is
 * as wide as the field; on phones a bottom sheet with big tappable rows. Used by every ReasonPicker field.
 */
export function ChoiceSelect({ id, label, value, onValueChange, placeholder, groups, disabled }: {
    id?: string;
    /** Field label — the sheet title on phones */
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder: string;
    groups: ChoiceGroup[];
    disabled?: boolean;
}) {
    const isPhone = useIsPhone();
    const [open, setOpen] = useState(false);
    const selectedLabel = groups.flatMap((g) => g.items).find((i) => i.value === value)?.label;

    if (isPhone) {
        return (
            <>
                <button
                    id={id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    className={cn(
                        'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none',
                        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
                        !selectedLabel && 'text-muted-foreground',
                    )}
                >
                    <span className="line-clamp-1">{selectedLabel ?? placeholder}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-50" />
                </button>
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-2xl p-0">
                        <SheetHeader className="border-b px-4 pt-3 pb-3">
                            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
                            <SheetTitle className="pr-8 text-base">{label}</SheetTitle>
                            <SheetDescription className="sr-only">{placeholder}</SheetDescription>
                        </SheetHeader>
                        <div className="overflow-y-auto overscroll-contain px-2 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            {groups.map((g, gi) => (
                                <div key={g.label ?? gi} role="group" aria-label={g.label}>
                                    {g.label && (
                                        <p className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
                                    )}
                                    {g.items.map((item) => {
                                        const selected = item.value === value;
                                        return (
                                            <button
                                                key={item.value}
                                                type="button"
                                                onClick={() => { onValueChange(item.value); setOpen(false); }}
                                                aria-pressed={selected}
                                                className={cn(
                                                    'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] active:bg-accent',
                                                    selected ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : item.muted && 'text-muted-foreground',
                                                )}
                                            >
                                                <span className="flex-1">{item.label}</span>
                                                {selected && <Check className="size-5 shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </SheetContent>
                </Sheet>
            </>
        );
    }

    return (
        <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger id={id} className="w-full data-[size=default]:h-11">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent
                position="popper"
                sideOffset={6}
                avoidCollisions
                collisionPadding={16}
                className="w-[var(--radix-select-trigger-width)] max-h-[min(60vh,420px,var(--radix-select-content-available-height))]"
            >
                {groups.map((g, gi) => (
                    <SelectGroup key={g.label ?? gi}>
                        {g.label && (
                            <SelectLabel className="mt-1 px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-foreground/70 uppercase">{g.label}</SelectLabel>
                        )}
                        {g.items.map((item) => (
                            <SelectItem key={item.value} value={item.value} className={cn('py-2.5 text-sm', item.muted && 'text-muted-foreground')}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    );
}
