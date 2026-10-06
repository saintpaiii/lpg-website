import { Head } from '@inertiajs/react';
import ChatPage from '@/components/chat/chat-page';
import MessageButton from '@/components/chat/message-button';
import type { ConversationItem, Paginated } from '@/components/chat/types';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Messages', href: '/rider/messages' }];

/** Store chat first, then customers of active deliveries, closed chats last. */
const riderOrder = (items: ConversationItem[]) => {
    const rank = (c: ConversationItem) => (c.type === 'store_rider' ? 0 : c.is_closed ? 2 : 1);
    return [...items].sort((a, b) => rank(a) - rank(b));
};

export default function RiderMessages({ conversations, openId }: { conversations: Paginated<ConversationItem>; openId: number | null }) {
    const hasStoreChat = conversations.data.some((c) => c.type === 'store_rider');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Messages" />
            <div className="flex flex-col gap-3 p-3 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-bold tracking-tight">Messages</h1>
                    {!hasStoreChat && <MessageButton portal="rider" params={{}} label="Message store" />}
                </div>
                <ChatPage
                    portal="rider"
                    conversations={conversations}
                    openId={openId}
                    sortItems={riderOrder}
                    emptyText="No conversations yet. Customer chats appear here when you're assigned a delivery."
                />
            </div>
        </AppLayout>
    );
}
