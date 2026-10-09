import { router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { useDebounced, useEchoPrivate, useRealtimeStatus } from '@/lib/echo';
import type { SharedData } from '@/types';

/**
 * Keep a report page fresh: reload `only` (plus the sidebar badges) when a ReportUpdated event
 * arrives on my own user channel (reports never go over store.{id}), and every 60 s as a fallback
 * when live updates aren't connected.
 */
export function useReportLive(only: string[], reportId?: number) {
    const me = usePage<SharedData>().props.auth.user.id as number;
    const live = useRealtimeStatus();
    const props = [...only, 'reportBadges'];
    const reload = useDebounced(() => router.reload({ only: props }), 600);

    useEchoPrivate<{ report_id: number }>(`user.${me}`, 'ReportUpdated', (e) => {
        if (reportId === undefined || e.report_id === reportId) reload();
    });

    useEffect(() => {
        if (live === 'connected') return;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') router.reload({ only: props });
        }, 60_000);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live, props.join(',')]);
}
