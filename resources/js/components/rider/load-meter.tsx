import { Link } from '@inertiajs/react';
import { cn } from '@/lib/utils';

export type RiderLoad = {
    clocked_in: boolean;
    vehicle: { id: number; type: string; label: string; plate: string } | null;
    load: { kg: number; tanks: number; max_kg: number; max_tanks: number; free_kg: number; free_tanks: number };
};

const icon = (type?: string) => (type === 'motorcycle' || type === 'tricycle' ? '🏍' : type?.includes('truck') ? '🚚' : '🚐');

function Bar({ used, max, label }: { used: number; max: number; label: string }) {
    const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
    return (
        <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex justify-between text-[11px] text-gray-500"><span>{label}</span><span className="tabular-nums">{used} / {max}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** "🏍 Motorcycle ABC-123 · Load 50 / 60 kg · 2 / 2 tanks" — the rider's shift vehicle and what it carries. */
export function LoadMeter({ data }: { data: RiderLoad | null | undefined }) {
    if (!data) return null;
    if (!data.vehicle) {
        return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {data.clocked_in ? 'Choose your vehicle for today to receive deliveries.' : 'Clock in and choose your vehicle to receive deliveries.'}{' '}
                <Link href="/rider/my-attendance" className="font-medium underline">My Attendance</Link>
            </div>
        );
    }
    const l = data.load;
    const kg = (n: number) => String(Math.round(n * 100) / 100);
    return (
        <div className="space-y-2 rounded-lg border bg-white px-4 py-3 shadow-sm">
            <p className="text-sm font-medium text-gray-900">
                {icon(data.vehicle.type)} {data.vehicle.label} {data.vehicle.plate}
                <span className="text-gray-500"> · Load {kg(l.kg)} / {kg(l.max_kg)} kg · {l.tanks} / {l.max_tanks} tanks</span>
            </p>
            <div className="flex gap-4">
                <Bar used={Number(kg(l.kg))} max={l.max_kg} label="Weight (kg)" />
                <Bar used={l.tanks} max={l.max_tanks} label="Tanks" />
            </div>
        </div>
    );
}
