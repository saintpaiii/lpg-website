<?php

/*
| J7 — cylinders, expiry, auto-reorder and the supplier DSS.
*/
return [

    // Expiry (requalification date) warnings: the Inventory page badges and `cylinders:check-expiry` notify at these
    // many days before the date — and once more on the day it expires (0).
    'warn_days' => [90, 30],

    // Auto-reorder (ReorderService): reorder point = max(manual reorder level, ceil(avg_daily × lead) + safety stock);
    // order up to = reorder point + max(ceil(avg_daily × cover_days), 1); suggested qty = order up to − usable − on order,
    // at least the supplier's min qty and rounded up to a multiple of it.
    'reorder' => [
        'sales_days'        => 30,   // average daily sales over this many days
        'safety_days'       => 2,    // safety stock = ceil(avg_daily × safety_days)
        'cover_days'        => 14,   // order enough for this many days of sales
        'default_lead_days' => 2,    // when the product has no preferred supplier
    ],

    // DSS "Suppliers & Cylinders" — rule-based, last `days` days
    'dss' => [
        'days'              => 90,
        'inspect_rate'      => 5,    // damage rate % → "Inspect every delivery from X / ask for replacement"
        'switch_rate'       => 10,   // damage rate % → "Consider switching to Y" (when Y is lower for that product)
        'late_pct'          => 30,   // % of POs received late → "Order N days earlier from X"
        'min_received'      => 10,   // a damage rate needs at least this many cylinders received
        'expiry_soon_days'  => 30,
        'empties_min'       => 10,   // "You hold 40 empty 11kg cylinders — send them with your next refill PO"
    ],
];
