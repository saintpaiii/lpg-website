import {
    Award, BadgeCheck, BadgeDollarSign, BarChart3, Bell, Brain, CalendarDays, Car, ClipboardList, Crown, FileCheck, FileText, Flag,
    History, IdCard, LayoutDashboard, LifeBuoy, LineChart, MessageSquare, MessageSquareQuote, Package, Receipt, RefreshCcw, ScrollText,
    Settings, Settings2, ShieldAlert, ShoppingCart, Star, Store, TicketPercent, TrendingUp, Truck, User, UserCog, Users, Warehouse,
} from 'lucide-react';
import { badgeProps } from '@/hooks/use-sidebar-badges';
import { FEATURE_INFO } from '@/lib/plans';
import type { NavItem } from '@/types';

/**
 * The app sidebar's menu (seller portal, rider app, platform admin / staff) as a pure function, so the sidebar AND the
 * first-time tutorials use exactly the same rules for "which pages can this person open".
 */
export type AppNavInput = {
    role: string;
    subRole?: string | null;
    isPlatformStaffFlag?: boolean;
    /** Current URL — a rider with store roles uses the store menu while on /seller/* */
    url: string;
    canSwitchPortal?: boolean;
    selfClock?: boolean;
    can: (permission: string) => boolean;
    has: (feature: string) => boolean;
    sb?: Record<string, number>;
    unreadMessages?: number;
    planBadge?: Pick<NavItem, 'badge' | 'badgeTone'>;
};

export type AppNav = {
    mode: 'seller' | 'other';
    items: NavItem[];
    isActualSeller: boolean;
    riderUser: boolean;
    isRider: boolean;
    isPlatformAdmin: boolean;
    homeHref: string;
};

/** A menu href as a plain path (items may hold a Wayfinder {url, method} pair) */
export const hrefOf = (h: NavItem['href'] | undefined): string | undefined => (h === undefined ? undefined : typeof h === 'string' ? h : h.url);

export function buildAppNav(i: AppNavInput): AppNav {
    const { role, can, has } = i;
    const sb = i.sb ?? {};
    const subRole = i.subRole ?? null;
    const lock = (feature: string) => (has(feature) ? {} : { lockedPlan: FEATURE_INFO[feature]?.plan ?? 'Pro', lockedFeature: feature });
    const unreadBadge = (i.unreadMessages ?? 0) > 0
        ? { badge: (i.unreadMessages ?? 0) > 99 ? '99+' : String(i.unreadMessages), badgeTone: 'unread' as const }
        : {};

    // The menu follows the CURRENT portal: a rider who also has store roles uses both ("Switch to Store Portal")
    const riderUser     = role === 'rider' || (role === 'seller_staff' && subRole === 'rider');
    const inStorePortal = i.url.startsWith('/seller');
    const isRider       = riderUser && !(inStorePortal && i.canSwitchPortal);
    const isSeller      = role === 'seller' || (role === 'seller_staff' && !isRider);
    const isPlatformAdmin = role === 'platform_admin' || role === 'admin';
    // Store owners / staff never get /admin/* links (their permission names overlap with platform ones)
    const adminArea     = role !== 'seller' && role !== 'seller_staff';
    const help: NavItem = { title: 'Help & Tutorials', href: '/help', icon: LifeBuoy };

    if (isSeller) {
        const isActualSeller = role === 'seller';
        // Riders in the store portal keep their own chat / reports in the rider app
        const notRider  = !riderUser;
        const selfClock = !isActualSeller && !riderUser && i.selfClock !== false;
        const url = i.url;

        const items = [
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
            isActualSeller                             && { title: 'My Plan',      href: '/seller/plan',           icon: Crown, ...(i.planBadge ?? {}) },
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
            help,
            { title: 'Profile',       href: '/settings/profile', icon: User },
        ].filter(Boolean) as NavItem[];

        return { mode: 'seller', items, isActualSeller, riderUser, isRider, isPlatformAdmin, homeHref: isActualSeller ? '/seller/dashboard' : '/seller/my-documents' };
    }

    const items = [
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
        // Platform admin only — platform staff (role admin + is_platform_staff) get 403 there
        isPlatformAdmin && !i.isPlatformStaffFlag && { title: 'Reviews',            href: '/admin/reviews',                                      icon: MessageSquareQuote },
        isPlatformAdmin        && { title: 'Refund Disputes',    href: '/admin/refunds',                                      icon: RefreshCcw, ...badgeProps(sb['admin.refunds']) },
        adminArea && can('dss.view')        && { title: 'DSS Insights',       href: '/admin/dss',                                          icon: Brain           },
        isPlatformAdmin        && { title: 'Subscriptions',      href: '/admin/subscriptions',                                icon: Crown           },
        isPlatformAdmin        && { title: 'Loyalty',            href: '/admin/loyalty',                                      icon: Star            },
        adminArea && can('settings.view')   && { title: 'Settings',           href: '/admin/settings',                                     icon: Settings        },
        isPlatformAdmin        && { title: 'Terms & Policies',   href: '/admin/legal',                                        icon: ScrollText      },
        isPlatformAdmin        && { title: 'Login History',           href: '/admin/auth-logs',                                    icon: ShieldAlert     },
        { title: 'Notifications', href: '/notifications', icon: Bell },
        help,
        { title: 'Profile', href: '/settings/profile', icon: User },
    ].filter(Boolean) as NavItem[];

    const homeHref = isRider
        ? '/rider/deliveries'
        // Customers normally use the Customer Portal layout; never send them to /notifications from here
        : role === 'customer'
        ? '/customer/dashboard'
        : (hrefOf(items.find((x) => x.href !== '/settings/profile')?.href)
            ?? (role === 'platform_staff' ? '/admin/welcome' : '/admin/dashboard'));

    return { mode: 'other', items, isActualSeller: false, riderUser, isRider, isPlatformAdmin, homeHref };
}
