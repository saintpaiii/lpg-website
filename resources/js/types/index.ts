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
    [key: string]: unknown;
};
