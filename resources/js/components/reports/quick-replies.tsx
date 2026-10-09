import type { QuickReplyGroup } from './types';

/** Chips above a report reply box. Clicking one inserts its text (it never sends). */
export default function ReportQuickReplies({ groups, onPick }: { groups: QuickReplyGroup[]; onPick: (text: string) => void }) {
    if (!groups.length) return null;
    return (
        <div className="space-y-1.5">
            {groups.map((g) => (
                <div key={g.group} className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.group}</p>
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                        {g.items.map((q, i) => (
                            <button key={i} type="button" onClick={() => onPick(q.text)} title={q.text}
                                className="shrink-0 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:bg-gray-900 dark:text-gray-200">
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
