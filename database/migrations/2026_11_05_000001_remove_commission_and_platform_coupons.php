<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Commission is removed for good: stores keep 100% of their sales (the platform will earn from monthly
 * subscriptions). Drops the three commission systems (commissions + commission_invoices, invoices.platform_commission,
 * orders.platform_fee + the old wallet tables), retires platform coupons (store coupons stay), cleans settings and
 * notifications, and publishes new Seller Terms (section 6 = Subscription plans) that sellers must accept again.
 *
 * Every step is guarded so it runs on the live database and on a fresh `migrate:fresh --seed`.
 */
return new class extends Migration
{
    private const NEW_SECTION_6 = <<<'MD'
## 6. Subscription plans
- The Platform does not charge commission. You keep the full amount of your sales.
- After your store is approved, it gets a free 30-day Premium trial (once per store).
- After the trial, your store needs a monthly plan (Basic, Pro or Premium) for your products to be visible to customers. The price, limits and features of each plan are shown on the My Plan page. The Platform may change prices; a new price only applies to your next purchase.
- Plans are prepaid for 30 days through PayMongo and do not renew automatically. You are reminded during the last 3 days.
- When your plan ends without renewal, your products are hidden from customers right away. You can still log in and finish orders that were already placed.
- Buying a different plan starts it immediately at full price; unused days of the previous plan are not refunded. If your store has more products, staff or vehicles than the new plan allows, the extras are paused (never deleted) until you are within the limit or upgrade.
- Store coupons are paid for by your store.

MD;

    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        try {
            // a) Platform coupons: retire them (old orders keep showing the code — Order::coupon() is withTrashed)
            if (Schema::hasTable('coupons')) {
                DB::table('coupons')->where('type', 'platform')->whereNull('deleted_at')
                    ->update(['is_active' => false, 'deleted_at' => now()]);
            }
            Schema::dropIfExists('coupon_store_exclusions');
            $this->dropColumns('coupons', ['admin_share_percent', 'seller_commission_during_promo', 'featured_boost']);
            $this->dropColumns('coupon_uses', ['admin_absorbed', 'seller_absorbed', 'commission_rate']);

            // b) Commission billing + the old wallet system
            foreach (['commissions', 'commission_invoices', 'wallet_transactions', 'withdrawal_requests', 'seller_wallets', 'seller_payouts'] as $table) {
                Schema::dropIfExists($table);
            }

            // c) Commission columns
            $this->dropColumns('stores', ['commission_rate', 'commission_suspended', 'commission_suspended_at']);
            $this->dropColumns('invoices', ['platform_commission']);
            $this->dropColumns('orders', ['platform_fee']);
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        // d) Settings
        if (Schema::hasTable('settings')) {
            DB::table('settings')->whereIn('key', [
                'default_commission_rate', 'default_commission', 'commission_invoice_due_days',
                'commission_suspend_after_days', 'commission_billing_period',
            ])->delete();
        }

        // e) Notifications that point to removed pages (soft-deleted rows included — query builder)
        if (Schema::hasTable('notifications')) {
            DB::table('notifications')->where(fn ($q) => $q
                ->where('type', 'commission')
                ->orWhere('data->link', 'like', '/seller/commission%')
                ->orWhere('data->link', 'like', '/admin/commissions%')
                ->orWhere('data->link', 'like', '/admin/coupons%')
                ->orWhere('data->link', '/seller/coupons?tab=platform'))
                ->delete();
        }

        // f) Legal documents
        if (Schema::hasTable('legal_documents')) {
            $this->publishSellerTerms();
            $this->publishPrivacyPolicy();
        }
    }

    public function down(): void
    {
        // Irreversible: commission was removed for good.
    }

    /** Drop the columns that exist, in one Schema::table call. */
    private function dropColumns(string $table, array $columns): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }
        $existing = array_values(array_filter($columns, fn ($c) => Schema::hasColumn($table, $c)));
        if ($existing) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn($existing));
        }
    }

    /** Replace "## 6. Platform commission" (up to the next heading) with the new section 6. */
    private function replaceSection6(string $body): ?string
    {
        $pattern = '/' . preg_quote('## 6. Platform commission', '/') . '.*?(?=\n## |\z)/s';
        if (! preg_match($pattern, $body)) {
            return null;
        }

        return preg_replace($pattern, rtrim(self::NEW_SECTION_6, "\n") . "\n", $body, 1);
    }

    private function publishSellerTerms(): void
    {
        $latest = DB::table('legal_documents')->where('type', 'seller_terms')->whereNotNull('published_at')
            ->orderByDesc('version')->first();
        if (! $latest) {
            return;     // fresh install: the seeder uses the updated resources/legal/seller_terms.md
        }

        $body = $this->replaceSection6((string) $latest->body);
        if ($body === null) {
            $file = resource_path('legal/seller_terms.md');
            if (! is_file($file)) {
                return;
            }
            $body = file_get_contents($file);
        }

        $now = now();
        DB::table('legal_documents')->insert([
            'type'           => 'seller_terms',
            'version'        => (int) DB::table('legal_documents')->where('type', 'seller_terms')->max('version') + 1,
            'title'          => $latest->title,
            'body'           => $body,
            'change_summary' => 'Commission removed — stores now use monthly subscription plans.',
            'is_major'       => true,       // sellers must accept it again
            'published_at'   => $now,
            'published_by'   => null,
            'created_by'     => null,
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);

        // Unpublished drafts get the same section
        foreach (DB::table('legal_documents')->where('type', 'seller_terms')->whereNull('version')->get(['id', 'body']) as $draft) {
            if (($new = $this->replaceSection6((string) $draft->body)) !== null) {
                DB::table('legal_documents')->where('id', $draft->id)->update(['body' => $new, 'updated_at' => $now]);
            }
        }
    }

    private function publishPrivacyPolicy(): void
    {
        $latest = DB::table('legal_documents')->where('type', 'privacy_policy')->whereNotNull('published_at')
            ->orderByDesc('version')->first();
        if (! $latest || ! str_contains((string) $latest->body, 'commission invoices')) {
            return;
        }

        $now = now();
        DB::table('legal_documents')->insert([
            'type'           => 'privacy_policy',
            'version'        => (int) DB::table('legal_documents')->where('type', 'privacy_policy')->max('version') + 1,
            'title'          => $latest->title,
            'body'           => str_replace('commission invoices', 'subscription payments', (string) $latest->body),
            'change_summary' => 'Payments wording updated (no more commission).',
            'is_major'       => false,
            'published_at'   => $now,
            'published_by'   => null,
            'created_by'     => null,
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);
    }
};
