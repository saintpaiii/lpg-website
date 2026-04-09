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
    platform_credits: number;
    unreadNotifications: number;
    recentNotifications: AppNotification[];
    [key: string]: unknown;
};
