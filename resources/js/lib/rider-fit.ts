import { riderDisabled, riderLicenseSuffix, type RiderLicenseFields } from '@/lib/rider-license';

/** What the server adds to every rider in the pickers (RiderLoadService::forRiders) */
export type RiderLoadFields = RiderLicenseFields & {
    clocked_in?: boolean;
    vehicle?: { id: number; type: string; label: string; plate: string } | null;
    load?: { kg: number; tanks: number; max_kg: number; max_tanks: number; free_kg: number; free_tanks: number };
};

export type Load = { kg: number; tanks: number };

const kg = (n: number) => String(Math.round(n * 100) / 100);
const icon = (type?: string) => (type === 'motorcycle' || type === 'tricycle' ? '🏍' : type?.includes('truck') ? '🚚' : '🚐');

export const sumLoads = (loads: (Load | null | undefined)[]): Load =>
    loads.reduce<Load>((s, l) => ({ kg: Math.round((s.kg + (l?.kg ?? 0)) * 100) / 100, tanks: s.tanks + (l?.tanks ?? 0) }), { kg: 0, tanks: 0 });

/** Can this rider's vehicle take the load on top of what it carries? (same rule as RiderLoadService::canTake) */
export function riderFit(r: RiderLoadFields, need: Load | null): { ok: boolean; reason: string | null } {
    if (r.clocked_in === undefined) return { ok: true, reason: null };   // page without load data
    if (!r.vehicle || !r.load) return { ok: false, reason: r.clocked_in ? 'no vehicle chosen' : 'not clocked in' };
    if (!need) return { ok: true, reason: null };
    if (need.kg > r.load.free_kg + 0.001 || need.tanks > r.load.free_tanks) {
        return { ok: false, reason: `needs ${kg(need.kg)} kg / ${need.tanks} tank(s)` };
    }
    return { ok: true, reason: null };
}

/**
 * "Best fit" = among riders that fit, the smallest remaining share on the BINDING limit after this load
 * (packs the smallest vehicle first, keeps big vehicles free). Ties → smaller vehicle → name.
 */
export function bestFitId<T extends RiderLoadFields & { id: number; name: string }>(riders: T[], need: Load | null): number | null {
    if (!need) return null;
    const scored = riders
        .filter((r) => !riderDisabled(r) && riderFit(r, need).ok && r.load)
        .map((r) => {
            const l = r.load!;
            const share = Math.min((l.free_kg - need.kg) / Math.max(1, l.max_kg), (l.free_tanks - need.tanks) / Math.max(1, l.max_tanks));
            return { r, share, size: l.max_kg };
        })
        .sort((a, b) => a.share - b.share || a.size - b.size || a.r.name.localeCompare(b.r.name));
    return scored[0]?.r.id ?? null;
}

/** Option text: "Juan — 🏍 ABC-123 · 35 kg / 1 tank free" / "Pedro — not clocked in" (+ license note, + Best fit). */
export function riderOptionLabel(r: RiderLoadFields & { name: string }, need: Load | null, best: boolean): string {
    const license = riderLicenseSuffix(r);
    if (r.clocked_in === undefined) return `${r.name}${license}`;
    const fit = riderFit(r, need);
    const vehicle = r.vehicle && r.load
        ? ` — ${icon(r.vehicle.type)} ${r.vehicle.plate} · ${kg(r.load.free_kg)} kg / ${r.load.free_tanks} tank${r.load.free_tanks === 1 ? '' : 's'} free`
        : ` — ${fit.reason ?? 'not clocked in'}`;
    const why = r.vehicle && !fit.ok && fit.reason ? ` (${fit.reason})` : '';
    return `${r.name}${vehicle}${why}${license}${best ? '  ★ Best fit' : ''}`;
}

/** Disabled in a picker: license / paused, not clocked in with a vehicle, or the load doesn't fit. */
export const riderOptionDisabled = (r: RiderLoadFields, need: Load | null): boolean => riderDisabled(r) || !riderFit(r, need).ok;
