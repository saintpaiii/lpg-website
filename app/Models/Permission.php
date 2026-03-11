<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Permission extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'group', 'description'];

    public function rolePermissions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    public function userPermissions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(UserPermission::class);
    }

    /**
     * All permissions keyed by name, grouped by group.
     */
    public static function allGrouped(): array
    {
        return static::orderBy('group')->orderBy('name')
            ->get()
            ->groupBy('group')
            ->map(fn ($perms) => $perms->values())
            ->toArray();
    }
}
