<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chat: customer↔store, store↔rider (both permanent per pair) and customer↔rider (one per
 * delivery, closed when the delivery finishes). customer_id / rider_id are USERS (not the
 * customers table). Always create conversations through App\Services\ChatService — MySQL
 * treats NULLs as distinct, so the unique index alone doesn't stop duplicates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['customer_store', 'store_rider', 'customer_rider']);
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('rider_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('delivery_id')->nullable()->constrained('deliveries')->nullOnDelete(); // customer_rider only
            $table->timestamp('last_message_at')->nullable();
            $table->string('last_message_preview', 120)->nullable();
            $table->timestamp('closed_at')->nullable(); // customer_rider: delivery finished
            $table->timestamps();

            $table->index(['store_id', 'type', 'last_message_at']);
            $table->index(['customer_id', 'last_message_at']);
            $table->index(['rider_id', 'last_message_at']);
            $table->unique(['type', 'store_id', 'customer_id', 'rider_id', 'delivery_id'], 'conversations_unique_pair');
        });

        Schema::create('conversation_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete(); // NULL = system auto-message
            $table->enum('sender_side', ['customer', 'store', 'rider', 'system']);
            $table->text('body')->nullable();
            $table->string('attachment_path')->nullable();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->timestamps();

            $table->index(['conversation_id', 'id']);
        });

        Schema::create('conversation_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('last_read_message_id')->default(0);
            $table->timestamps();
            $table->unique(['conversation_id', 'user_id']);
        });

        Schema::create('store_quick_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('title', 60);
            $table->text('body');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_quick_replies');
        Schema::dropIfExists('conversation_reads');
        Schema::dropIfExists('conversation_messages');
        Schema::dropIfExists('conversations');
    }
};
