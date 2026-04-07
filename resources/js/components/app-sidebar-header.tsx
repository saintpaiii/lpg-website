import { router, usePage } from '@inertiajs/react';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { NotificationBell } from '@/components/notification-bell';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import type { BreadcrumbItem as BreadcrumbItemType, SharedData } from '@/types';

type Props = {
    breadcrumbs?: BreadcrumbItemType[];
};

export function AppSidebarHeader({ breadcrumbs = [] }: Props) {
    const { auth } = usePage<SharedData>().props;
    const user = auth.user;
    const cleanup = useMobileNavigation();

    function getRoleBadge(): { label: string; className: string } {
        const sub = user.sub_role as string | null | undefined;

        if (user.role === 'platform_admin' || user.is_admin) {
            return { label: 'Admin', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300' };
        }
        if (user.role === 'platform_staff' || user.is_platform_staff) {
            const label = sub ? sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Staff';
            return { label, className: 'bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300' };
        }
        if (user.role === 'admin' || user.role === 'manager' || user.role === 'cashier') {
            const label = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            return { label, className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300' };
        }
        if (user.role === 'warehouse') {
            return { label: 'Warehouse', className: 'bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300' };
        }
        if (user.role === 'seller') {
            return { label: 'Owner', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300' };
        }
        if (user.role === 'seller_staff') {
            const label = sub ? sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Staff';
            const colors: Record<string, string> = {
                rider:     'bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300',
                cashier:   'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300',
                warehouse: 'bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300',
            };
            return { label, className: colors[sub ?? ''] ?? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300' };
        }
        if (user.role === 'rider') {
            return { label: 'Rider', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300' };
        }
        if (user.role === 'customer') {
            return { label: 'Customer', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300' };
        }
        const label = user.role ? (user.role as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'User';
        return { label, className: 'bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300' };
    }

    const badge = getRoleBadge();

    // Derive page title from last breadcrumb
    const pageTitle =
        breadcrumbs.length > 0
            ? breadcrumbs[breadcrumbs.length - 1].title
            : 'LPG Management';

    const [logoutOpen, setLogoutOpen] = useState(false);

    return (
        <>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border/50 bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            {/* Left: collapse toggle + page title */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground" />
                <Separator orientation="vertical" className="h-4 shrink-0" />
                <h1 className="truncate text-sm font-semibold text-foreground">
                    {pageTitle}
                </h1>
            </div>

            {/* Right: notifications + user + logout */}
            <div className="flex shrink-0 items-center gap-1">
                {/* Notification bell */}
                <NotificationBell />

                <Separator orientation="vertical" className="mx-1 h-4" />

                {/* User name + role badge */}
                <div className="hidden items-center gap-2 sm:flex">
                    <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
                        {user.name}
                    </span>
                    <Badge className={badge.className} variant="secondary">
                        {badge.label}
                    </Badge>
                </div>

                <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />

                {/* Logout button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    aria-label="Log out"
                    title="Log out"
                    onClick={() => { cleanup(); setLogoutOpen(true); }}
                >
                    <LogOut className="size-4" />
                </Button>
            </div>
        </header>

        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sign out?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You will be signed out of your account.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => router.post('/logout')}
                    >
                        Sign Out
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
