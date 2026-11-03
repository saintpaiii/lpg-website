import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceM, isInServiceArea, lookupAddress, SERVICE_AREA_MESSAGE, type FilledAddress } from '@/lib/map';

const DEBOUNCE_MS = 600;
/** A pin moved less than this from the last looked-up point isn't looked up again */
const MIN_MOVE_M = 15;
const NOTE_MS = 6000;

export type AutoFillAddress = {
    /** Pin finished moving (drag end / map tap): looked up after 600 ms, skipped when < 15 m from the last lookup */
    onPinMoved: (lat: number, lng: number) => void;
    /** Look up right away ("Use my current location") */
    fillNow: (lat: number, lng: number) => void;
    busy: boolean;
    /** "Address filled from your location — please check it." — 6 s, or until a field is edited */
    note: string | null;
    dismissNote: () => void;
    /** Outside Cavite */
    message: string | null;
    /** Did the user put the pin where it is (drag, tap, location, search — or a saved pin)? Then field edits never move it. */
    isPinned: () => boolean;
    setPinned: (pinned: boolean) => void;
};

/**
 * Moving the map pin fills City + Barangay + Street from that spot. One shared behaviour for every address map.
 * Lookups only happen after the user moves the pin or presses "Use my current location" — never on load.
 *
 * `apply` must set city, barangay and street in ONE state update, without the barangay-change handlers
 * (those could move the pin). The found street replaces the current one; with no street found it is kept.
 * Afterwards the user may edit every field freely — the pin (and the saved coordinates) stay where they are.
 */
export function useAutoFillAddress({ street, apply, enabled = true, pinned = false }: {
    street: string;
    apply: (address: FilledAddress) => void;
    /** e.g. checkout: only for a new address, not while a saved address is selected */
    enabled?: boolean;
    /** The form opens with a saved pin */
    pinned?: boolean;
}): AutoFillAddress {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Latest values for the async lookup
    const streetRef = useRef(street);
    streetRef.current = street;
    const applyRef = useRef(apply);
    applyRef.current = apply;

    const pinnedRef = useRef(pinned);
    const lastPoint = useRef<{ lat: number; lng: number } | null>(null);
    const timer     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seq       = useRef(0);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
        if (noteTimer.current) clearTimeout(noteTimer.current);
    }, []);

    const dismissNote = useCallback(() => {
        if (noteTimer.current) clearTimeout(noteTimer.current);
        setNote(null);
    }, []);

    const run = useCallback(async (lat: number, lng: number, force: boolean) => {
        if (!force && lastPoint.current && distanceM(lastPoint.current.lat, lastPoint.current.lng, lat, lng) < MIN_MOVE_M) return;
        if (!isInServiceArea(lat, lng)) { ++seq.current; setBusy(false); setMessage(SERVICE_AREA_MESSAGE); return; }
        setMessage(null);
        lastPoint.current = { lat, lng };

        const mine = ++seq.current;
        setBusy(true);
        const found = await lookupAddress(lat, lng);
        if (mine !== seq.current) return;       // the pin moved again meanwhile
        setBusy(false);
        if (!found) return;                     // fields stay as they are (an error toast was shown)

        applyRef.current({ city: found.city, barangay: found.barangay, street: found.street ?? streetRef.current });

        if (noteTimer.current) clearTimeout(noteTimer.current);
        setNote(`Address filled from your location — please check it.${found.approximate ? ' (approximate)' : ''}`);
        noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
    }, []);

    const onPinMoved = useCallback((lat: number, lng: number) => {
        pinnedRef.current = true;
        if (!enabled) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void run(lat, lng, false), DEBOUNCE_MS);
    }, [enabled, run]);

    const fillNow = useCallback((lat: number, lng: number) => {
        pinnedRef.current = true;
        if (timer.current) clearTimeout(timer.current);
        void run(lat, lng, true);
    }, [run]);

    const isPinned = useCallback(() => pinnedRef.current, []);
    const setPinned = useCallback((p: boolean) => { pinnedRef.current = p; }, []);

    return { onPinMoved, fillNow, busy, note, dismissNote, message, isPinned, setPinned };
}

/** Tiny "Finding address…" next to the address fields while a lookup runs. */
export function AutoFillBusy({ auto }: { auto?: AutoFillAddress | null }) {
    if (!auto?.busy) return null;
    return (
        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" role="status">
            <Loader2 className="h-3 w-3 animate-spin" /> Finding address…
        </span>
    );
}

/** Under the street field: the short "filled from your location" note and the outside-Cavite message. */
export function AutoFillNote({ auto }: { auto?: AutoFillAddress | null }) {
    if (!auto) return null;
    return (
        <>
            {auto.note && <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">{auto.note}</p>}
            {auto.message && <p className="text-xs text-red-600">{auto.message}</p>}
        </>
    );
}
