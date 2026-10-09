export type ReporterSide = 'customer' | 'store' | 'rider';
export type ReportPortal = 'customer' | 'seller' | 'rider' | 'admin';

/** One category from config/reports.php (shared as the `reportCategories` prop). */
export type ReportCategory = {
    label: string;
    hint: string;
    reporter: ReporterSide;
    route: 'store' | 'admin' | 'both';
    urgent: boolean;
    target: 'store' | 'rider' | 'product' | 'customer';
    needs_order: boolean;
    offers_refund: boolean;
};

export type ReportListItem = {
    id: number;
    category: string;
    category_label: string;
    route: 'store' | 'admin' | 'both';
    reporter_side: ReporterSide;
    /** "Report a website problem" */
    is_system: boolean;
    system_area: string | null;
    is_urgent: boolean;
    status: string;
    status_label: string;
    /** Outcome once closed, e.g. "False report" */
    verdict: string | null;
    verdict_label: string | null;
    waiting_on: 'handler' | 'reporter' | null;
    escalated: boolean;
    subject: string;
    order_number: string | null;
    store: { id: number; name: string } | null;
    reporter: { name: string; side: ReporterSide; role?: string | null };
    target: { type: string | null; name: string };
    screenshots: number;
    page_url: string | null;
    created_at: string;
    last_activity_at: string | null;
    link: string;
};

export type ReportFlags = {
    can_reply: boolean;
    can_start_review: boolean;
    can_start_investigating: boolean;
    can_propose_resolution: boolean;
    proposal_needs_photo: boolean;
    can_confirm: boolean;
    can_not_solved: boolean;
    can_escalate: boolean;
    can_withdraw: boolean;
    can_close: boolean;
    needs_safety_note: boolean;
    can_remind_store: boolean;
    reminded_at: string | null;
    can_hand_to_store: boolean;
    can_add_internal_note: boolean;
    can_request_refund: boolean;
};

export type ReportStep = { label: string; done: boolean; current: boolean; at: string | null };

export type QuickReplyGroup = { group: string; items: { label: string; text: string }[] };

export type OrderSummary = {
    order_number: string;
    link: string | null;
    status: string;
    ordered_at: string | null;
    payment_method: string | null;
    payment_status: string;
    amount_paid: number;
    grand_total: number;
    remaining_balance: number | null;
    balance_due_date: string | null;
    items: { name: string; quantity: number; unit_price: number; line_total: number }[];
    delivery: { rider: string | null; status: string; delivered_at: string | null; proof_url: string | null } | null;
    refund: { status: string; amount: number } | null;
};

export type ReportUpdateItem = {
    id: number;
    author_side: 'customer' | 'store' | 'rider' | 'admin' | 'system';
    author_label: string;
    author_staff: string | null;
    body: string | null;
    attachment_urls: string[];
    is_internal: boolean;
    status_to: string | null;
    created_at: string;
};

export type ReportDetail = ReportListItem & {
    description: string;
    evidence_urls: string[];
    resolution_photos: string[];
    steps: ReportStep[];
    quick_replies: QuickReplyGroup[];
    order_summary?: OrderSummary;
    /** Customer's own false-report count (customer view) */
    my_false_reports?: number;
    /** Store's warnings in the last 90 days (admin / store view) */
    store_warnings?: number | null;
    rider?: { name: string; warnings: number } | null;
    escalation_reason: string | null;
    resolution: string | null;
    offers_refund: boolean;
    viewer_role: 'admin' | 'reporter' | 'store_handler' | null;
    order: { id: number; order_number: string; link: string | null } | null;
    flags: ReportFlags;
    updates: ReportUpdateItem[];
    admin?: {
        admin_notes: string | null;
        reporter_email: string | null;
        reporter_phone: string | null;
        reported_email: string | null;
        store_first_response_at: string | null;
        escalation_source: string | null;
        page_url: string | null;
        user_agent: string | null;
        store_id: number | null;
        close_outcomes: { key: string; label: string }[];
        close_preview: { reporter_name: string; next_false_count: number; is_customer_role: boolean; is_active: boolean } | null;
    };
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    links?: { url: string | null; label: string; active: boolean }[];
};

/** The order a report is filed from. */
export type ReportOrder = {
    id: number;
    order_number: string;
    items: { product_id: number; name: string }[];
    has_rider: boolean;
    store_name: string;
};

/** Website problem catalog (config/reports.php → system_categories / system_areas). */
export type SystemCategory = { label: string; hint: string };
