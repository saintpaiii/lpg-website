import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One document line: label on the left (may wrap), badge + link kept together on the right.
 * On very narrow screens the right part drops under the label but stays right-aligned.
 */
export default function DocumentRow({ label, children, className }: { label: ReactNode; children?: ReactNode; className?: string }) {
    return (
        <div className={cn('grid grid-cols-1 items-center gap-x-3 gap-y-1 min-[400px]:grid-cols-[minmax(0,1fr)_auto]', className)}>
            <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap">{children}</span>
        </div>
    );
}

/** "View" link for a private document, or "Not uploaded". */
export function DocumentLink({ url, label = 'View' }: { url: string | null | undefined; label?: string }) {
    return url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline">
            {label} <ExternalLink className="h-3 w-3" />
        </a>
    ) : (
        <span className="text-sm italic text-muted-foreground">Not uploaded</span>
    );
}

/** Small uppercase section heading used in document cards. */
export function DocumentHeading({ children }: { children: ReactNode }) {
    return <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</p>;
}
