<?php

namespace App\Models;

use App\Support\LpgSize;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * J8: one day's past sales of a product that are NOT platform orders (CSV import or generated demo history).
 * Read only by the seasonal forecast (SeasonalForecastService) — never by revenue, invoices or reports.
 */
class SalesHistory extends Model
{
    protected $table = 'sales_history';

    protected $fillable = ['store_id', 'product_id', 'product_label', 'size_group', 'sold_on', 'quantity', 'source', 'import_batch', 'created_by'];

    protected function casts(): array
    {
        return ['sold_on' => 'date', 'quantity' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** "11 kg" for LPG (LpgSize), "accessory" for accessories, null when the size can't be read. */
    public static function sizeGroupOf(Product $p): ?string
    {
        if ($p->isAccessory()) {
            return 'accessory';
        }
        $kg = (float) $p->weight_kg > 0 ? (float) $p->weight_kg : LpgSize::parseKg($p->weight);

        return $kg ? LpgSize::label($kg) : null;
    }
}
