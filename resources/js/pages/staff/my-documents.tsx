import { Head, useForm } from '@inertiajs/react';
import { ExternalLink, IdCard, Loader2, Plus, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type Doc = {
    id: number; doc_type: string; label: string; document_number: string | null; expires_on: string | null;
    status: 'pending' | 'approved' | 'rejected'; reason: string | null; date: string; url: string;
};
type LicenseStatus = 'valid' | 'expiring' | 'pending' | 'rejected' | 'expired' | 'missing';

type Props = {
    is_rider: boolean;
    has_store: boolean;
    post_url: string;
    license: { status: LicenseStatus; message: string; current: Doc | null } | null;
    documents: Doc[];
    types: { key: string; label: string }[];
};

const LICENSE_BADGE: Record<LicenseStatus, [string, string]> = {
    valid:    ['bg-green-100 text-green-800', 'Valid'],
    expiring: ['bg-amber-100 text-amber-800', 'Expiring soon'],
    pending:  ['bg-blue-100 text-blue-800', 'Waiting for approval'],
    rejected: ['bg-red-100 text-red-800', 'Rejected'],
    expired:  ['bg-red-100 text-red-800', 'Expired'],
    missing:  ['bg-gray-100 text-gray-700', 'Not uploaded'],
};

const STATUS_BADGE: Record<Doc['status'], [string, string]> = {
    pending:  ['bg-blue-100 text-blue-800', 'Waiting for approval'],
    approved: ['bg-green-100 text-green-800', 'Approved'],
    rejected: ['bg-red-100 text-red-800', 'Rejected'],
};

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

/** My Documents (riders and store staff). The store owner reviews uploads. */
export default function MyDocuments({ is_rider, has_store, post_url, license, documents, types }: Props) {
    const base = is_rider ? '/rider/documents' : '/seller/my-documents';
    const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Documents', href: base }];
    const [mode, setMode] = useState<'license' | 'other' | null>(null);
    const form = useForm<{ doc_type: string; label: string; document_number: string; file: File | null; expires_at: string }>({
        doc_type: '', label: '', document_number: '', file: null, expires_at: '',
    });

    function open(which: 'license' | 'other') {
        form.reset();
        form.clearErrors();
        form.setData({ doc_type: which === 'license' ? 'drivers_license' : (types[0]?.key ?? 'other'), label: '', document_number: '', file: null, expires_at: '' });
        setMode(which);
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(post_url, { forceFormData: true, preserveScroll: true, onSuccess: () => setMode(null) });
    }

    const others = documents.filter((d) => d.doc_type !== 'drivers_license');
    const licenseHistory = documents.filter((d) => d.doc_type === 'drivers_license');
    const isLicense = mode === 'license';
    const canSubmit = !!form.data.file && (!isLicense || (!!form.data.document_number.trim() && !!form.data.expires_at))
        && (form.data.doc_type !== 'other' || !!form.data.label.trim());

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Documents" />
            <div className="space-y-5 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">My Documents</h1>
                    <p className="text-sm text-muted-foreground">Your store owner reviews the documents you upload. Files are private.</p>
                </div>

                {!has_store && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Your account is not linked to a store. Ask your store owner.
                    </p>
                )}

                {is_rider && license && (
                    <Card className={cn('border-2', ['valid', 'expiring'].includes(license.status) ? 'border-green-300' : 'border-red-300')}>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                                <IdCard className="h-5 w-5 text-blue-600" /> Driver's License (required)
                                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', LICENSE_BADGE[license.status][0])}>{LICENSE_BADGE[license.status][1]}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p>{license.message}</p>
                            {license.current && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                                    {license.current.document_number && <span>License no. <span className="font-mono text-foreground">{license.current.document_number}</span></span>}
                                    {license.current.expires_on && <span>Valid until {license.current.expires_on}</span>}
                                    <a href={license.current.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                                        View file <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </div>
                            )}
                            {license.status !== 'pending' && (
                                <Button size="sm" className="gap-1.5" onClick={() => open('license')} disabled={!has_store}>
                                    <Upload className="h-3.5 w-3.5" /> {license.status === 'missing' ? 'Upload' : 'Upload renewed license'}
                                </Button>
                            )}
                            {licenseHistory.length > 1 && (
                                <ul className="divide-y border-t pt-1 text-xs text-muted-foreground">
                                    {licenseHistory.map((d) => (
                                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                            <span>Uploaded {d.date}{d.expires_on ? ` · valid until ${d.expires_on}` : ''}{d.reason ? ` · rejected: ${d.reason}` : ''}</span>
                                            <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_BADGE[d.status][0])}>{STATUS_BADGE[d.status][1]}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Other documents (optional)</CardTitle>
                        <p className="text-sm text-muted-foreground">For example a police or NBI clearance, or an LPG safety training certificate.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {others.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No documents yet.</p>
                        ) : (
                            <ul className="divide-y text-sm">
                                {others.map((d) => (
                                    <li key={d.id} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 py-2 min-[400px]:grid-cols-[minmax(0,1fr)_auto]">
                                        <span>
                                            <span className="font-medium">{d.label}</span>
                                            <span className="text-muted-foreground"> · uploaded {d.date}{d.expires_on ? ` · valid until ${d.expires_on}` : ''}</span>
                                            {d.status === 'rejected' && d.reason && <span className="block text-xs text-red-600">Rejected: {d.reason}</span>}
                                        </span>
                                        <span className="flex items-center justify-end gap-3 whitespace-nowrap">
                                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_BADGE[d.status][0])}>{STATUS_BADGE[d.status][1]}</span>
                                            <a href={d.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">View</a>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('other')} disabled={!has_store}>
                            <Plus className="h-3.5 w-3.5" /> Add a document
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isLicense ? "Upload driver's license" : 'Add a document'}</DialogTitle>
                        <DialogDescription>Your store owner will review it.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        {!isLicense && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="sd_type">Document</Label>
                                <select id="sd_type" value={form.data.doc_type} onChange={(e) => form.setData('doc_type', e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                                    {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                </select>
                                <InputError message={form.errors.doc_type} />
                            </div>
                        )}
                        {form.data.doc_type === 'other' && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="sd_label">Document name</Label>
                                <Input id="sd_label" value={form.data.label} maxLength={100} onChange={(e) => form.setData('label', e.target.value)} />
                                <InputError message={form.errors.label} />
                            </div>
                        )}
                        {isLicense && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="sd_number">License number</Label>
                                <Input id="sd_number" value={form.data.document_number} maxLength={50} onChange={(e) => form.setData('document_number', e.target.value)} />
                                <InputError message={form.errors.document_number} />
                            </div>
                        )}
                        <div className="grid gap-1.5">
                            <Label htmlFor="sd_file">File (JPG, PNG or PDF, up to 5 MB)</Label>
                            <Input id="sd_file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)} />
                            <InputError message={form.errors.file} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="sd_expires">Valid until{isLicense ? '' : ' (optional)'}</Label>
                            <Input id="sd_expires" type="date" min={tomorrow()} value={form.data.expires_at} onChange={(e) => form.setData('expires_at', e.target.value)} />
                            <InputError message={form.errors.expires_at} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setMode(null)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing || !canSubmit} className="gap-1.5">
                                {form.processing && <Loader2 className="h-4 w-4 animate-spin" />} Submit
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
