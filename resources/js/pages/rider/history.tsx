import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Camera,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    History,
    MapPin,
} from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Delivery History', href: '/rider/history' }];

// ── Types ───────────────────────────────────────────────────────────────────────

type Proof = {
    status: string;
    photo_url: string | null;
    notes: string | null;
    location_note: string | null;
    created_at: string;
};

type DeliveryRow = {
    id: number;
    status: 'delivered' | 'failed';
    delivered_at: string | null;
    assigned_at: string | null;
    notes: string | null;
    order: {
        id: number;
        order_number: string;
        total_amount: number;
        customer: {
            name: string;
            address: string | null;
            barangay: string | null;
            city: string | null;
        } | null;
    } | null;
    proofs: Proof[];
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    deliveries: Paginated<DeliveryRow>;
    totals: { delivered: number; failed: number };
};

// ── Proof Status Helpers ────────────────────────────────────────────────────────

const PROOF_LABELS: Record<string, string> = {
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

const PROOF_DOT: Record<string, string> = {
    picked_up:  'bg-indigo-500',
    in_transit: 'bg-purple-500',
    delivered:  'bg-emerald-500',
    failed:     'bg-red-500',
};

// ── Proof Timeline ──────────────────────────────────────────────────────────────

function ProofTimeline({ proofs }: { proofs: Proof[] }) {
    const [lightbox, setLightbox] = useState<string | null>(null);

    if (proofs.length === 0) {
        return (
            <p className="px-4 pb-4 text-sm text-muted-foreground italic">
                No proof photos were submitted for this delivery.
            </p>
        );
    }

    return (
        <div className="border-t px-4 pb-4 pt-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery Updates
            </p>
            <ol className="relative border-l border-gray-200 pl-5 space-y-4">
                {proofs.map((p, i) => (
                    <li key={i} className="relative">
                        <span className={`absolute -left-[1.3125rem] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${PROOF_DOT[p.status] ?? 'bg-blue-500'}`} />
                        <div className="grid gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">
                                    {PROOF_LABELS[p.status] ?? p.status}
                                </span>
                                <span className="text-xs text-muted-foreground">{p.created_at}</span>
                            </div>
                            {p.location_note && (
                                <p className="flex items-center gap-1 text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {p.location_note}
                                </p>
                            )}
                            {p.notes && (
                                <p className="text-xs text-gray-500 italic">"{p.notes}"</p>
                            )}
                            {p.photo_url && (
                                <button
                                    type="button"
                                    onClick={() => setLightbox(p.photo_url!)}
                                    className="group relative mt-1 w-28 h-20 overflow-hidden rounded-md border hover:opacity-90 transition-opacity"
                                >
                                    <img src={p.photo_url} alt="Proof" className="h-full w-full object-cover" />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                        <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                                    </span>
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ol>

            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={lightbox}
                        alt="Delivery proof"
                        className="max-h-[90vh] max-w-full rounded-lg object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

// ── Pagination ──────────────────────────────────────────────────────────────────

function Pagination({ data, onVisit }: { data: Paginated<any>; onVisit: (url: string) => void }) {
    if (data.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
                Showing {data.from}–{data.to} of {data.total}
            </p>
            <div className="flex gap-1">
                {data.links.map((link, i) => (
                    <button
                        key={i}
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url!)}
                        className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                            link.active
                                ? 'bg-blue-600 text-white'
                                : link.url
                                ? 'hover:bg-gray-100 text-gray-600'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function RiderHistory({ deliveries, totals }: Props) {
    const [expanded, setExpanded] = useState<number | null>(null);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Delivery History" />

            <div className="flex flex-col gap-6 p-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Delivery History</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">All your completed and failed deliveries.</p>
                </div>

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Delivered</CardTitle>
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totals.delivered}</div>
                            <p className="text-xs text-muted-foreground">All time</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Failed Deliveries</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totals.failed}</div>
                            <p className="text-xs text-muted-foreground">All time</p>
                        </CardContent>
                    </Card>
                </div>

                {/* List */}
                {deliveries.data.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <History className="mb-3 h-10 w-10" />
                            <p className="font-medium">No delivery history yet</p>
                            <p className="mt-1 text-sm">Completed and failed deliveries will appear here.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {deliveries.data.map((d) => {
                            const isExpanded = expanded === d.id;
                            const isDelivered = d.status === 'delivered';

                            return (
                                <Card key={d.id} className="overflow-hidden">
                                    {/* Row */}
                                    <div
                                        className="flex cursor-pointer items-start gap-3 p-4 hover:bg-gray-50/60"
                                        onClick={() => setExpanded(isExpanded ? null : d.id)}
                                    >
                                        {/* Status icon */}
                                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isDelivered ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                            {isDelivered
                                                ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                                                : <AlertTriangle className="h-4 w-4 text-red-600" />
                                            }
                                        </div>

                                        {/* Info */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm font-semibold text-blue-600">
                                                    {d.order?.order_number ?? '—'}
                                                </span>
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isDelivered ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {isDelivered ? 'Delivered' : 'Failed'}
                                                </span>
                                                {d.proofs.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Camera className="h-3 w-3" />
                                                        {d.proofs.length} update{d.proofs.length !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 font-medium text-gray-900">
                                                {d.order?.customer?.name ?? '—'}
                                            </p>
                                            {d.order?.customer && (
                                                <p className="mt-0.5 text-xs text-gray-400">
                                                    {[d.order.customer.address, d.order.customer.barangay, d.order.customer.city].filter(Boolean).join(', ') || '—'}
                                                </p>
                                            )}
                                            <p className="mt-1 text-xs text-gray-400">
                                                {isDelivered ? 'Delivered' : 'Failed'}: {d.delivered_at ?? '—'}
                                            </p>
                                            {!isDelivered && d.notes && (
                                                <p className="mt-1 text-xs text-red-500 italic">"{d.notes}"</p>
                                            )}
                                        </div>

                                        {/* Amount + expand toggle */}
                                        <div className="flex shrink-0 flex-col items-end gap-2">
                                            <span className="font-semibold tabular-nums text-gray-900">
                                                ₱{(d.order?.total_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </span>
                                            {isExpanded
                                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            }
                                        </div>
                                    </div>

                                    {/* Proof timeline */}
                                    {isExpanded && <ProofTimeline proofs={d.proofs} />}
                                </Card>
                            );
                        })}
                    </div>
                )}

                <Pagination
                    data={deliveries}
                    onVisit={(url) => router.visit(url)}
                />
            </div>
        </AppLayout>
    );
}
