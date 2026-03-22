<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating'); // 1–5 stars
            $table->text('review')->nullable();
            $table->timestamps();

            // One rating per user per product per order
            $table->unique(['user_id', 'product_id', 'order_id']);
            $table->index('store_id');
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ratings');
    }
};
