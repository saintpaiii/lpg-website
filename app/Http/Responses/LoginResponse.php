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

        $redirect = match (true) {
            // Platform staff — redirect to first permitted page or welcome if none
            $user->role === 'platform_staff'
                => $user->platformStaffHomeUrl(),

            // New multi-vendor roles
            in_array($user->role, ['platform_admin', 'admin', 'manager'])
                => route('admin.dashboard'),

            $user->role === 'seller'
                => route('seller.dashboard'),

            $user->role === 'seller_staff' && $user->sub_role === 'rider'
                => route('rider.deliveries'),

            $user->role === 'seller_staff' && $user->sub_role === 'warehouse'
                => route('seller.inventory'),

            $user->role === 'seller_staff'   // cashier or unset sub_role
                => route('seller.invoices'),

            // Legacy single-distributor staff roles (backward compat)
            $user->role === 'cashier'
                => route('admin.invoices'),

            $user->role === 'warehouse'
                => route('admin.inventory'),

            $user->role === 'rider'
                => route('rider.deliveries'),

            $user->role === 'customer'
                => route('customer.products'),

            default => route('home'),
        };

        // ── Attendance reminder redirect ────────────────────────────────────────
        // Non-HR seller_staff who haven't clocked in today are sent to My Attendance.
        if (
            $user->role === 'seller_staff'
            && $user->sub_role !== 'hr'
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
