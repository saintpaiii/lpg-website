import React, { useRef, useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import {
    Building2,
    Camera,
    Mail,
    MapPin,
    Phone,
    Store,
} from 'lucide-react';
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
}

interface Props {
    store: StoreData;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SellerSettings({ store }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Settings', href: '/seller/settings' },
    ];

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(store.logo_url);

    const { data, setData, post, processing, errors, recentlySuccessful } = useForm<{
        store_name: string;
        description: string;
        address: string;
        city: string;
        barangay: string;
        province: string;
        phone: string;
        email: string;
        logo: File | null;
        _method: string;
    }>({
        store_name:  store.store_name,
        description: store.description ?? '',
        address:     store.address,
        city:        store.city,
        barangay:    store.barangay ?? '',
        province:    store.province,
        phone:       store.phone ?? '',
        email:       store.email ?? '',
        logo:        null,
        _method:     'PUT',
    });

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('logo', file);
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    }

    function submit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        post('/seller/settings', { forceFormData: true, preserveScroll: true });
    }

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
                                            onClick={() => { setPreviewUrl(null); setData('logo', null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                    {errors.logo && <p className="text-xs text-red-500">{errors.logo}</p>}
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
                                {errors.store_name && <p className="text-xs text-red-500">{errors.store_name}</p>}
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
                                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
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

                    {/* Contact & Location */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-blue-600" />
                                Contact & Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="address">Address <span className="text-red-500">*</span></Label>
                                <Input
                                    id="address"
                                    value={data.address}
                                    onChange={(e) => setData('address', e.target.value)}
                                    placeholder="Street address"
                                />
                                {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="barangay">Barangay</Label>
                                    <Input
                                        id="barangay"
                                        value={data.barangay}
                                        onChange={(e) => setData('barangay', e.target.value)}
                                        placeholder="Barangay"
                                    />
                                    {errors.barangay && <p className="text-xs text-red-500">{errors.barangay}</p>}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="city">City / Municipality <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="city"
                                        value={data.city}
                                        onChange={(e) => setData('city', e.target.value)}
                                        placeholder="City"
                                    />
                                    {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
                                </div>
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="province">Province <span className="text-red-500">*</span></Label>
                                <Input
                                    id="province"
                                    value={data.province}
                                    onChange={(e) => setData('province', e.target.value)}
                                    placeholder="e.g. Cavite"
                                />
                                {errors.province && <p className="text-xs text-red-500">{errors.province}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="phone">
                                        <Phone className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                        Phone
                                    </Label>
                                    <Input
                                        id="phone"
                                        value={data.phone}
                                        onChange={(e) => setData('phone', e.target.value)}
                                        placeholder="09XXXXXXXXX"
                                    />
                                    {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
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
                                    {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                                </div>
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
