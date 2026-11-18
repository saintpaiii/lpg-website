<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** K6: a payment to the supplier for a purchase order (or a supplier-return credit — supplier_return_id set). */
class PurchaseOrderPayment extends Model
{
    public const METHODS = ['cash' => 'Cash', 'bank_transfer' => 'Bank transfer', 'gcash' => 'GCash', 'maya' => 'Maya', 'check' => 'Check', 'other' => 'Other'];

    protected $fillable = ['purchase_order_id', 'amount', 'paid_on', 'method', 'reference', 'note', 'supplier_return_id', 'recorded_by'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'paid_on' => 'date'];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function supplierReturn(): BelongsTo
    {
        return $this->belongsTo(SupplierReturn::class);
    }
}
