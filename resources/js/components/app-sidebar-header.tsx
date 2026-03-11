import { router, usePage } from '@inertiajs/react';
import { Bell, LogOut, PanelLeft } from 'lucide-react';
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
    const isAdmin = user.role === 'admin' || user.is_admin;
    const cleanup = useMobileNavigation();

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
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
                    aria-label="Notifications"
                >
                    <Bell className="size-4" />
                    {/* Unread dot — wire to real count later */}
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
                </Button>

                <Separator orientation="vertical" className="mx-1 h-4" />

                {/* User name + role badge */}
                <div className="hidden items-center gap-2 sm:flex">
                    <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
                        {user.name}
                    </span>
                    <Badge
                        className={
                            isAdmin
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300'
                        }
                        variant="secondary"
                    >
                        {isAdmin ? 'Admin' : 'Rider'}
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
