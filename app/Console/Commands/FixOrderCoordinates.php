<?php

namespace App\Console\Commands;

use App\Http\Controllers\BarangayCoordinateController;
use App\Models\Order;
use Illuminate\Console\Command;

/**
 * Re-anchor order pins to the barangay_coordinates entry for the order's TEXT delivery address
 * (orders.delivery_city/barangay, else customers.city/barangay). The rider map shows that address
 * next to the pin, so the two must agree. customers.latitude/longitude is never used.
 *
 * Orders placed with a chosen delivery address (saved address / map search, orders.delivery_address)
 * got their pin deliberately at checkout, so they're skipped unless --include-new is given.
 */
class FixOrderCoordinates extends Command
{
    protected $signature = 'order:fix-coordinates
                            {--keep-within=0 : Keep existing pins within this many km of the barangay (0 = reset all)}
                            {--include-new : Also reset orders placed with a chosen delivery address}
                            {--dry-run : Show what would change without saving}';

    protected $description = 'Set order delivery coordinates from barangay_coordinates using the delivery city + barangay.';

    public function handle(): int
    {
        $keepKm = (float) $this->option('keep-within');
        $dry    = (bool) $this->option('dry-run');
        $all    = (bool) $this->option('include-new');

        $fixed = 0; $kept = 0; $missed = [];
        $rows  = [];

        Order::withTrashed()->with('customer')->chunkById(200, function ($orders) use ($keepKm, $dry, $all, &$fixed, &$kept, &$missed, &$rows) {
            foreach ($orders as $order) {
                if ($order->delivery_address && ! $all) {
                    $kept++;
                    continue;
                }
                $addr = $order->deliveryAddressParts();
                $geo  = BarangayCoordinateController::resolve($addr['city'], $addr['barangay']);
                if ($geo['precision'] === 'none') {
                    $missed[] = trim(($addr['barangay'] ?? '?') . ', ' . ($addr['city'] ?? '?'));
                    $this->warn("No match in barangay_coordinates for: {$addr['barangay']}, {$addr['city']} (Order: {$order->order_number})");
                    continue;
                }
                $at = [(float) $geo['latitude'], (float) $geo['longitude']];

                $hasPin = $order->delivery_latitude !== null && $order->delivery_longitude !== null;
                $km     = $hasPin ? BarangayCoordinateController::distanceKm($at, [(float) $order->delivery_latitude, (float) $order->delivery_longitude]) : null;

                if ($hasPin && $km < 0.001) {   // already exactly on the barangay point
                    $kept++;
                    continue;
                }
                if ($hasPin && $keepKm > 0 && $km <= $keepKm) {
                    $kept++;
                    continue;
                }

                $rows[] = [
                    $order->order_number,
                    "{$addr['barangay']}, {$addr['city']}" . ($geo['precision'] === 'city' ? ' (city centre)' : ''),
                    $hasPin ? sprintf('%.5f, %.5f', $order->delivery_latitude, $order->delivery_longitude) : '—',
                    $km !== null ? number_format($km, 2) . ' km' : 'no pin',
                    sprintf('%.5f, %.5f', $at[0], $at[1]),
                ];
                if (! $dry) {
                    $order->forceFill(['delivery_latitude' => $at[0], 'delivery_longitude' => $at[1]])->saveQuietly();
                }
                $fixed++;
            }
        });

        if ($rows) {
            $this->table(['Order', 'Customer address', 'Old pin', 'Off by', 'New pin (barangay_coordinates)'], $rows);
        }
        $this->info(($dry ? '[dry run] Would fix ' : 'Fixed ') . "{$fixed} order(s). {$kept} already correct"
            . ($keepKm > 0 ? " or within {$keepKm} km" : '') . '. ' . count($missed) . ' skipped (address not recognised).');

        return self::SUCCESS;
    }
}
