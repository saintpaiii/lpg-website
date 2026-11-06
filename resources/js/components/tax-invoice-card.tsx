import { useForm } from '@inertiajs/react';
import { FileText, Lock } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export type TaxSettings = {
    vat_status: 'vat' | 'non_vat';
    tin: string;
    registered_name: string;
    registered_address: string;
    invoice_prefix: string;
    /** "PGC-000015" */
    next_number: string;
    /** The store has issued a store-series invoice → the code can't change */
    prefix_locked: boolean;
    store_address: string;
};

/** Settings → Tax & Invoice. The owner edits it (PUT /seller/settings/tax); staff with Settings see it read-only. */
export function TaxInvoiceCard({ tax, canEdit, storeName }: { tax: TaxSettings; canEdit: boolean; storeName: string }) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm({
        vat_status:         tax.vat_status,
        tin:                tax.tin,
        registered_name:    tax.registered_name,
        registered_address: tax.registered_address,
        invoice_prefix:     tax.invoice_prefix,
    });
    const readOnly = !canEdit;
    const codeLocked = readOnly || tax.prefix_locked;
    // Live preview while the owner types a new code (the number part comes from the server)
    const nextPreview = !tax.prefix_locked && data.invoice_prefix
        ? `${data.invoice_prefix.toUpperCase()}-${tax.next_number.split('-').pop()}`
        : tax.next_number;

    function submit(e: FormEvent) {
        e.preventDefault();
        if (readOnly) return;
        put('/seller/settings/tax', { preserveScroll: true });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-blue-600" /> Tax &amp; Invoice
                </CardTitle>
                <CardDescription>
                    Prices you set already include VAT. VAT-registered: each invoice splits the total into VATable sales + 12% VAT.
                    Non-VAT: no VAT is shown. VAT registration is required above ₱3,000,000 yearly sales — ask your accountant if unsure.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {readOnly && (
                    <p className="mb-4 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                        <Lock className="h-3.5 w-3.5 shrink-0" /> Only the store owner can change these.
                    </p>
                )}
                <form onSubmit={submit} className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label>VAT status</Label>
                        <div className="inline-flex w-fit overflow-hidden rounded-md border text-sm" role="radiogroup" aria-label="VAT status">
                            {([['non_vat', 'Non-VAT'], ['vat', 'VAT-registered']] as const).map(([v, l]) => (
                                <button key={v} type="button" role="radio" aria-checked={data.vat_status === v} disabled={readOnly}
                                    onClick={() => setData('vat_status', v)}
                                    className={`px-3 py-1.5 font-medium sm:px-4 ${data.vat_status === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800'} disabled:cursor-not-allowed`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        {errors.vat_status && <p className="text-xs text-red-500">{errors.vat_status}</p>}
                    </div>

                    <div className="grid gap-1.5 sm:max-w-xs">
                        <Label htmlFor="tax-tin">
                            TIN {data.vat_status === 'vat' ? <span className="text-red-500">*</span> : <span className="text-xs font-normal text-gray-400">(optional)</span>}
                        </Label>
                        <Input id="tax-tin" value={data.tin} disabled={readOnly} inputMode="numeric" placeholder="000-000-000-00000"
                            onChange={(e) => setData('tin', e.target.value)} />
                        <p className="text-xs text-muted-foreground">With the branch code, e.g. 123-456-789-00000.</p>
                        {errors.tin && <p className="text-xs text-red-500">{errors.tin}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="tax-name">Registered business name <span className="text-xs font-normal text-gray-400">(optional)</span></Label>
                        <Input id="tax-name" value={data.registered_name} disabled={readOnly} placeholder={storeName} maxLength={255}
                            onChange={(e) => setData('registered_name', e.target.value)} />
                        {errors.registered_name && <p className="text-xs text-red-500">{errors.registered_name}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="tax-address">Registered address <span className="text-xs font-normal text-gray-400">(optional)</span></Label>
                        <Input id="tax-address" value={data.registered_address} disabled={readOnly} placeholder={tax.store_address || 'Store address'} maxLength={500}
                            onChange={(e) => setData('registered_address', e.target.value)} />
                        {errors.registered_address && <p className="text-xs text-red-500">{errors.registered_address}</p>}
                    </div>

                    <div className="grid gap-1.5 sm:max-w-xs">
                        <Label htmlFor="tax-code">Invoice code</Label>
                        <Input id="tax-code" value={data.invoice_prefix} disabled={codeLocked} maxLength={5} className="font-mono uppercase"
                            onChange={(e) => setData('invoice_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
                        {tax.prefix_locked
                            ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Locked after your first invoice</p>
                            : <p className="text-xs text-muted-foreground">2–5 letters or digits, starting with a letter.</p>}
                        <p className="text-xs text-muted-foreground">Next invoice: <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">{nextPreview}</span></p>
                        {errors.invoice_prefix && <p className="text-xs text-red-500">{errors.invoice_prefix}</p>}
                    </div>

                    {!readOnly && (
                        <div className="flex items-center justify-end gap-3">
                            {recentlySuccessful && <p className="text-sm font-medium text-emerald-600">Saved.</p>}
                            <Button type="submit" disabled={processing} className="bg-blue-600 text-white hover:bg-blue-700">
                                {processing && <Spinner className="mr-1.5" />}
                                Save tax &amp; invoice
                            </Button>
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>
    );
}
