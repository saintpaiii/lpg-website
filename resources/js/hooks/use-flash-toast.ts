import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Automatically shows Sonner toasts whenever Inertia flash messages are present.
 * Call this hook once in a layout component so every page benefits automatically.
 */
export function useFlashToast() {
    const flash = (usePage().props as any).flash as
        | { success?: string; error?: string; info?: string; warning?: string }
        | undefined;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success, { id: `flash-success:${flash.success}`, duration: 3000 });
        if (flash?.error)   toast.error(flash.error,     { id: `flash-error:${flash.error}`,     duration: 3000 });
        if (flash?.info)    toast.info(flash.info,       { id: `flash-info:${flash.info}`,       duration: 5000 });
        if (flash?.warning) toast.warning(flash.warning, { id: `flash-warning:${flash.warning}`, duration: 7000 });
    }, [flash?.success, flash?.error, flash?.info, flash?.warning]);
}
