<?php

use App\Http\Controllers\Rider\CustomerController as RiderCustomerController;
use App\Http\Controllers\Rider\DeliveryController as RiderDeliveryController;
use App\Http\Controllers\Rider\LocationController as RiderLocationController;
use App\Http\Controllers\Seller\AttendanceController;
use App\Http\Controllers\Seller\PayrollController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'rider', 'password.changed'])->prefix('rider')->name('rider.')->group(function () {
    Route::get('deliveries', [RiderDeliveryController::class, 'index'])->name('deliveries');
    Route::patch('deliveries/{delivery}/status', [RiderDeliveryController::class, 'updateStatus'])->name('deliveries.status');
    Route::get('deliveries/{delivery}/rider-location', [RiderLocationController::class, 'show'])->name('deliveries.rider-location');
    Route::post('location', [RiderLocationController::class, 'store'])->name('location');
    Route::get('history', [RiderDeliveryController::class, 'history'])->name('history');

    // ── My Payslips ───────────────────────────────────────────────────────────
    Route::get('my-payslips', [PayrollController::class, 'myPayslips'])->name('my-payslips');

    // ── Self attendance ───────────────────────────────────────────────────────
    Route::get('my-attendance', [AttendanceController::class, 'myAttendance'])->name('my-attendance');
    Route::post('my-attendance/clock-in', [AttendanceController::class, 'myClockIn'])->name('my-attendance.clock-in');
    Route::post('my-attendance/clock-out', [AttendanceController::class, 'myClockOut'])->name('my-attendance.clock-out');
});
