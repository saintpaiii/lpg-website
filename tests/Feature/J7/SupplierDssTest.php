<?php

use App\Services\SupplierDssService;

$cfg = ['days' => 90, 'inspect_rate' => 5, 'switch_rate' => 10, 'late_pct' => 30, 'min_received' => 10];
$sup = fn (int $id, string $name, int $received, int $damaged, array $byProduct, array $products, ?int $onTime = 100, ?float $delay = 0.0) => [
    'id' => $id, 'name' => $name, 'lead_days' => 2, 'received' => $received, 'damaged' => $damaged, 'by_product' => $byProduct,
    'products' => $products, 'pos_received' => 3, 'avg_delay' => $delay, 'on_time_pct' => $onTime,
];

test('damage rate ≥ 10% with a better supplier for the same product → switch advice', function () use ($cfg, $sup) {
    $out = SupplierDssService::advise([
        $sup(1, 'Petron Supplier', 100, 12, [['product_id' => 7, 'name' => '11kg Petron', 'qty' => 12]], [7]),
        $sup(2, 'Gasul Depot', 250, 3, [], [7]),
    ], $cfg);

    expect($out[0]['damage_rate'])->toBe(12.0)
        ->and($out[0]['advice'])->toBe(['Consider switching to Gasul Depot (damage rate 1.2%) for 11kg Petron.'])
        ->and($out[1]['damage_rate'])->toBe(1.2)->and($out[1]['advice'])->toBe(['No issues.'])->and($out[1]['ok'])->toBeTrue();
});

test('damage rate ≥ 5% → inspect; late on ≥ 30% of POs → order earlier; below thresholds → No issues', function () use ($cfg, $sup) {
    $out = SupplierDssService::advise([
        $sup(1, 'Solane Hub', 100, 6, [], [1]),
        $sup(2, 'Slow Co', 100, 0, [], [2], 50, 1.6),
        $sup(3, 'Good Co', 100, 2, [], [3]),
        $sup(4, 'New Co', 4, 2, [], [4]),   // too few received for a rate
    ], $cfg);

    expect($out[0]['advice'])->toBe(['Inspect every delivery from Solane Hub / ask for replacement (damage rate 6%).'])
        ->and($out[1]['advice'])->toBe(['Order 2 days earlier from Slow Co (on time 50%, average 1.6 days late).'])
        ->and($out[2]['advice'])->toBe(['No issues.'])
        ->and($out[3]['damage_rate'])->toBeNull()->and($out[3]['advice'])->toBe(['No issues.']);
});
