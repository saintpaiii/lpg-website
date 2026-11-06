@php
    $peso = fn ($n) => '₱' . number_format((float) $n, 2);
    $b    = $doc['breakdown'];
    $pay  = $doc['payment'];
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice {{ $doc['number'] }}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { font-family: 'DejaVu Sans', sans-serif; }
        body { font-size: 10pt; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        .muted { color: #6b7280; }
        .small { font-size: 8.5pt; }
        .head td { vertical-align: top; }
        .seller-name { font-size: 15pt; font-weight: bold; margin: 0 0 2px; }
        .title { font-size: 20pt; font-weight: bold; letter-spacing: 2px; color: #1e3a8a; margin: 0; text-align: right; }
        .right { text-align: right; }
        .box { border: 1px solid #e5e7eb; padding: 8px 10px; margin-top: 12px; }
        .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 2px; }
        .items { margin-top: 14px; }
        .items th { background: #f3f4f6; font-size: 8.5pt; text-align: left; padding: 6px 6px; border-bottom: 1px solid #d1d5db; }
        .items td { padding: 6px 6px; border-bottom: 1px solid #f1f5f9; }
        .items .num { text-align: right; white-space: nowrap; }
        .sum td { padding: 3px 6px; }
        .sum .total td { border-top: 2px solid #111827; font-weight: bold; font-size: 11.5pt; padding-top: 6px; }
        .green { color: #047857; }
        .void { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: bold; color: rgba(220, 38, 38, 0.25); transform: rotate(-24deg); }
        .void-banner { border: 2px solid #dc2626; color: #dc2626; font-weight: bold; text-align: center; padding: 6px; margin-top: 10px; }
        .footer { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8pt; color: #6b7280; text-align: center; }
    </style>
</head>
<body>
@if($doc['is_void'])
    <div class="void">VOID — order cancelled</div>
@endif

<table class="head">
    <tr>
        <td style="width: 62%;">
            @if($logo)
                <img src="{{ $logo }}" alt="" style="height: 44px; margin-bottom: 4px;">
            @endif
            <p class="seller-name">{{ $doc['seller']['name'] }}</p>
            @if($doc['vat_status'] === 'vat' && $doc['seller']['tin'])
                <div>VAT Reg. TIN: {{ $doc['seller']['tin'] }}</div>
            @elseif($doc['vat_status'] === 'non_vat' && $doc['seller']['tin'])
                <div>NON-VAT Reg. TIN: {{ $doc['seller']['tin'] }}</div>
            @endif
            @if($doc['seller']['address'])<div class="muted">{{ $doc['seller']['address'] }}</div>@endif
            @if($doc['seller']['phone'] || $doc['seller']['email'])
                <div class="muted">{{ implode(' · ', array_filter([$doc['seller']['phone'], $doc['seller']['email']])) }}</div>
            @endif
        </td>
        <td class="right">
            <p class="title">INVOICE</p>
            <div style="font-size: 11pt; font-weight: bold;">No. {{ $doc['number'] }}</div>
            <div class="muted">Date issued: {{ $doc['issued_at'] }}</div>
            @if($doc['order'])<div class="muted">Order: {{ $doc['order']['number'] }}</div>@endif
        </td>
    </tr>
</table>

@if($doc['is_void'])
    <div class="void-banner">VOID — order cancelled</div>
@endif

<div class="box">
    <div class="label">Sold to</div>
    <div style="font-weight: bold;">{{ $doc['buyer']['name'] }}</div>
    @if($doc['buyer']['address'])<div>{{ $doc['buyer']['address'] }}</div>@endif
    @if($doc['buyer']['tin'])<div>TIN: {{ $doc['buyer']['tin'] }}</div>@endif
</div>

<table class="items">
    <thead>
        <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Amount</th>
        </tr>
    </thead>
    <tbody>
        @foreach($doc['items'] as $item)
            <tr>
                <td>{{ $item['description'] }}</td>
                <td class="num">{{ $item['qty'] }}</td>
                <td class="num">{{ $peso($item['unit_price']) }}</td>
                <td class="num">{{ $peso($item['amount']) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<table style="margin-top: 6px;">
    <tr>
        <td style="width: 50%; vertical-align: top; padding-right: 12px;">
            @if($doc['tax'])
                <table class="sum small" style="border: 1px solid #e5e7eb;">
                    <tr><td>VATable sales</td><td class="right">{{ $peso($doc['tax']['vatable_sales']) }}</td></tr>
                    <tr><td>VAT (12%)</td><td class="right">{{ $peso($doc['tax']['vat_amount']) }}</td></tr>
                    <tr><td>VAT-exempt sales</td><td class="right">{{ $peso($doc['tax']['vat_exempt']) }}</td></tr>
                    <tr><td>Zero-rated sales</td><td class="right">{{ $peso($doc['tax']['zero_rated']) }}</td></tr>
                </table>
            @elseif($doc['vat_status'] === 'non_vat')
                <div class="small muted" style="border: 1px solid #e5e7eb; padding: 6px;">NON-VAT — no VAT included.</div>
            @endif
        </td>
        <td style="width: 50%; vertical-align: top;">
            <table class="sum">
                <tr><td class="muted">Subtotal</td><td class="right">{{ $peso($b['subtotal']) }}</td></tr>
                <tr><td class="muted">Delivery fee</td><td class="right">{{ $b['delivery_fee'] > 0 ? $peso($b['delivery_fee']) : 'Free' }}</td></tr>
                @if($b['store_discount'] > 0)
                    <tr><td class="muted">Store discount</td><td class="right green">−{{ $peso($b['store_discount']) }}</td></tr>
                @endif
                @if($b['coupon_discount'] > 0)
                    <tr><td class="muted">Coupon{{ $b['coupon_code'] ? ' (' . $b['coupon_code'] . ')' : '' }}</td><td class="right green">−{{ $peso($b['coupon_discount']) }}</td></tr>
                @endif
                <tr class="total"><td>TOTAL AMOUNT DUE</td><td class="right">{{ $peso($b['grand_total']) }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<div class="box">
    <div class="label">Payment</div>
    @if($doc['is_void'])
        <div style="font-weight: bold; color: #dc2626;">VOID — order cancelled</div>
    @elseif($pay['status'] === 'paid')
        <div style="font-weight: bold;" class="green">Paid</div>
    @elseif($pay['status'] === 'partial')
        <div style="font-weight: bold;">Partially paid {{ $peso($pay['paid_amount']) }} (balance {{ $peso($pay['balance']) }})</div>
    @else
        <div style="font-weight: bold;">Unpaid</div>
    @endif
    @if($pay['method_label'])<div class="muted">Method: {{ $pay['method_label'] }}</div>@endif
    @if($pay['paid_at'])<div class="muted">Paid on: {{ $pay['paid_at'] }}</div>@endif
</div>

<div class="footer">
    System-generated invoice from LPG Platform. The store's BIR-registered invoice prevails until this system is registered with the BIR.<br>
    Thank you for choosing {{ $doc['store_name'] }}!
</div>
</body>
</html>
