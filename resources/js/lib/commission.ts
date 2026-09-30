// Shared commission invoice types and labels (admin + seller portals).

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'waived';

export type CommissionInvoice = {
    id: number;
    invoice_number: string;
    store_id: number;
    store_name: string | null;
    store_suspended: boolean;
    period_start: string;
    period_end: string;
    period_label: string;
    total_orders: number;
    total_sales: number;
    commission_rate: number;
    commission_amount: number;
    status: InvoiceStatus;
    due_date: string;
    days_overdue: number;
    paid_at: string | null;
    payment_reference: string | null;
    payment_method: string | null;
    notes: string | null;
    created_at: string;
};

export type InvoiceLine = {
    id: number;
    order_id: number;
    order_number: string | null;
    payment_mode: 'full' | 'consignment' | 'cod' | null;
    delivered_at: string;
    order_total: number;
    commission_rate: number;
    commission_amount: number;
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
    pending: 'Pending',
    paid:    'Paid',
    overdue: 'Overdue',
    waived:  'Waived',
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid:    'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-700',
    waived:  'bg-blue-100 text-blue-700',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    paymongo:      'PayMongo',
    bank_transfer: 'Bank Transfer',
    gcash:         'GCash',
    cash:          'Cash',
};

export const fmtPeso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
