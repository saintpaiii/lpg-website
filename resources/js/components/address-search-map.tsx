import axios from 'axios';
import { Briefcase, Check, Home, Loader2, MapPin, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AddressFields } from '@/components/address-fields';
import AddressMap, { lookupBarangay } from '@/components/address-map';
import AddressSearchBox, { matchBarangay, matchCity, shortPlaceName, type GeocodeResult } from '@/components/address-search-box';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { LatLng } from '@/lib/map';

export type SavedAddress = {
    id: number;
    label: string;
    address_line: string;
    barangay: string | null;
    city: string | null;
    full_text: string;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
};

/** Where this order goes: a saved address, or a new one (searched / typed), plus the map pin. */
export type DeliveryLocation = {
    addressId: number | null;
    line: string;
    barangay: string;
    city: string;
    lat: number | null;
    lng: number | null;
};

export type ChangeReason = 'saved' | 'search' | 'fields' | 'pin';

export const labelIcon = (label: string) =>
    label === 'Home' ? Home : label === 'Office' ? Briefcase : MapPin;

export const locationFromSaved = (a: SavedAddress): DeliveryLocation => ({
    addressId: a.id, line: a.address_line, barangay: a.barangay ?? '', city: a.city ?? '', lat: a.latitude, lng: a.longitude,
});

const LABELS = ['Home', 'Office', 'Other'];

/**
 * Checkout delivery address picker: saved addresses, OpenStreetMap search, and a map pin the
 * customer can drag / tap to fine-tune. New addresses can be saved for future orders.
 */
export default function AddressSearchMap({ savedAddresses, value, onChange, onSaved, height = '300px', fitTo = [], children }: {
    savedAddresses: SavedAddress[];
    value: DeliveryLocation;
    onChange: (next: DeliveryLocation, reason: ChangeReason) => void;
    onSaved?: (addresses: SavedAddress[], saved: SavedAddress) => void;
    height?: string;
    fitTo?: LatLng[];
    children?: ReactNode;
}) {
    const isNew = value.addressId === null;
    const [saveIt, setSaveIt]   = useState(false);
    const [label, setLabel]     = useState('Home');
    const [saving, setSaving]   = useState(false);
    const [note, setNote]       = useState<string | null>(null);

    function pickSaved(a: SavedAddress) {
        setNote(null);
        onChange(locationFromSaved(a), 'saved');
    }

    function startNew() {
        setNote(null);
        onChange({ ...value, addressId: null, line: '' }, 'fields');
    }

    function pickSearchResult(r: GeocodeResult) {
        const city = matchCity(r.city) ?? '';
        const barangay = matchBarangay(city, r.barangay) ?? '';
        setNote(city
            ? (barangay ? null : 'Please choose your barangay below so the rider sees the full address.')
            : 'Please choose your city and barangay below so the rider sees the full address.');
        onChange({
            addressId: null,
            line: r.street || shortPlaceName(r.display_name).split(',')[0] || '',
            city, barangay, lat: r.lat, lng: r.lng,
        }, 'search');
    }

    /** Typed city/barangay change: re-pin at that barangay (the customer can then drag). */
    async function changeFields(next: Partial<DeliveryLocation>) {
        const merged = { ...value, ...next, addressId: null };
        onChange(merged, 'fields');
        if (next.barangay && merged.city) {
            const geo = await lookupBarangay(merged.city, next.barangay);
            if (geo && geo.precision !== 'none') {
                onChange({ ...merged, lat: geo.latitude, lng: geo.longitude }, 'fields');
                setNote(geo.found ? null : geo.message ?? null);
            }
        }
    }

    async function saveAddress() {
        if (!value.line.trim()) { toast.error('Enter the house no. / street first.'); return; }
        setSaving(true);
        try {
            const res = await axios.post<{ address: SavedAddress; addresses: SavedAddress[]; message: string }>(
                '/customer/addresses',
                {
                    label,
                    address_line: value.line.trim(),
                    barangay: value.barangay || null,
                    city: value.city || null,
                    latitude: value.lat,
                    longitude: value.lng,
                },
                { headers: { Accept: 'application/json' } },
            );
            onSaved?.(res.data.addresses, res.data.address);
            onChange({ ...value, addressId: res.data.address.id }, 'saved');
            setSaveIt(false);
            toast.success(`Saved as "${res.data.address.label}".`);
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (Object.values(err.response?.data?.errors ?? {})[0] as string[] | undefined)?.[0] ?? err.response?.data?.message
                : null;
            toast.error(msg ?? 'Could not save this address.');
        }
        setSaving(false);
    }

    return (
        <div className="space-y-3">
            {/* Saved addresses */}
            {savedAddresses.length > 0 && (
                <div className="grid gap-2" role="radiogroup" aria-label="Saved addresses">
                    {savedAddresses.map((a) => {
                        const Icon = labelIcon(a.label);
                        const active = value.addressId === a.id;
                        return (
                            <button key={a.id} type="button" role="radio" aria-checked={active} onClick={() => pickSaved(a)}
                                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${active
                                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2 text-sm font-semibold">
                                        {a.label}
                                        {a.is_default && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">Default</span>}
                                    </span>
                                    <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{a.full_text}</span>
                                </span>
                                {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                            </button>
                        );
                    })}
                    {!isNew && (
                        <button type="button" onClick={startNew}
                            className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-800">
                            <Plus className="h-4 w-4" /> Deliver to a different address
                        </button>
                    )}
                </div>
            )}

            {/* Search (always available — picking a result switches to a new address) */}
            <AddressSearchBox onSelect={pickSearchResult} />

            {/* New address details */}
            {isNew && (
                <div className="space-y-2 rounded-lg border bg-gray-50/60 p-3 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">New delivery address</p>
                    <AddressFields
                        address={value.line}
                        city={value.city}
                        barangay={value.barangay}
                        onAddressChange={(v) => onChange({ ...value, line: v, addressId: null }, 'fields')}
                        onCityChange={(v) => changeFields({ city: v, barangay: '' })}
                        onBarangayChange={(v) => changeFields({ barangay: v })}
                        compact
                    />
                    {note && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">{note}</p>}
                </div>
            )}

            <AddressMap
                latitude={value.lat}
                longitude={value.lng}
                onLocationChange={(lat, lng) => onChange({ ...value, lat, lng }, 'pin')}
                height={height}
                fitTo={fitTo}
                clickMoves
            >
                {children}
            </AddressMap>

            {/* Save a new address for next time */}
            {isNew && (
                <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={saveIt} onCheckedChange={(c) => setSaveIt(c === true)} />
                        Save this address for future orders
                    </label>
                    {saveIt && (
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="grid gap-1">
                                <Label className="text-xs">Label</Label>
                                <select value={label} onChange={(e) => setLabel(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                                    {LABELS.map((l) => <option key={l}>{l}</option>)}
                                </select>
                            </div>
                            <Button type="button" size="sm" onClick={saveAddress} disabled={saving || !value.line.trim()}>
                                {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Save address
                            </Button>
                            {!value.line.trim() && <span className="text-xs text-gray-500">Enter the house no. / street first.</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
