import { usePage } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useEchoPrivate, usePollInterval } from '@/lib/echo';
import type { SharedData } from '@/types';
import type { ChatPortal } from './types';

/**
 * Unread chat messages for the nav badge: shared Inertia prop on each page load, live
 * UnreadCountChanged pushes, and a poll (30 s, or a 60 s safety net while live).
 */
export function useUnreadMessages(portal: ChatPortal | null): number {
    const { props } = usePage<SharedData>();
    const initial = props.unreadMessages ?? 0;
    const userId = props.auth?.user?.id as number | undefined;
    const [count, setCount] = useState(initial);
    const interval = usePollInterval(30_000);

    useEffect(() => { setCount(initial); }, [initial]);

    useEchoPrivate<{ count: number }>(portal && userId ? `user.${userId}` : null, 'UnreadCountChanged', (e) => setCount(e.count));

    useEffect(() => {
        if (!portal) return;
        const poll = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await axios.get<{ count: number }>(`/${portal}/messages/unread-count`);
                setCount(res.data.count);
            } catch {
                // ignore network errors / no access
            }
        };
        const id = setInterval(poll, interval);
        const onUpdate = (e: Event) => setCount((e as CustomEvent<number>).detail);
        window.addEventListener('chat:unread', onUpdate);
        return () => { clearInterval(id); window.removeEventListener('chat:unread', onUpdate); };
    }, [portal, interval]);

    return count;
}

/** Let open chat pages push a fresh count to the nav badge right away. */
export function announceUnread(count: number) {
    window.dispatchEvent(new CustomEvent('chat:unread', { detail: count }));
}
