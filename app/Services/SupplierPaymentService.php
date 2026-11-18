<?php

namespace App\Services;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderPayment;
use App\Models\Store;
use App\Models\SupplierReturn;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * K6 — what the store owes its suppliers, per purchase order.
 *
 *  owed     = the RECEIVED value of the PO (Σ quantity_received × unit_cost), not the ordered value
 *  paid     = Σ purchase_order_payments (payments + supplier-return credits)
 *  status   = paid (paid ≥ owed > 0) | partial (paid > 0) | unpaid
 *  due date = set on the FIRST receive from the supplier's payment terms ("COD" / "cash" → that day, "N day(s)" →
 *             + N days, anything else → none — the owner can set it by hand). Never recomputed once set.
 *
 * Supplier-return credits (outcome Credited) are recorded as payments (method 'other', note "Credit RT-000001") on the
 * supplier's OLDEST POs that still have a balance; a credit larger than every balance keeps the rest "not applied"
 * (shown on the return).
 */
class SupplierPaymentService
{
    /** Pure: due date from the payment terms text. */
    public static function dueFromTerms(?string $terms, CarbonInterface $receivedOn): ?string
    {
        $t = strtolower(trim((string) $terms));
        if ($t === '') {
            return null;
        }
        if (preg_match('/\b(cod|cash)\b/', $t) || str_contains($t, 'cash on delivery')) {
            return $receivedOn->toDateString();
        }
        if (preg_match('/(\d{1,3})\s*-?\s*days?\b/', $t, $m)) {
            return $receivedOn->copy()->addDays((int) $m[1])->toDateString();
        }

        return null;
    }

    /** Re-read amount_paid from the payments and set payment_status. */
    public static function recalc(PurchaseOrder $po): PurchaseOrder
    {
        $po->load('items');
        $paid = round((float) PurchaseOrderPayment::where('purchase_order_id', $po->id)->sum('amount'), 2);
        $owed = $po->receivedValue();
        $status = $owed > 0 && $paid >= $owed - 0.005 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');
        $po->update(['amount_paid' => $paid, 'payment_status' => $status]);

        return $po;
    }

    /** After a receive: the due date (first time only) + the status (the owed amount grew). */
    public static function afterReceive(PurchaseOrder $po): void
    {
        if ($po->payment_due_on === null) {
            $po->loadMissing('supplier');
            $due = static::dueFromTerms($po->supplier?->payment_terms, now());
            if ($due) {
                $po->update(['payment_due_on' => $due]);
            }
        }
        static::recalc($po);
    }

    /**
     * "Record payment": amount (> 0, ≤ balance), paid_on (≤ today), method, reference, note.
     *
     * @param  array{amount: float|string, paid_on: string, method: string, reference?: ?string, note?: ?string}  $data
     */
    public static function record(PurchaseOrder $po, array $data, ?int $userId, ?int $supplierReturnId = null): PurchaseOrderPayment
    {
        return DB::transaction(function () use ($po, $data, $userId, $supplierReturnId) {
            $po = PurchaseOrder::with('items')->whereKey($po->id)->lockForUpdate()->firstOrFail();
            if (in_array($po->status, ['draft', 'cancelled'], true)) {
                throw ValidationException::withMessages(['amount' => 'Payments can only be recorded on a purchase order that was sent and received.']);
            }
            $amount = round((float) $data['amount'], 2);
            $balance = $po->balance();
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Enter an amount above ₱0.']);
            }
            if ($balance <= 0) {
                throw ValidationException::withMessages(['amount' => $po->receivedValue() > 0
                    ? "{$po->po_number} is already fully paid."
                    : "Nothing was received on {$po->po_number} yet — you pay for what arrived."]);
            }
            if ($amount > $balance + 0.004) {
                throw ValidationException::withMessages(['amount' => 'The amount is more than the balance of ₱' . number_format($balance, 2) . '.']);
            }
            $paidOn = Carbon::parse($data['paid_on'])->startOfDay();
            if ($paidOn->isAfter(now()->startOfDay())) {
                throw ValidationException::withMessages(['paid_on' => "The payment date can't be in the future."]);
            }
            $payment = PurchaseOrderPayment::create([
                'purchase_order_id' => $po->id, 'amount' => $amount, 'paid_on' => $paidOn->toDateString(), 'method' => $data['method'],
                'reference' => $data['reference'] ?? null, 'note' => $data['note'] ?? null, 'supplier_return_id' => $supplierReturnId, 'recorded_by' => $userId,
            ]);
            static::recalc($po);

            return $payment;
        });
    }

    public static function delete(PurchaseOrderPayment $payment): PurchaseOrder
    {
        return DB::transaction(function () use ($payment) {
            $po = PurchaseOrder::whereKey($payment->purchase_order_id)->lockForUpdate()->firstOrFail();
            $payment->delete();

            return static::recalc($po);
        });
    }

    /**
     * A supplier-return credit: payments "Credit RT-000001" on the supplier's oldest POs with a balance.
     * Returns the amount applied (the rest is shown on the return as not applied).
     */
    public static function applyCredit(SupplierReturn $return, ?int $userId): float
    {
        $left = round((float) $return->credited_amount, 2);
        if ($left <= 0 || PurchaseOrderPayment::where('supplier_return_id', $return->id)->exists()) {
            return static::creditApplied($return);
        }
        $pos = PurchaseOrder::with('items')->where('store_id', $return->store_id)->where('supplier_id', $return->supplier_id)
            ->whereIn('status', ['partially_received', 'received'])->where('payment_status', '!=', 'paid')->orderBy('id')->get();
        foreach ($pos as $po) {
            if ($left <= 0) {
                break;
            }
            $take = min($left, $po->balance());
            if ($take <= 0) {
                continue;
            }
            static::record($po, ['amount' => $take, 'paid_on' => now()->toDateString(), 'method' => 'other', 'note' => "Credit {$return->return_number}"], $userId, $return->id);
            $left = round($left - $take, 2);
        }

        return static::creditApplied($return);
    }

    public static function creditApplied(SupplierReturn $return): float
    {
        return round((float) PurchaseOrderPayment::where('supplier_return_id', $return->id)->sum('amount'), 2);
    }

    // ── Totals ───────────────────────────────────────────────────────────────

    /**
     * Unpaid POs of a store (received something, not fully paid), optionally one supplier.
     *
     * @return \Illuminate\Support\Collection<int, PurchaseOrder>
     */
    public static function unpaid(int $storeId, ?int $supplierId = null)
    {
        return PurchaseOrder::with('items')->where('store_id', $storeId)
            ->when($supplierId, fn ($q) => $q->where('supplier_id', $supplierId))
            ->whereIn('status', ['partially_received', 'received'])->where('payment_status', '!=', 'paid')->get()
            ->filter(fn (PurchaseOrder $po) => $po->balance() > 0)->values();
    }

    /** ['owed' => ₱, 'overdue' => ₱, 'overdue_count' => n, 'count' => n] for the store, or per supplier id. */
    public static function summary(int $storeId): array
    {
        $unpaid = static::unpaid($storeId);

        return [
            'owed'          => round($unpaid->sum(fn ($po) => $po->balance()), 2),
            'count'         => $unpaid->count(),
            'overdue'       => round($unpaid->filter->isOverdue()->sum(fn ($po) => $po->balance()), 2),
            'overdue_count' => $unpaid->filter->isOverdue()->count(),
        ];
    }

    /** @return array<int, array{owed: float, overdue: float}> supplier_id → balances */
    public static function bySupplier(int $storeId): array
    {
        return static::unpaid($storeId)->groupBy('supplier_id')->map(fn ($pos) => [
            'owed'    => round($pos->sum(fn ($po) => $po->balance()), 2),
            'overdue' => round($pos->filter->isOverdue()->sum(fn ($po) => $po->balance()), 2),
        ])->all();
    }

    /**
     * Daily: "due tomorrow" and "overdue" — ONE notification to the owner per PO per kind (kept in payment_reminders).
     * Returns the number of notifications sent.
     */
    public static function sendReminders(): int
    {
        $sent = 0;
        $tomorrow = now()->addDay()->toDateString();
        PurchaseOrder::with(['items', 'supplier'])->whereIn('status', ['partially_received', 'received'])->where('payment_status', '!=', 'paid')
            ->whereNotNull('payment_due_on')->whereDate('payment_due_on', '<=', $tomorrow)->orderBy('id')
            ->chunkById(200, function ($pos) use ($tomorrow, &$sent) {
                foreach ($pos as $po) {
                    $balance = $po->balance();
                    if ($balance <= 0) {
                        continue;
                    }
                    $kind = $po->isOverdue() ? 'overdue' : ($po->payment_due_on->toDateString() === $tomorrow ? 'due_tomorrow' : null);
                    $done = $po->payment_reminders ?? [];
                    if (! $kind || in_array($kind, $done, true)) {
                        continue;
                    }
                    $owner = (int) Store::withTrashed()->whereKey($po->store_id)->value('user_id');
                    $amount = '₱' . number_format($balance, 2);
                    [$title, $msg] = $kind === 'overdue'
                        ? ["Supplier payment overdue: {$po->po_number}", "{$amount} to {$po->supplier?->name} for {$po->po_number} was due on {$po->payment_due_on->format('M j, Y')}."]
                        : ["Supplier payment due tomorrow: {$po->po_number}", "{$amount} to {$po->supplier?->name} for {$po->po_number} is due on {$po->payment_due_on->format('M j, Y')}."];
                    if ($owner) {
                        NotificationService::send($owner, 'purchase_order', $title, $msg, ['link' => "/seller/purchase-orders/{$po->id}"]);
                        $sent++;
                    }
                    $po->update(['payment_reminders' => array_values(array_unique([...$done, $kind]))]);
                }
            });

        return $sent;
    }
}
