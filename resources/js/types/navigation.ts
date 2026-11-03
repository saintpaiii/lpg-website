import type { InertiaLinkProps } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';

export type BreadcrumbItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
};

export type NavItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: LucideIcon | null;
    isActive?: boolean;
    badge?: string;
    /**
     * 'unread' = blue pill, 'alert' = red pill (needs action), 'warning' = amber pill ("!").
     * All three also show a dot on the icon when the sidebar is collapsed.
     */
    badgeTone?: 'default' | 'unread' | 'alert' | 'warning';
    /** Shown greyed with a lock and not clickable (e.g. shopping before ID approval) */
    disabled?: boolean;
    /** Tooltip shown on a disabled item */
    disabledReason?: string;
};
