import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { useState } from 'react';
import LocationAccuracyNotice from '@/components/location-accuracy-notice';
import { Button } from '@/components/ui/button';
import {
    ACCURATE_ENOUGH_M, DEVICE_LOCATION_FAILED, fillAddressFromLocation, getDeviceLocation, isInServiceArea,
    OUTSIDE_SERVICE_AREA_DEVICE, type FilledAddress,
} from '@/lib/map';

/**
 * Under an address map: "Use my current location" (when onPin is given) moves the pin to the device
 * location and fills city / barangay / street; "Fill address from pin" fills them from the current pin.
 */
export default function LocationAddressTools({ latitude, longitude, street, onPin, onAddress }: {
    latitude: number | null;
    longitude: number | null;
    /** Current street text — only replaced when empty or after the user confirms */
    street: string;
    onPin?: (lat: number, lng: number) => void;
    onAddress: (address: FilledAddress) => void;
}) {
    const [locating, setLocating] = useState(false);
    const [filling, setFilling]   = useState(false);
    const [roughM, setRoughM]     = useState<number | null>(null);
    const [message, setMessage]   = useState<string | null>(null);

    async function fill(lat: number, lng: number) {
        setFilling(true);
        const found = await fillAddressFromLocation(lat, lng, street);
        setFilling(false);
        if (found) onAddress(found);
    }

    function useDevice() {
        if (!onPin) return;
        setMessage(null);
        setLocating(true);
        getDeviceLocation().then((loc) => {
            if (!isInServiceArea(loc.lat, loc.lng)) { setMessage(OUTSIDE_SERVICE_AREA_DEVICE); return; }
            const lat = +loc.lat.toFixed(7);
            const lng = +loc.lng.toFixed(7);
            onPin(lat, lng);
            setRoughM(loc.accuracy_m > ACCURATE_ENOUGH_M ? loc.accuracy_m : null);
            void fill(lat, lng);
        }).catch(() => setMessage(DEVICE_LOCATION_FAILED))
            .finally(() => setLocating(false));
    }

    const hasPin = latitude != null && longitude != null;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {onPin && (
                    <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={useDevice} disabled={locating}>
                        {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                        Use my current location
                    </Button>
                )}
                <button
                    type="button"
                    disabled={!hasPin || filling}
                    onClick={() => hasPin && fill(latitude!, longitude!)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                    title={hasPin ? 'Fill city, barangay and street from where the pin is' : 'Place the pin first'}
                >
                    {filling ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                    Fill address from pin
                </button>
            </div>
            {roughM !== null && <LocationAccuracyNotice accuracyM={roughM} onConfirm={() => setRoughM(null)} />}
            {message && <p className="text-xs text-red-600">{message}</p>}
        </div>
    );
}
