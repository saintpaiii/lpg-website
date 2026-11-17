<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * J4 (additive only):
 * - stores.opening_hours — per weekday {open: "08:00", close: "18:00", closed: bool, all_day: bool}; NULL = open 24 hours
 *   (existing stores stay "Open 24 hours", no data change). stores.closed_today_until — the seller's "Closed today" switch.
 * - stores.exchange_policy — refill tank exchange policy {brands: [...], rules: [...], note}; NULL = the default
 *   (any brand + all 4 rules).
 * - order_item_adjustments — a tank NOT accepted at handover (rider delivery or store pick-up): per refill item, how many,
 *   why, the photo, the customer's choice (switch to new purchase / cancel the item) and the money effect.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->json('opening_hours')->nullable()->after('pickup_instructions');
            $table->timestamp('closed_today_until')->nullable()->after('opening_hours');
            $table->json('exchange_policy')->nullable()->after('closed_today_until');
        });

        Schema::create('order_item_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();
            $table->unsignedSmallInteger('quantity');
            $table->string('reason', 40);                 // wrong_brand | dented | leaking | valve | requalification | other
            $table->string('note', 300)->nullable();
            $table->string('photo_path');                 // private (local disk)
            $table->string('choice', 20);                 // new_purchase | cancel
            $table->decimal('unit_price_before', 10, 2);  // the refill price
            $table->decimal('unit_price_after', 10, 2)->nullable();   // new purchase price (switch only)
            $table->decimal('amount_change', 10, 2);      // + collect more (switch) / − less to pay (cancel)
            $table->string('stage', 20);                  // delivery | pickup
            $table->foreignId('refund_request_id')->nullable()->constrained('refund_requests')->nullOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_item_adjustments');
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['opening_hours', 'closed_today_until', 'exchange_policy']);
        });
    }
};
