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

];
