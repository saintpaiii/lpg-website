// Order status labels — pick-up orders reuse the delivery statuses but say "Ready for pick-up" / "Picked up"
// (mirrors App\Models\Order::statusLabel).

export type Fulfillment = 'delivery' | 'pickup';

const LABELS: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
};

const PICKUP_LABELS: Record<string, string> = {
    out_for_delivery: 'Ready for pick-up',
    delivered: 'Picked up',
};

export function orderStatusLabel(status: string, fulfillment?: string | null): string {
    if (fulfillment === 'pickup' && PICKUP_LABELS[status]) return PICKUP_LABELS[status];
    return LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const isPickup = (o: { fulfillment?: string | null }) => o.fulfillment === 'pickup';

/** Google Maps link for a store pin (or its address when there is no pin). */
export function mapsUrl(lat: number | null | undefined, lng: number | null | undefined, address?: string | null): string | null {
    if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    return null;
}
