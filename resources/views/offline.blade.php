<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
    <meta name="theme-color" content="#2563eb">
    <title>Offline — LPG Cavite</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1e293b;
            color: white;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            padding: 24px;
            text-align: center;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #2563eb;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon svg { width: 48px; height: 48px; }
        h1 { font-size: 24px; font-weight: 700; }
        p { color: #94a3b8; font-size: 15px; max-width: 300px; line-height: 1.5; }
        button {
            margin-top: 8px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 12px;
            padding: 12px 28px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover { background: #1d4ed8; }
        .wifi-off {
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
            <path d="M16 6C16 6 10 11 10 17C10 20.3137 12.6863 23 16 23C19.3137 23 22 20.3137 22 17C22 14 20 12 20 12C20 12 20 15 18 16C18 16 19 13 16 6Z" fill="white"/>
            <path d="M16 18C16 18 13 16.5 13 19C13 20.6569 14.3431 22 16 22C17.6569 22 19 20.6569 19 19C19 16.5 16 18 16 18Z" fill="#93C5FD"/>
        </svg>
    </div>

    <h1>You're offline</h1>
    <p>Please check your internet connection and try again.</p>

    <button onclick="window.location.reload()">Try Again</button>
</body>
</html>
