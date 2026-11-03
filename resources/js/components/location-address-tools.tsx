import { Crosshair, Loader2 } from 'lucide-react';
import { useState } from 'react';
import LocationAccuracyNotice from '@/components/location-accuracy-notice';
import { Button } from '@/components/ui/button';
import type { AutoFillAddress } from '@/hooks/use-auto-fill-address';
import { ACCURATE_ENOUGH_M, DEVICE_LOCATION_FAILED, getDeviceLocation, isInServiceArea, OUTSIDE_SERVICE_AREA_DEVICE } from '@/lib/map';

/**
 * Under an address map: "Use my current location" moves the pin to the device location and fills
 * city / barangay / street right away. (Dragging or tapping the pin fills them too — useAutoFillAddress.)
 */
export default function LocationAddressTools({ onPin, autoFill }: {
    onPin: (lat: number, lng: number) => void;
    autoFill: AutoFillAddress;
}) {
    const [locating, setLocating] = useState(false);
    const [roughM, setRoughM]     = useState<number | null>(null);
    const [message, setMessage]   = useState<string | null>(null);

    function useDevice() {
        setMessage(null);
        setLocating(true);
        getDeviceLocation().then((loc) => {
            if (!isInServiceArea(loc.lat, loc.lng)) { setMessage(OUTSIDE_SERVICE_AREA_DEVICE); return; }
            const lat = +loc.lat.toFixed(7);
            const lng = +loc.lng.toFixed(7);
            onPin(lat, lng);
            setRoughM(loc.accuracy_m > ACCURATE_ENOUGH_M ? loc.accuracy_m : null);
            autoFill.fillNow(lat, lng);
        }).catch(() => setMessage(DEVICE_LOCATION_FAILED))
            .finally(() => setLocating(false));
    }

    return (
        <div className="space-y-2">
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={useDevice} disabled={locating}>
                {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                Use my current location
            </Button>
            {roughM !== null && <LocationAccuracyNotice accuracyM={roughM} onConfirm={() => setRoughM(null)} />}
            {message && <p className="text-xs text-red-600">{message}</p>}
        </div>
    );
}
