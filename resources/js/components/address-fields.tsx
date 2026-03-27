import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { caviteCities, getBarangays } from '@/data/cavite-locations';

interface AddressFieldsProps {
    /** Street / house number / building */
    address: string;
    city: string;
    barangay: string;
    onAddressChange: (v: string) => void;
    onCityChange: (v: string) => void;
    onBarangayChange: (v: string) => void;
    errors?: Record<string, string>;
    /** Field name keys for errors (default: address / city / barangay) */
    errorKeys?: { address?: string; city?: string; barangay?: string };
    /** Whether barangay is required */
    requiredBarangay?: boolean;
    /** Whether to render in a two-column grid for city+barangay */
    compact?: boolean;
    disabled?: boolean;
}

const SELECT_CLS =
    'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed ' +
    'disabled:opacity-50 text-foreground';

export function AddressFields({
    address,
    city,
    barangay,
    onAddressChange,
    onCityChange,
    onBarangayChange,
    errors = {},
    errorKeys = {},
    requiredBarangay = false,
    compact = false,
    disabled = false,
}: AddressFieldsProps) {
    const addrKey  = errorKeys.address  ?? 'address';
    const cityKey  = errorKeys.city     ?? 'city';
    const brgyKey  = errorKeys.barangay ?? 'barangay';

    const [barangayOptions, setBarangayOptions] = useState<string[]>(getBarangays(city));

    // When city changes, refresh barangay list and clear barangay if it's no longer valid
    useEffect(() => {
        const list = getBarangays(city);
        setBarangayOptions(list);
        if (barangay && !list.includes(barangay)) {
            onBarangayChange('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [city]);

    function handleCityChange(newCity: string) {
        onCityChange(newCity);
        // barangay will be cleared by the useEffect above
    }

    return (
        <div className="grid gap-4">
            {/* Street address — full width */}
            <div className="grid gap-1.5">
                <Label htmlFor="addr-street" className="text-sm font-medium">
                    Street Address <span className="text-red-500">*</span>
                </Label>
                <Input
                    id="addr-street"
                    value={address}
                    onChange={(e) => onAddressChange(e.target.value)}
                    placeholder="e.g. 123 Rizal Street"
                    disabled={disabled}
                    className="h-11"
                />
                {errors[addrKey] && (
                    <p className="text-xs text-red-500">{errors[addrKey]}</p>
                )}
            </div>

            {/* City + Barangay */}
            <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
                {/* City dropdown */}
                <div className="grid gap-1.5">
                    <Label htmlFor="addr-city" className="text-sm font-medium">
                        City / Municipality <span className="text-red-500">*</span>
                    </Label>
                    <select
                        id="addr-city"
                        value={city}
                        onChange={(e) => handleCityChange(e.target.value)}
                        disabled={disabled}
                        className={SELECT_CLS}
                    >
                        <option value="">— Select city —</option>
                        {caviteCities.map((c) => (
                            <option key={c.name} value={c.name}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    {errors[cityKey] && (
                        <p className="text-xs text-red-500">{errors[cityKey]}</p>
                    )}
                </div>

                {/* Barangay dropdown */}
                <div className="grid gap-1.5">
                    <Label htmlFor="addr-barangay" className="text-sm font-medium">
                        Barangay{requiredBarangay && <span className="text-red-500"> *</span>}
                    </Label>
                    <select
                        id="addr-barangay"
                        value={barangay}
                        onChange={(e) => onBarangayChange(e.target.value)}
                        disabled={disabled || !city}
                        className={SELECT_CLS}
                    >
                        <option value="">
                            {city ? '— Select barangay —' : '— Select city first —'}
                        </option>
                        {barangayOptions.map((b) => (
                            <option key={b} value={b}>
                                {b}
                            </option>
                        ))}
                    </select>
                    {errors[brgyKey] && (
                        <p className="text-xs text-red-500">{errors[brgyKey]}</p>
                    )}
                </div>
            </div>

            {/* Province — fixed read-only */}
            <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Province</Label>
                <Input
                    value="Cavite"
                    disabled
                    className="h-11 bg-gray-50 text-gray-500 cursor-not-allowed dark:bg-gray-800"
                />
            </div>
        </div>
    );
}
