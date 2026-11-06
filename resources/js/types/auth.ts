export type UserRole = 'platform_admin' | 'platform_staff' | 'admin' | 'manager' | 'cashier' | 'warehouse' | 'rider' | 'customer' | 'seller' | 'seller_staff';

export type User = {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    phone?: string | null;
    is_active: boolean;
    is_admin: boolean;
    is_platform_staff: boolean;
    id_verified?: boolean;
    id_verification_status?: 'pending' | 'verified' | 'rejected';
    valid_id_path?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    store_id?: number | null;
    sub_role?: string | null;
    avatar?: string;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type SellerStore = {
    id: number;
    store_name: string;
    status: string;
    /** Hidden from customers because a permit expired more than 7 days ago */
    documents_suspended?: boolean;
    /** Most urgent permit problem (expired, or expiring within 7 days) */
    documents_alert?: { label: string; date: string; status: string; days_left: number } | null;
    /** The store is pinned on the map */
    has_location?: boolean;
};

export type SellerApplication = {
    status: 'pending' | 'rejected';
    rejection_reason: string | null;
} | null;

export type Auth = {
    user: User;
    permissions: string[];
    store: SellerStore | null;
    seller_application: SellerApplication;
    /** Customers only: false = never verified and no orders yet (history pages locked too) */
    has_customer_history?: boolean | null;
    /** The user's home page (User::homeUrl on the server) */
    home_url?: string;
    /** Store staff: names of their roles */
    role_names?: string[];
    /** Rider who also has a store-portal role: "Switch to Store Portal" / "Switch to Rider App" */
    can_switch_portal?: boolean;
    /** Store staff: first store-portal page they can open */
    store_portal_url?: string | null;
    /** Store staff who clock in themself (everyone except HR) */
    self_clock?: boolean;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
