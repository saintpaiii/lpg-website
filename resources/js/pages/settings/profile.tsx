import { Head, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useRef } from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

export default function Profile() {
    const { auth } = usePage<{ auth: { user: { name: string; email: string; role: string | null; phone: string | null; is_admin: boolean } } }>().props;
    const user = auth.user;

    const roleLabel = user.role
        ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
        : user.is_admin
        ? 'Admin'
        : 'User';

    // ── Profile form ─────────────────────────────────────────────────────────
    const profileForm = useForm({
        name:  user.name,
        email: user.email,
        phone: user.phone ?? '',
    });

    const submitProfile: FormEventHandler = (e) => {
        e.preventDefault();
        profileForm.patch('/settings/profile', { preserveScroll: true });
    };

    // ── Password form ─────────────────────────────────────────────────────────
    const passwordInput    = useRef<HTMLInputElement>(null);
    const currentPassInput = useRef<HTMLInputElement>(null);

    const passForm = useForm({
        current_password:      '',
        password:              '',
        password_confirmation: '',
    });

    const submitPassword: FormEventHandler = (e) => {
        e.preventDefault();
        passForm.put('/settings/password', {
            preserveScroll: true,
            onSuccess: () => passForm.reset(),
            onError: (errors) => {
                if (errors.password) passwordInput.current?.focus();
                if (errors.current_password) currentPassInput.current?.focus();
            },
        });
    };

    return (
        <AppLayout>
            <Head title="Profile Settings" />

            <SettingsLayout>
                {/* ── Profile Information ─────────────────────────────── */}
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Profile information"
                        description="Update your name and phone number"
                    />

                    <form onSubmit={submitProfile} className="space-y-5">
                        {/* Name */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={profileForm.data.name}
                                onChange={(e) => profileForm.setData('name', e.target.value)}
                                autoComplete="name"
                                placeholder="Full name"
                            />
                            <InputError message={profileForm.errors.name} />
                        </div>

                        {/* Email — read-only */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={profileForm.data.email}
                                disabled
                                className="bg-muted text-muted-foreground cursor-not-allowed"
                            />
                            <p className="text-xs text-muted-foreground">Email cannot be changed. Contact an administrator if needed.</p>
                        </div>

                        {/* Role — read-only badge */}
                        <div className="grid gap-1.5">
                            <Label>Role</Label>
                            <div className="flex items-center h-9">
                                <Badge variant="outline" className="capitalize text-sm px-3 py-1">
                                    {roleLabel}
                                </Badge>
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="phone">Phone number</Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={profileForm.data.phone}
                                onChange={(e) => profileForm.setData('phone', e.target.value)}
                                autoComplete="tel"
                                placeholder="e.g. 09XX-XXX-XXXX"
                            />
                            <InputError message={profileForm.errors.phone} />
                        </div>

                        <div className="flex items-center gap-4">
                            <Button type="submit" disabled={profileForm.processing}>
                                Save profile
                            </Button>
                            {profileForm.recentlySuccessful && (
                                <p className="text-sm text-green-600">Profile saved.</p>
                            )}
                        </div>
                    </form>
                </div>

                <Separator />

                {/* ── Change Password ─────────────────────────────────── */}
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Change password"
                        description="Use a long, random password to keep your account secure"
                    />

                    <form onSubmit={submitPassword} className="space-y-5">
                        {/* Current password */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="current_password">Current password</Label>
                            <Input
                                id="current_password"
                                ref={currentPassInput}
                                type="password"
                                value={passForm.data.current_password}
                                onChange={(e) => passForm.setData('current_password', e.target.value)}
                                autoComplete="current-password"
                                placeholder="Current password"
                            />
                            <InputError message={passForm.errors.current_password} />
                        </div>

                        {/* New password */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="password">New password</Label>
                            <Input
                                id="password"
                                ref={passwordInput}
                                type="password"
                                value={passForm.data.password}
                                onChange={(e) => passForm.setData('password', e.target.value)}
                                autoComplete="new-password"
                                placeholder="New password (min. 8 characters)"
                            />
                            <InputError message={passForm.errors.password} />
                        </div>

                        {/* Confirm password */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="password_confirmation">Confirm new password</Label>
                            <Input
                                id="password_confirmation"
                                type="password"
                                value={passForm.data.password_confirmation}
                                onChange={(e) => passForm.setData('password_confirmation', e.target.value)}
                                autoComplete="new-password"
                                placeholder="Repeat new password"
                            />
                            <InputError message={passForm.errors.password_confirmation} />
                        </div>

                        <div className="flex items-center gap-4">
                            <Button type="submit" disabled={passForm.processing}>
                                Update password
                            </Button>
                            {passForm.recentlySuccessful && (
                                <p className="text-sm text-green-600">Password updated.</p>
                            )}
                        </div>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
