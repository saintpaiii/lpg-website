<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $mailSubject }}</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .header { background: #2563eb; padding: 28px 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px; }
        .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 32px; }
        .heading { font-size: 17px; color: #1e293b; font-weight: 700; margin: 0 0 16px; }
        .message { font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 12px; }
        .button { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 6px; margin-top: 12px; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h1>🔥 LPG Marketplace</h1>
            <p>Your store plan</p>
        </div>
        <div class="body">
            <p class="heading">{{ $heading }}</p>
            @foreach($lines as $line)
                <p class="message">{{ $line }}</p>
            @endforeach
            @if($buttonText && $url)
                <a href="{{ $url }}" class="button">{{ $buttonText }}</a>
            @endif
        </div>
        <div class="footer">
            &copy; {{ date('Y') }} LPG Marketplace &mdash; Cavite
        </div>
    </div>
</body>
</html>
