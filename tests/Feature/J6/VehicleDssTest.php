<?php

use App\Services\DeliveryFeeService;
use App\Services\VehicleDssService;

uses(Tests\Concerns\BuildsLpgWorld::class);

$cap = fn (string $label, float $kg, int $tanks, ?array $limits = null) => ['label' => $label, 'kg' => $kg, 'tanks' => $tanks, 'tank_limits' => $limits];

test('best vehicle: smallest fit first, then fewer stops, then distance', function () use ($cap) {
    $need = ['kg' => 50, 'tanks' => 2, 'by_size' => ['11' => 2]];
    $pin = [14.42, 120.95];
    $riders = [
        ['id' => 1, 'name' => 'Ana',   'vehicle' => $cap('Multicab AAA-111', 300, 12), 'on_board' => ['kg' => 0, 'tanks' => 0], 'stops' => 0, 'last_point' => [14.421, 120.951]],
        ['id' => 2, 'name' => 'Ben',   'vehicle' => $cap('Tricycle BBB-222', 150, 6),  'on_board' => ['kg' => 0, 'tanks' => 0], 'stops' => 2, 'last_point' => [14.43, 120.96]],
        ['id' => 3, 'name' => 'Carlo', 'vehicle' => $cap('Tricycle CCC-333', 150, 6),  'on_board' => ['kg' => 0, 'tanks' => 0], 'stops' => 1, 'last_point' => [14.50, 121.00]],
        ['id' => 4, 'name' => 'Dina',  'vehicle' => $cap('Tricycle DDD-444', 150, 6),  'on_board' => ['kg' => 0, 'tanks' => 0], 'stops' => 1, 'last_point' => [14.422, 120.952]],
        ['id' => 5, 'name' => 'Ed',    'vehicle' => $cap('Motorcycle EEE-555', 60, 2), 'on_board' => ['kg' => 25, 'tanks' => 1], 'stops' => 0, 'last_point' => $pin],
        ['id' => 6, 'name' => 'Fe',    'vehicle' => null, 'stops' => 0],
    ];
    $r = VehicleDssService::rankRiders($need, $pin, $riders);

    // Ed's motorcycle can't take 2 more tanks; Fe has no vehicle. Tricycles (smallest that fit): 1 stop before 2 stops,
    // then the nearer one (Dina) before Carlo. The multicab (most spare kg) comes last of those that fit.
    expect(array_column($r['ranked'], 'id'))->toBe([4, 3, 2, 1, 5, 6])
        ->and($r['recommended']['id'])->toBe(4)
        ->and($r['text'])->toStartWith('Dina — Tricycle DDD-444: fits 50/150 kg, 1 stop,')
        ->and($r['ranked'][4]['ok'])->toBeFalse()
        ->and($r['ranked'][5]['reason'])->toBe('not clocked in with a vehicle');
});

test('when nobody free fits, the wait hint names the store vehicle that could carry it', function () use ($cap) {
    $need = ['kg' => 200, 'tanks' => 8, 'by_size' => ['22' => 4, '11' => 1]];
    $rank = VehicleDssService::rankRiders($need, null, [['id' => 1, 'name' => 'Ana', 'vehicle' => $cap('Tricycle T-1', 150, 6), 'stops' => 0]]);
    $hint = VehicleDssService::waitHint($need, $rank, [['cap' => $cap('Tricycle T-1', 150, 6)], ['cap' => $cap('Multicab M-1', 300, 12), 'held_by' => 'Ben', 'stops' => 2]]);

    expect($rank['recommended'])->toBeNull()
        ->and($hint)->toBe("Multicab M-1 can carry this order — it's out with Ben (2 stops). Wait, or assign after Ben returns.");
});

test('an order heavier than the biggest vehicle gets a concrete split by size', function () use ($cap) {
    // 4 × 11kg (100 kg) + 2 × 50kg (180 kg) = 280 kg / 6 tanks; vehicles: tricycle 150 kg, multicab 300 kg limited to 1 × 50kg
    $need = ['kg' => 280, 'tanks' => 6, 'by_size' => ['11' => 4, '50' => 2]];
    $caps = [$cap('Tricycle', 150, 6), $cap('Multicab', 300, 12, ['50' => 1])];
    expect(collect($caps)->contains(fn ($c) => DeliveryFeeService::fitsCapacity($c, $need) === null))->toBeFalse();

    $split = VehicleDssService::splitTrips($need, $caps);
    expect($split['trips'])->toHaveCount(2)
        ->and($split['text'])->toBe('Trip 1: 1 × 50kg + 4 × 11kg on Multicab · Trip 2: 1 × 50kg on Tricycle');   // 190 kg → multicab; 90 kg → tricycle
    $all = collect($split['trips'])->reduce(fn ($m, $t) => collect($t['items'])->each(function ($q, $s) use (&$m) { $m[$s] = ($m[$s] ?? 0) + $q; }) ? $m : $m, []);
    expect($all)->toEqual(['50' => 2, '11' => 4]);

    // A tank no vehicle can carry → no split
    expect(VehicleDssService::splitTrips(['by_size' => ['50' => 1]], [$cap('Motorcycle', 60, 2)]))->toBeNull();
});

test('the fleet card recommends a bigger vehicle type after enough capacity misses', function () {
    $cfg = config('delivery.dss');
    $base = ['days' => 30, 'waits' => [], 'peak_active' => 1, 'vehicles' => 1, 'biggest' => ['label' => 'Tricycle', 'kg' => 150.0, 'type' => 'tricycle'], 'busiest_type' => 'tricycle'];

    $few = VehicleDssService::recommend($base + ['miss_count' => 2, 'miss_kg' => [200, 220]], $cfg);
    expect($few[0]['kind'])->toBe('ok')->and($few[0]['text'])->toStartWith('No change needed');

    $kgs = [180, 200, 220, 250, 260, 280, 290, 200, 210, 230, 240, 295];
    $many = VehicleDssService::recommend($base + ['miss_count' => count($kgs), 'miss_kg' => $kgs], $cfg);
    expect($many[0]['kind'])->toBe('bigger_vehicle')
        ->and($many[0]['text'])->toBe('12 orders in 30 days were over your biggest vehicle (Tricycle 150 kg). Most needed ≤ 280 kg → consider adding a Multicab.');

    // Waits on many days → one more of the busiest type
    $waits = collect(range(1, 9))->map(fn ($d) => ['date' => "2026-11-0{$d}", 'hour' => 16])->all();
    $busy = VehicleDssService::recommend(array_merge($base, ['miss_count' => 0, 'miss_kg' => [], 'waits' => $waits, 'busiest_type' => 'motorcycle']), $cfg);
    expect($busy[0]['text'])->toBe('Vehicles were all busy on 9 days at 4–6 PM (orders waited over 2 h for a rider) → consider 1 more Motorcycle.');
});

test('fleet() counts capacity misses saved by checkout and per-vehicle use', function () {
    $store = $this->makeStore();
    $this->makeVehicle($store, 'tricycle', 150, 6);
    foreach (range(1, 6) as $i) {
        \App\Models\VehicleCapacityMiss::create(['store_id' => $store->id, 'kg' => 200 + $i * 10, 'tanks' => 8, 'by_size' => ['22' => 4], 'reason' => 'too_heavy']);
    }
    $fleet = VehicleDssService::fleet($store->fresh());

    expect($fleet['miss_count'])->toBe(6)
        ->and($fleet['recommendations'][0]['kind'])->toBe('bigger_vehicle')
        ->and($fleet['per_vehicle'])->toHaveCount(1)
        ->and($fleet['per_vehicle'][0]['trips'])->toBe(0);
});
