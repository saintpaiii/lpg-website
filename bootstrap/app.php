<?php

use App\Http\Middleware\EnsureIsAdmin;
use App\Http\Middleware\EnsureIsCustomer;
use App\Http\Middleware\EnsureIsRider;
use App\Http\Middleware\EnsureIsSeller;
use App\Http\Middleware\EnsureIsSellerOwner;
use App\Http\Middleware\EnsurePasswordChanged;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RedirectIfAuthenticated;
use App\Http\Middleware\RequirePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Inertia\Inertia;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'admin'      => EnsureIsAdmin::class,
            'rider'      => EnsureIsRider::class,
            'customer'   => EnsureIsCustomer::class,
            'seller'       => EnsureIsSeller::class,
            'seller_owner' => EnsureIsSellerOwner::class,
            'guest'            => RedirectIfAuthenticated::class,
            'permission'       => RequirePermission::class,
            'password.changed' => EnsurePasswordChanged::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(function (\Symfony\Component\HttpFoundation\Response $response) {
            $status = $response->getStatusCode();
            $inertiaPages = [403 => 'errors/403', 404 => 'errors/404', 500 => 'errors/404', 503 => 'errors/404'];

            if (isset($inertiaPages[$status]) && !request()->expectsJson()) {
                return Inertia::render($inertiaPages[$status])
                    ->toResponse(request())
                    ->setStatusCode($status);
            }

            return $response;
        });
    })->create();
