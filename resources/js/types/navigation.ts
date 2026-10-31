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
    /** 'unread' renders the badge as a blue pill (and a dot when the sidebar is collapsed). */
    badgeTone?: 'default' | 'unread';
    /** Shown greyed with a lock and not clickable (e.g. shopping before ID approval) */
    disabled?: boolean;
    /** Tooltip shown on a disabled item */
    disabledReason?: string;
};
