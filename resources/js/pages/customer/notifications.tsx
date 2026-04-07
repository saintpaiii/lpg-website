import { Head, router, usePage } from '@inertiajs/react';
import { Bell, BellOff, Check, CheckCheck, Package, Settings, Truck } from 'lucide-react';
import { useState } from 'react';
import CustomerLayout from '@/layouts/customer-layout';
import type { AppNotification, SharedData } from '@/types';

type PaginatedNotification = AppNotification & { read_at: string | null };

type PaginatedNotifications = {
    data: PaginatedNotification[];
    current_page: number;
    last_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    notifications: PaginatedNotifications;
};

function typeIcon(type: string) {
    switch (type) {
        case 'order_update':    return <Package className="h-4 w-4 text-blue-500" />;
        case 'delivery_update': return <Truck className="h-4 w-4 text-orange-500" />;
        case 'payment':         return <span className="flex h-4 w-4 items-center justify-center text-xs font-bold text-green-500">₱</span>;
        default:                return <Settings className="h-4 w-4 text-gray-400" />;
    }
}

const TYPE_LABELS: Record<string, string> = {
    order_update: 'Order', delivery_update: 'Delivery', payment: 'Payment', system: 'System',
};

export default function CustomerNotifications({ notifications }: Props) {
    const { unreadNotifications } = usePage<SharedData>().props;
    const [tab, setTab] = useState<'all' | 'unread' | 'read'>('all');

    const filtered = notifications.data.filter(n => {
        if (tab === 'unread') return !n.read_at;
        if (tab === 'read')   return !!n.read_at;
        return true;
    });

    function markRead(id: number) {
        router.post(`/notifications/${id}/read`, {}, { preserveScroll: true });
    }

    function markAllRead() {
        router.post('/notifications/read-all', {}, { preserveScroll: true });
    }

    return (
        <CustomerLayout>
            <Head title="Notifications" />

            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-gray-500" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h1>
                    {unreadNotifications > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                            {unreadNotifications > 99 ? '99+' : unreadNotifications}
                        </span>
                    )}
                </div>
                {unreadNotifications > 0 && (
                    <button
                        onClick={markAllRead}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all as read
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
                {(['all', 'unread', 'read'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                            tab === t
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        {t}
                        {t === 'unread' && unreadNotifications > 0 && (
                            <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {unreadNotifications}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-200 py-16 text-center text-gray-400 dark:border-gray-700">
                    <BellOff className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No {tab === 'all' ? '' : tab} notifications.</p>
                </div>
            ) : (
                <div className="divide-y rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    {filtered.map(n => (
                        <div
                            key={n.id}
                            className={`flex items-start gap-4 px-5 py-4 transition-colors ${!n.read_at ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}
                        >
                            {/* Unread dot */}
                            <div className="mt-1 shrink-0">
                                {!n.read_at
                                    ? <span className="block h-2.5 w-2.5 rounded-full bg-blue-500" />
                                    : <span className="block h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-gray-600" />
                                }
                            </div>

                            {/* Icon */}
                            <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                        {TYPE_LABELS[n.type] ?? n.type}
                                    </span>
                                    <span className="text-xs text-gray-400">{n.created_at}</span>
                                </div>
                                <p className="font-medium text-gray-900 dark:text-white">{n.title}</p>
                                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{n.message}</p>
                            </div>

                            {/* Mark read */}
                            {!n.read_at && (
                                <button
                                    onClick={() => markRead(n.id)}
                                    className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                                    title="Mark as read"
                                >
                                    <Check className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {notifications.last_page > 1 && (
                <div className="mt-4 flex justify-center gap-1">
                    {notifications.links.map((link, i) => (
                        <button
                            key={i}
                            disabled={!link.url}
                            onClick={() => link.url && router.get(link.url, {}, { preserveScroll: true })}
                            className={`rounded px-3 py-1.5 text-sm transition-colors ${
                                link.active
                                    ? 'bg-blue-600 text-white'
                                    : 'border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400'
                            }`}
                            dangerouslySetInnerHTML={{ __html: link.label }}
                        />
                    ))}
                </div>
            )}
        </CustomerLayout>
    );
}
