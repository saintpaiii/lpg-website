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
        ->whereIn('kind', ['user', 'verification', 'store', 'store-document', 'staff-document', 'attendance', 'handover-photo', 'delivery-proof', 'cylinder-incident'])->whereNumber('id')
        ->middleware('throttle:120,1')->name('documents.show');

    // J6: chat photos are private — participants of the conversation + admin only
    Route::get('/chat/attachments/{message}', [\App\Http\Controllers\Chat\ChatAttachmentController::class, 'show'])
        ->whereNumber('message')->middleware('throttle:240,1')->name('chat.attachment');

    // Accept updated Terms / Privacy Policy (the update popup)
    Route::post('/legal/accept', [\App\Http\Controllers\LegalAcceptController::class, 'store'])->middleware('throttle:30,1')->name('legal.accept');

    Route::get('/notifications',              [NotificationController::class, 'index'])        ->name('notifications.index');
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount'])  ->name('notifications.unread-count');
    Route::post('/notifications/read-all',    [NotificationController::class, 'markAllAsRead'])->name('notifications.read-all');
    Route::post('/notifications/{id}/read',   [NotificationController::class, 'markAsRead'])   ->name('notifications.mark-read');


    // Free OpenStreetMap services, proxied + cached (OSRM road routes)
    Route::get('/api/route', [\App\Http\Controllers\MapServiceController::class, 'route'])
        ->middleware('throttle:60,1')
        ->name('api.route');
});

// Auto-pin an address from City + Barangay (our own barangay table — no outside call). No login needed: the guest store
// registration (/seller/register) pins the store when the barangay is chosen (K4). Checkout / profile use it too.
Route::get('/api/barangay-coordinates', [\App\Http\Controllers\BarangayCoordinateController::class, 'getCoordinates'])
    ->middleware('throttle:60,1')
    ->name('api.barangay-coordinates');

// Address search + "address from a map pin" (Nominatim, proxied + cached + throttled). No login needed: the guest store
// registration (/seller/register) fills City / Barangay from the pin too.
Route::get('/api/geocode', [\App\Http\Controllers\MapServiceController::class, 'geocode'])
    ->middleware('throttle:30,1')
    ->name('api.geocode');
Route::get('/api/reverse-geocode', [\App\Http\Controllers\MapServiceController::class, 'reverse'])
    ->middleware('throttle:30,1')
    ->name('api.reverse-geocode');

// "Continue with Google" — a new user picks buyer or seller-only first (EnsureAccountChosen sends them here)
Route::middleware('auth')->group(function () {
    Route::get('/choose-account', [\App\Http\Controllers\AccountChoiceController::class, 'show'])->name('account.choose');
    Route::post('/choose-account', [\App\Http\Controllers\AccountChoiceController::class, 'choose'])->middleware('throttle:20,1')->name('account.choose.store');
});

// ── Seller Registration & Pending (accessible without seller middleware) ─────
Route::get('/seller/register', [SellerRegistrationController::class, 'create'])->name('seller.register');
Route::post('/seller/register', [SellerRegistrationController::class, 'store'])->middleware('throttle:10,1')->name('seller.register.store');
// "A store with this name already exists in …" while typing (guest page AND become-seller — no guest middleware).
// Returns only {exists, count, cities}.
Route::get('/seller/register/check-name', [SellerRegistrationController::class, 'checkName'])->middleware('throttle:20,1')->name('seller.register.check-name');
Route::get('/seller/pending', [\App\Http\Controllers\SellerPendingController::class, 'show'])->name('seller.pending');
// Sent back by the admin (J3): a seller-only owner re-uploads just the rejected documents
Route::post('/seller/pending/resubmit', [\App\Http\Controllers\SellerPendingController::class, 'resubmit'])
    ->middleware(['auth', 'throttle:10,1'])->name('seller.pending.resubmit');

require __DIR__.'/settings.php';
require __DIR__.'/admin.php';
require __DIR__.'/rider.php';
require __DIR__.'/customer.php';
require __DIR__.'/seller.php';
