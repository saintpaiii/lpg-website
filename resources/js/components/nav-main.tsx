import { Link } from '@inertiajs/react';
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
                    const active = isCurrentOrParentUrl(item.href);
                    return (
                        <SidebarMenuItem key={item.title}>
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
                                <Link href={item.href} prefetch>
                                    {item.icon && (
                                        <item.icon
                                            className={cn(
                                                'mr-2 size-4 shrink-0',
                                                active ? 'text-white' : '',
                                            )}
                                        />
                                    )}
                                    <span className="flex-1 truncate">{item.title}</span>
                                    {item.badge && (
                                        <span
                                            className={cn(
                                                'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                                                active
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
