import { Loader2, Route, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Floating bar shown while orders are selected for batch assignment to one rider. */
export default function BatchAssignBar({ count, riders, onAssign, onCancel, processing }: {
    count: number;
    riders: { id: number; name: string }[];
    onAssign: (riderId: number) => void;
    onCancel: () => void;
    processing: boolean;
}) {
    const [riderId, setRiderId] = useState('');
    const visible = count > 0;

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
                            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Assign to rider…" /></SelectTrigger>
                            <SelectContent>
                                {riders.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
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
                <p className="w-full text-xs text-gray-500">Stops are ordered automatically by distance from your store (nearest first).</p>
            </div>
        </div>
    );
}
