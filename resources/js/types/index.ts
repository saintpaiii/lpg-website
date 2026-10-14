export type * from './auth';
export type * from './navigation';
export type * from './ui';

import type { Auth } from './auth';

export type CartConflict = {
    existing_store_name: string;
    new_store_id: number;
    new_store_name: string;
    product_id: number;
    quantity: number;
    transaction_type: string;
};

export type AppNotification = {
    id: number;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    created_at: string;
    read_at?: string | null;
};

export type PendingLegal = {
    has_any_acceptance: boolean;
    documents: { id: number; type: string; label: string; title: string; version: number; change_summary: string | null; url: string }[];
};

export type SharedData = {
    name: string;
    auth: Auth;
    sidebarOpen: boolean;
    flash: {
        success?: string | null;
        error?: string | null;
        cart_conflict?: CartConflict | null;
        deactivation_info?: { reason: string | null; notes: string | null } | null;
        store_suspension_info?: { reason: string | null; notes: string | null } | null;
    };
    cart_count: number;
    unreadNotifications: number;
    /** Unread chat messages across all of the user's conversations */
    unreadMessages?: number;
    /** config/reports.php categories, keyed by category */
    reportCategories?: Record<string, import('@/components/reports/types').ReportCategory>;
    /** Reports waiting on this user's store / on the admin */
    reportBadges?: { store: number; admin: number };
    /** "Report a website problem" catalog */
    systemReportCategories?: Record<string, import('@/components/reports/types').SystemCategory>;
    systemReportAreas?: Record<string, string[]>;
    recentNotifications: AppNotification[];
    /** Terms / Privacy Policy versions this user must accept before continuing (null = nothing pending) */
    pendingLegal?: PendingLegal | null;
    [key: string]: unknown;
};
