import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Props = {
    type: string;
    label: string;
    document: {
        title: string; version: number; published_date: string; published_by: string;
        is_major: boolean; change_summary: string | null; html: string;
    };
};

/** Read-only view of one published version. */
export default function LegalVersion({ type, label, document: doc }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Terms & Policies', href: '/admin/legal' },
        { title: label, href: `/admin/legal/${type}` },
        { title: `Version ${doc.version}`, href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${label} — version ${doc.version}`} />
            <div className="space-y-4 p-3 sm:p-6">
                <Link href={`/admin/legal/${type}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Back to {label}
                </Link>
                <div className="rounded-xl border bg-white p-5 sm:p-8 dark:bg-gray-950">
                    <h1 className="text-2xl font-bold">{doc.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Version {doc.version} · Published {doc.published_date} by {doc.published_by} · {doc.is_major ? 'Major change' : 'Minor change'}
                    </p>
                    {doc.change_summary && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">What changed: {doc.change_summary}</p>}
                    <div className="legal-content mt-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
                </div>
            </div>
        </AppLayout>
    );
}
