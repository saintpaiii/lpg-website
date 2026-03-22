import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Package, Truck, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDateTime } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string } | null;
};

type Delivery = {
    id: number;
    status: string;
    rider: { name: string; phone: string | null } | null;
    assigned_at: string | null;
    delivered_at: string | null;
};

type Order = {
    id: number;
    order_number: string;
    status: string;
    transaction_type: string;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    notes: string | null;
    ordered_at: string | null;
    delivered_at: string | null;
    created_at: string;
    customer: { id: number; name: string; phone: string | null; address: string; city: string } | null;
    items: OrderItem[];
    has_invoice: boolean;
    invoice_number: string | null;
    invoice_id: number | null;
    delivery: Delivery | null;
};

type Rider = { id: number; name: string; phone: string | null };

type Props = {
    order: Order;
    riders: Rider[];
};

const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800 border-yellow-200',
    confirmed:        'bg-blue-100 text-blue-800 border-blue-200',
    preparing:        'bg-purple-100 text-purple-800 border-purple-200',
    out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
    delivered:        'bg-green-100 text-green-800 border-green-200',
    cancelled:        'bg-red-100 text-red-800 border-red-200',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SellerOrderShow({ order, riders }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Orders',    href: '/seller/orders'    },
        { title: order.order_number, href: `/seller/orders/${order.id}` },
    ];

    const [showCancel, setShowCancel]     = useState(false);
    const [showAssign, setShowAssign]     = useState(false);
    const [selectedRider, setSelectedRider] = useState('');

    const { data: payData, setData: setPayData, patch: patchPay, processing: payProcessing } = useForm({
        payment_status: order.payment_status,
        payment_method: order.payment_method ?? 'cash',
    });

    function moveStatus(status: string) {
        router.patch(`/seller/orders/${order.id}/status`, { status });
    }

    function submitCancel() {
        router.patch(`/seller/orders/${order.id}/status`, { status: 'cancelled' }, {
            onSuccess: () => setShowCancel(false),
        });
    }

    function submitAssign() {
        if (!selectedRider) return;
        router.post(`/seller/orders/${order.id}/assign-delivery`, { rider_id: selectedRider }, {
            onSuccess: () => setShowAssign(false),
        });
    }

    function updatePayment(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        patchPay(`/seller/orders/${order.id}/payment`);
    }

    const isFinal    = ['cancelled', 'delivered'].includes(order.status);
    const stepIndex  = STATUS_STEPS.indexOf(order.status);
    const canConfirm = order.status === 'pending';
    const canPrepare = order.status === 'confirmed';
    const canAssign  = ['confirmed', 'preparing'].includes(order.status);
    const canCancel  = !isFinal;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={order.order_number} />

            <div className="p-6 space-y-6 max-w-4xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/seller/orders">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-bold font-mono">{order.order_number}</h1>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                    {order.status.replace('_', ' ')}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Created {fmtDateTime(order.created_at)}
                                {order.ordered_at && ` · Ordered ${fmtDateTime(order.ordered_at)}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {canConfirm && (
                            <Button onClick={() => moveStatus('confirmed')} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                            </Button>
                        )}
                        {canPrepare && (
                            <Button onClick={() => moveStatus('preparing')} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                                <Package className="h-3.5 w-3.5 mr-1" /> Mark Preparing
                            </Button>
                        )}
                        {canAssign && (
                            <Button onClick={() => setShowAssign(true)} size="sm" variant="outline">
                                <Truck className="h-3.5 w-3.5 mr-1" /> Assign Rider
                            </Button>
                        )}
                        {canCancel && (
                            <Button onClick={() => setShowCancel(true)} size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                        )}
                        {order.has_invoice && order.invoice_id && (
                            <Link href={`/seller/invoices/${order.invoice_id}`}>
                                <Button size="sm" variant="outline">View Invoice</Button>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Progress stepper */}
                {order.status !== 'cancelled' && (
                    <div className="flex items-center gap-0">
                        {STATUS_STEPS.map((step, idx) => (
                            <div key={step} className="flex items-center flex-1 last:flex-none">
                                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${idx <= stepIndex ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                                    {idx + 1}
                                </div>
                                <div className="mx-1 hidden sm:block">
                                    <p className={`text-xs font-medium capitalize ${idx <= stepIndex ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                        {step.replace('_', ' ')}
                                    </p>
                                </div>
                                {idx < STATUS_STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 mx-1 ${idx < stepIndex ? 'bg-blue-600' : 'bg-muted'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Order items */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Order Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Product</th>
                                        <th className="text-center px-4 py-2 font-medium text-muted-foreground">Qty</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Price</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item) => (
                                        <tr key={item.id} className="border-b last:border-0">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{item.product?.name ?? '—'}</p>
                                                <p className="text-xs text-muted-foreground">{item.product?.brand ?? ''}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right">{fmt(item.unit_price)}</td>
                                            <td className="px-4 py-3 text-right font-medium">{fmt(item.subtotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t bg-muted/20">
                                        <td colSpan={3} className="px-4 py-2.5 font-medium text-right">Total</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-lg">{fmt(order.total_amount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </CardContent>
                    </Card>

                    {/* Right panel */}
                    <div className="space-y-4">
                        {/* Customer */}
                        {order.customer && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
                                <CardContent className="text-sm space-y-1">
                                    <p className="font-semibold">{order.customer.name}</p>
                                    {order.customer.phone && <p className="text-muted-foreground">{order.customer.phone}</p>}
                                    <p className="text-muted-foreground text-xs">{order.customer.address}, {order.customer.city}</p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Payment */}
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Payment</CardTitle></CardHeader>
                            <CardContent>
                                {isFinal ? (
                                    <div className="text-sm space-y-1">
                                        <p><span className="text-muted-foreground">Method:</span> <span className="capitalize">{order.payment_method ?? '—'}</span></p>
                                        <p><span className="text-muted-foreground">Status:</span> <span className="capitalize font-medium">{order.payment_status}</span></p>
                                    </div>
                                ) : (
                                    <form onSubmit={updatePayment} className="space-y-3">
                                        <div className="grid gap-1.5">
                                            <p className="text-xs font-medium text-muted-foreground">Method</p>
                                            <Select value={payData.payment_method} onValueChange={(v) => setPayData('payment_method', v)}>
                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {['cash', 'gcash', 'bank_transfer', 'maya'].map((m) => (
                                                        <SelectItem key={m} value={m} className="text-xs capitalize">{m.replace('_', ' ')}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                                            <Select value={payData.payment_status} onValueChange={(v) => setPayData('payment_status', v)}>
                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {['unpaid', 'paid', 'partial'].map((s) => (
                                                        <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button type="submit" size="sm" variant="outline" className="w-full h-7 text-xs" disabled={payProcessing}>
                                            Update Payment
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>

                        {/* Delivery */}
                        {order.delivery && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Delivery</CardTitle></CardHeader>
                                <CardContent className="text-sm space-y-1">
                                    <p><span className="text-muted-foreground">Status:</span> <span className="capitalize font-medium">{order.delivery.status.replace('_', ' ')}</span></p>
                                    {order.delivery.rider && <p><span className="text-muted-foreground">Rider:</span> {order.delivery.rider.name}</p>}
                                    {order.delivery.assigned_at && <p className="text-xs text-muted-foreground">Assigned: {fmtDateTime(order.delivery.assigned_at)}</p>}
                                    {order.delivery.delivered_at && <p className="text-xs text-muted-foreground">Delivered: {fmtDateTime(order.delivery.delivered_at)}</p>}
                                </CardContent>
                            </Card>
                        )}

                        {/* Notes */}
                        {order.notes && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                                <CardContent><p className="text-sm text-muted-foreground">{order.notes}</p></CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {/* Cancel dialog */}
            <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cancel <strong>{order.order_number}</strong>? Stock will be restored if the order was already confirmed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                        <AlertDialogAction onClick={submitCancel} className="bg-red-600 hover:bg-red-700">Cancel Order</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Assign rider dialog */}
            <AlertDialog open={showAssign} onOpenChange={setShowAssign}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Assign Rider</AlertDialogTitle>
                        <AlertDialogDescription>Select a rider for order <strong>{order.order_number}</strong>.</AlertDialogDescription>
                    </AlertDialogHeader>
                    {riders.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No riders available. Add a rider in Staff Management.</p>
                    ) : (
                        <Select value={selectedRider} onValueChange={setSelectedRider}>
                            <SelectTrigger><SelectValue placeholder="Select rider…" /></SelectTrigger>
                            <SelectContent>
                                {riders.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>{r.name} {r.phone && `· ${r.phone}`}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitAssign} disabled={!selectedRider} className="bg-blue-600 hover:bg-blue-700">Assign</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
