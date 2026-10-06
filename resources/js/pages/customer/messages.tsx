import { Head } from '@inertiajs/react';
import ChatPage from '@/components/chat/chat-page';
import type { ConversationItem, Paginated } from '@/components/chat/types';
import CustomerLayout from '@/layouts/customer-layout';

export default function CustomerMessages({ conversations, openId }: { conversations: Paginated<ConversationItem>; openId: number | null }) {
    return (
        <CustomerLayout title="Messages">
            <Head title="Messages" />
            <ChatPage portal="customer" conversations={conversations} openId={openId} />
        </CustomerLayout>
    );
}
