import { Link } from '@inertiajs/react';
import { Bug } from 'lucide-react';
import { useState } from 'react';
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import WebsiteProblemDialog from './website-problem-dialog';

/**
 * Sidebar entry for website problems.
 * Customers and riders: "Report a website problem" opens the dialog (their reports are in My Reports).
 * Store users: ONE link "Website problems" to their reports page, which has the "Report a problem" button.
 */
export default function WebsiteProblemSidebar({ portal, myReportsHref }: {
    portal: 'customer' | 'store' | 'rider';
    /** Store users: link to their website reports page instead of opening the dialog */
    myReportsHref?: string;
}) {
    const [open, setOpen] = useState(false);
    const { isCurrentOrParentUrl } = useCurrentUrl();

    if (myReportsHref) {
        return (
            <SidebarGroup className="px-2 py-0">
                <SidebarMenu className="gap-0.5">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isCurrentOrParentUrl(myReportsHref)} tooltip={{ children: 'Website problems' }}
                            className="h-9 rounded-md px-3 text-sm font-medium">
                            <Link href={myReportsHref} prefetch>
                                <Bug className="mr-2 size-4 shrink-0" />
                                <span className="truncate">Website problems</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroup>
        );
    }

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
            </SidebarMenu>
            <WebsiteProblemDialog open={open} onOpenChange={setOpen} portal={portal} />
        </SidebarGroup>
    );
}
