<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\RefundRequest;
use App\Models\StaffDocument;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Models\User;
use App\Models\UserReport;
use App\Models\VerificationRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

/**
 * Sidebar badges work like notifications: per section, how many items were created or changed by someone
 * else since the user last opened that section (SectionVisitService). Opening the section clears it; things
 * that still need action are shown inside the page (summary cards), not here.
 *
 * Keys are "{portal}.{section}" (seller.orders, rider.deliveries, admin.verifications, customer.orders …).
 * Cached per user for 20 seconds; SectionVisitService::touch() and the model hooks in AppServiceProvider drop it.
 */
class SidebarBadgeService
{
    private const TTL = 20;

    /** Sections that count new rows only (stores edit their settings all the time) */
    public const NEW_ONLY = ['admin.stores'];

    /** @return array<string, int> */
    public static function for(?User $user): array
    {
        if (! $user) {
            return [];
        }

        return Cache::remember(static::key($user->id), self::TTL, fn () => array_filter(static::compute($user)));
    }

    public static function key(int $userId): string
    {
        return "sidebar-badges:{$userId}";
    }

    /** Drop the cached counts of these users (call after creating/resolving a counted item). */
    public static function forget(int|array|null ...$userIds): void
    {
        foreach (array_filter(array_merge(...array_map(fn ($v) => (array) $v, $userIds))) as $id) {
            Cache::forget(static::key((int) $id));
        }
    }

    /** Drop the cached counts of a store's owner and staff. */
    public static function forgetStore(?int $storeId): void
    {
        if (! $storeId) {
            return;
        }
        static::forget(
            Store::whereKey($storeId)->value('user_id'),
            User::where('store_id', $storeId)->pluck('id')->all(),
        );
    }

    /** Drop the cached counts of the platform admins / staff. */
    public static function forgetAdmins(): void
    {
        static::forget(User::where(fn ($q) => $q->whereIn('role', ['platform_admin', 'admin', 'platform_staff'])
            ->orWhere('is_admin', true)->orWhere('is_platform_staff', true))->pluck('id')->all());
    }

    /** @return array<string, int> */
    private static function compute(User $u): array
    {
        /** @var array<string, \Closure(): Builder> $queries section => query of the items the user may see */
        $queries = [];

        if ($u->isAdmin() || $u->is_platform_staff || $u->role === 'platform_staff') {
            $queries += static::adminQueries($u);
        } elseif ($u->isRider()) {
            $queries += static::riderQueries($u);
        } elseif ($u->role === 'seller' || $u->role === 'seller_staff') {
            $queries += static::sellerQueries($u);
        }
        // Customers — and store owners, who can shop too
        if ($u->role === 'customer' || $u->role === 'seller') {
            $queries += static::customerQueries($u);
        }
        if (! $queries) {
            return [];
        }

        $visits = SectionVisitService::visits($u);
        $missing = array_diff(array_keys($queries), array_keys($visits));
        if ($missing) {
            // Never counted before: start from now instead of flagging the whole history
            SectionVisitService::baseline($u, $missing);
        }

        $badges = [];
        foreach ($queries as $section => $query) {
            if (! isset($visits[$section])) {
                continue;
            }
            // One indexed query: created OR updated after the last visit (updated_at >= created_at)
            $q = $query();
            $column = in_array($section, self::NEW_ONLY, true) ? 'created_at' : 'updated_at';
            $badges[static::badgeKey($section)] = $q->where($q->qualifyColumn($column), '>', $visits[$section])->count();
        }

        return $badges;
    }

    /** Customer sections are stored without a prefix (orders, refunds, invoices). */
    private static function badgeKey(string $section): string
    {
        return str_contains($section, '.') ? $section : "customer.{$section}";
    }

    private static function adminQueries(User $u): array
    {
        $admin  = $u->isAdmin();
        $verify = $admin || $u->hasPermission('verifications.view');
        $stores = $admin || $u->hasPermission('stores.view');

        return array_filter([
            'admin.verifications'   => $verify
                ? fn () => VerificationRequest::whereIn('type', ['seller_application', 'customer_id_verification'])
                : null,
            'admin.store_documents' => $verify || $stores ? fn () => StoreDocumentSubmission::query() : null,
            'admin.refunds'         => $admin ? fn () => RefundRequest::where('escalated_to_admin', true) : null,
            // New store applications only (stores change their settings all the time)
            'admin.stores'          => $stores ? fn () => Store::query() : null,
            'admin.user_reports'    => $admin
                ? fn () => UserReport::where(fn ($q) => $q->whereIn('route', ['admin', 'both'])
                    ->orWhereNotNull('escalated_at')->orWhere('type', UserReport::SYSTEM_TYPE))
                : null,
        ]);
    }

    private static function sellerQueries(User $u): array
    {
        $owner   = $u->role === 'seller';
        $storeId = $owner ? Store::where('user_id', $u->id)->value('id') : $u->store_id;
        if (! $storeId) {
            return [];
        }
        $can = fn (string $perm) => $owner || $u->hasPermission($perm);

        return array_filter([
            'seller.orders'           => $can('orders.view') ? fn () => Order::where('store_id', $storeId) : null,
            'seller.deliveries'       => $can('deliveries.view') ? fn () => Delivery::where('store_id', $storeId) : null,
            'seller.refunds'          => $can('orders.view') ? fn () => RefundRequest::where('store_id', $storeId) : null,
            'seller.customer_reports' => $can('customer_reports.manage')
                ? fn () => UserReport::whereIn('route', ['store', 'both'])->where('reported_store_id', $storeId)
                    ->where('type', '!=', UserReport::SYSTEM_TYPE)
                : null,
            'seller.staff'            => $owner ? fn () => StaffDocument::where('store_id', $storeId) : null,
            'seller.store_documents'  => $owner ? fn () => StoreDocumentSubmission::where('store_id', $storeId) : null,
        ]);
    }

    private static function riderQueries(User $u): array
    {
        return [
            'rider.deliveries' => fn () => Delivery::where('rider_id', $u->id),
            'rider.documents'  => fn () => StaffDocument::where('user_id', $u->id),
        ];
    }

    private static function customerQueries(User $u): array
    {
        $customerId = Customer::where('user_id', $u->id)->value('id');
        if (! $customerId) {
            return [];
        }

        return [
            'orders'   => fn () => Order::where('customer_id', $customerId),
            'refunds'  => fn () => RefundRequest::where('customer_id', $customerId),
            'invoices' => fn () => Invoice::where('customer_id', $customerId),
        ];
    }
}
