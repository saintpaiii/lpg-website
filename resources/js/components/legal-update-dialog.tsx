import { router, usePage } from '@inertiajs/react';
import { ExternalLink, Loader2, ScrollText } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { SharedData } from '@/types';

/**
 * Blocks the app until the user accepts the current Terms / Privacy Policy
 * (after a major update, or for accounts that never agreed — e.g. Google sign-ups).
 * Disappears by itself once the server reports nothing pending.
 */
export default function LegalUpdateDialog() {
    const pending = usePage<SharedData>().props.pendingLegal;
    const [agreed, setAgreed] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!pending || pending.documents.length === 0) return null;

    function accept() {
        if (!pending) return;
        setSaving(true);
        router.post('/legal/accept', { document_ids: pending.documents.map((d) => d.id) }, {
            preserveScroll: true,
            onFinish: () => { setSaving(false); setAgreed(false); },
        });
    }

    return (
        <AlertDialog open onOpenChange={() => { /* cannot be dismissed */ }}>
            <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <ScrollText className="h-5 w-5 text-blue-600" />
                        {pending.has_any_acceptance ? 'We updated our policies' : 'Please review our policies'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {pending.has_any_acceptance
                            ? 'Please read the changes below and accept them to keep using the app.'
                            : 'Please read and accept the documents below to keep using the app.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <ul className="space-y-3">
                    {pending.documents.map((d) => (
                        <li key={d.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                    {d.label} <span className="font-normal text-muted-foreground">· Version {d.version}</span>
                                </p>
                                <a href={d.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                                    Read it <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>
                            {d.change_summary && (
                                <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{d.change_summary}</p>
                            )}
                        </li>
                    ))}
                </ul>

                <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} className="mt-0.5" />
                    I have read and agree to the documents above
                </label>

                <AlertDialogFooter>
                    <Button variant="outline" onClick={() => router.post('/logout')} disabled={saving}>Log out</Button>
                    <Button onClick={accept} disabled={!agreed || saving} className="gap-1.5">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Accept and continue
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
