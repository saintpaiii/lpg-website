import { router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDebounced, useEchoPrivate, usePollInterval } from '@/lib/echo';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';
import ConversationList from './conversation-list';
import MessageThread from './message-thread';
import { announceUnread } from './use-unread-messages';
import type { ChatPortal, ConversationHeader, ConversationItem, Paginated } from './types';

const EMPTY_INBOX = 'No conversations yet. You can message a store from any order or store page.';

/**
 * Inbox layout shared by the three portals: list (320 px) + thread on desktop,
 * list OR thread on phones. ?c={id} opens a conversation.
 */
export default function ChatPage({ portal, conversations, openId, emptyText = EMPTY_INBOX, sortItems, headerActions, composerTools, sidePanel }: {
    portal: ChatPortal;
    conversations: Paginated<ConversationItem>;
    openId: number | null;
    emptyText?: string;
    sortItems?: (items: ConversationItem[]) => ConversationItem[];
    headerActions?: (header: ConversationHeader) => ReactNode;
    composerTools?: (insert: (text: string) => void) => ReactNode;
    /** Optional third column (seller CRM), rendered next to the thread. */
    sidePanel?: (header: ConversationHeader | null) => ReactNode;
}) {
    const [activeId, setActiveId] = useState<number | null>(openId);
    const [header, setHeader] = useState<ConversationHeader | null>(null);
    const [readIds, setReadIds] = useState<Set<number>>(new Set());

    // Keep ?c= in the URL (so refresh / back keeps the open chat)
    const select = useCallback((id: number | null) => {
        setActiveId(id);
        setHeader(null);
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('c', String(id)); else url.searchParams.delete('c');
        window.history.replaceState(window.history.state, '', url.toString());
    }, []);

    useEffect(() => { if (openId) setActiveId(openId); }, [openId]);

    // Refresh the list: live when a message arrives anywhere (debounced), plus a poll
    // (15 s, or a 60 s safety net while live updates are connected) — the open thread is untouched
    const me = usePage<SharedData>().props.auth.user.id as number;
    const pollMs = usePollInterval(15_000);
    const refreshList = useDebounced(() => router.reload({ only: ['conversations'] }), 1000);
    useEchoPrivate<{ count: number }>(`user.${me}`, 'UnreadCountChanged', (e) => { announceUnread(e.count); refreshList(); });
    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            router.reload({ only: ['conversations'] });
            axios.get<{ count: number }>(`/${portal}/messages/unread-count`).then((r) => announceUnread(r.data.count)).catch(() => {});
        }, pollMs);
        return () => clearInterval(id);
    }, [portal, pollMs]);

    const items = useMemo(() => {
        const list = conversations.data.map((c) => (c.id === activeId || readIds.has(c.id) ? { ...c, unread_count: c.id === activeId ? 0 : c.unread_count } : c));
        return sortItems ? sortItems(list) : list;
    }, [conversations.data, activeId, readIds, sortItems]);

    const onLoaded = useCallback((h: ConversationHeader) => {
        refreshList();
        setHeader(h);
        setReadIds((s) => new Set(s).add(h.id));
        axios.get<{ count: number }>(`/${portal}/messages/unread-count`).then((r) => announceUnread(r.data.count)).catch(() => {});
    }, [portal]);

    return (
        <div className="flex h-[calc(100dvh-11.5rem)] min-h-[420px] overflow-hidden rounded-xl border bg-white shadow-sm md:h-[calc(100dvh-9rem)] dark:bg-gray-950">
            {/* List */}
            <div className={cn('w-full shrink-0 border-r md:block md:w-80', activeId ? 'hidden' : 'block')}>
                <ConversationList items={items} activeId={activeId} onSelect={select} emptyText={emptyText} />
                {conversations.last_page > 1 && (
                    <p className="border-t px-3 py-2 text-center text-[11px] text-gray-400">Showing your {conversations.data.length} most recent conversations</p>
                )}
            </div>

            {/* Thread */}
            <div className={cn('min-w-0 flex-1', activeId ? 'block' : 'hidden md:block')}>
                {activeId ? (
                    <MessageThread
                        key={activeId}
                        portal={portal}
                        conversationId={activeId}
                        onBack={() => select(null)}
                        onLoaded={onLoaded}
                        headerActions={headerActions}
                        composerTools={composerTools}
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
                        <MessageSquare className="h-10 w-10 text-gray-300" />
                        Select a conversation
                    </div>
                )}
            </div>

            {sidePanel && activeId && sidePanel(header)}
        </div>
    );
}
