@php
    $peso = fn ($n) => '₱' . number_format((float) $n, 2);
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Purchase order {{ $po->po_number }}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { font-family: 'DejaVu Sans', sans-serif; }
        body { font-size: 10pt; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        .muted { color: #6b7280; }
        .head td { vertical-align: top; }
        .seller-name { font-size: 15pt; font-weight: bold; margin: 0 0 2px; }
        .title { font-size: 18pt; font-weight: bold; letter-spacing: 1px; color: #1e3a8a; margin: 0; text-align: right; }
        .right { text-align: right; }
        .box { border: 1px solid #e5e7eb; padding: 8px 10px; margin-top: 12px; }
        .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 2px; }
        .items { margin-top: 14px; }
        .items th { background: #f3f4f6; font-size: 8.5pt; text-align: left; padding: 6px; border-bottom: 1px solid #d1d5db; }
        .items td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
        .num { text-align: right; white-space: nowrap; }
        .total td { border-top: 2px solid #111827; font-weight: bold; font-size: 11pt; padding-top: 6px; }
        .footer { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8pt; color: #6b7280; text-align: center; }
    </style>
</head>
<body>
<table class="head">
    <tr>
        <td style="width: 60%;">
            @if($logo)<img src="{{ $logo }}" style="height: 46px; margin-bottom: 4px;" alt="">@endif
            <p class="seller-name">{{ $store?->registered_name ?: $store?->store_name }}</p>
            <div class="muted">{{ collect([$store?->address, $store?->barangay, $store?->city, $store?->province])->filter()->implode(', ') }}</div>
            @if($store?->phone)<div class="muted">{{ $store->phone }}</div>@endif
            @if($store?->tin)<div class="muted">TIN {{ $store->tin }}</div>@endif
        </td>
        <td class="right">
            <p class="title">PURCHASE ORDER</p>
            <div><strong>{{ $po->po_number }}</strong></div>
            <div class="muted">Date: {{ ($po->sent_at ?? $po->created_at)->timezone('Asia/Manila')->format('M j, Y') }}</div>
            @if($po->expected_on)<div class="muted">Expected: {{ $po->expected_on->format('M j, Y') }}</div>@endif
        </td>
    </tr>
</table>

<div class="box">
    <div class="label">Supplier</div>
    <strong>{{ $po->supplier?->name }}</strong>
    @if($po->supplier?->contact_person) · {{ $po->supplier->contact_person }}@endif
    <div class="muted">{{ collect([$po->supplier?->address, $po->supplier?->phone, $po->supplier?->email])->filter()->implode(' · ') }}</div>
    @if($po->supplier?->payment_terms)<div class="muted">Payment terms: {{ $po->supplier->payment_terms }}</div>@endif
    @if($po->payment_due_on)<div class="muted">Due: {{ $po->payment_due_on->format('M j, Y') }}</div>@endif
</div>

<table class="items">
    <tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Amount</th></tr>
    @foreach($po->items as $i => $item)
        <tr>
            <td>{{ $i + 1 }}</td>
            <td>{{ $item->product?->name }}@if($item->product?->brand) <span class="muted">· {{ $item->product->brand }}</span>@endif</td>
            <td class="num">{{ $item->quantity_ordered }}</td>
            <td class="num">{{ $peso($item->unit_cost) }}</td>
            <td class="num">{{ $peso($item->line_total) }}</td>
        </tr>
    @endforeach
    <tr class="total"><td colspan="4" class="num">Total</td><td class="num">{{ $peso($po->subtotal) }}</td></tr>
</table>

@if($po->notes)
    <div class="box"><div class="label">Notes</div>{{ $po->notes }}</div>
@endif

<div class="footer">Prepared by {{ $po->creator?->name ?? $store?->store_name }} · {{ $store?->store_name }}</div>
</body>
</html>
