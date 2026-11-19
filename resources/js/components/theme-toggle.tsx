import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppearance, type Appearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Appearance; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
];

/**
 * J10 — Light / Dark / System, one tap away (user menu, customer top bar). The phone's own setting is "System"; this
 * stores the choice like Settings → Appearance does.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
    const { appearance, updateAppearance } = useAppearance();

    if (compact) {
        const next: Appearance = appearance === 'light' ? 'dark' : appearance === 'dark' ? 'system' : 'light';
        const Current = OPTIONS.find((o) => o.value === appearance)?.icon ?? Monitor;
        return (
            <button type="button" onClick={() => updateAppearance(next)} title={`Theme: ${appearance} (tap to change)`} aria-label={`Theme: ${appearance}. Change theme`}
                className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', className)}>
                <Current className="size-4" />
            </button>
        );
    }

    return (
        <div role="radiogroup" aria-label="Theme" className={cn('grid grid-cols-3 gap-1 rounded-md bg-muted p-1', className)}>
            {OPTIONS.map(({ value, icon: Icon, label }) => (
                <button key={value} type="button" role="radio" aria-checked={appearance === value}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateAppearance(value); }}
                    className={cn('flex min-h-8 items-center justify-center gap-1 rounded px-1.5 text-xs font-medium transition-colors',
                        appearance === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <Icon className="size-3.5" /> {label}
                </button>
            ))}
        </div>
    );
}
