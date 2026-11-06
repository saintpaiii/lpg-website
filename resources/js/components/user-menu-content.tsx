import { Link, usePage } from '@inertiajs/react';
import { ArrowLeftRight, LogOut, Settings } from 'lucide-react';
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { edit } from '@/routes/profile';
import type { SharedData, User } from '@/types';

type Props = {
    user: User;
    onLogoutRequest?: () => void;
};

export function UserMenuContent({ user, onLogoutRequest }: Props) {
    const cleanup = useMobileNavigation();
    // A rider who also has a store-portal role switches between the rider app and the store portal
    const { props: { auth }, url } = usePage<SharedData>();
    const inStorePortal = url.startsWith('/seller');
    const canSwitch = !!auth.can_switch_portal;

    return (
        <>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <UserInfo user={user} showEmail={true} />
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                    <Link
                        className="block w-full cursor-pointer"
                        // Customers: their portal profile page (the /settings pages are for the other roles)
                        href={auth.user?.role === 'customer' ? '/customer/profile' : edit()}
                        prefetch
                        onClick={cleanup}
                    >
                        <Settings className="mr-2" />
                        Settings
                    </Link>
                </DropdownMenuItem>
                {canSwitch && (
                    <DropdownMenuItem asChild>
                        <Link className="block w-full cursor-pointer" href={inStorePortal ? '/rider/deliveries' : (auth.store_portal_url ?? '/seller/my-documents')} onClick={cleanup}>
                            <ArrowLeftRight className="mr-2" />
                            {inStorePortal ? 'Switch to Rider App' : 'Switch to Store Portal'}
                        </Link>
                    </DropdownMenuItem>
                )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
                className="cursor-pointer"
                data-test="logout-button"
                onClick={() => {
                    cleanup();
                    onLogoutRequest?.();
                }}
            >
                <LogOut className="mr-2" />
                Log out
            </DropdownMenuItem>
        </>
    );
}
