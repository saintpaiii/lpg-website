<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_pay_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->enum('sub_role', ['cashier', 'warehouse', 'rider', 'hr']);
            $table->decimal('daily_rate', 10, 2)->default(500.00);
            $table->timestamps();

            $table->unique(['store_id', 'sub_role']);
        });

        // Seed default rates for all existing stores
        $stores = \App\Models\Store::all();
        foreach ($stores as $store) {
            foreach (['cashier', 'warehouse', 'rider', 'hr'] as $subRole) {
                \DB::table('store_pay_rates')->insertOrIgnore([
                    'store_id'   => $store->id,
                    'sub_role'   => $subRole,
                    'daily_rate' => 500.00,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('store_pay_rates');
    }
};
