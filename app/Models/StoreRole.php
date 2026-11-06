<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A staff role of one store: a name + a level (view | full) per module (config/staff_modules.php).
 * starter_key is set on the 4 starter roles every store gets (cashier, warehouse, rider, hr).
 * No soft deletes: a role is deleted only while nobody has it.
 */
class StoreRole extends Model
{
    protected $fillable = ['store_id', 'name', 'is_rider', 'starter_key', 'hourly_rate'];

    protected function casts(): array
    {
        return ['is_rider' => 'boolean', 'hourly_rate' => 'decimal:2'];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(StoreRoleModule::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'store_role_user');
    }

    /** module => level */
    public function levels(): array
    {
        return $this->modules->pluck('level', 'module')->all();
    }
}
