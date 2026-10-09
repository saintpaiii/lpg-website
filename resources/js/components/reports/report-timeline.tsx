import { FileText, Info, Lock } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ReportDetail } from './types';

const isImage = (url: string) => /\.(jpe?g|png|webp|gif)$/i.test(url);

function Attachments({ urls, onOpen }: { urls: string[]; onOpen: (url: string) => void }) {
    if (!urls.length) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {urls.map((u) => isImage(u) ? (
                <button key={u} type="button" onClick={() => onOpen(u)} className="block">
                    <img src={u} alt="Attachment" className="h-20 w-20 rounded-md border object-cover" />
                </button>
            ) : (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border text-[10px] text-gray-600 hover:bg-gray-50">
                    <FileText className="h-5 w-5" />{u.split('.').pop()?.toUpperCase()}
                </a>
            ))}
        </div>
    );
}

const BUBBLE: Record<string, string> = {
    customer: 'bg-gray-50 border-gray-200 dark:bg-gray-800/60 dark:border-gray-700',
    store: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    rider: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
    admin: 'bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800',
};

/** The original report, then every reply / notice in order. Internal notes only arrive for admins. */
export default function ReportTimeline({ report }: { report: ReportDetail }) {
    const [viewer, setViewer] = useState<string | null>(null);

    return (
        <div className="space-y-3">
            {/* The report itself */}
            <div className="rounded-lg border bg-white p-4 dark:bg-gray-950">
                <p className="text-xs text-gray-500">{report.reporter.name} · {report.created_at}</p>
                <p className="mt-1 font-semibold">{report.subject}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{report.description}</p>
                <Attachments urls={report.evidence_urls} onOpen={setViewer} />
            </div>

            {report.updates.map((u) => u.author_side === 'system' ? (
                <p key={u.id} className="flex items-start justify-center gap-1.5 px-4 text-center text-xs text-gray-500">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" /> <span>{u.body} <span className="text-[10px] text-gray-400">· {u.created_at}</span></span>
                </p>
            ) : (
                <div key={u.id} className={cn('rounded-lg border p-3',
                    u.is_internal ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20' : BUBBLE[u.author_side] ?? BUBBLE.customer)}>
                    {u.is_internal && (
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-yellow-800 dark:text-yellow-300">
                            <Lock className="h-3 w-3" /> Private note — only admins can see this
                        </p>
                    )}
                    <p className="text-xs">
                        <span className="font-semibold">{u.author_label}</span>
                        {u.author_staff && <span className="text-gray-500"> · {u.author_staff}</span>}
                        <span className="text-gray-400"> · {u.created_at}</span>
                    </p>
                    {u.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{u.body}</p>}
                    <Attachments urls={u.attachment_urls} onOpen={setViewer} />
                </div>
            ))}

            <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
                <DialogContent className="max-w-3xl p-2">
                    <DialogTitle className="sr-only">Attachment</DialogTitle>
                    {viewer && <img src={viewer} alt="Attachment" className="max-h-[80vh] w-full rounded object-contain" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
