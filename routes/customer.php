<?php

use App\Http\Controllers\CustomerPortal\AddressController;
use App\Http\Controllers\CustomerPortal\CartController;
use App\Http\Controllers\CustomerPortal\CheckoutController;
use App\Http\Controllers\CustomerPortal\DashboardController;
use App\Http\Controllers\CustomerPortal\FindStoreController;
use App\Http\Controllers\CustomerPortal\InvoiceController;
use App\Http\Controllers\CustomerPortal\MessageController;
use App\Http\Controllers\CustomerPortal\OrderController;
use App\Http\Controllers\CustomerPortal\PaymentController;
use App\Http\Controllers\CustomerPortal\ProductBrowseController;
use App\Http\Controllers\CustomerPortal\RatingController;
use App\Http\Controllers\CustomerPortal\StoreController;
use App\Http\Controllers\CustomerPortal\BecomeSellerController;
use App\Http\Controllers\CustomerPortal\IdVerificationController;
use App\Http\Controllers\CustomerPortal\ProfileController;
use App\Http\Controllers\CustomerPortal\RefundController;
use App\Http\Controllers\CustomerPortal\UserReportController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\Rider\LocationController as RiderLocationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'customer'])
    ->prefix('customer')
    ->name('customer.')
    ->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('notifications', [NotificationController::class, 'index'])->name('notifications');

        // Product browsing
        Route::get('products', [ProductBrowseController::class, 'index'])->middleware('id.verified')->name('products');
        Route::get('products/{id}', [ProductBrowseController::class, 'show'])->middleware('id.verified')->name('products.show');

        // Find a Store (nearest / cheapest store that can deliver a given LPG size)
        Route::get('find-store', [FindStoreController::class, 'index'])->middleware('id.verified')->name('find-store');
        Route::get('find-store/results', [FindStoreController::class, 'results'])->middleware('throttle:60,1')->middleware('id.verified')->name('find-store.results');

        // Cart
        Route::get('cart', [CartController::class, 'index'])->middleware('id.verified')->name('cart');
        Route::post('cart/add', [CartController::class, 'add'])->middleware('id.verified')->name('cart.add');
        Route::patch('cart/update', [CartController::class, 'update'])->middleware('id.verified')->name('cart.update');
        Route::delete('cart/remove', [CartController::class, 'remove'])->middleware('id.verified')->name('cart.remove');
        Route::delete('cart', [CartController::class, 'clear'])->middleware('id.verified')->name('cart.clear');

        // Checkout
        Route::get('checkout', [CheckoutController::class, 'index'])->middleware('id.verified')->name('checkout');
        Route::post('checkout', [CheckoutController::class, 'store'])->middleware('id.verified')->name('checkout.store');
        Route::post('checkout/coupon', [CheckoutController::class, 'applyCoupon'])->middleware('id.verified')->name('checkout.coupon');

        // Orders

        // ── Messages (chat) — 'start' / 'unread-count' before the {conversation} wildcard ──
        Route::get('messages', [MessageController::class, 'index'])->middleware('id.verified:history')->name('messages');
        Route::post('messages/start', [MessageController::class, 'start'])->middleware('id.verified:history')->name('messages.start');
        Route::get('messages/unread-count', [MessageController::class, 'unreadCount'])->middleware('id.verified:history')->name('messages.unread');
        Route::get('messages/{conversation}', [MessageController::class, 'show'])->middleware('id.verified:history')->name('messages.show');
        Route::get('messages/{conversation}/messages', [MessageController::class, 'messages'])->middleware('id.verified:history')->name('messages.poll');
        Route::post('messages/{conversation}', [MessageController::class, 'store'])->middleware('throttle:30,1')->middleware('id.verified:history')->name('messages.send');

        Route::get('orders', [OrderController::class, 'index'])->middleware('id.verified:history')->name('orders');
        Route::redirect('orders/create', '/customer/products')->middleware('id.verified:history')->name('orders.create');
        Route::get('orders/{order}', [OrderController::class, 'show'])->middleware('id.verified:history')->name('orders.show');
        Route::post('orders/{order}/pay', [PaymentController::class, 'payNow'])->middleware('id.verified')->name('orders.pay');
        Route::post('orders/{order}/pay-balance', [PaymentController::class, 'payBalance'])->middleware('id.verified')->name('orders.pay-balance');
        Route::post('orders/{order}/verify-payment', [OrderController::class, 'verifyPayment'])->middleware('id.verified:history')->name('orders.verify-payment');
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel'])->middleware('id.verified:history')->name('orders.cancel');
        Route::post('orders/{order}/rate', [RatingController::class, 'store'])->middleware('id.verified:history')->name('orders.rate');
        Route::get('orders/{order}/rider-location', [RiderLocationController::class, 'showForOrder'])->middleware('id.verified:history')->name('orders.rider-location');
        Route::get('orders/{order}/tracking', [OrderController::class, 'getTracking'])->middleware('id.verified:history')->name('orders.tracking');

        // Store pages
        Route::get('store/{store}', [StoreController::class, 'show'])->middleware('id.verified')->name('store.show');

        Route::get('invoices', [InvoiceController::class, 'index'])->middleware('id.verified:history')->name('invoices');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->middleware('id.verified:history')->name('invoices.show');

        // Saved delivery addresses
        Route::get('addresses', [AddressController::class, 'index'])->name('addresses.index');
        Route::post('addresses', [AddressController::class, 'store'])->name('addresses.store');
        Route::put('addresses/{address}', [AddressController::class, 'update'])->name('addresses.update');
        Route::delete('addresses/{address}', [AddressController::class, 'destroy'])->name('addresses.destroy');
        Route::post('addresses/{address}/set-default', [AddressController::class, 'setDefault'])->name('addresses.set-default');

        Route::get('profile', [ProfileController::class, 'edit'])->name('profile');
        Route::put('profile', [ProfileController::class, 'update'])->name('profile.update');
        Route::put('profile/password', [ProfileController::class, 'updatePassword'])->name('profile.password');

        // Identity verification
        Route::get('id-verification',  [IdVerificationController::class, 'create'])->name('id-verification');
        Route::post('id-verification', [IdVerificationController::class, 'store'])->name('id-verification.store');

        // Loyalty status per store
        Route::get('loyalty', [\App\Http\Controllers\LoyaltyController::class, 'getMyLoyalty'])->middleware('id.verified:history')->name('loyalty');

        // Refund requests
        Route::get('refunds', [RefundController::class, 'index'])->middleware('id.verified:history')->name('refunds');
        Route::post('orders/{order}/refund', [RefundController::class, 'store'])->middleware('id.verified:history')->name('orders.refund');
        Route::post('refunds/{refund}/escalate', [RefundController::class, 'escalate'])->middleware('id.verified:history')->name('refunds.escalate');

        // User reports (customer reports a problem with an order / follows it)
        Route::get('reports', [UserReportController::class, 'index'])->middleware('id.verified:history')->name('reports');
        Route::post('reports', [UserReportController::class, 'store'])->middleware('throttle:20,60')->middleware('id.verified:history')->name('reports.store');
        Route::post('reports/website-problem', [UserReportController::class, 'storeWebsiteProblem'])->middleware('throttle:20,60')->name('reports.website-problem');
        Route::get('reports/{userReport}', [UserReportController::class, 'show'])->middleware('id.verified:history')->name('reports.show');
        Route::post('reports/{userReport}/reply', [UserReportController::class, 'reply'])->middleware('id.verified:history')->name('reports.reply');
        Route::post('reports/{userReport}/confirm', [UserReportController::class, 'confirm'])->middleware('id.verified:history')->name('reports.confirm');
        Route::post('reports/{userReport}/not-solved', [UserReportController::class, 'notSolved'])->middleware('id.verified:history')->name('reports.not-solved');
        Route::post('reports/{userReport}/escalate', [UserReportController::class, 'escalate'])->middleware('id.verified:history')->name('reports.escalate');
        Route::post('reports/{userReport}/withdraw', [UserReportController::class, 'withdraw'])->middleware('id.verified:history')->name('reports.withdraw');

        // Seller application (for customers who want to become sellers)
        Route::get('become-seller', [BecomeSellerController::class, 'create'])->middleware('id.verified')->name('become-seller');
        Route::post('become-seller', [BecomeSellerController::class, 'store'])->middleware('id.verified')->name('become-seller.store');
    });
