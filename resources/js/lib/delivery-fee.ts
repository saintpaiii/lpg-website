/**
 * Delivery fee per vehicle type — the SAME rule as App\Services\DeliveryFeeService::quote():
 * among the store's vehicles that can carry the load (kg AND tanks AND per-size limits on the same vehicle — fits()),
 * the cheapest ceil((base + km × per_km) / 5) × 5 (no distance → base). Ties: lowest fee → smallest fitting vehicle → type order.
 */

/** Max tanks per gas size per trip, e.g. { "11": 4, "50": 1 } (J6). A missing size = no per-size limit. */
export type TankLimits = Record<string, number> | null;

export type VehicleCapacity = { kg: number; tanks: number; tank_limits?: TankLimits; label?: string };

export type DeliveryOption = {
    vehicle_type: string;
    label: string;
    base_fee: number;
    fee_per_km: number;
    /** One entry per usable vehicle of this type */
    capacities: VehicleCapacity[];
};

export type DeliveryQuote = { vehicle_type: string; label: string; fee: number };

/** kg, tanks and tanks per gas size ("11" → 3) */
export type Load = { kg: number; tanks: number; by_size: Record<string, number> };

/** Same order as config('delivery.vehicle_types') — last tie-break */
const TYPE_ORDER = ['motorcycle', 'tricycle', 'multicab', 'van', 'pickup_truck', 'small_truck', 'large_truck'];

/** Gas-size key like DeliveryFeeService::sizeKey: "2.7", "11", "50" (null when no size). */
export function sizeKey(gasKg: number | null | undefined): string | null {
    const gas = Math.round(Number(gasKg ?? 0) * 10) / 10;
    return gas > 0 ? String(gas) : null;
}

const num = (x: number) => String(Number(x.toFixed(2)));

/**
 * DeliveryFeeService::fits — null when the load fits the vehicle, else the reason. Total kg, total tanks, then each
 * per-size limit.
 */
export function fits(v: VehicleCapacity, load: { kg: number; tanks: number; by_size?: Record<string, number> }): string | null {
    const name = v.label ?? 'This vehicle';
    if (load.kg > v.kg + 0.001) return `${name} carries up to ${num(v.kg)} kg — this needs ${num(load.kg)} kg.`;
    if (load.tanks > v.tanks) return `${name} carries up to ${v.tanks} tanks — this needs ${load.tanks}.`;
    for (const [size, max] of Object.entries(v.tank_limits ?? {})) {
        if (max === null || max === undefined) continue;
        const need = load.by_size?.[size] ?? 0;
        if (need > max) return `${name} carries up to ${max} × ${size} kg tanks per trip — this needs ${need}.`;
    }
    return null;
}

export function quoteFee(options: DeliveryOption[] | undefined, distKm: number | null, kg: number, tanks: number, bySize: Record<string, number> = {}): DeliveryQuote | null {
    let best: { key: [number, number, number]; quote: DeliveryQuote } | null = null;
    for (const o of options ?? []) {
        const fitting = o.capacities.filter((c) => fits(c, { kg, tanks, by_size: bySize }) === null);
        if (fitting.length === 0) continue;
        const fee = Math.ceil((o.base_fee + (distKm ?? 0) * o.fee_per_km) / 5) * 5;
        const smallest = Math.min(...fitting.map((c) => c.kg));
        const order = TYPE_ORDER.indexOf(o.vehicle_type);
        const key: [number, number, number] = [fee, smallest, order < 0 ? 99 : order];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) {
            best = { key, quote: { vehicle_type: o.vehicle_type, label: o.label, fee } };
        }
    }
    return best?.quote ?? null;
}

/** FULL tank weight (gas + cylinder) by gas size — must match config('delivery.full_tank_kg'). */
export const FULL_TANK_KG: Record<string, number> = { '2.7': 7, '5': 12, '7': 15, '11': 25, '22': 45, '50': 90 };

/** Weight of one full tank for a gas size (DeliveryFeeService::fullTankKg); no size → 0. */
export function fullTankKg(gasKg: number | null | undefined): number {
    const gas = Math.round(Number(gasKg ?? 0) * 10) / 10;
    if (!(gas > 0)) return 0;
    return FULL_TANK_KG[String(gas)] ?? Math.round(gas * 2 * 10) / 10;
}

/** Load of order lines: kg = Σ full-tank weight × qty, tanks = qty of lines with a size, by_size = tanks per size. */
export function orderLoad(lines: { weight_kg?: number | null; quantity: number }[]): Load {
    let kg = 0;
    let tanks = 0;
    const by_size: Record<string, number> = {};
    for (const l of lines) {
        const w = Number(l.weight_kg ?? 0);
        kg += fullTankKg(w) * l.quantity;
        const key = sizeKey(w);
        if (key) {
            tanks += l.quantity;
            by_size[key] = (by_size[key] ?? 0) + l.quantity;
        }
    }
    return { kg: Math.round(kg * 100) / 100, tanks, by_size };
}

/**
 * Why no vehicle fits (mirrors DeliveryFeeService::whyNoVehicle for the cases the page can see: the server's message
 * covers the rest when the store has no usable vehicle at all).
 */
export function whyNoVehicle(options: DeliveryOption[] | undefined, fallback: string | null, load?: Load): string {
    const caps = (options ?? []).flatMap((o) => o.capacities);
    if (caps.length === 0) return fallback ?? "This store can't deliver right now.";
    if (load) {
        for (const c of caps) {
            const why = fits(c, load);
            if (why && why.includes(' kg tanks per trip')) return `Too many tanks of one size for this store's vehicles: ${why}`;
        }
    }
    const largest = [...caps].sort((a, b) => b.kg - a.kg || b.tanks - a.tanks)[0];
    return `Too heavy for this store's vehicles (max ${Number(largest.kg.toFixed(2))} kg / ${largest.tanks} tanks per trip).`;
}

/** Fill suggested (seller Vehicles dialog): per size floor(max kg / full-tank kg), capped by max tanks. */
export function suggestedTankLimits(maxKg: number, maxTanks: number, sizes: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of sizes) {
        const per = fullTankKg(Number(s));
        if (per > 0) out[s] = Math.max(0, Math.min(maxTanks, Math.floor(maxKg / per)));
    }
    return out;
}

/** "11kg ×4 · 22kg ×2 · 50kg ×1" (null when no per-size limits). */
export function tankLimitsLabel(limits: TankLimits | undefined): string | null {
    const parts = Object.entries(limits ?? {})
        .filter(([, m]) => m !== null && m !== undefined)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([s, m]) => `${s}kg ×${m}`);
    return parts.length ? parts.join(' · ') : null;
}
