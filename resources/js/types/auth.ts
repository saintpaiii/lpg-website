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
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
