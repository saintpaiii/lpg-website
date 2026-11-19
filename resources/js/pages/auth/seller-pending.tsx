import { Head, Link, router, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Flame, Mail, Phone } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { SharedData } from '@/types';
import SellerResubmitCard, { type SentBack } from '@/components/seller-resubmit-card';

/** Re-check the application while it's under review (the server redirects to the dashboard once approved) */
const POLL_MS = 30_000;

export default function SellerPending({ sent_back = null, status = null, suspension = null }: {
    sent_back?: SentBack | null;
    /** The signed-in user's store: pending | rejected | suspended | null (guest) */
    status?: string | null;
    suspension?: { reason: string | null; notes: string | null } | null;
}) {
    const { flash, auth, contact_email } = usePage<SharedData & { contact_email?: string }>().props;
    const suspensionInfo = flash?.store_suspension_info ?? suspension;
    const user = auth?.user ?? null;

    // Under review: every 30 s ask again (only while the tab is visible). Approved → the server sends us to the dashboard.
    useEffect(() => {
        if (!user || status !== 'pending') return;
        let timer: ReturnType<typeof setInterval> | null = null;
        const check = () => router.reload({ only: ['status'] });
        const start = () => { if (!timer) timer = setInterval(check, POLL_MS); };
        const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
        const onVisibility = () => {
            if (document.hidden) stop();
            else { check(); start(); }
        };
        if (!document.hidden) start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [user, status]);
    const STEPS = [
        {
            icon: FileText,
            title: 'Application Submitted',
            desc: 'Your seller application and documents have been received.',
            done: true,
        },
        {
            icon: Clock,
            title: 'Under Review (1–3 business days)',
            desc: 'Our team is reviewing your documents (ID, BIR, business permit, FSIC, DOE license, DTI/SEC).',
            done: false,
        },
        {
            icon: CheckCircle2,
            title: 'Approval & Account Activation',
            desc: 'Once approved, you\'ll receive an email and can log in to your seller dashboard.',
            done: false,
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 flex items-center justify-center px-4 py-16">
            <Head title="Application Submitted — LPG Marketplace" />

            <div className={`w-full ${sent_back ? "max-w-xl" : "max-w-md"}`}>
                {/* Card */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8">
                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="relative">
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600">
                                <Flame className="h-10 w-10 text-white" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900">
                                <CheckCircle2 className="h-4 w-4 text-white" />
                            </div>
                        </div>
                    </div>

                    <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {suspensionInfo ? 'Store Suspended' : sent_back ? 'Application Sent Back' : 'Application Under Review'}
                    </h1>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">
                        {status === 'pending' && user && <span className="mb-1 block text-xs text-muted-foreground">This page updates by itself when your store is approved.</span>}
                        {suspensionInfo
                            ? 'Your store has been temporarily suspended by the platform administrator.'
                            : "Thank you for applying to the LPG Marketplace Cavite. Here's what happens next:"}
                    </p>

                    {flash?.success && (
                        <div className="mb-6 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-900 dark:text-green-300">{flash.success}</div>
                    )}
                    {/* Sent back by the admin: each rejected document + re-upload just those (J3) */}
                    {sent_back && <SellerResubmitCard sentBack={sent_back} />}

                    {/* Not blocking: same store name elsewhere / another store pinned within 50 m */}
                    {flash?.warning && (
                        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <p>{flash.warning}</p>
                        </div>
                    )}
                    {suspensionInfo && (
                        <div className="mb-6 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Your store is suspended</p>
                                    {suspensionInfo.reason && (
                                        <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                                            <span className="font-medium">Reason:</span> {suspensionInfo.reason}
                                        </p>
                                    )}
                                    {suspensionInfo.notes && (
                                        <p className="mt-0.5 text-sm text-orange-700 dark:text-orange-300 italic">"{suspensionInfo.notes}"</p>
                                    )}
                                    {contact_email && (
                                        <p className="mt-2 text-xs text-orange-600">
                                            Contact us at{' '}
                                            <a href={`mailto:${contact_email}`} className="font-medium underline">{contact_email}</a>{' '}
                                            to resolve this issue.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Progress steps */}
                    <div className="space-y-4 mb-8">
                        {STEPS.map(({ icon: Icon, title, desc, done }, idx) => (
                            <div key={idx} className="flex gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${
                                    done
                                        ? 'bg-green-100 dark:bg-green-900/30'
                                        : 'bg-gray-100 dark:bg-gray-800'
                                }`}>
                                    <Icon className={`h-4.5 w-4.5 ${done ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                                </div>
                                <div>
                                    <p className={`text-sm font-semibold ${done ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {title}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                        {desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Info box */}
                    <div className="rounded-xl bg-blue-50 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900 p-4 mb-6">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                            While you wait:
                        </p>
                        <ul className="space-y-1.5 text-sm text-blue-700 dark:text-blue-400">
                            {user && (
                                <li className="flex items-start gap-2">
                                    <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                                    {user.email_verified_at ? (
                                        <span className="inline-flex items-center gap-1">Email verified <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="verified" /></span>
                                    ) : (
                                        <span className="flex flex-wrap items-center gap-2">
                                            Your email isn't verified yet — the store can't be approved before it is.
                                            <Link href="/verify-otp" className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">Verify your email</Link>
                                        </span>
                                    )}
                                </li>
                            )}
                            <li className="flex items-start gap-2">
                                <Phone className="h-4 w-4 mt-0.5 shrink-0" />
                                You'll get an email / notification when your application is approved or if we need more information.
                            </li>
                        </ul>
                    </div>

                    <div className="flex flex-col gap-2">
                        {user ? (
                            <>
                                {/* Applied through Start Selling: keep shopping while the store is reviewed */}
                                {user.can_shop !== false && (
                                    <Link href="/customer/products">
                                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">Continue shopping</Button>
                                    </Link>
                                )}
                                <Button variant={user.can_shop !== false ? 'outline' : 'default'} onClick={() => router.post('/logout')}
                                    className={user.can_shop !== false ? 'w-full' : 'w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold'}>
                                    Log out
                                </Button>
                            </>
                        ) : (
                            <Link href="/login">
                                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                                    Back to login
                                </Button>
                            </Link>
                        )}
                        <Link href="/">
                            <Button variant="outline" className="w-full">
                                Back to Home
                            </Button>
                        </Link>
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-blue-200">
                    LPG Marketplace Cavite &bull; Seller Verification
                </p>
            </div>
        </div>
    );
}
