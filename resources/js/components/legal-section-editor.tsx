import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LegalDraft, LegalSection } from '@/lib/legal-sections';
import { cn } from '@/lib/utils';

/** A section with a stable key for React (not saved). */
export type EditorSection = LegalSection & { key: number };
export type EditorDraft = { intro: string; sections: EditorSection[] };

let nextKey = 1;
export const withKeys = (d: LegalDraft): EditorDraft => ({ intro: d.intro, sections: d.sections.map((s) => ({ ...s, key: nextKey++ })) });
export const withoutKeys = (d: EditorDraft): LegalDraft => ({ intro: d.intro, sections: d.sections.map(({ heading, points, paragraph }) => ({ heading, points, paragraph })) });

const textareaCls = 'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none overflow-hidden rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]';

/** Textarea that grows with its text. */
function AutoGrowTextarea({ value, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);
    return <textarea ref={ref} value={value} className={cn(textareaCls, className)} {...props} />;
}

/**
 * Plain section editor for Terms & Policies: an introduction and numbered section cards
 * (title, points, optional paragraph). No Markdown symbols are shown or typed.
 */
export default function LegalSectionEditor({ value, onChange }: { value: EditorDraft; onChange: (next: EditorDraft) => void }) {
    const pointRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const titleRefs = useRef<Record<number, HTMLInputElement | null>>({});
    const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [focusPoint, setFocusPoint] = useState<string | null>(null);
    const [focusSection, setFocusSection] = useState<number | null>(null);
    const [openParagraph, setOpenParagraph] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (focusPoint) { pointRefs.current[focusPoint]?.focus(); setFocusPoint(null); }
    }, [focusPoint, value]);
    useEffect(() => {
        if (focusSection !== null) {
            cardRefs.current[focusSection]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            titleRefs.current[focusSection]?.focus({ preventScroll: true });
            setFocusSection(null);
        }
    }, [focusSection, value]);

    const sections = value.sections;
    const setSections = (next: EditorSection[]) => onChange({ ...value, sections: next });
    const update = (i: number, patch: Partial<EditorSection>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));

    function move(i: number, dir: -1 | 1) {
        const j = i + dir;
        if (j < 0 || j >= sections.length) return;
        const next = [...sections];
        [next[i], next[j]] = [next[j], next[i]];
        setSections(next);
    }

    function remove(i: number) {
        const s = sections[i];
        const hasText = s.heading.trim() || s.paragraph.trim() || s.points.some((p) => p.trim());
        if (hasText && !window.confirm(`Delete section ${i + 1}${s.heading.trim() ? ` "${s.heading.trim()}"` : ''}?`)) return;
        setSections(sections.filter((_, j) => j !== i));
    }

    function addSection() {
        const s: EditorSection = { heading: '', points: [''], paragraph: '', key: nextKey++ };
        setSections([...sections, s]);
        setFocusSection(s.key);
    }

    function setPoint(i: number, p: number, text: string) {
        update(i, { points: sections[i].points.map((x, q) => (q === p ? text : x)) });
    }

    function addPoint(i: number, after: number) {
        const points = [...sections[i].points];
        points.splice(after + 1, 0, '');
        update(i, { points });
        setFocusPoint(`${sections[i].key}-${after + 1}`);
    }

    function removePoint(i: number, p: number, focusPrevious = false) {
        update(i, { points: sections[i].points.filter((_, q) => q !== p) });
        if (focusPrevious && p > 0) setFocusPoint(`${sections[i].key}-${p - 1}`);
    }

    function pointKeys(e: KeyboardEvent<HTMLInputElement>, i: number, p: number) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addPoint(i, p);
        } else if (e.key === 'Backspace' && sections[i].points[p] === '' && p > 0) {
            e.preventDefault();
            removePoint(i, p, true);
        }
    }

    return (
        <div className="space-y-4">
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                You can use {'{company_name}'}, {'{company_email}'} and {'{commission_rate}'} — they are replaced automatically.
            </p>

            <div className="grid gap-1.5">
                <Label htmlFor="legal-intro">Introduction</Label>
                <AutoGrowTextarea id="legal-intro" rows={3} value={value.intro} onChange={(e) => onChange({ ...value, intro: e.target.value })} />
                <p className="text-xs text-muted-foreground">Shown at the top of the page.</p>
            </div>

            {sections.map((s, i) => {
                const showParagraph = s.paragraph !== '' || openParagraph.has(s.key);
                return (
                    <div key={s.key} ref={(el) => { cardRefs.current[s.key] = el; }} className="space-y-3 rounded-lg border bg-white p-3 sm:p-4 dark:bg-gray-950">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">Section {i + 1}</span>
                            <div className="flex items-center gap-1">
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                                    <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move down" title="Move down">
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => remove(i)} aria-label="Delete section" title="Delete section">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor={`sec-title-${s.key}`}>Section title</Label>
                            <Input id={`sec-title-${s.key}`} ref={(el) => { titleRefs.current[s.key] = el; }} value={s.heading} placeholder="e.g. Payment"
                                onChange={(e) => update(i, { heading: e.target.value })} />
                        </div>

                        <div className="grid gap-1.5">
                            <Label>Points</Label>
                            <ul className="space-y-1.5">
                                {s.points.map((point, p) => (
                                    <li key={p} className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden />
                                        <Input ref={(el) => { pointRefs.current[`${s.key}-${p}`] = el; }} value={point}
                                            aria-label={`Section ${i + 1}, point ${p + 1}`}
                                            onChange={(e) => setPoint(i, p, e.target.value)} onKeyDown={(e) => pointKeys(e, i, p)} />
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => removePoint(i, p)}
                                            aria-label="Remove point" title="Remove point">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                            <div>
                                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => addPoint(i, s.points.length - 1)}>
                                    <Plus className="h-3.5 w-3.5" /> Add point
                                </Button>
                            </div>
                        </div>

                        {showParagraph ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor={`sec-para-${s.key}`}>Extra paragraph (optional)</Label>
                                <AutoGrowTextarea id={`sec-para-${s.key}`} rows={2} value={s.paragraph} onChange={(e) => update(i, { paragraph: e.target.value })} />
                                <p className="text-xs text-muted-foreground">Shown under the section title, before the points.</p>
                            </div>
                        ) : (
                            <button type="button" className="text-sm font-medium text-blue-600 hover:underline"
                                onClick={() => setOpenParagraph((o) => new Set(o).add(s.key))}>
                                + Add a paragraph
                            </button>
                        )}
                    </div>
                );
            })}

            <Button type="button" variant="outline" onClick={addSection} className="w-full gap-1.5 sm:w-auto">
                <Plus className="h-4 w-4" /> Add section
            </Button>
        </div>
    );
}
