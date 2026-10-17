import { Link, usePage } from '@inertiajs/react';
import { IdCard } from 'lucide-react';
import type { SharedData } from '@/types';

/** Every rider page: a rider without an approved, unexpired driver's license can't make deliveries. */
export function RiderLicenseBanner() {
    const { rider_license } = usePage<SharedData>().props;
    if (!rider_license || rider_license.can_deliver) return null;
    const onDocuments = typeof window !== 'undefined' && window.location.pathname.startsWith('/rider/documents');

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2.5 text-sm font-medium text-white">
            <IdCard className="h-4 w-4 shrink-0" />
            <span className="flex-1">{rider_license.message}</span>
            {!onDocuments && (
                <Link href="/rider/documents" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                    My Documents
                </Link>
            )}
        </div>
    );
}
