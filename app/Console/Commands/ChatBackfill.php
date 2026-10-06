<?php

namespace App\Console\Commands;

use App\Models\Delivery;
use App\Services\ChatService;
use Illuminate\Console\Command;

/**
 * For deliveries already on the road: put the rider into the customer↔store chat and open the
 * store↔rider chat. Silent (no notices for old orders). Idempotent.
 */
class ChatBackfill extends Command
{
    protected $signature = 'chat:backfill';

    protected $description = 'Add riders of active deliveries to their customers\' chats.';

    public function handle(): int
    {
        $joined = 0; $storeRider = 0; $skipped = 0;

        Delivery::with('order.customer', 'rider')
            ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])
            ->whereNotNull('rider_id')
            ->whereHas('order', fn ($q) => $q->where('status', 'out_for_delivery'))
            ->chunkById(100, function ($deliveries) use (&$joined, &$storeRider, &$skipped) {
                foreach ($deliveries as $d) {
                    $access = ChatService::riderJoin($d, announce: false);
                    $access ? ($access->wasRecentlyCreated && $joined++) : $skipped++;

                    if ($storeId = $d->store_id ?? $d->order?->store_id) {
                        ChatService::storeRiderConversation($storeId, $d->rider_id)->wasRecentlyCreated && $storeRider++;
                    }
                }
            });

        $this->info("Riders added to {$joined} customer chat(s); {$storeRider} store–rider chat(s) created. "
            . "{$skipped} delivery(ies) skipped (walk-in customer without an account).");

        return self::SUCCESS;
    }
}
