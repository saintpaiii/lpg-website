import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** ExchangePolicy::for() */
export type ExchangePolicyData = { brands: string[]; rules: string[]; note: string | null };
export type ExchangeOptions = { brands: string[]; rules: string[] };

export const DEFAULT_EXCHANGE_OPTIONS: ExchangeOptions = {
    brands: ['Petron Gasul', 'Solane', 'Shellane', 'Phoenix', 'Total', 'Pryce', 'Fiesta', 'Any brand'],
    rules: ['No dents or rust', 'No leaks', 'Valve and collar intact', 'Not past its requalification date (stamped on the collar)'],
};
export const defaultPolicy = (o: ExchangeOptions = DEFAULT_EXCHANGE_OPTIONS): ExchangePolicyData => ({ brands: ['Any brand'], rules: [...o.rules], note: null });

/** Flatten for FormData: exchange_policy[brands][], exchange_policy[rules][], exchange_policy[note] */
export function appendPolicy(fd: FormData, p: ExchangePolicyData) {
    p.brands.forEach((b) => fd.append('exchange_policy[brands][]', b));
    p.rules.forEach((r) => fd.append('exchange_policy[rules][]', r));
    fd.append('exchange_policy[note]', p.note ?? '');
}

/** Read-only list (store page, product page, checkout dialog) */
export function ExchangePolicyView({ policy, className }: { policy: ExchangePolicyData; className?: string }) {
    const any = policy.brands.includes('Any brand');
    return (
        <div className={cn('space-y-1.5 text-sm', className)}>
            <p><span className="font-medium">Empty tank brands accepted:</span> {any ? 'Any brand' : policy.brands.join(', ')}</p>
            {policy.rules.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {policy.rules.map((r) => <li key={r}>{r}</li>)}
                </ul>
            )}
            {policy.note && <p className="text-muted-foreground italic">{policy.note}</p>}
        </div>
    );
}

/** "View policy" link that opens the policy in a dialog */
export function ExchangePolicyLink({ policy, storeName, label = 'View policy' }: { policy: ExchangePolicyData; storeName?: string; label?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className="font-medium text-blue-600 underline-offset-2 hover:underline" onClick={(e) => { e.preventDefault(); setOpen(true); }}>{label}</button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /> Tank exchange policy</DialogTitle>
                        <DialogDescription>{storeName ? `${storeName} accepts your empty tank for a refill when:` : 'Your empty tank is accepted for a refill when:'}</DialogDescription>
                    </DialogHeader>
                    <ExchangePolicyView policy={policy} />
                </DialogContent>
            </Dialog>
        </>
    );
}

/** Editor (Seller Settings + both application forms). Default: Any brand + all 4 rules. */
export function ExchangePolicyEditor({ value, onChange, options = DEFAULT_EXCHANGE_OPTIONS, idPrefix = 'xp' }: {
    value: ExchangePolicyData;
    onChange: (p: ExchangePolicyData) => void;
    options?: ExchangeOptions;
    idPrefix?: string;
}) {
    const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
    const setBrand = (b: string) => {
        // "Any brand" and specific brands exclude each other
        let brands = toggle(value.brands, b);
        if (b === 'Any brand' && brands.includes('Any brand')) brands = ['Any brand'];
        else if (b !== 'Any brand') brands = brands.filter((x) => x !== 'Any brand');
        onChange({ ...value, brands: brands.length ? brands : ['Any brand'] });
    };
    return (
        <div className="space-y-3 text-sm">
            <fieldset>
                <legend className="mb-1.5 font-medium">Empty tank brands you accept</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {options.brands.map((b) => (
                        <label key={b} className="flex items-center gap-1.5">
                            <input type="checkbox" checked={value.brands.includes(b)} onChange={() => setBrand(b)} /> {b}
                        </label>
                    ))}
                </div>
            </fieldset>
            <fieldset>
                <legend className="mb-1.5 font-medium">The tank must be in good condition</legend>
                <div className="space-y-1">
                    {options.rules.map((r) => (
                        <label key={r} className="flex items-start gap-1.5">
                            <input type="checkbox" className="mt-0.5" checked={value.rules.includes(r)} onChange={() => onChange({ ...value, rules: toggle(value.rules, r) })} /> {r}
                        </label>
                    ))}
                </div>
            </fieldset>
            <div className="grid gap-1">
                <label htmlFor={`${idPrefix}-note`} className="font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
                <textarea id={`${idPrefix}-note`} rows={2} maxLength={300} value={value.note ?? ''} onChange={(e) => onChange({ ...value, note: e.target.value })}
                    placeholder="e.g. We also accept Pryce tanks bought from us."
                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
        </div>
    );
}
