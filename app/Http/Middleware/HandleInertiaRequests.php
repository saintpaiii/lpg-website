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
    /** Store columns the layout needs (sidebar, suspension banners). */
    private const STORE_COLUMNS = [
        'id', 'store_name', 'status', 'commission_suspended', 'documents_suspended',
        'business_permit_expires_at', 'fsic_permit_expires_at', 'doe_lpg_license_expires_at', 'lto_permit_expires_at',
        'latitude', 'longitude',
    ];

    public function share(Request $request): array
    {
        $user = $request->user();

        // Resolve seller store for sidebar/layout context
        $store = null;
        if ($user && ($user->role === 'seller' || $user->role === 'seller_staff')) {
            $store = $request->attributes->get('seller_store')
                ?? ($user->role === 'seller'
                    ? Store::where('user_id', $user->id)->select(self::STORE_COLUMNS)->first()
                    : ($user->store_id ? Store::find($user->store_id, self::STORE_COLUMNS) : null));
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
                'store'              => $store ? [
                    'id'                   => $store->id,
                    'store_name'           => $store->store_name,
                    'status'               => $store->status,
                    'commission_suspended' => (bool) $store->commission_suspended,
                    // Amount needed to lift a commission suspension (only computed when suspended)
                    'commission_owed'      => $store->commission_suspended
                        ? \App\Services\CommissionBillingService::outstandingFor($store->id)
                        : 0,
                    // Permit problems for the seller banner (from the store row only)
                    'documents_suspended'  => (bool) $store->documents_suspended,
                    'documents_alert'      => \App\Support\StoreDocuments::alertFor($store),
                    // Stores without a pin: delivery fees fall back to the flat fee and staff cannot clock in
                    'has_location'         => $store->latitude !== null && $store->longitude !== null,
                ] : null,
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
            'unreadMessages'      => fn () => $user ? \App\Services\ChatService::unreadCountFor($user) : 0,
            // Report categories (config/reports.php) and sidebar badges — lazy, only computed when used
            'reportCategories'    => fn () => $user ? config('reports.categories') : [],
            'systemReportCategories' => fn () => $user ? config('reports.system_categories') : [],
            'systemReportAreas'      => fn () => $user ? config('reports.system_areas') : [],
            'reportBadges'        => fn () => \App\Services\ReportService::badgesFor($user),
            // Riders only: may they make deliveries (approved, unexpired driver's license)?
            'rider_license'       => fn () => $user && $user->isRider() ? [
                'can_deliver' => \App\Services\StaffDocumentService::canDeliver($user),
                'message'     => \App\Services\StaffDocumentService::message($user),
            ] : null,
            // Terms / Privacy Policy versions this user still has to accept (major updates, Google sign-ups)
            'pendingLegal'        => function () use ($user) {
                $pending = \App\Services\LegalService::pendingFor($user);
                return $pending ? [
                    'has_any_acceptance' => $pending['has_any_acceptance'],
                    'documents'          => array_map(fn ($d) => [
                        'id'             => $d->id,
                        'type'           => $d->type,
                        'label'          => $d->label(),
                        'title'          => $d->title,
                        'version'        => $d->version,
                        'change_summary' => $d->change_summary,
                        'url'            => $d->publicPath(),
                    ], $pending['documents']),
                ] : null;
            },
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
