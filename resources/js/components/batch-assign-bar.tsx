import { Loader2, Route, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect } from 'react';
import { bestFitId, riderOptionDisabled, riderOptionLabel, type Load, type RiderLoadFields } from '@/lib/rider-fit';

/** Floating bar shown while orders are selected for batch assignment to one rider. */
export default function BatchAssignBar({ count, riders, onAssign, onCancel, processing, need = null }: {
    count: number;
    riders: ({ id: number; name: string } & RiderLoadFields)[];
    /** Total load of the selected orders — riders whose vehicle can't take it all are disabled */
    need?: Load | null;
    onAssign: (riderId: number) => void;
    onCancel: () => void;
    processing: boolean;
}) {
    const [riderId, setRiderId] = useState('');
    const visible = count > 0;
    const best = bestFitId(riders, need);
    const needKey = need ? `${need.kg}/${need.tanks}` : '';
    // Follow the selection: pre-select the best fit, drop a rider that no longer fits
    useEffect(() => { setRiderId(best ? String(best) : ''); }, [needKey]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div
            aria-hidden={!visible}
            className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),12px)] transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'pointer-events-none translate-y-[150%]'}`}
        >
            <div className="flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-2xl dark:bg-gray-900">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    <Route className="h-4 w-4 text-blue-600" />
                    {count} order{count === 1 ? '' : 's'} selected
                </span>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {riders.length === 0 ? (
                        <span className="text-sm text-red-600">No active riders in your store.</span>
                    ) : (
                        <Select value={riderId} onValueChange={setRiderId}>
                            <SelectTrigger className="h-9 w-64 max-w-full"><SelectValue placeholder="Assign to rider…" /></SelectTrigger>
                            <SelectContent>
                                {riders.map((r) => <SelectItem key={r.id} value={String(r.id)} disabled={riderOptionDisabled(r, need)}>{riderOptionLabel(r, need, r.id === best)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                    <Button size="sm" disabled={!riderId || processing} onClick={() => onAssign(Number(riderId))} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Assign
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancel} disabled={processing} className="gap-1">
                        <X className="h-4 w-4" /> Cancel
                    </Button>
                </div>
                <p className="w-full text-xs text-gray-500">
                    Stops are ordered automatically by distance from your store (nearest first).
                    {need && need.tanks > 0 && ` Load: ${need.kg} kg / ${need.tanks} tank(s) — it must fit the rider's vehicle with what they already carry.`}
                </p>
            </div>
        </div>
    );
}
