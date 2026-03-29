import { Link, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    BadgeDollarSign,
    Banknote,
    BarChart3,
    Brain,
    CalendarDays,
    ClipboardList,
    History,
    Image,
    LayoutDashboard,
    LineChart,
    Package,
    Receipt,
    Settings,
    ShieldAlert,
    ShoppingBag,
    ShoppingCart,
    Store,
    Truck,
    User,
    UserCog,
    Users,
    Wallet,
    Warehouse,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { usePermission } from '@/hooks/use-permission';
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
    const { auth } = usePage<SharedData>().props;
    const { can } = usePermission();

    const role        = auth.user.role;
    const subRole     = auth.user.sub_role as string | null | undefined;
    const isRider     = role === 'rider' || (role === 'seller_staff' && subRole === 'rider');
    const isSeller    = role === 'seller' || (role === 'seller_staff' && subRole !== 'rider');
    const isPlatformAdmin = role === 'platform_admin' || role === 'admin';

    // ── Seller portal navigation ──────────────────────────────────────────────
    if (isSeller) {
        const isActualSeller = role === 'seller'; // store owner sees everything
        const isHR           = role === 'seller_staff' && subRole === 'hr';

        const sellerItems: NavItem[] = [
            (isActualSeller || can('dashboard.view'))   && { title: 'Dashboard',    href: '/seller/dashboard',  icon: LayoutDashboard },
            (isActualSeller || can('products.view'))    && { title: 'Products',     href: '/seller/products',   icon: Package         },
            (isActualSeller || can('orders.view'))      && { title: 'Orders',       href: '/seller/orders',     icon: ShoppingCart    },
            (isActualSeller || can('deliveries.view'))  && { title: 'Deliveries',   href: '/seller/deliveries', icon: Truck           },
            (isActualSeller || can('invoices.view'))    && { title: 'Invoices',     href: '/seller/invoices',   icon: Receipt         },
            (isActualSeller || can('inventory.view'))   && { title: 'Inventory',    href: '/seller/inventory',  icon: Warehouse       },
            isActualSeller                              && { title: 'Staff',        href: '/seller/staff',      icon: UserCog         },
            (isActualSeller || isHR)                   && { title: 'Attendance',   href: '/seller/attendance',      icon: CalendarDays      },
            (!isActualSeller && !isHR)                 && { title: 'My Attendance',href: '/seller/my-attendance',  icon: CalendarDays      },
            (!isActualSeller)                          && { title: 'My Payslips',  href: '/seller/my-payslips',    icon: ClipboardList     },
            (isActualSeller || isHR)                   && { title: 'Payroll',      href: '/seller/payroll',        icon: BadgeDollarSign   },
            isActualSeller                             && { title: 'Wallet',       href: '/seller/wallet',         icon: Wallet            },
            (isActualSeller || can('reports.view'))     && { title: 'Reports',      href: '/seller/reports',    icon: LineChart       },
            (isActualSeller || can('dss.view'))         && { title: 'DSS Insights', href: '/seller/dss',        icon: Brain           },
            (isActualSeller || can('settings.view'))    && { title: 'Settings',     href: '/seller/settings',   icon: Settings        },
            { title: 'Profile', href: '/settings/profile', icon: User },
        ].filter(Boolean) as NavItem[];

        return (
            <Sidebar collapsible="icon" variant="inset">
                <SidebarHeader>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg" asChild>
                                <Link href="/seller/dashboard" prefetch>
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
        can('dashboard.view')  && { title: 'Dashboard',         href: '/admin/dashboard',                                    icon: LayoutDashboard },
        // Platform admin + platform staff with explicit permission
        (isPlatformAdmin || can('users.view'))         && { title: 'Users',            href: '/admin/users',          icon: Users      },
        isPlatformAdmin                                && { title: 'Platform Staff',   href: '/admin/staff',          icon: UserCog    },
        (isPlatformAdmin || can('stores.view'))        && { title: 'Stores',           href: '/admin/stores',         icon: Store      },
        (isPlatformAdmin || can('verifications.view')) && { title: 'Verifications',    href: '/admin/verifications',  icon: BadgeCheck },
        // Riders have dedicated delivery pages
        isRider && { title: 'My Deliveries',   href: '/rider/deliveries',    icon: Truck          },
        isRider && { title: 'Delivery History', href: '/rider/history',      icon: History        },
        isRider && { title: 'My Attendance',    href: '/rider/my-attendance', icon: CalendarDays  },
        isRider && { title: 'My Payslips',      href: '/rider/my-payslips',  icon: ClipboardList  },
        !isPlatformAdmin && !isRider && can('customers.view') && { title: 'Customers', href: '/admin/customers', icon: Users },
        can('invoices.view')   && { title: 'Invoices',           href: '/admin/invoices',                                     icon: Receipt         },
        can('reports.view')    && { title: 'Reports',            href: '/admin/reports',                                      icon: BarChart3       },
        can('dss.view')        && { title: 'DSS Insights',       href: '/admin/dss',                                          icon: Brain           },
        can('settings.view')   && { title: 'Settings',           href: '/admin/settings',                                     icon: Settings        },
isPlatformAdmin        && { title: 'Withdrawals',         href: '/admin/withdrawals',                                  icon: Banknote        },
        isPlatformAdmin        && { title: 'Auth Logs',           href: '/admin/auth-logs',                                    icon: ShieldAlert     },
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
