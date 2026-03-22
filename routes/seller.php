<?php

use App\Http\Controllers\Seller\DashboardController;
use App\Http\Controllers\Seller\ReportsController;
use App\Http\Controllers\Seller\DeliveryController;
use App\Http\Controllers\Seller\DssController;
use App\Http\Controllers\Seller\InventoryController;
use App\Http\Controllers\Seller\InvoiceController;
use App\Http\Controllers\Seller\OrderController;
use App\Http\Controllers\Seller\ProductController;
use App\Http\Controllers\Seller\ReviewController;
use App\Http\Controllers\Seller\SettingsController;
use App\Http\Controllers\Seller\StaffController;
use Illuminate\Support\Facades\Route;

// ── Seller Portal (authenticated, verified, approved seller or seller_staff) ─
Route::middleware(['auth', 'verified', 'seller'])
    ->prefix('seller')
    ->name('seller.')
    ->group(function () {

        // Dashboard
        Route::get('dashboard', [DashboardController::class, 'index'])
            ->middleware('permission:dashboard.view')
            ->name('dashboard');

        // ── Products ─────────────────────────────────────────────────────────
        Route::middleware('permission:products.view')->group(function () {
            Route::get('products', [ProductController::class, 'index'])->name('products');
            Route::post('products', [ProductController::class, 'store'])->name('products.store');
            Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update');
            Route::patch('products/{product}/toggle', [ProductController::class, 'toggle'])->name('products.toggle');
            Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy');
            Route::post('products/{product}/restore', [ProductController::class, 'restore'])
                ->withTrashed()->name('products.restore');
            Route::delete('products/{product}/force', [ProductController::class, 'forceDestroy'])
                ->withTrashed()->name('products.force-delete');
        });

        // ── Orders ───────────────────────────────────────────────────────────
        Route::middleware('permission:orders.view')->group(function () {
            Route::get('orders', [OrderController::class, 'index'])->name('orders');
            Route::get('orders/create', [OrderController::class, 'create'])->name('orders.create');
            Route::post('orders', [OrderController::class, 'store'])->name('orders.store');

            Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
            Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
            Route::patch('orders/{order}/payment', [OrderController::class, 'updatePayment'])->name('orders.payment');
            Route::post('orders/{order}/assign-delivery', [OrderController::class, 'assignDelivery'])->name('orders.assign-delivery');
            Route::delete('orders/{order}', [OrderController::class, 'destroy'])->name('orders.destroy');
        });

        // ── Deliveries ───────────────────────────────────────────────────────
        Route::middleware('permission:deliveries.view')->group(function () {
            Route::get('deliveries', [DeliveryController::class, 'index'])->name('deliveries');
            Route::post('deliveries/assign', [DeliveryController::class, 'assign'])->name('deliveries.assign');
            Route::patch('deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus'])->name('deliveries.status');
        });

        // ── Invoices ─────────────────────────────────────────────────────────
        Route::middleware('permission:invoices.view')->group(function () {
            Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
            Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
        });

        // ── Inventory ────────────────────────────────────────────────────────
        Route::middleware('permission:inventory.view')->group(function () {
            Route::get('inventory', [InventoryController::class, 'index'])->name('inventory');
            Route::post('inventory/{product}/stock-in', [InventoryController::class, 'stockIn'])->name('inventory.stock-in');
            Route::post('inventory/{product}/stock-out', [InventoryController::class, 'stockOut'])->name('inventory.stock-out');
            Route::patch('inventory/{product}/reorder-level', [InventoryController::class, 'updateReorderLevel'])->name('inventory.reorder-level');
        });

        // ── Staff (seller owner only — seller_staff cannot manage staff) ─────
        Route::middleware('seller_owner')->group(function () {
            Route::get('staff', [StaffController::class, 'index'])->name('staff');
            Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
            Route::get('staff/{user}', [StaffController::class, 'show'])->name('staff.show');
            Route::put('staff/{user}', [StaffController::class, 'update'])->name('staff.update');
            Route::patch('staff/{user}/toggle', [StaffController::class, 'toggle'])->name('staff.toggle');
            Route::put('staff/{user}/permissions', [StaffController::class, 'updatePermissions'])->name('staff.permissions');
            Route::delete('staff/{user}/permissions', [StaffController::class, 'resetPermissions'])->name('staff.permissions.reset');
            Route::delete('staff/{user}', [StaffController::class, 'destroy'])->name('staff.destroy');
            Route::post('staff/{user}/restore', [StaffController::class, 'restore'])
                ->withTrashed()->name('staff.restore');
        });

        // ── Reviews ──────────────────────────────────────────────────────────
        Route::get('reviews', [ReviewController::class, 'index'])
            ->middleware('permission:products.view')
            ->name('reviews');

        // ── Reports ──────────────────────────────────────────────────────────
        Route::get('reports', [ReportsController::class, 'index'])
            ->middleware('permission:reports.view')
            ->name('reports');

        // ── DSS ──────────────────────────────────────────────────────────────
        Route::get('dss', [DssController::class, 'index'])
            ->middleware('permission:dss.view')
            ->name('dss');

        // ── Settings ─────────────────────────────────────────────────────────
        Route::middleware('permission:settings.view')->group(function () {
            Route::get('settings', [SettingsController::class, 'index'])->name('settings');
            Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
        });
    });
