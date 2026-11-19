import { router } from '@inertiajs/react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import CameraCapture from '@/components/camera-capture';
import StorePinPicker from '@/components/store-pin-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAutoFillAddress } from '@/hooks/use-auto-fill-address';
import { lookupBarangay } from '@/components/address-map';
import { DOCUMENT_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';

export type SentBack = {
    store_name: string;
    message: string | null;
    documents: { key: string; label: string; reason: string; note: string | null; text: string }[];
    address: { address: string | null; city: string | null; barangay: string | null; latitude: number | null; longitude: number | null };
};

const DOC_KEYS = ['valid_id', 'bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'dti_sec_registration'];

/**
 * Seller-only owner, application sent back (J3): each rejected document with its reason, and a re-upload for just
 * those (a new ID needs a new live selfie; a rejected address / pin can be fixed here). Accepted ones stay accepted.
 */
export default function SellerResubmitCard({ sentBack }: { sentBack: SentBack }) {
    const docs = sentBack.documents.filter((d) => DOC_KEYS.includes(d.key));
    const fixPin = sentBack.documents.some((d) => d.key === 'address_pin');
    const others = sentBack.documents.filter((d) => !DOC_KEYS.includes(d.key) && d.key !== 'address_pin');

    const [files, setFiles] = useState<Record<string, File | null>>({});
    const [problems, setProblems] = useState<Record<string, string>>({});
    const [selfie, setSelfie] = useState<File | null>(null);
    const [addr, setAddr] = useState({ address: sentBack.address.address ?? '', city: sentBack.address.city ?? '', barangay: sentBack.address.barangay ?? '' });
    const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
        sentBack.address.latitude != null && sentBack.address.longitude != null ? { lat: sentBack.address.latitude, lng: sentBack.address.longitude } : null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const autoFill = useAutoFillAddress({
        street: addr.address, pinned: !!pin,
        apply: (a) => setAddr({ address: a.street, city: a.city, barangay: a.barangay }),
    });

    // No pin yet: start it at the chosen barangay; an existing / dragged pin is never moved
    const autoPin = (city: string, barangay: string) => {
        if (pin || !city || !barangay) return;
        lookupBarangay(city, barangay).then((geo) => {
            if (geo && geo.precision !== 'none') setPin((p) => p ?? { lat: geo.latitude, lng: geo.longitude });
        });
    };

    const needsSelfie = docs.some((d) => d.key === 'valid_id');
    const ready = docs.every((d) => files[d.key]) && (!needsSelfie || !!selfie) && (!fixPin || (!!pin && !!addr.address && !!addr.city && !!addr.barangay));
    const canSend = docs.length > 0 || fixPin;

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const data: Record<string, File | string> = {};
        for (const d of docs) if (files[d.key]) data[d.key] = files[d.key]!;
        if (selfie) data.selfie = selfie;
        if (fixPin && pin) Object.assign(data, { store_address: addr.address, store_city: addr.city, store_barangay: addr.barangay, latitude: String(pin.lat), longitude: String(pin.lng) });
        setBusy(true);
        router.post('/seller/pending/resubmit', data, { forceFormData: true, onError: (er) => setErrors(er as Record<string, string>), onFinish: () => setBusy(false) });
    }

    return (
        <form onSubmit={submit} className="mb-6 space-y-4 rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
            <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800 dark:text-red-300"><AlertTriangle className="h-4 w-4" /> Your application needs changes</p>
                <ul className="mt-1.5 list-inside list-disc text-sm text-red-800 dark:text-red-300">
                    {sentBack.documents.map((d) => <li key={d.key}>{d.text}</li>)}
                </ul>
                <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">Documents the admin already accepted stay accepted — upload only these.</p>
            </div>

            {docs.map((d) => (
                <div key={d.key} className="grid gap-1.5">
                    <Label htmlFor={`rs_${d.key}`}>New {d.label} <span className="text-red-500">*</span></Label>
                    <Input id={`rs_${d.key}`} type="file" accept={DOCUMENT_ACCEPT} onChange={async (e) => {
                        const picked = e.target.files?.[0] ?? null;
                        if (!picked) { setFiles((f) => ({ ...f, [d.key]: null })); return; }
                        const { file, problem } = await prepareDocumentFile(picked);
                        setProblems((p) => ({ ...p, [d.key]: problem ?? '' }));
                        setFiles((f) => ({ ...f, [d.key]: file ?? null }));
                        if (!file) e.target.value = '';
                    }} />
                    {(problems[d.key] || errors[d.key]) && <p className="text-xs text-red-600">{problems[d.key] || errors[d.key]}</p>}
                </div>
            ))}

            {needsSelfie && (
                <div className="grid gap-1.5">
                    <Label>New selfie (live camera) <span className="text-red-500">*</span></Label>
                    <CameraCapture value={selfie} onChange={setSelfie} fileName="selfie.jpg" compact
                        hint="Hold the new ID next to your face. Uploading a picture is not allowed." error={errors.selfie || null} />
                    <p className="text-xs text-muted-foreground">Your ID photo and selfie are compared by our face-matching provider (Face++) only to confirm it's you.</p>
                </div>
            )}

            {fixPin && (
                <div className="space-y-3">
                    <AddressFields
                        address={addr.address} city={addr.city} barangay={addr.barangay}
                        onAddressChange={(v) => setAddr((a) => ({ ...a, address: v }))}
                        onCityChange={(v) => { setAddr((a) => ({ ...a, city: v })); autoPin(v, addr.barangay); }}
                        onBarangayChange={(v) => { setAddr((a) => ({ ...a, barangay: v })); autoPin(addr.city, v); }}
                        errors={errors} errorKeys={{ address: 'store_address', city: 'store_city', barangay: 'store_barangay' }}
                        requiredBarangay autoFill={autoFill}
                    />
                    <StorePinPicker latitude={pin?.lat ?? null} longitude={pin?.lng ?? null} onChange={(lat, lng) => setPin({ lat, lng })}
                        autoFill={autoFill} error={errors.latitude || errors.longitude} />
                </div>
            )}

            {others.length > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                    {others.map((o) => o.label).join(', ')}: {canSend ? 'nothing to upload here — ' : ''}please contact the platform admin if you need help.
                </p>
            )}

            {canSend && (
                <Button type="submit" disabled={!ready || busy} className="w-full gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send the corrections
                </Button>
            )}
        </form>
    );
}
