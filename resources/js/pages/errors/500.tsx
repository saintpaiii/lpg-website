import { Link, usePage } from '@inertiajs/react';
import { Flame, Home, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SharedData } from '@/types';
import { homeUrl } from './404';

/** Production error page for 500 / 503 (local debug shows Laravel's real error instead — see bootstrap/app.php). */
export default function ServerError({ status = 500 }: { status?: number }) {
    const { auth } = usePage<SharedData>().props;
    const href = auth?.user
        ? (auth.home_url ?? homeUrl(auth.user.role, auth.user.sub_role, auth.permissions ?? []))
        : '/';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
                <Flame className="h-8 w-8 text-white" />
            </div>

            <div className="flex items-center gap-3 mb-6">
                <ServerCrash className="h-10 w-10 text-gray-300" />
                <span className="text-7xl font-black text-gray-200 dark:text-gray-700">{status}</span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Something went wrong
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-8">
                {status === 503
                    ? 'The site is busy or under maintenance — please try again in a few minutes.'
                    : 'Please try again. If it keeps happening, report it.'}
            </p>

            <div className="flex items-center gap-3">
                <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href={href}>
                        <Home className="mr-1.5 h-4 w-4" />
                        Go Home
                    </Link>
                </Button>
                <Button variant="outline" onClick={() => history.back()}>
                    Go Back
                </Button>
            </div>

            <p className="mt-12 text-xs text-gray-400 dark:text-gray-600">
                LPG Distribution Management System &bull; Cavite
            </p>
        </div>
    );
}
