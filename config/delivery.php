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
    | Vehicle types: label + suggested delivery fee (base ₱ + ₱ per km) when a store adds its first vehicle of a type.
    | The order here is also the last tie-break when two types quote the same fee.
    */
    'vehicle_types' => [
        'motorcycle'   => ['label' => 'Motorcycle',   'default_base' => 40,  'default_per_km' => 8],
        'tricycle'     => ['label' => 'Tricycle',     'default_base' => 50,  'default_per_km' => 10],
        'multicab'     => ['label' => 'Multicab',     'default_base' => 80,  'default_per_km' => 12],
        'van'          => ['label' => 'Van',          'default_base' => 100, 'default_per_km' => 15],
        'pickup_truck' => ['label' => 'Pickup Truck', 'default_base' => 120, 'default_per_km' => 15],
        'small_truck'  => ['label' => 'Small Truck',  'default_base' => 150, 'default_per_km' => 18],
        'large_truck'  => ['label' => 'Large Truck',  'default_base' => 200, 'default_per_km' => 20],
    ],

];
