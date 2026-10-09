import { Link } from '@inertiajs/react';
import { Bug, FileWarning } from 'lucide-react';
import { useState } from 'react';
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import WebsiteProblemDialog from './website-problem-dialog';

/** Sidebar entry "Report a website problem" (opens a dialog — it's a button, not a page link). */
export default function WebsiteProblemSidebar({ portal, myReportsHref }: {
    portal: 'customer' | 'store' | 'rider';
    /** Store users: also show "My website reports" right under the button */
    myReportsHref?: string;
}) {
    const [open, setOpen] = useState(false);
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                    <SidebarMenuButton tooltip={{ children: 'Report a website problem' }} onClick={() => setOpen(true)}
                        className="h-9 rounded-md px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent">
                        <Bug className="mr-2 size-4 shrink-0" />
                        <span className="truncate">Report a website problem</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                {myReportsHref && (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isCurrentOrParentUrl(myReportsHref)} tooltip={{ children: 'My website reports' }}
                            className="h-9 rounded-md px-3 text-sm font-medium">
                            <Link href={myReportsHref} prefetch>
                                <FileWarning className="mr-2 size-4 shrink-0" />
                                <span className="truncate">My website reports</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )}
            </SidebarMenu>
            <WebsiteProblemDialog open={open} onOpenChange={setOpen} portal={portal} />
        </SidebarGroup>
    );
}
