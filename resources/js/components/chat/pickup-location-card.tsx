import { Link } from '@inertiajs/react';
import { ExternalLink, MapPin } from 'lucide-react';
import type { ChatMessage, ChatPortal } from '@/components/chat/types';

type PickupCard = NonNullable<ChatMessage['pickup_card']>;

/**
 * "Pick-up location" card in the store's pick-up chat messages. The customer opens our map & route on the order page;
 * the seller opens the order; riders get no in-app button. Google Maps is only a secondary link.
 * Explicit colours: on the seller side store messages are blue "mine" bubbles with white text.
 */
export default function PickupLocationCard({ card, orderId, portal }: { card: PickupCard; orderId: number; portal: ChatPortal }) {
    const inApp = portal === 'customer'
        ? { href: `/customer/orders/${orderId}${card.active ? '#pickup-map' : ''}`, label: card.active ? 'View map & route' : 'Open order' }
        : portal === 'seller'
            ? { href: `/seller/orders/${orderId}`, label: 'Open order' }
            : null;

    return (
        <div className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-left text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                <MapPin className="h-3.5 w-3.5" /> Pick-up location
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{card.store_name}</p>
            {card.address && <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{card.address}</p>}
            <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                {inApp && (
                    <Link href={inApp.href}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 sm:w-auto">
                        <MapPin className="h-3.5 w-3.5" /> {inApp.label}
                    </Link>
                )}
                <a href={card.google_url} target="_blank" rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto">
                    <ExternalLink className="h-3 w-3" /> Google Maps
                </a>
            </div>
        </div>
    );
}
