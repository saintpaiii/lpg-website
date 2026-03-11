import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Flame } from 'lucide-react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { FormEvent } from 'react';

type Props = {
    status?: string;
    canResetPassword: boolean;
};

export default function Login({ status, canResetPassword }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false as boolean,
    });

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        post('/login');
    }

    return (
        <div className="flex min-h-screen">
            <Head title="Sign In — LPG Management System" />

            {/* Left panel — branding */}
            <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 px-12 text-white">
                <div className="max-w-md text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                            <Flame className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight">
                        LPG Distribution<br />Management System
                    </h1>
                    <p className="text-blue-100 text-base leading-relaxed">
                        Integrated platform for managing LPG orders, deliveries,
                        inventory, and customer accounts in Cavite.
                    </p>

                    <div className="mt-12 grid grid-cols-3 gap-4 text-center">
                        <div className="rounded-xl bg-white/10 px-4 py-5 backdrop-blur-sm ring-1 ring-white/20">
                            <p className="text-xl font-bold">Orders</p>
                            <p className="mt-1 text-xs text-blue-100">Track &amp; manage</p>
                        </div>
                        <div className="rounded-xl bg-white/10 px-4 py-5 backdrop-blur-sm ring-1 ring-white/20">
                            <p className="text-xl font-bold">Delivery</p>
                            <p className="mt-1 text-xs text-blue-100">Real-time status</p>
                        </div>
                        <div className="rounded-xl bg-white/10 px-4 py-5 backdrop-blur-sm ring-1 ring-white/20">
                            <p className="text-xl font-bold">DSS</p>
                            <p className="mt-1 text-xs text-blue-100">Smart insights</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right panel — login form */}
            <div className="flex w-full flex-col bg-gray-50 px-6 py-10 lg:w-1/2 dark:bg-gray-950">

                {/* Back to Home */}
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
                    <div className="w-full max-w-sm">

                        {/* Mobile logo */}
                        <div className="mb-8 flex flex-col items-center lg:hidden">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
                                <Flame className="h-7 w-7 text-white" />
                            </div>
                            <h1 className="text-center text-xl font-bold text-gray-900 dark:text-white">
                                LPG Distribution Management System
                            </h1>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Welcome back
                            </h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Sign in to your account to continue
                            </p>
                        </div>

                        {status && (
                            <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950 dark:text-green-300">
                                {status}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="grid gap-2">
                                <Label
                                    htmlFor="email"
                                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Email address
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    className="h-11"
                                    value={data.email}
                                    onChange={(e) => setData('email', e.target.value)}
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label
                                        htmlFor="password"
                                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Password
                                    </Label>
                                    {canResetPassword && (
                                        <Link
                                            href="/forgot-password"
                                            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                            tabIndex={5}
                                        >
                                            Forgot password?
                                        </Link>
                                    )}
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="h-11"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    tabIndex={3}
                                    checked={data.remember}
                                    onCheckedChange={(checked) => setData('remember', !!checked)}
                                />
                                <Label
                                    htmlFor="remember"
                                    className="cursor-pointer text-sm text-gray-600 dark:text-gray-400"
                                >
                                    Keep me signed in
                                </Label>
                            </div>

                            <Button
                                type="submit"
                                tabIndex={4}
                                disabled={processing}
                                className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700"
                            >
                                {processing && <Spinner />}
                                Sign in
                            </Button>
                        </form>

                        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            Don&apos;t have an account?{' '}
                            <Link
                                href="/register"
                                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                                Register here
                            </Link>
                        </p>

                        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-600">
                            LPG Distribution Management System &bull; Cavite
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
