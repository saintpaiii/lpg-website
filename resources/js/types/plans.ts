// Store subscription plans — mirrors App\Services\SubscriptionService.

export type PlanKey = 'basic' | 'pro' | 'premium';
export type PlanLimits = { products: number | null; staff: number | null; vehicles: number | null };

/** Shared 'plan' prop (seller owner / staff / riders of a store) */
export type PlanSummary = {
    key: PlanKey | 'trial' | 'none';
    last_key: PlanKey | 'trial' | 'none';
    name: string;
    last_name: string | null;
    is_trial: boolean;
    active: boolean;
    expires_at: string | null;
    expires_label: string | null;
    days_left: number;
    features: string[];
    limits: PlanLimits;
    featured: boolean;
    trial_used: boolean;
};

export type CatalogPlan = {
    id?: number;
    key: PlanKey;
    name: string;
    price: number;
    limits: PlanLimits;
    features: string[];
};

/** SubscriptionService::publicPlans() */
export type PlanCatalog = {
    plans: CatalogPlan[];
    feature_labels: Record<string, string>;
    core_features: string[];
    days: number;
    trial_days: number;
};
