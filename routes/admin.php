<?php

use App\Http\Controllers\Admin\AuthLogController;
use App\Http\Controllers\Admin\BannerController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\WithdrawalController;
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
use App\Http\Controllers\Admin\RefundController;
use App\Http\Controllers\Admin\UserReportController;
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
        Route::get('invoices/export', [InvoiceController::class, 'export'])->name('invoices.export');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
    });

    Route::middleware('permission:reports.view')->group(function () {
        Route::get('reports', [ReportsController::class, 'index'])->name('reports');
        Route::get('reports/export', [ReportsController::class, 'export'])->name('reports.export');
    });

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

    // Seller Withdrawal Requests (platform admin only)
    Route::get('withdrawals', [WithdrawalController::class, 'index'])->name('withdrawals');
    Route::get('withdrawals/export', [WithdrawalController::class, 'export'])->name('withdrawals.export');
    Route::patch('withdrawals/{withdrawal}/approve', [WithdrawalController::class, 'approve'])->name('withdrawals.approve');
    Route::patch('withdrawals/{withdrawal}/reject', [WithdrawalController::class, 'reject'])->name('withdrawals.reject');
    Route::patch('withdrawals/{withdrawal}/release', [WithdrawalController::class, 'markReleased'])->name('withdrawals.release');

    // Refunds
    Route::get('refunds', [RefundController::class, 'index'])->name('refunds');
    Route::patch('refunds/{refund}/approve', [RefundController::class, 'approve'])->name('refunds.approve');
    Route::patch('refunds/{refund}/reject', [RefundController::class, 'reject'])->name('refunds.reject');

    // User Reports
    Route::get('user-reports', [UserReportController::class, 'index'])->name('user-reports');
    Route::patch('user-reports/{userReport}', [UserReportController::class, 'update'])->name('user-reports.update');
    Route::get('user-reports/export', [UserReportController::class, 'export'])->name('user-reports.export');

    // Auth Logs — platform admin only
    Route::get('auth-logs', [AuthLogController::class, 'index'])
        ->middleware('permission:dashboard.view')
        ->name('auth-logs');

    // Banners — platform admin only
    Route::get('banners', [BannerController::class, 'index'])->name('banners');
    Route::post('banners', [BannerController::class, 'store'])->name('banners.store');
    Route::put('banners/{banner}', [BannerController::class, 'update'])->name('banners.update');
    Route::patch('banners/{banner}/toggle', [BannerController::class, 'toggle'])->name('banners.toggle');
    Route::post('banners/reorder', [BannerController::class, 'reorder'])->name('banners.reorder');
    Route::delete('banners/{banner}', [BannerController::class, 'destroy'])->name('banners.destroy');
    Route::post('banners/{banner}/restore', [BannerController::class, 'restore'])->withTrashed()->name('banners.restore');
    Route::delete('banners/{banner}/force', [BannerController::class, 'forceDestroy'])->withTrashed()->name('banners.force-delete');
});
