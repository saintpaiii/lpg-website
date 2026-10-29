<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Product photos (up to 8) and one short video. products.image stays as the cover cache (first photo).
 * Data step: every existing product picture becomes its first media item (files are not touched).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['image', 'video']);
            $table->string('path');
            $table->string('poster_path')->nullable();                    // videos
            $table->unsignedSmallInteger('duration_seconds')->nullable(); // videos
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'sort_order'], 'product_media_product_sort_idx');
        });

        // Copy existing covers (soft-deleted products too)
        $now = now();
        DB::table('products')->whereNotNull('image')->where('image', '!=', '')->orderBy('id')
            ->chunk(500, function ($products) use ($now) {
                DB::table('product_media')->insert($products->map(fn ($p) => [
                    'product_id' => $p->id,
                    'type'       => 'image',
                    'path'       => $p->image,
                    'sort_order' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_media');
    }
};
