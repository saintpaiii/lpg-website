@php
    $peso = fn ($n) => '₱' . number_format((float) $n, 2);
    $s    = $doc['store'];
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Acknowledgement Receipt {{ $doc['number'] }}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { font-family: 'DejaVu Sans', sans-serif; }
        body { font-size: 10pt; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        .muted { color: #6b7280; }
        .head td { vertical-align: top; }
        .seller-name { font-size: 15pt; font-weight: bold; margin: 0 0 2px; }
        .title { font-size: 16pt; font-weight: bold; letter-spacing: 1.5px; color: #1e3a8a; margin: 0; text-align: right; }
        .right { text-align: right; }
        .box { border: 1px solid #e5e7eb; padding: 10px 12px; margin-top: 14px; }
        .statement { font-size: 11pt; line-height: 1.7; }
        .amount { font-size: 16pt; font-weight: bold; }
        .facts td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; }
        .facts td.k { color: #6b7280; width: 40%; }
        .green { color: #047857; }
        .warning { margin-top: 22px; border: 2px solid #111827; padding: 8px; text-align: center; font-weight: bold; font-size: 10.5pt; }
        .footer { margin-top: 12px; font-size: 8.5pt; color: #6b7280; text-align: center; }
    </style>
</head>
<body>

<table class="head">
    <tr>
        <td style="width: 58%;">
            @if($logo)
                <img src="{{ $logo }}" alt="" style="height: 44px; margin-bottom: 4px;">
            @endif
            <p class="seller-name">{{ $s['name'] }}</p>
            @if($s['vat_status'] === 'vat' && $s['tin'])
                <div>VAT Reg. TIN: {{ $s['tin'] }}</div>
            @elseif($s['vat_status'] === 'non_vat' && $s['tin'])
                <div>NON-VAT Reg. TIN: {{ $s['tin'] }}</div>
            @endif
            @if($s['address'])<div class="muted">{{ $s['address'] }}</div>@endif
            @if($s['phone'])<div class="muted">{{ $s['phone'] }}</div>@endif
        </td>
        <td class="right">
            <p class="title">ACKNOWLEDGEMENT<br>RECEIPT</p>
            <div style="font-size: 11pt; font-weight: bold; margin-top: 4px;">No. {{ $doc['number'] }}</div>
            <div class="muted">Received: {{ $doc['received_at'] }}</div>
        </td>
    </tr>
</table>

<div class="box">
    <div class="statement">
        Received from <strong>{{ $doc['customer'] }}</strong> the amount of
        <span class="amount">{{ $peso($doc['amount']) }}</span><br>
        <em>({{ $doc['amount_words'] }})</em>
    </div>
    <div class="statement" style="margin-top: 6px;">
        as payment for Order <strong>{{ $doc['order_number'] ?? '—' }}</strong>@if($doc['invoice']), Invoice <strong>{{ $doc['invoice'] }}</strong>@endif.
    </div>
    @unless($doc['invoice'])
        <div class="muted" style="margin-top: 4px;">The invoice follows when the store confirms your order.</div>
    @endunless
</div>

<table class="facts" style="margin-top: 14px;">
    <tr><td class="k">Payment method</td><td>{{ $doc['method_label'] }}</td></tr>
    @if($doc['reference'])
        <tr><td class="k">Reference</td><td>{{ $doc['reference'] }}</td></tr>
    @endif
    <tr><td class="k">Payment</td><td>{{ $doc['kind_label'] }}</td></tr>
    <tr>
        <td class="k">Balance after this payment</td>
        <td>@if($doc['balance'] > 0){{ $peso($doc['balance']) }}@else<strong class="green">Fully paid</strong>@endif</td>
    </tr>
</table>

<div class="warning">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</div>
<div class="footer">
    System-generated acknowledgement receipt from LPG Platform.<br>
    <strong>Thank you, {{ $doc['store_name'] }}!</strong>
</div>
</body>
</html>
