import { Head, Link, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Flame, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SharedData } from '@/types';

export default function SellerPending() {
    const { flash } = usePage<SharedData>().props;
    const suspensionInfo = flash?.store_suspension_info;
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
            desc: 'Our team is reviewing your BIR permit, business permit, and valid ID.',
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

            <div className="w-full max-w-md">
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
                        {suspensionInfo ? 'Store Suspended' : 'Application Under Review'}
                    </h1>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">
                        {suspensionInfo
                            ? 'Your store has been temporarily suspended by the platform administrator.'
                            : "Thank you for applying to the LPG Marketplace Cavite. Here's what happens next:"}
                    </p>

                    {suspensionInfo && (
                        <div className="mb-6 rounded-xl bg-orange-50 border border-orange-200 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-orange-800">Your store is suspended</p>
                                    {suspensionInfo.reason && (
                                        <p className="mt-1 text-sm text-orange-700">
                                            <span className="font-medium">Reason:</span> {suspensionInfo.reason}
                                        </p>
                                    )}
                                    {suspensionInfo.notes && (
                                        <p className="mt-0.5 text-sm text-orange-700 italic">"{suspensionInfo.notes}"</p>
                                    )}
                                    <p className="mt-2 text-xs text-orange-600">
                                        Contact us at{' '}
                                        <a href="mailto:support@lpgcavite.com" className="font-medium underline">
                                            support@lpgcavite.com
                                        </a>{' '}
                                        to resolve this issue.
                                    </p>
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
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 leading-relaxed">
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
                            <li className="flex items-start gap-2">
                                <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                                Check your email — we sent a verification link. Please verify your email address.
                            </li>
                            <li className="flex items-start gap-2">
                                <Phone className="h-4 w-4 mt-0.5 shrink-0" />
                                You'll receive an email notification once your application is approved or if we need more information.
                            </li>
                        </ul>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Link href="/login">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                                Go to Login
                            </Button>
                        </Link>
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
