<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice {{ $number }}</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .header { background: #2563eb; padding: 28px 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px; }
        .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 32px; }
        .heading { font-size: 17px; color: #1e293b; font-weight: 700; margin: 0 0 16px; }
        .message { font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 12px; }
        .facts { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 14px; }
        .facts td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; color: #4b5563; }
        .facts td.v { text-align: right; color: #111827; font-weight: 600; }
        .button { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 6px; margin-top: 4px; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h1>{{ $storeName }}</h1>
            <p>{{ $kind === 'paid' ? 'Payment received' : 'Your invoice' }}</p>
        </div>
        <div class="body">
            <p class="heading">Hi{{ $customer ? ' ' . $customer : '' }},</p>
            @if($kind === 'paid')
                <p class="message">Thank you! Your order is fully paid. Your invoice <strong>{{ $number }}</strong> from {{ $storeName }} is attached as a PDF.</p>
            @else
                <p class="message">{{ $storeName }} confirmed your order. Your invoice <strong>{{ $number }}</strong> is attached as a PDF.</p>
            @endif
            <table class="facts">
                @if($orderNumber)
                    <tr><td>Order</td><td class="v">{{ $orderNumber }}</td></tr>
                @endif
                <tr><td>Invoice</td><td class="v">{{ $number }}</td></tr>
                <tr><td>Total</td><td class="v">₱{{ number_format($total, 2) }}</td></tr>
                <tr><td>Status</td><td class="v">{{ ['paid' => 'Paid', 'partial' => 'Partially paid', 'unpaid' => 'Unpaid'][$status] ?? ucfirst($status) }}</td></tr>
            </table>
            @if($url)
                <a href="{{ $url }}" class="button">View invoice</a>
            @endif
        </div>
        <div class="footer">
            Invoice issued by {{ $storeName }} through LPG Platform.
        </div>
    </div>
</body>
</html>
