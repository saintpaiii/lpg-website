<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reported_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reported_store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->enum('type', ['buyer_report', 'seller_report']); // buyer_report = customer reports seller; seller_report = seller reports customer
            $table->enum('category', [
                'fraud',
                'fake_product',
                'rude_behavior',
                'non_delivery',
                'overpricing',
                'harassment',
                'counterfeit',
                'other',
            ]);
            $table->string('subject');
            $table->text('description');
            $table->json('evidence_paths')->nullable();
            $table->enum('status', ['pending', 'under_review', 'resolved', 'dismissed'])->default('pending');
            $table->text('admin_notes')->nullable();
            $table->text('resolution')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_reports');
    }
};
