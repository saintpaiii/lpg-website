import React, { useEffect, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import { AddressFields } from '@/components/address-fields';
import {
    Building2,
    Camera,
    Crosshair,
    Mail,
    MapPin,
    Phone,
    Store,
    Truck,
} from 'lucide-react';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreData {
    id: number;
    store_name: string;
    description: string | null;
    address: string;
    city: string;
    barangay: string | null;
    province: string;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    commission_rate: number;
    delivery_fee: number;
    base_delivery_fee: number;
    fee_per_km: number;
    max_delivery_radius_km: number;
    latitude: number | null;
    longitude: number | null;
    attendance_radius: number;
}

interface Props {
    store: StoreData;
}

// ── Map click handler ──────────────────────────────────────────────────────────
// Uses a ref for the callback to avoid stale closures with Leaflet native events.

function MapClickHandler({ onPickRef }: { onPickRef: React.RefObject<((lat: number, lng: number) => void) | null> }) {
    useMapEvents({
        click(e: LeafletMouseEvent) {
            onPickRef.current?.(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SellerSettings({ store }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Settings', href: '/seller/settings' },
    ];

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(store.logo_url);

    // ── Location state (kept OUTSIDE useForm to avoid forceFormData serialization issues) ──
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
        store.latitude && store.longitude ? { lat: store.latitude, lng: store.longitude } : null,
    );
    const [radius, setRadius] = useState<string>(String(store.attendance_radius ?? 500));
    const [processing, setProcessing] = useState(false);
    const [recentlySuccessful, setRecentlySuccessful] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // Stable ref for map click — avoids stale closure in Leaflet event listeners
    const onPickRef = useRef<((lat: number, lng: number) => void) | null>(null);
    onPickRef.current = (lat, lng) => setPin({ lat, lng });

    // Fix Leaflet default icon paths (broken by bundler)
    useEffect(() => {
        import('leaflet').then((L) => {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
        });
    }, []);

    // useForm handles all fields EXCEPT latitude, longitude, attendance_radius
    const { data, setData, errors } = useForm<{
        store_name: string;
        description: string;
        address: string;
        city: string;
        barangay: string;
        province: string;
        phone: string;
        email: string;
        delivery_fee: string;
        base_delivery_fee: string;
        fee_per_km: string;
        max_delivery_radius_km: string;
        logo: File | null;
    }>({
        store_name:   store.store_name,
        description:  store.description ?? '',
        address:      store.address,
        city:         store.city,
        barangay:     store.barangay ?? '',
        province:     store.province,
        phone:        store.phone ?? '',
        email:        store.email ?? '',
        delivery_fee:           store.delivery_fee > 0 ? String(store.delivery_fee) : '',
        base_delivery_fee:      String(store.base_delivery_fee ?? 45),
        fee_per_km:             String(store.fee_per_km ?? 10),
        max_delivery_radius_km: String(store.max_delivery_radius_km ?? 20),
        logo:                   null,
    });

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('logo', file);
        if (file) setPreviewUrl(URL.createObjectURL(file));
    }

    function submit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setProcessing(true);
        setRecentlySuccessful(false);

        // Build FormData manually so we have full control over every field
        const fd = new FormData();
        fd.append('_method', 'PUT');
        fd.append('store_name',  data.store_name);
        fd.append('description', data.description);
        fd.append('address',     data.address);
        fd.append('city',        data.city);
        fd.append('barangay',    data.barangay);
        fd.append('province',    data.province || 'Cavite');
        fd.append('phone',       data.phone);
        fd.append('email',       data.email);
        fd.append('delivery_fee',           data.delivery_fee);
        fd.append('base_delivery_fee',      data.base_delivery_fee || '45');
        fd.append('fee_per_km',             data.fee_per_km || '10');
        fd.append('max_delivery_radius_km', data.max_delivery_radius_km || '20');
        // Location fields — sent as numeric strings or empty (→ null on backend)
        fd.append('latitude',          pin ? String(pin.lat) : '');
        fd.append('longitude',         pin ? String(pin.lng) : '');
        fd.append('attendance_radius', radius || '500');
        if (data.logo) fd.append('logo', data.logo, data.logo.name);

        router.post('/seller/settings', fd, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setRecentlySuccessful(true);
                setTimeout(() => setRecentlySuccessful(false), 3000);
            },
            onError: (errs) => setFormErrors(errs),
            onFinish: () => setProcessing(false),
        });
    }

    // Merge errors from useForm + manual formErrors
    const allErrors = { ...errors, ...formErrors };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Store Settings" />

            <div className="p-6 max-w-3xl space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Store className="h-6 w-6 text-blue-600" />
                        Store Settings
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage your store's profile information and contact details.
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-6">
                    {/* Store Logo */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Camera className="h-4 w-4 text-blue-600" />
                                Store Logo
                            </CardTitle>
                            <CardDescription>JPG or PNG, max 2MB. Displayed on your store profile.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-6">
                                <div className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Store logo" className="h-full w-full object-cover" />
                                    ) : (
                                        <Store className="h-8 w-8 text-gray-300" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png"
                                        className="hidden"
                                        onChange={handleLogoChange}
                                    />
                                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                        <Camera className="mr-1.5 h-4 w-4" />
                                        {previewUrl ? 'Change Logo' : 'Upload Logo'}
                                    </Button>
                                    {previewUrl && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => {
                                                setPreviewUrl(null);
                                                setData('logo', null);
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                    {allErrors.logo && <p className="text-xs text-red-500">{allErrors.logo}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Store Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-600" />
                                Store Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="store_name">Store Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="store_name"
                                    value={data.store_name}
                                    onChange={(e) => setData('store_name', e.target.value)}
                                    placeholder="My LPG Store"
                                />
                                {allErrors.store_name && <p className="text-xs text-red-500">{allErrors.store_name}</p>}
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="description">Description</Label>
                                <textarea
                                    id="description"
                                    rows={3}
                                    value={data.description}
                                    onChange={(e) => setData('description', e.target.value)}
                                    placeholder="Brief description of your store…"
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                />
                                {allErrors.description && <p className="text-xs text-red-500">{allErrors.description}</p>}
                            </div>

                            {/* Platform info (read-only) */}
                            <div className="rounded-lg bg-muted/40 p-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">Commission Rate</p>
                                    <p className="font-bold text-blue-700 mt-0.5">{store.commission_rate}%</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">Commission rate is managed by the platform administrator and deducted from each delivered order.</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Delivery */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4 text-blue-600" />
                                Delivery Fee Settings
                            </CardTitle>
                            <CardDescription>
                                Customers are charged a base fee plus a per-km rate based on their distance from your store.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="base_delivery_fee">Base Delivery Fee (₱)</Label>
                                    <Input
                                        id="base_delivery_fee"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={data.base_delivery_fee}
                                        onChange={(e) => setData('base_delivery_fee', e.target.value)}
                                        placeholder="45"
                                    />
                                    {allErrors.base_delivery_fee && <p className="text-xs text-red-500">{allErrors.base_delivery_fee}</p>}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="fee_per_km">Fee per km (₱)</Label>
                                    <Input
                                        id="fee_per_km"
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={data.fee_per_km}
                                        onChange={(e) => setData('fee_per_km', e.target.value)}
                                        placeholder="10"
                                    />
                                    {allErrors.fee_per_km && <p className="text-xs text-red-500">{allErrors.fee_per_km}</p>}
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="max_delivery_radius_km">Max Delivery Radius (km)</Label>
                                <Input
                                    id="max_delivery_radius_km"
                                    type="number"
                                    min="1"
                                    max="200"
                                    step="1"
                                    value={data.max_delivery_radius_km}
                                    onChange={(e) => setData('max_delivery_radius_km', e.target.value)}
                                    placeholder="20"
                                />
                                <p className="text-xs text-muted-foreground">Orders outside this radius will be rejected.</p>
                                {allErrors.max_delivery_radius_km && <p className="text-xs text-red-500">{allErrors.max_delivery_radius_km}</p>}
                            </div>
                            {/* Sample calculation */}
                            {(() => {
                                const base  = parseFloat(data.base_delivery_fee)  || 45;
                                const perKm = parseFloat(data.fee_per_km)         || 10;
                                const ex5km = Math.ceil((base + 5 * perKm) / 5) * 5;
                                const ex10km = Math.ceil((base + 10 * perKm) / 5) * 5;
                                return (
                                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                                        <p className="font-semibold">Example calculations:</p>
                                        <p>5 km away → ₱{base} + (5 × ₱{perKm}) = <strong>₱{ex5km}</strong></p>
                                        <p>10 km away → ₱{base} + (10 × ₱{perKm}) = <strong>₱{ex10km}</strong></p>
                                        <p className="text-blue-600/70">Rounded up to nearest ₱5.</p>
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    {/* Contact & Location */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Phone className="h-4 w-4 text-blue-600" />
                                Contact & Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <AddressFields
                                address={data.address}
                                city={data.city}
                                barangay={data.barangay}
                                onAddressChange={(v) => setData('address', v)}
                                onCityChange={(v) => setData('city', v)}
                                onBarangayChange={(v) => setData('barangay', v)}
                                errors={allErrors}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="phone">
                                        <Phone className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                        Phone
                                    </Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={data.phone}
                                        onChange={(e) => setData('phone', e.target.value.replace(/\D/g, '').slice(0, 11))}
                                        placeholder="09xxxxxxxxx"
                                        maxLength={11}
                                    />
                                    {allErrors.phone && <p className="text-xs text-red-500">{allErrors.phone}</p>}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="email">
                                        <Mail className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                        Email
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={data.email}
                                        onChange={(e) => setData('email', e.target.value)}
                                        placeholder="store@example.com"
                                    />
                                    {allErrors.email && <p className="text-xs text-red-500">{allErrors.email}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Attendance Location */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-blue-600" />
                                Attendance Location
                            </CardTitle>
                            <CardDescription>
                                Pin your store on the map. Staff must be within the radius to clock in/out.
                                Click the map to set a pin, or use the button to use your current GPS location.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Map */}
                            <div className="rounded-lg overflow-hidden border border-gray-200 h-64">
                                <MapContainer
                                    center={pin ? [pin.lat, pin.lng] : [14.4791, 120.8980]}
                                    zoom={pin ? 16 : 12}
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    <MapClickHandler onPickRef={onPickRef} />
                                    {pin && (
                                        <>
                                            <Marker position={[pin.lat, pin.lng]} />
                                            <Circle
                                                center={[pin.lat, pin.lng]}
                                                radius={Number(radius) || 500}
                                                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1.5 }}
                                            />
                                        </>
                                    )}
                                </MapContainer>
                            </div>

                            {/* Coordinates display */}
                            {pin ? (
                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span>
                                        Pinned at: <span className="font-mono">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</span>
                                    </span>
                                    <button
                                        type="button"
                                        className="text-red-500 underline"
                                        onClick={() => setPin(null)}
                                    >
                                        Remove pin
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 italic">No location pinned — click the map to set a location.</p>
                            )}

                            {/* Manual lat/lng inputs */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1">
                                    <Label htmlFor="lat_input" className="text-xs">Latitude</Label>
                                    <Input
                                        id="lat_input"
                                        type="number"
                                        step="any"
                                        placeholder="14.4791"
                                        value={pin?.lat ?? ''}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v)) setPin(p => ({ lat: v, lng: p?.lng ?? 120.8980 }));
                                        }}
                                        className="text-xs font-mono h-8"
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <Label htmlFor="lng_input" className="text-xs">Longitude</Label>
                                    <Input
                                        id="lng_input"
                                        type="number"
                                        step="any"
                                        placeholder="120.8980"
                                        value={pin?.lng ?? ''}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v)) setPin(p => ({ lat: p?.lat ?? 14.4791, lng: v }));
                                        }}
                                        className="text-xs font-mono h-8"
                                    />
                                </div>
                            </div>

                            {/* Use my location button */}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    navigator.geolocation?.getCurrentPosition(
                                        (pos) => setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                        () => alert('Could not get your location. Please check your browser permissions.'),
                                    );
                                }}
                            >
                                <Crosshair className="mr-1.5 h-4 w-4" />
                                Use My Current Location
                            </Button>

                            {/* Attendance radius */}
                            <div className="grid gap-1.5">
                                <Label htmlFor="attendance_radius">Allowed Clock-In Radius (meters)</Label>
                                <Input
                                    id="attendance_radius"
                                    type="number"
                                    min="50"
                                    max="5000"
                                    step="50"
                                    value={radius}
                                    onChange={(e) => setRadius(e.target.value)}
                                    placeholder="500"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Staff must be within this distance from the store pin to clock in/out. Default: 500 m.
                                </p>
                                {allErrors.attendance_radius && <p className="text-xs text-red-500">{allErrors.attendance_radius}</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex items-center justify-end gap-3">
                        {recentlySuccessful && (
                            <p className="text-sm text-emerald-600 font-medium">Settings saved.</p>
                        )}
                        <Button type="submit" disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
