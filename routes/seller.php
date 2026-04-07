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
use App\Http\Controllers\Seller\AttendanceController;
use App\Http\Controllers\Seller\WalletController;
use App\Http\Controllers\Seller\PayrollController;
use App\Http\Controllers\Seller\StaffController;
use App\Http\Controllers\Seller\VehicleController;
use Illuminate\Support\Facades\Route;

// ── Seller Portal (authenticated, verified, approved seller or seller_staff) ─
Route::middleware(['auth', 'verified', 'seller', 'password.changed'])
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
            Route::get('orders/export', [OrderController::class, 'export'])->name('orders.export');
            Route::get('orders/create', [OrderController::class, 'create'])->name('orders.create');
            Route::post('orders', [OrderController::class, 'store'])->name('orders.store');

            Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
            Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
            Route::patch('orders/{order}/payment', [OrderController::class, 'updatePayment'])->name('orders.payment');
            Route::patch('orders/{order}/refunded', [OrderController::class, 'markRefunded'])->name('orders.refunded');
            Route::post('orders/{order}/assign-delivery', [OrderController::class, 'assignDelivery'])->name('orders.assign-delivery');
            Route::delete('orders/{order}', [OrderController::class, 'destroy'])->name('orders.destroy');
        });

        // ── Deliveries ───────────────────────────────────────────────────────
        Route::middleware('permission:deliveries.view')->group(function () {
            Route::get('deliveries', [DeliveryController::class, 'index'])->name('deliveries');
            Route::post('deliveries/assign', [DeliveryController::class, 'assign'])->name('deliveries.assign');
            Route::patch('deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus'])->name('deliveries.status');
        });

        // ── Vehicles ─────────────────────────────────────────────────────────
        Route::get('vehicles', [VehicleController::class, 'index'])->name('vehicles');
        Route::post('vehicles', [VehicleController::class, 'store'])->name('vehicles.store');
        Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])->name('vehicles.update');
        Route::delete('vehicles/{vehicle}', [VehicleController::class, 'destroy'])->name('vehicles.destroy');
        Route::post('vehicles/{vehicle}/restore', [VehicleController::class, 'restore'])
            ->withTrashed()->name('vehicles.restore');

        // ── Invoices ─────────────────────────────────────────────────────────
        Route::middleware('permission:invoices.view')->group(function () {
            Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
            Route::get('invoices/export', [InvoiceController::class, 'export'])->name('invoices.export');
            Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
            Route::post('invoices/{invoice}/record-payment', [InvoiceController::class, 'recordPayment'])->name('invoices.record-payment');
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
            Route::delete('staff/{user}/force', [StaffController::class, 'forceDestroy'])
                ->withTrashed()->name('staff.force-delete');
        });

        // ── Attendance (seller owner + HR staff) ─────────────────────────────
        Route::get('attendance', [AttendanceController::class, 'index'])->name('attendance');
        Route::get('attendance/export', [AttendanceController::class, 'export'])->name('attendance.export');
        Route::post('attendance/clock-in', [AttendanceController::class, 'clockIn'])->name('attendance.clock-in');
        Route::post('attendance/clock-out', [AttendanceController::class, 'clockOut'])->name('attendance.clock-out');
        Route::post('attendance/set-clock-out', [AttendanceController::class, 'setClockOut'])->name('attendance.set-clock-out');

        // ── My Payslips (self — all seller_staff) ────────────────────────────
        Route::get('my-payslips', [PayrollController::class, 'myPayslips'])->name('my-payslips');

        // ── My Attendance (self — all seller_staff except rider) ──────────────
        Route::get('my-attendance', [AttendanceController::class, 'myAttendance'])->name('my-attendance');
        Route::post('my-attendance/clock-in', [AttendanceController::class, 'myClockIn'])->name('my-attendance.clock-in');
        Route::post('my-attendance/clock-out', [AttendanceController::class, 'myClockOut'])->name('my-attendance.clock-out');

        // ── Payroll (seller owner + HR can view; owner-only for settings/actions)
        Route::get('payroll', [PayrollController::class, 'index'])->name('payroll');
        Route::get('payroll/export', [PayrollController::class, 'export'])->name('payroll.export');
        Route::post('payroll/generate', [PayrollController::class, 'generate'])->name('payroll.generate');
        Route::patch('payroll/{payroll}/release', [PayrollController::class, 'markReleased'])->name('payroll.release');
        Route::patch('payroll/{payroll}/paid', [PayrollController::class, 'markPaid'])->name('payroll.paid');
        Route::get('payroll/settings', [PayrollController::class, 'settings'])->name('payroll.settings');
        Route::post('payroll/settings', [PayrollController::class, 'updateSettings'])->name('payroll.settings.update');
        Route::patch('payroll/staff/{user}/rate', [PayrollController::class, 'updateStaffRate'])->name('payroll.staff-rate');

        // ── Wallet (seller owner only) ────────────────────────────────────────
        Route::middleware('seller_owner')->group(function () {
            Route::get('wallet', [WalletController::class, 'index'])->name('wallet');
            Route::get('wallet/export', [WalletController::class, 'export'])->name('wallet.export');
            Route::post('wallet/withdraw', [WalletController::class, 'requestWithdrawal'])->name('wallet.withdraw');
            Route::patch('wallet/requests/{withdrawal}/received', [WalletController::class, 'markReceived'])->name('wallet.received');
        });

        // ── Reviews ──────────────────────────────────────────────────────────
        Route::get('reviews', [ReviewController::class, 'index'])
            ->middleware('permission:products.view')
            ->name('reviews');

        // ── Reports ──────────────────────────────────────────────────────────
        Route::middleware('permission:reports.view')->group(function () {
            Route::get('reports', [ReportsController::class, 'index'])->name('reports');
            Route::get('reports/export', [ReportsController::class, 'export'])->name('reports.export');
        });

        // ── DSS ──────────────────────────────────────────────────────────────
        Route::get('dss', [DssController::class, 'index'])
            ->middleware('permission:dss.view')
            ->name('dss');

        // ── Settings ─────────────────────────────────────────────────────────
        Route::middleware('permission:settings.view')->group(function () {
            Route::get('settings', [SettingsController::class, 'index'])->name('settings');
            Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
            Route::put('settings', [SettingsController::class, 'update']);
        });
    });
