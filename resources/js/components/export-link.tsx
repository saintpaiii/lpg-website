import { FileDown, Lock } from 'lucide-react';
import { usePlan } from '@/hooks/use-plan';
import { openUpgrade } from '@/lib/plans';

/**
 * CSV / PDF download link. When the store's plan has no Export, it shows a lock and opens the upgrade dialog
 * instead (the export routes are locked server-side too).
 */
export function ExportLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
    const { has } = usePlan();

    if (!has('export')) {
        return (
            <button type="button" onClick={() => openUpgrade('export')} className={className} title="Export is available on the Pro plan">
                <Lock className="h-4 w-4 text-amber-500" /> {children}
            </button>
        );
    }

    return (
        <a href={href} className={className}>
            <FileDown className="h-4 w-4" /> {children}
        </a>
    );
}
