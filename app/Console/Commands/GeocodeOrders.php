<?php

namespace App\Console\Commands;

use App\Http\Controllers\BarangayCoordinateController;
use App\Models\Order;
use App\Services\DeliveryRouteService;
use Illuminate\Console\Command;

/** Backfill delivery coordinates for orders placed without a map pin, from the order's delivery barangay (or the customer's). */
class GeocodeOrders extends Command
{
    protected $signature   = 'orders:geocode';
    protected $aliases     = ['order:backfill-coordinates'];
    protected $description = 'Fill missing order delivery coordinates from the barangay_coordinates lookup table.';

    public function handle(): int
    {
        $filled = 0;
        $approx = 0;
        $missed = [];

        Order::withTrashed()->with('customer')
            ->where(fn ($q) => $q->whereNull('delivery_latitude')->orWhereNull('delivery_longitude'))
            ->chunkById(200, function ($orders) use (&$filled, &$approx, &$missed) {
                foreach ($orders as $order) {
                    if (DeliveryRouteService::geocodeOrder($order)) {
                        $filled++;
                        continue;
                    }
                    // Barangay not in the table — fall back to the city centre (still better than nothing for the rider map)
                    $addr = $order->deliveryAddressParts();
                    $geo  = BarangayCoordinateController::resolve($addr['city'], $addr['barangay']);
                    if ($geo['precision'] === 'city') {
                        $order->forceFill(['delivery_latitude' => $geo['latitude'], 'delivery_longitude' => $geo['longitude']])->saveQuietly();
                        $approx++;
                    } else {
                        $missed[] = trim(($order->deliveryAddressParts()['barangay'] ?? '?') . ', ' . ($order->deliveryAddressParts()['city'] ?? '?'));
                    }
                }
            });

        $this->info("Geocoded {$filled} order(s) by barangay, {$approx} by city centre. " . count($missed) . ' could not be mapped.');
        foreach (array_count_values($missed) as $place => $n) {
            $this->line("  - {$place} ({$n})");
        }

        return self::SUCCESS;
    }
}
