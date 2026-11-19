import { router, usePage } from '@inertiajs/react';
import { Building2, Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { SharedData } from '@/types';

/**
 * J9 — the owner's store switcher (only when they have at least one branch): "Main dashboard", the main store, each
 * approved branch. Switching sets the active store on the server and reloads the seller dashboard.
 */
export default function StoreSwitcher() {
    const { auth } = usePage<SharedData>().props;
    const stores = auth.owned_stores;
    if (auth.user.role !== 'seller' || !stores || stores.length === 0) return null;
    const activeId = auth.store?.id;

    const go = (storeId: number | null, to?: 'main-dashboard') =>
        router.post('/seller/switch-store', { store_id: storeId ?? 0, to }, { preserveScroll: false });

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton className="border bg-background" tooltip="Switch store" data-testid="store-switcher">
                            <Building2 className="h-4 w-4 shrink-0 text-blue-600" />
                            <span className="truncate text-xs font-medium">{auth.store?.is_branch ? auth.store.branch_name : 'Main store'}</span>
                            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 opacity-60" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="start">
                        {auth.can_main_dashboard && (
                            <>
                                <DropdownMenuItem onSelect={() => router.get('/seller/main-dashboard')}>
                                    <LayoutGrid className="mr-2 h-4 w-4" /> Main dashboard (all stores)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Work in</DropdownMenuLabel>
                        {stores.map((s) => (
                            <DropdownMenuItem key={s.id} onSelect={() => go(s.id)} className="gap-2">
                                <span className="min-w-0 flex-1 truncate">{s.is_main ? `${s.name} (main)` : s.short}</span>
                                {s.id === activeId && <Check className="h-4 w-4 text-blue-600" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
