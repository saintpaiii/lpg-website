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
    // Live updates: /broadcasting/auth uses the normal web session (Inertia) and requires login
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['middleware' => ['web', 'auth']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            HandleAppearance::class,
            // Staff paused by the plan's staff limit can't use any page
            \App\Http\Middleware\LogoutPausedStaff::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            // Last visit per sidebar section (badges + "New"/"Updated" row highlights)
            \App\Http\Middleware\TrackSectionVisit::class,
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
            'id.verified'      => \App\Http\Middleware\EnsureIdVerified::class,
            'plan.feature'     => \App\Http\Middleware\RequirePlanFeature::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Upload bigger than post_max_size: thrown before the session starts, so answer with a plain 413 message
        $exceptions->render(fn (\Illuminate\Http\Exceptions\PostTooLargeException $e) => response()->json(
            ['message' => 'The files are too large to upload at once. Try a shorter video or fewer photos.'],
            413,
        ));

        $exceptions->respond(function (\Symfony\Component\HttpFoundation\Response $response) {
            $status = $response->getStatusCode();
            $inertiaPages = [403 => 'errors/403', 404 => 'errors/404'];
            // Crashes: locally (debug) Laravel's real error page stays; in production a "Something went wrong" page —
            // never "Page Not Found" for a crash
            if (! config('app.debug')) {
                $inertiaPages += [500 => 'errors/500', 503 => 'errors/500'];
            }

            if (isset($inertiaPages[$status]) && !request()->expectsJson()) {
                return Inertia::render($inertiaPages[$status], ['status' => $status])
                    ->toResponse(request())
                    ->setStatusCode($status);
            }

            return $response;
        });
    })->create();
