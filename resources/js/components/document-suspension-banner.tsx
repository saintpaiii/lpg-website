import { Link, usePage } from '@inertiajs/react';
import { FileWarning } from 'lucide-react';
import type { SharedData } from '@/types';

/**
 * Seller pages: red while the store is hidden for an expired permit; amber when a permit
 * expired or expires within 7 days. Only the owner gets the button (Store Documents is owner-only).
 */
export function DocumentSuspensionBanner() {
    const { auth } = usePage<SharedData>().props;
    const store = auth.store;
    if (!store) return null;

    const isOwner = auth.user.role === 'seller';
    const alert = store.documents_alert;

    if (store.documents_suspended) {
        return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2.5 text-sm font-medium text-white">
                <FileWarning className="h-4 w-4 shrink-0" />
                <span className="flex-1">Your store is hidden from customers because a permit expired. Upload the renewed document.</span>
                {isOwner && (
                    <Link href="/seller/documents" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                        Store Documents
                    </Link>
                )}
            </div>
        );
    }

    if (!alert) return null;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <FileWarning className="h-4 w-4 shrink-0" />
            <span className="flex-1">
                {alert.status === 'expired' ? `${alert.label} expired on ${alert.date}.` : `${alert.label} expires on ${alert.date}.`}
            </span>
            {isOwner && (
                <Link href="/seller/documents" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                    Store Documents
                </Link>
            )}
        </div>
    );
}
