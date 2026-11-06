<?php

use App\Http\Controllers\Seller\DashboardController;
use App\Http\Controllers\Seller\ReportsController;
use App\Http\Controllers\Seller\DeliveryController;
use App\Http\Controllers\Seller\DssController;
use App\Http\Controllers\Seller\InventoryController;
use App\Http\Controllers\Seller\InvoiceController;
use App\Http\Controllers\Seller\MessageController as SellerMessageController;
use App\Http\Controllers\Seller\WebsiteReportController as SellerWebsiteReportController;
use App\Http\Controllers\Seller\OrderController;
use App\Http\Controllers\Seller\ProductController;
use App\Http\Controllers\Seller\ReviewController;
use App\Http\Controllers\Seller\SettingsController;
use App\Http\Controllers\Seller\AttendanceController;
use App\Http\Controllers\Seller\RefundController as SellerRefundController;
use App\Http\Controllers\Seller\RevenueController;
use App\Http\Controllers\Seller\SubscriptionController as SellerSubscriptionController;
use App\Http\Controllers\Seller\CouponController as SellerCouponController;
use App\Http\Controllers\Seller\PayrollController;
use App\Http\Controllers\Seller\StaffController;
use App\Http\Controllers\Seller\VehicleController;
use App\Http\Controllers\Seller\UserReportController as SellerUserReportController;
use App\Http\Controllers\LoyaltyController;
use Illuminate\Support\Facades\Route;

// ── Seller Portal (authenticated, verified, approved seller or seller_staff) ─
Route::middleware(['auth', 'verified', 'seller', 'password.changed'])
    ->prefix('seller')
    ->name('seller.')
    ->group(function () {

        // Dashboard
        Route::get('dashboard', [DashboardController::class, 'index'])
            ->middleware('module:dashboard')
            ->name('dashboard');

        // ── Products ─────────────────────────────────────────────────────────
        Route::middleware('module:products')->group(function () {
            Route::get('products', [ProductController::class, 'index'])->name('products');
            Route::post('products', [ProductController::class, 'store'])->name('products.store');
            Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update');
            Route::patch('products/{product}/toggle', [ProductController::class, 'toggle'])->name('products.toggle');
            Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy');
            Route::post('products/{product}/restore', [ProductController::class, 'restore'])
                ->withTrashed()->name('products.restore');
            Route::delete('products/{product}/force', [ProductController::class, 'forceDestroy'])
                ->withTrashed()->name('products.force-delete');
        });

        // ── Orders ───────────────────────────────────────────────────────────
        Route::middleware('module:orders')->group(function () {
            Route::get('orders', [OrderController::class, 'index'])->name('orders');
            Route::get('orders/export', [OrderController::class, 'export'])->middleware('plan.feature:export')->name('orders.export');
            Route::get('orders/create', [OrderController::class, 'create'])->name('orders.create');
            Route::post('orders', [OrderController::class, 'store'])->name('orders.store');

            Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
            Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
            Route::patch('orders/{order}/payment', [OrderController::class, 'updatePayment'])->name('orders.payment');
            Route::patch('orders/{order}/refunded', [OrderController::class, 'markRefunded'])->name('orders.refunded');
            Route::post('orders/batch-assign', [OrderController::class, 'batchAssign'])->name('orders.batch-assign');
            Route::post('orders/{order}/assign-delivery', [OrderController::class, 'assignDelivery'])->name('orders.assign-delivery');
            Route::delete('orders/{order}', [OrderController::class, 'destroy'])->name('orders.destroy');
            // Acknowledgement receipts (one per payment) — with the orders, so staff without Invoices can open them
            Route::get('receipts/{receipt}/pdf', [\App\Http\Controllers\PaymentReceiptController::class, 'sellerPdf'])->name('receipts.pdf');
        });

        // ── Messages ─────────────────────────────────────────────────────────
        Route::middleware('module:messages')->group(function () {
            // ── Messages (chat) — 'start' / 'unread-count' before the {conversation} wildcard ──
            Route::get('messages', [SellerMessageController::class, 'index'])->name('messages');
            Route::post('messages/start', [SellerMessageController::class, 'start'])->name('messages.start');
            Route::get('messages/unread-count', [SellerMessageController::class, 'unreadCount'])->name('messages.unread');
            Route::get('messages/{conversation}', [SellerMessageController::class, 'show'])->name('messages.show');
            Route::get('messages/{conversation}/messages', [SellerMessageController::class, 'messages'])->name('messages.poll');
            Route::post('messages/{conversation}', [SellerMessageController::class, 'store'])->middleware('throttle:30,1')->name('messages.send');
            Route::get('messages/{conversation}/crm', [SellerMessageController::class, 'crm'])->name('messages.crm');
            Route::get('quick-replies', [SellerMessageController::class, 'quickReplies'])->name('quick-replies');
            Route::post('quick-replies', [SellerMessageController::class, 'storeQuickReply'])->name('quick-replies.store');
            Route::put('quick-replies/{quickReply}', [SellerMessageController::class, 'updateQuickReply'])->name('quick-replies.update');
            Route::delete('quick-replies/{quickReply}', [SellerMessageController::class, 'destroyQuickReply'])->name('quick-replies.destroy');
        });

        Route::middleware('module:deliveries')->group(function () {
            Route::get('deliveries', [DeliveryController::class, 'index'])->name('deliveries');
            Route::post('deliveries/assign', [DeliveryController::class, 'assign'])->name('deliveries.assign');
            Route::patch('deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus'])->name('deliveries.status');
        });

        // ── Vehicles ─────────────────────────────────────────────────────────
        Route::get('vehicles', [VehicleController::class, 'index'])->name('vehicles');
        Route::post('vehicles', [VehicleController::class, 'store'])->name('vehicles.store');
        // Before vehicles/{vehicle}, otherwise {vehicle} would capture "rates"
        Route::put('vehicles/rates', [VehicleController::class, 'updateRates'])->name('vehicles.rates');
        Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])->name('vehicles.update');
        Route::delete('vehicles/{vehicle}', [VehicleController::class, 'destroy'])->name('vehicles.destroy');
        Route::patch('vehicles/{vehicle}/plan-pause', [VehicleController::class, 'togglePlanPause'])->name('vehicles.plan-pause');
        Route::post('vehicles/{vehicle}/restore', [VehicleController::class, 'restore'])
            ->withTrashed()->name('vehicles.restore');

        // ── Invoices ─────────────────────────────────────────────────────────
        Route::middleware('module:invoices')->group(function () {
            Route::get('invoices', [InvoiceController::class, 'index'])->name('invoices');
            Route::get('invoices/export', [InvoiceController::class, 'export'])->middleware('plan.feature:export')->name('invoices.export');
            Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
            Route::get('invoices/{invoice}/pdf', [InvoiceController::class, 'pdf'])->name('invoices.pdf');
            Route::post('invoices/{invoice}/record-payment', [InvoiceController::class, 'recordPayment'])->name('invoices.record-payment');
        });

        // ── Inventory ────────────────────────────────────────────────────────
        Route::middleware('module:inventory')->group(function () {
            Route::get('inventory', [InventoryController::class, 'index'])->name('inventory');
            Route::post('inventory/{product}/stock-in', [InventoryController::class, 'stockIn'])->name('inventory.stock-in');
            Route::post('inventory/{product}/stock-out', [InventoryController::class, 'stockOut'])->name('inventory.stock-out');
            Route::patch('inventory/{product}/reorder-level', [InventoryController::class, 'updateReorderLevel'])->name('inventory.reorder-level');
        });

        // ── Staff (seller owner only — seller_staff cannot manage staff) ─────
        Route::middleware('seller_owner')->group(function () {
            Route::get('staff', [StaffController::class, 'index'])->name('staff');
            Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
            Route::get('staff/{user}', [StaffController::class, 'show'])->name('staff.show');
            Route::put('staff/{user}', [StaffController::class, 'update'])->name('staff.update');
            Route::patch('staff/{user}/toggle', [StaffController::class, 'toggle'])->name('staff.toggle');
            Route::patch('staff/{user}/plan-pause', [StaffController::class, 'togglePlanPause'])->name('staff.plan-pause');
            Route::put('staff/{user}/permissions', [StaffController::class, 'updatePermissions'])->name('staff.permissions');
            Route::delete('staff/{user}/permissions', [StaffController::class, 'resetPermissions'])->name('staff.permissions.reset');
            Route::delete('staff/{user}', [StaffController::class, 'destroy'])->name('staff.destroy');
            Route::post('staff/{user}/restore', [StaffController::class, 'restore'])
                ->withTrashed()->name('staff.restore');
            Route::delete('staff/{user}/force', [StaffController::class, 'forceDestroy'])
                ->withTrashed()->name('staff.force-delete');

            // Staff roles (Off / View only / Full access per module) — creating / editing / deleting is a Pro feature
            Route::middleware('plan.feature:custom_roles')->group(function () {
                Route::post('roles', [\App\Http\Controllers\Seller\StoreRoleController::class, 'store'])->name('roles.store');
                Route::put('roles/{role}', [\App\Http\Controllers\Seller\StoreRoleController::class, 'update'])->name('roles.update');
                Route::delete('roles/{role}', [\App\Http\Controllers\Seller\StoreRoleController::class, 'destroy'])->name('roles.destroy');
            });
        });

        // ── Attendance of other staff (owner + staff with the Attendance module; writes need Full access) ──
        Route::middleware('module:attendance')->group(function () {
        Route::get('attendance', [AttendanceController::class, 'index'])->name('attendance');
        Route::get('attendance/export', [AttendanceController::class, 'export'])->middleware('plan.feature:export')->name('attendance.export');
        Route::post('attendance/clock-in', [AttendanceController::class, 'clockIn'])->name('attendance.clock-in');
        Route::post('attendance/clock-out', [AttendanceController::class, 'clockOut'])->name('attendance.clock-out');
        Route::post('attendance/set-clock-out', [AttendanceController::class, 'setClockOut'])->name('attendance.set-clock-out');
        });

        // ── My Payslips (self — all seller_staff) ────────────────────────────
        Route::get('my-payslips', [PayrollController::class, 'myPayslips'])->name('my-payslips');
        // Outside the plan group: staff keep their payslips after a downgrade (own + released/paid only)
        Route::get('my-payslips/{payroll}', [PayrollController::class, 'myPayslip'])->whereNumber('payroll')->name('my-payslips.show');
        Route::get('my-payslips/{payroll}/pdf', [PayrollController::class, 'myPayslipPdf'])->whereNumber('payroll')->name('my-payslips.pdf');

        // ── My Attendance (self — all seller_staff except rider) ──────────────
        Route::get('my-attendance', [AttendanceController::class, 'myAttendance'])->name('my-attendance');
        Route::post('my-attendance/clock-in', [AttendanceController::class, 'myClockIn'])->name('my-attendance.clock-in');
        Route::post('my-attendance/clock-out', [AttendanceController::class, 'myClockOut'])->name('my-attendance.clock-out');

        // ── My Documents (store staff; reviewed by the owner) ────────────────
        Route::get('my-documents', [\App\Http\Controllers\StaffDocumentController::class, 'index'])->name('my-documents');
        Route::post('my-documents', [\App\Http\Controllers\StaffDocumentController::class, 'store'])->middleware('throttle:20,1')->name('my-documents.store');

        // ── Payroll (seller owner + HR can view; owner-only for settings/actions) — Pro plan and up
        Route::middleware('plan.feature:payroll')->group(function () {
            Route::get('payroll', [PayrollController::class, 'index'])->name('payroll');
            Route::get('payroll/export', [PayrollController::class, 'export'])->middleware('plan.feature:export')->name('payroll.export');
            Route::post('payroll/generate', [PayrollController::class, 'generate'])->name('payroll.generate');
            Route::patch('payroll/{payroll}/release', [PayrollController::class, 'markReleased'])->name('payroll.release');
            Route::patch('payroll/{payroll}/paid', [PayrollController::class, 'markPaid'])->name('payroll.paid');
            Route::get('payroll/settings', [PayrollController::class, 'settings'])->name('payroll.settings');
            Route::post('payroll/settings', [PayrollController::class, 'updateSettings'])->name('payroll.settings.update');
            Route::patch('payroll/staff/{user}/rate', [PayrollController::class, 'updateStaffRate'])->name('payroll.staff-rate');
            // Payslip — after payroll/settings + payroll/export, numeric only (else "settings" binds as an id)
            Route::get('payroll/{payroll}', [PayrollController::class, 'show'])->whereNumber('payroll')->name('payroll.show');
            Route::get('payroll/{payroll}/pdf', [PayrollController::class, 'pdf'])->whereNumber('payroll')->name('payroll.pdf');
        });

        // ── Revenue (seller owner only) ────────────────────────────────────────
        Route::middleware('seller_owner')->group(function () {
            // My Plan (subscription)
            Route::get('plan', [SellerSubscriptionController::class, 'index'])->name('plan');
            Route::post('plan/checkout', [SellerSubscriptionController::class, 'checkout'])->middleware('throttle:10,1')->name('plan.checkout');
            Route::get('plan/receipts/{payment}/pdf', [SellerSubscriptionController::class, 'receipt'])->name('plan.receipt');
            // Cash recorded by the platform admin — the plan changes only when the owner accepts
            Route::post('plan/cash/{payment}/accept', [SellerSubscriptionController::class, 'acceptCash'])->middleware('throttle:10,1')->name('plan.cash.accept');
            Route::post('plan/cash/{payment}/decline', [SellerSubscriptionController::class, 'declineCash'])->middleware('throttle:10,1')->name('plan.cash.decline');

            Route::get('revenue', [RevenueController::class, 'index'])->name('revenue');
            Route::get('revenue/export', [RevenueController::class, 'export'])->middleware('plan.feature:export')->name('revenue.export');

            // Store coupons — Pro plan and up
            Route::middleware('plan.feature:coupons')->group(function () {
                Route::get('coupons', [SellerCouponController::class, 'index'])->name('coupons');
                Route::post('coupons', [SellerCouponController::class, 'store'])->name('coupons.store');
                Route::put('coupons/{coupon}', [SellerCouponController::class, 'update'])->name('coupons.update');
                Route::patch('coupons/{coupon}/toggle', [SellerCouponController::class, 'toggle'])->name('coupons.toggle');
                Route::delete('coupons/{coupon}', [SellerCouponController::class, 'destroy'])->name('coupons.destroy');
            });
        });

        // ── Refund requests (handled by the seller) ──────────────────────────
        Route::middleware('module:orders')->group(function () {
            Route::get('refunds', [SellerRefundController::class, 'index'])->name('refunds');
            Route::patch('refunds/{refund}/accept', [SellerRefundController::class, 'accept'])->name('refunds.accept');
            Route::patch('refunds/{refund}/reject', [SellerRefundController::class, 'reject'])->name('refunds.reject');
        });

        // ── Reviews ──────────────────────────────────────────────────────────
        Route::get('reviews', [ReviewController::class, 'index'])
            ->middleware('module:products')
            ->name('reviews');

        // ── Reports ──────────────────────────────────────────────────────────
        Route::middleware('module:reports')->group(function () {
            Route::get('reports', [ReportsController::class, 'index'])->name('reports');
            Route::get('reports/export', [ReportsController::class, 'export'])->middleware('plan.feature:export')->name('reports.export');
        });

        // ── Customer Reports (customer / rider reports for this store + reports the store files) ──
        // (separate from the sales 'reports' pages above)
        Route::middleware('module:customer_reports')->group(function () {
            Route::post('reports/user', [SellerUserReportController::class, 'store'])->middleware('throttle:20,60')->name('reports.user.store');
            Route::get('customer-reports', [SellerUserReportController::class, 'index'])->name('customer-reports');
            Route::get('customer-reports/{userReport}', [SellerUserReportController::class, 'show'])->name('customer-reports.show');
            Route::post('customer-reports/{userReport}/reply', [SellerUserReportController::class, 'reply'])->name('customer-reports.reply');
            Route::post('customer-reports/{userReport}/start-review', [SellerUserReportController::class, 'startReview'])->name('customer-reports.start-review');
            Route::post('customer-reports/{userReport}/start-investigating', [SellerUserReportController::class, 'startInvestigating'])->name('customer-reports.start-investigating');
            Route::post('customer-reports/{userReport}/propose-resolution', [SellerUserReportController::class, 'proposeResolution'])->name('customer-reports.propose-resolution');
            Route::post('customer-reports/{userReport}/withdraw', [SellerUserReportController::class, 'withdraw'])->name('customer-reports.withdraw');
        });

        // ── My website reports (any owner / non-rider staff — no extra permission) ──
        Route::get('website-reports', [SellerWebsiteReportController::class, 'index'])->name('website-reports');
        Route::post('website-reports', [SellerWebsiteReportController::class, 'store'])->middleware('throttle:20,60')->name('website-reports.store');
        Route::get('website-reports/{userReport}', [SellerWebsiteReportController::class, 'show'])->name('website-reports.show');
        Route::post('website-reports/{userReport}/reply', [SellerWebsiteReportController::class, 'reply'])->name('website-reports.reply');
        Route::post('website-reports/{userReport}/confirm', [SellerWebsiteReportController::class, 'confirm'])->name('website-reports.confirm');
        Route::post('website-reports/{userReport}/not-solved', [SellerWebsiteReportController::class, 'notSolved'])->name('website-reports.not-solved');

        // ── Loyalty program ──────────────────────────────────────────────────
        // Settings/toggle: store owner only. Customers: owner + HR (checked in controller).
        // Pro plan and up.
        Route::middleware('plan.feature:loyalty')->group(function () {
            Route::middleware('seller_owner')->group(function () {
                Route::get('loyalty/settings', [LoyaltyController::class, 'getSettings'])->name('loyalty.settings');
                Route::put('loyalty/settings', [LoyaltyController::class, 'updateSettings'])->name('loyalty.settings.update');
                Route::post('loyalty/toggle', [LoyaltyController::class, 'toggleLoyalty'])->name('loyalty.toggle');
                Route::put('loyalty/consignment', [LoyaltyController::class, 'updateConsignment'])->name('loyalty.consignment');
            });
            Route::get('loyalty/customers', [LoyaltyController::class, 'getCustomers'])->name('loyalty.customers');
            Route::get('loyalty/customers/export', [LoyaltyController::class, 'exportCustomers'])->middleware('plan.feature:export')->name('loyalty.customers.export');
        });

        // ── DSS (Premium plan) ───────────────────────────────────────────────
        Route::get('dss', [DssController::class, 'index'])
            ->middleware(['module:dss', 'plan.feature:dss'])
            ->name('dss');

        // ── Store Documents (permit renewals, extra documents) — owner only ──
        Route::middleware('seller_owner')->group(function () {
            Route::get('documents', [\App\Http\Controllers\Seller\StoreDocumentController::class, 'index'])->name('documents.index');
            Route::post('documents', [\App\Http\Controllers\Seller\StoreDocumentController::class, 'store'])->middleware('throttle:20,1')->name('documents.store');
            // Staff / rider documents (driver's license etc.) — the owner reviews them
            Route::post('staff-documents/{document}/approve', [\App\Http\Controllers\Seller\StaffDocumentReviewController::class, 'approve'])->name('staff-documents.approve');
            Route::post('staff-documents/{document}/reject', [\App\Http\Controllers\Seller\StaffDocumentReviewController::class, 'reject'])->name('staff-documents.reject');
        });

        // ── Settings ─────────────────────────────────────────────────────────
        Route::middleware('module:settings')->group(function () {
            Route::get('settings', [SettingsController::class, 'index'])->name('settings');
            Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
            // The Settings page posts FormData with _method=PUT (file upload) — this is the route it hits
            Route::put('settings', [SettingsController::class, 'update'])->name('settings.put');
            // Tax & Invoice (VAT status, TIN, invoice code) — the owner only; staff see it read-only
            Route::put('settings/tax', [SettingsController::class, 'updateTax'])->middleware('seller_owner')->name('settings.tax');
        });
    });
