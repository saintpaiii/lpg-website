import { router } from '@inertiajs/react';
import { Clock, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ExchangePolicyEditor, type ExchangeOptions, type ExchangePolicyData } from '@/components/exchange-policy';
import StoreHoursEditor, { toWeek, type DayHours } from '@/components/store-hours-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Store application forms (/seller/register, Start Selling): optional step-1 section, prefilled "Open 24 hours" and
 * the default exchange policy. Both can be changed later in Settings.
 */
export function ApplicationHoursPolicy({ alwaysOpen, week, policy, options, onChange }: {
    alwaysOpen: boolean;
    week: ReturnType<typeof toWeek>;
    policy: ExchangePolicyData;
    options?: ExchangeOptions;
    onChange: (v: { alwaysOpen: boolean; week: ReturnType<typeof toWeek>; policy: ExchangePolicyData }) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-lg border">
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium">
                <span>Store hours &amp; tank exchange policy <span className="font-normal text-muted-foreground">(optional)</span></span>
                <span className="text-xs text-muted-foreground">{alwaysOpen ? 'Open 24 hours' : 'Custom hours'} · {open ? 'Hide' : 'Change'}</span>
            </button>
            {open && (
                <div className="space-y-4 border-t px-3 py-3">
                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-blue-600" /> Store hours</p>
                        <StoreHoursEditor alwaysOpen={alwaysOpen} week={week} onChange={(a, w) => onChange({ alwaysOpen: a, week: w, policy })} idPrefix="apply-hours" />
                    </div>
                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-blue-600" /> Tank exchange policy</p>
                        <ExchangePolicyEditor value={policy} onChange={(p) => onChange({ alwaysOpen, week, policy: p })} options={options} idPrefix="apply-xp" />
                    </div>
                    <p className="text-xs text-muted-foreground">You can change both later in Settings.</p>
                </div>
            )}
        </div>
    );
}

/** Seller Settings → Store hours (J4). Saved on its own (PUT /seller/settings/hours). */
export function StoreHoursCard({ hours, statusLabel }: { hours: Record<string, DayHours> | null; statusLabel?: string }) {
    const [alwaysOpen, setAlwaysOpen] = useState(hours === null);
    const [week, setWeek] = useState(toWeek(hours));
    const [busy, setBusy] = useState(false);

    const save = () => {
        setBusy(true);
        router.put('/seller/settings/hours', { always_open: alwaysOpen, opening_hours: alwaysOpen ? null : week }, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    return (
        <Card id="store-hours">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-blue-600" /> Store hours</CardTitle>
                <CardDescription>
                    Customers see when you're open on your store page and products{statusLabel ? ` — right now: ${statusLabel}` : ''}. They can still order while
                    you're closed; delivery and pick-up start when you open.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <StoreHoursEditor alwaysOpen={alwaysOpen} week={week} onChange={(a, w) => { setAlwaysOpen(a); setWeek(w); }} idPrefix="settings-hours" />
                <Button type="button" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save hours</Button>
            </CardContent>
        </Card>
    );
}

/** Seller Settings → Tank exchange policy (J4). Saved on its own (PUT /seller/settings/exchange-policy). */
export function ExchangePolicyCard({ policy, options }: { policy: ExchangePolicyData; options?: ExchangeOptions }) {
    const [value, setValue] = useState<ExchangePolicyData>(policy);
    const [busy, setBusy] = useState(false);
    const save = () => {
        setBusy(true);
        router.put('/seller/settings/exchange-policy', { exchange_policy: value }, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    return (
        <Card id="exchange-policy">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-blue-600" /> Tank exchange policy</CardTitle>
                <CardDescription>
                    Which empty tanks you accept for a refill. Customers see it on your products and at checkout; a tank that doesn't meet it can be
                    refused at handover (switch to New Purchase or cancel the item).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <ExchangePolicyEditor value={value} onChange={setValue} options={options} idPrefix="settings-xp" />
                <Button type="button" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save policy</Button>
            </CardContent>
        </Card>
    );
}
