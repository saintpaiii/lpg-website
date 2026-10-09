import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { peso } from '@/components/chat/format';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { OrderSummary } from './types';

/** "Order summary" on report pages for the admin and the store. */
export default function OrderSummaryCard({ summary }: { summary: OrderSummary }) {
    const [photo, setPhoto] = useState(false);
    const s = summary;

    return (
        <div className="space-y-3 rounded-xl border p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order summary</p>
            <div className="flex items-baseline justify-between gap-2">
                {s.link ? <Link href={s.link} className="font-mono font-semibold text-blue-600 hover:underline">{s.order_number}</Link>
                    : <span className="font-mono font-semibold">{s.order_number}</span>}
                <span className="text-xs text-gray-500">{s.status}</span>
            </div>
            {s.ordered_at && <p className="text-xs text-gray-500">Ordered {s.ordered_at}</p>}

            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-gray-500">Payment</dt><dd className="text-right">{s.payment_method ?? '—'}</dd>
                <dt className="text-gray-500">Status</dt><dd className="text-right font-medium">{s.payment_status}</dd>
                <dt className="text-gray-500">Paid</dt><dd className="text-right tabular-nums">{peso(s.amount_paid)}</dd>
                <dt className="text-gray-500">Order total</dt><dd className="text-right font-semibold tabular-nums">{peso(s.grand_total)}</dd>
                {s.remaining_balance !== null && (
                    <><dt className="text-amber-700">Balance</dt><dd className="text-right tabular-nums text-amber-700">{peso(s.remaining_balance)}{s.balance_due_date ? ` · due ${s.balance_due_date}` : ''}</dd></>
                )}
            </dl>

            <div className="border-t pt-2">
                <p className="mb-1 text-xs text-gray-500">Items</p>
                <ul className="space-y-0.5 text-xs">
                    {s.items.map((i, k) => (
                        <li key={k} className="flex justify-between gap-2">
                            <span className="truncate">{i.quantity}× {i.name} <span className="text-gray-400">@ {peso(i.unit_price)}</span></span>
                            <span className="tabular-nums">{peso(i.line_total)}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {s.delivery && (
                <div className="border-t pt-2 text-xs">
                    <p className="text-gray-500">Delivery</p>
                    <p>{s.delivery.rider ?? 'No rider'} · {s.delivery.status}{s.delivery.delivered_at ? ` · ${s.delivery.delivered_at}` : ''}</p>
                    {s.delivery.proof_url && (
                        <button type="button" onClick={() => setPhoto(true)} className="mt-1.5 block">
                            <img src={s.delivery.proof_url} alt="Delivery photo" className="h-20 w-20 rounded-md border object-cover" />
                        </button>
                    )}
                </div>
            )}
            {s.refund && <p className="border-t pt-2 text-xs"><span className="text-gray-500">Refund: </span>{s.refund.status} · {peso(s.refund.amount)}</p>}

            <Dialog open={photo} onOpenChange={setPhoto}>
                <DialogContent className="max-w-3xl p-2">
                    <DialogTitle className="sr-only">Delivery photo</DialogTitle>
                    {s.delivery?.proof_url && <img src={s.delivery.proof_url} alt="Delivery photo" className="max-h-[80vh] w-full rounded object-contain" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
