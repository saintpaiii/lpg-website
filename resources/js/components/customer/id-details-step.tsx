import { useForm } from '@inertiajs/react';
import { ArrowRight, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AddressFields } from '@/components/address-fields';
import AddressMap, { lookupBarangay } from '@/components/address-map';
import AddressSearchBox, { matchBarangay, matchCity, type GeocodeResult } from '@/components/address-search-box';
import LocationAddressTools from '@/components/location-address-tools';
import { useAutoFillAddress } from '@/hooks/use-auto-fill-address';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export type IdDetails = {
    first_name: string;
    middle_name: string;
    last_name: string;
    phone: string;
    address: string;
    city: string;
    barangay: string;
    latitude: number | null;
    longitude: number | null;
};

/**
 * ID verification step 1 — name, mobile number and home address (with map pin).
 * Google sign-ups start with only a name and email; the admin needs these to review the ID.
 */
export default function IdDetailsStep({ details, onSaved }: { details: IdDetails; onSaved: () => void }) {
    const form = useForm<IdDetails>({ ...details });
    const [pinNote, setPinNote] = useState<string | null>(null);
    // Moving the pin fills city / barangay (and the street when it wasn't typed) — one update, pin stays put
    const autoFill = useAutoFillAddress({
        street: form.data.address,
        pinned: details.latitude != null,
        apply: (a) => { form.setData((d) => ({ ...d, city: a.city, barangay: a.barangay, address: a.street })); setPinNote(null); },
    });

    /** Barangay picked → move the pin to that barangay's centre (then the customer drags it to their house). */
    async function pinFromBarangay(city: string, barangay: string) {
        // Only an unplaced pin follows the barangay — a pin the user put down stays exactly there
        if (!city || !barangay || autoFill.isPinned()) return;
        const geo = await lookupBarangay(city, barangay);
        if (!geo || geo.precision === 'none' || autoFill.isPinned()) return;
        form.setData((d) => ({ ...d, latitude: geo.latitude, longitude: geo.longitude }));
        setPinNote(geo.found ? null : (geo.message ?? null));
    }

    useEffect(() => {
        if (details.latitude == null && details.city && details.barangay) pinFromBarangay(details.city, details.barangay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function pickSearchResult(r: GeocodeResult) {
        autoFill.setPinned(true);
        const city = matchCity(r.city);
        const barangay = city ? matchBarangay(city, r.barangay) : null;
        form.setData((d) => ({
            ...d,
            latitude: r.lat,
            longitude: r.lng,
            ...(city ? { city, barangay: barangay ?? '' } : {}),
            ...(r.street && !d.address ? { address: r.street } : {}),
        }));
        setPinNote(city && !barangay ? 'Please choose your barangay from the list.' : null);
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post('/customer/id-verification/details', { preserveScroll: true, onSuccess: onSaved });
    }

    const err = form.errors as Record<string, string>;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <UserRound className="h-4 w-4 text-blue-600" />
                    Your details
                </CardTitle>
                <p className="text-xs text-gray-500">
                    We check these against your ID. Your home address also becomes your default delivery address.
                </p>
            </CardHeader>
            <CardContent>
                <form onSubmit={submit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="d-first" className="text-sm font-medium">First name <span className="text-red-500">*</span></Label>
                            <Input id="d-first" autoComplete="given-name" className="h-11" value={form.data.first_name}
                                onChange={(e) => form.setData('first_name', e.target.value)} />
                            {err.first_name && <p className="text-xs text-red-500">{err.first_name}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="d-middle" className="text-sm font-medium">Middle name</Label>
                            <Input id="d-middle" autoComplete="additional-name" placeholder="Optional" className="h-11" value={form.data.middle_name}
                                onChange={(e) => form.setData('middle_name', e.target.value)} />
                            {err.middle_name && <p className="text-xs text-red-500">{err.middle_name}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="d-last" className="text-sm font-medium">Last name <span className="text-red-500">*</span></Label>
                            <Input id="d-last" autoComplete="family-name" className="h-11" value={form.data.last_name}
                                onChange={(e) => form.setData('last_name', e.target.value)} />
                            {err.last_name && <p className="text-xs text-red-500">{err.last_name}</p>}
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="d-phone" className="text-sm font-medium">Mobile number <span className="text-red-500">*</span></Label>
                        <Input id="d-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="09XXXXXXXXX" maxLength={11}
                            className="h-11 max-w-xs" value={form.data.phone}
                            onChange={(e) => form.setData('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} />
                        {err.phone && <p className="text-xs text-red-500">{err.phone}</p>}
                    </div>

                    <AddressFields
                        address={form.data.address}
                        city={form.data.city}
                        barangay={form.data.barangay}
                        onAddressChange={(v) => form.setData('address', v)}
                        onCityChange={(v) => form.setData((d) => ({ ...d, city: v, barangay: '' }))}
                        onBarangayChange={(v) => {
                            form.setData('barangay', v);
                            pinFromBarangay(form.data.city, v);
                        }}
                        errors={err}
                        autoFill={autoFill}
                        requiredBarangay
                    />

                    <div className="grid gap-1.5">
                        <Label className="text-sm font-medium">Home pin</Label>
                        <p className="text-xs text-gray-500">
                            Tap <strong>Use my current location</strong>, or search your street, then drag the pin to your house.
                        </p>
                        <AddressSearchBox onSelect={pickSearchResult} />
                        {pinNote && (
                            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">{pinNote}</p>
                        )}
                        <AddressMap
                            latitude={form.data.latitude}
                            longitude={form.data.longitude}
                            onLocationChange={(lat, lng) => {
                                form.setData((d) => ({ ...d, latitude: lat, longitude: lng }));
                                setPinNote(null);
                                autoFill.onPinMoved(lat, lng);
                            }}
                            height="240px"
                            clickMoves
                        />
                        <LocationAddressTools
                            onPin={(lat, lng) => { form.setData((d) => ({ ...d, latitude: lat, longitude: lng })); setPinNote(null); }}
                            autoFill={autoFill}
                        />
                        {(err.latitude || err.longitude) && (
                            <p className="text-xs text-red-500">{err.latitude ?? err.longitude}</p>
                        )}
                    </div>

                    <div className="flex justify-end pt-1">
                        <Button type="submit" disabled={form.processing} className="h-11 bg-blue-600 px-6 text-white hover:bg-blue-700">
                            {form.processing && <Spinner />}
                            Save and continue <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
