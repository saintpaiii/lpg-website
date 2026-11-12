<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\CartItem;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Payroll;
use App\Models\PaymentReceipt;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\StaffDocument;
use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use Illuminate\Http\Request;

/**
 * "Getting started" checklist on each role's HOME page — the core process the user can DO, ticked from real data.
 * Only computed on the home page (null everywhere else) with cheap exists() queries, so ✓ updates right away.
 * Hidden when tutorials are off, or once the user hid it / saw "You're all set!" (tutorials["checklist.<role>"]).
 *
 * Item: key, label, done, optional, url (where "Show me" goes) and tour (the page tour it starts there).
 */
class GettingStartedService
{
    public static function for(?User $user, Request $request): ?array
    {
        if (! $user || ! $user->tutorials_enabled || $request->header('X-Inertia-Partial-Data')) {
            return null;
        }

        $role = static::roleKey($user);
        if (! $role || ! static::onHomePage($user, $role, '/' . ltrim($request->path(), '/'))) {
            return null;
        }

        $seen = (array) (($user->tutorials ?? [])["checklist.{$role}"] ?? []);
        if (! empty($seen['done']) || ! empty($seen['skipped'])) {
            return null;
        }

        $items = match ($role) {
            'customer' => static::customer($user),
            'seller'   => static::seller($user),
            'staff', 'rider' => static::staff($user, $role === 'rider'),
            'admin'    => static::admin($user),
            default    => [],
        };
        if (! $items) {
            return null;
        }

        return [
            'key'      => "checklist.{$role}",
            'role'     => $role,
            'intro'    => $role === 'seller' ? 'Customers can see your store only when it can really deliver.' : null,
            'items'    => $items,
            'complete' => collect($items)->reject(fn ($i) => $i['optional'])->every(fn ($i) => $i['done']),
        ];
    }

    /** customer | seller | staff | rider | admin (null = no checklist) */
    public static function roleKey(User $user): ?string
    {
        return match (true) {
            $user->role === 'customer'                                           => 'customer',
            $user->role === 'seller'                                             => 'seller',
            $user->role === 'rider', $user->role === 'seller_staff' && $user->sub_role === 'rider' => 'rider',
            $user->role === 'seller_staff'                                       => 'staff',
            in_array($user->role, ['platform_admin', 'admin', 'platform_staff'], true) || $user->is_admin => 'admin',
            default                                                              => null,
        };
    }

    private static function onHomePage(User $user, string $role, string $path): bool
    {
        if ($role === 'customer') {
            // /customer/dashboard redirects: unverified → Verify ID, verified → Browse
            return in_array($path, ['/customer/products', '/customer/id-verification'], true);
        }
        $home = parse_url($user->homeUrl(), PHP_URL_PATH) ?: '/';
        if ($role === 'admin') {
            return in_array($path, [$home, '/admin/dashboard', '/admin/welcome'], true);
        }

        return $path === $home;
    }

    private static function item(string $key, string $label, bool $done, string $url, ?string $tour, bool $optional = false): array
    {
        return compact('key', 'label', 'done', 'url', 'tour', 'optional');
    }

    private static function customer(User $u): array
    {
        $customerIds = Customer::where('user_id', $u->id)->pluck('id');
        $hasOrder    = $u->hasCustomerHistory() && \App\Models\Order::whereIn('customer_id', $customerIds)->exists();
        $hasReceipt  = $customerIds->isNotEmpty() && (
            PaymentReceipt::whereIn('customer_id', $customerIds)->exists() || Invoice::whereIn('customer_id', $customerIds)->exists()
        );
        $selling = VerificationRequest::where('user_id', $u->id)->where('type', 'seller_application')->exists()
            || Store::where('user_id', $u->id)->exists();

        return [
            static::item('verify_id', 'Verify your ID', $u->id_verification_status === 'verified', '/customer/id-verification', 'customer.id-verification'),
            static::item('address', 'Add a delivery address', CustomerAddress::where('user_id', $u->id)->exists(), '/customer/addresses', 'customer.addresses'),
            static::item('cart', 'Add a product to your cart', $hasOrder || CartItem::where('user_id', $u->id)->exists(), '/customer/products', 'customer.products'),
            static::item('order', 'Place your first order', $hasOrder, '/customer/cart', 'customer.cart'),
            static::item('receipt', 'See your receipt or invoice', $hasReceipt, '/customer/invoices', 'customer.invoices'),
            static::item('start_selling', 'Start selling (optional)', $selling, '/customer/become-seller', 'customer.become-seller', true),
        ];
    }

    private static function seller(User $u): array
    {
        $store = Store::where('user_id', $u->id)->first();
        if (! $store || $store->status !== 'approved') {
            return [];
        }

        $items = [
            static::item('store_info', 'Complete store info and Tax & Invoice',
                filled($store->tin) || filled($store->registered_name) || $store->vat_status === 'vat', '/seller/settings', 'seller.settings'),
            static::item('vehicle', 'Add a vehicle with a delivery fee', $store->deliveryReadyVehicles()->exists(), '/seller/vehicles', 'seller.vehicles'),
            static::item('rider', 'Add a rider with an approved licence', $store->eligibleRiders()->exists(), '/seller/staff', 'seller.staff'),
            static::item('product', 'Add a product', Product::where('store_id', $store->id)->where('is_active', true)->exists(), '/seller/products', 'seller.products'),
        ];

        // Hourly pay only matters with Payroll on the plan; ✓ needs at least one staff member AND a rate for every role
        if (SubscriptionService::hasFeature($store, 'payroll')) {
            $hasStaff = User::where('store_id', $store->id)->where('role', 'seller_staff')->exists();
            $items[] = static::item('hourly_pay', 'Set hourly pay for each role',
                $hasStaff && \App\Services\PayrollCalculator::rolesNeedingRate($store) === [], '/seller/payroll/settings', 'seller.payroll-settings');
        }

        $items[] = static::item('clock_in', 'A rider clocks in with a vehicle',
            Attendance::where('store_id', $store->id)->whereDate('date', StaffDocumentService::today()->toDateString())
                ->whereNull('clock_out')->whereNotNull('clock_in')->whereNotNull('vehicle_id')->exists(),
            '/seller/attendance', 'seller.attendance');
        $items[] = static::item('visible', 'Your store is visible to customers', $store->isOpenToCustomers(), '/seller/dashboard', 'seller.dashboard');

        return $items;
    }

    private static function staff(User $u, bool $rider): array
    {
        $docsDone = $rider
            ? StaffDocumentService::canDeliver($u)
            : StaffDocument::where('user_id', $u->id)->exists();
        $clocked = Attendance::where('user_id', $u->id)->whereDate('date', StaffDocumentService::today()->toDateString())
            ->whereNotNull('clock_in')
            ->when($rider, fn ($q) => $q->whereNotNull('vehicle_id'))
            ->exists();

        $items = [
            static::item('documents', $rider ? "Upload your driver's licence (approved)" : 'Upload your documents', $docsDone,
                $rider ? '/rider/documents' : '/seller/my-documents', $rider ? 'rider.my-documents' : 'staff.my-documents'),
        ];
        // HR manages attendance instead of clocking in
        if ($rider || ! StaffAccess::hasStarter($u, 'hr')) {
            $items[] = static::item('clock_in', $rider ? 'Clock in and choose your vehicle' : 'Clock in', $clocked,
                $rider ? '/rider/my-attendance' : '/seller/my-attendance', $rider ? 'rider.my-attendance' : 'staff.my-attendance');
        }
        $items[] = static::item('payslip', 'See your payslip (optional)',
            Payroll::where('user_id', $u->id)->whereIn('status', ['released', 'paid'])->exists(),
            $rider ? '/rider/my-payslips' : '/seller/my-payslips', $rider ? 'rider.my-payslips' : 'staff.my-payslips', true);

        return $items;
    }

    private static function admin(User $u): array
    {
        $full = $u->isPlatformAdmin() || in_array($u->role, ['platform_admin', 'admin'], true);
        $items = [];
        if ($full || $u->hasPermission('stores.view')) {
            $items[] = static::item('sellers', 'Review pending sellers', ! Store::where('status', 'pending')->exists(), '/admin/stores', 'admin.stores');
        }
        if ($full || $u->hasPermission('verifications.view')) {
            $items[] = static::item('verifications', 'Review ID verifications',
                ! VerificationRequest::where('status', 'pending')->exists(), '/admin/verifications', 'admin.verifications');
        }
        if ($full || $u->hasPermission('reports.view')) {
            $items[] = static::item('reports', 'Check the reports', false, '/admin/reports', 'admin.reports', true);
        }

        return $items;
    }
}
