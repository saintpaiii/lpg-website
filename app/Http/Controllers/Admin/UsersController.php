<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountAction;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UsersController extends Controller
{
    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $filter = $request->input('filter', 'all');
        $search = $request->input('search', '');

        // Show only buyer/seller accounts — exclude admins and platform staff
        $query = User::withTrashed()
            ->with('ownedStore')
            ->where('is_admin', false)
            ->where('is_platform_staff', false)
            ->whereNotIn('role', ['admin', 'platform_admin', 'manager', 'cashier', 'warehouse', 'rider'])
            ->orderByDesc('created_at');

        match ($filter) {
            'buyers'  => $query->where('role', 'customer'),
            'sellers' => $query->whereIn('role', ['seller', 'seller_staff']),
            default   => null,
        };

        if ($search !== '') {
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
            );
        }

        $users = $query->paginate(25)->withQueryString();

        return Inertia::render('admin/users', [
            'users'  => $users,
            'filter' => $filter,
            'search' => $search,
        ]);
    }

    // ── Show ─────────────────────────────────────────────────────────────────

    public function show(int $id): Response
    {
        $user = User::withTrashed()->findOrFail($id);

        // Recent orders (buyers)
        $orders = [];
        if ($user->role === 'customer') {
            $customer = Customer::where('user_id', $user->id)->first();
            if ($customer) {
                $orders = Order::where('customer_id', $customer->id)
                    ->latest()
                    ->take(10)
                    ->get()
                    ->map(fn ($o) => [
                        'id'           => $o->id,
                        'order_number' => $o->order_number,
                        'status'       => $o->status,
                        'total_amount' => (float) $o->total_amount,
                        'created_at'   => $o->created_at->format('M d, Y'),
                    ])
                    ->values()
                    ->toArray();
            }
        }

        // Order count for buyers
        $orderCount = 0;
        if ($user->role === 'customer') {
            $customer = Customer::where('user_id', $user->id)->first();
            $orderCount = $customer ? Order::where('customer_id', $customer->id)->count() : 0;
        }

        // Owned store info (sellers)
        $store = $user->ownedStore ?? $user->store;

        return Inertia::render('admin/user-show', [
            'user' => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'phone'       => $user->phone,
                'role'        => $user->role,
                'sub_role'    => $user->sub_role,
                'is_active'   => (bool) $user->is_active,
                'id_verified' => (bool) $user->id_verified,
                'valid_id'    => $user->valid_id,
                'created_at'  => $user->created_at->format('M d, Y'),
                'deleted_at'  => $user->deleted_at?->format('M d, Y'),
                'order_count' => $orderCount,
            ],
            'store' => $store ? [
                'id'         => $store->id,
                'store_name' => $store->store_name,
                'status'     => $store->status,
                'city'       => $store->city,
            ] : null,
            'orders' => $orders,
        ]);
    }

    // ── Toggle Active ─────────────────────────────────────────────────────────

    public function toggleActive(Request $request, User $user): RedirectResponse
    {
        if ($user->is_active) {
            $request->validate([
                'reason' => ['required', 'string', 'max:255'],
                'notes'  => ['nullable', 'string', 'max:1000'],
            ]);

            $user->update([
                'is_active'           => false,
                'deactivation_reason' => $request->reason,
                'deactivation_notes'  => $request->notes,
                'deactivated_at'      => now(),
                'deactivated_by'      => $request->user()->id,
            ]);

            AccountAction::create([
                'target_type'  => 'user',
                'target_id'    => $user->id,
                'action'       => 'deactivate',
                'reason'       => $request->reason,
                'notes'        => $request->notes,
                'performed_by' => $request->user()->id,
            ]);

            return redirect()->route('admin.users.show', $user->id)
                ->with('success', "{$user->name} has been deactivated.");
        }

        $user->update([
            'is_active'           => true,
            'deactivation_reason' => null,
            'deactivation_notes'  => null,
            'deactivated_at'      => null,
            'deactivated_by'      => null,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'activate',
            'performed_by' => $request->user()->id,
        ]);

        return redirect()->route('admin.users.show', $user->id)
            ->with('success', "{$user->name} has been activated.");
    }

    // ── Soft Delete / Restore ─────────────────────────────────────────────────

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'notes'  => ['nullable', 'string', 'max:1000'],
        ]);

        $user->update([
            'is_active'           => false,
            'deactivation_reason' => $request->reason,
            'deactivation_notes'  => $request->notes,
            'deactivated_at'      => now(),
            'deactivated_by'      => $request->user()->id,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'archive',
            'reason'       => $request->reason,
            'notes'        => $request->notes,
            'performed_by' => $request->user()->id,
        ]);

        $user->delete();
        return redirect()->route('admin.users')->with('success', "{$user->name} has been archived.");
    }

    public function restore(Request $request, User $user): RedirectResponse
    {
        $user->restore();
        $user->update([
            'is_active'           => true,
            'deactivation_reason' => null,
            'deactivation_notes'  => null,
            'deactivated_at'      => null,
            'deactivated_by'      => null,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'restore',
            'performed_by' => $request->user()->id,
        ]);

        return redirect()->route('admin.users.show', $user->id)->with('success', "{$user->name} has been restored.");
    }
}
