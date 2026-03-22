import { Link, router, usePage } from '@inertiajs/react';
import { Clock, Flame, LayoutDashboard, LogOut, Package, Receipt, Search, ShoppingBag, ShoppingCart, Store, User, XCircle } from 'lucide-react';
import { useRef, useState, type ReactNode, type FormEvent } from 'react';
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
    { label: 'Browse',       href: '/customer/products',  icon: ShoppingBag },
    { label: 'My Orders',    href: '/customer/orders',    icon: Package },
    { label: 'My Invoices',  href: '/customer/invoices',  icon: Receipt },
    { label: 'Profile',      href: '/customer/profile',   icon: User },
];

export default function CustomerLayout({ children, title }: Props) {
    const { auth, cart_count } = usePage<SharedData>().props;
    const isSeller = auth.user.role === 'seller';
    const sellerApp = auth.seller_application;
    useFlashToast();

    const [logoutOpen, setLogoutOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

    function handleSearch(e: FormEvent) {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.get('/customer/products', { search: searchQuery.trim() });
            setSearchOpen(false);
            setSearchQuery('');
        }
    }

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

                        {/* User + actions */}
                        <div className="flex items-center gap-1">
                            {/* Seller portal link */}
                            {isSeller ? (
                                <Link
                                    href="/seller/dashboard"
                                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors dark:text-emerald-400 dark:bg-emerald-900/20"
                                    title="Switch to Seller Dashboard"
                                >
                                    <Store className="h-4 w-4" />
                                    <span className="hidden md:block">Seller Dashboard</span>
                                </Link>
                            ) : sellerApp?.status === 'pending' ? (
                                <Link
                                    href="/customer/become-seller"
                                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors dark:text-amber-400 dark:bg-amber-900/20"
                                    title="Application under review"
                                >
                                    <Clock className="h-4 w-4" />
                                    <span className="hidden md:block">Application Pending</span>
                                </Link>
                            ) : sellerApp?.status === 'rejected' ? (
                                <Link
                                    href="/customer/become-seller"
                                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors dark:text-red-400 dark:bg-red-900/20"
                                    title="Application rejected — reapply"
                                >
                                    <XCircle className="h-4 w-4" />
                                    <span className="hidden md:block">Application Rejected</span>
                                </Link>
                            ) : (
                                <Link
                                    href="/customer/become-seller"
                                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors dark:text-blue-400 dark:bg-blue-900/20"
                                    title="Apply to become a seller"
                                >
                                    <Store className="h-4 w-4" />
                                    <span className="hidden md:block">Start Selling</span>
                                </Link>
                            )}
                            {/* Search button */}
                            <button
                                onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchRef.current?.focus(), 50); }}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
                                title="Search products"
                            >
                                <Search className="h-4 w-4" />
                            </button>
                            {/* Cart icon */}
                            <Link
                                href="/customer/cart"
                                className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
                                title="Cart"
                            >
                                <ShoppingCart className="h-4 w-4" />
                                {cart_count > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                                        {cart_count > 9 ? '9+' : cart_count}
                                    </span>
                                )}
                            </Link>
                            <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 px-2">
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

            {/* Search overlay */}
            {searchOpen && (
                <div className="sticky top-16 z-30 bg-white border-b border-gray-200 shadow-md dark:bg-gray-900 dark:border-gray-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search products by name, brand, or weight…"
                                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                                Search
                            </button>
                            <button
                                type="button"
                                onClick={() => setSearchOpen(false)}
                                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400"
                            >
                                Cancel
                            </button>
                        </form>
                    </div>
                </div>
            )}

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
