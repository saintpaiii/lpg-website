import { Link, usePage } from '@inertiajs/react';
import { MapPin } from 'lucide-react';
import type { SharedData } from '@/types';

/** Approved stores without a map pin: delivery fees can't use distance and staff can't clock in. */
export function StoreLocationBanner() {
    const { auth } = usePage<SharedData>().props;
    const store = auth.store;
    if (!store || store.status !== 'approved' || store.has_location !== false) return null;

    const isOwner = auth.user.role === 'seller';

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="flex-1">Pin your store's location so delivery fees are exact and your staff can clock in.</span>
            {isOwner && (
                <Link href="/seller/settings" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                    Pin now
                </Link>
            )}
        </div>
    );
}
