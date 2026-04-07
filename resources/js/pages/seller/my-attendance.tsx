import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    Clock,
    Loader2,
    LogIn,
    LogOut,
    MapPin,
    Navigation,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type StoreLocation = {
    latitude: number;
    longitude: number;
    radius: number;
};

type AttendanceToday = {
    id: number;
    clock_in: string | null;
    clock_out: string | null;
    status: 'present' | 'late' | 'absent' | 'half_day' | 'day_off' | 'undertime' | 'no_schedule';
    is_late: boolean;
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
    store_location: StoreLocation | null;
};

type LocStatus = 'loading' | 'granted' | 'denied' | 'unavailable';

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R    = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dphi = ((lat2 - lat1) * Math.PI) / 180;
    const dlam = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtSchedule(start: string | null, end: string | null): string {
    if (!start || !end) return 'No schedule set';
    const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    return `${fmt(start)} – ${fmt(end)}`;
}

function fmtHours(h: number, hasClockOut = false): string {
    if (h === 0) return hasClockOut ? '< 1m' : '0h';
    const hrs  = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
}

function liveHoursWorked(clockInStr: string): number {
    const match = clockInStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return 0;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
    const now = new Date();
    const clockIn = new Date(now);
    clockIn.setHours(h, m, 0, 0);
    return Math.max(0, (now.getTime() - clockIn.getTime()) / 3_600_000);
}

function fmtDistance(m: number): string {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m)} m`;
}

// ── Leaflet icon setup ─────────────────────────────────────────────────────────

function makeIcon(color: string) {
    return L.divIcon({
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.45)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

// ── Map auto-fit ───────────────────────────────────────────────────────────────

function MapFitter({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const fitted = useRef(false);
    useEffect(() => {
        if (!fitted.current && positions.length > 1) {
            map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
            fitted.current = true;
        } else if (!fitted.current && positions.length === 1) {
            map.setView(positions[0], 16);
            fitted.current = true;
        }
    }, [map, positions]);
    return null;
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

export default function MyAttendancePage({
    today,
    schedule_start,
    schedule_end,
    attendance,
    history,
    store_location,
}: Props) {
    const { auth } = usePage<SharedData>().props;
    const isRider = auth.user.role === 'rider'
        || (auth.user.role === 'seller_staff' && (auth.user as any).sub_role === 'rider');

    const clockBase = isRider ? '/rider/my-attendance' : '/seller/my-attendance';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: isRider ? 'Deliveries' : 'Dashboard', href: isRider ? '/rider/deliveries' : '/seller/dashboard' },
        { title: 'My Attendance', href: clockBase },
    ];

    // ── Geolocation state ────────────────────────────────────────────────────
    const [myCoords, setMyCoords]   = useState<{ lat: number; lng: number } | null>(null);
    const [locStatus, setLocStatus] = useState<LocStatus>('loading');

    useEffect(() => {
        if (!navigator.geolocation) {
            setLocStatus('unavailable');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocStatus('granted');
            },
            () => setLocStatus('denied'),
            { timeout: 10000, maximumAge: 60000 },
        );
    }, []);

    // ── Distance computation ─────────────────────────────────────────────────
    const distance: number | null = useMemo(() => {
        if (!myCoords || !store_location) return null;
        return haversineMeters(myCoords.lat, myCoords.lng, store_location.latitude, store_location.longitude);
    }, [myCoords, store_location]);

    // Within radius: allow if no store location, or coords not yet received, or within range
    const withinRadius = !store_location || locStatus === 'loading' || (distance !== null && distance <= store_location.radius);

    // ── Submission ───────────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
    const [showClockInConfirm,  setShowClockInConfirm]  = useState(false);
    const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

    function submitClockIn() {
        setSubmitting('in');
        router.post(`${clockBase}/clock-in`, {
            latitude:  myCoords?.lat ?? null,
            longitude: myCoords?.lng ?? null,
        }, {
            preserveScroll: true,
            onFinish: () => setSubmitting(null),
        });
    }

    function submitClockOut() {
        setSubmitting('out');
        router.post(`${clockBase}/clock-out`, {
            latitude:  myCoords?.lat ?? null,
            longitude: myCoords?.lng ?? null,
        }, {
            preserveScroll: true,
            onFinish: () => setSubmitting(null),
        });
    }

    // ── Map data ─────────────────────────────────────────────────────────────
    const storeIcon = useMemo(() => makeIcon('#ef4444'), []);
    const myIcon    = useMemo(() => makeIcon('#3b82f6'), []);

    const mapPositions: [number, number][] = useMemo(() => {
        const pts: [number, number][] = [];
        if (store_location) pts.push([store_location.latitude, store_location.longitude]);
        if (myCoords)       pts.push([myCoords.lat, myCoords.lng]);
        return pts;
    }, [store_location, myCoords]);

    const hasClockIn  = !!attendance?.clock_in;
    const hasClockOut = !!attendance?.clock_out;
    const isDone      = hasClockIn && hasClockOut;

    const clockInBlocked = locStatus === 'denied' || (!withinRadius && !!store_location);

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

                {/* Clock-in reminder banner */}
                {!attendance?.clock_in && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                        <span>You haven't clocked in yet today! Please clock in below to record your attendance.</span>
                    </div>
                )}

                {/* Location Status Card — always shown */}
                {!isDone && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Navigation className="h-4 w-4 text-blue-600" />
                                Your Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Map (only when we have at least one pin to show) */}
                            {(store_location || myCoords) && (
                                <div className="rounded-lg overflow-hidden border border-gray-200 h-48">
                                    <MapContainer
                                        center={store_location
                                            ? [store_location.latitude, store_location.longitude]
                                            : [myCoords!.lat, myCoords!.lng]}
                                        zoom={15}
                                        style={{ height: '100%', width: '100%' }}
                                        zoomControl={false}
                                        scrollWheelZoom={false}
                                        dragging={false}
                                        doubleClickZoom={false}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        {store_location && (
                                            <>
                                                <Marker position={[store_location.latitude, store_location.longitude]} icon={storeIcon} />
                                                <Circle
                                                    center={[store_location.latitude, store_location.longitude]}
                                                    radius={store_location.radius}
                                                    pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1.5 }}
                                                />
                                            </>
                                        )}
                                        {myCoords && (
                                            <Marker position={[myCoords.lat, myCoords.lng]} icon={myIcon} />
                                        )}
                                        <MapFitter positions={mapPositions} />
                                    </MapContainer>
                                </div>
                            )}

                            {/* Legend */}
                            {(store_location || myCoords) && (
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                    {store_location && (
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm" /> Store
                                        </span>
                                    )}
                                    {myCoords && (
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm" /> You
                                        </span>
                                    )}
                                    {store_location && (
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block w-3 h-3 rounded-full border border-blue-400 bg-blue-100" /> {store_location.radius}m radius
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Status messages */}
                            {locStatus === 'loading' && (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Getting your location…
                                </div>
                            )}
                            {locStatus === 'unavailable' && (
                                <div className="flex items-start gap-2 text-sm text-red-700">
                                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    Geolocation is not supported by your browser.
                                </div>
                            )}
                            {locStatus === 'denied' && (
                                <div className="flex items-start gap-2 text-sm text-red-700">
                                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    Location access denied. Please enable location in your browser settings and reload the page.
                                </div>
                            )}
                            {locStatus === 'granted' && !store_location && (
                                <div className="flex items-start gap-2 text-sm text-blue-700">
                                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                    Location captured. No store pin configured — ask your owner to set it in Settings. Clock in is allowed.
                                </div>
                            )}
                            {locStatus === 'granted' && store_location && distance !== null && (
                                <div className={`flex items-center gap-2 text-sm font-medium ${withinRadius ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {withinRadius
                                        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        : <XCircle className="h-4 w-4 shrink-0" />
                                    }
                                    {withinRadius
                                        ? `✓ You are ${fmtDistance(distance)} from the store — within range`
                                        : `✗ You are ${fmtDistance(distance)} from the store — must be within ${fmtDistance(store_location.radius)}`
                                    }
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

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
                            <div className="flex flex-col items-end gap-0.5">
                                <StatusBadge status={attendance?.status ?? 'absent'} />
                                {attendance?.is_late && attendance?.status !== 'late' && (
                                    <span className="text-xs text-yellow-600 font-medium">Late arrival</span>
                                )}
                            </div>
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
                        {hasClockIn && (
                            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm">
                                <span className="text-blue-700 font-medium">
                                    {hasClockOut ? 'Total Hours Worked' : 'Hours Worked (so far)'}
                                </span>
                                <span className="text-blue-900 font-bold">
                                    {hasClockOut
                                        ? fmtHours(attendance?.hours_worked ?? 0, true)
                                        : <span className="text-amber-700">{fmtHours(liveHoursWorked(attendance!.clock_in!))}~</span>
                                    }
                                </span>
                                {hasClockOut && (attendance?.overtime_hours ?? 0) > 0 && (
                                    <span className="text-orange-600 font-medium text-xs ml-2">
                                        +{fmtHours(attendance?.overtime_hours ?? 0)} OT
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Action button */}
                        <div className="flex justify-center pt-1">
                            {!schedule_start || !schedule_end ? (
                                <div className="text-center text-sm text-gray-500 italic px-4">
                                    Cannot clock in — no schedule assigned. Contact your manager.
                                </div>
                            ) : isDone ? (
                                <div className="text-center text-sm text-gray-500 italic">
                                    Shift complete. See you tomorrow!
                                </div>
                            ) : !hasClockIn ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-8 disabled:opacity-50"
                                        disabled={submitting !== null || clockInBlocked}
                                        onClick={() => setShowClockInConfirm(true)}
                                    >
                                        {submitting === 'in'
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <LogIn className="h-4 w-4" />
                                        }
                                        Clock In
                                    </Button>
                                    {clockInBlocked && locStatus === 'denied' && (
                                        <p className="text-xs text-red-600 text-center">Enable location access to clock in</p>
                                    )}
                                    {clockInBlocked && !withinRadius && store_location && (
                                        <p className="text-xs text-red-600 text-center">
                                            Move closer to the store ({fmtDistance(store_location.radius)} radius)
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-8"
                                    disabled={submitting !== null}
                                    onClick={() => setShowClockOutConfirm(true)}
                                >
                                    {submitting === 'out'
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <LogOut className="h-4 w-4" />
                                    }
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

            {/* Clock In Confirmation */}
            <AlertDialog open={showClockInConfirm} onOpenChange={setShowClockInConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clock In?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {store_location && distance !== null
                                ? `You are ${fmtDistance(distance)} from the store. Confirm clock-in?`
                                : 'You are about to clock in. Confirm?'
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => { setShowClockInConfirm(false); submitClockIn(); }}
                            disabled={submitting !== null}
                        >
                            Clock In
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Clock Out Confirmation */}
            <AlertDialog open={showClockOutConfirm} onOpenChange={setShowClockOutConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clock Out?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {(() => {
                                const worked = attendance?.clock_in ? liveHoursWorked(attendance.clock_in) : 0;
                                const hrs  = Math.floor(worked);
                                const mins = Math.round((worked - hrs) * 60);
                                const label = hrs > 0
                                    ? `${hrs}h ${mins}m`
                                    : `${mins} minute${mins !== 1 ? 's' : ''}`;
                                return worked < 8
                                    ? `You have worked ${label} (less than 8h). Your pay will be proportionally deducted for undertime. Continue?`
                                    : `You have worked ${label}. Ready to clock out?`;
                            })()}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => { setShowClockOutConfirm(false); submitClockOut(); }}
                            disabled={submitting !== null}
                        >
                            Clock Out
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
