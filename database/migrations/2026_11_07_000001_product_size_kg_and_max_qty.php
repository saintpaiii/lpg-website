<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Tank size becomes a number: products.weight_kg is filled from the seller's free text (that text wins — sellers only
 * ever edited it) and products.weight is rewritten as "11 kg" so pages reading it keep working.
 * Adds products.max_per_order (seller's optional limit per customer order).
 */
return new class extends Migration
{
    /** Copied from App\Support\LpgSize so this migration never changes meaning. */
    private function parseKg(?string $weight): ?float
    {
        if ($weight === null || ! preg_match('/\d+(?:[.,]\d+)?/', $weight, $m)) {
            return null;
        }
        $kg = round((float) str_replace(',', '.', $m[0]), 1);

        return $kg > 0 ? $kg : null;
    }

    private function label(float $kg): string
    {
        return rtrim(rtrim(number_format($kg, 1, '.', ''), '0'), '.') . ' kg';
    }

    public function up(): void
    {
        // Query builder: soft-deleted products are included
        DB::table('products')->orderBy('id')->chunkById(200, function ($rows) {
            foreach ($rows as $row) {
                $text = $row->weight;
                $old  = $row->weight_kg !== null ? (float) $row->weight_kg : null;
                $kg   = $this->parseKg($text);

                if ($text !== null && preg_match_all('/\d+(?:[.,]\d+)?/', $text) > 1) {
                    Log::info('[size backfill] more than one number in the size text', ['product_id' => $row->id, 'weight' => $text, 'used_kg' => $kg]);
                }

                if ($kg !== null) {
                    if ($old !== null && $old > 0 && abs($old - $kg) > 0.05) {
                        Log::info('[size backfill] text and weight_kg disagreed (text wins)', ['product_id' => $row->id, 'weight' => $text, 'weight_kg_before' => $old, 'weight_kg_after' => $kg]);
                    }
                    DB::table('products')->where('id', $row->id)->update(['weight_kg' => round($kg, 1), 'weight' => $this->label($kg)]);
                } elseif ($old !== null && $old > 0) {
                    DB::table('products')->where('id', $row->id)->update(['weight' => $this->label($old)]);
                } else {
                    Log::info('[size backfill] unreadable size — the seller is asked for the number on the next edit', ['product_id' => $row->id, 'weight' => $text, 'weight_kg' => $old]);
                }
            }
        });

        if (! Schema::hasColumn('products', 'max_per_order')) {
            Schema::table('products', function (Blueprint $table) {
                $table->unsignedSmallInteger('max_per_order')->nullable()->after('purchase_price');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'max_per_order')) {
            Schema::table('products', fn (Blueprint $table) => $table->dropColumn('max_per_order'));
        }
    }
};
