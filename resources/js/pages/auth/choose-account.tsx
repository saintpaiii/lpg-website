import { Head, router } from '@inertiajs/react';
import { Flame, ShoppingCart, Store } from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';

/**
 * After a NEW "Continue with Google" sign-up: the same two choices as /register.
 * Buy → ID verification. Sell only → the store application on this account (/seller/register, signed-in mode).
 */
export default function ChooseAccount({ name, email }: { name: string; email: string }) {
    const [busy, setBusy] = useState<'customer' | 'seller' | null>(null);

    const choose = (type: 'customer' | 'seller') => {
        setBusy(type);
        router.post('/choose-account', { type }, { onFinish: () => setBusy(null) });
    };

    const card = 'w-full rounded-xl border-2 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 dark:bg-gray-900 dark:hover:bg-gray-800';

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
            <Head title="Choose your account" />
            <div className="w-full max-w-lg">
                <div className="mb-6 flex flex-col items-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                        <Flame className="h-6 w-6 text-white" />
                    </div>
                    <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-white">Welcome, {name}!</h1>
                    <p className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                        Signed in with Google as <strong className="break-all">{email}</strong>. How will you use your account?
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Choose an account type">
                    <button type="button" className={`${card} border-gray-200 dark:border-gray-700`} disabled={busy !== null} onClick={() => choose('customer')}>
                        <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            {busy === 'customer' ? <Spinner /> : <ShoppingCart className="h-5 w-5 text-blue-600" />} I want to buy LPG
                        </span>
                        <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">
                            Order from stores near you. You can still open your own store later with <strong>Start Selling</strong>.
                        </span>
                    </button>
                    <button type="button" className={`${card} border-gray-200 dark:border-gray-700`} disabled={busy !== null} onClick={() => choose('seller')}>
                        <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            {busy === 'seller' ? <Spinner /> : <Store className="h-5 w-5 text-emerald-600" />} I only want to sell LPG
                            <span className="text-xs font-normal text-muted-foreground">(store owner)</span>
                        </span>
                        <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">
                            Seller-only accounts can't place orders. If you also want to buy, register as a customer and use Start Selling later.
                        </span>
                    </button>
                </div>

                <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
                    Not you?{' '}
                    <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => router.post('/logout')}>Log out</button>
                </p>
            </div>
        </div>
    );
}
