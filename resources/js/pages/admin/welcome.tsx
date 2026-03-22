import { Head, usePage } from '@inertiajs/react';
import { ShieldOff } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Welcome', href: '/admin/welcome' },
];

export default function PlatformStaffWelcome() {
    const { auth } = usePage<SharedData>().props;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Welcome" />

            <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh] px-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mb-6">
                    <ShieldOff className="h-8 w-8 text-gray-400" />
                </div>

                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Welcome, {auth.user.name}!
                </h1>

                <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-1">
                    Your administrator has not assigned any permissions to your account yet.
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm">
                    Please contact your administrator to get access to the platform.
                </p>
            </div>
        </AppLayout>
    );
}
