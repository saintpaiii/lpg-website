import { Link, usePage } from '@inertiajs/react';
import { AlertTriangle } from 'lucide-react';
import type { SharedData } from '@/types';

/** Shown on every seller page while the store is suspended for unpaid commission. */
export function CommissionSuspensionBanner() {
    const { auth } = usePage<SharedData>().props;
    const store = auth.store;

    if (!store?.commission_suspended) return null;

    const owed = (store.commission_owed ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    const isOwner = auth.user.role === 'seller';

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2.5 text-sm font-medium text-white">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
                Your store is suspended due to unpaid commission. Pay {owed} to reactivate — your products are hidden from customers until then.
            </span>
            {isOwner && (
                <Link href="/seller/commission" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                    Pay now
                </Link>
            )}
        </div>
    );
}
