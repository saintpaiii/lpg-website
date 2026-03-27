<?php

use App\Http\Controllers\Admin\AuthLogController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\WelcomeController;
use App\Http\Controllers\Admin\InvoiceController;
use App\Http\Controllers\Admin\DssController;
use App\Http\Controllers\Admin\ReportsController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StaffController;
use App\Http\Controllers\Admin\StoreController;
use App\Http\Controllers\Admin\UsersController;
use App\Http\Controllers\Admin\VerificationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'admin'])->prefix('admin')->name('admin.')->group(function () {

    // No-permissions landing page for platform staff with no permissions assigned yet
    Route::get('welcome', [WelcomeController::class, 'index'])->name('welcome');

    Route::get('dashboard', [DashboardController::class, 'index'])
        ->middleware('permission:dashboard.view')
        ->name('dashboard');

    // Users (read-only account monitoring — buyers & sellers)
    Route::middleware('permission:users.view')->group(function () {
        Route::get('users', [UsersController::class, 'index'])->name('users');
        Route::get('users/{user}', [UsersController::class, 'show'])->withTrashed()->name('users.show');
    });
    Route::patch('users/{user}/toggle-active', [UsersController::class, 'toggleActive'])->name('users.toggle-active');
    Route::delete('users/{user}', [UsersController::class, 'destroy'])->name('users.destroy');
    Route::post('users/{user}/restore', [UsersController::class, 'restore'])->withTrashed()->name('users.restore');

    // Platform Staff Management (platform admin only — no permission gate needed)
    Route::get('staff', [StaffController::class, 'index'])->name('staff');
    Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
    Route::get('staff/{user}', [StaffController::class, 'show'])->withTrashed()->name('staff.show');
    Route::put('staff/{user}', [StaffController::class, 'update'])->name('staff.update');
    Route::patch('staff/{user}/position', [StaffController::class, 'updatePosition'])->name('staff.position');
    Route::put('staff/{user}/permissions', [StaffController::class, 'updatePermissions'])->name('staff.permissions');
    Route::delete('staff/{user}/permissions', [StaffController::class, 'resetPermissions'])->withTrashed()->name('staff.permissions.reset');
    Route::patch('staff/{user}/toggle', [StaffController::class, 'toggle'])->name('staff.toggle');
    Route::delete('staff/{user}/force', [StaffController::class, 'forceDestroy'])->withTrashed()->name('staff.force-delete');
    Route::delete('staff/{user}', [StaffController::class, 'destroy'])->name('staff.destroy');
    Route::post('staff/{user}/restore', [StaffController::class, 'restore'])->withTrashed()->name('staff.restore');

    // Customers
    Route::get('customers', [CustomerController::class, 'index'])->name('customers');
    Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
    Route::put('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');
    Route::get('customers/{customer}/orders', [CustomerController::class, 'orders'])->name('customers.orders');
    Route::post('customers/{customer}/restore', [CustomerController::class, 'restore'])->withTrashed()->name('customers.restore');
    Route::delete('customers/{customer}/force', [CustomerController::class, 'forceDestroy'])->withTrashed()->name('customers.force-delete');

    // Invoices (read-only — platform monitoring)
    Route::middleware('permission:invoices.view')->group(function () {
        Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
    });

    Route::get('reports', [ReportsController::class, 'index'])
        ->middleware('permission:reports.view')
        ->name('reports');

    Route::get('dss', [DssController::class, 'index'])
        ->middleware('permission:dss.view')
        ->name('dss');

    // Settings
    Route::middleware('permission:settings.view')->group(function () {
        Route::get('settings', [SettingsController::class, 'index'])->name('settings');
        Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
    });

    // Store Management
    Route::middleware('permission:stores.view')->group(function () {
        Route::get('stores', [StoreController::class, 'index'])->name('stores');
        Route::get('stores/{store}', [StoreController::class, 'show'])->name('stores.show');
    });
    Route::patch('stores/{store}/approve', [StoreController::class, 'approve'])->name('stores.approve');
    Route::patch('stores/{store}/reject', [StoreController::class, 'reject'])->name('stores.reject');
    Route::patch('stores/{store}/suspend', [StoreController::class, 'suspend'])->name('stores.suspend');
    Route::patch('stores/{store}/unsuspend', [StoreController::class, 'unsuspend'])->name('stores.unsuspend');
    Route::delete('stores/{store}', [StoreController::class, 'destroy'])->name('stores.destroy');
    Route::post('stores/{store}/restore', [StoreController::class, 'restore'])->withTrashed()->name('stores.restore');
    Route::delete('stores/{store}/force', [StoreController::class, 'forceDestroy'])->withTrashed()->name('stores.force-delete');
    Route::patch('stores/{store}/commission-rate', [StoreController::class, 'updateCommissionRate'])->name('stores.update-commission-rate');

    // ID Verifications
    Route::middleware('permission:verifications.view')->group(function () {
        Route::get('verifications', [VerificationController::class, 'index'])->name('verifications');
        Route::patch('verifications/{verification}/approve', [VerificationController::class, 'approve'])->name('verifications.approve');
        Route::patch('verifications/{verification}/reject', [VerificationController::class, 'reject'])->name('verifications.reject');
    });

    // Auth Logs — platform admin only
    Route::get('auth-logs', [AuthLogController::class, 'index'])
        ->middleware('permission:dashboard.view')
        ->name('auth-logs');
});
