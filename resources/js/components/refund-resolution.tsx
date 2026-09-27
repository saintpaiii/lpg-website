import { Gavel, Package, ShieldAlert, TicketPercent, Wallet2, XCircle } from 'lucide-react';
import { peso, RESOLUTION_LABELS, RETURN_METHOD_LABELS, type RefundItem } from '@/lib/refunds';

/** Seller's resolution, escalation and admin decision for a refund request. */
export function RefundResolution({ refund: r }: { refund: RefundItem }) {
    return (
        <div className="space-y-2">
            {r.seller_resolution === 'money_refund' && (
                <Box tone="green" icon={<Wallet2 className="h-3.5 w-3.5" />} title="Money refunded by seller">
                    {peso(r.amount)} — Reference #: <span className="font-mono font-semibold">{r.refund_reference}</span>
                    {r.processed_at && <span className="text-xs opacity-75"> · {r.processed_at}</span>}
                </Box>
            )}

            {r.seller_resolution === 'store_discount' && r.coupon && (
                <Box tone="green" icon={<TicketPercent className="h-3.5 w-3.5" />} title="Store discount issued">
                    Coupon <span className="font-mono font-semibold">{r.coupon.code}</span> — {peso(r.coupon.amount)} off
                    {r.coupon.expires_at && ` · valid until ${r.coupon.expires_at}`}
                    {' · '}<span className="capitalize">{r.coupon.status}</span>
                </Box>
            )}

            {r.seller_resolution === 'replacement' && r.replacement && (
                <Box tone={r.status === 'processed' ? 'green' : 'blue'} icon={<Package className="h-3.5 w-3.5" />} title="Replacement">
                    Order <span className="font-mono font-semibold">{r.replacement.order_number}</span>
                    {' · '}Delivery: <span className="capitalize">{(r.replacement.delivery_status ?? 'pending').replace(/_/g, ' ')}</span>
                    {r.replacement.rider_name && ` · Rider: ${r.replacement.rider_name}`}
                </Box>
            )}

            {r.return_method && r.seller_resolution && (
                <p className="text-xs text-muted-foreground">Return: {RETURN_METHOD_LABELS[r.return_method]}</p>
            )}

            {r.status === 'rejected' && r.seller_notes && (
                <Box tone="red" icon={<XCircle className="h-3.5 w-3.5" />} title="Rejected by seller">
                    {r.seller_notes}
                </Box>
            )}

            {r.status !== 'rejected' && r.seller_notes && (
                <p className="text-xs text-muted-foreground">Seller notes: {r.seller_notes}</p>
            )}

            {r.escalated_to_admin && (
                <Box tone="amber" icon={<ShieldAlert className="h-3.5 w-3.5" />} title={`Escalated to admin${r.escalated_at ? ` · ${r.escalated_at}` : ''}`}>
                    {r.escalation_reason}
                </Box>
            )}

            {r.admin_decision && (
                <Box
                    tone={r.admin_decision === 'favor_customer' ? 'blue' : 'gray'}
                    icon={<Gavel className="h-3.5 w-3.5" />}
                    title={r.admin_decision === 'favor_customer' ? 'Admin ruled in favor of the customer' : "Admin upheld the seller's decision"}
                >
                    {r.admin_notes}
                </Box>
            )}

            {r.preferred_resolution && !r.seller_resolution && r.status === 'pending' && (
                <p className="text-xs text-muted-foreground">Customer prefers: {RESOLUTION_LABELS[r.preferred_resolution]}</p>
            )}
        </div>
    );
}

const TONES = {
    green: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    blue:  'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    red:   'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    amber: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
    gray:  'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800/40 dark:border-gray-700 dark:text-gray-300',
};

function Box({ tone, icon, title, children }: { tone: keyof typeof TONES; icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm ${TONES[tone]}`}>
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold">{icon}{title}</p>
            <div>{children}</div>
        </div>
    );
}
