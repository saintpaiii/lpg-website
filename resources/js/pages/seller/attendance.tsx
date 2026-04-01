import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    CalendarDays,
    Clock,
    ClockArrowDown,
    ClockArrowUp,
    FileDown,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type AttendanceRow = {
    user_id: number;
    name: string;
    sub_role: string;
    schedule_start: string | null;
    schedule_end: string | null;
    attendance_id: number | null;
    clock_in: string | null;   // "h:ii A" formatted
    clock_out: string | null;
    status: 'present' | 'late' | 'absent' | 'half_day' | 'day_off' | 'undertime' | 'no_schedule';
    is_late: boolean;
    hours_worked: number;
    overtime_hours: number;
    notes: string | null;
    missing_clock_out: boolean;
};

type Summary = {
    total: number;
    present: number;
    late: number;
    absent: number;
    half_day: number;
    day_off: number;
};

type Props = {
    rows: AttendanceRow[];
    date: string;
    summary: Summary;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Attendance', href: '/seller/attendance' },
];

const STATUS_LABEL: Record<string, string> = {
    present:     'Present',
    late:        'Late',
    absent:      'Absent',
    half_day:    'Half Day',
    day_off:     'Day Off',
    undertime:   'Undertime',
    no_schedule: 'No Schedule',
};

const STATUS_STYLE: Record<string, string> = {
    present:     'bg-emerald-100 text-emerald-700',
    late:        'bg-yellow-100 text-yellow-700',
    absent:      'bg-red-100 text-red-700',
    half_day:    'bg-orange-100 text-orange-700',
    day_off:     'bg-gray-100 text-gray-500',
    undertime:   'bg-rose-100 text-rose-700',
    no_schedule: 'bg-gray-100 text-gray-400',
};

const SUB_ROLE_LABELS: Record<string, string> = {
    cashier:   'Cashier',
    warehouse: 'Warehouse',
    rider:     'Rider',
    hr:        'HR',
};

const SUB_ROLE_STYLES: Record<string, string> = {
    cashier:   'bg-emerald-100 text-emerald-700',
    warehouse: 'bg-amber-100 text-amber-700',
    rider:     'bg-blue-100 text-blue-700',
    hr:        'bg-purple-100 text-purple-700',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSchedule(start: string | null, end: string | null): string {
    if (!start || !end) return '—';
    const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    return `${fmt(start)} – ${fmt(end)}`;
}

function fmtHours(h: number, hasClockOut = false): string {
    if (h === 0) return hasClockOut ? '< 1m' : '—';
    const hrs  = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
}

/** Parse "8:30 AM" into decimal hours elapsed since then (today). */
function liveHoursWorked(clockInStr: string): number {
    const match = clockInStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return 0;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const now = new Date();
    const clockIn = new Date(now);
    clockIn.setHours(h, m, 0, 0);
    const diffMs = now.getTime() - clockIn.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

function RoleBadge({ role }: { role: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUB_ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
            {SUB_ROLE_LABELS[role] ?? role}
        </span>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Card>
            <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
        </Card>
    );
}

// ── Clock-in / Clock-out forms ─────────────────────────────────────────────────

function ClockInButton({ row, date }: { row: AttendanceRow; date: string }) {
    const { post, processing } = useForm({ user_id: row.user_id, date });
    return (
        <Button
            size="sm"
            disabled={processing}
            onClick={() => post('/seller/attendance/clock-in', { preserveScroll: true })}
            className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2"
        >
            <ClockArrowUp className="h-3 w-3" />
            Clock In
        </Button>
    );
}

function ClockOutButton({ row, date }: { row: AttendanceRow; date: string }) {
    const { post, processing } = useForm({ user_id: row.user_id, date });
    return (
        <Button
            size="sm"
            disabled={processing}
            onClick={() => post('/seller/attendance/clock-out', { preserveScroll: true })}
            className="h-7 gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2"
        >
            <ClockArrowDown className="h-3 w-3" />
            Clock Out
        </Button>
    );
}

function SetClockOutDialog({ row, date, onClose }: { row: AttendanceRow; date: string; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        user_id:   row.user_id,
        date,
        clock_out: '',
    });
    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Set Clock-Out for {row.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                    <p className="text-sm text-gray-500">
                        This staff member has no clock-out for <strong>{date}</strong>. Enter the correct clock-out time.
                    </p>
                    <div className="grid gap-1.5">
                        <Label htmlFor="clock_out_time">Clock-Out Time</Label>
                        <input
                            id="clock_out_time"
                            type="time"
                            value={data.clock_out}
                            onChange={(e) => setData('clock_out', e.target.value)}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {errors.clock_out && <p className="text-xs text-red-500">{errors.clock_out}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={processing || !data.clock_out}
                        onClick={() => post('/seller/attendance/set-clock-out', { preserveScroll: true, onSuccess: onClose })}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        Save Clock-Out
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AttendancePage({ rows, date, summary }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canManage = auth.user.role === 'seller'
        || (auth.user.role === 'seller_staff' && (auth.user as any).sub_role === 'hr');

    const today   = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const isToday = date === today;

    const [setClockOutTarget, setSetClockOutTarget] = useState<AttendanceRow | null>(null);

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        router.get('/seller/attendance', { date: e.target.value }, { preserveState: false });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Attendance" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <CalendarDays className="h-6 w-6 text-blue-600" />
                            Attendance
                        </h1>
                        <p className="mt-0.5 text-sm text-gray-500">Track staff clock-in and clock-out for your store.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-sm font-medium text-gray-600">Date</label>
                        <input
                            type="date"
                            value={date}
                            max={today}
                            onChange={handleDateChange}
                            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <a href={`/seller/attendance/export?format=csv&date=${date}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/attendance/export?format=pdf&date=${date}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                    <SummaryCard label="Total Staff" value={summary.total}    color="text-gray-800" />
                    <SummaryCard label="Present"     value={summary.present}  color="text-emerald-600" />
                    <SummaryCard label="Late"        value={summary.late}     color="text-yellow-600" />
                    <SummaryCard label="Absent"      value={summary.absent}   color="text-red-600" />
                    <SummaryCard label="Half Day"    value={summary.half_day} color="text-orange-600" />
                    <SummaryCard label="Day Off"     value={summary.day_off}  color="text-gray-400" />
                </div>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            Staff Attendance
                            <span className="ml-auto text-sm font-normal text-gray-400">{summary.total} staff</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {rows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Users className="mb-3 h-10 w-10" />
                                <p className="font-medium">No active staff found</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Staff</th>
                                            <th className="px-4 py-3">Schedule</th>
                                            <th className="px-4 py-3 text-center">Clock In</th>
                                            <th className="px-4 py-3 text-center">Clock Out</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-center">Hours</th>
                                            <th className="px-4 py-3 text-center">OT</th>
                                            {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map((row) => (
                                            <tr key={row.user_id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900">{row.name}</p>
                                                    <div className="mt-0.5">
                                                        <RoleBadge role={row.sub_role} />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                    {fmtSchedule(row.schedule_start, row.schedule_end)}
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-mono">
                                                    {row.clock_in ? (
                                                        <span className="text-emerald-700 font-medium">{row.clock_in}</span>
                                                    ) : (
                                                        <span className="text-gray-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-mono">
                                                    {row.clock_out ? (
                                                        <span className="text-blue-700 font-medium">{row.clock_out}</span>
                                                    ) : (
                                                        <span className="text-gray-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <StatusBadge status={row.status} />
                                                        {row.is_late && row.status !== 'late' && (
                                                            <span className="text-xs text-yellow-600 font-medium">Late arrival</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs text-gray-600">
                                                    {row.clock_in && !row.clock_out && isToday
                                                        ? <span className="text-amber-600 font-medium">{fmtHours(liveHoursWorked(row.clock_in))}~</span>
                                                        : <span>{fmtHours(row.hours_worked, !!row.clock_out)}</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs">
                                                    {row.overtime_hours > 0 ? (
                                                        <span className="text-orange-600 font-medium">{fmtHours(row.overtime_hours)}</span>
                                                    ) : (
                                                        <span className="text-gray-300">—</span>
                                                    )}
                                                </td>
                                                {canManage && (
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-1 flex-wrap">
                                                            {isToday && !row.clock_in && row.schedule_start && row.schedule_end && (
                                                                <ClockInButton row={row} date={date} />
                                                            )}
                                                            {isToday && !row.clock_in && (!row.schedule_start || !row.schedule_end) && (
                                                                <span className="text-xs text-gray-400 italic">No schedule</span>
                                                            )}
                                                            {isToday && row.clock_in && !row.clock_out && !row.missing_clock_out && (
                                                                <ClockOutButton row={row} date={date} />
                                                            )}
                                                            {row.missing_clock_out && (
                                                                <>
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5">
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Missing Clock Out
                                                                    </span>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => setSetClockOutTarget(row)}
                                                                        className="h-7 text-xs px-2"
                                                                    >
                                                                        Set Clock Out
                                                                    </Button>
                                                                </>
                                                            )}
                                                            {row.clock_in && row.clock_out && (
                                                                <span className="text-xs text-gray-400 italic">Done</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Missing Clock Out note */}
                {canManage && (
                    <p className="text-xs text-gray-400 italic text-center">
                        Staff who forget to clock out will show a "Missing Clock Out" badge 1 hour after their scheduled end. The owner/HR must set their clock-out time manually.
                    </p>
                )}
            </div>

            {/* Set Clock Out Dialog */}
            {setClockOutTarget && (
                <SetClockOutDialog
                    row={setClockOutTarget}
                    date={date}
                    onClose={() => setSetClockOutTarget(null)}
                />
            )}
        </AppLayout>
    );
}
