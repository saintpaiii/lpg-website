import { Crosshair, Loader2 } from 'lucide-react';
import { useState } from 'react';
import AddressMap from '@/components/address-map';
import InputError from '@/components/input-error';
import LocationAccuracyNotice from '@/components/location-accuracy-notice';
import LocationAddressTools from '@/components/location-address-tools';
import { Button } from '@/components/ui/button';
import {
    ACCURATE_ENOUGH_M, DEVICE_LOCATION_FAILED, fillAddressFromLocation, getDeviceLocation, isInServiceArea,
    OUTSIDE_SERVICE_AREA_DEVICE, type FilledAddress,
} from '@/lib/map';

/**
 * Required store pin on the seller application forms: click or drag on the map, or use the device location
 * (rough readings from computers show the accuracy notice). Pins outside Cavite are refused by AddressMap.
 * With onAddressFound the device location / pin also fills the address (needs login — not on the guest form).
 */
export default function StorePinPicker({ latitude, longitude, onChange, error, street = '', onAddressFound }: {
    latitude: number | null;
    longitude: number | null;
    onChange: (lat: number, lng: number) => void;
    error?: string;
    street?: string;
    onAddressFound?: (address: FilledAddress) => void;
}) {
    const [locating, setLocating] = useState(false);
    const [roughM, setRoughM] = useState<number | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    function useDevice() {
        setMessage(null);
        setLocating(true);
        getDeviceLocation().then((loc) => {
            if (!isInServiceArea(loc.lat, loc.lng)) { setMessage(OUTSIDE_SERVICE_AREA_DEVICE); return; }
            onChange(+loc.lat.toFixed(7), +loc.lng.toFixed(7));
            setRoughM(loc.accuracy_m > ACCURATE_ENOUGH_M ? loc.accuracy_m : null);
            if (onAddressFound) fillAddressFromLocation(loc.lat, loc.lng, street).then((a) => a && onAddressFound(a));
        }).catch(() => setMessage(DEVICE_LOCATION_FAILED))
            .finally(() => setLocating(false));
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pin your store on the map <span className="text-red-500">*</span>
                </p>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={useDevice} disabled={locating}>
                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                    Use my current location
                </Button>
            </div>
            <p className="text-xs text-gray-500">Drag the pin to your store's entrance. Customers' delivery fees and staff clock-in use this spot.</p>
            <AddressMap
                latitude={latitude}
                longitude={longitude}
                onLocationChange={(lat, lng) => { setRoughM(null); onChange(lat, lng); }}
                height="280px"
                clickMoves
            />
            {onAddressFound && <LocationAddressTools latitude={latitude} longitude={longitude} street={street} onAddress={onAddressFound} />}
            {roughM !== null && <LocationAccuracyNotice accuracyM={roughM} onConfirm={() => setRoughM(null)} />}
            {message && <p className="text-xs text-red-600">{message}</p>}
            <InputError message={error} />
        </div>
    );
}
