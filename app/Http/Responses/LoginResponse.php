<?php

namespace App\Http\Responses;

use App\Models\Attendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

class LoginResponse implements LoginResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        $user = $request->user();

        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

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
}
