import { Head, useForm } from '@inertiajs/react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type StaffRate = {
    id: number;
    name: string;
    sub_role: string;
    daily_rate_override: number;
};

type Props = {
    settings: {
        payroll_period: string;
        overtime_multiplier: number;
        late_deduction_per_day: number;
    };
    pay_rates: Record<string, number>;
    staff_rates: StaffRate[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Payroll', href: '/seller/payroll' },
    { title: 'Settings', href: '/seller/payroll/settings' },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollSettingsPage({ settings, pay_rates, staff_rates }: Props) {
    const form = useForm({
        payroll_period:          settings.payroll_period,
        overtime_multiplier:     String(settings.overtime_multiplier),
        late_deduction_per_day:  String(settings.late_deduction_per_day),
        pay_rates: {
            cashier:   String(pay_rates.cashier   ?? 500),
            warehouse: String(pay_rates.warehouse ?? 500),
            rider:     String(pay_rates.rider     ?? 500),
            hr:        String(pay_rates.hr        ?? 500),
        },
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        form.post('/seller/payroll/settings', { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll Settings" />

            <div className="flex flex-1 flex-col gap-6 p-6 max-w-2xl mx-auto w-full">

                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Settings2 className="h-6 w-6 text-blue-600" />
                        Payroll Settings
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">Configure payroll rules and default daily rates.</p>
                </div>

                <form onSubmit={submit} className="space-y-6">

                    {/* General Settings */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">General</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label>Payroll Period</Label>
                                <Select
                                    value={form.data.payroll_period}
                                    onValueChange={v => form.setData('payroll_period', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                    </SelectContent>
                                </Select>
                                {form.errors.payroll_period && (
                                    <p className="text-xs text-red-500">{form.errors.payroll_period}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label>Overtime Multiplier</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="1"
                                        max="3"
                                        value={form.data.overtime_multiplier}
                                        onChange={e => form.setData('overtime_multiplier', e.target.value)}
                                    />
                                    {form.errors.overtime_multiplier && (
                                        <p className="text-xs text-red-500">{form.errors.overtime_multiplier}</p>
                                    )}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>Late Deduction / Day (₱)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.data.late_deduction_per_day}
                                        onChange={e => form.setData('late_deduction_per_day', e.target.value)}
                                    />
                                    {form.errors.late_deduction_per_day && (
                                        <p className="text-xs text-red-500">{form.errors.late_deduction_per_day}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Default Daily Rates by Role */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Default Daily Rates by Role</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4">
                            {(['cashier', 'warehouse', 'rider', 'hr'] as const).map(role => (
                                <div key={role} className="grid gap-1.5">
                                    <Label className="capitalize">{role} (₱/day)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.data.pay_rates[role]}
                                        onChange={e => form.setData('pay_rates', {
                                            ...form.data.pay_rates,
                                            [role]: e.target.value,
                                        })}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Individual Rate Overrides (read-only display) */}
                    {staff_rates.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Individual Rate Overrides</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-2">Staff</th>
                                            <th className="px-4 py-2">Role</th>
                                            <th className="px-4 py-2 text-right">Override Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {staff_rates.map(s => (
                                            <tr key={s.id}>
                                                <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                                                <td className="px-4 py-2 capitalize text-gray-500">{s.sub_role}</td>
                                                <td className="px-4 py-2 text-right font-semibold text-blue-700">
                                                    ₱{Number(s.daily_rate_override).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="px-4 py-2 text-xs text-gray-400">
                                    Edit individual overrides from the Staff page → staff profile.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" disabled={form.processing}>
                            Save Settings
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
