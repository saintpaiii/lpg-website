<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // store owner

            $table->string('store_name');
            $table->text('description')->nullable();

            // Location
            $table->string('address');
            $table->string('city');
            $table->string('barangay');
            $table->string('province')->default('Cavite');

            // Contact
            $table->string('phone');
            $table->string('email')->nullable();

            // Files
            $table->string('logo')->nullable();
            $table->string('bir_permit');
            $table->string('business_permit');

            // Status & plan
            $table->enum('status', ['pending', 'approved', 'rejected', 'suspended'])->default('pending');
            $table->enum('subscription_plan', ['free', 'premium'])->default('free');
            $table->timestamp('subscription_expires_at')->nullable();

            // Platform settings
            $table->decimal('commission_rate', 5, 2)->default(5.00);
            $table->boolean('is_featured')->default(false);

            // Approval audit
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stores');
    }
};
