import { router, usePage } from '@inertiajs/react';
import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';
import { useIsMobile } from '@/hooks/use-mobile';
import type { SharedData } from '@/types';

export function NavUser() {
    const { auth } = usePage<SharedData>().props;
    const user = auth.user;
    const { state } = useSidebar();
    const isMobile = useIsMobile();
    const isCollapsed = state === 'collapsed';

    function getRoleBadge(): { label: string; className: string } {
        const sub = user.sub_role as string | null | undefined;

        if (user.role === 'platform_admin' || user.is_admin) {
            return { label: 'Admin', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
        }
        if (user.role === 'platform_staff' || user.is_platform_staff) {
            const label = sub ? sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Staff';
            return { label, className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' };
        }
        if (user.role === 'admin' || user.role === 'manager' || user.role === 'cashier') {
            const label = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            return { label, className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
        }
        if (user.role === 'warehouse') {
            return { label: 'Warehouse', className: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' };
        }
        if (user.role === 'seller') {
            return { label: 'Owner', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
        }
        if (user.role === 'seller_staff') {
            const label = sub ? sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Staff';
            return { label, className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' };
        }
        if (user.role === 'rider') {
            return { label: 'Rider', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' };
        }
        if (user.role === 'customer') {
            return { label: 'Customer', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
        }
        const label = user.role ? (user.role as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'User';
        return { label, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
    }

    const badge = getRoleBadge();
    const [logoutOpen, setLogoutOpen] = useState(false);

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="group data-[state=open]:bg-sidebar-accent"
                                data-test="sidebar-menu-button"
                            >
                                <UserInfo user={user} />
                                {!isCollapsed && (
                                    <>
                                        <Badge
                                            variant="secondary"
                                            className={`ml-1 shrink-0 text-[10px] ${badge.className}`}
                                        >
                                            {badge.label}
                                        </Badge>
                                        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
                                    </>
                                )}
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            align="end"
                            side={
                                isMobile
                                    ? 'bottom'
                                    : state === 'collapsed'
                                      ? 'left'
                                      : 'bottom'
                            }
                        >
                            <UserMenuContent user={user} onLogoutRequest={() => setLogoutOpen(true)} />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

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
