<?php

namespace App\Http\Middleware;

use App\Models\CartItem;
use App\Models\Notification;
use App\Models\Store;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        // Resolve seller store for sidebar/layout context
        $store = null;
        if ($user && ($user->role === 'seller' || $user->role === 'seller_staff')) {
            $store = $request->attributes->get('seller_store')
                ?? ($user->role === 'seller'
                    ? Store::where('user_id', $user->id)->select('id', 'store_name', 'status')->first()
                    : ($user->store_id ? Store::find($user->store_id, ['id', 'store_name', 'status']) : null));
        }

        // Pending/rejected seller application — shown in customer portal for non-sellers
        $sellerApplication = null;
        if ($user && $user->role === 'customer') {
            $app = \App\Models\VerificationRequest::where('user_id', $user->id)
                ->where('type', 'seller_application')
                ->latest()
                ->first();
            if ($app) {
                $sellerApplication = [
                    'status'           => $app->status,
                    'rejection_reason' => $app->rejection_reason,
                ];
            }
        }

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user'               => $user,
                'permissions'        => $user ? $user->getPermissions() : [],
                'store'              => $store ? ['id' => $store->id, 'store_name' => $store->store_name, 'status' => $store->status] : null,
                'seller_application' => $sellerApplication,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'flash' => [
                'success'              => fn () => $request->session()->get('success'),
                'error'                => fn () => $request->session()->get('error'),
'deactivation_info'    => fn () => $request->session()->get('deactivation_info'),
                'store_suspension_info'=> fn () => $request->session()->get('store_suspension_info'),
            ],
            // Sellers can also use the customer portal (they can shop too)
            'cart_count' => $user && in_array($user->role, ['customer', 'seller'])
                ? CartItem::where('user_id', $user->id)->count()
                : 0,
            'unreadNotifications' => fn () => $user ? NotificationService::getUnreadCount($user->id) : 0,
            'recentNotifications' => fn () => $user
                ? Notification::where('user_id', $user->id)
                    ->whereNull('read_at')
                    ->latest()
                    ->limit(5)
                    ->get()
                    ->map(fn ($n) => [
                        'id'         => $n->id,
                        'type'       => $n->type,
                        'title'      => $n->title,
                        'message'    => $n->message,
                        'data'       => $n->data,
                        'created_at' => $n->created_at->diffForHumans(),
                    ])->values()->toArray()
                : [],
        ];
    }
}
