import WebsiteProblemSidebar from '@/components/reports/website-problem-sidebar';
import { useUnreadMessages } from '@/components/chat/use-unread-messages';
import { Link, usePage } from '@inertiajs/react';
import { ShoppingBag, Store } from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { usePermission } from '@/hooks/use-permission';
import { planNeedsAttention } from '@/lib/plans';
import { buildAppNav } from '@/lib/app-nav';
import { usePlan } from '@/hooks/use-plan';
import { useSidebarBadges } from '@/hooks/use-sidebar-badges';
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
    const role      = auth.user.role;
    const riderUser = role === 'rider' || (role === 'seller_staff' && auth.user.sub_role === 'rider');

    // Chat unread badge (seller/staff inbox or rider inbox) — decided before the menu (it needs the portal)
    const preview = buildAppNav({ role, subRole: auth.user.sub_role as string | null, isPlatformStaffFlag: !!auth.user?.is_platform_staff, url,
        canSwitchPortal: auth.can_switch_portal, selfClock: auth.self_clock, can, has });
    const chatPortal = preview.isRider ? 'rider' : preview.mode === 'seller' && !riderUser && (role === 'seller' || can('messages.view')) ? 'seller' : null;
    const unreadMessages = useUnreadMessages(chatPortal);

    // New / updated since the last visit, per section (SidebarBadgeService) — keys like "seller.orders"
    const sb = useSidebarBadges();

    // Same rules the first-time tutorials use (lib/app-nav.ts)
    const nav = buildAppNav({ role, subRole: auth.user.sub_role as string | null, isPlatformStaffFlag: !!auth.user?.is_platform_staff, url,
        canSwitchPortal: auth.can_switch_portal, selfClock: auth.self_clock, can, has, sb, unreadMessages, planBadge });
    const isPlatformAdmin = nav.isPlatformAdmin;

    // ── Seller portal navigation ──────────────────────────────────────────────
    if (nav.mode === 'seller') {
        const isActualSeller = nav.isActualSeller;
        const sellerItems = nav.items;

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
    const items = nav.items;
    const isRider = nav.isRider;
    const homeHref = nav.homeHref;

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
