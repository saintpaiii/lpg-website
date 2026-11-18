<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Return slip {{ $ret->return_number }}</title>
    <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { font-family: 'DejaVu Sans', sans-serif; }
        body { font-size: 10pt; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        .muted { color: #6b7280; }
        .head td { vertical-align: top; }
        .seller-name { font-size: 15pt; font-weight: bold; margin: 0 0 2px; }
        .title { font-size: 18pt; font-weight: bold; letter-spacing: 1px; color: #b91c1c; margin: 0; text-align: right; }
        .right { text-align: right; }
        .box { border: 1px solid #e5e7eb; padding: 8px 10px; margin-top: 12px; }
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
            <p class="seller-name">{{ $store?->registered_name ?: $store?->store_name }}</p>
            <div class="muted">{{ collect([$store?->address, $store?->barangay, $store?->city])->filter()->implode(', ') }}</div>
            @if($store?->phone)<div class="muted">{{ $store->phone }}</div>@endif
        </td>
        <td class="right">
            <p class="title">RETURN SLIP</p>
            <div><strong>{{ $ret->return_number }}</strong></div>
            <div class="muted">Date: {{ $ret->created_at->timezone('Asia/Manila')->format('M j, Y') }}</div>
        </td>
    </tr>
</table>

<div class="box">
    <div class="label">Returned to</div>
    <strong>{{ $ret->supplier?->name }}</strong>
    <div class="muted">{{ collect([$ret->supplier?->contact_person, $ret->supplier?->phone, $ret->supplier?->email])->filter()->implode(' · ') }}</div>
</div>

<table class="items">
    <tr><th>Cylinder</th><th>Batch</th><th>Reason</th><th class="num">Qty</th></tr>
    @foreach($ret->incidents as $i)
        <tr>
            <td>{{ $i->product?->name }}{{ $i->was_empty ? ' (empty)' : '' }}</td>
            <td>{{ $i->batch?->batch_code ?? '—' }}@if($i->batch?->requalification_due_on) <span class="muted">· requal. {{ $i->batch->requalification_due_on->format('M j, Y') }}</span>@endif</td>
            <td>{{ \App\Models\CylinderIncident::REASONS[$i->reason] ?? $i->reason }}@if($i->note) <span class="muted">— {{ $i->note }}</span>@endif</td>
            <td class="num">{{ $i->quantity }}</td>
        </tr>
    @endforeach
    <tr><td colspan="3" class="num"><strong>Total cylinders</strong></td><td class="num"><strong>{{ $ret->incidents->sum('quantity') }}</strong></td></tr>
</table>

@if($ret->notes)<div class="box"><div class="label">Notes</div>{{ $ret->notes }}</div>@endif

<table class="sign">
    <tr>
        <td><div class="line">Released by ({{ $store?->store_name }})</div></td>
        <td><div class="line">Received by ({{ $ret->supplier?->name }})</div></td>
    </tr>
</table>
</body>
</html>
