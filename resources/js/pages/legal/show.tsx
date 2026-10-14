import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Flame } from 'lucide-react';

type Props = {
    type: string;
    label: string;
    document: { title: string; version: number; effective_date: string; html: string; is_current: boolean } | null;
    current_version: number | null;
    links: { type: string; label: string; url: string }[];
};

/** Public Terms / Policy page — readable without an account. */
export default function LegalShow({ type, label, document: doc, current_version, links }: Props) {
    const here = links.find((l) => l.type === type)?.url ?? '/';

    function goBack(e: React.MouseEvent) {
        e.preventDefault();
        if (window.history.length > 1) window.history.back();
        else window.location.href = '/';
    }

    return (
        <>
            <Head title={`${doc?.title ?? label} — LPG Marketplace Cavite`} />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
                <header className="border-b bg-white dark:border-gray-800 dark:bg-gray-900">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
                        <Link href="/" className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                                <Flame className="h-4 w-4 text-white" />
                            </span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">LPG Marketplace Cavite</span>
                        </Link>
                        <a href="/" onClick={goBack} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </a>
                    </div>
                </header>

                <main className="mx-auto max-w-3xl px-4 py-8">
                    <div className="rounded-xl border bg-white p-5 shadow-sm sm:p-8 dark:border-gray-800 dark:bg-gray-900">
                        {doc ? (
                            <>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{doc.title}</h1>
                                <p className="mt-1 text-sm text-gray-500">Version {doc.version} · Effective {doc.effective_date}</p>
                                {!doc.is_current && current_version !== null && (
                                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                        You are viewing an older version.{' '}
                                        <Link href={here} className="font-semibold underline">See the current version ({current_version})</Link>
                                    </p>
                                )}
                                <div className="legal-content mt-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
                            </>
                        ) : (
                            <>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{label}</h1>
                                <p className="mt-4 text-gray-600 dark:text-gray-400">This document is not available yet.</p>
                            </>
                        )}
                    </div>

                    <nav className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-500">
                        {links.filter((l) => l.type !== type).map((l) => (
                            <Link key={l.type} href={l.url} className="hover:text-gray-900 hover:underline dark:hover:text-white">{l.label}</Link>
                        ))}
                    </nav>
                </main>
            </div>
        </>
    );
}
