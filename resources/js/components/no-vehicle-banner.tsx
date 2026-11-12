import { Link, usePage } from '@inertiajs/react';
import { Truck } from 'lucide-react';
import type { SharedData } from '@/types';

/** Store has no usable vehicle (with a fee): customers can't get delivery. Vehicles + Settings pages. */
export function NoVehicleBanner({ showLink = true }: { showLink?: boolean }) {
    // Vehicles is owner-only: staff with Settings access get the text without the link (403 page)
    const isOwner = usePage<SharedData>().props.auth.user.role === 'seller';
    return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Truck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
                Add a vehicle to offer delivery. Until then customers can only pick up (if pick-up is on).
                {showLink && isOwner && <> <Link href="/seller/vehicles" className="font-medium underline">Go to Vehicles</Link></>}
            </p>
        </div>
    );
}
