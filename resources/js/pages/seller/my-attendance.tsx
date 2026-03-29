import { Head, useForm, usePage } from '@inertiajs/react';
import { CalendarDays, Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { Spinner } from '@/components/ui/spinner';
import type { BreadcrumbItem, SharedData } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type AttendanceToday = {
    id: number;
    clock_in: string | null;   // formatted "hh:mm AM/PM"
    clock_out: string | null;
    status: 'present' | 'late' | 'absent' | 'half_day' | 'day_off';
    hours_worked: number;
    overtime_hours: number;
} | null;

type HistoryRow = {
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string;
};

type Props = {
    today: string;
    schedule_start: string | null;
    schedule_end: string | null;
    attendance: AttendanceToday;
    history: HistoryRow[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    present:  'Present',
    late:     'Late',
    absent:   'Absent',
    half_day: 'Half Day',
    day_off:  'Day Off',
};

const STATUS_STYLE: Record<string, string> = {
    present:  'bg-emerald-100 text-emerald-700',
    late:     'bg-yellow-100 text-yellow-700',
    absent:   'bg-red-100 text-red-700',
    half_day: 'bg-orange-100 text-orange-700',
    day_off:  'bg-gray-100 text-gray-500',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSchedule(start: string | null, end: string | null): string {
    if (!start || !end) return 'No schedule set';
    const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    return `${fmt(start)} – ${fmt(end)}`;
}

function fmtHours(h: number): string {
    if (h === 0) return '0h';
    const hrs  = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MyAttendancePage({ today, schedule_start, schedule_end, attendance, history }: Props) {
    const { auth } = usePage<SharedData>().props;
    const isRider   = auth.user.role === 'rider'
        || (auth.user.role === 'seller_staff' && (auth.user as any).sub_role === 'rider');

    const clockInBase  = isRider ? '/rider/my-attendance' : '/seller/my-attendance';
    const clockOutBase = clockInBase;

    const clockInForm  = useForm({});
    const clockOutForm = useForm({});

    const breadcrumbs: BreadcrumbItem[] = [
        { title: isRider ? 'Deliveries' : 'Dashboard', href: isRider ? '/rider/deliveries' : '/seller/dashboard' },
        { title: 'My Attendance', href: `${clockInBase}` },
    ];

    const hasClockIn  = !!attendance?.clock_in;
    const hasClockOut = !!attendance?.clock_out;
    const isDone      = hasClockIn && hasClockOut;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Attendance" />

            <div className="flex flex-1 flex-col gap-6 p-6 max-w-2xl mx-auto w-full">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays className="h-6 w-6 text-blue-600" />
                        My Attendance
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">{today}</p>
                </div>

                {/* Today's card */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-600" />
                            Today's Record
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                        {/* Schedule */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Scheduled Hours</span>
                            <span className="font-medium text-gray-800">{fmtSchedule(schedule_start, schedule_end)}</span>
                        </div>

                        {/* Status */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Status</span>
                            <StatusBadge status={attendance?.status ?? 'absent'} />
                        </div>

                        {/* Clock times */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-lg border bg-gray-50 p-4 text-center">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Clock In</p>
                                <p className={`text-xl font-bold ${hasClockIn ? 'text-emerald-700' : 'text-gray-300'}`}>
                                    {attendance?.clock_in ?? '—'}
                                </p>
                            </div>
                            <div className="rounded-lg border bg-gray-50 p-4 text-center">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Clock Out</p>
                                <p className={`text-xl font-bold ${hasClockOut ? 'text-blue-700' : 'text-gray-300'}`}>
                                    {attendance?.clock_out ?? '—'}
                                </p>
                            </div>
                        </div>

                        {/* Hours summary */}
                        {hasClockOut && (
                            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm">
                                <span className="text-blue-700 font-medium">Total Hours Worked</span>
                                <span className="text-blue-900 font-bold">{fmtHours(attendance?.hours_worked ?? 0)}</span>
                                {(attendance?.overtime_hours ?? 0) > 0 && (
                                    <span className="text-orange-600 font-medium text-xs ml-2">
                                        +{fmtHours(attendance?.overtime_hours ?? 0)} OT
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Action button */}
                        <div className="flex justify-center pt-1">
                            {isDone ? (
                                <div className="text-center text-sm text-gray-500 italic">
                                    Shift complete. See you tomorrow!
                                </div>
                            ) : !hasClockIn ? (
                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-8"
                                    disabled={clockInForm.processing}
                                    onClick={() => clockInForm.post(`${clockInBase}/clock-in`, { preserveScroll: true })}
                                >
                                    {clockInForm.processing ? <Spinner className="mr-1" /> : <LogIn className="h-4 w-4" />}
                                    Clock In
                                </Button>
                            ) : (
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-8"
                                    disabled={clockOutForm.processing}
                                    onClick={() => clockOutForm.post(`${clockOutBase}/clock-out`, { preserveScroll: true })}
                                >
                                    {clockOutForm.processing ? <Spinner className="mr-1" /> : <LogOut className="h-4 w-4" />}
                                    Clock Out
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent history */}
                {history.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-blue-600" />
                                Recent History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2 text-center">Clock In</th>
                                        <th className="px-4 py-2 text-center">Clock Out</th>
                                        <th className="px-4 py-2 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {history.map((h, i) => (
                                        <tr key={i} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2 text-gray-700">{h.date}</td>
                                            <td className="px-4 py-2 text-center font-mono text-xs text-emerald-700">
                                                {h.clock_in ?? '—'}
                                            </td>
                                            <td className="px-4 py-2 text-center font-mono text-xs text-blue-700">
                                                {h.clock_out ?? '—'}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[h.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                                    {STATUS_LABEL[h.status] ?? h.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
