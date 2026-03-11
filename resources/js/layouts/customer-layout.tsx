import { Link, router, usePage } from '@inertiajs/react';
import { Flame, LayoutDashboard, LogOut, Package, Receipt, ShoppingCart, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
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
import { useFlashToast } from '@/hooks/use-flash-toast';
import type { SharedData } from '@/types';

type Props = {
    children: ReactNode;
    title?: string;
};

const navItems = [
    { label: 'My Dashboard', href: '/customer/dashboard', icon: LayoutDashboard },
    { label: 'Place Order',  href: '/customer/orders/create', icon: ShoppingCart },
    { label: 'My Orders',    href: '/customer/orders',  icon: Package },
    { label: 'My Invoices',  href: '/customer/invoices', icon: Receipt },
    { label: 'Profile',      href: '/customer/profile',  icon: User },
];

export default function CustomerLayout({ children, title }: Props) {
    const { auth } = usePage<SharedData>().props;
    useFlashToast();

    const [logoutOpen, setLogoutOpen] = useState(false);
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            {/* Top navbar */}
            <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link href="/customer/dashboard" className="flex items-center gap-2.5 font-bold text-base">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                                <Flame className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-slate-800 dark:text-white">
                                LPG <span className="text-blue-600">Customer</span>
                            </span>
                        </Link>

                        {/* Desktop nav links */}
                        <div className="hidden md:flex items-center gap-1">
                            {navItems.map(({ label, href, icon: Icon }) => {
                                const active = currentPath === href || currentPath.startsWith(href + '/');
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            active
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {label}
                                    </Link>
                                );
                            })}
                        </div>

                        {/* User + logout */}
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                                {auth.user?.name}
                            </span>
                            <button
                                onClick={() => setLogoutOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-gray-400 dark:hover:bg-red-900/20"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="hidden sm:block">Logout</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile nav */}
                <div className="md:hidden border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
                    <div className="flex px-4 py-2 gap-1 min-w-max">
                        {navItems.map(({ label, href, icon: Icon }) => {
                            const active = currentPath === href || currentPath.startsWith(href + '/');
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                        active
                                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'text-gray-600 hover:text-blue-600 dark:text-gray-400'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* Page content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {title && (
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{title}</h1>
                )}
                {children}
            </main>
            <Toaster richColors position="top-right" />

            {/* Logout confirmation */}
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
        </div>
    );
}
