<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
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

        return Inertia::render('seller/revenue', [
            'summary' => [
                'total_sales'         => $totalSales,
                'month_sales'         => self::saleTotal($month),
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
        $rows   = $this->filteredQuery($request, $store->id)->get();

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
        ])->values()->all();

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
                ],
                'rows'      => $data,
                'totalsRow' => ['order' => 'TOTAL', 'delivered' => '', 'payment' => '', 'subtotal' => $this->peso($sumSub), 'shipping' => $this->peso($sumShip), 'total' => $this->peso($sumTotal)],
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', '', $this->peso($sumSub), $this->peso($sumShip), $this->peso($sumTotal)];

        return $this->csvResponse($filename, ['Order #', 'Delivered on', 'Payment', 'Items Subtotal', 'Delivery Fee', 'Total'], $csv);
    }
}
