import { Head, useForm } from '@inertiajs/react';
import { toast } from 'sonner';
import { AddressFields } from '@/components/address-fields';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import CustomerLayout from '@/layouts/customer-layout';
import type { FormEvent } from 'react';

type Profile = {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    barangay: string;
};

type Props = { profile: Profile };

export default function CustomerProfile({ profile }: Props) {
    const profileForm = useForm({
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        barangay: profile.barangay,
    });

    const passwordForm = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    function handleProfileSubmit(e: FormEvent) {
        e.preventDefault();
        profileForm.put('/customer/profile', {
            preserveScroll: true,
            onSuccess: () => toast.success('Profile updated.'),
        });
    }

    function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        passwordForm.put('/customer/profile/password', {
            preserveScroll: true,
            onSuccess: () => { passwordForm.reset(); toast.success('Password changed.'); },
        });
    }

    return (
        <CustomerLayout title="My Profile">
            <Head title="My Profile — LPG Portal" />

            <div className="max-w-2xl space-y-6">
                {/* Profile form */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Personal Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleProfileSubmit} className="space-y-4">
                            {/* Email — read only */}
                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium text-gray-700">Email address</Label>
                                <Input
                                    type="email"
                                    value={profile.email}
                                    disabled
                                    className="bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-400">Email cannot be changed. Contact support if needed.</p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="name" className="text-sm font-medium">Full name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="name"
                                        value={profileForm.data.name}
                                        onChange={(e) => profileForm.setData('name', e.target.value)}
                                    />
                                    {profileForm.errors.name && (
                                        <p className="text-xs text-red-500">{profileForm.errors.name}</p>
                                    )}
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="phone" className="text-sm font-medium">Phone number <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={profileForm.data.phone}
                                        onChange={(e) => profileForm.setData('phone', e.target.value)}
                                    />
                                    {profileForm.errors.phone && (
                                        <p className="text-xs text-red-500">{profileForm.errors.phone}</p>
                                    )}
                                </div>
                            </div>

                            <AddressFields
                                address={profileForm.data.address}
                                city={profileForm.data.city}
                                barangay={profileForm.data.barangay}
                                onAddressChange={(v) => profileForm.setData('address', v)}
                                onCityChange={(v) => profileForm.setData('city', v)}
                                onBarangayChange={(v) => profileForm.setData('barangay', v)}
                                errors={profileForm.errors}
                            />

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    disabled={profileForm.processing}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {profileForm.processing && <Spinner />}
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Password form */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Change Password</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="current_password" className="text-sm font-medium">Current password</Label>
                                <PasswordInput
                                    id="current_password"
                                    autoComplete="current-password"
                                    value={passwordForm.data.current_password}
                                    onChange={(e) => passwordForm.setData('current_password', e.target.value)}
                                />
                                {passwordForm.errors.current_password && (
                                    <p className="text-xs text-red-500">{passwordForm.errors.current_password}</p>
                                )}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="new_password" className="text-sm font-medium">New password</Label>
                                    <PasswordInput
                                        id="new_password"
                                        autoComplete="new-password"
                                        value={passwordForm.data.password}
                                        onChange={(e) => passwordForm.setData('password', e.target.value)}
                                    />
                                    {passwordForm.errors.password && (
                                        <p className="text-xs text-red-500">{passwordForm.errors.password}</p>
                                    )}
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="password_confirmation" className="text-sm font-medium">Confirm new password</Label>
                                    <PasswordInput
                                        id="password_confirmation"
                                        autoComplete="new-password"
                                        value={passwordForm.data.password_confirmation}
                                        onChange={(e) => passwordForm.setData('password_confirmation', e.target.value)}
                                    />
                                    {passwordForm.errors.password_confirmation && (
                                        <p className="text-xs text-red-500">{passwordForm.errors.password_confirmation}</p>
                                    )}
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    disabled={passwordForm.processing}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {passwordForm.processing && <Spinner />}
                                    Update Password
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </CustomerLayout>
    );
}
