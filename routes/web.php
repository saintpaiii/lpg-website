<?php

use App\Http\Controllers\InvoicePrintController;
use App\Http\Controllers\LandingController;
use Illuminate\Support\Facades\Route;

Route::get('/', [LandingController::class, 'index'])->name('home');

// Shared printable invoice — accessible by authenticated staff or the owning customer
Route::get('/invoices/{invoice}/print', [InvoicePrintController::class, 'show'])
    ->middleware(['auth', 'verified'])
    ->name('invoices.print');

require __DIR__.'/settings.php';
require __DIR__.'/admin.php';
require __DIR__.'/rider.php';
require __DIR__.'/customer.php';
