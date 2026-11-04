import { useForm } from '@inertiajs/react';
import { Truck } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export type RateRow = { vehicle_type: string; label: string; base_fee: number | null; fee_per_km: number | null };

type FormRow = { vehicle_type: string; base_fee: string; fee_per_km: string };

const example = (base: string, perKm: string) => {
    const b = parseFloat(base);
    const k = parseFloat(perKm);
    if (Number.isNaN(b) || Number.isNaN(k)) return null;
    return Math.ceil((b + 5 * k) / 5) * 5;
};

/**
 * "Delivery fees by vehicle type" (Vehicles page): base fee + per km for each type the store has. At checkout the
 * cheapest vehicle that can carry the order is chosen automatically (DeliveryFeeService / lib/delivery-fee.ts).
 */
export function DeliveryRatesCard({ rates, canEdit }: { rates: RateRow[]; canEdit: boolean }) {
    const toForm = (rs: RateRow[]): FormRow[] => rs.map((r) => ({
        vehicle_type: r.vehicle_type,
        base_fee: r.base_fee != null ? String(r.base_fee) : '',
        fee_per_km: r.fee_per_km != null ? String(r.fee_per_km) : '',
    }));
    const { data, setData, put, processing, errors } = useForm<{ rates: FormRow[] }>({ rates: toForm(rates) });
    // New vehicle types appear after adding a vehicle — keep the rows in sync with the server
    const key = rates.map((r) => `${r.vehicle_type}:${r.base_fee}:${r.fee_per_km}`).join('|');
    useEffect(() => { setData('rates', toForm(rates)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (i: number, field: 'base_fee' | 'fee_per_km', value: string) =>
        setData('rates', data.rates.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
    const err = errors as Record<string, string>;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-blue-600" /> Delivery fees by vehicle type</CardTitle>
                <CardDescription>
                    Base fee + fee per km from your store. At checkout the cheapest vehicle that can carry the order (kg and tanks) is
                    chosen automatically. Rounded up to the next ₱5.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {rates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add a vehicle first — its type will appear here with a suggested fee.</p>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); put('/seller/vehicles/rates', { preserveScroll: true }); }} className="space-y-3">
                        {data.rates.map((r, i) => {
                            const ex = example(r.base_fee, r.fee_per_km);
                            const label = rates.find((x) => x.vehicle_type === r.vehicle_type)?.label ?? r.vehicle_type;
                            const unset = rates.find((x) => x.vehicle_type === r.vehicle_type)?.base_fee == null;
                            return (
                                <div key={r.vehicle_type} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
                                    <div>
                                        <p className="font-medium">{label}</p>
                                        {unset && <p className="text-xs text-amber-700 dark:text-amber-400">Not used for delivery until you set a fee.</p>}
                                    </div>
                                    <label className="grid gap-1 text-xs text-muted-foreground">
                                        Base fee (₱)
                                        <Input type="number" min={0} step="1" value={r.base_fee} disabled={!canEdit}
                                            onChange={(e) => set(i, 'base_fee', e.target.value)} />
                                        {err[`rates.${i}.base_fee`] && <span className="text-red-500">{err[`rates.${i}.base_fee`]}</span>}
                                    </label>
                                    <label className="grid gap-1 text-xs text-muted-foreground">
                                        Per km (₱)
                                        <Input type="number" min={0} step="0.5" value={r.fee_per_km} disabled={!canEdit}
                                            onChange={(e) => set(i, 'fee_per_km', e.target.value)} />
                                        {err[`rates.${i}.fee_per_km`] && <span className="text-red-500">{err[`rates.${i}.fee_per_km`]}</span>}
                                    </label>
                                    <p className="text-xs text-muted-foreground sm:pb-2">{ex != null ? <>5 km → <strong className="text-foreground">₱{ex}</strong></> : '—'}</p>
                                </div>
                            );
                        })}
                        {canEdit && <Button type="submit" size="sm" disabled={processing}>Save delivery fees</Button>}
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
