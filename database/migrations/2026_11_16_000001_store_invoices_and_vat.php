<?php

use App\Services\InvoiceService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Store invoices (EOPT Act / RR 7-2024): the STORE issues the invoice.
 *  - stores: VAT status, TIN, registered name / address and the store's own invoice series (prefix + next number)
 *  - invoices: a snapshot of the seller and the VAT split at issue time (null vat_status = issued before this change)
 *  - orders: optional buyer TIN given at checkout
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('vat_status', 10)->default('non_vat');          // vat | non_vat
            $table->string('tin', 20)->nullable();
            $table->string('registered_name')->nullable();
            $table->string('registered_address', 500)->nullable();
            $table->string('invoice_prefix', 5)->nullable();
            $table->unsignedInteger('invoice_next_number')->default(1);
        });

        // Every store (archived ones too) gets its own invoice code before the unique index
        $taken = [];
        foreach (DB::table('stores')->orderBy('id')->get(['id', 'store_name']) as $s) {
            $prefix = InvoiceService::prefixFor((string) $s->store_name, $taken);
            $taken[] = $prefix;
            DB::table('stores')->where('id', $s->id)->update(['invoice_prefix' => $prefix]);
        }

        Schema::table('stores', function (Blueprint $table) {
            $table->unique('invoice_prefix');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->string('vat_status', 10)->nullable();
            $table->string('seller_name')->nullable();
            $table->string('seller_tin', 20)->nullable();
            $table->string('seller_address', 500)->nullable();
            $table->string('buyer_tin', 20)->nullable();
            $table->decimal('grand_total', 10, 2)->nullable();
            $table->decimal('vatable_sales', 10, 2)->nullable();
            $table->decimal('vat_amount', 10, 2)->nullable();
            $table->timestamp('emailed_at')->nullable();
            $table->timestamp('paid_emailed_at')->nullable();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('buyer_tin', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropUnique(['invoice_prefix']);
        });
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['vat_status', 'tin', 'registered_name', 'registered_address', 'invoice_prefix', 'invoice_next_number']);
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['vat_status', 'seller_name', 'seller_tin', 'seller_address', 'buyer_tin', 'grand_total',
                'vatable_sales', 'vat_amount', 'emailed_at', 'paid_emailed_at']);
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('buyer_tin');
        });
    }
};
