// Shared refund request types and labels (customer, seller and admin pages).

export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processed';
export type RefundResolution = 'replacement' | 'money_refund' | 'store_discount';
export type ReturnMethod = 'rider_pickup' | 'customer_dropoff' | 'no_return';

export type RefundItem = {
    id: number;
    order_id: number;
    order_number: string | null;
    order_total: number;
    store_name: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email?: string | null;
    amount: number;
    reason: string;
    preferred_resolution: RefundResolution | null;
    description: string;
    evidence_urls: string[];
    status: RefundStatus;
    seller_resolution: RefundResolution | null;
    seller_notes: string | null;
    refund_reference: string | null;
    return_method: ReturnMethod | null;
    coupon: { code: string; amount: number; status: string; expires_at: string | null } | null;
    replacement: {
        order_id: number;
        order_number: string | null;
        delivery_status: string | null;
        rider_name: string | null;
    } | null;
    escalated_to_admin: boolean;
    escalation_reason: string | null;
    escalated_at: string | null;
    admin_decision: 'favor_customer' | 'favor_seller' | null;
    admin_notes: string | null;
    admin_decided_at: string | null;
    can_escalate: boolean;
    seller_responded_at: string | null;
    processed_at: string | null;
    created_at: string;
};

export const REASON_LABELS: Record<string, string> = {
    damaged_product: 'Damaged Product',
    leaking_tank:    'Leaking Tank',
    wrong_product:   'Wrong Product',
    missing_items:   'Missing Items',
    quality_issue:   'Quality Issue',
    other:           'Other',
};

export const RESOLUTION_LABELS: Record<RefundResolution, string> = {
    replacement:    'Product Replacement',
    money_refund:   'Money Refund',
    store_discount: 'Store Discount',
};

export const RETURN_METHOD_LABELS: Record<ReturnMethod, string> = {
    rider_pickup:     'Rider picks up the item',
    customer_dropoff: 'Customer drops off the item',
    no_return:        'No return needed',
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
    pending:   'Awaiting Seller',
    approved:  'In Progress',
    processed: 'Resolved',
    rejected:  'Rejected',
};

export const REFUND_STATUS_STYLES: Record<RefundStatus, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    approved:  'bg-blue-100 text-blue-800',
    processed: 'bg-green-100 text-green-800',
    rejected:  'bg-red-100 text-red-700',
};

export function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}
