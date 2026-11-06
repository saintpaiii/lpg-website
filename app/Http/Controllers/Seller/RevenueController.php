<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Seller sales overview: the store's delivered and paid orders. The platform takes no cut,
 * so every peso of these sales belongs to the store.
 */
class RevenueController extends Controller
{
    use GeneratesExport;

    /** When a sale counts: delivered_at, or created_at for old orders without it */
    private const SALE_DATE = 'COALESCE(orders.delivered_at, orders.created_at)';

    private function sales(int $storeId)
    {
        return Order::where('store_id', $storeId)->where('status', 'delivered')->where('payment_status', 'paid');
    }

    private function filteredQuery(Request $request, int $storeId)
    {
        $query = $this->sales($storeId);

        if ($df = $request->get('date_from')) $query->whereDate(DB::raw(self::SALE_DATE), '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate(DB::raw(self::SALE_DATE), '<=', $dt);

        return $query->orderByRaw(self::SALE_DATE . ' DESC');
    }

    /** Items + delivery fee */
    private static function saleTotal($q): float
    {
        return (float) (clone $q)->sum('total_amount') + (float) (clone $q)->sum('shipping_fee');
    }

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        $all   = $this->sales($store->id);
        $month = $this->sales($store->id)
            ->whereBetween(DB::raw(self::SALE_DATE), [now()->startOfMonth(), now()->endOfMonth()]);

        $totalSales = self::saleTotal($all);
        $orderCount = (clone $all)->count();

        $orders = $this->filteredQuery($request, $store->id)
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Order $o) => [
                'id'             => $o->id,
                'order_number'   => $o->order_number,
                'delivered_on'   => ($o->delivered_at ?? $o->created_at)->format('M d, Y'),
                'payment_mode'   => $o->payment_mode ?? 'full',
                'payment_method' => $o->payment_method,
                'subtotal'       => (float) $o->total_amount,
                'shipping_fee'   => (float) $o->shipping_fee,
                'total'          => $o->grandTotal(),
            ]);

        $monthSales = self::saleTotal($month);

        // Tax reminder (estimate only — the platform never files or pays taxes for the store)
        $isVat = $store->vat_status === 'vat';
        $tax = [
            'vat_status'              => $isVat ? 'vat' : 'non_vat',
            'month_sales'             => $monthSales,
            // No join: the month's order ids as a subquery (soft-deleted invoices are left out by default)
            'vat_collected'           => $isVat
                ? round((float) Invoice::whereIn('order_id', (clone $month)->select('orders.id'))->where('vat_status', 'vat')->sum('vat_amount'), 2)
                : null,
            'percentage_tax_estimate' => $isVat ? null : round($monthSales * 0.03, 2),
        ];

        return Inertia::render('seller/revenue', [
            'tax'     => $tax,
            'summary' => [
                'total_sales'         => $totalSales,
                'month_sales'         => $monthSales,
                'orders'              => $orderCount,
                'average_order_value' => $orderCount > 0 ? round($totalSales / $orderCount, 2) : 0,
            ],
            'orders'  => $orders,
            'filters' => $request->only('date_from', 'date_to'),
        ]);
    }

    public function export(Request $request)
    {
        $store  = $request->attributes->get('seller_store');
        $format = $request->get('format', 'csv');
        $rows   = $this->filteredQuery($request, $store->id)->with('invoice')->get();
        // VAT stores: the VAT on each order's invoice (blank when it has none, e.g. older INV- invoices)
        $isVat  = $store->vat_status === 'vat';
        $vatOf  = fn (Order $o) => $o->invoice && $o->invoice->vat_status === 'vat' ? (float) $o->invoice->vat_amount : null;

        $from     = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to       = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('sales', $store->store_name, $from, $to, $format);

        $data = $rows->map(fn (Order $o) => [
            'order'     => $o->order_number,
            'delivered' => ($o->delivered_at ?? $o->created_at)->setTimezone('Asia/Manila')->format('M d, Y'),
            'payment'   => ucfirst($o->payment_mode ?? 'full') . ($o->payment_method ? ' · ' . str_replace('_', ' ', $o->payment_method) : ''),
            'subtotal'  => $this->peso((float) $o->total_amount),
            'shipping'  => $this->peso((float) $o->shipping_fee),
            'total'     => $this->peso($o->grandTotal()),
        ] + ($isVat ? ['vat' => $vatOf($o) !== null ? $this->peso($vatOf($o)) : ''] : []))->values()->all();
        $sumVat = $rows->sum(fn (Order $o) => $vatOf($o) ?? 0);

        $sumSub   = $rows->sum(fn ($o) => (float) $o->total_amount);
        $sumShip  = $rows->sum(fn ($o) => (float) $o->shipping_fee);
        $sumTotal = $rows->sum(fn (Order $o) => $o->grandTotal());

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Sales Report',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Orders',      'value' => count($data)],
                    ['label' => 'Total Sales', 'value' => $this->peso($sumTotal)],
                ],
                'columns' => [
                    ['key' => 'order',     'label' => 'Order #', 'class' => 'mono'],
                    ['key' => 'delivered', 'label' => 'Delivered on'],
                    ['key' => 'payment',   'label' => 'Payment'],
                    ['key' => 'subtotal',  'label' => 'Items Subtotal', 'align' => 'right'],
                    ['key' => 'shipping',  'label' => 'Delivery Fee', 'align' => 'right'],
                    ['key' => 'total',     'label' => 'Total', 'align' => 'right'],
                    ...($isVat ? [['key' => 'vat', 'label' => 'VAT', 'align' => 'right']] : []),
                ],
                'rows'      => $data,
                'totalsRow' => ['order' => 'TOTAL', 'delivered' => '', 'payment' => '', 'subtotal' => $this->peso($sumSub), 'shipping' => $this->peso($sumShip), 'total' => $this->peso($sumTotal)]
                    + ($isVat ? ['vat' => $this->peso($sumVat)] : []),
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', '', $this->peso($sumSub), $this->peso($sumShip), $this->peso($sumTotal), ...($isVat ? [$this->peso($sumVat)] : [])];

        return $this->csvResponse($filename, ['Order #', 'Delivered on', 'Payment', 'Items Subtotal', 'Delivery Fee', 'Total', ...($isVat ? ['VAT'] : [])], $csv);
    }
}
