<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Purchase order {{ $po->po_number }}</title></head>
<body style="font-family: Arial, sans-serif; color: #111827; font-size: 14px;">
    <p>Hello {{ $po->supplier?->contact_person ?: $po->supplier?->name }},</p>
    <p>Please find attached our purchase order <strong>{{ $po->po_number }}</strong>
        ({{ $po->items->count() }} item{{ $po->items->count() === 1 ? '' : 's' }}, ₱{{ number_format((float) $po->subtotal, 2) }}).
        @if($po->expected_on) We expect delivery on <strong>{{ $po->expected_on->format('M j, Y') }}</strong>. @endif
    </p>
    <table cellpadding="6" style="border-collapse: collapse; border: 1px solid #e5e7eb;">
        <tr style="background: #f3f4f6;"><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit cost</th></tr>
        @foreach($po->items as $item)
            <tr><td>{{ $item->product?->name }}</td><td align="right">{{ $item->quantity_ordered }}</td><td align="right">₱{{ number_format((float) $item->unit_cost, 2) }}</td></tr>
        @endforeach
    </table>
    @if($po->notes)<p><em>{{ $po->notes }}</em></p>@endif
    <p>Thank you,<br>{{ $po->store?->store_name }}@if($po->store?->phone) · {{ $po->store->phone }}@endif</p>
</body>
</html>
