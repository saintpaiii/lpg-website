<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** J7: a store's supplier (LPG refiller / distributor, accessories wholesaler). */
class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = ['store_id', 'name', 'contact_person', 'phone', 'email', 'address', 'lead_time_days', 'payment_terms', 'notes', 'is_active'];

    protected function casts(): array
    {
        return ['lead_time_days' => 'integer', 'is_active' => 'boolean'];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(SupplierProduct::class);
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }
}
