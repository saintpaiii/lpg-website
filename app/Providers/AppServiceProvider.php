<?php

namespace App\Providers;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();

        // Chat auto-messages follow order / delivery changes from any controller, API or job
        \App\Models\Order::observe(\App\Observers\OrderObserver::class);
        \App\Models\Delivery::observe(\App\Observers\DeliveryObserver::class);

        $this->refreshSidebarBadges();
    }

    /** Sidebar badge counts are cached 20 s per user — drop them for whoever a change concerns. */
    protected function refreshSidebarBadges(): void
    {
        $badges = \App\Services\SidebarBadgeService::class;
        $customerUser = fn ($customerId) => $customerId ? \App\Models\Customer::whereKey($customerId)->value('user_id') : null;

        \App\Models\Order::saved(function ($o) use ($badges, $customerUser) {
            $badges::forgetStore($o->store_id);
            $badges::forget($customerUser($o->customer_id));
        });
        \App\Models\Delivery::saved(function ($d) use ($badges) {
            $badges::forget($d->rider_id, $d->getOriginal('rider_id'));
            $badges::forgetStore($d->store_id);
        });
        \App\Models\Invoice::created(fn ($i) => $badges::forget($customerUser($i->customer_id)));
        \App\Models\RefundRequest::saved(function ($r) use ($badges, $customerUser) {
            $badges::forgetStore($r->store_id);
            $badges::forget($customerUser($r->customer_id));
            if ($r->escalated_to_admin) {
                $badges::forgetAdmins();
            }
        });
        \App\Models\VerificationRequest::saved(fn () => $badges::forgetAdmins());
        \App\Models\StoreDocumentSubmission::saved(function ($s) use ($badges) {
            $badges::forgetAdmins();
            $badges::forgetStore($s->store_id);
        });
        \App\Models\Store::created(fn () => $badges::forgetAdmins());
        \App\Models\UserReport::saved(function ($r) use ($badges) {
            $badges::forgetStore($r->reported_store_id);
            $badges::forgetAdmins();
        });
        \App\Models\StaffDocument::saved(function ($d) use ($badges) {
            $badges::forgetStore($d->store_id);
            $badges::forget($d->user_id);
        });
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
