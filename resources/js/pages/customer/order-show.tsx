import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { AlertTriangle, ArrowLeft, Banknote, Camera, Handshake, CheckCircle2, Circle, Clock, CreditCard, ExternalLink, Flag, Loader2, MapPin, RefreshCcw, Star, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import CustomerLayout from '@/layouts/customer-layout';
import TrackingCard from '@/components/tracking-card';
import { PriceBreakdownRows, type PriceBreakdown } from '@/components/price-breakdown';

type Payment = {
    id: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    paymongo_checkout_id: string;
    paymongo_payment_id: string | null;
    payment_method: string | null;
    paid_at: string | null;
};

const CANCEL_REASONS = [
    'Changed my mind',
    'Found a better price',
    'Ordered by mistake',
    'Delivery takes too long',
    'Want to change order details',
    'Other',
];

type StoreLocation = { lat: number; lng: number; name: string };

type Order = {
    id: number;
    order_number: string;
    store_id: number | null;
    store_name: string;
    status: string;
    store_location: StoreLocation | null;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    delivery_distance_km: number | null;
    estimated_delivery_minutes: number | null;
    transaction_type: string;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    payment_mode: 'full' | 'consignment' | 'cod';
    down_payment_amount: number | null;
    remaining_balance: number | null;
    balance_due_date: string | null;
    balance_days_remaining: number | null;
    is_overdue: boolean;
    shipping_fee: number | null;
    discount_amount: number;
    coupon_code: string | null;
    coupon_discount: number;
    refund_request: { id: number; status: string } | null;
    notes: string | null;
    cancellation_reason: string | null;
    cancellation_notes: string | null;
    cancelled_by: 'customer' | 'seller' | null;
    cancelled_at: string | null;
    ordered_at: string | null;
    delivered_at: string | null;
    created_at: string;
    rated_product_ids: number[];
    items: {
        id: number;
        product_id: number | null;
        quantity: number;
        unit_price: number;
        subtotal: number;
        product: { name: string; brand: string | null } | null;
    }[];
    delivery: {
        status: string;
        rider_name: string | null;
        assigned_at: string | null;
        proofs: {
            status: string;
            photo_url: string | null;
            notes: string | null;
            location_note: string | null;
            created_at: string;
        }[];
    } | null;
    invoice: {
        id: number;
        invoice_number: string;
        payment_status: string;
        paid_amount: number;
        due_date: string | null;
    } | null;
    payment: Payment | null;
};

type Props = { order: Order };

const ORDER_STEPS = [
    { key: 'pending',          label: 'Pending' },
    { key: 'confirmed',        label: 'Confirmed' },
    { key: 'preparing',        label: 'Preparing' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered',        label: 'Delivered' },
];

const STATUS_STYLES: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:        'bg-emerald-100 text-emerald-800',
    cancelled:        'bg-gray-100 text-gray-600',
};

const PAY_STYLES: Record<string, string> = {
    unpaid:     'bg-red-100 text-red-700',
    paid:       'bg-emerald-100 text-emerald-700',
    partial:    'bg-amber-100 text-amber-700',
    to_refund:  'bg-orange-100 text-orange-700',
    refunded:   'bg-gray-100 text-gray-600',
};

const PROOF_STATUS_COLORS: Record<string, string> = {
    picked_up:  'bg-indigo-500',
    in_transit: 'bg-purple-500',
    delivered:  'bg-emerald-500',
    failed:     'bg-red-500',
};

const PROOF_STATUS_LABELS: Record<string, string> = {
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

function DeliveryTimeline({ proofs }: { proofs: NonNullable<Order['delivery']>['proofs'] }) {
    const [lightbox, setLightbox] = useState<string | null>(null);

    if (proofs.length === 0) return null;

    return (
        <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery Updates</p>
            <ol className="relative border-l border-gray-200 pl-5 space-y-4">
                {proofs.map((p, i) => (
                    <li key={i} className="relative">
                        <span className={`absolute -left-[1.3125rem] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${PROOF_STATUS_COLORS[p.status] ?? 'bg-blue-500'}`} />
                        <div className="grid gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {PROOF_STATUS_LABELS[p.status] ?? p.status}
                                </span>
                                <span className="text-xs text-gray-400">{p.created_at}</span>
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
                                    className="group relative mt-1 w-24 h-16 overflow-hidden rounded-md border hover:opacity-90 transition-opacity"
                                >
                                    <img src={p.photo_url} alt="Delivery proof" className="h-full w-full object-cover" />
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

function StatusStepper({ status, order }: { status: string; order: Order }) {
    const isCancelled = status === 'cancelled';
    const currentIdx  = ORDER_STEPS.findIndex((s) => s.key === status);

    if (isCancelled) {
        return (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-1">
                <p className="text-sm text-red-700 font-medium">
                    This order was cancelled
                    {order.cancelled_by === 'customer' ? ' by you' : order.cancelled_by === 'seller' ? ' by the seller' : ''}.
                </p>
                {order.cancellation_reason && (
                    <p className="text-sm text-red-600">Reason: {order.cancellation_reason}</p>
                )}
                {order.cancellation_notes && (
                    <p className="text-xs text-red-500 italic">"{order.cancellation_notes}"</p>
                )}
                {order.cancelled_at && (
                    <p className="text-xs text-red-400">Cancelled at {order.cancelled_at}</p>
                )}
                {order.payment_status === 'paid' && (
                    <p className="text-xs text-amber-700 mt-1 pt-1 border-t border-red-200">
                        Your payment will be refunded by the seller.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center w-full overflow-x-auto pb-2">
            {ORDER_STEPS.map((step, idx) => {
                const done    = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none min-w-0">
                        <div className="flex flex-col items-center shrink-0">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                                done    ? 'border-emerald-500 bg-emerald-500' :
                                current ? 'border-blue-600 bg-blue-600' :
                                          'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                            }`}>
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                ) : current ? (
                                    <Clock className="h-4 w-4 text-white" />
                                ) : (
                                    <Circle className="h-4 w-4 text-gray-300" />
                                )}
                            </div>
                            <span className={`mt-1.5 text-xs font-medium text-center whitespace-nowrap ${
                                done || current ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 mb-5 min-w-[20px] ${done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Star selector (interactive, used in rating dialog) ──────────────────────

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className={`text-2xl leading-none transition-transform hover:scale-110 ${
                        (hovered || value) >= star ? 'text-amber-400' : 'text-gray-300'
                    }`}
                >
                    ★
                </button>
            ))}
        </div>
    );
}

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function OrderShow({ order, breakdown }: Props & { breakdown: PriceBreakdown }) {
    const canCancel = ['pending', 'confirmed'].includes(order.status) && order.payment_status !== 'paid';
    const hasActiveRefund = !!order.refund_request && ['pending', 'approved', 'processed'].includes(order.refund_request.status);
    const canRefund = order.status === 'delivered' && ['paid', 'partial'].includes(order.payment_status) && !hasActiveRefund;
    const grandTotal = order.total_amount + (order.shipping_fee ?? 0);
    const [cancelOpen,     setCancelOpen]      = useState(false);
    const [cancelReason,   setCancelReason]    = useState('');
    const [cancelNotes,    setCancelNotes]     = useState('');
    const [cancelling,     setCancelling]      = useState(false);
    const [payingBalance,  setPayingBalance]   = useState(false);

    const canPayBalance = order.payment_mode === 'consignment' && order.payment_status === 'partial';

    async function payBalance() {
        setPayingBalance(true);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(
                `/customer/orders/${order.id}/pay-balance`,
            );
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                toast.error(res.data.error ?? 'Could not start payment.');
                setPayingBalance(false);
            }
        } catch (err) {
            let msg = 'Could not start balance payment. Please try again.';
            if (axios.isAxiosError(err)) {
                msg = err.response?.data?.error ?? err.response?.data?.message ?? msg;
            }
            toast.error(msg);
            setPayingBalance(false);
        }
    }

    function submitCancel() {
        if (!cancelReason) return;
        setCancelling(true);
        router.post(`/customer/orders/${order.id}/cancel`, {
            cancellation_reason: cancelReason,
            cancellation_notes:  cancelNotes,
        }, {
            preserveScroll: true,
            onSuccess: () => { setCancelOpen(false); setCancelReason(''); setCancelNotes(''); },
            onError:   () => toast.error('Failed to cancel order. Please try again.'),
            onFinish:  () => setCancelling(false),
        });
    }

    // Rating state
    const [rateOpen, setRateOpen] = useState(false);
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [ratings, setRatings] = useState<Record<number, { rating: number; review: string }>>({});

    const unratedItems = order.items.filter(
        (i) => i.product_id !== null && !order.rated_product_ids.includes(i.product_id!)
    );
    const canRate = order.status === 'delivered' && unratedItems.length > 0;

    function openRateDialog() {
        const initial: Record<number, { rating: number; review: string }> = {};
        unratedItems.forEach((item) => {
            if (item.product_id) initial[item.product_id] = { rating: 0, review: '' };
        });
        setRatings(initial);
        setRateOpen(true);
    }

    function submitRatings() {
        const payload = Object.entries(ratings)
            .filter(([, v]) => v.rating > 0)
            .map(([productId, v]) => ({
                product_id: parseInt(productId),
                rating: v.rating,
                review: v.review || undefined,
            }));

        if (payload.length === 0) {
            toast.error('Please rate at least one product.');
            return;
        }

        setRatingSubmitting(true);
        router.post(`/customer/orders/${order.id}/rate`, { ratings: payload }, {
            onSuccess: () => { setRateOpen(false); setRatingSubmitting(false); },
            onError:   () => { setRatingSubmitting(false); },
        });
    }

    // Refund state
    const [refundOpen,       setRefundOpen]       = useState(false);
    const [refundAmount,     setRefundAmount]     = useState('');
    const [refundReason,     setRefundReason]     = useState('');
    const [refundResolution, setRefundResolution] = useState('');
    const [refundDesc,       setRefundDesc]       = useState('');
    const [refundFiles,      setRefundFiles]      = useState<File[]>([]);
    const [refundSubmitting, setRefundSubmitting] = useState(false);
    const refundFileRef = useRef<HTMLInputElement>(null);

    function submitRefund() {
        if (!refundReason || !refundResolution || !refundDesc.trim() || !refundAmount) return;
        setRefundSubmitting(true);
        const fd = new FormData();
        fd.append('amount', refundAmount);
        fd.append('reason', refundReason);
        fd.append('preferred_resolution', refundResolution);
        fd.append('description', refundDesc);
        refundFiles.forEach((f) => fd.append('evidence[]', f));
        router.post(`/customer/orders/${order.id}/refund`, fd as any, {
            onSuccess: () => {
                toast.success('Refund request submitted.');
                setRefundOpen(false);
                setRefundAmount(''); setRefundReason(''); setRefundResolution(''); setRefundDesc(''); setRefundFiles([]);
            },
            onError: () => toast.error('Failed to submit refund request.'),
            onFinish: () => setRefundSubmitting(false),
        });
    }

    // Report state
    const [reportOpen,     setReportOpen]     = useState(false);
    const [reportCategory, setReportCategory] = useState('');
    const [reportSubject,  setReportSubject]  = useState('');
    const [reportDesc,     setReportDesc]     = useState('');
    const [reportFiles,    setReportFiles]    = useState<File[]>([]);
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const reportFileRef = useRef<HTMLInputElement>(null);

    const submitReport = useCallback(() => {
        if (!reportCategory || !reportSubject.trim() || !reportDesc.trim() || !order.store_id) return;
        setReportSubmitting(true);
        const fd = new FormData();
        fd.append('reported_store_id', String(order.store_id));
        fd.append('order_id', String(order.id));
        fd.append('category', reportCategory);
        fd.append('subject', reportSubject);
        fd.append('description', reportDesc);
        reportFiles.forEach((f) => fd.append('evidence[]', f));
        router.post('/customer/reports', fd as any, {
            onSuccess: () => {
                toast.success('Report submitted. We will review it shortly.');
                setReportOpen(false);
                setReportCategory(''); setReportSubject(''); setReportDesc(''); setReportFiles([]);
            },
            onError: () => toast.error('Failed to submit report.'),
            onFinish: () => setReportSubmitting(false),
        });
    }, [reportCategory, reportSubject, reportDesc, reportFiles, order.store_id, order.id]);

    // Show toast for ?payment=success|cancelled query param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const val = params.get('payment');
        if (val === 'success') {
            toast.success('Payment received! Your order has been updated.');
        } else if (val === 'cancelled') {
            toast.error('Payment was cancelled.');
        }
        if (val) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    return (
        <CustomerLayout>
            <Head title={`Order ${order.order_number} — LPG Portal`} />

            <div className="space-y-6">
                {/* Back + header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/customer/orders">
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Orders
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white font-mono">{order.order_number}</h1>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[order.status] ?? 'bg-gray-100'}`}>
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {canPayBalance && (
                            <Button
                                size="sm"
                                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={payBalance}
                                disabled={payingBalance}
                            >
                                {payingBalance ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CreditCard className="h-4 w-4" />
                                )}
                                Pay Balance {order.remaining_balance ? peso(order.remaining_balance) : ''}
                            </Button>
                        )}
                        {canRate && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={openRateDialog}
                            >
                                <Star className="h-4 w-4" />
                                Rate Products
                            </Button>
                        )}
                        {canCancel && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                                onClick={() => { setCancelReason(''); setCancelNotes(''); setCancelOpen(true); }}
                            >
                                <XCircle className="h-4 w-4" />
                                Cancel Order
                            </Button>
                        )}
                        {canRefund && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={() => { setRefundAmount(String(grandTotal)); setRefundOpen(true); }}
                            >
                                <RefreshCcw className="h-4 w-4" />
                                Request Refund
                            </Button>
                        )}
                        {order.refund_request && (
                            <Link href="/customer/refunds">
                                <Button size="sm" variant="outline" className="gap-1.5">
                                    <RefreshCcw className="h-4 w-4" />
                                    Refund: {order.refund_request.status}
                                </Button>
                            </Link>
                        )}
                        {order.store_id && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => setReportOpen(true)}
                            >
                                <Flag className="h-4 w-4" />
                                Report Seller
                            </Button>
                        )}
                    </div>
                </div>

                {/* Status tracker */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Delivery Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusStepper status={order.status} order={order} />
                        {order.status === 'out_for_delivery' && (
                            <TrackingCard orderId={order.id} />
                        )}
                        {order.delivery && (
                            <>
                                <div className="mt-4 pt-4 border-t border-gray-100 grid gap-2 sm:grid-cols-2 text-sm">
                                    {order.delivery.rider_name && (
                                        <div>
                                            <span className="text-gray-500">Rider:</span>{' '}
                                            <span className="font-medium">{order.delivery.rider_name}</span>
                                        </div>
                                    )}
                                    {order.delivery.assigned_at && (
                                        <div>
                                            <span className="text-gray-500">Assigned:</span>{' '}
                                            <span className="font-medium">{order.delivery.assigned_at}</span>
                                        </div>
                                    )}
                                </div>
                                <DeliveryTimeline proofs={order.delivery.proofs} />
                            </>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Items */}
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Order Items</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Product</th>
                                            <th className="px-4 py-3 text-center">Qty</th>
                                            <th className="px-4 py-3 text-right">Unit Price</th>
                                            <th className="px-4 py-3 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {order.items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 dark:text-white">{item.product?.name ?? '—'}</p>
                                                    {item.product?.brand && (
                                                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <PriceBreakdownRows breakdown={breakdown} labelSpan={3} />
                                    </tfoot>
                                </table>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Details sidebar */}
                    <div className="space-y-4">
                        {/* Order info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Order Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Store</span>
                                    <span className="font-medium text-right">{order.store_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Type</span>
                                    <span className="font-medium">{order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Ordered</span>
                                    <span className="font-medium">{fmtDate(order.ordered_at ?? order.created_at)}</span>
                                </div>
                                {order.delivered_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Delivered</span>
                                        <span className="font-medium">{fmtDate(order.delivered_at)}</span>
                                    </div>
                                )}
                                {order.notes && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">Notes</span>
                                        <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">{order.notes}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Payment info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Payment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                {/* Payment mode */}
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Mode</span>
                                    <span className="flex items-center gap-1 text-xs font-medium">
                                        {order.payment_mode === 'consignment' ? (
                                            <><Handshake className="h-3.5 w-3.5 text-amber-500" /> Consignment</>
                                        ) : order.payment_mode === 'cod' ? (
                                            <><Banknote className="h-3.5 w-3.5 text-emerald-500" /> Cash on Delivery</>
                                        ) : (
                                            <><CreditCard className="h-3.5 w-3.5 text-blue-500" /> Full Payment</>
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? ''}`}>
                                        {order.payment_status === 'to_refund' ? 'To Refund' :
                                         order.payment_status === 'refunded'  ? 'Refunded' :
                                         order.payment_status === 'partial'   ? 'Down Paid' :
                                         order.payment_status}
                                    </span>
                                </div>

                                {/* Consignment breakdown */}
                                {order.payment_mode === 'consignment' && (() => {
                                    const outstanding = order.payment_status === 'partial' && (order.remaining_balance ?? 0) > 0;
                                    const tone = order.is_overdue
                                        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20';
                                    return (
                                        <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 text-xs ${tone}`}>
                                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                                <span>Order Total</span>
                                                <span className="font-medium">{peso(grandTotal)}</span>
                                            </div>
                                            {order.down_payment_amount !== null && (
                                                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                                    <span>Down Payment {order.payment_status === 'unpaid' ? '(unpaid)' : '(paid)'}</span>
                                                    <span className="font-medium">{peso(order.down_payment_amount)}</span>
                                                </div>
                                            )}
                                            {outstanding && (
                                                <>
                                                    <div className={`flex justify-between font-semibold border-t pt-1.5 mt-1 text-sm ${order.is_overdue ? 'border-red-200 text-red-700 dark:text-red-400' : 'border-amber-200 text-amber-800 dark:border-amber-800 dark:text-amber-300'}`}>
                                                        <span>Remaining Balance</span>
                                                        <span>{peso(order.remaining_balance ?? 0)}</span>
                                                    </div>
                                                    {order.balance_due_date ? (
                                                        <>
                                                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                                                <span>Due by</span>
                                                                <span className="font-medium">{order.balance_due_date}</span>
                                                            </div>
                                                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                                                <span>Days remaining</span>
                                                                <span className={`font-semibold ${order.is_overdue ? 'text-red-600' : ''}`}>
                                                                    {order.is_overdue
                                                                        ? `${Math.abs(order.balance_days_remaining ?? 0)} day(s) overdue`
                                                                        : order.balance_days_remaining === 0 ? 'Due today' : `${order.balance_days_remaining} day(s)`}
                                                                </span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <p className="text-amber-700 dark:text-amber-400">
                                                            The balance becomes due a few days after your order is delivered.
                                                        </p>
                                                    )}
                                                    {order.is_overdue && (
                                                        <div className="flex items-start gap-1.5 rounded-md bg-red-600 px-2 py-1.5 font-semibold text-white">
                                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                                                            Your balance is overdue. Please pay as soon as possible.
                                                        </div>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        className={`mt-1 w-full gap-1.5 text-white ${order.is_overdue ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                        onClick={payBalance}
                                                        disabled={payingBalance}
                                                    >
                                                        {payingBalance ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                                        Pay Remaining Balance
                                                    </Button>
                                                </>
                                            )}
                                            {order.payment_status === 'paid' && (
                                                <p className="text-emerald-700 dark:text-emerald-400 font-medium">Fully paid — thank you!</p>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* COD note */}
                                {order.payment_mode === 'cod' && order.payment_status === 'unpaid' && order.status !== 'cancelled' && (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                                        Pay <strong>{peso(grandTotal)}</strong> in cash to the rider upon delivery.
                                    </div>
                                )}

                                {order.coupon_discount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Coupon {order.coupon_code}</span>
                                        <span className="font-medium text-emerald-600">−{peso(order.coupon_discount)}</span>
                                    </div>
                                )}
                                {order.discount_amount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Store discount</span>
                                        <span className="font-medium text-emerald-600">−{peso(order.discount_amount)}</span>
                                    </div>
                                )}

                                {order.payment_method && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Method</span>
                                        <span className="font-medium capitalize">{order.payment_method.replace('_', ' ')}</span>
                                    </div>
                                )}
                                {order.payment && (
                                    <>
                                        {order.payment.status !== 'paid' && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-500">Payment</span>
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    order.payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                    order.payment.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {order.payment.status}
                                                </span>
                                            </div>
                                        )}
                                        {order.payment.paymongo_payment_id && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-gray-500 shrink-0">Ref #</span>
                                                <span className="font-mono text-xs font-medium text-right break-all">{order.payment.paymongo_payment_id}</span>
                                            </div>
                                        )}
                                        {order.payment.paid_at && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Paid At</span>
                                                <span className="font-medium text-xs">{order.payment.paid_at}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {order.invoice && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Invoice #</span>
                                            <Link href={`/customer/invoices/${order.invoice.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                                                {order.invoice.invoice_number}
                                                <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </div>
                                        {order.invoice.due_date && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Due</span>
                                                <span className="font-medium">{order.invoice.due_date}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
            {/* Cancel Order dialog */}
            <Dialog open={cancelOpen} onOpenChange={(open) => !open && setCancelOpen(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Cancel Order
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                        <p className="text-sm text-gray-600">
                            Cancel order <strong className="font-mono">{order.order_number}</strong>?
                            {order.status === 'confirmed' && ' Stock will be restored to the seller.'}
                        </p>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Reason <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a reason…</option>
                                {CANCEL_REASONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Additional notes <span className="text-gray-400 text-xs">(optional)</span>
                            </label>
                            <textarea
                                value={cancelNotes}
                                onChange={(e) => setCancelNotes(e.target.value)}
                                rows={3}
                                placeholder="Any additional details…"
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>
                        {order.payment_status === 'paid' && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Your order was paid. A refund will be processed by the seller.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
                            Keep Order
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={submitCancel}
                            disabled={cancelling || !cancelReason}
                        >
                            {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rate Products dialog */}
            <Dialog open={rateOpen} onOpenChange={(o) => !o && setRateOpen(false)}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-400" />
                            Rate Products
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        {unratedItems.map((item) => {
                            const pid = item.product_id!;
                            const state = ratings[pid] ?? { rating: 0, review: '' };
                            return (
                                <div key={item.id} className="rounded-lg border border-gray-200 p-4 space-y-3">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                                            {item.product?.name ?? `Product #${pid}`}
                                        </p>
                                        {item.product?.brand && (
                                            <p className="text-xs text-gray-500">{item.product.brand}</p>
                                        )}
                                    </div>
                                    <StarSelector
                                        value={state.rating}
                                        onChange={(v) => setRatings((prev) => ({ ...prev, [pid]: { ...prev[pid], rating: v } }))}
                                    />
                                    <textarea
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                        rows={2}
                                        placeholder="Write a review (optional)…"
                                        value={state.review}
                                        onChange={(e) => setRatings((prev) => ({ ...prev, [pid]: { ...prev[pid], review: e.target.value } }))}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                            disabled={ratingSubmitting || Object.values(ratings).every((v) => v.rating === 0)}
                            onClick={submitRatings}
                        >
                            {ratingSubmitting ? 'Submitting…' : 'Submit Review'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Request Refund dialog */}
            <Dialog open={refundOpen} onOpenChange={(o) => { setRefundOpen(o); if (!o) { setRefundReason(''); setRefundResolution(''); setRefundDesc(''); setRefundFiles([]); } }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RefreshCcw className="h-4 w-4 text-blue-500" />
                            Request Refund — {order.order_number}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                            <p className="text-xs text-blue-700 dark:text-blue-400">
                                Your request goes directly to <strong>{order.store_name}</strong>. The seller can send a replacement,
                                refund your money, or give you a store discount. If you disagree with their decision, you can escalate it to the platform admin.
                            </p>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Amount Concerned (₱) <span className="text-red-500">*</span></label>
                            <input type="number" min="1" max={grandTotal} step="0.01"
                                value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            <p className="text-xs text-muted-foreground">Max: {peso(grandTotal)}</p>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Preferred Resolution <span className="text-red-500">*</span></label>
                            <select value={refundResolution} onChange={(e) => setRefundResolution(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                <option value="">Select a resolution…</option>
                                <option value="replacement">Product Replacement</option>
                                <option value="money_refund">Money Refund</option>
                                <option value="store_discount">Store Discount</option>
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Reason <span className="text-red-500">*</span></label>
                            <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                <option value="">Select a reason…</option>
                                <option value="damaged_product">Damaged Product</option>
                                <option value="leaking_tank">Leaking Tank</option>
                                <option value="wrong_product">Wrong Product Received</option>
                                <option value="missing_items">Missing Items</option>
                                <option value="quality_issue">Quality Issue</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Description <span className="text-red-500">*</span></label>
                            <textarea value={refundDesc} onChange={(e) => setRefundDesc(e.target.value)}
                                rows={3} placeholder="Describe the issue in detail…"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Evidence Photos (optional, max 5)</label>
                            <input ref={refundFileRef} type="file" multiple accept="image/*"
                                className="hidden"
                                onChange={(e) => setRefundFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
                            <Button type="button" variant="outline" size="sm" onClick={() => refundFileRef.current?.click()}>
                                Attach Photos
                            </Button>
                            {refundFiles.length > 0 && (
                                <p className="text-xs text-muted-foreground">{refundFiles.map((f) => f.name).join(', ')}</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
                        <Button
                            onClick={submitRefund}
                            disabled={refundSubmitting || !refundReason || !refundResolution || !refundDesc.trim() || !refundAmount}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {refundSubmitting ? 'Submitting…' : 'Submit Request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Report Seller dialog */}
            <Dialog open={reportOpen} onOpenChange={(o) => { setReportOpen(o); if (!o) { setReportCategory(''); setReportSubject(''); setReportDesc(''); setReportFiles([]); } }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-red-500" />
                            Report Seller — {order.store_name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground text-xs">
                            Regarding order <span className="font-mono font-semibold">{order.order_number}</span>
                        </p>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Category <span className="text-red-500">*</span></label>
                            <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                <option value="">Select a category…</option>
                                <option value="fraud">Fraud</option>
                                <option value="fake_product">Fake / Wrong Product</option>
                                <option value="non_delivery">Non-Delivery</option>
                                <option value="overpricing">Overpricing</option>
                                <option value="rude_behavior">Rude Behavior</option>
                                <option value="harassment">Harassment</option>
                                <option value="counterfeit">Counterfeit Product</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Subject <span className="text-red-500">*</span></label>
                            <input value={reportSubject} onChange={(e) => setReportSubject(e.target.value)}
                                placeholder="Brief title…"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Description <span className="text-red-500">*</span></label>
                            <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)}
                                rows={4} placeholder="Describe what happened…"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium">Evidence (optional, max 5 files)</label>
                            <input ref={reportFileRef} type="file" multiple accept="image/*,video/mp4,application/pdf"
                                className="hidden"
                                onChange={(e) => setReportFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
                            <Button type="button" variant="outline" size="sm" onClick={() => reportFileRef.current?.click()}>
                                Attach Files
                            </Button>
                            {reportFiles.length > 0 && (
                                <p className="text-xs text-muted-foreground">{reportFiles.map((f) => f.name).join(', ')}</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                        <Button
                            onClick={submitReport}
                            disabled={reportSubmitting || !reportCategory || !reportSubject.trim() || !reportDesc.trim()}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {reportSubmitting ? 'Submitting…' : 'Submit Report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CustomerLayout>
    );
}
