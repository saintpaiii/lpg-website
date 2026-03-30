import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Flame } from 'lucide-react';
import React, { useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthIndicator } from '@/components/ui/password-strength';
import { Spinner } from '@/components/ui/spinner';

export default function Register() {
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors]         = useState<Record<string, string>>({});

    const [fields, setFields] = useState({
        first_name:            '',
        middle_name:           '',
        last_name:             '',
        email:                 '',
        phone:                 '',
        address:               '',
        city:                  '',
        barangay:              '',
        password:              '',
        password_confirmation: '',
    });

    function set(key: keyof typeof fields, value: string) {
        setFields((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setProcessing(true);
        setErrors({});

        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v));

        try {
            await axios.post('/register', formData);
            window.location.href = '/email/verify';
        } catch (err: any) {
            const responseErrors = err?.response?.data?.errors ?? {};
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(responseErrors)) {
                mapped[key] = (messages as string[])[0];
            }
            setErrors(mapped);
            setProcessing(false);
        }
    }

    return (
        <div className="flex min-h-screen">
            <Head title="Create Account — LPG Marketplace" />

            {/* Left panel — branding */}
            <div className="hidden lg:flex lg:w-5/12 flex-col items-center justify-center bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 px-12 text-white">
                <div className="max-w-sm text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                            <Flame className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight">
                        Join LPG Marketplace<br />Cavite
                    </h1>
                    <p className="text-blue-100 text-base leading-relaxed">
                        Create your customer account and start ordering LPG
                        online with real-time delivery tracking.
                    </p>

                    <div className="mt-10 space-y-3 text-left">
                        {[
                            'Order from multiple LPG stores',
                            'Real-time delivery tracking',
                            'View invoices and order history',
                            'Fast, safe, certified delivery',
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-3 text-sm text-blue-100">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-300 shrink-0" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right panel — register form */}
            <div className="flex w-full flex-col bg-gray-50 px-6 py-10 lg:w-7/12 dark:bg-gray-950 overflow-y-auto">
                <div>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>

                <div className="flex flex-1 items-center justify-center py-8">
                    <div className="w-full max-w-lg">

                        {/* Mobile logo */}
                        <div className="mb-8 flex flex-col items-center lg:hidden">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
                                <Flame className="h-7 w-7 text-white" />
                            </div>
                            <h1 className="text-center text-xl font-bold text-gray-900 dark:text-white">
                                LPG Marketplace Cavite
                            </h1>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Create your account
                            </h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Fill in your details to start ordering LPG online
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            {/* First / Middle / Last Name */}
                            <div className="grid gap-5 sm:grid-cols-3">
                                <div className="grid gap-2">
                                    <Label htmlFor="first_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        First name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input id="first_name" type="text" required autoFocus autoComplete="given-name"
                                        placeholder="Juan" className="h-11"
                                        value={fields.first_name} onChange={(e) => set('first_name', e.target.value)} />
                                    <InputError message={errors.first_name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="middle_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Middle name
                                    </Label>
                                    <Input id="middle_name" type="text" autoComplete="additional-name"
                                        placeholder="Santos (optional)" className="h-11"
                                        value={fields.middle_name} onChange={(e) => set('middle_name', e.target.value)} />
                                    <InputError message={errors.middle_name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="last_name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Last name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input id="last_name" type="text" required autoComplete="family-name"
                                        placeholder="dela Cruz" className="h-11"
                                        value={fields.last_name} onChange={(e) => set('last_name', e.target.value)} />
                                    <InputError message={errors.last_name} />
                                </div>
                            </div>

                            {/* Phone */}
                            <div className="grid gap-2">
                                <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Phone number <span className="text-red-500">*</span>
                                </Label>
                                <Input id="phone" type="tel" required autoComplete="tel"
                                    placeholder="09xxxxxxxxx" className="h-11"
                                    maxLength={11}
                                    value={fields.phone}
                                    onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} />
                                <InputError message={errors.phone} />
                            </div>

                            {/* Email */}
                            <div className="grid gap-2">
                                <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Email address <span className="text-red-500">*</span>
                                </Label>
                                <Input id="email" type="email" required autoComplete="email"
                                    placeholder="you@example.com" className="h-11"
                                    value={fields.email} onChange={(e) => set('email', e.target.value)} />
                                <InputError message={errors.email} />
                            </div>

                            {/* Address */}
                            <AddressFields
                                address={fields.address}
                                city={fields.city}
                                barangay={fields.barangay}
                                onAddressChange={(v) => set('address', v)}
                                onCityChange={(v) => set('city', v)}
                                onBarangayChange={(v) => set('barangay', v)}
                                errors={errors}
                            />

                            {/* Password */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Password <span className="text-red-500">*</span>
                                    </Label>
                                    <PasswordInput id="password" required autoComplete="new-password"
                                        placeholder="••••••••" className="h-11"
                                        value={fields.password} onChange={(e) => set('password', e.target.value)} />
                                    <InputError message={errors.password} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="password_confirmation" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Confirm password <span className="text-red-500">*</span>
                                    </Label>
                                    <PasswordInput id="password_confirmation" required autoComplete="new-password"
                                        placeholder="••••••••" className="h-11"
                                        value={fields.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} />
                                    <InputError message={errors.password_confirmation} />
                                </div>
                            </div>
                            <PasswordStrengthIndicator password={fields.password} />

                            <Button
                                type="submit"
                                disabled={processing}
                                className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700 mt-2"
                            >
                                {processing && <Spinner />}
                                Create account
                            </Button>
                        </form>

                        <div className="mt-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                            <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                        </div>

                        <a
                            href="/auth/google"
                            className="mt-4 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-300 hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-750"
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Continue with Google
                        </a>

                        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            Already have an account?{' '}
                            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                                Sign in
                            </Link>
                        </p>

                        <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                            Want to sell on our platform? Register here, then apply from your customer account.
                        </p>

                        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600">
                            LPG Marketplace &bull; Cavite
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
