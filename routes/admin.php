<?php

use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DeliveryController;
use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\InvoiceController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\DssController;
use App\Http\Controllers\Admin\ReportsController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StaffController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');

    // Customers
    Route::get('customers', [CustomerController::class, 'index'])->name('customers');
    Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
    Route::put('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');
    Route::get('customers/{customer}/orders', [CustomerController::class, 'orders'])->name('customers.orders');
    // Archive management (withTrashed so route model binding resolves soft-deleted records)
    Route::post('customers/{customer}/restore', [CustomerController::class, 'restore'])->withTrashed()->name('customers.restore');
    Route::delete('customers/{customer}/force', [CustomerController::class, 'forceDestroy'])->withTrashed()->name('customers.force-delete');

    // Products
    Route::get('products', [ProductController::class, 'index'])->name('products');
    Route::post('products', [ProductController::class, 'store'])->name('products.store');
    Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update');
    Route::patch('products/{product}/toggle', [ProductController::class, 'toggle'])->name('products.toggle');
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy');

    // Inventory
    Route::get('inventory', [InventoryController::class, 'index'])->name('inventory');
    Route::post('inventory/{product}/stock-in', [InventoryController::class, 'stockIn'])->name('inventory.stock-in');
    Route::post('inventory/{product}/stock-out', [InventoryController::class, 'stockOut'])->name('inventory.stock-out');
    Route::patch('inventory/{product}/reorder-level', [InventoryController::class, 'updateReorderLevel'])->name('inventory.reorder-level');
    // Orders
    Route::get('orders', [OrderController::class, 'index'])->name('orders');
    Route::get('orders/create', [OrderController::class, 'create'])->name('orders.create');
    Route::post('orders', [OrderController::class, 'store'])->name('orders.store');
    Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
    Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
    Route::patch('orders/{order}/payment', [OrderController::class, 'updatePayment'])->name('orders.payment');
    Route::delete('orders/{order}', [OrderController::class, 'destroy'])->name('orders.destroy');
    Route::post('orders/{order}/restore', [OrderController::class, 'restore'])->withTrashed()->name('orders.restore');
    Route::delete('orders/{order}/force', [OrderController::class, 'forceDestroy'])->withTrashed()->name('orders.force-delete');
    // Deliveries
    Route::get('deliveries', [DeliveryController::class, 'index'])->name('deliveries');
    Route::post('deliveries', [DeliveryController::class, 'store'])->name('deliveries.store');
    Route::patch('deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus'])->name('deliveries.status');
    Route::delete('deliveries/{delivery}/unassign', [DeliveryController::class, 'unassign'])->name('deliveries.unassign');
    Route::delete('deliveries/{delivery}', [DeliveryController::class, 'destroy'])->name('deliveries.destroy');
    Route::post('deliveries/{delivery}/restore', [DeliveryController::class, 'restore'])->withTrashed()->name('deliveries.restore');
    Route::delete('deliveries/{delivery}/force', [DeliveryController::class, 'forceDestroy'])->withTrashed()->name('deliveries.force-delete');
    // Invoices
    Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
    Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
    Route::post('invoices/{invoice}/payment', [InvoiceController::class, 'recordPayment'])->name('invoices.payment');
    Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy'])->name('invoices.destroy');
    Route::post('invoices/{invoice}/restore', [InvoiceController::class, 'restore'])->withTrashed()->name('invoices.restore');
    Route::delete('invoices/{invoice}/force', [InvoiceController::class, 'forceDestroy'])->withTrashed()->name('invoices.force-delete');
    Route::get('reports', [ReportsController::class, 'index'])->name('reports');
    Route::get('dss', [DssController::class, 'index'])->name('dss');
    // Staff Management
    Route::get('staff', [StaffController::class, 'index'])->name('staff');
    Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
    Route::get('staff/{user}', [StaffController::class, 'show'])->name('staff.show');
    Route::put('staff/{user}', [StaffController::class, 'update'])->name('staff.update');
    Route::patch('staff/{user}/toggle', [StaffController::class, 'toggle'])->name('staff.toggle');
    Route::delete('staff/{user}', [StaffController::class, 'destroy'])->name('staff.destroy');
    Route::post('staff/{user}/restore', [StaffController::class, 'restore'])->withTrashed()->name('staff.restore');
    Route::delete('staff/{user}/force', [StaffController::class, 'forceDestroy'])->withTrashed()->name('staff.force-delete');
    Route::put('staff/{user}/permissions', [StaffController::class, 'updatePermissions'])->name('staff.permissions');
    Route::delete('staff/{user}/permissions', [StaffController::class, 'resetPermissions'])->name('staff.permissions.reset');
    // Settings
    Route::get('settings', [SettingsController::class, 'index'])->name('settings');
    Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
});
