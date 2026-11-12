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

// Terms & Policies — public, no account needed
Route::get('/terms',        [\App\Http\Controllers\LegalPageController::class, 'show'])->name('legal.terms');
Route::get('/seller-terms', [\App\Http\Controllers\LegalPageController::class, 'show'])->name('legal.seller-terms');
Route::get('/privacy',      [\App\Http\Controllers\LegalPageController::class, 'show'])->name('legal.privacy');

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
    // Private documents (IDs, selfies, permits) — owner or document reviewers only
    Route::get('/documents/{kind}/{id}/{field}', [\App\Http\Controllers\DocumentFileController::class, 'show'])
        ->whereIn('kind', ['user', 'verification', 'store', 'store-document', 'staff-document'])->whereNumber('id')
        ->middleware('throttle:120,1')->name('documents.show');

    // First-time tutorials: progress saved on the account; the Help page lists them
    Route::get('/help', [\App\Http\Controllers\HelpController::class, 'index'])->name('help');
    Route::middleware('throttle:60,1')->group(function () {
        Route::post('/tutorials/reset', [\App\Http\Controllers\TutorialController::class, 'reset'])->name('tutorials.reset');
        Route::put('/tutorials/settings', [\App\Http\Controllers\TutorialController::class, 'settings'])->name('tutorials.settings');
        Route::post('/tutorials/{key}/done', [\App\Http\Controllers\TutorialController::class, 'done'])->where('key', '[a-z0-9._-]{1,60}')->name('tutorials.done');
        Route::post('/tutorials/{key}/skip', [\App\Http\Controllers\TutorialController::class, 'skip'])->where('key', '[a-z0-9._-]{1,60}')->name('tutorials.skip');
    });

    // Accept updated Terms / Privacy Policy (the update popup)
    Route::post('/legal/accept', [\App\Http\Controllers\LegalAcceptController::class, 'store'])->middleware('throttle:30,1')->name('legal.accept');

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
    Route::get('/api/reverse-geocode', [\App\Http\Controllers\MapServiceController::class, 'reverse'])
        ->middleware('throttle:30,1')
        ->name('api.reverse-geocode');
    Route::get('/api/route', [\App\Http\Controllers\MapServiceController::class, 'route'])
        ->middleware('throttle:60,1')
        ->name('api.route');
});

// ── Seller Registration & Pending (accessible without seller middleware) ─────
Route::get('/seller/register', [SellerRegistrationController::class, 'create'])->name('seller.register');
Route::post('/seller/register', [SellerRegistrationController::class, 'store'])->middleware('throttle:10,1')->name('seller.register.store');
// "A store with this name already exists in …" while typing (guest page AND become-seller — no guest middleware).
// Returns only {exists, count, cities}.
Route::get('/seller/register/check-name', [SellerRegistrationController::class, 'checkName'])->middleware('throttle:20,1')->name('seller.register.check-name');
Route::get('/seller/pending', fn () => inertia('auth/seller-pending'))->name('seller.pending');

require __DIR__.'/settings.php';
require __DIR__.'/admin.php';
require __DIR__.'/rider.php';
require __DIR__.'/customer.php';
require __DIR__.'/seller.php';
