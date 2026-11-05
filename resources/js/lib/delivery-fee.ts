/**
 * Delivery fee per vehicle type — the SAME rule as App\Services\DeliveryFeeService::quote():
 * among the store's vehicles that can carry the load (kg AND tanks on the same vehicle), the cheapest
 * ceil((base + km × per_km) / 5) × 5 (no distance → base). Ties: lowest fee → smallest fitting vehicle → type order.
 */

export type DeliveryOption = {
    vehicle_type: string;
    label: string;
    base_fee: number;
    fee_per_km: number;
    /** One entry per usable vehicle of this type */
    capacities: { kg: number; tanks: number }[];
};

export type DeliveryQuote = { vehicle_type: string; label: string; fee: number };

/** Same order as config('delivery.vehicle_types') — last tie-break */
const TYPE_ORDER = ['motorcycle', 'tricycle', 'multicab', 'van', 'pickup_truck', 'small_truck', 'large_truck'];

export function quoteFee(options: DeliveryOption[] | undefined, distKm: number | null, kg: number, tanks: number): DeliveryQuote | null {
    let best: { key: [number, number, number]; quote: DeliveryQuote } | null = null;
    for (const o of options ?? []) {
        const fitting = o.capacities.filter((c) => c.kg >= kg && c.tanks >= tanks);
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
const FULL_TANK_KG: Record<string, number> = { '2.7': 7, '5': 12, '7': 15, '11': 25, '22': 45, '50': 90 };

/** Weight of one full tank for a gas size (DeliveryFeeService::fullTankKg); no size → 0. */
export function fullTankKg(gasKg: number | null | undefined): number {
    const gas = Math.round(Number(gasKg ?? 0) * 10) / 10;
    if (!(gas > 0)) return 0;
    return FULL_TANK_KG[String(gas)] ?? Math.round(gas * 2 * 10) / 10;
}

/** Load of order lines: kg = Σ full-tank weight × qty, tanks = qty of lines with a size. */
export function orderLoad(lines: { weight_kg?: number | null; quantity: number }[]): { kg: number; tanks: number } {
    let kg = 0;
    let tanks = 0;
    for (const l of lines) {
        const w = Number(l.weight_kg ?? 0);
        kg += fullTankKg(w) * l.quantity;
        if (w > 0) tanks += l.quantity;
    }
    return { kg: Math.round(kg * 100) / 100, tanks };
}

/**
 * Why no vehicle fits (mirrors DeliveryFeeService::whyNoVehicle for the cases the page can see: the server's message
 * covers the rest when the store has no usable vehicle at all).
 */
export function whyNoVehicle(options: DeliveryOption[] | undefined, fallback: string | null): string {
    const caps = (options ?? []).flatMap((o) => o.capacities);
    if (caps.length === 0) return fallback ?? "This store can't deliver right now.";
    const largest = [...caps].sort((a, b) => b.kg - a.kg || b.tanks - a.tanks)[0];
    return `Too heavy for this store's vehicles (max ${Number(largest.kg.toFixed(2))} kg / ${largest.tanks} tanks per trip).`;
}
