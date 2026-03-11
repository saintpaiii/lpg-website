<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeliveryController as ApiDeliveryController;
use App\Http\Controllers\Api\PayMongoWebhookController;
use Illuminate\Support\Facades\Route;

// Public API routes
Route::post('login', [AuthController::class, 'login'])->name('api.login');

// PayMongo webhook — no auth, public
Route::post('paymongo/webhook', [PayMongoWebhookController::class, 'handle'])->name('api.paymongo.webhook');

// Authenticated API routes (Sanctum token)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout'])->name('api.logout');
    Route::get('user', [AuthController::class, 'user'])->name('api.user');

    // Deliveries
    Route::get('deliveries', [ApiDeliveryController::class, 'index'])->name('api.deliveries.index');
    Route::get('deliveries/{delivery}', [ApiDeliveryController::class, 'show'])->name('api.deliveries.show');
    Route::put('deliveries/{delivery}/status', [ApiDeliveryController::class, 'updateStatus'])->name('api.deliveries.status');
    Route::post('deliveries/assign', [ApiDeliveryController::class, 'assign'])->name('api.deliveries.assign');
});
