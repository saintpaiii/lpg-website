import { Head, router, useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import type { FormEvent } from 'react';

export default function VerifyEmail({ status }: { status?: string }) {
    const { post, processing } = useForm({});

    function handleResend(e: FormEvent) {
        e.preventDefault();
        post('/email/verification-notification');
    }

    function handleLogout(e: FormEvent) {
        e.preventDefault();
        router.post('/logout');
    }

    return (
        <AuthLayout
            title="Verify email"
            description="Please verify your email address by clicking on the link we just emailed to you."
        >
            <Head title="Email verification" />

            {status === 'verification-link-sent' && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    A new verification link has been sent to the email address
                    you provided during registration.
                </div>
            )}

            <div className="space-y-6 text-center">
                <form onSubmit={handleResend}>
                    <Button disabled={processing} variant="secondary">
                        {processing && <Spinner />}
                        Resend verification email
                    </Button>
                </form>

                <form onSubmit={handleLogout}>
                    <button
                        type="submit"
                        className="mx-auto block text-sm underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-current dark:decoration-neutral-500"
                    >
                        Log out
                    </button>
                </form>
            </div>
        </AuthLayout>
    );
}
