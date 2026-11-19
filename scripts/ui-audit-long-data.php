<?php

/*
 * K10 — realistic LONG data for the UI audit (run by scripts/ui-audit.cjs --seed on the TEST database only):
 * a rider with a long name, a long store name and a long product name, so long labels (selects, cards, dialogs) are
 * tested. Usage: DB_DATABASE=<test db> php scripts/ui-audit-long-data.php
 */

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$db = config('database.connections.' . config('database.default') . '.database');
if (! preg_match('/test|audit|throwaway/i', (string) $db)) {
    fwrite(STDERR, "Refusing: {$db} is not a test database.\n");
    exit(2);
}

use App\Models\Product;
use App\Models\Store;
use App\Models\User;

$rider = User::where('email', 'rider1@lpg.com')->first();
$rider?->forceFill(['name' => 'Juan Dela Cruz Garcia Santos', 'first_name' => 'Juan Dela Cruz', 'last_name' => 'Garcia Santos'])->save();

$owner = User::where('email', 'seller1@lpg.com')->first();
$main = $owner ? Store::where('user_id', $owner->id)->whereNull('parent_store_id')->first() : null;
$main?->update(['store_name' => 'Petron Gasul Cavite Distribution Center']);   // branches follow ("… — Imus Branch")

if ($main) {
    $p = Product::where('store_id', $main->id)->where('product_type', 'lpg')->orderBy('id')->first();
    $p?->update(['name' => '11kg Petron Gasul Premium Refill Cylinder (Pol Valve)']);
}

// One cash-on-delivery order waiting for a rider, so the "Assign Rider" dialog (long rider label) can be opened
if ($main) {
    \App\Models\Order::where('store_id', $main->id)->whereIn('status', ['preparing', 'confirmed'])->orderBy('id')->limit(2)
        ->update(['payment_mode' => 'cod', 'payment_method' => 'cash', 'payment_status' => 'unpaid']);
}

echo "Long demo data applied to {$db}.\n";
