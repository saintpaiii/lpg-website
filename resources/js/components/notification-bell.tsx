import { router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { Bell, BellOff, Check, CheckCheck, Package, Settings, Truck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppNotification, SharedData } from '@/types';

function typeIcon(type: string) {
    switch (type) {
        case 'order_update':    return <Package className="h-4 w-4 text-blue-500" />;
        case 'delivery_update': return <Truck className="h-4 w-4 text-orange-500" />;
        case 'payment':         return <span className="h-4 w-4 text-green-500 text-xs font-bold flex items-center justify-center">₱</span>;
        default:                return <Settings className="h-4 w-4 text-gray-400" />;
    }
}

export function NotificationBell() {
    const { unreadNotifications: initialUnread, recentNotifications, auth } = usePage<SharedData>().props;
    const notificationsHref = auth.user.role === 'customer' ? '/customer/notifications' : '/notifications';

    const [open, setOpen]             = useState(false);
    const [unread, setUnread]         = useState(initialUnread);
    const [shaking, setShaking]       = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Sync with fresh Inertia shared data on page navigation
    useEffect(() => { setUnread(initialUnread); }, [initialUnread]);

    // Poll unread count every 30 seconds
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await axios.get<{ count: number }>('/notifications/unread-count');
                const newCount = res.data.count;
                if (newCount > unread) {
                    setShaking(true);
                    setTimeout(() => setShaking(false), 600);
                }
                setUnread(newCount);
            } catch {
                // silently ignore network errors
            }
        };

        const id = setInterval(poll, 30_000);
        return () => clearInterval(id);
    }, [unread]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const markRead = useCallback((id: number) => {
        router.post(`/notifications/${id}/read`, {}, {
            preserveScroll: true,
            onSuccess: () => setUnread(c => Math.max(0, c - 1)),
        });
    }, []);

    const markAllRead = useCallback(() => {
        router.post('/notifications/read-all', {}, {
            preserveScroll: true,
            onSuccess: () => setUnread(0),
        });
        setOpen(false);
    }, []);

    function goToNotification(n: AppNotification) {
        markRead(n.id);
        const link = n.data?.link as string | undefined;
        if (link) router.visit(link);
        setOpen(false);
    }

    return (
        <div ref={ref} className="relative">
            {/* Bell button */}
            <button
                onClick={() => setOpen(v => !v)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none ${shaking ? 'animate-shake' : ''}`}
                aria-label="Notifications"
            >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <span className="text-sm font-semibold text-foreground">Notifications</span>
                        {unread > 0 && (
                            <button
                                onClick={markAllRead}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-72 overflow-y-auto divide-y divide-border">
                        {recentNotifications.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                                <BellOff className="h-8 w-8 opacity-30" />
                                <p className="text-xs">No new notifications</p>
                            </div>
                        ) : (
                            recentNotifications.map(n => (
                                <div
                                    key={n.id}
                                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50 cursor-pointer"
                                    onClick={() => goToNotification(n)}
                                >
                                    <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                                        <p className="mt-1 text-[10px] text-muted-foreground/60">{n.created_at}</p>
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                                        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                        title="Mark as read"
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t px-4 py-2">
                        <button
                            onClick={() => { router.visit(notificationsHref); setOpen(false); }}
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            View all notifications →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
