<?php

use App\Http\Controllers\Rider\CustomerController as RiderCustomerController;
use App\Http\Controllers\Rider\DeliveryController as RiderDeliveryController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'rider'])->prefix('rider')->name('rider.')->group(function () {
    Route::get('deliveries', [RiderDeliveryController::class, 'index'])->name('deliveries');
    Route::patch('deliveries/{delivery}/status', [RiderDeliveryController::class, 'updateStatus'])->name('deliveries.status');
    Route::get('history', [RiderDeliveryController::class, 'history'])->name('history');
});
