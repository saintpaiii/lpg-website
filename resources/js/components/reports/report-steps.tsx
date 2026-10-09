import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReportStep } from './types';

/** New → Under Review → Investigating → Resolution → Resolved. Horizontal on wide screens, a list on phones. */
export default function ReportSteps({ steps }: { steps: ReportStep[] }) {
    return (
        <>
            {/* Phones */}
            <ol className="space-y-1.5 sm:hidden" aria-label="Report progress">
                {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                        <Dot step={s} n={i + 1} />
                        <span className={cn(s.current ? 'font-semibold text-blue-700' : s.done ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400')}>{s.label}</span>
                        {s.at && <span className="ml-auto text-[11px] text-gray-400">{s.at}</span>}
                    </li>
                ))}
            </ol>

            {/* Wider screens */}
            <ol className="hidden items-start sm:flex" aria-label="Report progress">
                {steps.map((s, i) => (
                    <li key={i} className="flex flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                            <span className={cn('h-0.5 flex-1', i === 0 ? 'invisible' : steps[i - 1].done || s.done || s.current ? 'bg-blue-500' : 'bg-gray-200')} />
                            <Dot step={s} n={i + 1} />
                            <span className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'invisible' : s.done ? 'bg-blue-500' : 'bg-gray-200')} />
                        </div>
                        <span className={cn('mt-1 text-xs', s.current ? 'font-semibold text-blue-700' : s.done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400')}>{s.label}</span>
                        {s.at && <span className="text-[10px] text-gray-400">{s.at}</span>}
                    </li>
                ))}
            </ol>
        </>
    );
}

function Dot({ step, n }: { step: ReportStep; n: number }) {
    return (
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            step.done && !step.current ? 'bg-blue-600 text-white'
                : step.current ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                : 'border border-gray-300 bg-white text-gray-400 dark:bg-gray-900')}>
            {step.done && !step.current ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
    );
}
