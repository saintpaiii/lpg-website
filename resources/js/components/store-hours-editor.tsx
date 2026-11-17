import { Label } from '@/components/ui/label';

export type DayHours = { open: string; close: string; closed: boolean; all_day: boolean };
export type WeekHours = Record<number, DayHours>;

export const DAYS: { n: number; name: string }[] = [
    { n: 1, name: 'Monday' }, { n: 2, name: 'Tuesday' }, { n: 3, name: 'Wednesday' }, { n: 4, name: 'Thursday' },
    { n: 5, name: 'Friday' }, { n: 6, name: 'Saturday' }, { n: 7, name: 'Sunday' },
];

/** A week filled with one time range (default 08:00–18:00), used when the owner leaves "Open 24 hours". */
export function defaultWeek(open = '08:00', close = '18:00'): WeekHours {
    return Object.fromEntries(DAYS.map((d) => [d.n, { open, close, closed: false, all_day: false }]));
}

/** Server week (StoreHours::normalise, keys "1".."7") → editor week */
export function toWeek(hours: Record<string, DayHours> | null | undefined): WeekHours {
    const base = defaultWeek();
    if (!hours) return base;
    for (const d of DAYS) {
        const v = hours[d.n] ?? hours[String(d.n)];
        if (v) base[d.n] = { open: v.open, close: v.close, closed: !!v.closed, all_day: !!v.all_day };
    }
    return base;
}

/** Flatten for FormData: always_open + opening_hours[n][open|close|closed|all_day] */
export function appendHours(fd: FormData, alwaysOpen: boolean, week: WeekHours) {
    fd.append('always_open', alwaysOpen ? '1' : '0');
    if (alwaysOpen) return;
    for (const d of DAYS) {
        const v = week[d.n];
        fd.append(`opening_hours[${d.n}][open]`, v.open);
        fd.append(`opening_hours[${d.n}][close]`, v.close);
        fd.append(`opening_hours[${d.n}][closed]`, v.closed ? '1' : '0');
        fd.append(`opening_hours[${d.n}][all_day]`, v.all_day ? '1' : '0');
    }
}

const inputCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50';

/**
 * Store hours (J4): "Open 24 hours" (default) or a time range per day, a day can be closed or open all day.
 * Used in Seller Settings and both store application forms. Times are Philippine time.
 */
export default function StoreHoursEditor({ alwaysOpen, week, onChange, idPrefix = 'hours' }: {
    alwaysOpen: boolean;
    week: WeekHours;
    onChange: (alwaysOpen: boolean, week: WeekHours) => void;
    idPrefix?: string;
}) {
    const setDay = (n: number, patch: Partial<DayHours>) => onChange(alwaysOpen, { ...week, [n]: { ...week[n], ...patch } });
    const copyMonday = () => onChange(alwaysOpen, Object.fromEntries(DAYS.map((d) => [d.n, { ...week[1] }])));

    return (
        <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm" htmlFor={`${idPrefix}-always`}>
                <input id={`${idPrefix}-always`} type="checkbox" className="h-4 w-4" checked={alwaysOpen} onChange={(e) => onChange(e.target.checked, week)} />
                <span><strong>Open 24 hours</strong>, every day</span>
            </label>
            {!alwaysOpen && (
                <div className="space-y-2">
                    {DAYS.map((d) => {
                        const v = week[d.n];
                        return (
                            <div key={d.n} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[6.5rem_auto_auto_auto]">
                                <Label htmlFor={`${idPrefix}-${d.n}-open`} className="font-medium">{d.name}</Label>
                                <div className="flex items-center gap-1.5">
                                    <input id={`${idPrefix}-${d.n}-open`} type="time" aria-label={`${d.name} opens`} className={inputCls} value={v.open}
                                        disabled={v.closed || v.all_day} onChange={(e) => setDay(d.n, { open: e.target.value })} />
                                    <span className="text-muted-foreground">–</span>
                                    <input type="time" aria-label={`${d.name} closes`} className={inputCls} value={v.close}
                                        disabled={v.closed || v.all_day} onChange={(e) => setDay(d.n, { close: e.target.value })} />
                                </div>
                                <label className="col-start-2 flex items-center gap-1.5 text-xs sm:col-start-auto">
                                    <input type="checkbox" checked={v.all_day} onChange={(e) => setDay(d.n, { all_day: e.target.checked, closed: e.target.checked ? false : v.closed })} /> All day
                                </label>
                                <label className="col-start-2 flex items-center gap-1.5 text-xs sm:col-start-auto">
                                    <input type="checkbox" checked={v.closed} onChange={(e) => setDay(d.n, { closed: e.target.checked, all_day: e.target.checked ? false : v.all_day })} /> Closed
                                </label>
                            </div>
                        );
                    })}
                    <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={copyMonday}>Use Monday's hours for every day</button>
                    <p className="text-xs text-muted-foreground">Philippine time. A closing time before the opening time runs past midnight. Customers can still order while you're closed — delivery and pick-up start when you open.</p>
                </div>
            )}
        </div>
    );
}
