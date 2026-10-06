import { Bike, MessageSquare, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { relativeTime } from './format';
import type { ConversationItem } from './types';

const AVATAR_TONES = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700'];

export function Avatar({ initials, seed, className, src }: { initials: string; seed: number; className?: string; src?: string | null }) {
    if (src) {
        return <img src={src} alt="" className={cn('h-10 w-10 shrink-0 rounded-full border object-cover', className)} />;
    }
    return (
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold', AVATAR_TONES[seed % AVATAR_TONES.length], className)}>
            {initials}
        </span>
    );
}

export default function ConversationList({ items, activeId, onSelect, emptyText }: {
    items: ConversationItem[];
    activeId: number | null;
    onSelect: (id: number) => void;
    emptyText: string;
}) {
    const [q, setQ] = useState('');
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return needle ? items.filter((c) => c.title.toLowerCase().includes(needle) || c.subtitle.toLowerCase().includes(needle)) : items;
    }, [items, q]);

    return (
        <div className="flex h-full flex-col">
            <div className="border-b p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="h-9 pl-8" aria-label="Search conversations" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-gray-500">
                        <MessageSquare className="h-8 w-8 text-gray-300" />
                        {emptyText}
                    </div>
                ) : shown.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">No conversations match “{q}”.</p>
                ) : (
                    <ul>
                        {shown.map((c) => {
                            const active = c.id === activeId;
                            const unread = c.unread_count > 0 && !active;
                            return (
                                <li key={c.id}>
                                    <button type="button" onClick={() => onSelect(c.id)}
                                        className={cn('flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors',
                                            active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60')}>
                                        <Avatar initials={c.initials} seed={c.id} src={c.avatar_url} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline gap-2">
                                                <span className={cn('truncate text-sm', unread ? 'font-bold' : 'font-semibold')}>{c.title}</span>
                                                <span className="ml-auto shrink-0 text-[11px] text-gray-400">{relativeTime(c.last_message_at)}</span>
                                            </span>
                                            <span className={cn('flex items-center gap-1.5 text-[11px]', c.rider_active ? 'font-medium text-amber-700' : 'text-gray-500')}>
                                                {c.rider_active && <Bike className="h-3 w-3 shrink-0" />}
                                                <span className="truncate">{c.subtitle}</span>
                                                {c.is_closed && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-500 dark:bg-gray-800">Closed</span>}
                                            </span>
                                            <span className="mt-0.5 flex items-center gap-2">
                                                <span className={cn('truncate text-xs', unread ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500')}>
                                                    {c.last_message_preview ?? 'No messages yet'}
                                                </span>
                                                {unread && (
                                                    <span className="ml-auto shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                                                        {c.unread_count > 99 ? '99+' : c.unread_count}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
