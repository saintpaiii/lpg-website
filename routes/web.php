<?php

use App\Http\Controllers\InvoicePrintController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\SocialAuthController;
use App\Http\Controllers\LandingController;
use App\Http\Controllers\OtpController;
use App\Http\Controllers\SellerRegistrationController;
use Illuminate\Support\Facades\Route;

Route::get('/', [LandingController::class, 'index'])->name('home');
Route::get('/offline', fn() => response()->view('offline'))->name('offline');

// Google OAuth
Route::get('/auth/google',          [SocialAuthController::class, 'redirectToGoogle'])->name('auth.google');
Route::get('/auth/google/callback', [SocialAuthController::class, 'handleGoogleCallback'])->name('auth.google.callback');

// OTP email verification — auth required, verified NOT required (to avoid redirect loop)
Route::middleware('auth')->group(function () {
    Route::get('/verify-otp',        [OtpController::class, 'show'])->name('otp.show');
    Route::post('/verify-otp',       [OtpController::class, 'verify'])->name('otp.verify');
    Route::post('/verify-otp/resend',[OtpController::class, 'resend'])->name('otp.resend');
});

// Shared printable invoice — accessible by authenticated staff or the owning customer
Route::get('/invoices/{invoice}/print', [InvoicePrintController::class, 'show'])
    ->middleware(['auth', 'verified'])
    ->name('invoices.print');

// ── Notifications — available to all authenticated users ──────────────────────
Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/notifications',              [NotificationController::class, 'index'])        ->name('notifications.index');
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount'])  ->name('notifications.unread-count');
    Route::post('/notifications/read-all',    [NotificationController::class, 'markAllAsRead'])->name('notifications.read-all');
    Route::post('/notifications/{id}/read',   [NotificationController::class, 'markAsRead'])   ->name('notifications.mark-read');

    // Auto-pin an address on maps (checkout, profile)
    Route::get('/api/barangay-coordinates', [\App\Http\Controllers\BarangayCoordinateController::class, 'getCoordinates'])
        ->middleware('throttle:60,1')
        ->name('api.barangay-coordinates');

    // Free OpenStreetMap services, proxied + cached (Nominatim address search, OSRM road routes)
    Route::get('/api/geocode', [\App\Http\Controllers\MapServiceController::class, 'geocode'])
        ->middleware('throttle:30,1')
        ->name('api.geocode');
    Route::get('/api/route', [\App\Http\Controllers\MapServiceController::class, 'route'])
        ->middleware('throttle:60,1')
        ->name('api.route');
});

// ── Seller Registration & Pending (accessible without seller middleware) ─────
Route::get('/seller/register', [SellerRegistrationController::class, 'create'])->name('seller.register');
Route::post('/seller/register', [SellerRegistrationController::class, 'store'])->name('seller.register.store');
Route::get('/seller/pending', fn () => inertia('auth/seller-pending'))->name('seller.pending');

require __DIR__.'/settings.php';
require __DIR__.'/admin.php';
require __DIR__.'/rider.php';
require __DIR__.'/customer.php';
require __DIR__.'/seller.php';
