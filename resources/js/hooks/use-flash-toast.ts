import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Automatically shows Sonner toasts whenever Inertia flash messages are present.
 * Call this hook once in a layout component so every page benefits automatically.
 */
export function useFlashToast() {
    const flash = (usePage().props as any).flash as
        | { success?: string; error?: string }
        | undefined;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success, { id: `flash-success:${flash.success}` });
        if (flash?.error)   toast.error(flash.error,     { id: `flash-error:${flash.error}` });
    }, [flash?.success, flash?.error]);
}
