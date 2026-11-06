import WebsiteProblemSidebar from '@/components/reports/website-problem-sidebar';
import { useUnreadMessages } from '@/components/chat/use-unread-messages';
import { Link, usePage } from '@inertiajs/react';
import {
    Award,
    BadgeCheck,
    BadgeDollarSign,
    BarChart3,
    Bell,
    Flag,
    RefreshCcw,
    Brain,
    CalendarDays,
    Car,
    ClipboardList,
    Crown,
    History,
    Image,
    LayoutDashboard,
    LineChart,
    Package,
    Receipt,
    Settings,
    Settings2,
    ShieldAlert,
    ShoppingBag,
    ShoppingCart,
    Star,
    Store,
    TicketPercent,
    Truck,
    TrendingUp,
    User,
    UserCog,
    Users,
    Warehouse,
    MessageSquare,
    ScrollText,
    FileCheck,
    FileText,
    IdCard,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { usePermission } from '@/hooks/use-permission';
import { FEATURE_INFO, planNeedsAttention } from '@/lib/plans';
import { usePlan } from '@/hooks/use-plan';
import { badgeProps, useSidebarBadges } from '@/hooks/use-sidebar-badges';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import type { NavItem, SharedData } from '@/types';

export function AppSidebar() {
    const { props: { auth, plan }, url } = usePage<SharedData>();
    // My Plan badge: amber "!" in the last 3 days, red "!" once the plan has ended
    const planState = planNeedsAttention(plan);
    const planBadge = planState === 'expired'
        ? { badge: '!', badgeTone: 'alert' as const }
        : planState === 'ending' ? { badge: '!', badgeTone: 'warning' as const } : {};
    const { can } = usePermission();
    // Feature not on the store's plan → lock + "Pro" / "Premium" tag (opens the upgrade dialog)
    const { has } = usePlan();
    const lock = (feature: string) => (has(feature) ? {} : { lockedPlan: FEATURE_INFO[feature]?.plan ?? 'Pro', lockedFeature: feature });

    const role        = auth.user.role;
    const subRole     = auth.user.sub_role as string | null | undefined;
    // The menu follows the CURRENT portal: a rider who also has store roles uses both ("Switch to Store Portal")
    const riderUser   = role === 'rider' || (role === 'seller_staff' && subRole === 'rider');
    const inStorePortal = url.startsWith('/seller');
    const isRider     = riderUser && !(inStorePortal && auth.can_switch_portal);
    const isSeller    = role === 'seller' || (role === 'seller_staff' && !isRider);
    const isPlatformAdmin = role === 'platform_admin' || role === 'admin';
    // Store owners / staff never get /admin/* links (their permission names overlap with platform ones)
    const adminArea   = role !== 'seller' && role !== 'seller_staff';

    // Chat unread badge (seller/staff inbox or rider inbox)
    const chatPortal = isRider ? 'rider' : isSeller && !riderUser && (role === 'seller' || can('messages.view')) ? 'seller' : null;
    const unreadMessages = useUnreadMessages(chatPortal);
    const unreadBadge = unreadMessages > 0
        ? { badge: unreadMessages > 99 ? '99+' : String(unreadMessages), badgeTone: 'unread' as const }
        : {};

    // New / updated since the last visit, per section (SidebarBadgeService) — keys like "seller.orders"
    const sb = useSidebarBadges();

    // ── Seller portal navigation ──────────────────────────────────────────────
    if (isSeller) {
        const isActualSeller = role === 'seller'; // store owner sees everything
        // Riders in the store portal keep their own chat / reports in the rider app
        const notRider       = !riderUser;
        const selfClock      = !isActualSeller && !riderUser && auth.self_clock !== false;

        const sellerItems: NavItem[] = [
            (isActualSeller || can('dashboard.view'))   && { title: 'Dashboard',    href: '/seller/dashboard',  icon: LayoutDashboard },
            (isActualSeller || can('products.view'))    && { title: 'Products',     href: '/seller/products',   icon: Package         },
            (isActualSeller || can('orders.view'))      && { title: 'Orders',       href: '/seller/orders',     icon: ShoppingCart, ...badgeProps(sb['seller.orders']) },
            (isActualSeller || (can('messages.view') && notRider)) && { title: 'Messages',     href: '/seller/messages',   icon: MessageSquare, ...unreadBadge },
            (isActualSeller || can('deliveries.view'))  && { title: 'Deliveries',   href: '/seller/deliveries', icon: Truck, ...badgeProps(sb['seller.deliveries']) },
            isActualSeller                              && { title: 'Vehicles',     href: '/seller/vehicles',   icon: Car             },
            (isActualSeller || can('invoices.view'))    && { title: 'Invoices',     href: '/seller/invoices',   icon: Receipt         },
            (isActualSeller || can('inventory.view'))   && { title: 'Inventory',    href: '/seller/inventory',  icon: Warehouse       },
            isActualSeller                              && { title: 'Staff',        href: '/seller/staff',      icon: UserCog, ...badgeProps(sb['seller.staff']) },
            (isActualSeller || can('attendance.view'))  && { title: 'Attendance',   href: '/seller/attendance',      icon: CalendarDays      },
            selfClock                                  && { title: 'My Attendance',href: '/seller/my-attendance',  icon: CalendarDays      },
            (!isActualSeller)                          && { title: 'My Documents', href: '/seller/my-documents',   icon: IdCard            },
            (!isActualSeller)                          && { title: 'My Payslips',  href: '/seller/my-payslips',    icon: ClipboardList     },
            (isActualSeller || can('payroll.view'))     && { title: 'Payroll', href: '/seller/payroll', icon: BadgeDollarSign, ...lock('payroll'),
                // Not highlighted on Payroll Settings (its own item below)
                isActive: url.startsWith('/seller/payroll') && !url.startsWith('/seller/payroll/settings') },
            isActualSeller                             && { title: 'Payroll Settings', href: '/seller/payroll/settings', icon: Settings2, ...lock('payroll') },
            isActualSeller                             && { title: 'My Plan',      href: '/seller/plan',           icon: Crown, ...planBadge },
            isActualSeller                             && { title: 'Revenue',      href: '/seller/revenue',        icon: TrendingUp        },
            (isActualSeller || can('orders.view'))     && { title: 'Refunds',      href: '/seller/refunds',        icon: RefreshCcw, ...badgeProps(sb['seller.refunds']) },
            (isActualSeller || ((can('customer_reports.view') || can('customer_reports.manage')) && notRider)) && { title: 'Customer Reports', href: '/seller/customer-reports', icon: Flag, ...badgeProps(sb['seller.customer_reports']) },
            isActualSeller                             && { title: 'Coupons',      href: '/seller/coupons',        icon: TicketPercent, ...lock('coupons') },
            (isActualSeller || can('reports.view'))     && { title: 'Reports',      href: '/seller/reports',    icon: LineChart       },
            (isActualSeller || can('dss.view'))         && { title: 'DSS Insights', href: '/seller/dss',        icon: Brain, ...lock('dss') },
            isActualSeller                              && { title: 'Loyalty Program', href: '/seller/loyalty/settings', icon: Award, ...lock('loyalty') },
            (isActualSeller || can('loyalty_customers.view')) && { title: 'Customers',    href: '/seller/loyalty/customers', icon: Users, ...lock('loyalty') },
            (isActualSeller || can('settings.view'))    && { title: 'Settings',     href: '/seller/settings',   icon: Settings        },
            isActualSeller                              && { title: 'Store Documents', href: '/seller/documents', icon: FileText, ...badgeProps(sb['seller.store_documents']) },
            { title: 'Notifications', href: '/notifications', icon: Bell   },
            { title: 'Profile',       href: '/settings/profile', icon: User },
        ].filter(Boolean) as NavItem[];

        return (
            <Sidebar collapsible="icon" variant="inset">
                <SidebarHeader>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg" asChild>
                                <Link href={isActualSeller ? '/seller/dashboard' : (auth.store_portal_url ?? '/seller/my-documents')} prefetch>
                                    {auth.store ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
                                                <Store className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                                                <p className="text-sm font-semibold truncate leading-tight">{auth.store.store_name}</p>
                                                <p className="text-xs text-muted-foreground">Seller Portal</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <AppLogo />
                                    )}
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>

                <SidebarContent>
                    <NavMain items={sellerItems} />
                </SidebarContent>

                <SidebarFooter>
                    <SidebarSeparator />
                    <WebsiteProblemSidebar portal="store" myReportsHref="/seller/website-reports" />
                    {/* Switch back to customer portal — store owner only */}
                    {isActualSeller && (
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="Switch to Customer Portal">
                                    <Link href="/customer/dashboard">
                                        <ShoppingBag className="h-4 w-4" />
                                        <span>Customer Portal</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    )}
                    <SidebarSeparator />
                    <NavUser />
                </SidebarFooter>
            </Sidebar>
        );
    }

    // ── Admin / staff / rider navigation ─────────────────────────────────────
    const items: NavItem[] = [
        adminArea && can('dashboard.view')  && { title: 'Dashboard',         href: '/admin/dashboard',                                    icon: LayoutDashboard },
        // Platform admin + platform staff with explicit permission
        (isPlatformAdmin || (adminArea && can('users.view'))) && { title: 'Users',            href: '/admin/users',          icon: Users      },
        isPlatformAdmin                                && { title: 'Platform Staff',   href: '/admin/staff',          icon: UserCog    },
        (isPlatformAdmin || (adminArea && can('stores.view'))) && { title: 'Stores',           href: '/admin/stores',         icon: Store, ...badgeProps(sb['admin.stores']) },
        (isPlatformAdmin || (adminArea && can('verifications.view'))) && { title: 'Verifications',    href: '/admin/verifications',  icon: BadgeCheck, ...badgeProps(sb['admin.verifications']) },
        (isPlatformAdmin || (adminArea && (can('verifications.view') || can('stores.view')))) && { title: 'Store Documents', href: '/admin/store-documents', icon: FileCheck, ...badgeProps(sb['admin.store_documents']) },
        // Riders have dedicated delivery pages
        isRider && { title: 'My Deliveries',   href: '/rider/deliveries',    icon: Truck, ...badgeProps(sb['rider.deliveries']) },
        isRider && { title: 'Delivery History', href: '/rider/history',      icon: History        },
        isRider && { title: 'Messages',         href: '/rider/messages',     icon: MessageSquare, ...unreadBadge },
        isRider && { title: 'My Reports',       href: '/rider/reports',      icon: Flag           },
        isRider && { title: 'My Attendance',    href: '/rider/my-attendance', icon: CalendarDays  },
        isRider && { title: 'My Documents',     href: '/rider/documents',    icon: IdCard, ...badgeProps(sb['rider.documents']) },
        isRider && { title: 'My Payslips',      href: '/rider/my-payslips',  icon: ClipboardList  },
        !isPlatformAdmin && !isRider && adminArea && can('customers.view') && { title: 'Customers', href: '/admin/customers', icon: Users },
        adminArea && can('invoices.view')   && { title: 'Invoices',           href: '/admin/invoices',                                     icon: Receipt         },
        adminArea && can('reports.view')    && { title: 'Reports',            href: '/admin/reports',                                      icon: BarChart3       },
        isPlatformAdmin        && { title: 'User Reports',       href: '/admin/user-reports',                                 icon: Flag, ...badgeProps(sb['admin.user_reports']) },
        isPlatformAdmin        && { title: 'Refund Disputes',    href: '/admin/refunds',                                      icon: RefreshCcw, ...badgeProps(sb['admin.refunds']) },
        adminArea && can('dss.view')        && { title: 'DSS Insights',       href: '/admin/dss',                                          icon: Brain           },
        isPlatformAdmin        && { title: 'Subscriptions',      href: '/admin/subscriptions',                                icon: Crown           },
        isPlatformAdmin        && { title: 'Loyalty',            href: '/admin/loyalty',                                      icon: Star            },
        adminArea && can('settings.view')   && { title: 'Settings',           href: '/admin/settings',                                     icon: Settings        },
        isPlatformAdmin        && { title: 'Terms & Policies',   href: '/admin/legal',                                        icon: ScrollText      },
        isPlatformAdmin        && { title: 'Auth Logs',           href: '/admin/auth-logs',                                    icon: ShieldAlert     },
        { title: 'Notifications', href: '/notifications', icon: Bell },
        { title: 'Profile', href: '/settings/profile', icon: User },
    ].filter(Boolean) as NavItem[];

    const homeHref = isRider
        ? '/rider/deliveries'
        : (items.find((i) => i.href !== '/settings/profile')?.href
            ?? (role === 'platform_staff' ? '/admin/welcome' : '/admin/dashboard'));

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={homeHref} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={items} />
            </SidebarContent>

            <SidebarFooter>
                <SidebarSeparator />
                {isRider && !isPlatformAdmin && <WebsiteProblemSidebar portal="rider" />}
                {isPlatformAdmin && (
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip="Customer Portal Preview">
                                <Link href="/customer/products">
                                    <ShoppingBag className="h-4 w-4" />
                                    <span>Customer Portal</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                )}
                {isPlatformAdmin && <SidebarSeparator />}
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
