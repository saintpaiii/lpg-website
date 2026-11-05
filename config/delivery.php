<?php

return [

    /*
    | Why a delivery didn't push through (rider / seller "Failed" dialog).
    */
    'fail_reasons' => [
        'customer_not_home'    => 'Customer not at home',
        'customer_unreachable' => "Customer can't be reached",
        'wrong_address'        => 'Wrong or incomplete address',
        'customer_refused'     => 'Customer refused the order',
        'no_payment'           => "Customer couldn't pay (COD)",
        'wrong_item'           => 'Wrong item or size',
        'vehicle_problem'      => 'Vehicle problem',
        'bad_weather'          => 'Bad weather / flooding',
        'road_closed'          => 'Road closed / no access',
        'no_empty_tank'        => 'No empty tank to exchange',
        'other'                => 'Other',
    ],

    /*
    | Reasons that don't need a redelivery date (the order won't simply be retried).
    */
    'no_redelivery_reasons' => ['customer_refused', 'wrong_item'],

    /*
    | Estimated redelivery range: must start within this many days, and span at most this many days.
    */
    'redeliver_max_start_days' => 14,
    'redeliver_max_range_days' => 7,

    /*
    | Vehicle types: label + suggested delivery fee (base ₱ + ₱ per km) when a store adds its first vehicle of a type,
    | and the LEGAL maximum load per trip (full tanks): RA 11592 Sec. 38(d)(11) forbids loading LPG cylinders beyond a
    | vehicle's capacity. A store may set a lower limit for a vehicle, never higher.
    | The order here is also the last tie-break when two types quote the same fee.
    */
    'vehicle_types' => [
        'motorcycle'   => ['label' => 'Motorcycle',   'default_base' => 40,  'default_per_km' => 8,  'max_tanks' => 2,   'max_kg' => 60],
        'tricycle'     => ['label' => 'Tricycle',     'default_base' => 50,  'default_per_km' => 10, 'max_tanks' => 6,   'max_kg' => 150],
        'multicab'     => ['label' => 'Multicab',     'default_base' => 80,  'default_per_km' => 12, 'max_tanks' => 12,  'max_kg' => 300],
        'van'          => ['label' => 'Van',          'default_base' => 100, 'default_per_km' => 15, 'max_tanks' => 40,  'max_kg' => 1000],
        'pickup_truck' => ['label' => 'Pickup Truck', 'default_base' => 120, 'default_per_km' => 15, 'max_tanks' => 32,  'max_kg' => 800],
        'small_truck'  => ['label' => 'Small Truck',  'default_base' => 150, 'default_per_km' => 18, 'max_tanks' => 80,  'max_kg' => 2000],
        'large_truck'  => ['label' => 'Large Truck',  'default_base' => 200, 'default_per_km' => 20, 'max_tanks' => 280, 'max_kg' => 7000],
    ],

    /*
    | Weight of a FULL tank (gas + cylinder) by gas size in kg; any other size → round(gas × 2, 1).
    | Must match FULL_TANK_KG in resources/js/lib/delivery-fee.ts.
    */
    'full_tank_kg' => ['2.7' => 7, '5' => 12, '7' => 15, '11' => 25, '22' => 45, '50' => 90],

];
