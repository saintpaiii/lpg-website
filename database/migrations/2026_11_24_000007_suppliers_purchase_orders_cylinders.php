<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * J7 — accessories, filled / empty / damaged stock, cylinder batches (requalification date, FIFO), suppliers,
 * purchase orders, cylinder incidents, supplier returns, auto-reorder settings.
 * Existing rows keep working: every product becomes 'lpg', inventories.quantity stays the FILLED (sellable) count.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'inventory.suppliers'  => 'Manage suppliers and what they supply',
        'inventory.po_create'  => 'Create and edit draft purchase orders',
        'inventory.po_send'    => 'Send (approve) and cancel purchase orders',
        'inventory.po_receive' => 'Receive purchase order deliveries',
    ];

    private const OLD_TYPES = "'in','out','adjustment','order','cancelled'";
    private const NEW_TYPES = "'in','out','adjustment','order','cancelled','empty_in','empty_out','damaged','returned_to_supplier','expired'";

    public function up(): void
    {
        // ── A: product types ─────────────────────────────────────────────────
        Schema::table('products', function (Blueprint $table) {
            $table->enum('product_type', ['lpg', 'accessory'])->default('lpg')->after('store_id');
            $table->string('accessory_category', 30)->nullable()->after('product_type');   // regulator, hose, clamp, stove, burner, valve_seal, other
            $table->decimal('unit_weight_kg', 6, 2)->nullable()->after('weight_kg');      // accessories' shipping weight
            $table->boolean('exclude_auto_reorder')->default(false)->after('is_active');
        });

        // ── B: filled / empty / damaged ──────────────────────────────────────
        Schema::table('inventories', function (Blueprint $table) {
            $table->unsignedInteger('empty_quantity')->default(0)->after('quantity');
            $table->unsignedInteger('damaged_quantity')->default(0)->after('empty_quantity');
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE inventory_transactions MODIFY COLUMN type ENUM(' . self::NEW_TYPES . ') NOT NULL');
        }

        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('auto_reorder_enabled')->default(true)->after('allow_half_payment');
            $table->unsignedInteger('po_next_number')->default(1);
            $table->unsignedInteger('return_next_number')->default(1);
        });

        // ── C: suppliers ─────────────────────────────────────────────────────
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name');
            $table->string('contact_person')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address', 500)->nullable();
            $table->unsignedSmallInteger('lead_time_days')->default(2);
            $table->string('payment_terms', 50)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['store_id', 'is_active']);
        });

        Schema::create('supplier_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('unit_cost', 10, 2)->default(0);
            $table->unsignedInteger('min_order_qty')->default(1);
            $table->boolean('is_preferred')->default(false);
            $table->timestamps();
            $table->unique(['supplier_id', 'product_id']);
            $table->index(['product_id', 'is_preferred']);
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers');
            $table->string('po_number', 30);
            $table->enum('status', ['draft', 'sent', 'partially_received', 'received', 'cancelled'])->default('draft');
            $table->enum('source', ['manual', 'auto'])->default('manual');
            $table->date('expected_on')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['store_id', 'po_number']);
            $table->index(['store_id', 'status']);
        });

        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products');
            $table->unsignedInteger('quantity_ordered');
            $table->unsignedInteger('quantity_received')->default(0);
            $table->decimal('unit_cost', 10, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->unsignedInteger('empties_sent')->default(0);
            $table->timestamps();
        });

        // ── B: cylinder batches (requalification date per batch, FIFO) ───────
        Schema::create('cylinder_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('batch_code', 40);
            $table->string('source', 20)->default('stock_in');   // stock_in | po | return
            $table->unsignedInteger('quantity_received');
            $table->unsignedInteger('quantity_remaining');
            $table->date('manufactured_on')->nullable();
            $table->date('requalification_due_on')->nullable();   // required for LPG (validated in code)
            $table->date('received_on');
            $table->json('expiry_notices')->nullable();            // thresholds already notified, e.g. [90, 30]
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['product_id', 'requalification_due_on']);
        });

        Schema::create('order_item_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();
            $table->foreignId('cylinder_batch_id')->constrained('cylinder_batches')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->timestamps();
        });

        // ── D: supplier returns + cylinder incidents ─────────────────────────
        Schema::create('supplier_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers');
            $table->string('return_number', 30);
            $table->enum('status', ['open', 'sent', 'replaced', 'credited', 'rejected'])->default('open');
            $table->decimal('credited_amount', 12, 2)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['store_id', 'return_number']);
        });

        Schema::create('cylinder_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('cylinder_batch_id')->nullable()->constrained('cylinder_batches')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->unsignedInteger('quantity');
            $table->enum('reason', ['leaking', 'dented_rusty', 'bad_valve', 'expired', 'failed_requalification', 'other']);
            $table->enum('source', ['stock_check', 'customer_handover', 'supplier_delivery'])->default('stock_check');
            $table->boolean('was_empty')->default(false);
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('order_item_adjustment_id')->nullable()->constrained('order_item_adjustments')->nullOnDelete();
            $table->text('note')->nullable();
            $table->string('photo_path')->nullable();
            $table->enum('status', ['held', 'returned', 'replaced', 'credited', 'disposed'])->default('held');
            $table->foreignId('supplier_return_id')->nullable()->constrained('supplier_returns')->nullOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['store_id', 'status']);
            $table->index(['supplier_id', 'created_at']);
        });

        // Existing data: every product is an LPG tank; existing stock = filled stock (nothing to move)
        DB::table('products')->update(['product_type' => 'lpg']);

        // Staff permissions (per-person overrides need the rows; role access comes from config/staff_modules.php)
        foreach (self::PERMISSIONS as $name => $desc) {
            if (! DB::table('permissions')->where('name', $name)->exists()) {
                DB::table('permissions')->insert(['name' => $name, 'group' => 'Inventory', 'description' => $desc, 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('name', array_keys(self::PERMISSIONS))->pluck('id');
        DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
        if (Schema::hasTable('role_permissions')) {
            DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        }
        DB::table('permissions')->whereIn('id', $ids)->delete();

        Schema::dropIfExists('cylinder_incidents');
        Schema::dropIfExists('supplier_returns');
        Schema::dropIfExists('order_item_batches');
        Schema::dropIfExists('cylinder_batches');
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('supplier_products');
        Schema::dropIfExists('suppliers');

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['auto_reorder_enabled', 'po_next_number', 'return_next_number']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::table('inventory_transactions')->whereIn('type', ['empty_in', 'empty_out', 'damaged', 'returned_to_supplier', 'expired'])->update(['type' => 'adjustment']);
            DB::statement('ALTER TABLE inventory_transactions MODIFY COLUMN type ENUM(' . self::OLD_TYPES . ') NOT NULL');
        }
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropColumn(['empty_quantity', 'damaged_quantity']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['product_type', 'accessory_category', 'unit_weight_kg', 'exclude_auto_reorder']);
        });
    }
};
