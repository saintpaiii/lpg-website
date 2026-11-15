<?php

namespace App\Http\Middleware;

use App\Services\RiderLoadService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Store staff (role seller_staff — riders, cashiers, warehouse, HR, custom roles) must be clocked in before they can work.
 * "Clocked in" = an OPEN shift: clocked in, not out, dated today or yesterday (RiderLoadService::openAttendance — a shift
 * may pass midnight). Store owners, platform admins / staff and customers are never stopped here.
 *
 * Not clocked in → redirect to their My Attendance page ("Clock in first to start working."); API / plain JSON → 403.
 * Runs after 'password.changed', so a new staff member first changes the password, then (riders) uploads the license,
 * then clocks in.
 */
class EnsureClockedIn
{
    public const MESSAGE = 'Clock in first to start working.';

    /**
     * Route names that work WITHOUT clocking in (no redirect loops). Everything outside the seller / rider / API delivery
     * groups (settings, profile, two-factor, logout, Terms / Policies, notifications) never runs this middleware.
     */
    public const ALLOWED_ROUTES = [
        // My Attendance page + clock in / out (+ the rider's vehicle for the shift)
        'seller.my-attendance', 'seller.my-attendance.clock-in', 'seller.my-attendance.clock-out',
        'rider.my-attendance', 'rider.my-attendance.clock-in', 'rider.my-attendance.clock-out', 'rider.my-attendance.vehicle',
        // My Documents (riders: driver's license before the first delivery)
        'rider.documents', 'rider.documents.store',
        'seller.my-documents', 'seller.my-documents.store',
        // "Report a website problem" (and following up on it)
        'rider.reports.website-problem',
        'seller.website-reports', 'seller.website-reports.store', 'seller.website-reports.show',
        'seller.website-reports.reply', 'seller.website-reports.confirm', 'seller.website-reports.not-solved',
        // Header unread-message counter (polled on every page; read-only)
        'seller.messages.unread', 'rider.messages.unread',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->role !== 'seller_staff' || $request->routeIs(...self::ALLOWED_ROUTES)) {
            return $next($request);
        }

        if (RiderLoadService::openAttendance($user)) {
            return $next($request);
        }

        // Mobile API (Sanctum) and plain JSON / XHR calls: 403 JSON. Inertia visits are redirected.
        if ($request->is('api/*') || ($request->expectsJson() && ! $request->header('X-Inertia'))) {
            return response()->json(['message' => self::MESSAGE], 403);
        }

        $target = $user->isRider() ? route('rider.my-attendance') : route('seller.my-attendance');

        return redirect($target)->with('error', self::MESSAGE);
    }
}
