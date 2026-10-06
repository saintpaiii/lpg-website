<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Saved reply a store can insert into a chat. */
class StoreQuickReply extends Model
{
    protected $fillable = ['store_id', 'title', 'body'];

    public const DEFAULTS = [
        ['Available',    'Hello po! Yes, available pa po ito. Pwede na po kayong mag-order.'],
        ['On the way',   'Hello po! Papunta na po ang rider namin sa inyo.'],
        ['Thank you',    'Salamat po sa pag-order! Ingat po palagi.'],
        ['Out of stock', 'Pasensya na po, out of stock po ito ngayon. Babalitaan po namin kayo kapag meron na.'],
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Give a store the default replies if it has none yet. Returns how many were added. */
    public static function ensureDefaults(int $storeId): int
    {
        if (static::where('store_id', $storeId)->exists()) {
            return 0;
        }
        $now = now();
        static::insert(array_map(fn ($d) => [
            'store_id' => $storeId, 'title' => $d[0], 'body' => $d[1], 'created_at' => $now, 'updated_at' => $now,
        ], self::DEFAULTS));

        return count(self::DEFAULTS);
    }
}
