import { cn } from '@/lib/utils';

const COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-cyan-600', 'bg-orange-600', 'bg-teal-600'];

/** Store logo, or a colored circle with the store's initials when there is no logo. */
export default function StoreAvatar({ name, logoUrl, size = 32, className }: { name: string; logoUrl?: string | null; size?: number; className?: string }) {
    const style = { width: size, height: size };

    if (logoUrl) {
        return <img src={logoUrl} alt={`${name} logo`} style={style} className={cn('shrink-0 rounded-full border object-cover', className)} />;
    }

    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
    const color = COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

    return (
        <span style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.4)) }} aria-hidden
            className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', color, className)}>
            {initials}
        </span>
    );
}
