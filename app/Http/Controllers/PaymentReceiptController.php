<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\PaymentReceipt;
use App\Services\PaymentReceiptService;
use Illuminate\Http\Request;

/** Acknowledgement receipt PDFs for the three portals (each with its own access rule). */
class PaymentReceiptController extends Controller
{
    /** Customer: own receipts only (another customer's → 403). */
    public function customerPdf(Request $request, PaymentReceipt $receipt)
    {
        $customer = Customer::where('user_id', $request->user()->id)->first();
        if (! $customer || $receipt->customer_id !== $customer->id) {
            abort(403);
        }

        return PaymentReceiptService::pdfResponse($receipt);
    }

    /** Seller (owner or staff with the Orders module): this store's receipts only (another store's → 404). */
    public function sellerPdf(Request $request, PaymentReceipt $receipt)
    {
        $store = $request->attributes->get('seller_store');
        if (! $store || $receipt->store_id !== $store->id) {
            abort(404);
        }

        return PaymentReceiptService::pdfResponse($receipt);
    }

    /** Platform admin (permission:invoices.view). */
    public function adminPdf(PaymentReceipt $receipt)
    {
        return PaymentReceiptService::pdfResponse($receipt);
    }
}
