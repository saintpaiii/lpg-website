<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Store;
use App\Models\User;
use App\Services\InvoiceService;
use App\Services\StaffAccess;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Printable invoice (/invoices/{invoice}/print). The STORE is the issuer, so the page shows the store's header.
 * Access: admin / platform staff with invoices.view → any; seller → own store; seller staff → own store with the
 * Invoices module; customer → own invoices (same ID rule as the invoice history); everyone else → 403.
 */
class InvoicePrintController extends Controller
{
    public static function canView(User $user, Invoice $invoice): bool
    {
        if ($user->isAdmin() || ($user->is_platform_staff && $user->hasPermission('invoices.view'))) {
            return true;
        }

        return match ($user->role) {
            'seller'       => Store::where('user_id', $user->id)->where('id', $invoice->store_id)->exists(),
            'seller_staff' => $user->store_id !== null && (int) $user->store_id === (int) $invoice->store_id
                && StaffAccess::levelFor($user, 'invoices') !== null,
            'customer'     => ! $user->isLockedNewcomer()
                && Customer::where('user_id', $user->id)->where('id', $invoice->customer_id)->exists(),
            default        => false,
        };
    }

    public function show(Request $request, Invoice $invoice): Response
    {
        abort_unless(self::canView($request->user(), $invoice), 403);

        return Inertia::render('invoice-print', [
            'doc' => InvoiceService::viewData($invoice),
        ]);
    }
}
