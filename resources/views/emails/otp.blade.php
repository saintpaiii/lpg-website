<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your LPG Verification Code</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .header { background: #2563eb; padding: 28px 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px; }
        .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 32px; }
        .greeting { font-size: 15px; color: #374151; margin-bottom: 16px; }
        .message { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 28px; }
        .code-box { background: #f0f9ff; border: 2px dashed #93c5fd; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px; }
        .code { font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #1d4ed8; font-family: 'Courier New', monospace; }
        .expiry { font-size: 12px; color: #9ca3af; margin-top: 10px; }
        .warning { font-size: 13px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px; margin-top: 8px; line-height: 1.5; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h1>🔥 LPG Management</h1>
            <p>Email Verification</p>
        </div>
        <div class="body">
            <p class="greeting">Hello, {{ $user->name }}!</p>
            <p class="message">
                Use the 6-digit code below to verify your email address.
            </p>
            <div class="code-box">
                <div class="code">{{ $code }}</div>
                <p class="expiry">This code expires in <strong>10 minutes</strong>.</p>
            </div>
            <p class="warning">
                If you did not create an account, you can safely ignore this email.
                Do not share this code with anyone.
            </p>
        </div>
        <div class="footer">
            &copy; {{ date('Y') }} LPG Management &mdash; Cavite
        </div>
    </div>
</body>
</html>
