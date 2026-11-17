import { router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { LayoutGrid, Map as MapIcon, MessageSquare, Phone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEchoPrivate } from '@/lib/echo';
import { OSM_ATTRIBUTION, OSM_TILES, PIN_COLORS, pinIcon, type LatLng } from '@/lib/map';
import type { SharedData } from '@/types';

/** RiderStatusService::board() row (J6) */
export type BoardRider = {
    id: number;
    name: string;
    full_name: string;
    initials: string;
    avatar_url: string | null;
    phone: string | null;
    status: 'off_shift' | 'available' | 'on_delivery' | 'returning' | 'no_gps';
    status_label: string;
    vehicle: { id: number; type: string; label: string; plate: string } | null;
    load: { kg: number; tanks: number; max_kg: number; max_tanks: number } | null;
    stops: { delivery_id: number; order_id: number; order_number: string | null; customer: string | null; status: string; lat: number | null; lng: number | null }[];
    current_stop: string | null;
    position: { lat: number; lng: number } | null;
    last_seen_at: string | null;
    last_seen: string | null;
};

const COLORS: Record<BoardRider['status'], string> = {
    available: '#16a34a',
    on_delivery: '#2563eb',
    returning: '#7c3aed',
    no_gps: '#dc2626',
    off_shift: '#6b7280',
};
const CHIP: Record<BoardRider['status'], string> = {
    available: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    on_delivery: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    returning: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    no_gps: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    off_shift: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

function ago(iso: string | null): string {
    if (!iso) return 'never';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
}

function Fit({ points }: { points: LatLng[] }) {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 14);
        else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return null;
}

/**
 * Seller Deliveries → "Riders" (J6): a status board and a live map (toggle). Positions move live through
 * RiderLocationUpdated on the store channel; without realtime the board polls /seller/deliveries/riders-live every
 * 30 s while the tab is visible.
 */
export default function RiderBoard({ initial, storePin, realtime }: { initial: BoardRider[]; storePin: { lat: number; lng: number; name: string } | null; realtime: boolean }) {
    const [riders, setRiders] = useState<BoardRider[]>(initial);
    const [view, setView] = useState<'board' | 'map'>('board');
    const storeId = (usePage<SharedData>().props.auth.user as { store_id?: number | null }).store_id ?? null;

    useEffect(() => setRiders(initial), [initial]);

    // Polling fallback (realtime off): every 30 s, only while the tab is visible
    useEffect(() => {
        if (realtime) return;
        const load = () => { if (document.visibilityState === 'visible') axios.get<{ riders: BoardRider[] }>('/seller/deliveries/riders-live').then((r) => setRiders(r.data.riders)).catch(() => {}); };
        const t = setInterval(load, 30_000);
        document.addEventListener('visibilitychange', load);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', load); };
    }, [realtime]);

    // Live positions (exact, store side)
    useEchoPrivate<{ rider_id: number; lat: number; lng: number; updated_at: string }>(storeId ? `store.${storeId}` : null, 'RiderLocationUpdated', (e) => {
        setRiders((rs) => rs.map((r) => (r.id === e.rider_id && r.status !== 'off_shift'
            ? { ...r, position: { lat: e.lat, lng: e.lng }, last_seen_at: e.updated_at, status: r.status === 'no_gps' ? 'on_delivery' : r.status, status_label: r.status === 'no_gps' ? 'On delivery' : r.status_label }
            : r)));
    });

    const points = useMemo<LatLng[]>(() => {
        const p: LatLng[] = [];
        if (storePin) p.push([storePin.lat, storePin.lng]);
        for (const r of riders) {
            if (r.position) p.push([r.position.lat, r.position.lng]);
            for (const s of r.stops) if (s.lat !== null && s.lng !== null) p.push([s.lat, s.lng]);
        }
        return p;
    }, [riders, storePin]);

    if (riders.length === 0) return null;
    const onShift = riders.filter((r) => r.status !== 'off_shift');

    return (
        <div className="rounded-xl border bg-white dark:bg-gray-900" data-testid="rider-board">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-sm font-semibold">Riders <span className="font-normal text-muted-foreground">· {onShift.length} on shift</span></p>
                <div className="inline-flex rounded-md border p-0.5 text-xs" role="tablist">
                    <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => setView('board')} className={`flex items-center gap-1 rounded px-2.5 py-1 ${view === 'board' ? 'bg-blue-600 text-white' : ''}`}><LayoutGrid className="h-3.5 w-3.5" /> Board</button>
                    <button type="button" role="tab" aria-selected={view === 'map'} onClick={() => setView('map')} className={`flex items-center gap-1 rounded px-2.5 py-1 ${view === 'map' ? 'bg-blue-600 text-white' : ''}`}><MapIcon className="h-3.5 w-3.5" /> Map</button>
                </div>
            </div>

            {view === 'board' ? (
                <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {riders.map((r) => {
                        const kgPct = r.load && r.load.max_kg > 0 ? Math.min(100, Math.round((r.load.kg / r.load.max_kg) * 100)) : 0;
                        return (
                            <div key={r.id} className="rounded-lg border p-3 text-sm" data-testid={`rider-card-${r.id}`} data-status={r.status}>
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: COLORS[r.status] }}>{r.initials || '?'}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold">{r.full_name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{r.vehicle ? `${r.vehicle.label} · ${r.vehicle.plate}` : 'No vehicle'}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[r.status]}`}>{r.status_label}</span>
                                </div>
                                {r.status !== 'off_shift' && r.load && (
                                    <div className="mt-2">
                                        <div className="h-1.5 overflow-hidden rounded bg-gray-100 dark:bg-gray-800"><div className="h-full bg-blue-500" style={{ width: `${kgPct}%` }} /></div>
                                        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{r.load.kg} / {r.load.max_kg} kg · {r.load.tanks} / {r.load.max_tanks} tanks</p>
                                    </div>
                                )}
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {r.stops.length > 0 && <>{r.stops.length} {r.stops.length === 1 ? 'stop' : 'stops'} · now: {r.current_stop ?? '—'} · </>}
                                    Last seen {ago(r.last_seen_at)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ height: 380 }} data-testid="rider-map">
                    {points.length === 0 ? (
                        <p className="p-6 text-center text-sm text-muted-foreground">No positions yet — riders appear once they share their location.</p>
                    ) : (
                        <MapContainer center={points[0]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
                            <Fit points={points} />
                            {storePin && <Marker position={[storePin.lat, storePin.lng]} icon={pinIcon(PIN_COLORS.store)}><Popup>{storePin.name}</Popup></Marker>}
                            {riders.map((r) => (
                                <span key={r.id}>
                                    {r.stops.filter((s) => s.lat !== null && s.lng !== null).map((s, i) => (
                                        <Marker key={s.delivery_id} position={[s.lat!, s.lng!]} icon={pinIcon(COLORS[r.status], i + 1)}>
                                            <Popup>{s.order_number} — {s.customer ?? 'Customer'}<br />Rider: {r.name}</Popup>
                                        </Marker>
                                    ))}
                                    {r.position && r.status !== 'off_shift' && (
                                        <Marker position={[r.position.lat, r.position.lng]} icon={pinIcon(COLORS[r.status], r.initials.slice(0, 2))}>
                                            <Popup>
                                                <div className="space-y-1 text-xs">
                                                    <p className="font-semibold">{r.full_name} — {r.status_label}</p>
                                                    {r.vehicle && <p>{r.vehicle.label} {r.vehicle.plate}</p>}
                                                    <p>{r.stops.length} {r.stops.length === 1 ? 'stop' : 'stops'}{r.stops.length ? `: ${r.stops.map((s) => s.order_number).join(', ')}` : ''}</p>
                                                    <p>Last seen {ago(r.last_seen_at)}</p>
                                                    <div className="flex gap-2 pt-1">
                                                        <button type="button" className="inline-flex items-center gap-1 text-blue-600 underline" onClick={() => router.post('/seller/messages/start', { rider_id: r.id })}><MessageSquare className="h-3 w-3" /> Message rider</button>
                                                        {r.phone && <a className="inline-flex items-center gap-1 text-blue-600 underline" href={`tel:${r.phone}`}><Phone className="h-3 w-3" /> Call</a>}
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )}
                                </span>
                            ))}
                        </MapContainer>
                    )}
                </div>
            )}
        </div>
    );
}
