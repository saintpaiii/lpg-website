<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** J7: damaged / expired cylinders sent back to a supplier (items = cylinder_incidents). */
class SupplierReturn extends Model
{
    public const STATUS_LABELS = ['open' => 'Open', 'sent' => 'Sent', 'replaced' => 'Replaced', 'credited' => 'Credited', 'rejected' => 'Rejected'];

    protected $fillable = ['store_id', 'supplier_id', 'return_number', 'status', 'credited_amount', 'notes', 'created_by'];

    protected function casts(): array
    {
        return ['credited_amount' => 'decimal:2'];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(CylinderIncident::class);
    }

    public function quantity(): int
    {
        return (int) $this->incidents->sum('quantity');
    }
}
