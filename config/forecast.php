<?php

/*
| J8 — Seasonal (month-of-year) demand forecast in the Seller DSS (SeasonalForecastService) and the sales history
| behind it (CSV import + demo generator). Auto-reorder (config/inventory.php) does NOT use any of this.
*/
return [

    // Months of history used (complete months only; the current month is never counted as a full month)
    'max_months'      => 36,
    'min_months'      => 12,   // fewer → "not enough history", every index 1.00 (seasonality is never invented)
    'cma_months'      => 24,   // ≥ this → ratio-to-moving-average (centered 12-month MA); 12–23 → ratio-to-mean
    'trend_min_points'=> 6,    // fewer → no slope, the mean is the level
    'gap_months'      => 3,    // sales before a gap of this many months with NO sales are ignored (stray old rows)
    'forecast_months' => 3,
    'backtest_months' => 3,    // hold out the last N complete months …
    'backtest_min'    => 15,   // … only when there are at least this many

    // Labels
    'peak_index'      => 1.10, // the top 2 indices at / above this are "peak" months
    'low_index'       => 0.90, // the lowest index at / below this is the "low" month
    'mape_good'       => 15,   // MAPE < 15% Good, 15–30% Fair, > 30% Weak
    'mape_fair'       => 30,

    // Advice
    'advice_window_days' => 45,  // a peak / low month starting within this many days gets advice
    'default_lead_days'  => 2,   // when the product has no preferred supplier

    'cache_minutes'   => 30,

    // CSV import of past sales
    'import' => [
        'max_kb'         => 2048,
        'max_rows'       => 20000,
        'max_years_back' => 5,
        'preview_rows'   => 20,
    ],

    /*
    | Demo history generator (`php artisan sales-history:demo {store}`) — DEMO ASSUMPTIONS, NOT FACTS.
    | These month factors are a plausible guess for LPG in Cavite (more cooking in December / holidays, a dip in the hot
    | months) used only to give demo stores a meaningful chart. Real stores import their own past sales instead.
    */
    'demo_month_factors' => [
        1 => 1.05, 2 => 0.95, 3 => 0.95, 4 => 0.90, 5 => 0.95, 6 => 1.00,
        7 => 1.05, 8 => 1.05, 9 => 1.00, 10 => 1.00, 11 => 1.10, 12 => 1.30,
    ],
    // Units per day when the product has no recent orders (by LpgSize group; anything else → 'other')
    'demo_base_per_day' => ['2.7 kg' => 2.0, '11 kg' => 3.0, '22 kg' => 1.0, '50 kg' => 0.3, 'accessory' => 0.3, 'other' => 1.0],
    'demo_growth_per_year' => 0.05,   // +5% a year
    'demo_noise'           => 0.20,   // ±20% random (seeded per store + product, so runs are repeatable)
];
