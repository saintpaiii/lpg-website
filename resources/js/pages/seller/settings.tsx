import React, { useEffect, useRef, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { usePlan } from '@/hooks/use-plan';
import { openUpgrade } from '@/lib/plans';
import type { SharedData } from '@/types';
import { AddressFields } from '@/components/address-fields';
import { NoVehicleBanner } from '@/components/no-vehicle-banner';
import {
    Building2,
    Camera,
    CreditCard,
    Lock,
    Crosshair,
    Mail,
    MapPin,
    Phone,
    Store,
    Truck,
} from 'lucide-react';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import ServiceAreaLimit from '@/components/service-area-limit';
import LocationAccuracyNotice from '@/components/location-accuracy-notice';
import { useAutoFillAddress } from '@/hooks/use-auto-fill-address';
import {
    ACCURATE_ENOUGH_M, DEVICE_LOCATION_FAILED, getDeviceLocation, isInServiceArea, OUTSIDE_SERVICE_AREA_DEVICE, SERVICE_AREA_MESSAGE, type FilledAddress,
} from '@/lib/map';
import type { LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Spinner } from '@/components/ui/spinner';
import { TaxInvoiceCard, type TaxSettings } from '@/components/tax-invoice-card';
import { RefundWindowCard } from '@/components/refund-window-card';
import { IMAGE_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';
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
    max_delivery_radius_km: number;
    /** Has a usable vehicle with a delivery fee */
    can_deliver: boolean;
    latitude: number | null;
    longitude: number | null;
    attendance_radius: number;
    allow_cod: boolean;
    allow_pickup: boolean;
    pickup_instructions: string;
}

interface Props {
    store: StoreData;
    tax: TaxSettings;
    /** Owner — staff with Settings see the Tax & Invoice card read-only */
    can_edit_tax: boolean;
    /** Settings → Refunds: days after delivery a refund can be requested */
    refund_window_days: number;
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
        </div>
    );
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

export default function SellerSettings({ store, tax, can_edit_tax, refund_window_days }: Props) {
    // The Loyalty Program page is owner-only; staff with settings.view see plain text
    const isOwner = usePage<SharedData>().props.auth.user?.role === 'seller';
    const { has } = usePlan();
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
    // Store pins must be inside the Cavite service area
    const [pinMsg, setPinMsg] = useState<string | null>(null);
    // A rough "current location" (computer without GPS) — must be confirmed before saving
    const [roughM, setRoughM] = useState<number | null>(null);
    const [locating, setLocating] = useState(false);
    const markerRef = useRef<LeafletMarker | null>(null);
    const placePin = (lat: number, lng: number): boolean => {
        if (!isInServiceArea(lat, lng)) { setPinMsg(SERVICE_AREA_MESSAGE); return false; }
        setPin({ lat, lng });
        setPinMsg(null);
        setRoughM(null);
        return true;
    };
    // Tapping the map / dropping the pin fills the address (autoFill is declared below; this runs on click)
    onPickRef.current = (lat, lng) => { if (placePin(lat, lng)) autoFill.onPinMoved(lat, lng); };

    // Manual Latitude / Longitude boxes: typed freely, applied on blur / Enter (outside Cavite → message, pin stays)
    const [latText, setLatText] = useState(pin ? String(pin.lat) : '');
    const [lngText, setLngText] = useState(pin ? String(pin.lng) : '');
    useEffect(() => {
        setLatText(pin ? String(pin.lat) : '');
        setLngText(pin ? String(pin.lng) : '');
    }, [pin?.lat, pin?.lng]);
    function applyManualPin() {
        const lat = parseFloat(latText);
        const lng = parseFloat(lngText);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        if (pin && lat === pin.lat && lng === pin.lng) return;
        if (!placePin(lat, lng)) {
            setLatText(pin ? String(pin.lat) : '');
            setLngText(pin ? String(pin.lng) : '');
        }
    }

    function useDeviceLocation() {
        setPinMsg(null);
        setLocating(true);
        getDeviceLocation().then((loc) => {
            if (!isInServiceArea(loc.lat, loc.lng)) { setPinMsg(OUTSIDE_SERVICE_AREA_DEVICE); return; }
            setPin({ lat: loc.lat, lng: loc.lng });
            setRoughM(loc.accuracy_m > ACCURATE_ENOUGH_M ? loc.accuracy_m : null);
            autoFill.fillNow(loc.lat, loc.lng);
        }).catch(() => setPinMsg(DEVICE_LOCATION_FAILED))
            .finally(() => setLocating(false));
    }

    // City + barangay + street together, without the barangay handler (keeps the GPS pin where it is)
    function applyFoundAddress(a: FilledAddress) {
        setData((d) => ({ ...d, city: a.city, barangay: a.barangay, address: a.street }));
    }

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
        max_delivery_radius_km: string;
        allow_cod: boolean;
        allow_pickup: boolean;
        pickup_instructions: string;
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
        max_delivery_radius_km: String(store.max_delivery_radius_km ?? 20),
        allow_cod:                store.allow_cod,
        allow_pickup:             !!store.allow_pickup,
        pickup_instructions:      store.pickup_instructions ?? '',
        logo:                   null,
    });

    // Moving the store pin fills city / barangay (and the street when it wasn't typed)
    const autoFill = useAutoFillAddress({ street: data.address, apply: applyFoundAddress });

    async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (!picked) return;
        // Any photo (WEBP, GIF, a WEBP named .jpg…) → real JPEG, small enough for the 2 MB limit; the preview shows the result
        const { file, problem } = await prepareDocumentFile(picked, { allowPdf: false, maxSide: 1000 });
        setFormErrors((errs) => ({ ...errs, logo: problem ?? '' }));
        if (!file) return;
        setData('logo', file);
        setPreviewUrl(URL.createObjectURL(file));
    }

    function submit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        if (roughM !== null) {
            setPinMsg('Please drag the pin to your store\'s exact entrance, or click "Use this spot" first.');
            return;
        }
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
        fd.append('max_delivery_radius_km', data.max_delivery_radius_km || '20');
        fd.append('allow_cod',                data.allow_cod ? '1' : '0');
        fd.append('allow_pickup',             data.allow_pickup ? '1' : '0');
        fd.append('pickup_instructions',      data.pickup_instructions);
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
    const locationError = (formErrors as Record<string, string | undefined>).latitude ?? (formErrors as Record<string, string | undefined>).longitude;

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
                            <CardDescription>JPG, PNG or WEBP. Displayed on your store profile.</CardDescription>
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
                                        accept={IMAGE_ACCEPT}
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

                        </CardContent>
                    </Card>

                    {/* Delivery */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4 text-blue-600" />
                                Delivery
                            </CardTitle>
                            <CardDescription>
                                Delivery fees are set per vehicle type on the{' '}
                                <Link href="/seller/vehicles" className="font-medium text-blue-600 hover:underline">Vehicles page</Link>.
                                At checkout the cheapest vehicle that can carry the order is chosen automatically.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!store.can_deliver && <NoVehicleBanner />}
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
                        </CardContent>
                    </Card>

                    {/* Payment Options */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-blue-600" />
                                Payment Options
                            </CardTitle>
                            <CardDescription>
                                Full Payment (online) is always available. Choose which other options customers see at checkout.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ToggleRow
                                label="Cash on Delivery"
                                hint="The rider collects cash when the order is delivered."
                                checked={data.allow_cod}
                                onChange={(v) => setData('allow_cod', v)}
                            />
                            {/* Consignment lives in the Loyalty Program (owner only; Pro plan) */}
                            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                                Consignment (pay later) is part of the Loyalty Program.
                                {isOwner && (
                                    <Link
                                        href="/seller/loyalty/settings"
                                        onClick={(e) => { if (!has('loyalty')) { e.preventDefault(); openUpgrade('loyalty'); } }}
                                        className="font-medium text-blue-600 hover:underline"
                                    >
                                        Open Loyalty Program
                                    </Link>
                                )}
                                {!has('loyalty') && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                        <Lock className="h-2.5 w-2.5" /> Pro
                                    </span>
                                )}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Pick-up */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Store className="h-4 w-4 text-blue-600" />
                                Pick-up
                            </CardTitle>
                            <CardDescription>
                                Customers can choose to pick up their order at your store — no delivery fee and no rider.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ToggleRow
                                label="Allow customers to pick up orders at the store"
                                hint="Shown at checkout as “Pick up at the store”. Cash on Delivery becomes “Pay at the store”."
                                checked={data.allow_pickup}
                                onChange={(v) => setData('allow_pickup', v)}
                            />
                            {data.allow_pickup && (
                                <div className="grid gap-1.5">
                                    <Label htmlFor="pickup_instructions">Pick-up instructions</Label>
                                    <textarea
                                        id="pickup_instructions"
                                        rows={2}
                                        maxLength={255}
                                        value={data.pickup_instructions}
                                        onChange={(e) => setData('pickup_instructions', e.target.value)}
                                        placeholder="e.g. Open 8 AM – 6 PM. Please bring your empty tank."
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                                    />
                                    <p className="text-xs text-muted-foreground">{data.pickup_instructions.length}/255 · Shown to the customer at checkout and when the order is ready.</p>
                                    {allErrors.pickup_instructions && <p className="text-xs text-red-500">{allErrors.pickup_instructions}</p>}
                                </div>
                            )}
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
                                autoFill={autoFill}
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
                                Drag the pin to your store's exact entrance. Using 'current location' on a computer may be
                                several kilometers off.
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
                                            <Marker position={[pin.lat, pin.lng]} draggable
                                                ref={(m) => { markerRef.current = m; }}
                                                eventHandlers={{
                                                    dragend: () => {
                                                        const m = markerRef.current;
                                                        if (!m) return;
                                                        const { lat, lng } = m.getLatLng();
                                                        if (!placePin(+lat.toFixed(7), +lng.toFixed(7))) m.setLatLng([pin.lat, pin.lng]);
                                                        else autoFill.onPinMoved(+lat.toFixed(7), +lng.toFixed(7));
                                                    },
                                                }} />
                                            <Circle
                                                center={[pin.lat, pin.lng]}
                                                radius={Number(radius) || 500}
                                                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1.5 }}
                                            />
                                        </>
                                    )}
                                    <ServiceAreaLimit outline />
                                </MapContainer>
                            </div>

                            {/* Coordinates display */}
                            {pin ? (
                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span>
                                        Pinned at: <span className="font-mono">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</span>
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs font-medium text-amber-700">Required: click the map to pin your store. Delivery fees and staff clock-in use this spot.</p>
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
                                        value={latText}
                                        onChange={(e) => setLatText(e.target.value)}
                                        onBlur={applyManualPin}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyManualPin(); } }}
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
                                        value={lngText}
                                        onChange={(e) => setLngText(e.target.value)}
                                        onBlur={applyManualPin}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyManualPin(); } }}
                                        className="text-xs font-mono h-8"
                                    />
                                </div>
                            </div>

                            {/* Use my location button */}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={useDeviceLocation}
                                disabled={locating}
                            >
                                {locating ? <Spinner className="mr-1.5 h-4 w-4" /> : <Crosshair className="mr-1.5 h-4 w-4" />}
                                Use My Current Location
                            </Button>
                            {roughM !== null && <LocationAccuracyNotice accuracyM={roughM} onConfirm={() => setRoughM(null)} />}
                            {pinMsg && <p className="text-xs text-red-600">{pinMsg}</p>}
                            {!pinMsg && locationError && <p className="text-xs text-red-600">{locationError}</p>}

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

                {/* Own form + endpoint (owner only) */}
                <TaxInvoiceCard tax={tax} canEdit={can_edit_tax} storeName={store.store_name} />

                {/* Own form + endpoint (PUT seller/settings/refunds) */}
                <RefundWindowCard days={refund_window_days} />
            </div>
        </AppLayout>
    );
}
