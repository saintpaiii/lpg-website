import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Flame } from 'lucide-react';
import React, { useState } from 'react';
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
        name:                  '',
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
                            {/* Name + Phone */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Full name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input id="name" type="text" required autoFocus autoComplete="name"
                                        placeholder="Juan dela Cruz" className="h-11"
                                        value={fields.name} onChange={(e) => set('name', e.target.value)} />
                                    <InputError message={errors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Phone number <span className="text-red-500">*</span>
                                    </Label>
                                    <Input id="phone" type="tel" required autoComplete="tel"
                                        placeholder="09xx-xxx-xxxx" className="h-11"
                                        value={fields.phone} onChange={(e) => set('phone', e.target.value)} />
                                    <InputError message={errors.phone} />
                                </div>
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
                            <div className="grid gap-2">
                                <Label htmlFor="address" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Street address <span className="text-red-500">*</span>
                                </Label>
                                <Input id="address" type="text" required autoComplete="street-address"
                                    placeholder="123 Rizal St." className="h-11"
                                    value={fields.address} onChange={(e) => set('address', e.target.value)} />
                                <InputError message={errors.address} />
                            </div>

                            {/* City + Barangay */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="city" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        City / Municipality <span className="text-red-500">*</span>
                                    </Label>
                                    <Input id="city" type="text" required autoComplete="address-level2"
                                        placeholder="Cavite City" className="h-11"
                                        value={fields.city} onChange={(e) => set('city', e.target.value)} />
                                    <InputError message={errors.city} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="barangay" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Barangay
                                    </Label>
                                    <Input id="barangay" type="text" autoComplete="address-level3"
                                        placeholder="Brgy. San Roque" className="h-11"
                                        value={fields.barangay} onChange={(e) => set('barangay', e.target.value)} />
                                    <InputError message={errors.barangay} />
                                </div>
                            </div>

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
