<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One chat per customer + store: the assigned rider JOINS the customer↔store conversation for
 * the length of a delivery (conversation_rider_access) instead of a separate customer↔rider chat.
 * A rider only sees messages inside their window: from_message_id < id <= to_message_id (open while active).
 *
 * Existing customer_rider chats are merged by `php artisan chat:merge-rider-chats` (not here).
 * The 'customer_rider' enum value is kept so older migrations stay reversible — it's just unused.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversation_rider_access', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();   // the customer_store conversation
            $table->foreignId('rider_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->unsignedBigInteger('from_message_id')->default(0);   // rider sees messages with id > this
            $table->unsignedBigInteger('to_message_id')->nullable();     // …and <= this once their access ended
            $table->timestamp('ended_at')->nullable();                   // delivered / failed / reassigned
            $table->timestamps();

            // One row per rider per delivery (a reassigned delivery keeps the previous rider's ended row)
            $table->unique(['conversation_id', 'delivery_id', 'rider_id'], 'cra_conv_delivery_rider_unique');
            $table->index(['rider_id', 'ended_at'], 'cra_rider_ended_index');
        });

        Schema::table('conversation_messages', function (Blueprint $table) {
            $table->boolean('is_automatic')->default(false)->after('sender_side');
            $table->string('auto_kind', 60)->nullable()->after('is_automatic');   // e.g. order_created, delivery_picked_up
            $table->index(['order_id', 'auto_kind']);   // duplicate check for automatic messages
        });
    }

    public function down(): void
    {
        // MySQL silently drops the foreign key's own order_id index once the composite index can
        // serve it, so give the foreign key a plain index back before removing the composite one.
        if (! Schema::hasIndex('conversation_messages', 'conversation_messages_order_id_foreign')) {
            Schema::table('conversation_messages', function (Blueprint $table) {
                $table->index('order_id', 'conversation_messages_order_id_foreign');
            });
        }
        Schema::table('conversation_messages', function (Blueprint $table) {
            $table->dropIndex(['order_id', 'auto_kind']);
            $table->dropColumn(['is_automatic', 'auto_kind']);
        });
        Schema::dropIfExists('conversation_rider_access');
    }
};
