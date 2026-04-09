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
            #splash-screen {
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: #2563eb;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                z-index: 9999;
                transition: opacity 0.3s ease;
            }
            #splash-screen.fade-out { opacity: 0; pointer-events: none; }
            #splash-screen svg { width: 80px; height: 80px; margin-bottom: 16px; }
            #splash-screen p { color: white; font-family: sans-serif; font-size: 20px; font-weight: 600; margin: 0; }
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
        {{-- Splash screen — shows immediately on load, hides once React is ready --}}
        <div id="splash-screen">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="45" fill="white" opacity="0.2"/>
                <path d="M50 20 C50 20 30 45 30 60 C30 72 39 80 50 80 C61 80 70 72 70 60 C70 45 50 20 50 20Z" fill="white"/>
            </svg>
            <p>LPG Marketplace Cavite</p>
        </div>

        @inertia

        {{-- Service Worker registration + splash hide --}}
        <script>
            // Hide splash after DOM is ready (500ms gives React time to paint)
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(function() {
                    var splash = document.getElementById('splash-screen');
                    if (splash) {
                        splash.classList.add('fade-out');
                        setTimeout(function() { if (splash.parentNode) splash.remove(); }, 300);
                    }
                }, 500);
            });
            // Also hide on Inertia navigation (subsequent page loads)
            document.addEventListener('inertia:finish', function() {
                var splash = document.getElementById('splash-screen');
                if (splash) { splash.classList.add('fade-out'); setTimeout(function() { if (splash.parentNode) splash.remove(); }, 300); }
            });

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
