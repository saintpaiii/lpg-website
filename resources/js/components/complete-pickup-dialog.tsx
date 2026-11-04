import { router } from '@inertiajs/react';
import { Loader2, Recycle, Store, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type PickupOrder = {
    id: number;
    order_number: string;
    payment_mode: string;
    payment_status: string;
    grand_total: number;
    empty_tanks_required: number;
    empty_tanks_collected: boolean;
    empty_tank_summary: string | null;
};

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

/**
 * "Mark as picked up" (seller): the empty tanks of a refill must be received, and an unpaid order is paid in cash
 * at the counter (the server records the payment, like the rider's "Collect payment").
 */
export function CompletePickupDialog({ order, onClose }: { order: PickupOrder | null; onClose: () => void }) {
    const [tanks, setTanks] = useState(false);
    const [cash, setCash] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => { setTanks(false); setCash(true); }, [order?.id]);

    if (!order) return null;
    const needsTanks = order.empty_tanks_required > 0 && !order.empty_tanks_collected;
    const isConsignment = order.payment_mode === 'consignment';
    const paidEnough = order.payment_status === 'paid' || (isConsignment && order.payment_status === 'partial');
    const needsCash = !paidEnough && !isConsignment;
    const blocked = !paidEnough && isConsignment;

    function submit() {
        if (!order) return;
        setBusy(true);
        router.patch(`/seller/orders/${order.id}/status`, {
            status: 'delivered',
            empty_tanks_collected: needsTanks ? tanks : null,
            cash_paid: needsCash ? cash : null,
        }, {
            preserveScroll: true,
            onSuccess: () => onClose(),
            onFinish: () => setBusy(false),
        });
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Mark {order.order_number} as picked up</DialogTitle>
                    <DialogDescription>The customer collected the order at the store.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                    {needsTanks && (
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            <input type="checkbox" checked={tanks} onChange={(e) => setTanks(e.target.checked)} className="mt-0.5 h-4 w-4" />
                            <span className="flex items-center gap-1.5"><Recycle className="h-4 w-4" /> Received {order.empty_tank_summary} empty tank(s)</span>
                        </label>
                    )}
                    {needsCash && (
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 font-medium">
                            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="mt-0.5 h-4 w-4" />
                            Customer paid {peso(order.grand_total)} in cash
                        </label>
                    )}
                    {blocked && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                            Record the customer's payment first (the consignment down payment is not in yet).
                        </p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || blocked || (needsTanks && !tanks) || (needsCash && !cash)}>
                        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Mark as picked up
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Small "Pick-up" / "Delivery" badge for order lists and headers. */
export function FulfillmentBadge({ fulfillment }: { fulfillment?: string | null }) {
    return fulfillment === 'pickup' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300">
            <Store className="h-3 w-3" /> Pick-up
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <Truck className="h-3 w-3" /> Delivery
        </span>
    );
}
