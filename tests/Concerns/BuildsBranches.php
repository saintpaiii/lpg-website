<?php

namespace Tests\Concerns;

use App\Models\Store;
use App\Models\StoreRole;
use App\Models\User;
use App\Services\BranchService;
use App\Services\StoreRoleService;
use Illuminate\Support\Str;

/** J9 test helpers (use together with BuildsLpgWorld). */
trait BuildsBranches
{
    /** An approved branch of $main (same owner) on an active trial. */
    protected function makeBranch(Store $main, string $name = 'Imus Branch', array $attrs = []): Store
    {
        $b = Store::create($attrs + [
            'user_id' => $main->user_id, 'parent_store_id' => $main->id, 'branch_name' => $name,
            'store_name' => Store::branchDisplayName($main->store_name, $name),
            'address' => '2 Aguinaldo Hwy', 'city' => 'Imus', 'barangay' => 'Anabu I-A', 'province' => 'Cavite', 'phone' => '09171230000',
            'bir_permit' => $main->bir_permit, 'business_permit' => 'permits/b.pdf', 'latitude' => 14.39, 'longitude' => 120.94,
            'status' => 'approved', 'approved_at' => now(), 'subscription_plan' => 'trial', 'subscription_started_at' => now(),
            'subscription_expires_at' => now()->addDays(14), 'trial_used_at' => now(),
        ]);
        $b->forceFill(['invoice_prefix' => BranchService::prefixFor($main, $name)])->save();

        return $b->fresh();
    }

    /** A staff account of $branch with the Branch Manager starter role. */
    protected function makeBranchManager(Store $branch): User
    {
        StoreRoleService::seedStarters($branch);
        $u = $this->makeUser(['name' => 'Manager ' . Str::random(4), 'role' => 'seller_staff', 'store_id' => $branch->id, 'must_change_password' => false]);
        StoreRoleService::assign($u, [StoreRole::where('store_id', $branch->id)->where('starter_key', 'branch_manager')->value('id')]);
        // Store staff must be clocked in to work (EnsureClockedIn)
        \App\Models\Attendance::forceCreate(['user_id' => $u->id, 'store_id' => $branch->id, 'date' => now()->toDateString(), 'clock_in' => now()->subHour(), 'status' => 'present']);

        return $u->fresh();
    }

    protected function ownerOf(Store $store): User
    {
        return User::findOrFail($store->user_id);
    }
}
