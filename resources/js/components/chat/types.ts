export type ChatPortal = 'customer' | 'seller' | 'rider';

export type ConversationType = 'customer_store' | 'store_rider' | 'customer_rider';

export type ConversationItem = {
    id: number;
    type: ConversationType;
    title: string;
    subtitle: string;
    /** A rider is currently in this customer↔store chat (subtitle shown in amber) */
    rider_active?: boolean;
    initials: string;
    avatar_url?: string | null;
    last_message_preview: string | null;
    last_message_at: string | null;
    unread_count: number;
    is_closed: boolean;
};

export type RiderStrip = {
    rider_id: number;
    name: string;
    phone: string | null;
    status: string | null;
    status_label: string;
    order_id: number | null;
    order_number: string | null;
};

export type ConversationHeader = {
    id: number;
    type: ConversationType;
    title: string;
    subtitle: string;
    initials: string;
    avatar_url?: string | null;
    store_name: string | null;
    is_closed: boolean;
    can_send: boolean;
    cannot_send_reason: 'closed' | 'rider_ended' | 'no_permission' | 'store_unavailable' | 'no_access' | null;
    phone: string | null;
    /** Customer & seller views: rider(s) currently in this chat */
    riders: RiderStrip[];
    /** Rider view: the delivery they're on */
    my_delivery: { order_id: number; order_number: string; status: string; status_label: string; navigate_url: string | null } | null;
};

/** Same for every viewer; the page works out "is this mine" from side / sender_id. */
export type ChatMessage = {
    id: number;
    conversation_id?: number;
    side: 'customer' | 'store' | 'rider' | 'system';
    sender_id: number | null;
    is_automatic: boolean;
    sender_name: string | null;
    body: string | null;
    attachment_url: string | null;
    order: { id: number; order_number: string | null } | null;
    created_at: string | null;
    /** Client-only: optimistic send state */
    status?: 'sending' | 'failed';
    retry?: { body: string; image: File | null };
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    next_page_url: string | null;
    total: number;
};

export type QuickReply = { id: number; title: string; body: string };
