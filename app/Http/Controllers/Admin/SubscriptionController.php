<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StoreSubscription;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SubscriptionController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'active');
        $search = $request->get('search', '');

        $query = StoreSubscription::with('store')
            ->when($search, fn ($q) => $q->whereHas('store', fn ($s) =>
                $s->where('store_name', 'like', "%{$search}%")
            ))
            ->latest();

        $items = match ($tab) {
            'expired'   => (clone $query)->where('status', 'expired'),
            'cancelled' => (clone $query)->where('status', 'cancelled'),
            default     => (clone $query)->where('status', 'active'),
        };

        $counts = [
            'active'    => StoreSubscription::where('status', 'active')->count(),
            'expired'   => StoreSubscription::where('status', 'expired')->count(),
            'cancelled' => StoreSubscription::where('status', 'cancelled')->count(),
        ];

        return Inertia::render('admin/subscriptions', [
            'subscriptions' => $items->paginate(25)->withQueryString()->through(fn ($s) => [
                'id'             => $s->id,
                'store_name'     => $s->store?->store_name ?? '—',
                'store_id'       => $s->store_id,
                'plan'           => $s->plan,
                'amount'         => (float) $s->amount,
                'payment_method' => $s->payment_method,
                'status'         => $s->status,
                'starts_at'      => $s->starts_at?->format('M d, Y'),
                'expires_at'     => $s->expires_at?->format('M d, Y'),
                'created_at'     => $s->created_at->format('M d, Y'),
            ]),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }
}
