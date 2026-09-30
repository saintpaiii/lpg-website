/** Trust score colour bands: <30 red · 30–50 orange · 50–70 green · >70 emerald. */
export function trustColor(score: number): { bar: string; text: string } {
    if (score < 30) return { bar: 'bg-red-500', text: 'text-red-600' };
    if (score < 50) return { bar: 'bg-orange-500', text: 'text-orange-600' };
    if (score <= 70) return { bar: 'bg-green-500', text: 'text-green-600' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
}

export default function TrustScoreBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
    const pct = Math.max(0, Math.min(100, score));
    const { bar, text } = trustColor(pct);

    return (
        <div className="flex items-center gap-2" title={`Trust score ${pct.toFixed(0)}/100`}>
            <div className={`flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
                <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`tabular-nums font-semibold ${text} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{pct.toFixed(0)}/100</span>
        </div>
    );
}

/** "3 days ago", "2 months ago", or "Never". */
export function timeAgo(iso: string | null): string {
    if (!iso) return 'Never';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
}

export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
