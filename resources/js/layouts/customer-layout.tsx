import WebsiteProblemSidebar from '@/components/reports/website-problem-sidebar';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Bell,
    ChevronRight,
    Clock,
    Flag,
    Flame,
    Lock,
    LogOut,
    Package,
    Receipt,
    RotateCcw,
    Search,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Star,
    Store,
    User,
    MapPinned,
    Navigation,
    X,
    XCircle,
    MessageSquare,
} from 'lucide-react';
import { useUnreadMessages } from '@/components/chat/use-unread-messages';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { InstallAppBanner } from '@/components/install-app-banner';
import LegalUpdateDialog from '@/components/legal-update-dialog';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { NotificationBell } from '@/components/notification-bell';
import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
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
import type { NavItem, SharedData } from '@/types';
import { Toaster } from 'sonner';

type Props = {
    children: ReactNode;
    title?: string;
};

export default function CustomerLayout({ children, title }: Props) {
    const { auth, cart_count } = usePage<SharedData>().props;
    const isSeller = auth.user.role === 'seller';
    const isAdmin  = ['platform_admin', 'admin'].includes(auth.user.role);
    const sellerApp = auth.seller_application;
    useFlashToast();

    const idStatus     = auth.user.id_verification_status;
    const hasSubmittedId = !!(auth.user as any).valid_id_path;
    const isVerified   = idStatus === 'verified';
    // Customers can't shop until an admin approves their ID (sellers/admins are never locked)
    const shopLocked   = auth.user.role === 'customer' && !isVerified;
    const LOCK_REASON  = 'Verify your ID first';
    const lockProps    = shopLocked ? { disabled: true, disabledReason: LOCK_REASON } : {};
    // Brand-new customer (never verified, no orders): the history pages are empty and blocked too.
    // Customers whose verification was revoked keep their history pages (has_customer_history = true).
    const lockedNewcomer = shopLocked && auth.has_customer_history === false;
    const [lockedOpen, setLockedOpen] = useState(false);

    const [logoutOpen, setLogoutOpen]         = useState(false);
    const [searchOpen, setSearchOpen]         = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [searchQuery, setSearchQuery]       = useState('');
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

    const unreadMessages = useUnreadMessages('customer');

    // ── Sidebar nav items ───────────────────────────────────────────────────
    const verifyNavItem: NavItem = {
        title: 'Verify ID',
        href:  '/customer/id-verification',
        icon:  ShieldCheck,
        badge: !isVerified ? (idStatus === 'pending' && hasSubmittedId ? 'Pending' : '!') : undefined,
    };

    const mainNavItems: NavItem[] = [
        // Until verified, Verify ID sits at the top of the menu
        ...(shopLocked ? [verifyNavItem] : []),
        { title: 'Browse',      href: '/customer/products',       icon: ShoppingBag, ...lockProps },
        { title: 'Find a Store', href: '/customer/find-store',    icon: Navigation,  ...lockProps },
        { title: 'My Orders',   href: '/customer/orders',         icon: Package     },
        { title: 'Messages',    href: '/customer/messages',       icon: MessageSquare,
          ...(unreadMessages > 0 ? { badge: unreadMessages > 99 ? '99+' : String(unreadMessages), badgeTone: 'unread' as const } : {}) },
        { title: 'My Loyalty',  href: '/customer/loyalty',        icon: Star        },
        { title: 'My Invoices', href: '/customer/invoices',       icon: Receipt     },
        { title: 'My Refunds',  href: '/customer/refunds',        icon: RotateCcw   },
        { title: 'My Reports',  href: '/customer/reports',        icon: Flag        },
    ];

    const accountNavItems: NavItem[] = [
        ...(shopLocked ? [] : [verifyNavItem]),
        { title: 'Profile', href: '/customer/profile', icon: User },
        { title: 'My Addresses', href: '/customer/addresses', icon: MapPinned },
    ];

    // Seller / become-seller link
    let sellerNavItem: NavItem | null = null;
    if (isSeller) {
        sellerNavItem = { title: 'Seller Dashboard', href: '/seller/dashboard', icon: Store };
    } else if (sellerApp?.status === 'pending') {
        sellerNavItem = { title: 'Application Pending', href: '/customer/become-seller', icon: Clock as any };
    } else if (sellerApp?.status === 'rejected') {
        sellerNavItem = { title: 'Reapply as Seller', href: '/customer/become-seller', icon: XCircle as any };
    } else {
        sellerNavItem = { title: 'Start Selling', href: '/customer/become-seller', icon: Store, ...lockProps };
    }

    // Derive page title from nav items or the prop
    const pageTitle = title ??
        [...mainNavItems, ...accountNavItems].find(i => currentPath === i.href || currentPath.startsWith(i.href + '/'))?.title ??
        'Customer Portal';

    // Newcomer menu: what they can use now, and everything else in one collapsed, locked group
    const newcomerNavItems: NavItem[] = [
        verifyNavItem,
        { title: 'Profile', href: '/customer/profile', icon: User },
        { title: 'My Addresses', href: '/customer/addresses', icon: MapPinned },
    ];
    const lockedNavItems: NavItem[] = [
        ...mainNavItems.filter((i) => i !== verifyNavItem),
        ...(sellerNavItem ? [sellerNavItem] : []),
    ].map(({ badge, badgeTone, ...i }) => ({ ...i, disabled: true, disabledReason: LOCK_REASON }));
    const onVerifyPage = currentPath.startsWith('/customer/id-verification');

    return (
        <AppShell variant="sidebar">
            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <Sidebar collapsible="icon" variant="inset">
                {/* Logo */}
                <SidebarHeader>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg" asChild>
                                <Link href={shopLocked ? '/customer/id-verification' : '/customer/products'} prefetch>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
                                        <Flame className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                                        <p className="text-sm font-semibold truncate leading-tight">LPG Customer</p>
                                        <p className="text-xs text-muted-foreground">Customer Portal</p>
                                    </div>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>

                {/* Nav links */}
                <SidebarContent>
                    {lockedNewcomer && (
                        <>
                            <NavMain items={newcomerNavItems} />
                            <WebsiteProblemSidebar portal="customer" />
                            <SidebarSeparator className="mx-3 my-1" />
                            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
                                <button
                                    type="button"
                                    onClick={() => setLockedOpen((v) => !v)}
                                    aria-expanded={lockedOpen}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent"
                                >
                                    <Lock className="size-3.5 shrink-0" />
                                    <span className="flex-1 text-left">Available after verification</span>
                                    <ChevronRight className={`size-3.5 shrink-0 transition-transform ${lockedOpen ? 'rotate-90' : ''}`} />
                                </button>
                                {lockedOpen && <NavMain items={lockedNavItems} />}
                            </div>
                        </>
                    )}

                    {/* Show all items for customers; only Browse for admins previewing */}
                    {!lockedNewcomer && <NavMain items={isAdmin ? mainNavItems.slice(0, 1) : mainNavItems} />}
                    {!isAdmin && !lockedNewcomer && <WebsiteProblemSidebar portal="customer" />}

                    {!isAdmin && !lockedNewcomer && (
                        <>
                            <SidebarSeparator className="mx-3 my-1" />
                            <NavMain items={accountNavItems} />
                            {sellerNavItem && (
                                <>
                                    <SidebarSeparator className="mx-3 my-1" />
                                    <NavMain items={[sellerNavItem]} />
                                </>
                            )}
                        </>
                    )}

                    {isAdmin && (
                        <NavMain items={[{ title: '← Back to Admin', href: '/admin/dashboard', icon: null as any }]} />
                    )}
                </SidebarContent>

                {/* User footer */}
                <SidebarFooter>
                    <SidebarSeparator />
                    <NavUser />
                </SidebarFooter>
            </Sidebar>

            {/* ── Main content area ─────────────────────────────────────────── */}
            <AppContent variant="sidebar" className="overflow-x-hidden">
                {/* Top header bar */}
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border/50 bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    {/* Left: sidebar toggle + page title */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground" />
                        <Separator orientation="vertical" className="h-4 shrink-0" />
                        <h1 className="truncate text-sm font-semibold text-foreground">{pageTitle}</h1>
                    </div>

                    {/* Right: search, cart, notifications, logout */}
                    <div className="flex shrink-0 items-center gap-1">
                        {/* Search toggle (hidden for brand-new customers) */}
                        {!isAdmin && !lockedNewcomer && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-40"
                                title={shopLocked ? LOCK_REASON : 'Search products'}
                                disabled={shopLocked}
                                onClick={() => {
                                    setSearchOpen(v => !v);
                                    setTimeout(() => searchRef.current?.focus(), 50);
                                }}
                            >
                                <Search className="size-4" />
                            </Button>
                        )}

                        {/* Notification bell */}
                        <NotificationBell />

                        {/* Cart */}
                        {!isAdmin && shopLocked && !lockedNewcomer && (
                            <span
                                className="relative inline-flex h-8 w-8 cursor-not-allowed items-center justify-center text-muted-foreground opacity-40"
                                title={LOCK_REASON}
                                aria-disabled="true"
                            >
                                <ShoppingCart className="size-4" />
                                <Lock className="absolute bottom-1 right-1 size-2.5" />
                            </span>
                        )}
                        {!isAdmin && !shopLocked && (
                            <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                                <Link href="/customer/cart" title="Cart">
                                    <ShoppingCart className="size-4" />
                                    {cart_count > 0 && (
                                        <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                                            {cart_count > 9 ? '9+' : cart_count}
                                        </span>
                                    )}
                                </Link>
                            </Button>
                        )}

                        <Separator orientation="vertical" className="mx-1 h-4" />

                        {/* Logout */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-600"
                            title="Log out"
                            onClick={() => setLogoutOpen(true)}
                        >
                            <LogOut className="size-4" />
                        </Button>
                    </div>
                </header>

                {/* Search bar (drops below header) */}
                {searchOpen && !shopLocked && (
                    <div className="border-b bg-background px-4 py-3">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search products by name, brand, or weight…"
                                className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                                Search
                            </button>
                            <button
                                type="button"
                                onClick={() => setSearchOpen(false)}
                                className="px-3 py-2 rounded-lg border border-input text-sm text-muted-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                        </form>
                    </div>
                )}

                {/* ID verification banner */}
                {!isAdmin && auth.user.role === 'customer' && !isVerified && !bannerDismissed && !onVerifyPage && (
                    <div className={`border-b px-4 py-2.5 ${
                        idStatus === 'rejected'
                            ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                            : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
                    }`}>
                        <div className="flex items-center gap-3">
                            <ShieldCheck className={`h-4 w-4 shrink-0 ${idStatus === 'rejected' ? 'text-red-500' : 'text-amber-500'}`} />
                            <p className={`flex-1 text-xs font-medium ${idStatus === 'rejected' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                                {idStatus === 'rejected'
                                    ? 'Your identity verification was rejected. Please re-upload your documents to place orders.'
                                    : idStatus === 'pending' && hasSubmittedId
                                    ? 'Your identity is being verified. Orders will be enabled once approved.'
                                    : '⚠️ Your identity is not verified. Verify now to start ordering.'}
                            </p>
                            <Link
                                href="/customer/id-verification"
                                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-white ${
                                    idStatus === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                            >
                                {idStatus === 'rejected' ? 'Re-upload' : idStatus === 'pending' && hasSubmittedId ? 'View Status' : 'Verify Now'}
                            </Link>
                            <button
                                onClick={() => setBannerDismissed(true)}
                                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                aria-label="Dismiss"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Page content */}
                <div className="flex flex-1 flex-col gap-4 p-6 pb-20 md:pb-6">
                    {children}
                </div>

                {/* Mobile bottom tab bar */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-sidebar-border pb-safe">
                    <div className="flex items-center justify-around h-14">
                        {(lockedNewcomer ? [
                            { label: 'Verify ID',     href: '/customer/id-verification', icon: ShieldCheck },
                            { label: 'Addresses',     href: '/customer/addresses',       icon: MapPinned   },
                            { label: 'Notifications', href: '/customer/notifications',   icon: Bell        },
                            { label: 'Profile',       href: '/customer/profile',         icon: User        },
                        ] : [
                            shopLocked
                                ? { label: 'Verify ID', href: '/customer/id-verification', icon: ShieldCheck }
                                : { label: 'Browse',    href: '/customer/products',        icon: ShoppingBag },
                            { label: 'Orders',  href: '/customer/orders',   icon: Package     },
                            { label: 'Messages', href: '/customer/messages', icon: MessageSquare },
                            { label: 'Cart',    href: '/customer/cart',     icon: ShoppingCart, locked: shopLocked },
                            { label: 'Profile', href: '/customer/profile',  icon: User        },
                        ]).map(({ label, href, icon: Icon, locked }: { label: string; href: string; icon: typeof User; locked?: boolean }) => {
                            const active = currentPath === href || currentPath.startsWith(href + '/');
                            if (locked) {
                                return (
                                    <span
                                        key={href}
                                        title={LOCK_REASON}
                                        aria-disabled="true"
                                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground opacity-40"
                                    >
                                        <div className="relative">
                                            <Icon className="h-5 w-5" />
                                            <Lock className="absolute -bottom-0.5 -right-1.5 h-3 w-3" />
                                        </div>
                                        <span className="text-[10px] font-medium">{label}</span>
                                    </span>
                                );
                            }
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                                        active ? 'text-blue-600' : 'text-muted-foreground'
                                    }`}
                                >
                                    <div className="relative">
                                        <Icon className="h-5 w-5" />
                                        {label === 'Messages' && unreadMessages > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-blue-600 px-0.5 text-white text-[9px] font-bold flex items-center justify-center">
                                                {unreadMessages > 9 ? '9+' : unreadMessages}
                                            </span>
                                        )}
                                        {label === 'Cart' && cart_count > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                                                {cart_count > 9 ? '9+' : cart_count}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-medium">{label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            </AppContent>

            {/* Toasts */}
            <Toaster richColors position="top-right" toastOptions={{ duration: 3000 }} />

            {/* Updated Terms / Privacy Policy must be accepted to continue */}
            <LegalUpdateDialog />

            {/* PWA install banner */}
            <InstallAppBanner />

            {/* Logout dialog */}
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
        </AppShell>
    );
}
