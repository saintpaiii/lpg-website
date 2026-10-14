import { Head, Link, router, useForm } from '@inertiajs/react';
import axios from 'axios';
import { ArrowLeft, Eye, Loader2, Pencil, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import InputError from '@/components/input-error';
import LegalSectionEditor, { withKeys, withoutKeys, type EditorDraft } from '@/components/legal-section-editor';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { buildLegal, parseLegal } from '@/lib/legal-sections';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type Version = {
    id: number; version: number; published_date: string; published_by: string;
    is_major: boolean; change_summary: string | null; accepted_count: number; is_current: boolean;
};

type Props = {
    type: string;
    label: string;
    public_url: string;
    has_draft: boolean;
    next_version: number;
    audience: string;
    form: { title: string; body: string; change_summary: string; is_major: boolean };
    draft_saved_at: string | null;
    versions: Version[];
};

export default function LegalEdit({ type, label, public_url, has_draft, next_version, audience, form: initial, draft_saved_at, versions }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Terms & Policies', href: '/admin/legal' },
        { title: label, href: `/admin/legal/${type}` },
    ];
    const { data, setData: setFormData, post, transform, processing, errors } = useForm(initial);
    // The document is edited as plain sections; it is stored as Markdown (built only when sending)
    const [draft, setDraftState] = useState<EditorDraft>(() => withKeys(parseLegal(initial.body)));
    const [dirty, setDirty] = useState(false);
    const leavingOnPurpose = useRef(false);   // our own Save / Publish / Discard visits never ask "leave?"

    const setDraft = (next: EditorDraft) => { setDraftState(next); setDirty(true); };
    const setData = (key: 'title' | 'change_summary' | 'is_major', value: string | boolean) => { setFormData(key, value as never); setDirty(true); };
    const bodyMarkdown = () => buildLegal(withoutKeys(draft));

    // Warn before leaving with unsaved changes (closing the tab, or any other link in the app)
    useEffect(() => {
        if (!dirty) return;
        const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onUnload);
        const off = router.on('before', (event) => {
            if (leavingOnPurpose.current) return;
            if (event.detail.visit.method !== 'get') return;
            if (!window.confirm('You have unsaved changes. Leave this page without saving?')) event.preventDefault();
        });
        return () => { window.removeEventListener('beforeunload', onUnload); off(); };
    }, [dirty]);
    const [mode, setMode] = useState<'edit' | 'preview'>('edit');
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [confirmPublish, setConfirmPublish] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    async function showPreview() {
        setMode('preview');
        setPreviewing(true);
        setPreviewError(null);
        try {
            const res = await axios.post<{ html: string }>('/admin/legal/preview', { body: bodyMarkdown() });
            setPreviewHtml(res.data.html);
        } catch {
            setPreviewError('Could not show the preview. Check that the text is not empty and try again.');
        } finally {
            setPreviewing(false);
        }
    }

    const send = (url: string, options: Parameters<typeof post>[1]) => {
        transform((d) => ({ ...d, body: bodyMarkdown() }));
        leavingOnPurpose.current = true;
        post(url, { ...options, onSuccess: () => setDirty(false), onFinish: (visit) => { leavingOnPurpose.current = false; options?.onFinish?.(visit); } });
    };
    const saveDraft = () => send(`/admin/legal/${type}/draft`, { preserveScroll: true });
    // After publishing, start fresh from the new current version (keep the form only when validation fails)
    const publish = () => send(`/admin/legal/${type}/publish`, { preserveScroll: true, preserveState: 'errors', onFinish: () => setConfirmPublish(false) });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit ${label}`} />
            <div className="space-y-4 p-3 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <Link href="/admin/legal" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" /> Terms & Policies
                        </Link>
                        <h1 className="text-xl font-bold tracking-tight">{label}</h1>
                        <p className="text-sm text-muted-foreground">
                            {has_draft ? `Draft saved ${draft_saved_at}. ` : 'No draft yet — starting from the current published text. '}
                            Publishing creates version {next_version}; published versions never change.
                        </p>
                    </div>
                    <a href={public_url} target="_blank" rel="noopener"><Button variant="outline" size="sm">View public page</Button></a>
                </div>

                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="title">Title</Label>
                                <Input id="title" value={data.title} maxLength={255} onChange={(e) => setData('title', e.target.value)} />
                                <InputError message={errors.title} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="change_summary">What changed?</Label>
                                <Input id="change_summary" value={data.change_summary} maxLength={500}
                                    placeholder="Shown to users in the update popup"
                                    onChange={(e) => setData('change_summary', e.target.value)} />
                                <InputError message={errors.change_summary} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Edit or preview">
                                    <button type="button" role="radio" aria-checked={mode === 'edit'} onClick={() => setMode('edit')}
                                        className={cn('flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium', mode === 'edit' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </button>
                                    <button type="button" role="radio" aria-checked={mode === 'preview'} onClick={showPreview}
                                        className={cn('flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium', mode === 'preview' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                                        <Eye className="h-3.5 w-3.5" /> Preview
                                    </button>
                                </div>
                                {dirty && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Unsaved changes</p>}
                            </div>
                            {mode === 'edit' ? (
                                <LegalSectionEditor value={draft} onChange={setDraft} />
                            ) : (
                                <div className="min-h-[24rem] rounded-md border bg-white p-5 dark:bg-gray-950">
                                    {previewing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading preview…</p>}
                                    {!previewing && previewError && <p className="text-sm text-red-600">{previewError}</p>}
                                    {!previewing && !previewError && previewHtml !== null && (
                                        <>
                                            <h2 className="mb-4 text-2xl font-bold">{data.title}</h2>
                                            <div className="legal-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                                        </>
                                    )}
                                </div>
                            )}
                            <InputError message={errors.body} />
                        </div>

                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <Checkbox checked={data.is_major} onCheckedChange={(c) => setData('is_major', c === true)} className="mt-0.5" />
                            <span>
                                Major change — users must accept again
                                <span className="block text-xs text-muted-foreground">Leave unticked for typos and wording fixes.</span>
                            </span>
                        </label>
                        <InputError message={(errors as Record<string, string>).is_major} />

                        <div className="flex flex-wrap gap-2 border-t pt-4">
                            <Button type="button" variant="outline" onClick={saveDraft} disabled={processing} className="gap-1.5">
                                <Save className="h-4 w-4" /> Save draft
                            </Button>
                            <Button type="button" onClick={() => setConfirmPublish(true)} disabled={processing || !has_draft} className="gap-1.5"
                                title={has_draft ? undefined : 'Save a draft first'}>
                                <Send className="h-4 w-4" /> Publish
                            </Button>
                            {has_draft && (
                                <Button type="button" variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={processing} className="gap-1.5 text-red-600 hover:text-red-700">
                                    <Trash2 className="h-4 w-4" /> Discard draft
                                </Button>
                            )}
                            {!has_draft && <span className="self-center text-xs text-muted-foreground">Save a draft first, then publish it.</span>}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
                    <CardContent>
                        {versions.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">Nothing published yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 pr-3 font-medium">Version</th>
                                            <th className="pb-2 pr-3 font-medium">Published</th>
                                            <th className="pb-2 pr-3 font-medium">By</th>
                                            <th className="pb-2 pr-3 font-medium">Type</th>
                                            <th className="pb-2 pr-3 font-medium">What changed</th>
                                            <th className="pb-2 pr-3 text-right font-medium">Accepted</th>
                                            <th className="pb-2" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {versions.map((v) => (
                                            <tr key={v.id}>
                                                <td className="py-2 pr-3 font-medium">
                                                    {v.version}
                                                    {v.is_current && <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">Current</span>}
                                                </td>
                                                <td className="py-2 pr-3 whitespace-nowrap">{v.published_date}</td>
                                                <td className="py-2 pr-3">{v.published_by}</td>
                                                <td className="py-2 pr-3">{v.is_major ? 'Major' : 'Minor'}</td>
                                                <td className="py-2 pr-3 text-muted-foreground">{v.change_summary ?? '—'}</td>
                                                <td className="py-2 pr-3 text-right tabular-nums">{v.accepted_count}</td>
                                                <td className="py-2 text-right">
                                                    <Link href={`/admin/legal/${type}/versions/${v.id}`} className="text-blue-600 hover:underline">View</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Publish version {next_version}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {data.is_major
                                ? `${audience} will be asked to accept it the next time they open the app.`
                                : 'No one will be asked to accept again.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); publish(); }} disabled={processing}>
                            {processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Publish
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
                        <AlertDialogDescription>Your unpublished changes will be lost. Published versions are not affected.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => {
                                leavingOnPurpose.current = true;
                                router.delete(`/admin/legal/${type}/draft`, { preserveState: false, onFinish: () => { leavingOnPurpose.current = false; setConfirmDiscard(false); } });
                            }}>
                            Discard draft
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
