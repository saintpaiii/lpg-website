<?php

namespace App\Console\Commands;

use App\Models\Conversation;
use App\Models\ConversationMessage;
use App\Models\ConversationRead;
use App\Models\ConversationRiderAccess;
use App\Services\ChatService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One chat per customer + store: fold every old customer↔rider chat into the customer's store chat
 * (messages kept, the rider gets an access window), and turn the old order notices into automatic
 * store messages. Idempotent — safe to run again.
 */
class ChatMergeRiderChats extends Command
{
    protected $signature = 'chat:merge-rider-chats';

    protected $description = 'Merge per-delivery rider chats into the customer↔store chat.';

    /** Old order notices (from the first chat version) → automatic store message kind. */
    private const ORDER_NOTICES = [
        'We received your order%'   => 'order_created',
        '%has been confirmed%'      => 'order_confirmed',
        "We're preparing your order%" => 'order_preparing',
        '%is on the way.'           => 'order_out_for_delivery',
        '%was delivered.%'          => 'order_delivered',
        '%was cancelled.%'          => 'order_cancelled',
        'Reminder: your balance%'   => null,
    ];

    public function handle(): int
    {
        // 1. Old order notices in customer↔store chats become automatic store messages
        $converted = 0;
        foreach (self::ORDER_NOTICES as $pattern => $kind) {
            $converted += ConversationMessage::where('sender_side', 'system')->where('body', 'like', $pattern)
                ->whereHas('conversation', fn ($q) => $q->where('type', Conversation::CUSTOMER_STORE))
                ->update(['sender_side' => 'store', 'is_automatic' => true, 'auto_kind' => $kind]);
        }

        // 2. Merge each customer↔rider chat into the customer↔store chat
        $merged = 0; $moved = 0; $orphans = 0;
        Conversation::where('type', Conversation::CUSTOMER_RIDER)->with('delivery')->orderBy('id')
            ->each(function (Conversation $old) use (&$merged, &$moved, &$orphans) {
                if (! $old->customer_id) {
                    $orphans++;
                    return;
                }
                DB::transaction(function () use ($old, &$merged, &$moved) {
                    $target = ChatService::customerStoreConversation($old->customer_id, $old->store_id);
                    $ids    = ConversationMessage::where('conversation_id', $old->id)->pluck('id');
                    $moved += ConversationMessage::where('conversation_id', $old->id)->update(['conversation_id' => $target->id]);

                    if ($old->delivery_id && $old->rider_id && $old->delivery) {
                        $active = in_array($old->delivery->status, ['assigned', 'picked_up', 'in_transit'], true);
                        $from   = $ids->isNotEmpty() ? $ids->min() - 1 : (int) ConversationMessage::where('conversation_id', $target->id)->max('id');
                        ConversationRiderAccess::updateOrCreate(
                            ['conversation_id' => $target->id, 'delivery_id' => $old->delivery_id, 'rider_id' => $old->rider_id],
                            [
                                'from_message_id' => $from,
                                'to_message_id'   => $active ? null : ($ids->max() ?? $from),
                                'ended_at'        => $active ? null : ($old->closed_at ?? $old->delivery->updated_at ?? now()),
                            ],
                        );
                    }

                    // Latest message → list preview
                    $last = ConversationMessage::where('conversation_id', $target->id)->latest('id')->first();
                    $target->forceFill([
                        'last_message_at'      => $last?->created_at,
                        'last_message_preview' => $last ? Str::limit($last->body ?: '📷 Photo', 110) : null,
                    ])->save();

                    ConversationRead::where('conversation_id', $old->id)->delete();
                    $old->delete();
                    $merged++;
                });
            });

        $this->info("Merged {$merged} rider chat(s) ({$moved} message(s) moved). Converted {$converted} order notice(s) to automatic store messages."
            . ($orphans ? " {$orphans} skipped (customer account deleted)." : ''));

        return self::SUCCESS;
    }
}
