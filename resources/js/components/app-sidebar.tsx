import { Link, usePage } from '@inertiajs/react';
import {
    BarChart3,
    Brain,
    History,
    LayoutDashboard,
    Package,
    Receipt,
    Settings,
    ShoppingCart,
    Truck,
    User,
    UserCog,
    Users,
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

    const isRider = auth.user.role === 'rider';

    // Admin / staff panel — filtered by permissions
    const adminItems: NavItem[] = [
        can('dashboard.view')  && { title: 'Dashboard',        href: '/admin/dashboard',  icon: LayoutDashboard },
        can('customers.view')  && { title: 'Customers',        href: '/admin/customers',  icon: Users           },
        can('products.view')   && { title: 'Products',         href: '/admin/products',   icon: Package         },
        can('inventory.view')  && { title: 'Inventory',        href: '/admin/inventory',  icon: Warehouse       },
        can('orders.view')     && { title: 'Orders',           href: '/admin/orders',     icon: ShoppingCart    },
        can('deliveries.view') && { title: 'Deliveries',       href: '/admin/deliveries', icon: Truck           },
        can('invoices.view')   && { title: 'Invoices',         href: '/admin/invoices',   icon: Receipt         },
        can('reports.view')    && { title: 'Reports',          href: '/admin/reports',    icon: BarChart3       },
        can('dss.view')        && { title: 'DSS Insights',     href: '/admin/dss',        icon: Brain           },
        can('users.view')      && { title: 'Staff Management', href: '/admin/staff',      icon: UserCog         },
        can('settings.view')   && { title: 'Settings',         href: '/admin/settings',   icon: Settings        },
    ].filter(Boolean) as NavItem[];

    // Rider panel — filtered by permissions
    const riderItems: NavItem[] = [
        can('deliveries.view') && { title: 'My Deliveries',    href: '/rider/deliveries', icon: Truck,        },
        can('deliveries.view') && { title: 'Delivery History', href: '/rider/history',    icon: History,      },
        can('orders.view')     && { title: 'Orders',           href: '/rider/orders',     icon: ShoppingCart, badge: 'View' },
        can('customers.view')  && { title: 'Customers',        href: '/rider/customers',  icon: Users,        badge: 'View' },
                                  { title: 'Profile',          href: '/settings/profile', icon: User,         },
    ].filter(Boolean) as NavItem[];

    const items    = isRider ? riderItems : adminItems;
    const homeHref = isRider
        ? '/rider/deliveries'
        : (adminItems[0]?.href ?? '/admin/dashboard');

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
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
