import { Link } from '@inertiajs/react';
import { cn } from '@/lib/utils';

/** "Reports" / "Website problems" tabs on the customer and rider My Reports pages. */
export default function ReportTabs({ base, tab }: { base: string; tab: string }) {
    const tabs = [
        { key: 'reports', label: 'Reports', href: base },
        { key: 'website', label: 'Website problems', href: `${base}?tab=website` },
    ];
    return (
        <div className="flex gap-1 overflow-x-auto border-b scrollbar-none [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            {tabs.map((t) => (
                <Link key={t.key} href={t.href} preserveState
                    className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    {t.label}
                </Link>
            ))}
        </div>
    );
}
