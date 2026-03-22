<?php

namespace App\Http\Middleware;

use App\Models\Store;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureIsSeller
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()) {
            return redirect()->route('login');
        }

        $user = $request->user();

        if (! $user->is_active) {
            $reason = $user->deactivation_reason;
            $notes  = $user->deactivation_notes;
            auth()->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return redirect()->route('login')
                ->withErrors(['email' => 'Your account has been deactivated.'])
                ->with('deactivation_info', ['reason' => $reason, 'notes' => $notes]);
        }

        $isSeller      = $user->role === 'seller';
        $isSellerStaff = $user->role === 'seller_staff' && $user->sub_role !== 'rider';

        if (! $isSeller && ! $isSellerStaff) {
            return redirect()->route('login')->withErrors([
                'email' => 'You do not have access to this area.',
            ]);
        }

        // Resolve the store for this user
        if ($isSeller) {
            $store = Store::where('user_id', $user->id)->first();
        } else {
            $store = $user->store_id ? Store::find($user->store_id) : null;
        }

        // No store or not approved → redirect to pending page
        if (! $store || $store->status !== 'approved') {
            if ($store && $store->status === 'suspended') {
                $request->session()->flash('store_suspension_info', [
                    'reason' => $store->suspension_reason,
                    'notes'  => $store->suspension_notes,
                ]);
            }
            return redirect()->route('seller.pending');
        }

        // Inject store into request for controllers
        $request->attributes->set('seller_store', $store);

        return $next($request);
    }
}
