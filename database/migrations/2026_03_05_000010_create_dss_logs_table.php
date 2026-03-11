<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dss_logs', function (Blueprint $table) {
            $table->id();
            $table->string('type');
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->json('data');
            $table->decimal('accuracy', 5, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dss_logs');
    }
};
