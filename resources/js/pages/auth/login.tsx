import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowLeft, Flame, Lock, Package, Truck, BarChart3 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import type { SharedData } from '@/types';

type Props = {
    status?: string;
    canResetPassword: boolean;
    retryAfter?: number;        // seconds until login is unlocked (0 = not locked)
    remainingAttempts?: number | null; // attempts left before lockout (null = unknown/fresh)
};

const FEATURES = [
    { icon: Package, label: 'Browse Products', desc: 'From multiple LPG stores in Cavite' },
    { icon: Truck,   label: 'Track Deliveries', desc: 'Real-time status with photo proof'  },
    { icon: BarChart3, label: 'Manage Orders',   desc: 'Full order and invoice history'     },
];

export default function Login({ status, canResetPassword, retryAfter = 0, remainingAttempts = null }: Props) {
    const { flash } = usePage<SharedData>().props;
    const deactivationInfo = flash?.deactivation_info;

    const { data, setData, post, processing, errors } = useForm({
        email:    '',
        password: '',
        remember: false as boolean,
    });

    // Lockout countdown
    const [countdown, setCountdown] = useState(retryAfter > 0 ? retryAfter : 0);
    const isLocked = countdown > 0;

    useEffect(() => {
        setCountdown(retryAfter > 0 ? retryAfter : 0);
    }, [retryAfter]);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) { clearInterval(timer); return 0; }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (isLocked) return;
        post('/login');
    }

    return (
        <div className="flex min-h-screen">
            <Head title="Sign In — LPG Distribution Cavite" />

            <style>{`
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50%       { transform: translateY(-18px) rotate(4deg); }
                }
                @keyframes float2 {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50%       { transform: translateY(-12px) rotate(-3deg); }
                }
                @keyframes blob {
                    0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
                    50%       { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
                }
                .fade-1 { animation: fadeUp 0.6s ease-out both 0.05s; }
                .fade-2 { animation: fadeUp 0.6s ease-out both 0.15s; }
                .fade-3 { animation: fadeUp 0.6s ease-out both 0.25s; }
                .fade-4 { animation: fadeUp 0.6s ease-out both 0.35s; }
                .fade-5 { animation: fadeUp 0.6s ease-out both 0.45s; }
                .animate-float  { animation: float  7s ease-in-out infinite; }
                .animate-float2 { animation: float2 9s ease-in-out infinite 2s; }
                .animate-blob   { animation: blob   8s ease-in-out infinite; }
                .dot-pattern {
                    background-image: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
                    background-size: 24px 24px;
                }
                .glass-feat {
                    background: rgba(255,255,255,0.07);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255,255,255,0.13);
                }
            `}</style>

            {/* ── Left panel ── */}
            <div className="relative hidden lg:flex lg:w-[45%] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 px-12 text-white">
                <div className="absolute inset-0 dot-pattern" />
                <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl animate-blob" />
                <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl animate-blob" style={{ animationDelay: '4s' }} />

                {/* Floating LPG cylinders */}
                <div className="absolute right-8 top-16 opacity-20 animate-float">
                    <svg viewBox="0 0 60 100" className="w-14 h-24" aria-hidden="true">
                        <rect x="8" y="20" width="44" height="60" rx="10" fill="#93c5fd" />
                        <ellipse cx="30" cy="20" rx="22" ry="10" fill="#bfdbfe" />
                        <ellipse cx="30" cy="80" rx="22" ry="9" fill="#1e3a8a" opacity="0.5" />
                        <rect x="22" y="8" width="16" height="11" rx="4" fill="#94a3b8" />
                        <rect x="12" y="24" width="7" height="38" rx="3.5" fill="rgba(255,255,255,0.3)" />
                    </svg>
                </div>
                <div className="absolute left-6 bottom-20 opacity-15 animate-float2">
                    <svg viewBox="0 0 60 100" className="w-10 h-16" aria-hidden="true">
                        <rect x="8" y="20" width="44" height="60" rx="10" fill="#93c5fd" />
                        <ellipse cx="30" cy="20" rx="22" ry="10" fill="#bfdbfe" />
                        <ellipse cx="30" cy="80" rx="22" ry="9" fill="#1e3a8a" opacity="0.5" />
                        <rect x="22" y="8" width="16" height="11" rx="4" fill="#94a3b8" />
                    </svg>
                </div>

                <div className="relative z-10 w-full max-w-sm">
                    {/* Logo */}
                    <div className="mb-10 flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/40">
                            <Flame className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-white">LPG Distribution</p>
                            <p className="text-xs text-blue-300">Cavite Marketplace</p>
                        </div>
                    </div>

                    <h1 className="text-3xl font-extrabold leading-tight text-white">
                        Your Trusted<br />
                        <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                            LPG Marketplace
                        </span>
                    </h1>
                    <p className="mt-3 text-sm text-blue-200/80 leading-relaxed">
                        Multiple distributors, secure payments, and real-time delivery tracking — all in one platform.
                    </p>

                    <div className="mt-8 space-y-3">
                        {FEATURES.map(({ icon: Icon, label, desc }) => (
                            <div key={label} className="glass-feat flex items-center gap-3.5 rounded-xl px-4 py-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/30">
                                    <Icon className="h-4 w-4 text-blue-200" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">{label}</p>
                                    <p className="text-xs text-blue-300/70">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right panel — form ── */}
            <div className="flex w-full flex-col bg-gray-50 px-6 py-10 lg:w-[55%] dark:bg-gray-950">
                <div>
                    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>

                <div className="flex flex-1 items-center justify-center py-8">
                    <div className="w-full max-w-sm">

                        {/* Mobile logo */}
                        <div className="mb-8 flex flex-col items-center lg:hidden fade-1">
                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
                                <Flame className="h-7 w-7 text-white" />
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">LPG Distribution Cavite</p>
                        </div>

                        <div className="mb-8 fade-1">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign in to your account to continue</p>
                        </div>

                        {status && (
                            <div className="mb-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                                {status}
                            </div>
                        )}

                        {/* Lockout countdown banner */}
                        {isLocked && (
                            <div className="mb-6 rounded-xl bg-red-50 ring-1 ring-red-200 overflow-hidden">
                                <div className="px-4 py-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Lock className="h-4 w-4 text-red-600 shrink-0" />
                                        <p className="text-sm font-semibold text-red-700">Too many failed attempts</p>
                                    </div>
                                    <p className="text-sm text-red-600">
                                        Try again in{' '}
                                        <span className="font-bold tabular-nums">
                                            {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                                        </span>
                                    </p>
                                    <div className="mt-2 h-1.5 rounded-full bg-red-200 overflow-hidden">
                                        <div
                                            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                                            style={{ width: `${retryAfter > 0 ? (countdown / retryAfter) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Remaining attempts warning */}
                        {!isLocked && remainingAttempts !== null && remainingAttempts !== undefined && remainingAttempts <= 2 && (
                            <div className="mb-5 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-start gap-2.5">
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-sm text-amber-700">
                                    {remainingAttempts === 0
                                        ? 'Next failed attempt will temporarily lock your account for 3 minutes.'
                                        : `${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before your account is temporarily locked.`
                                    }
                                </p>
                            </div>
                        )}

                        {deactivationInfo && (
                            <div className="mb-6 rounded-xl bg-red-50 ring-1 ring-red-200 overflow-hidden">
                                <div className="flex items-start gap-3 px-4 py-3">
                                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-red-700">Account Deactivated</p>
                                        {deactivationInfo.reason && (
                                            <p className="mt-1 text-sm text-red-600">
                                                <span className="font-medium">Reason:</span> {deactivationInfo.reason}
                                            </p>
                                        )}
                                        {deactivationInfo.notes && (
                                            <p className="mt-0.5 text-sm text-red-600 italic">"{deactivationInfo.notes}"</p>
                                        )}
                                        <p className="mt-2 text-xs text-red-500">
                                            If you believe this is a mistake, please contact us at{' '}
                                            <a href="mailto:support@lpgcavite.com" className="font-medium underline hover:text-red-700">
                                                support@lpgcavite.com
                                            </a>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="fade-2 grid gap-2">
                                <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Email address
                                </Label>
                                <Input
                                    id="email" type="email" name="email" required autoFocus
                                    tabIndex={1} autoComplete="email" placeholder="you@example.com"
                                    className="h-11 transition-shadow focus:shadow-sm focus:shadow-blue-500/20"
                                    value={data.email}
                                    onChange={(e) => setData('email', e.target.value)}
                                    disabled={isLocked}
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="fade-3 grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Password
                                    </Label>
                                    {canResetPassword && (
                                        <Link href="/forgot-password" tabIndex={5}
                                            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                                            Forgot password?
                                        </Link>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password" name="password" required tabIndex={2}
                                    autoComplete="current-password" placeholder="••••••••"
                                    className="h-11 transition-shadow focus:shadow-sm focus:shadow-blue-500/20"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    disabled={isLocked}
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="fade-4 flex items-center gap-2">
                                <Checkbox id="remember" name="remember" tabIndex={3}
                                    checked={data.remember}
                                    onCheckedChange={(checked) => setData('remember', !!checked)}
                                    disabled={isLocked}
                                />
                                <Label htmlFor="remember" className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                                    Keep me signed in
                                </Label>
                            </div>

                            <div className="fade-5">
                                <Button type="submit" tabIndex={4} disabled={processing || isLocked}
                                    className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all">
                                    {processing && <Spinner />}
                                    Sign In
                                </Button>
                            </div>
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
                            Don&apos;t have an account?{' '}
                            <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                                Register here
                            </Link>
                        </p>

                        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600">
                            LPG Distribution Cavite &bull; Marketplace Platform
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
