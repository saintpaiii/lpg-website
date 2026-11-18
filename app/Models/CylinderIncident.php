<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * J7: a damaged / expired cylinder. source stock_check / supplier_delivery = the store's own cylinder (held aside in
 * damaged_quantity, can go back to the supplier); customer_handover = the customer's own empty that was refused at a
 * refill exchange (J4) — recorded for the DSS only, status 'disposed', no stock effect, never in a supplier's damage rate.
 */
class CylinderIncident extends Model
{
    public const REASONS = [
        'leaking' => 'Leaking', 'dented_rusty' => 'Dented / rusty', 'bad_valve' => 'Bad valve', 'expired' => 'Expired (past requalification)',
        'failed_requalification' => 'Failed requalification', 'other' => 'Other',
    ];

    public const STATUS_LABELS = ['held' => 'Held', 'returned' => 'Sent back to supplier', 'replaced' => 'Replaced', 'credited' => 'Credited', 'disposed' => 'Disposed'];

    protected $fillable = ['store_id', 'product_id', 'cylinder_batch_id', 'supplier_id', 'quantity', 'reason', 'source', 'was_empty', 'order_id',
        'order_item_adjustment_id', 'note', 'photo_path', 'status', 'supplier_return_id', 'recorded_by'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'was_empty' => 'boolean'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(CylinderBatch::class, 'cylinder_batch_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function supplierReturn(): BelongsTo
    {
        return $this->belongsTo(SupplierReturn::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
