import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Permits that expire (BIR does not). The date field is "{key}_expires_at". */
export const EXPIRING_DOCS = ['business_permit', 'fsic_permit', 'doe_lpg_license', 'lto_permit'] as const;
export type ExpiringDoc = (typeof EXPIRING_DOCS)[number];
export const isExpiringDoc = (key: string): key is ExpiringDoc => (EXPIRING_DOCS as readonly string[]).includes(key);

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d); };
const inFiveYears = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return isoDate(d); };

/** Required "Valid until" date under an expiring permit. */
export function PermitExpiryInput({ id, value, error, onChange }: { id: string; value: string; error?: string; onChange: (v: string) => void }) {
    return (
        <div className="grid gap-1 pl-1">
            <Label htmlFor={id} className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Valid until <span className="text-red-500">*</span>
            </Label>
            <Input id={id} type="date" required min={tomorrow()} max={inFiveYears()} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 max-w-[12rem]" />
            <InputError message={error} />
        </div>
    );
}

/** Optional store logo (JPG/PNG, max 2 MB) with a square preview. */
export function StoreLogoPicker({ file, currentUrl, error, onChange }: { file: File | null; currentUrl?: string | null; error?: string; onChange: (f: File | null) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!file) { setPreview(null); return; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const shown = preview ?? currentUrl ?? null;

    return (
        <div className="grid gap-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Store logo (optional)</Label>
            <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-gray-50 dark:bg-gray-800">
                    {shown ? <img src={shown} alt="Store logo preview" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-gray-400" />}
                </div>
                <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => ref.current?.click()}
                            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
                            {shown ? 'Change logo' : 'Choose logo'}
                        </button>
                        {file && (
                            <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:text-gray-800">
                                <X className="h-3.5 w-3.5" /> Remove
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">JPG or PNG, up to 2 MB. A square image looks best. Customers see it next to your store name.</p>
                </div>
                <input ref={ref} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
            </div>
            <InputError message={error} />
        </div>
    );
}
