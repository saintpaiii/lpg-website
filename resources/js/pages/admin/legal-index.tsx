import { Head, Link } from '@inertiajs/react';
import { ExternalLink, Pencil, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Doc = {
    type: string;
    label: string;
    public_url: string;
    version: number | null;
    effective_date: string | null;
    accepted_count: number;
    has_draft: boolean;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Terms & Policies', href: '/admin/legal' }];

export default function LegalIndex({ documents }: { documents: Doc[] }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Terms & Policies" />
            <div className="space-y-4 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Terms & Policies</h1>
                    <p className="text-sm text-muted-foreground">
                        Edit and publish the documents customers and sellers agree to. Each publish creates a new version; old versions are kept.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {documents.map((d) => (
                        <Card key={d.type} className="flex flex-col">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-start justify-between gap-2 text-base">
                                    <span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-blue-600" /> {d.label}</span>
                                    {d.has_draft && (
                                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                            Draft in progress
                                        </span>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col justify-between gap-4">
                                <div className="space-y-1 text-sm">
                                    {d.version !== null ? (
                                        <>
                                            <p>Version {d.version} · Effective {d.effective_date}</p>
                                            <p className="text-muted-foreground">Accepted by {d.accepted_count} {d.accepted_count === 1 ? 'user' : 'users'}</p>
                                        </>
                                    ) : (
                                        <p className="text-muted-foreground">Not published</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Link href={`/admin/legal/${d.type}`}>
                                        <Button size="sm" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                                    </Link>
                                    <a href={d.public_url} target="_blank" rel="noopener">
                                        <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> View public page</Button>
                                    </a>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
