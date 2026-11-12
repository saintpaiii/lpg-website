import axios from 'axios';
import { useSyncExternalStore } from 'react';
import type { TourProgressEntry } from './types';

/**
 * Tutorial progress kept at MODULE level (layouts remount on every page) and saved on the account.
 * The server copy (auth.user.tutorials) is MERGED in: old props restored by back/forward never turn "done" back into
 * "not seen" — except after "Reset all", which wipes anything older than the reset.
 */
type State = { progress: Record<string, TourProgressEntry>; enabled: boolean; resetAt: string | null };

let state: State = { progress: {}, enabled: true, resetAt: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Timestamps come as "…+08:00" (server) or "…Z" (browser) — compare as times, not text
const t = (x: string | null) => (x ? Date.parse(x) || 0 : 0);
const newer = (a: string | null, b: string | null) => (!a ? b : !b ? a : t(a) >= t(b) ? a : b);

/** Merge the server's copy (called by the layouts on every page). */
export function syncFromServer(tutorials: unknown, enabled: unknown): void {
    let changed = false;
    const incoming = (tutorials && typeof tutorials === 'object' ? tutorials : {}) as Record<string, Partial<TourProgressEntry>>;
    const next = { ...state.progress };
    for (const [key, e] of Object.entries(incoming)) {
        const done = e?.done ?? null;
        const skipped = e?.skipped ?? null;
        // Older than "Reset all" → ignore (stale props from back/forward)
        if (state.resetAt && t(done) < t(state.resetAt) && t(skipped) < t(state.resetAt)) continue;
        const cur = next[key] ?? { done: null, skipped: null };
        const merged = { done: newer(cur.done, done), skipped: newer(cur.skipped, skipped) };
        if (merged.done !== cur.done || merged.skipped !== cur.skipped) { next[key] = merged; changed = true; }
    }
    const en = enabled === undefined || enabled === null ? state.enabled : Boolean(enabled);
    if (changed || en !== state.enabled) {
        state = { ...state, progress: next, enabled: en };
        emit();
    }
}

export function getProgress(): State {
    return state;
}

export function isSeen(key: string): boolean {
    const e = state.progress[key];
    return !!(e?.done || e?.skipped);
}

export function statusOf(key: string): 'done' | 'skipped' | 'new' {
    const e = state.progress[key];
    return e?.done ? 'done' : e?.skipped ? 'skipped' : 'new';
}

function setLocal(key: string, field: 'done' | 'skipped') {
    const cur = state.progress[key] ?? { done: null, skipped: null };
    state = { ...state, progress: { ...state.progress, [key]: { ...cur, [field]: new Date().toISOString() } } };
    emit();
}

export function markDone(key: string): void {
    setLocal(key, 'done');
    axios.post(`/tutorials/${key}/done`).catch(() => { /* saved locally for this visit; retried next time */ });
}

export function markSkipped(key: string): void {
    setLocal(key, 'skipped');
    axios.post(`/tutorials/${key}/skip`).catch(() => {});
}

export async function resetAll(): Promise<void> {
    await axios.post('/tutorials/reset');
    state = { ...state, progress: {}, resetAt: new Date().toISOString() };
    emit();
}

export async function setEnabled(enabled: boolean): Promise<void> {
    state = { ...state, enabled };
    emit();
    await axios.put('/tutorials/settings', { enabled });
}

export function useTutorialProgress(): State {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => listeners.delete(l); },
        () => state,
        () => state,
    );
}
