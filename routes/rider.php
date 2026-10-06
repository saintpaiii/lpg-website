<?php

use App\Http\Controllers\Rider\CustomerController as RiderCustomerController;
use App\Http\Controllers\Rider\DeliveryController as RiderDeliveryController;
use App\Http\Controllers\Rider\LocationController as RiderLocationController;
use App\Http\Controllers\Rider\MessageController as RiderMessageController;
use App\Http\Controllers\Seller\AttendanceController;
use App\Http\Controllers\Seller\PayrollController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'rider', 'password.changed'])->prefix('rider')->name('rider.')->group(function () {
    Route::get('deliveries', [RiderDeliveryController::class, 'index'])->name('deliveries');
    Route::patch('deliveries/{delivery}/status', [RiderDeliveryController::class, 'updateStatus'])->name('deliveries.status');
    Route::patch('deliveries/{delivery}/collect-payment', [RiderDeliveryController::class, 'collectPayment'])->name('deliveries.collect-payment');
    Route::get('deliveries/{delivery}/rider-location', [RiderLocationController::class, 'show'])->name('deliveries.rider-location');
    Route::post('location', [RiderLocationController::class, 'store'])->name('location');
    Route::get('history', [RiderDeliveryController::class, 'history'])->name('history');

    // ── Messages (chat) — 'start' / 'unread-count' before the {conversation} wildcard ──
    Route::get('messages', [RiderMessageController::class, 'index'])->name('messages');
    Route::post('messages/start', [RiderMessageController::class, 'start'])->name('messages.start');
    Route::get('messages/unread-count', [RiderMessageController::class, 'unreadCount'])->name('messages.unread');
    Route::get('messages/{conversation}', [RiderMessageController::class, 'show'])->name('messages.show');
    Route::get('messages/{conversation}/messages', [RiderMessageController::class, 'messages'])->name('messages.poll');
    Route::post('messages/{conversation}', [RiderMessageController::class, 'store'])->middleware('throttle:30,1')->name('messages.send');

    // ── My Payslips ───────────────────────────────────────────────────────────
    Route::get('my-payslips', [PayrollController::class, 'myPayslips'])->name('my-payslips');

    // ── Self attendance ───────────────────────────────────────────────────────
    Route::get('my-attendance', [AttendanceController::class, 'myAttendance'])->name('my-attendance');
    Route::post('my-attendance/clock-in', [AttendanceController::class, 'myClockIn'])->name('my-attendance.clock-in');
    Route::post('my-attendance/clock-out', [AttendanceController::class, 'myClockOut'])->name('my-attendance.clock-out');
});
