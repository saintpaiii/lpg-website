<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * K6 — supplier payment tracking on purchase orders.
 *
 *  purchase_orders: payment_status (unpaid | partial | paid), amount_paid, payment_due_on (set on the first receive
 *                   from the supplier's payment terms, or by hand), payment_reminders (which due/overdue notices were sent).
 *  purchase_order_payments: one row per payment to the supplier (or a supplier-return credit, supplier_return_id set).
 *
 * The other K6 fixes need no schema change: 'opening' batches use cylinder_batches.source (a string), and
 * inventory.suppliers moving to the Purchase approvals module is config only (role levels are computed from config).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->default('unpaid')->after('subtotal');
            $table->decimal('amount_paid', 12, 2)->default(0)->after('payment_status');
            $table->date('payment_due_on')->nullable()->after('amount_paid');
            $table->json('payment_reminders')->nullable()->after('payment_due_on');
            $table->index(['store_id', 'payment_status']);
        });

        Schema::create('purchase_order_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->date('paid_on');
            $table->enum('method', ['cash', 'bank_transfer', 'gcash', 'maya', 'check', 'other']);
            $table->string('reference', 100)->nullable();   // check no. / transaction ref
            $table->string('note', 500)->nullable();
            $table->foreignId('supplier_return_id')->nullable()->constrained('supplier_returns')->nullOnDelete();   // a return credit
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_payments');
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'payment_status']);
            $table->dropColumn(['payment_status', 'amount_paid', 'payment_due_on', 'payment_reminders']);
        });
    }
};
