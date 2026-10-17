import { Head, useForm } from '@inertiajs/react';
import { Clock, ExternalLink, FileText, Loader2, Plus, Upload, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import InputError from '@/components/input-error';
import PermitBadge from '@/components/permit-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type Permit = {
    type: string;
    label: string;
    expires: string | null;
    expires_on: string | null;
    days_left: number | null;
    status: 'valid' | 'expiring' | 'expired' | 'no_date' | 'no_expiry';
    file_url: string | null;
    has_expiry: boolean;
    pending: boolean;
    pending_expires: string | null;
    rejected_reason: string | null;
};

type Other = { id: number; label: string; status: 'pending' | 'approved' | 'rejected'; expires_on: string | null; reason: string | null; date: string; url: string };

type Props = { permits: Permit[]; others: Other[]; documents_suspended: boolean; max_other: number; max_date: string };

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Store Documents', href: '/seller/documents' }];

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export default function SellerDocuments({ permits, others, documents_suspended, max_other, max_date }: Props) {
    // One upload dialog for renewals and extra documents
    const [target, setTarget] = useState<{ doc_type: string; title: string; needsDate: boolean } | null>(null);
    const form = useForm<{ doc_type: string; label: string; file: File | null; expires_at: string }>({ doc_type: '', label: '', file: null, expires_at: '' });

    function open(doc_type: string, title: string, needsDate: boolean) {
        form.reset();
        form.clearErrors();
        form.setData({ doc_type, label: '', file: null, expires_at: '' });
        setTarget({ doc_type, title, needsDate });
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post('/seller/documents', { forceFormData: true, preserveScroll: true, onSuccess: () => setTarget(null) });
    }

    const approvedOthers = others.filter((o) => o.status === 'approved').length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Store Documents" />
            <div className="space-y-5 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Store Documents</h1>
                    <p className="text-sm text-muted-foreground">
                        Keep your permits up to date. You'll get reminders 30, 7 and 1 day before a permit expires. If a permit stays expired for 7 days,
                        your store is hidden from customers until the renewed permit is approved.
                    </p>
                    {documents_suspended && (
                        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                            Your store is hidden from customers because a permit expired. Upload the renewed document below.
                        </p>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {permits.map((p) => (
                        <Card key={p.type}>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-start gap-2 text-base"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> {p.label}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <PermitBadge p={p} />
                                    {p.file_url && (
                                        <a href={p.file_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                                            View file <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    )}
                                </div>
                                {p.pending && (
                                    <p className="flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                                        <Clock className="h-4 w-4" /> Waiting for admin review{p.pending_expires ? ` (valid until ${p.pending_expires})` : ''}
                                    </p>
                                )}
                                {!p.pending && p.rejected_reason && (
                                    <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Your last upload was rejected: {p.rejected_reason}
                                    </p>
                                )}
                                {!p.pending && (
                                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(p.type, p.label, p.has_expiry)}>
                                        <Upload className="h-3.5 w-3.5" /> {p.status === 'no_date' ? 'Add expiry date' : 'Upload renewed document'}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Other documents</CardTitle>
                        <p className="text-sm text-muted-foreground">Optional extra documents, e.g. DTI Registration. Up to {max_other} approved documents.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {others.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No extra documents yet.</p>
                        ) : (
                            <ul className="divide-y text-sm">
                                {others.map((o) => (
                                    <li key={o.id} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 py-2 min-[400px]:grid-cols-[minmax(0,1fr)_auto]">
                                        <span>
                                            <span className="font-medium">{o.label}</span>
                                            <span className="text-muted-foreground"> · uploaded {o.date}{o.expires_on ? ` · valid until ${o.expires_on}` : ''}</span>
                                            {o.status === 'rejected' && o.reason && <span className="block text-xs text-red-600">Rejected: {o.reason}</span>}
                                        </span>
                                        <span className="flex items-center justify-end gap-3 whitespace-nowrap">
                                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                                                o.status === 'approved' ? 'bg-green-100 text-green-800' : o.status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800')}>
                                                {o.status === 'pending' ? 'Waiting for review' : o.status === 'approved' ? 'Approved' : 'Rejected'}
                                            </span>
                                            <a href={o.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">View</a>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={approvedOthers >= max_other} onClick={() => open('other', 'Add a document', false)}>
                            <Plus className="h-3.5 w-3.5" /> Add a document
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{target?.title}</DialogTitle>
                        <DialogDescription>The platform admin reviews the file before it replaces the current one.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        {target?.doc_type === 'other' && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="doc_label">Document name</Label>
                                <Input id="doc_label" value={form.data.label} maxLength={100} placeholder="e.g. DTI Registration" onChange={(e) => form.setData('label', e.target.value)} />
                                <InputError message={form.errors.label} />
                            </div>
                        )}
                        <div className="grid gap-1.5">
                            <Label htmlFor="doc_file">File (JPG, PNG or PDF, up to 5 MB)</Label>
                            <Input id="doc_file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)} />
                            <InputError message={form.errors.file} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="doc_expires">Valid until{target?.needsDate ? '' : ' (optional)'}</Label>
                            <Input id="doc_expires" type="date" min={tomorrow()} max={max_date} value={form.data.expires_at} onChange={(e) => form.setData('expires_at', e.target.value)} />
                            <InputError message={form.errors.expires_at} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing || !form.data.file || (target?.needsDate && !form.data.expires_at) || (target?.doc_type === 'other' && !form.data.label.trim())} className="gap-1.5">
                                {form.processing && <Loader2 className="h-4 w-4 animate-spin" />} Submit
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
