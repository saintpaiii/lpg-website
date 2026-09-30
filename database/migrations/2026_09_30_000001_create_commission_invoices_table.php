<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commission_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('invoice_number')->unique();
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedInteger('total_orders')->default(0);
            $table->decimal('total_sales', 12, 2)->default(0);
            $table->decimal('commission_rate', 5, 2)->default(5.00);
            $table->decimal('commission_amount', 10, 2)->default(0);
            $table->enum('status', ['pending', 'paid', 'overdue', 'waived'])->default('pending');
            $table->date('due_date');
            $table->timestamp('paid_at')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_method')->nullable();
            $table->string('paymongo_checkout_id')->nullable()->index();
            $table->text('notes')->nullable();
            // Notification bookkeeping so the daily job notifies each stage once
            $table->timestamp('reminder_sent_at')->nullable();
            $table->timestamp('due_notice_sent_at')->nullable();
            $table->timestamp('overdue_notified_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'status']);
        });

        Schema::table('commissions', function (Blueprint $table) {
            $table->foreignId('commission_invoice_id')->nullable()->after('store_id')
                ->constrained('commission_invoices')->nullOnDelete();
        });

        DB::statement("ALTER TABLE commissions MODIFY COLUMN status ENUM('pending','invoiced','collected','failed','waived') NOT NULL DEFAULT 'pending'");

        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('commission_suspended')->default(false)->after('suspended_by');
            $table->timestamp('commission_suspended_at')->nullable()->after('commission_suspended');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['commission_suspended', 'commission_suspended_at']);
        });

        DB::table('commissions')->whereIn('status', ['invoiced'])->update(['status' => 'pending']);
        DB::table('commissions')->whereIn('status', ['waived'])->update(['status' => 'failed']);
        DB::statement("ALTER TABLE commissions MODIFY COLUMN status ENUM('pending','collected','failed') NOT NULL DEFAULT 'pending'");

        Schema::table('commissions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('commission_invoice_id');
        });

        Schema::dropIfExists('commission_invoices');
    }
};
