import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Loader2, MapPinned, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AddressFields } from '@/components/address-fields';
import AddressMap, { lookupBarangay } from '@/components/address-map';
import AddressSearchBox, { matchBarangay, matchCity, shortPlaceName, type GeocodeResult } from '@/components/address-search-box';
import { labelIcon, type SavedAddress } from '@/components/address-search-map';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CustomerLayout from '@/layouts/customer-layout';

type Props = { addresses: SavedAddress[]; labels: string[] };

type FormData = {
    label: string;
    address_line: string;
    barangay: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
};

const blank: FormData = { label: 'Home', address_line: '', barangay: '', city: '', latitude: null, longitude: null, is_default: false };

export default function CustomerAddresses({ addresses, labels }: Props) {
    const flash = (usePage().props as { flash?: { success?: string; error?: string } }).flash;
    const [editing, setEditing]   = useState<SavedAddress | null>(null);
    const [open, setOpen]         = useState(false);
    const [deleting, setDeleting] = useState<SavedAddress | null>(null);
    const [note, setNote]         = useState<string | null>(null);

    const form = useForm<FormData>(blank);

    function openNew() {
        setEditing(null);
        form.clearErrors();
        form.setData({ ...blank, label: addresses.some((a) => a.label === 'Home') ? 'Office' : 'Home', is_default: addresses.length === 0 });
        setNote(null);
        setOpen(true);
    }

    function openEdit(a: SavedAddress) {
        setEditing(a);
        form.clearErrors();
        form.setData({
            label: a.label, address_line: a.address_line, barangay: a.barangay ?? '', city: a.city ?? '',
            latitude: a.latitude, longitude: a.longitude, is_default: a.is_default,
        });
        setNote(null);
        setOpen(true);
    }

    function pickSearchResult(r: GeocodeResult) {
        const city = matchCity(r.city) ?? form.data.city;
        const barangay = matchBarangay(city, r.barangay) ?? '';
        form.setData((d) => ({
            ...d,
            address_line: r.street || shortPlaceName(r.display_name).split(',')[0] || d.address_line,
            city, barangay, latitude: r.lat, longitude: r.lng,
        }));
        setNote(barangay ? null : 'Please choose the barangay below so riders see the full address.');
    }

    /** City/barangay picked from the dropdowns → pin at that barangay (then drag to the exact spot). */
    async function pinFromBarangay(city: string, barangay: string) {
        if (!city || !barangay) return;
        const geo = await lookupBarangay(city, barangay);
        if (geo && geo.precision !== 'none') {
            form.setData((d) => ({ ...d, latitude: geo.latitude, longitude: geo.longitude }));
            setNote(geo.found ? null : geo.message ?? null);
        }
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/customer/addresses/${editing.id}`, opts);
        else form.post('/customer/addresses', opts);
    }

    return (
        <CustomerLayout>
            <Head title="My Addresses" />

            <div className="mx-auto max-w-3xl space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Addresses</h1>
                        <p className="text-sm text-muted-foreground">Saved delivery addresses you can pick at checkout.</p>
                    </div>
                    <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> Add New Address</Button>
                </div>

                {flash?.success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash.success}</div>}
                {flash?.error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{flash.error}</div>}

                {addresses.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <MapPinned className="h-10 w-10 text-gray-300" />
                            <p className="text-sm text-gray-500">No saved addresses yet.</p>
                            <Button variant="outline" onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> Add your first address</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="divide-y p-0">
                            {addresses.map((a) => {
                                const Icon = labelIcon(a.label);
                                return (
                                    <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 font-semibold">
                                                {a.label}
                                                {a.is_default && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Default</span>}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">{a.full_text}{a.full_text.includes('Cavite') ? '' : ', Cavite'}</p>
                                            {!a.is_default && (
                                                <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                                                    onClick={() => router.post(`/customer/addresses/${a.id}/set-default`, {}, { preserveScroll: true })}>
                                                    <Star className="h-3 w-3" /> Set as default
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 gap-1">
                                            <Button size="icon" variant="ghost" aria-label={`Edit ${a.label}`} onClick={() => openEdit(a)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" aria-label={`Delete ${a.label}`} className="text-red-600 hover:text-red-700" onClick={() => setDeleting(a)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add / edit */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit "${editing.label}"` : 'Add New Address'}</DialogTitle>
                        <DialogDescription>Search for the place or choose your barangay, then drag the pin (or tap the map) to your exact spot.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submit} className="space-y-3">
                        <div className="grid gap-1.5">
                            <Label>Label</Label>
                            <div className="flex flex-wrap gap-2">
                                {labels.map((l) => (
                                    <button key={l} type="button" onClick={() => form.setData('label', l)}
                                        className={`rounded-full border px-3 py-1 text-sm ${form.data.label === l ? 'border-blue-600 bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
                                        {l}
                                    </button>
                                ))}
                                {!labels.includes(form.data.label) && (
                                    <Input value={form.data.label} onChange={(e) => form.setData('label', e.target.value)} className="h-8 w-32" maxLength={50} />
                                )}
                            </div>
                            {form.errors.label && <p className="text-xs text-red-500">{form.errors.label}</p>}
                        </div>

                        <AddressSearchBox onSelect={pickSearchResult} />

                        <AddressFields
                            address={form.data.address_line}
                            city={form.data.city}
                            barangay={form.data.barangay}
                            onAddressChange={(v) => form.setData('address_line', v)}
                            onCityChange={(v) => form.setData((d) => ({ ...d, city: v, barangay: '' }))}
                            onBarangayChange={(v) => { form.setData('barangay', v); pinFromBarangay(form.data.city, v); }}
                            errors={form.errors as Record<string, string>}
                            errorKeys={{ address: 'address_line' }}
                            compact
                        />
                        {note && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">{note}</p>}

                        <AddressMap
                            latitude={form.data.latitude}
                            longitude={form.data.longitude}
                            onLocationChange={(lat, lng) => form.setData((d) => ({ ...d, latitude: lat, longitude: lng }))}
                            height="240px"
                            clickMoves
                        />
                        {(form.errors.latitude || form.errors.longitude) && <p className="text-xs text-red-500">{form.errors.latitude ?? form.errors.longitude}</p>}

                        {!(editing?.is_default) && (
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                                <Checkbox checked={form.data.is_default} onCheckedChange={(c) => form.setData('is_default', c === true)} />
                                Use as my default delivery address
                            </label>
                        )}

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>
                                {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                {editing ? 'Save changes' : 'Save address'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete confirmation */}
            <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{deleting?.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting?.full_text}
                            {deleting?.is_default && ' — this is your default address; your next most recent address becomes the default.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                            onClick={() => deleting && router.delete(`/customer/addresses/${deleting.id}`, { preserveScroll: true, onFinish: () => setDeleting(null) })}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CustomerLayout>
    );
}
