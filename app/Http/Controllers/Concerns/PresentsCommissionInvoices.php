<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Commission;
use App\Models\CommissionInvoice;
use App\Models\Setting;

/**
 * Shared formatting + PDF for commission invoices (admin and seller portals).
 * Requires the GeneratesExport trait on the using controller.
 */
trait PresentsCommissionInvoices
{
    protected function formatInvoice(CommissionInvoice $i): array
    {
        return [
            'id'                => $i->id,
            'invoice_number'    => $i->invoice_number,
            'store_id'          => $i->store_id,
            'store_name'        => $i->store?->store_name,
            'store_suspended'   => (bool) $i->store?->commission_suspended,
            'period_start'      => $i->period_start->format('M d, Y'),
            'period_end'        => $i->period_end->format('M d, Y'),
            'period_label'      => $i->periodLabel(),
            'total_orders'      => $i->total_orders,
            'total_sales'       => (float) $i->total_sales,
            'commission_rate'   => (float) $i->commission_rate,
            'commission_amount' => (float) $i->commission_amount,
            'status'            => $i->status,
            'due_date'          => $i->due_date->format('M d, Y'),
            'days_overdue'      => $i->isUnpaid() ? $i->daysOverdue() : 0,
            'paid_at'           => $i->paid_at?->format('M d, Y g:i A'),
            'payment_reference' => $i->payment_reference,
            'payment_method'    => $i->payment_method,
            'notes'             => $i->notes,
            'created_at'        => $i->created_at->format('M d, Y'),
        ];
    }

    /** Per-order breakdown rows for an invoice. */
    protected function invoiceLines(CommissionInvoice $i): array
    {
        return $i->commissions()->with('order')->orderBy('created_at')->get()
            ->map(fn (Commission $c) => [
                'id'                => $c->id,
                'order_id'          => $c->order_id,
                'order_number'      => $c->order?->order_number,
                'payment_mode'      => $c->order?->payment_mode,
                'delivered_at'      => ($c->order?->delivered_at ?? $c->created_at)->format('M d, Y'),
                'order_total'       => (float) $c->order_total,
                'commission_rate'   => (float) $c->commission_rate,
                'commission_amount' => (float) $c->commission_amount,
            ])->values()->all();
    }

    protected function invoicePdf(CommissionInvoice $i)
    {
        $lines = $this->invoiceLines($i);

        $rows = array_map(fn ($l) => [
            'date'       => $l['delivered_at'],
            'order'      => $l['order_number'] ?? '—',
            'total'      => $this->peso($l['order_total']),
            'rate'       => number_format($l['commission_rate'], 2) . '%',
            'commission' => $this->peso($l['commission_amount']),
        ], $lines);

        $status = ucfirst($i->status) . ($i->paid_at ? ' · paid ' . $i->paid_at->format('M d, Y') : '');

        return $this->pdfResponse($i->invoice_number . '.pdf', [
            'title'        => 'Commission Invoice ' . $i->invoice_number,
            'subtitle'     => 'Billed to: ' . ($i->store?->store_name ?? '—') . ' · Due ' . $i->due_date->format('M d, Y') . ' · ' . $status,
            'orgName'      => Setting::get('company_name', 'LPG Marketplace Cavite'),
            'orgSub'       => Setting::get('company_address', '') ?: 'Cavite, Philippines',
            'dateRange'    => $i->periodLabel(),
            'summaryItems' => [
                ['label' => 'Orders',          'value' => $i->total_orders],
                ['label' => 'Total Sales',     'value' => $this->peso((float) $i->total_sales)],
                ['label' => 'Commission Rate', 'value' => number_format((float) $i->commission_rate, 2) . '%'],
                ['label' => 'Amount Due',      'value' => $this->peso((float) $i->commission_amount)],
            ],
            'columns' => [
                ['key' => 'date',       'label' => 'Delivered'],
                ['key' => 'order',      'label' => 'Order #', 'class' => 'mono'],
                ['key' => 'total',      'label' => 'Order Total', 'align' => 'right'],
                ['key' => 'rate',       'label' => 'Rate', 'align' => 'right'],
                ['key' => 'commission', 'label' => 'Commission', 'align' => 'right'],
            ],
            'rows'      => $rows,
            'totalsRow' => [
                'date' => 'TOTAL', 'order' => '', 'total' => $this->peso((float) $i->total_sales),
                'rate' => '', 'commission' => $this->peso((float) $i->commission_amount),
            ],
        ]);
    }
}
