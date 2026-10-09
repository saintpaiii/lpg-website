<?php

namespace App\Services;

use App\Models\AccountAction;
use App\Models\User;

/**
 * Account suspension, same fields and AccountAction log as Admin\UsersController::toggleActive
 * (so the login screen shows the reason and the admin can reactivate from the Users page).
 */
class AccountService
{
    /** Returns false when the account was already inactive. */
    public static function suspend(User $user, ?User $by, string $reason, ?string $notes = null): bool
    {
        if (! $user->is_active) {
            return false;
        }
        $user->update([
            'is_active'           => false,
            'deactivation_reason' => $reason,
            'deactivation_notes'  => $notes,
            'deactivated_at'      => now(),
            'deactivated_by'      => $by?->id,
        ]);
        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'deactivate',
            'reason'       => $reason,
            'notes'        => $notes,
            'performed_by' => $by?->id,
        ]);

        return true;
    }
}
