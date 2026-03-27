<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Fix: invoice payment_method was a narrow ENUM that excluded card/grab_pay
        // (PayMongo sets those values before seller confirms, causing Invoice::create() to fail)
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method VARCHAR(30) NULL");

        // Backfill invoices for confirmed/preparing/out_for_delivery/delivered orders
        // that are missing an invoice (e.g. orders confirmed before this fix)
        $ordersToBackfill = DB::table('orders')
            ->leftJoin('invoices', 'orders.id', '=', 'invoices.order_id')
            ->whereIn('orders.status', ['confirmed', 'preparing', 'out_for_delivery', 'delivered'])
            ->whereNull('orders.deleted_at')
            ->whereNull('invoices.id')
            ->whereNotNull('orders.store_id')
            ->orderBy('orders.created_at')
            ->select(
                'orders.id',
                'orders.order_number',
                'orders.customer_id',
                'orders.store_id',
                'orders.total_amount',
                'orders.payment_status',
                'orders.payment_method',
                'orders.created_at'
            )
            ->get();

        foreach ($ordersToBackfill as $order) {
            $year  = date('Y', strtotime($order->created_at));
            $count = DB::table('invoices')->whereYear('created_at', $year)->count();

            $store          = DB::table('stores')->where('id', $order->store_id)->first();
            $commissionRate = $store ? (float) ($store->commission_rate ?? 0) : 0;
            $commission     = $commissionRate / 100 * (float) $order->total_amount;

            $invoiceNumber = 'INV-' . $year . '-' . str_pad($count + 1, 5, '0', STR_PAD_LEFT);

            DB::table('invoices')->insert([
                'store_id'            => $order->store_id,
                'invoice_number'      => $invoiceNumber,
                'order_id'            => $order->id,
                'customer_id'         => $order->customer_id,
                'total_amount'        => $order->total_amount,
                'payment_status'      => $order->payment_status === 'paid' ? 'paid' : 'unpaid',
                'paid_amount'         => $order->payment_status === 'paid' ? $order->total_amount : 0,
                'payment_method'      => $order->payment_method,
                'paid_at'             => $order->payment_status === 'paid' ? now() : null,
                'due_date'            => date('Y-m-d', strtotime('+7 days', strtotime($order->created_at))),
                'platform_commission' => $commission,
                'created_at'          => $order->created_at,
                'updated_at'          => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya') NULL");
    }
};
