<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One module level (view | full) of a store role. */
class StoreRoleModule extends Model
{
    public $timestamps = false;

    protected $fillable = ['store_role_id', 'module', 'level'];

    public function role(): BelongsTo
    {
        return $this->belongsTo(StoreRole::class, 'store_role_id');
    }
}
