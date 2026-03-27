<?php

use App\Http\Controllers\CustomerPortal\CartController;
use App\Http\Controllers\CustomerPortal\CheckoutController;
use App\Http\Controllers\CustomerPortal\DashboardController;
use App\Http\Controllers\CustomerPortal\InvoiceController;
use App\Http\Controllers\CustomerPortal\OrderController;
use App\Http\Controllers\CustomerPortal\PaymentController;
use App\Http\Controllers\CustomerPortal\ProductBrowseController;
use App\Http\Controllers\CustomerPortal\RatingController;
use App\Http\Controllers\CustomerPortal\StoreController;
use App\Http\Controllers\CustomerPortal\BecomeSellerController;
use App\Http\Controllers\CustomerPortal\ProfileController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'customer'])
    ->prefix('customer')
    ->name('customer.')
    ->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');

        // Product browsing
        Route::get('products', [ProductBrowseController::class, 'index'])->name('products');
        Route::get('products/{id}', [ProductBrowseController::class, 'show'])->name('products.show');

        // Cart
        Route::get('cart', [CartController::class, 'index'])->name('cart');
        Route::post('cart/add', [CartController::class, 'add'])->name('cart.add');
        Route::patch('cart/update', [CartController::class, 'update'])->name('cart.update');
        Route::delete('cart/remove', [CartController::class, 'remove'])->name('cart.remove');
        Route::delete('cart', [CartController::class, 'clear'])->name('cart.clear');

        // Checkout
        Route::get('checkout', [CheckoutController::class, 'index'])->name('checkout');
        Route::post('checkout', [CheckoutController::class, 'store'])->name('checkout.store');

        // Orders
        Route::get('orders', [OrderController::class, 'index'])->name('orders');
        Route::redirect('orders/create', '/customer/products')->name('orders.create');
        Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
        Route::post('orders/{order}/pay', [PaymentController::class, 'payNow'])->name('orders.pay');
        Route::post('orders/{order}/verify-payment', [OrderController::class, 'verifyPayment'])->name('orders.verify-payment');
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel'])->name('orders.cancel');
        Route::post('orders/{order}/rate', [RatingController::class, 'store'])->name('orders.rate');

        // Store pages
        Route::get('store/{store}', [StoreController::class, 'show'])->name('store.show');

        Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');

        Route::get('profile', [ProfileController::class, 'edit'])->name('profile');
        Route::put('profile', [ProfileController::class, 'update'])->name('profile.update');
        Route::put('profile/password', [ProfileController::class, 'updatePassword'])->name('profile.password');

        // Seller application (for customers who want to become sellers)
        Route::get('become-seller', [BecomeSellerController::class, 'create'])->name('become-seller');
        Route::post('become-seller', [BecomeSellerController::class, 'store'])->name('become-seller.store');
    });
