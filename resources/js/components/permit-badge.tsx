import { cn } from '@/lib/utils';

export type PermitStatus = 'valid' | 'expiring' | 'expired' | 'no_date' | 'no_expiry';

/** Expiry status of a store permit: valid / expiring / expired / no date / does not expire. */
export default function PermitBadge({ p }: { p: { status: PermitStatus; expires_on: string | null; days_left: number | null } }) {
    const [cls, text] = {
        valid:     ['bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', `Valid until ${p.expires_on}`],
        expiring:  ['bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', p.days_left === 0 ? 'Expires today' : `Expires in ${p.days_left} ${p.days_left === 1 ? 'day' : 'days'}`],
        expired:   ['bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', `Expired on ${p.expires_on}`],
        no_date:   ['bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', 'No expiry date on file'],
        no_expiry: ['bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', 'Does not expire'],
    }[p.status];

    return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', cls)}>{text}</span>;
}
