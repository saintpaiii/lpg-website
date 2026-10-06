import axios from 'axios';
import { Loader2, Pencil, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuickReply } from './types';

/** ⚡ button: pick a saved reply to insert into the message box (never auto-sends). */
export default function QuickReplies({ replies, onChange, onInsert, canManage }: {
    replies: QuickReply[];
    onChange: (next: QuickReply[]) => void;
    onInsert: (text: string) => void;
    canManage: boolean;
}) {
    const [manage, setManage] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="Quick replies" title="Quick replies">
                        <Zap className="h-5 w-5 text-amber-500" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-72">
                    <DropdownMenuLabel>Quick replies</DropdownMenuLabel>
                    {replies.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-500">No saved replies yet.</p>}
                    {replies.map((r) => (
                        <DropdownMenuItem key={r.id} onSelect={() => onInsert(r.body)} className="flex-col items-start gap-0">
                            <span className="text-sm font-medium">{r.title}</span>
                            <span className="line-clamp-2 text-xs text-gray-500">{r.body}</span>
                        </DropdownMenuItem>
                    ))}
                    {canManage && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setManage(true)} className="text-blue-600">Manage quick replies…</DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {canManage && <ManageDialog open={manage} onOpenChange={setManage} replies={replies} onChange={onChange} />}
        </>
    );
}

function ManageDialog({ open, onOpenChange, replies, onChange }: {
    open: boolean; onOpenChange: (o: boolean) => void; replies: QuickReply[]; onChange: (next: QuickReply[]) => void;
}) {
    const [editing, setEditing] = useState<QuickReply | null>(null);
    const [title, setTitle] = useState('');
    const [body, setBody]   = useState('');
    const [busy, setBusy]   = useState(false);

    const reset = () => { setEditing(null); setTitle(''); setBody(''); };
    const errorOf = (err: unknown) => (axios.isAxiosError(err) ? (Object.values(err.response?.data?.errors ?? {})[0] as string[] | undefined)?.[0] ?? err.response?.data?.message : null) ?? 'Something went wrong.';

    async function save() {
        setBusy(true);
        try {
            if (editing) {
                const res = await axios.put<{ quickReply: QuickReply }>(`/seller/quick-replies/${editing.id}`, { title, body });
                onChange(replies.map((r) => (r.id === editing.id ? res.data.quickReply : r)));
            } else {
                const res = await axios.post<{ quickReply: QuickReply }>('/seller/quick-replies', { title, body });
                onChange([...replies, res.data.quickReply].sort((a, b) => a.title.localeCompare(b.title)));
            }
            reset();
        } catch (err) {
            toast.error(errorOf(err));
        }
        setBusy(false);
    }

    async function remove(r: QuickReply) {
        try {
            await axios.delete(`/seller/quick-replies/${r.id}`);
            onChange(replies.filter((x) => x.id !== r.id));
            if (editing?.id === r.id) reset();
        } catch (err) {
            toast.error(errorOf(err));
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Quick replies</DialogTitle>
                    <DialogDescription>Saved messages your team can insert into any chat.</DialogDescription>
                </DialogHeader>

                <ul className="divide-y rounded-md border">
                    {replies.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No saved replies yet.</li>}
                    {replies.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{r.title}</p>
                                <p className="text-xs text-gray-500">{r.body}</p>
                            </div>
                            <Button size="icon" variant="ghost" aria-label={`Edit ${r.title}`} onClick={() => { setEditing(r); setTitle(r.title); setBody(r.body); }}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" aria-label={`Delete ${r.title}`} className="text-red-600" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                        </li>
                    ))}
                </ul>

                <div className="space-y-2 rounded-md border bg-gray-50 p-3 dark:bg-gray-900/40">
                    <p className="text-sm font-medium">{editing ? `Edit "${editing.title}"` : 'Add a quick reply'}</p>
                    <div className="grid gap-1">
                        <Label className="text-xs">Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Delivery time" />
                    </div>
                    <div className="grid gap-1">
                        <Label className="text-xs">Message</Label>
                        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                    <div className="flex justify-end gap-2">
                        {editing && <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>}
                        <Button size="sm" onClick={save} disabled={busy || !title.trim() || !body.trim()}>
                            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {editing ? 'Save changes' : 'Add reply'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
