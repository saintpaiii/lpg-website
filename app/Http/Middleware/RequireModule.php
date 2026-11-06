<?php

namespace App\Http\Middleware;

use App\Services\StaffAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * module:{key} — store-portal access by module (config/staff_modules.php).
 *
 * The store owner passes. Store staff: GET / HEAD need View only or Full access; any other method needs Full
 * access — or, for routes listed under the module's 'actions', exactly that permission (so a per-person extra
 * permission like inventory.stock_in allows that one action).
 */
class RequireModule
{
    public function handle(Request $request, Closure $next, string $module): Response
    {
        $user = $request->user();
        if (! $user) {
            return redirect()->route('login');
        }
        if ($user->role === 'seller' || $user->isAdmin()) {
            return $next($request);
        }

        $def   = StaffAccess::modules()[$module] ?? null;
        $label = $def['label'] ?? ucfirst($module);
        $level = $user->role === 'seller_staff' ? StaffAccess::levelFor($user, $module) : null;
        // Riders keep their own chat and reports in the rider app — never the store's Messages / Customer Reports
        if ($user->sub_role === 'rider' && in_array($module, ['messages', 'customer_reports'], true)) {
            $level = null;
        }

        if ($request->isMethod('GET') || $request->isMethod('HEAD')) {
            if ($level) {
                return $next($request);
            }
            abort(403, "You don't have access to {$label}.");
        }

        $action  = $def['actions'][$request->route()?->getName()] ?? null;
        $allowed = $action ? StaffAccess::can($user, $action) : $level === 'full';
        if ($allowed) {
            return $next($request);
        }

        $message = $level ? "You have view-only access to {$label}." : "You don't have access to {$label}.";
        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => $message], 403);
        }

        return back()->with('error', $message);
    }
}
