<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your LPG Platform Staff Account Has Been Created</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .header { background: #2563eb; padding: 28px 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px; }
        .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 32px; }
        .greeting { font-size: 15px; color: #374151; margin-bottom: 16px; }
        .message { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 24px; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; }
        .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #64748b; font-weight: 600; min-width: 140px; }
        .detail-value { color: #1e293b; text-align: right; }
        .password-box { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
        .password-label { font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .password-value { font-size: 24px; font-weight: 800; color: #713f12; font-family: 'Courier New', monospace; letter-spacing: 2px; }
        .notice { font-size: 13px; color: #dc2626; font-weight: 600; margin-top: 8px; }
        .warning { font-size: 13px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px; margin-top: 8px; line-height: 1.5; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h1>🔥 LPG Management</h1>
            <p>Staff Account Created</p>
        </div>
        <div class="body">
            <p class="greeting">Hello, {{ $user->name }}!</p>
            <p class="message">
                A staff account has been created for you on the <strong>{{ $storeName }}</strong> store.
                Below are your account details. Please log in and change your password immediately.
            </p>

            <div class="details-box">
                <div class="detail-row">
                    <span class="detail-label">Name</span>
                    <span class="detail-value">{{ $user->name }}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email</span>
                    <span class="detail-value">{{ $user->email }}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Role</span>
                    <span class="detail-value">{{ ucfirst($user->sub_role ?? 'Staff') }}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Store</span>
                    <span class="detail-value">{{ $storeName }}</span>
                </div>
                @if($user->schedule_start && $user->schedule_end)
                <div class="detail-row">
                    <span class="detail-label">Work Schedule</span>
                    <span class="detail-value">
                        {{ \Carbon\Carbon::parse($user->schedule_start)->format('g:i A') }}
                        –
                        {{ \Carbon\Carbon::parse($user->schedule_end)->format('g:i A') }}
                    </span>
                </div>
                @endif
            </div>

            <div class="password-box">
                <div class="password-label">Temporary Password</div>
                <div class="password-value">{{ $tempPassword }}</div>
                <div class="notice">⚠ You will be required to change this password on first login.</div>
            </div>

            <p class="warning">
                If you did not expect this email, please contact your store manager immediately.
                Do not share your password with anyone.
            </p>
        </div>
        <div class="footer">
            &copy; {{ date('Y') }} LPG Management &mdash; Cavite
        </div>
    </div>
</body>
</html>
