import { Link, usePage } from '@inertiajs/react';
import { Flame, Home, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SharedData } from '@/types';

const PERM_ROUTES: [string, string][] = [
    ['dashboard.view',     '/admin/dashboard'],
    ['users.view',         '/admin/users'],
    ['stores.view',        '/admin/stores'],
    ['verifications.view', '/admin/verifications'],
    ['invoices.view',      '/admin/invoices'],
    ['reports.view',       '/admin/reports'],
    ['dss.view',           '/admin/dss'],
    ['settings.view',      '/admin/settings'],
];

function homeUrl(role: string, subRole: string | null | undefined, permissions: string[]): string {
    if (role === 'customer') return '/customer/dashboard';
    if (role === 'seller') return '/seller/dashboard';
    if (role === 'seller_staff') {
        if (subRole === 'rider') return '/rider/deliveries';
        return '/seller/dashboard';
    }
    if (role === 'platform_staff') {
        for (const [perm, url] of PERM_ROUTES) {
            if (permissions.includes(perm)) return url;
        }
        return '/admin/welcome';
    }
    // platform_admin, admin, manager, cashier, warehouse, rider (legacy)
    return '/admin/dashboard';
}

export default function NotFound() {
    const { auth } = usePage<SharedData>().props;
    const href = auth?.user
        ? homeUrl(auth.user.role, auth.user.sub_role, auth.permissions)
        : '/';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
                <Flame className="h-8 w-8 text-white" />
            </div>

            <div className="flex items-center gap-3 mb-6">
                <SearchX className="h-10 w-10 text-gray-300" />
                <span className="text-7xl font-black text-gray-200 dark:text-gray-700">404</span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Page Not Found
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-8">
                The page you're looking for doesn't exist or has been moved.
            </p>

            <div className="flex items-center gap-3">
                <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href={href}>
                        <Home className="mr-1.5 h-4 w-4" />
                        Go Home
                    </Link>
                </Button>
                <Button variant="outline" onClick={() => history.back()}>
                    Go Back
                </Button>
            </div>

            <p className="mt-12 text-xs text-gray-400 dark:text-gray-600">
                LPG Distribution Management System &bull; Cavite
            </p>
        </div>
    );
}
