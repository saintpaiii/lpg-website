<?php

namespace App\Console\Commands;

use App\Models\BarangayCoordinate;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Console\Command;

/**
 * Re-pin saved addresses (customer_addresses) and customer profiles (customers.latitude/longitude)
 * at their barangay's centre from barangay_coordinates — e.g. after correcting that table.
 * Only rows whose barangay is found in the table are changed.
 */
class FixAddressCoordinates extends Command
{
    protected $signature = 'address:fix-coordinates {--dry-run : Show what would change without saving}';

    protected $description = 'Reset saved-address and customer-profile pins to their barangay centre (barangay_coordinates).';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $rows = [];

        $fix = function (string $kind, $model, ?string $city, ?string $barangay, string $label) use ($dry, &$rows) {
            $geo = BarangayCoordinate::lookup($city, $barangay);
            if (! $geo) {
                return 'skipped';
            }
            [$lat, $lng] = [(float) $geo[0], (float) $geo[1]];
            if ($model->latitude !== null && abs((float) $model->latitude - $lat) < 1e-6 && abs((float) $model->longitude - $lng) < 1e-6) {
                return 'same';
            }
            $rows[] = [$kind, $label, "{$barangay}, {$city}",
                $model->latitude !== null ? sprintf('%.5f, %.5f', $model->latitude, $model->longitude) : '—',
                sprintf('%.5f, %.5f', $lat, $lng)];
            if (! $dry) {
                $model->forceFill(['latitude' => $lat, 'longitude' => $lng])->saveQuietly();
            }
            return 'fixed';
        };

        $tally = ['addresses' => ['fixed' => 0, 'same' => 0, 'skipped' => 0], 'profiles' => ['fixed' => 0, 'same' => 0, 'skipped' => 0]];

        CustomerAddress::whereNotNull('city')->orderBy('id')->each(function (CustomerAddress $a) use ($fix, &$tally) {
            $tally['addresses'][$fix('address', $a, $a->city, $a->barangay, "#{$a->id} {$a->label} (user {$a->user_id})")]++;
        });
        Customer::whereNotNull('city')->orderBy('id')->each(function (Customer $c) use ($fix, &$tally) {
            $tally['profiles'][$fix('profile', $c, $c->city, $c->barangay, "#{$c->id} {$c->name}")]++;
        });

        if ($rows) {
            $this->table(['Type', 'Record', 'Barangay', 'Old pin', 'New pin'], $rows);
        }
        foreach ($tally as $kind => $t) {
            $this->info(($dry ? '[dry run] ' : '') . ucfirst($kind) . ": {$t['fixed']} " . ($dry ? 'would be fixed' : 'fixed')
                . ", {$t['same']} already correct, {$t['skipped']} skipped (barangay not in table).");
        }

        return self::SUCCESS;
    }
}
