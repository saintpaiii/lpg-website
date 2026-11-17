<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemAdjustment;
use App\Models\RefundRequest;
use App\Support\ExchangePolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * J4 — a refill tank NOT accepted at handover (rider "Delivered" / store "Picked up"). Per refill item: how many, why,
 * a photo, and the customer's choice:
 *   (a) new_purchase — that quantity is charged at the product's purchase price instead of the refill price
 *       (the difference is collected in cash now);
 *   (b) cancel — that quantity is removed from the order (stock goes back).
 * Then: order totals recomputed; prepaid orders get a cash receipt for the extra (a) or a refund request for the
 * removed amount (b, the seller sends it through the normal refund flow); the invoice is UPDATED (same number) and
 * emailed again. Every item cancelled → the order is cancelled.
 */
class HandoverAdjustmentService
{
    public const CHOICES = ['new_purchase' => 'Switched to New Purchase', 'cancel' => 'Item cancelled'];

    /** Validation for the "A tank was not accepted" rows sent with Delivered / Picked up. */
    public static function rules(): array
    {
        return [
            'not_accepted'                 => ['nullable', 'array', 'max:20'],
            'not_accepted.*.order_item_id' => ['required', 'integer'],
            'not_accepted.*.quantity'      => ['required', 'integer', 'min:1', 'max:999'],
            'not_accepted.*.reason'        => ['required', 'in:' . implode(',', array_keys(ExchangePolicy::NOT_ACCEPTED_REASONS))],
            'not_accepted.*.note'          => ['nullable', 'string', 'max:300', 'required_if:not_accepted.*.reason,other'],
            'not_accepted.*.choice'        => ['required', 'in:new_purchase,cancel'],
            'not_accepted.*.photo'         => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ];
    }

    public static function messages(): array
    {
        return [
            'not_accepted.*.photo.required'  => 'Take a photo of the tank that was not accepted.',
            'not_accepted.*.note.required_if' => 'Describe the problem with the tank.',
            'not_accepted.*.choice.required' => "Choose what the customer wants: switch to New Purchase or cancel the item.",
        ];
    }

    /**
     * Apply the rows (inside the caller's transaction, BEFORE the order is marked delivered / picked up).
     * @return array{changed: bool, net: float, cancelled_all: bool, lines: array}
     */
    public static function apply(Order $order, array $rows, Request $request, int $userId, string $stage): array
    {
        if (! $rows) {
            return ['changed' => false, 'net' => 0.0, 'cancelled_all' => false, 'lines' => []];
        }

        $order = Order::whereKey($order->id)->lockForUpdate()->first();
        $items = OrderItem::with('product')->where('order_id', $order->id)->get()->keyBy('id');
        $left  = $items->map(fn ($i) => (int) $i->quantity);   // quantity not yet adjusted in this request
        $net   = 0.0;
        $lines = [];
        $adjustments = [];

        foreach ($rows as $i => $row) {
            $item = $items->get((int) $row['order_item_id']);
            $qty  = (int) $row['quantity'];
            if (! $item || ($item->transaction_type ?? $order->transaction_type) !== 'refill') {
                throw ValidationException::withMessages(["not_accepted.{$i}.order_item_id" => 'Only refill items can have a tank that was not accepted.']);
            }
            if ($qty > $left[$item->id]) {
                throw ValidationException::withMessages(["not_accepted.{$i}.quantity" => "Only {$left[$item->id]} tank(s) of {$item->product?->name} are in this order."]);
            }
            $left[$item->id] -= $qty;

            $photo  = $request->file("not_accepted.{$i}.photo")->store('handover_photos', 'local');   // private (J5) — served by DocumentFileController
            $before = (float) $item->unit_price;
            $after  = $row['choice'] === 'new_purchase' ? (float) ($item->product?->purchase_price ?? $before) : null;
            $change = $row['choice'] === 'new_purchase' ? round(($after - $before) * $qty, 2) : round(-$before * $qty, 2);

            if ($row['choice'] === 'new_purchase') {
                if ($qty === (int) $item->quantity) {
                    $item->update(['transaction_type' => 'new_purchase', 'unit_price' => $after, 'subtotal' => round($after * $qty, 2)]);
                } else {
                    $item->update(['quantity' => $item->quantity - $qty, 'subtotal' => round($before * ($item->quantity - $qty), 2)]);
                    OrderItem::create([
                        'order_id' => $order->id, 'product_id' => $item->product_id, 'quantity' => $qty,
                        'unit_price' => $after, 'subtotal' => round($after * $qty, 2), 'transaction_type' => 'new_purchase',
                    ]);
                }
            } else {
                $remaining = (int) $item->quantity - $qty;
                $item->update(['quantity' => $remaining, 'subtotal' => round($before * $remaining, 2)]);
                if ($remaining === 0) {
                    $item->delete();   // soft delete — the adjustment keeps pointing at it
                }
                // The cancelled tanks go back to stock (stock was taken when the order was confirmed)
                if ($inventory = Inventory::where('product_id', $item->product_id)->first()) {
                    $inventory->increment('quantity', $qty);
                    InventoryTransaction::create([
                        'product_id' => $item->product_id, 'type' => 'cancelled', 'quantity' => $qty,
                        'reference'  => $order->order_number, 'notes' => 'Tank not accepted at handover — item cancelled, stock restored',
                        'user_id'    => $userId,
                    ]);
                }
            }

            $adjustments[] = OrderItemAdjustment::create([
                'order_id' => $order->id, 'order_item_id' => $item->id, 'quantity' => $qty,
                'reason' => $row['reason'], 'note' => ($row['note'] ?? null) ?: null, 'photo_path' => $photo,
                'choice' => $row['choice'], 'unit_price_before' => $before, 'unit_price_after' => $after,
                'amount_change' => $change, 'stage' => $stage, 'recorded_by' => $userId,
            ]);
            $net += $change;
            $lines[] = self::line($item->product?->name ?? 'Item', $qty, $row['choice'], $change);
        }

        $net = round($net, 2);
        $remainingItems = OrderItem::where('order_id', $order->id)->where('quantity', '>', 0)->with('product')->get();
        $cancelledAll = $remainingItems->isEmpty();
        $paidBefore = PaymentReceiptService::paidSoFar($order);

        // Order totals + the refill tanks still to collect
        $updates = [
            'total_amount'         => max(0, round((float) $order->total_amount + $net, 2)),
            'empty_tanks_required' => (int) $remainingItems->filter(fn ($i) => ($i->transaction_type ?? $order->transaction_type) === 'refill'
                && (float) ($i->product?->weight_kg ?? 0) > 0)->sum('quantity'),
        ];
        if ($remainingItems->isNotEmpty() && $remainingItems->every(fn ($i) => $i->transaction_type === 'new_purchase')) {
            $updates['transaction_type'] = 'new_purchase';
        }
        if ($cancelledAll) {
            $updates += ['status' => 'cancelled', 'shipping_fee' => 0, 'total_amount' => 0,
                'cancellation_reason' => 'Every tank was not accepted at handover — all items cancelled.'];
        }
        $order->update($updates);
        $order->refresh();

        // Money already paid online / as a down payment
        $refundAmount = 0.0;
        // Consignment and half payment (J5): the new total moves the remaining balance; paid more than the new total → refund the difference
        if (in_array($order->payment_mode, ['consignment', 'half'], true) && $order->down_payment_amount !== null && $order->payment_status !== 'paid') {
            $balance = round($order->grandTotal() - $paidBefore, 2);
            $order->update(['remaining_balance' => max(0, $balance)] + ($balance <= 0 && $paidBefore > 0 ? ['payment_status' => 'paid'] : []));
            $refundAmount = $balance < 0 ? -$balance : 0.0;
        } elseif ($order->payment_status === 'paid' || $paidBefore > 0) {
            $diff = round($order->grandTotal() - $paidBefore, 2);
            if ($diff > 0 && ! $cancelledAll) {
                // The extra for "switch to New Purchase", collected in cash now → a normal acknowledgement receipt
                PaymentReceiptService::record($order, $diff, 'cash', $stage === 'pickup' ? 'cash_at_store' : 'cash_on_delivery');
            } elseif ($diff < 0) {
                $refundAmount = -$diff;
            }
        }
        if ($refundAmount > 0) {
            $refund = RefundRequest::create([
                'order_id' => $order->id, 'customer_id' => $order->customer_id, 'store_id' => $order->store_id,
                'amount' => round($refundAmount, 2), 'reason' => 'other', 'preferred_resolution' => 'money_refund',
                'description' => "Tank not accepted at handover — items cancelled: " . implode('; ', array_column($lines, 'text')) . '. Please send the refund.',
                'status' => 'pending',
            ]);
            OrderItemAdjustment::whereIn('id', collect($adjustments)->where('choice', 'cancel')->pluck('id'))->update(['refund_request_id' => $refund->id]);
            NotificationService::sendToStore($order->store_id, 'refund_request', 'Refund to send (tank not accepted)',
                "Order {$order->order_number}: send ₱" . number_format($refundAmount, 2) . ' back to the customer for the cancelled item(s).',
                ['link' => '/seller/refunds']);
        }

        self::updateInvoice($order, $lines);

        if ($userId = $order->customer?->user_id) {
            NotificationService::send($userId, 'order', 'Order adjusted at handover',
                "Order {$order->order_number}: " . implode('; ', array_column($lines, 'text')) . '. New total ₱' . number_format($order->grandTotal(), 2)
                . ($refundAmount > 0 ? '. A refund of ₱' . number_format($refundAmount, 2) . ' will be sent by the store.' : '.'),
                ['link' => "/customer/orders/{$order->id}"]);
        }

        return ['changed' => true, 'net' => $net, 'cancelled_all' => $cancelledAll, 'lines' => $lines, 'refund' => round($refundAmount, 2)];
    }

    /** The order's invoice keeps its number: new totals + "Adjusted at handover on …" and it is emailed again. */
    private static function updateInvoice(Order $order, array $lines): void
    {
        $invoice = Invoice::where('order_id', $order->id)->first();
        if (! $invoice || $invoice->payment_status === 'voided') {
            return;
        }
        $grand = $order->grandTotal();
        $vat   = $invoice->vat_status === 'vat' ? InvoiceService::vatSplit($grand) : ['vatable_sales' => null, 'vat_amount' => null];
        Invoice::whereKey($invoice->id)->update([
            'total_amount'  => $order->total_amount,
            'grand_total'   => $invoice->vat_status !== null ? $grand : $invoice->grand_total,
            'vatable_sales' => $vat['vatable_sales'],
            'vat_amount'    => $vat['vat_amount'],
            'paid_amount'   => $invoice->payment_status === 'paid' || $order->payment_status === 'paid' ? $grand : min((float) $invoice->paid_amount, $grand),
        ] + ($order->payment_status === 'paid' && $invoice->payment_status !== 'paid'
            // A half / down payment now covers the smaller total (the overpayment goes back as a refund)
            ? ['payment_status' => 'paid', 'paid_at' => $invoice->paid_at ?? now()] : []));
        if ($order->status !== 'cancelled') {
            InvoiceService::queueAdjustedEmail($invoice->id);
        }
    }

    /** {text: "1 × 11kg Gasul — switched to New Purchase (+₱1,450.00)", ...} */
    private static function line(string $name, int $qty, string $choice, float $change): array
    {
        $amount = ($change >= 0 ? '+' : '−') . '₱' . number_format(abs($change), 2);

        return ['text' => "{$qty} × {$name} — " . ($choice === 'new_purchase' ? 'switched to New Purchase' : 'cancelled') . " ({$amount})"];
    }

    /** For the customer's, seller's and admin's order pages (and the invoice). */
    public static function present(Order $order): array
    {
        return OrderItemAdjustment::with(['item' => fn ($q) => $q->withTrashed()->with('product'), 'recorder:id,name'])
            ->where('order_id', $order->id)->oldest()->get()
            ->map(fn (OrderItemAdjustment $a) => [
                'id'           => $a->id,
                'product'      => $a->item?->product?->name ?? 'Item',
                'quantity'     => $a->quantity,
                'reason'       => ExchangePolicy::NOT_ACCEPTED_REASONS[$a->reason] ?? $a->reason,
                'note'         => $a->note,
                'choice'       => $a->choice,
                'choice_label' => self::CHOICES[$a->choice] ?? $a->choice,
                'amount_change' => (float) $a->amount_change,
                'unit_before'  => (float) $a->unit_price_before,
                'unit_after'   => $a->unit_price_after !== null ? (float) $a->unit_price_after : null,
                'photo_url'    => \App\Support\PrivateDocument::url('handover-photo', $a->id, 'photo_path'),
                'stage'        => $a->stage === 'pickup' ? 'At pick-up' : 'At delivery',
                'by'           => $a->recorder?->name,
                'at'           => $a->created_at->timezone('Asia/Manila')->format('M j, Y g:i A'),
                'refund_request_id' => $a->refund_request_id,
            ])->values()->all();
    }

    /** "Adjusted at handover on Nov 17, 2026: 1 × 11kg Gasul — switched to New Purchase (+₱1,450.00)" lines for the invoice. */
    public static function invoiceLines(Order $order): array
    {
        return collect(self::present($order))->groupBy(fn ($a) => substr($a['at'], 0, strrpos($a['at'], ',') ?: null))
            ->map(fn ($rows, $day) => "Adjusted at handover on {$day}: " . $rows->map(fn ($a) => "{$a['quantity']} × {$a['product']} — "
                . ($a['choice'] === 'new_purchase' ? 'switched to New Purchase' : 'cancelled') . " ({$a['reason']}, "
                . ($a['amount_change'] >= 0 ? '+' : '−') . '₱' . number_format(abs($a['amount_change']), 2) . ')')->implode('; '))
            ->values()->all();
    }

    /** Order items a "tank not accepted" can apply to (refill items with a tank) — for the rider / seller dialogs. */
    public static function refillItems(Order $order): array
    {
        return $order->items()->with('product')->get()
            ->filter(fn ($i) => ($i->transaction_type ?? $order->transaction_type) === 'refill' && (float) ($i->product?->weight_kg ?? 0) > 0)
            ->map(fn ($i) => [
                'id'             => $i->id,
                'name'           => $i->product?->name ?? 'Item',
                'quantity'       => (int) $i->quantity,
                'refill_price'   => (float) $i->unit_price,
                'purchase_price' => (float) ($i->product?->purchase_price ?? $i->unit_price),
            ])->values()->all();
    }
}
