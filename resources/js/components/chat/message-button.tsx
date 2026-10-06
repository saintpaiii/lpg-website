import { router } from '@inertiajs/react';
import { Loader2, MessageSquare } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import type { ChatPortal } from './types';

type StartParams = { store_id?: number; customer_id?: number; customer_user_id?: number; rider_id?: number; delivery_id?: number };

/** Opens (or creates) a conversation through the portal's messages/start route. */
export default function MessageButton({ portal, params, label, iconOnly = false, ...buttonProps }: {
    portal: ChatPortal;
    params: StartParams;
    label: string;
    iconOnly?: boolean;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>) {
    const [busy, setBusy] = useState(false);

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            {...buttonProps}
            disabled={busy || buttonProps.disabled}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.stopPropagation();
                router.post(`/${portal}/messages/start`, params, { onStart: () => setBusy(true), onFinish: () => setBusy(false) });
            }}
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            {!iconOnly && <span>{label}</span>}
        </Button>
    );
}
