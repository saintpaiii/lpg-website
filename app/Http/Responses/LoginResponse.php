<?php

namespace App\Http\Responses;

use App\Models\Attendance;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse as TwoFactorLoginResponseContract;

/** Also the response after the two-factor challenge (same home / intended rules). */
class LoginResponse implements LoginResponseContract, TwoFactorLoginResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        $user = $request->user();

        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

        // "intended" = the last protected page a GUEST opened in this browser (e.g. an admin page after a session
        // expired). Keep it only when it belongs to THIS user's portal — never land someone on another portal's page.
        self::dropForeignIntended($request, $user);

        // ONE home page per role (User::homeUrl); customers: Browse once verified, else ID verification
        $redirect = $user->role === 'customer'
            ? ($user->id_verification_status === 'verified' ? route('customer.products') : route('customer.id-verification'))
            : $user->homeUrl();

        // ── Attendance reminder redirect ────────────────────────────────────────
        // Non-HR seller_staff who haven't clocked in today are sent to My Attendance (not on their day off).
        if (
            $user->role === 'seller_staff'
            && ! \App\Services\StaffAccess::hasStarter($user, 'hr')
            && $user->worksOn(now())
            && ! Attendance::where('user_id', $user->id)
                ->where('date', now()->toDateString())
                ->whereNotNull('clock_in')
                ->exists()
        ) {
            $myAttendanceRoute = $user->sub_role === 'rider'
                ? route('rider.my-attendance')
                : route('seller.my-attendance');

            return redirect()->intended($myAttendanceRoute)
                ->with('success', 'Welcome back, ' . $user->name . '!')
                ->with('attendance_reminder', true);
        }

        return redirect()->intended($redirect)
            ->with('success', 'Welcome back, ' . $user->name . '!');
    }

    /** Forget the intended URL when the user may not open it (another portal). */
    private static function dropForeignIntended($request, User $user): void
    {
        $intended = $request->session()->get('url.intended');
        if (! $intended) {
            return;
        }
        if (! self::mayOpen($user, (string) (parse_url($intended, PHP_URL_PATH) ?? '/'))) {
            $request->session()->forget('url.intended');
        }
    }

    public static function mayOpen(User $user, string $path): bool
    {
        $path = '/' . ltrim($path, '/');
        $in   = fn (string $prefix) => $path === $prefix || str_starts_with($path, $prefix . '/');

        // Shared pages — fine for everyone
        foreach (['/notifications', '/settings', '/invoices'] as $shared) {
            if ($in($shared)) {
                return true;
            }
        }

        $isRider = $user->role === 'rider' || ($user->role === 'seller_staff' && $user->sub_role === 'rider');

        return match (true) {
            $in('/admin')    => $user->isAdmin() || $user->role === 'platform_staff',
            $in('/seller')   => in_array($user->role, ['seller', 'seller_staff'], true),
            $in('/rider')    => $isRider,
            // Store owners can switch to the customer portal
            $in('/customer') => in_array($user->role, ['customer', 'seller'], true),
            default          => false,
        };
    }
}
