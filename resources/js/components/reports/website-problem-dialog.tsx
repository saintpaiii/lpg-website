import { useForm, usePage } from '@inertiajs/react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';
import type { SystemCategory } from './types';

const SUBMIT: Record<'customer' | 'store' | 'rider', string> = {
    customer: '/customer/reports/website-problem',
    store: '/seller/website-reports',
    rider: '/rider/reports/website-problem',
};

type FormData = { category: string; system_area: string; subject: string; description: string; page_url: string; screenshots: File[] };

/** "Report a website problem" — goes to the platform admin only. */
export default function WebsiteProblemDialog({ open, onOpenChange, portal }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    portal: 'customer' | 'store' | 'rider';
}) {
    const props = usePage<SharedData>().props;
    const categories = (props.systemReportCategories ?? {}) as Record<string, SystemCategory>;
    const areas = ((props.systemReportAreas ?? {}) as Record<string, string[]>)[portal] ?? [];
    const form = useForm<FormData>({ category: '', system_area: '', subject: '', description: '', page_url: '', screenshots: [] });
    const [previews, setPreviews] = useState<string[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const errors = form.errors as Record<string, string | undefined>;

    // Remember the page the user was on when they opened the form
    useEffect(() => { if (open) form.setData('page_url', window.location.href); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

    function reset() {
        form.reset();
        form.clearErrors();
        previews.forEach((u) => URL.revokeObjectURL(u));
        setPreviews([]);
    }

    function addFiles(list: FileList | null) {
        const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/')).slice(0, 5 - form.data.screenshots.length);
        form.setData('screenshots', [...form.data.screenshots, ...files]);
        setPreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))]);
        if (fileRef.current) fileRef.current.value = '';
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(SUBMIT[portal], {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => { toast.success('Thanks! The admin team will look into it.'); reset(); onOpenChange(false); },
        });
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Report a website problem</DialogTitle>
                    <DialogDescription>Something on the site not working? Tell the platform admin team.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-1.5" role="radiogroup" aria-label="What's wrong?">
                        <Label>What's wrong?</Label>
                        {Object.entries(categories).map(([key, c]) => (
                            <button key={key} type="button" role="radio" aria-checked={form.data.category === key} onClick={() => form.setData('category', key)}
                                className={cn('w-full rounded-lg border px-3 py-2 text-left', form.data.category === key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}>
                                <span className="block text-sm font-medium">{c.label}</span>
                                <span className="block text-xs text-gray-500">{c.hint}</span>
                            </button>
                        ))}
                        {errors.category && <p className="text-xs text-red-600">{errors.category}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="wp-area">Where did it happen?</Label>
                        <select id="wp-area" value={form.data.system_area} onChange={(e) => form.setData('system_area', e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Choose a part of the site</option>
                            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {errors.system_area && <p className="text-xs text-red-600">{errors.system_area}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="wp-subject">Short title</Label>
                        <Input id="wp-subject" value={form.data.subject} maxLength={150} onChange={(e) => form.setData('subject', e.target.value)} placeholder="e.g. Inventory page shows an error" />
                        {errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="wp-desc">What happened? What were you trying to do?</Label>
                        <textarea id="wp-desc" value={form.data.description} maxLength={5000} rows={4} onChange={(e) => form.setData('description', e.target.value)}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Screenshots (at least 1, up to 5)</Label>
                        <div className="flex flex-wrap gap-2">
                            {previews.map((u, i) => (
                                <div key={u} className="relative">
                                    <img src={u} alt={`Screenshot ${i + 1}`} className="h-16 w-16 rounded-md border object-cover" />
                                    <button type="button" aria-label="Remove screenshot" onClick={() => {
                                        URL.revokeObjectURL(u);
                                        form.setData('screenshots', form.data.screenshots.filter((_, j) => j !== i));
                                        setPreviews((p) => p.filter((_, j) => j !== i));
                                    }} className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-800 p-0.5 text-white"><X className="h-3 w-3" /></button>
                                </div>
                            ))}
                            {form.data.screenshots.length < 5 && (
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500 hover:bg-gray-50">
                                    <Paperclip className="h-4 w-4" /> Add
                                </button>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                        {(errors.screenshots || Object.entries(errors).find(([k]) => k.startsWith('screenshots.'))?.[1]) && (
                            <p className="text-xs text-red-600">{errors.screenshots ?? Object.entries(errors).find(([k]) => k.startsWith('screenshots.'))?.[1]}</p>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={form.processing || !form.data.category || !form.data.system_area || !form.data.subject.trim()
                            || form.data.description.trim().length < 10 || form.data.screenshots.length === 0}>
                            {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send to admin
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
