import { Bike, Car, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PickerVehicle = {
    id: number;
    vehicle_type: string;
    label: string;
    plate_number: string;
    max_tanks: number;
    max_kg: number;
    /** Another rider holds it for their shift */
    in_use_by: string | null;
    assigned_to_me: boolean;
};

export const vehicleIcon = (type: string) => (type === 'motorcycle' || type === 'tricycle' ? Bike : type.includes('truck') ? Truck : Car);

/** The vehicle to preselect: the one assigned to this rider (if free), else the first free one. */
export function preferredVehicle(vehicles: PickerVehicle[]): number | null {
    return (vehicles.find((v) => v.assigned_to_me && !v.in_use_by) ?? vehicles.find((v) => !v.in_use_by))?.id ?? null;
}

/** "Choose your vehicle for today" — radio cards; vehicles taken by other riders are disabled. */
export function VehicleChoice({ vehicles, value, onChange }: { vehicles: PickerVehicle[]; value: number | null; onChange: (id: number) => void }) {
    if (vehicles.length === 0 || vehicles.every((v) => v.in_use_by)) {
        return <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">No free vehicle — ask the store owner.</p>;
    }
    return (
        <div className="grid gap-2" role="radiogroup" aria-label="Vehicle">
            {vehicles.map((v) => {
                const Icon = vehicleIcon(v.vehicle_type);
                const taken = !!v.in_use_by;
                const active = value === v.id;
                return (
                    <button key={v.id} type="button" role="radio" aria-checked={active} disabled={taken} onClick={() => onChange(v.id)}
                        className={cn('flex items-center gap-3 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors',
                            active ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700',
                            taken && 'cursor-not-allowed opacity-50 hover:border-gray-200')}>
                        <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-blue-600' : 'text-gray-500')} />
                        <span className="flex-1">
                            <span className="font-semibold">{v.label} {v.plate_number}</span>
                            <span className="block text-xs text-gray-500">{v.max_tanks} tanks · {v.max_kg} kg</span>
                        </span>
                        {taken ? <span className="text-xs text-gray-500">In use by {v.in_use_by}</span>
                            : v.assigned_to_me ? <span className="text-xs font-medium text-blue-700">Yours</span> : null}
                    </button>
                );
            })}
        </div>
    );
}
