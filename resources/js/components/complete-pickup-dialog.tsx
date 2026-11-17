import { router } from '@inertiajs/react';
import { Loader2, Recycle, Store, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TankNotAcceptedFields, { notAcceptedPayload, rowsAmountChange, rowsComplete, type NotAcceptedRow, type RefillItem } from '@/components/tank-not-accepted';

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
export function CompletePickupDialog({ order, onClose, refillItems = [] }: { order: PickupOrder | null; onClose: () => void; refillItems?: RefillItem[] }) {
    const [tanks, setTanks] = useState(false);
    const [cash, setCash] = useState(true);
    const [busy, setBusy] = useState(false);
    // J4: "A tank was not accepted" at the counter
    const [rows, setRows] = useState<NotAcceptedRow[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => { setTanks(false); setCash(true); setRows([]); setErrors({}); }, [order?.id]);

    if (!order) return null;
    const needsTanks = order.empty_tanks_required > 0 && !order.empty_tanks_collected;
    const isConsignment = order.payment_mode === 'consignment';
    const paidEnough = order.payment_status === 'paid' || (isConsignment && order.payment_status === 'partial');
    const needsCash = !paidEnough && !isConsignment;
    const blocked = !paidEnough && isConsignment;

    function submit() {
        if (!order) return;
        setBusy(true);
        const body = {
            status: 'delivered',
            empty_tanks_collected: needsTanks ? tanks : null,
            cash_paid: needsCash ? cash : null,
        };
        const opts = { preserveScroll: true, onSuccess: () => onClose(), onError: (e: Record<string, string>) => setErrors(e), onFinish: () => setBusy(false) };
        // Photos → multipart (PATCH via _method)
        if (rows.length) {
            router.post(`/seller/orders/${order.id}/status`, { _method: 'PATCH', ...body, not_accepted: notAcceptedPayload(rows) }, { ...opts, forceFormData: true });
        } else {
            router.patch(`/seller/orders/${order.id}/status`, body, opts);
        }
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
                            <span className="flex items-center gap-1.5"><Recycle className="h-4 w-4" /> Received {rows.length ? 'the accepted' : order.empty_tank_summary} empty tank(s)</span>
                        </label>
                    )}
                    {refillItems.length > 0 && (
                        <TankNotAcceptedFields items={refillItems} rows={rows} onChange={setRows} currentTotal={order.grand_total} />
                    )}
                    {Object.entries(errors).filter(([k]) => k.startsWith('not_accepted') || k === 'empty_tanks_collected').map(([k, v]) => (
                        <p key={k} className="text-xs text-red-600">{v}</p>
                    ))}
                    {needsCash && (
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 font-medium">
                            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="mt-0.5 h-4 w-4" />
                            Customer paid {peso(Math.max(0, order.grand_total + rowsAmountChange(rows, refillItems)))} in cash
                        </label>
                    )}
                    {paidEnough && rowsAmountChange(rows, refillItems) > 0 && (
                        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">Collect {peso(rowsAmountChange(rows, refillItems))} more in cash — a receipt is issued for it.</p>
                    )}
                    {blocked && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                            Record the customer's payment first (the consignment down payment is not in yet).
                        </p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || blocked || (needsTanks && !tanks && rows.length === 0) || (needsCash && !cash) || !rowsComplete(rows)}>
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
