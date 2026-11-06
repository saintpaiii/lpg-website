import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AppLayout from '@/layouts/app-layout';
import CustomerLayout from '@/layouts/customer-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

/**
 * Outer layout of the /settings/* pages: customers stay inside the Customer Portal (its own sidebar),
 * every other role keeps the app layout with their own sidebar.
 */
export default function SettingsShell({ breadcrumbs, children }: { breadcrumbs?: BreadcrumbItem[]; children: ReactNode }) {
    const { auth } = usePage<SharedData>().props;

    if (auth.user?.role === 'customer') {
        return <CustomerLayout title="Settings">{children}</CustomerLayout>;
    }

    return <AppLayout breadcrumbs={breadcrumbs}>{children}</AppLayout>;
}
