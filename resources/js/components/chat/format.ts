const TZ = 'Asia/Manila';

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt   = new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const shortFmt  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
const longFmt   = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

/** YYYY-MM-DD in Manila time. */
export const dayKey = (iso: string) => dayKeyFmt.format(new Date(iso));

export const timeOf = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : '');

/** "Today", "Yesterday" or "Oct 3, 2026" (Manila). */
export function dayLabel(iso: string): string {
    const today = dayKey(new Date().toISOString());
    const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
    const k = dayKey(iso);
    return k === today ? 'Today' : k === yesterday ? 'Yesterday' : longFmt.format(new Date(iso));
}

/** Compact list time: "now", "2m", "3h", "Oct 5". */
export function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86_400 && dayKey(iso) === dayKey(new Date().toISOString())) return `${Math.floor(s / 3600)}h`;
    return shortFmt.format(new Date(iso));
}

export const peso = (n: number) =>
    '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
