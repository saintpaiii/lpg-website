import { Head, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import { Building2, Phone, Mail, MapPin, Package, Clock, CheckCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Settings {
    company_name: string;
    company_address: string;
    company_phone: string;
    company_email: string;
    default_reorder_level: string;
    lead_time_days: string;
}

interface Props {
    settings: Settings;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettings({ settings }: Props) {
    const { props } = usePage<{ flash?: { success?: string; error?: string } }>();
    const flash = props.flash;

    const { data, setData, post, processing, errors, recentlySuccessful } = useForm<Settings>({
        company_name:          settings.company_name,
        company_address:       settings.company_address,
        company_phone:         settings.company_phone,
        company_email:         settings.company_email,
        default_reorder_level: settings.default_reorder_level,
        lead_time_days:        settings.lead_time_days,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/admin/settings', { preserveScroll: true });
    };

    return (
        <AppLayout>
            <Head title="Settings" />

            <div className="p-6 max-w-3xl space-y-6">
                {/* Page header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage company information and system defaults used across invoices and DSS calculations.
                    </p>
                </div>

                {/* Flash messages */}
                {flash?.success && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {flash.error}
                    </div>
                )}

                <form onSubmit={submit} className="space-y-6">
                    {/* ── Company Information ─────────────────────────────── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Building2 className="h-4 w-4 text-blue-600" />
                                Company Information
                            </CardTitle>
                            <CardDescription>
                                These details appear on printed invoices sent to customers.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Company Name */}
                            <div className="grid gap-1.5">
                                <Label htmlFor="company_name">
                                    Company Name <span className="text-red-500">*</span>
                                </Label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="company_name"
                                        className="pl-9"
                                        value={data.company_name}
                                        onChange={(e) => setData('company_name', e.target.value)}
                                        placeholder="LPG Distribution Cavite"
                                    />
                                </div>
                                <InputError message={errors.company_name} />
                            </div>

                            {/* Company Address */}
                            <div className="grid gap-1.5">
                                <Label htmlFor="company_address">Address</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <textarea
                                        id="company_address"
                                        rows={3}
                                        className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                        value={data.company_address}
                                        onChange={(e) => setData('company_address', e.target.value)}
                                        placeholder="Street, Barangay, Municipality, Province"
                                    />
                                </div>
                                <InputError message={errors.company_address} />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* Company Phone */}
                                <div className="grid gap-1.5">
                                    <Label htmlFor="company_phone">Phone</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="company_phone"
                                            type="tel"
                                            className="pl-9"
                                            value={data.company_phone}
                                            onChange={(e) => setData('company_phone', e.target.value)}
                                            placeholder="09XX-XXX-XXXX"
                                        />
                                    </div>
                                    <InputError message={errors.company_phone} />
                                </div>

                                {/* Company Email */}
                                <div className="grid gap-1.5">
                                    <Label htmlFor="company_email">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="company_email"
                                            type="email"
                                            className="pl-9"
                                            value={data.company_email}
                                            onChange={(e) => setData('company_email', e.target.value)}
                                            placeholder="info@lpgcavite.com"
                                        />
                                    </div>
                                    <InputError message={errors.company_email} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── DSS & Inventory Defaults ─────────────────────────── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Package className="h-4 w-4 text-blue-600" />
                                Inventory &amp; DSS Defaults
                            </CardTitle>
                            <CardDescription>
                                System defaults used by the Decision Support System for reorder alerts and demand forecasting.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* Default Reorder Level */}
                                <div className="grid gap-1.5">
                                    <Label htmlFor="default_reorder_level">
                                        Default Reorder Level <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="default_reorder_level"
                                            type="number"
                                            min="1"
                                            max="9999"
                                            className="pl-9"
                                            value={data.default_reorder_level}
                                            onChange={(e) => setData('default_reorder_level', e.target.value)}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        New products will use this as their initial reorder threshold (units).
                                    </p>
                                    <InputError message={errors.default_reorder_level} />
                                </div>

                                {/* Lead Time Days */}
                                <div className="grid gap-1.5">
                                    <Label htmlFor="lead_time_days">
                                        Lead Time (days) <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="lead_time_days"
                                            type="number"
                                            min="1"
                                            max="365"
                                            className="pl-9"
                                            value={data.lead_time_days}
                                            onChange={(e) => setData('lead_time_days', e.target.value)}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Days expected from order to stock arrival. Used in DSS stockout predictions.
                                    </p>
                                    <InputError message={errors.lead_time_days} />
                                </div>
                            </div>

                            {/* Info box */}
                            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1">
                                <p className="font-medium">How these are used:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                                    <li><strong>Reorder level</strong> — triggers low-stock alerts in the DSS Reorder Alerts tab</li>
                                    <li><strong>Lead time</strong> — adjusts the "days until stockout" buffer so you order early enough</li>
                                    <li>Both values can be overridden per-product from the Inventory page</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>

                    <Separator />

                    {/* Save */}
                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing} className="px-6">
                            {processing ? 'Saving…' : 'Save settings'}
                        </Button>
                        {recentlySuccessful && (
                            <span className="flex items-center gap-1.5 text-sm text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                Settings saved.
                            </span>
                        )}
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
