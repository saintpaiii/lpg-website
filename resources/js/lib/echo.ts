import axios from 'axios';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { useEffect, useRef, useState } from 'react';

/**
 * Live updates through Pusher (hosted websockets — works on shared hosting).
 * Without VITE_PUSHER_APP_KEY there is no Echo at all and every page keeps polling as before.
 */
type RealtimeStatus = 'connected' | 'connecting' | 'unavailable';

const key = import.meta.env.VITE_PUSHER_APP_KEY as string | undefined;
const cluster = (import.meta.env.VITE_PUSHER_APP_CLUSTER as string | undefined) || 'ap1';

function createEcho(): Echo<'pusher'> | null {
    if (!key || typeof window === 'undefined') return null;
    try {
        (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
        return new Echo({
            broadcaster: 'pusher',
            key,
            cluster,
            forceTLS: true,
            // Authorise private channels with the normal session + XSRF cookie (same as every axios call)
            authorizer: (channel: { name: string }) => ({
                authorize: (socketId: string, callback: (error: Error | null, data: { auth: string; channel_data?: string } | null) => void) => {
                    axios.post<{ auth: string; channel_data?: string }>('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
                        .then((res) => callback(null, res.data))
                        .catch((err) => callback(err instanceof Error ? err : new Error('auth failed'), null));
                },
            }),
        });
    } catch {
        return null;
    }
}

export const echo = createEcho();

// ── connection status (shared by every hook) ────────────────────────────────

let status: RealtimeStatus = echo ? 'connecting' : 'unavailable';
const listeners = new Set<(s: RealtimeStatus) => void>();

if (echo) {
    const connection = (echo.connector as unknown as { pusher: Pusher }).pusher.connection;
    connection.bind('state_change', ({ current }: { current: string }) => {
        status = current === 'connected' ? 'connected'
            : current === 'connecting' || current === 'initialized' ? 'connecting'
            : 'unavailable';   // unavailable / failed / disconnected
        listeners.forEach((l) => l(status));
    });
}

/** 'connected' when live updates are flowing; pages slow their polling down then. */
export function useRealtimeStatus(): RealtimeStatus {
    const [s, setS] = useState<RealtimeStatus>(status);
    useEffect(() => {
        listeners.add(setS);
        setS(status);
        return () => { listeners.delete(setS); };
    }, []);
    return s;
}

/** Poll interval: the normal one, or a 60 s safety net while live updates are connected. */
export function usePollInterval(normalMs: number): number {
    return useRealtimeStatus() === 'connected' ? Math.max(normalMs, 60_000) : normalMs;
}

/**
 * Listen to one event on a private channel ('user.5', 'conversation.12', 'store.3').
 * Event names match the Laravel class (e.g. 'MessageSent'). No-op without Echo or channel.
 */
export function useEchoPrivate<T = unknown>(channel: string | null, event: string, handler: (payload: T) => void): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!echo || !channel) return;
        const listener = (payload: T) => handlerRef.current(payload);
        const ch = echo.private(channel);
        ch.listen(`.${event}`, listener);
        return () => {
            ch.stopListening(`.${event}`, listener);
            // Leave the channel only when nothing else on the page uses it
            const pusher = (echo!.connector as unknown as { pusher: Pusher }).pusher;
            const sub = pusher.channel(`private-${channel}`) as unknown as { callbacks?: { _callbacks?: Record<string, unknown[]> } } | undefined;
            const remaining = Object.entries(sub?.callbacks?._callbacks ?? {})
                .filter(([name]) => !name.startsWith('_pusher_internal') && !name.startsWith('_pusher:'))
                .reduce((n, [, cbs]) => n + (cbs?.length ?? 0), 0);
            if (remaining === 0) echo!.leave(channel);
        };
    }, [channel, event]);
}

// ── order / delivery pages ───────────────────────────────────────────────────

export type OrderEvent = { order_id: number; order_number?: string; status: string; payment_status?: string; is_new?: boolean };
export type DeliveryEvent = { delivery_id: number; order_id: number; status: string; rider_id: number | null };

const ORDER_STATUS_LABELS: Record<string, string> = {
    pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing', out_for_delivery: 'Out for delivery',
    delivered: 'Delivered', cancelled: 'Cancelled',
    assigned: 'Rider assigned', picked_up: 'Picked up', in_transit: 'On the way', failed: 'Delivery failed',
};
export const statusLabel = (s: string) => ORDER_STATUS_LABELS[s] ?? s.replace(/_/g, ' ');

/**
 * Reload some page props when an order / delivery changes (OrderUpdated / DeliveryUpdated on a
 * 'user.{id}' or 'store.{id}' channel), debounced 500 ms. `filter` picks the relevant events;
 * `onEvent` can show a toast.
 */
export function useLiveReload(
    channel: string | null,
    only: string[],
    filter: (e: OrderEvent | DeliveryEvent, kind: 'order' | 'delivery') => boolean = () => true,
    onEvent?: (e: OrderEvent | DeliveryEvent, kind: 'order' | 'delivery') => void,
): void {
    const onlyKey = only.join(',');
    const reload = useDebounced(() => {
        // Lazy import keeps this module free of Inertia for non-page users
        import('@inertiajs/react').then(({ router }) => router.reload({ only: onlyKey.split(',') }));
    }, 500);
    const handle = (kind: 'order' | 'delivery') => (e: OrderEvent | DeliveryEvent) => {
        if (!filter(e, kind)) return;
        onEvent?.(e, kind);
        reload();
    };
    useEchoPrivate<OrderEvent>(channel, 'OrderUpdated', handle('order'));
    useEchoPrivate<DeliveryEvent>(channel, 'DeliveryUpdated', handle('delivery'));
}

/** Debounce helper for "something changed → reload" handlers. */
export function useDebounced(fn: () => void, ms: number): () => void {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fnRef = useRef(fn);
    fnRef.current = fn;
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fnRef.current(), ms);
    };
}
