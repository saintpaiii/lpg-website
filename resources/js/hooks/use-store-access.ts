import { usePage } from '@inertiajs/react';
import type { SharedData } from '@/types';

/**
 * "Can this user open that store-portal page?" — the same rules as the sidebar (app-sidebar.tsx):
 * the store owner opens everything; staff need the module's permission (view or full access);
 * owner-only pages are never links for staff. Use it to show a link as plain text (or hide a button)
 * instead of sending staff to a 403 page.
 */
const OWNER_ONLY = [
    '/seller/vehicles', '/seller/staff', '/seller/payroll/settings', '/seller/plan', '/seller/revenue',
    '/seller/coupons', '/seller/loyalty/settings', '/seller/documents', '/seller/staff-documents',
];

// Longest prefix first (payroll/settings is matched above, before payroll)
const MODULE_OF: [string, string][] = [
    ['/seller/dashboard', 'dashboard.view'],
    ['/seller/products', 'products.view'],
    ['/seller/reviews', 'products.view'],
    ['/seller/orders', 'orders.view'],
    ['/seller/refunds', 'orders.view'],
    ['/seller/messages', 'messages.view'],
    ['/seller/deliveries', 'deliveries.view'],
    ['/seller/invoices', 'invoices.view'],
    ['/seller/inventory', 'inventory.view'],
    ['/seller/attendance', 'attendance.view'],
    ['/seller/payroll', 'payroll.view'],
    ['/seller/customer-reports', 'customer_reports.view'],
    ['/seller/reports', 'reports.view'],
    ['/seller/dss', 'dss.view'],
    ['/seller/loyalty/customers', 'loyalty_customers.view'],
    ['/seller/settings', 'settings.view'],
];

const startsWithPath = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?');

export function useStoreAccess() {
    const { auth } = usePage<SharedData>().props;
    const permissions: string[] = auth.permissions ?? [];
    const isOwner = auth.user.role === 'seller';

    const canOpen = (href: string): boolean => {
        if (isOwner) return true;
        if (auth.user.role !== 'seller_staff') return false;
        if (OWNER_ONLY.some((p) => startsWithPath(href, p))) return false;
        const hit = MODULE_OF.find(([p]) => startsWithPath(href, p));
        if (!hit) return true; // my-documents, my-payslips, my-attendance, website-reports … (own pages)
        const [, perm] = hit;
        // Customer Reports: view or manage (same as the sidebar)
        if (perm === 'customer_reports.view') return permissions.includes(perm) || permissions.includes('customer_reports.manage');
        return permissions.includes(perm);
    };

    return { isOwner, canOpen };
}

/** Platform side, same rules as the admin sidebar: platform admins open everything, platform staff need the permission. */
const ADMIN_PERMS: [string, string[]][] = [
    ['/admin/dashboard', ['dashboard.view']],
    ['/admin/users', ['users.view']],
    ['/admin/stores', ['stores.view']],
    ['/admin/verifications', ['verifications.view']],
    ['/admin/store-documents', ['verifications.view', 'stores.view']],
    ['/admin/customers', ['customers.view']],
    ['/admin/invoices', ['invoices.view']],
    ['/admin/reports', ['reports.view']],
    ['/admin/dss', ['dss.view']],
    ['/admin/settings', ['settings.view']],
];

export function useAdminAccess() {
    const { auth } = usePage<SharedData>().props;
    const permissions: string[] = auth.permissions ?? [];
    const isPlatformAdmin = auth.user.role === 'platform_admin' || auth.user.role === 'admin';

    const canOpen = (href: string): boolean => {
        if (isPlatformAdmin) return true;
        const hit = ADMIN_PERMS.find(([p]) => startsWithPath(href, p));
        // Everything else (subscriptions, login history, user reports, refunds, legal …) is platform-admin only
        return hit ? hit[1].some((perm) => permissions.includes(perm)) : false;
    };

    return { isPlatformAdmin, canOpen };
}
