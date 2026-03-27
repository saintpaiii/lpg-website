<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Http\Responses\LoginResponse;
use App\Http\Responses\RegisteredUserResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(LoginResponseContract::class, LoginResponse::class);
        $this->app->singleton(RegisterResponseContract::class, RegisteredUserResponse::class);

        // Use our extended rate limiter (3-minute lockout instead of 1-minute)
        $this->app->singleton(
            \Laravel\Fortify\LoginRateLimiter::class,
            \App\Services\LoginRateLimiter::class,
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(function (Request $request) {
            $lockedUntil        = $request->session()->get('login.locked_until', 0);
            $retryAfterSeconds  = max(0, $lockedUntil - now()->timestamp);
            $remainingAttempts  = $retryAfterSeconds > 0
                ? 0
                : $request->session()->get('login.remaining');

            return Inertia::render('auth/login', [
                'canResetPassword'  => Features::enabled(Features::resetPasswords()),
                'canRegister'       => Features::enabled(Features::registration()),
                'status'            => $request->session()->get('status'),
                'retryAfter'        => $retryAfterSeconds,
                'remainingAttempts' => $remainingAttempts,
            ]);
        });

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        // Redirect the old email-link verification notice to our OTP page
        Fortify::verifyEmailView(fn () => redirect()->route('otp.show'));

        Fortify::registerView(fn () => Inertia::render('auth/register'));

        Fortify::twoFactorChallengeView(fn () => Inertia::render('auth/two-factor-challenge'));

        Fortify::confirmPasswordView(fn () => Inertia::render('auth/confirm-password'));
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        // Used by Fortify's throttle:login middleware on POST /login
        RateLimiter::for('login', function (Request $request) {
            $throttleKey = \Illuminate\Support\Str::transliterate(
                \Illuminate\Support\Str::lower($request->input(\Laravel\Fortify\Fortify::username())) . '|' . $request->ip()
            );
            return Limit::perMinutes(3, 5)->by($throttleKey);
        });

        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });
    }
}
