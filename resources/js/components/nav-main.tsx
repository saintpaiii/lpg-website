import { Link } from '@inertiajs/react';
import { Lock } from 'lucide-react';
import { openUpgrade } from '@/lib/plans';
import { cn } from '@/lib/utils';
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export function NavMain({ items = [] }: { items: NavItem[] }) {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <SidebarGroup className="px-2 py-2">
            <SidebarMenu className="gap-0.5">
                {items.map((item) => {
                    if (item.disabled) {
                        const reason = item.disabledReason ?? 'Not available';
                        return (
                            <SidebarMenuItem key={item.title} data-tour={`nav:${item.href}`}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={{ children: reason }}
                                    className="h-9 cursor-not-allowed rounded-md px-3 text-sm font-medium text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground"
                                >
                                    <span role="link" aria-disabled="true" title={reason}>
                                        {item.icon && <item.icon className="mr-2 size-4 shrink-0" />}
                                        <span className="flex-1 truncate">{item.title}</span>
                                        <Lock className="ml-auto size-3.5 shrink-0" />
                                    </span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    }

                    if (item.lockedPlan) {
                        // Not on this plan: same row with a lock + tag; opens the upgrade dialog instead of the page
                        return (
                            <SidebarMenuItem key={item.title} data-tour={`nav:${item.href}`}>
                                <SidebarMenuButton
                                    tooltip={{ children: `${item.title} — ${item.lockedPlan} plan` }}
                                    onClick={() => openUpgrade(item.lockedFeature ?? '')}
                                    className="h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                >
                                    {item.icon && <item.icon className="mr-2 size-4 shrink-0" />}
                                    <span className="flex-1 truncate">{item.title}</span>
                                    <span className={cn(
                                        'ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none',
                                        item.lockedPlan === 'Premium'
                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                            : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
                                    )}>
                                        <Lock className="size-2.5" /> {item.lockedPlan}
                                    </span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    }

                    const active = item.isActive ?? isCurrentOrParentUrl(item.href);
                    return (
                        <SidebarMenuItem key={item.title} data-tour={`nav:${item.href}`}>
                            <SidebarMenuButton
                                asChild
                                isActive={active}
                                tooltip={{ children: item.title }}
                                className={cn(
                                    'h-9 rounded-md px-3 text-sm font-medium transition-all duration-150',
                                    active
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700 shadow-sm'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5',
                                )}
                            >
                                {/* No prefetch while a badge shows: a prefetched page would skip the visit that clears it */}
                                <Link href={item.href} prefetch={!item.badge}>
                                    {item.icon && (
                                        <span className="relative mr-2 shrink-0">
                                            <item.icon className={cn('size-4', active ? 'text-white' : '')} />
                                            {item.badge && item.badgeTone && item.badgeTone !== 'default' && (
                                                // Dot on the icon, visible when the sidebar is collapsed to icons
                                                <span className={cn(
                                                    'absolute -right-1 -top-1 hidden h-2 w-2 rounded-full ring-2 ring-sidebar group-data-[collapsible=icon]:block',
                                                    item.badgeTone === 'alert' ? 'bg-red-600' : item.badgeTone === 'warning' ? 'bg-amber-500' : 'bg-blue-600',
                                                )} />
                                            )}
                                        </span>
                                    )}
                                    <span className="flex-1 truncate">{item.title}</span>
                                    {item.badge && (
                                        <span
                                            className={cn(
                                                'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                                                item.badgeTone === 'unread'
                                                    ? (active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white')
                                                    : item.badgeTone === 'alert'
                                                    ? (active ? 'bg-white text-red-600' : 'bg-red-600 text-white')
                                                    : item.badgeTone === 'warning'
                                                    ? (active ? 'bg-white text-amber-600' : 'bg-amber-500 text-white')
                                                    : active
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
