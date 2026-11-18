<?php

namespace App\Console\Commands;

use App\Models\CylinderBatch;
use App\Models\Store;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StaffAccess;
use Illuminate\Console\Command;

/**
 * J7: cylinder batches reaching their requalification (expiry) date — notify the store owner + inventory staff once per
 * batch per threshold (config('inventory.warn_days') e.g. 90 and 30 days before, and 0 = expired). Idempotent: the
 * thresholds already sent are kept in cylinder_batches.expiry_notices.
 */
class CheckCylinderExpiry extends Command
{
    protected $signature   = 'cylinders:check-expiry';
    protected $description = 'Notify stores about cylinder batches nearing / past their requalification date (once per threshold).';

    public function handle(): int
    {
        $thresholds = collect(config('inventory.warn_days', [90, 30]))->map(fn ($d) => (int) $d)->push(0)->unique()->sortDesc()->values();
        $sent = 0;

        CylinderBatch::with('product')->where('quantity_remaining', '>', 0)->whereNotNull('requalification_due_on')
            ->whereDate('requalification_due_on', '<=', now()->addDays($thresholds->max())->toDateString())
            ->orderBy('id')->chunkById(200, function ($batches) use ($thresholds, &$sent) {
                foreach ($batches as $batch) {
                    $days = $batch->daysLeft();
                    $done = collect($batch->expiry_notices ?? [])->map(fn ($d) => (int) $d);
                    // The tightest threshold reached (e.g. 28 days left → 30); skip when already sent. The wider ones are
                    // marked done with it, so a batch that first shows up at 28 days gets ONE notice, not 90 + 30.
                    $hit = $thresholds->filter(fn ($t) => $days <= $t)->min();
                    if ($hit === null || $done->contains($hit)) {
                        continue;
                    }
                    $name = $batch->product?->name ?? 'Cylinders';
                    [$title, $msg] = $hit === 0
                        ? ["Cylinders expired: {$name}", "Batch {$batch->batch_code}: {$batch->quantity_remaining} cylinder(s) passed their requalification date ({$batch->requalification_due_on->format('M j, Y')}). They won't be sold — mark them as expired and return them."]
                        : ["Cylinders expiring in {$days} day(s): {$name}", "Batch {$batch->batch_code}: {$batch->quantity_remaining} cylinder(s) reach their requalification date on {$batch->requalification_due_on->format('M j, Y')}. Sell these first or prepare requalification / return."];
                    foreach (static::recipients((int) $batch->store_id) as $uid) {
                        NotificationService::send($uid, 'inventory', $title, $msg, ['link' => '/seller/inventory?batches=' . $batch->product_id]);
                    }
                    // Record this threshold and every wider one (they're past too)
                    $batch->update(['expiry_notices' => $done->merge($thresholds->filter(fn ($t) => $t >= $hit))->unique()->sortDesc()->values()->all()]);
                    $sent++;
                }
            });

        $this->info("Expiry notices sent for {$sent} batch(es).");

        return self::SUCCESS;
    }

    /** The owner + staff who can see inventory. */
    public static function recipients(int $storeId): array
    {
        $ids = [(int) Store::whereKey($storeId)->value('user_id')];
        foreach (User::where('store_id', $storeId)->where('role', 'seller_staff')->where('is_active', true)->get() as $u) {
            if (StaffAccess::can($u, 'inventory.view')) {
                $ids[] = $u->id;
            }
        }

        return array_values(array_filter(array_unique($ids)));
    }
}
