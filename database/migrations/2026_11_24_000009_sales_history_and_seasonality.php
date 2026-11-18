<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * J8 — past sales that are NOT platform orders (a store's notebook / Excel records imported as CSV, or generated demo
 * history). Only the seasonal forecast reads this table — orders, invoices, receipts, revenue, commissions and reports
 * never do.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('product_label');                 // kept if the product is deleted, e.g. "11kg Petron Gasul"
            $table->string('size_group', 20)->nullable();    // "11 kg" (LpgSize::label) or "accessory"
            $table->date('sold_on');
            $table->unsignedInteger('quantity');
            $table->enum('source', ['import', 'demo']);
            $table->string('import_batch', 36)->nullable();  // uuid of one CSV upload
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['store_id', 'sold_on']);
            $table->index(['store_id', 'product_id', 'sold_on']);
            $table->index(['store_id', 'import_batch']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_history');
    }
};
