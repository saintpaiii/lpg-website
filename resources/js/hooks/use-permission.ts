import { usePage } from '@inertiajs/react';
import type { SharedData } from '@/types';

/**
 * Returns a `can(permission)` checker and the raw permissions array.
 * Uses the permissions array shared by the server via Inertia.
 */
export function usePermission() {
    const { auth } = usePage<SharedData>().props;
    const permissions: string[] = auth.permissions ?? [];

    const can = (permission: string): boolean => permissions.includes(permission);

    const canAny = (...perms: string[]): boolean => perms.some((p) => can(p));

    const isAdmin = auth.user.role === 'admin' || auth.user.is_admin;
    const isStaff = ['admin', 'manager', 'cashier', 'warehouse'].includes(auth.user.role as string) || auth.user.is_admin;

    return { can, canAny, permissions, isAdmin, isStaff };
}
