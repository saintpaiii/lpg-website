import { Head } from '@inertiajs/react';
import { Info } from 'lucide-react';
import { useState } from 'react';
import ChatPage from '@/components/chat/chat-page';
import QuickReplies from '@/components/chat/quick-replies';
import SellerCrmPanel from '@/components/chat/seller-crm-panel';
import type { ConversationHeader, ConversationItem, Paginated, QuickReply } from '@/components/chat/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Messages', href: '/seller/messages' }];

type Props = {
    conversations: Paginated<ConversationItem>;
    openId: number | null;
    quickReplies: QuickReply[];
    canReply: boolean;
};

export default function SellerMessages({ conversations, openId, quickReplies, canReply }: Props) {
    const [replies, setReplies] = useState<QuickReply[]>(quickReplies);
    const [sheetFor, setSheetFor] = useState<ConversationHeader | null>(null);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Messages" />
            <div className="flex flex-col gap-3 p-3 sm:p-6">
                <h1 className="text-xl font-bold tracking-tight">Messages</h1>
                <ChatPage
                    portal="seller"
                    conversations={conversations}
                    openId={openId}
                    emptyText="No conversations yet. Customers can message your store from their orders and your store page."
                    // Details button (the panel is a third column on extra-wide screens)
                    headerActions={(h) => (
                        <Button type="button" variant="ghost" size="icon" className="xl:hidden" aria-label="Customer details" onClick={() => setSheetFor(h)}>
                            <Info className="h-5 w-5" />
                        </Button>
                    )}
                    composerTools={(insert) => (
                        <QuickReplies replies={replies} onChange={setReplies} onInsert={insert} canManage={canReply} />
                    )}
                    sidePanel={(h) => h && (
                        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l xl:block">
                            <SellerCrmPanel header={h} />
                        </aside>
                    )}
                />
            </div>

            <Sheet open={!!sheetFor} onOpenChange={(o) => !o && setSheetFor(null)}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
                    <SheetHeader><SheetTitle>{sheetFor?.type === 'store_rider' ? 'Rider details' : 'Customer details'}</SheetTitle></SheetHeader>
                    {sheetFor && <SellerCrmPanel header={sheetFor} />}
                </SheetContent>
            </Sheet>
        </AppLayout>
    );
}
