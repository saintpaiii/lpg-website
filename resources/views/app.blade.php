<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
        <meta name="theme-color" content="#2563eb">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="apple-mobile-web-app-title" content="LPG Cavite">
        <meta name="mobile-web-app-capable" content="yes">
        <link rel="manifest" href="/manifest.json">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.145 0 0);
            }

            /* Splash screen — fades out once React mounts */
            #splash {
                position: fixed; inset: 0; z-index: 9999;
                background: #2563eb;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 20px;
                transition: opacity 0.4s ease;
            }
            #splash.hidden { opacity: 0; pointer-events: none; }
            #splash svg { width: 80px; height: 80px; }
            #splash p { color: white; font-family: sans-serif; font-size: 18px; font-weight: 600; margin: 0; }
            #splash .spinner {
                width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.3);
                border-top-color: white; border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png">

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />

        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        {{-- Splash screen (hidden once React hydrates) --}}
        <div id="splash">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="white" fill-opacity="0.15"/>
                <path d="M16 6C16 6 10 11 10 17C10 20.3137 12.6863 23 16 23C19.3137 23 22 20.3137 22 17C22 14 20 12 20 12C20 12 20 15 18 16C18 16 19 13 16 6Z" fill="white"/>
                <path d="M16 18C16 18 13 16.5 13 19C13 20.6569 14.3431 22 16 22C17.6569 22 19 20.6569 19 19C19 16.5 16 18 16 18Z" fill="#93C5FD"/>
            </svg>
            <p>LPG Marketplace Cavite</p>
            <div class="spinner"></div>
        </div>

        @inertia

        {{-- Service Worker registration --}}
        <script>
            // Hide splash once page is ready
            document.addEventListener('inertia:finish', function() {
                var s = document.getElementById('splash');
                if (s) { s.classList.add('hidden'); setTimeout(function() { s.remove(); }, 500); }
            });
            // Fallback: hide after 3s even if Inertia event doesn't fire
            setTimeout(function() {
                var s = document.getElementById('splash');
                if (s) { s.classList.add('hidden'); setTimeout(function() { if(s.parentNode) s.remove(); }, 500); }
            }, 3000);

            // Register Service Worker
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js')
                        .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                        .catch(function(err) { console.log('[SW] Registration failed:', err); });
                });
            }
        </script>
    </body>
</html>
