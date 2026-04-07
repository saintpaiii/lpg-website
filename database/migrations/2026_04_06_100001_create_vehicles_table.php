<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->enum('vehicle_type', [
                'motorcycle', 'tricycle', 'multicab', 'van',
                'pickup_truck', 'small_truck', 'large_truck',
            ]);
            $table->string('plate_number');
            $table->decimal('max_capacity_kg', 8, 2);
            $table->unsignedInteger('max_tanks');
            $table->string('description')->nullable();
            $table->enum('status', ['available', 'in_use', 'maintenance', 'retired'])->default('available');
            $table->foreignId('assigned_rider_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['store_id', 'plate_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
