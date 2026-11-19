<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Transfer slip {{ $transfer->transfer_number }}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { font-family: 'DejaVu Sans', sans-serif; }
        body { font-size: 10pt; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        .muted { color: #6b7280; }
        .head td { vertical-align: top; }
        .seller-name { font-size: 15pt; font-weight: bold; margin: 0 0 2px; }
        .title { font-size: 18pt; font-weight: bold; letter-spacing: 1px; color: #1d4ed8; margin: 0; text-align: right; }
        .right { text-align: right; }
        .box { border: 1px solid #e5e7eb; padding: 8px 10px; margin-top: 12px; }
        .two td { width: 50%; vertical-align: top; }
        .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 2px; }
        .items { margin-top: 14px; }
        .items th { background: #f3f4f6; font-size: 8.5pt; text-align: left; padding: 6px; border-bottom: 1px solid #d1d5db; }
        .items td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
        .num { text-align: right; white-space: nowrap; }
        .sign td { padding-top: 40px; width: 50%; }
        .line { border-top: 1px solid #111827; padding-top: 4px; font-size: 8.5pt; color: #6b7280; }
    </style>
</head>
<body>
<table class="head">
    <tr>
        <td style="width: 60%;">
            @if($logo)<img src="{{ $logo }}" style="height: 46px; margin-bottom: 4px;" alt="">@endif
            <p class="seller-name">{{ $from?->registered_name ?: $from?->store_name }}</p>
            <div class="muted">{{ collect([$from?->address, $from?->barangay, $from?->city])->filter()->implode(', ') }}</div>
            @if($from?->phone)<div class="muted">{{ $from->phone }}</div>@endif
        </td>
        <td class="right">
            <p class="title">STOCK TRANSFER</p>
            <div><strong>{{ $transfer->transfer_number }}</strong></div>
            <div class="muted">Sent: {{ $transfer->sent_at?->timezone('Asia/Manila')->format('M j, Y g:i A') }}</div>
            <div class="muted">Status: {{ \App\Models\StockTransfer::STATUS_LABELS[$transfer->status] ?? $transfer->status }}</div>
        </td>
    </tr>
</table>

<table class="two" style="margin-top: 12px;">
    <tr>
        <td style="padding-right: 6px;"><div class="box"><div class="label">From</div><strong>{{ $from?->store_name }}</strong>
            <div class="muted">{{ collect([$from?->address, $from?->barangay, $from?->city])->filter()->implode(', ') }}</div></div></td>
        <td style="padding-left: 6px;"><div class="box"><div class="label">To</div><strong>{{ $to?->store_name }}</strong>
            <div class="muted">{{ collect([$to?->address, $to?->barangay, $to?->city])->filter()->implode(', ') }}</div></div></td>
    </tr>
</table>

<table class="items">
    <tr><th>Product (sending store)</th><th>Product (receiving store)</th><th class="num">Sent</th><th class="num">Received</th></tr>
    @foreach($rows as $r)
        <tr>
            <td>{{ $r['from'] }}</td>
            <td>{{ $r['to'] }}</td>
            <td class="num">{{ $r['qty'] }}</td>
            <td class="num">{{ $r['received'] ?? '____' }}</td>
        </tr>
    @endforeach
    <tr><td colspan="2" class="num"><strong>Total</strong></td><td class="num"><strong>{{ collect($rows)->sum('qty') }}</strong></td>
        <td class="num"><strong>{{ $transfer->status === 'received' ? collect($rows)->sum('received') : '' }}</strong></td></tr>
</table>

@if($transfer->notes)<div class="box"><div class="label">Notes</div>{{ $transfer->notes }}</div>@endif

<table class="sign">
    <tr>
        <td><div class="line">Released by ({{ $from?->store_name }}){{ $transfer->sender ? ' — ' . $transfer->sender->name : '' }}</div></td>
        <td><div class="line">Received by ({{ $to?->store_name }}){{ $transfer->receiver ? ' — ' . $transfer->receiver->name : '' }}</div></td>
    </tr>
</table>
</body>
</html>
