<?php

namespace App\Services;

use App\Models\StaffDocument;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Staff / rider documents. The one rule that matters: a rider needs an approved, unexpired driver's license
 * before picking up or being assigned deliveries.
 */
class StaffDocumentService
{
    public const TYPES = [
        'drivers_license'      => "Driver's License",
        'police_clearance'     => 'Police Clearance',
        'nbi_clearance'        => 'NBI Clearance',
        'barangay_clearance'   => 'Barangay Clearance',
        'medical_certificate'  => 'Medical Certificate',
        'lpg_safety_training'  => 'LPG Safety Training Certificate',
        'other'                => 'Other',
    ];

    /** Max rejected uploads per document type within 30 days. */
    public const MAX_REJECTIONS = 5;

    public static function label(string $type, ?string $custom = null): string
    {
        return $type === 'other' && $custom ? $custom : (self::TYPES[$type] ?? $type);
    }

    public static function today(): Carbon
    {
        return Carbon::now('Asia/Manila')->startOfDay();
    }

    /**
     * 'valid' | 'expiring' (≤ 30 days left) | 'pending' | 'rejected' | 'expired' | 'missing' — see the decision order below.
     *
     * @param  Collection<int, StaffDocument>|null  $licenses  the user's drivers_license rows (pass them to avoid a query)
     */
    public static function riderLicenseStatus(User $user, ?Collection $licenses = null): string
    {
        return self::licenseInfo($user, $licenses)['status'];
    }

    /** @return array{status: string, license: ?StaffDocument} */
    public static function licenseInfo(User $user, ?Collection $licenses = null): array
    {
        $licenses ??= StaffDocument::where('user_id', $user->id)->where('doc_type', 'drivers_license')->get();
        $today = self::today();
        $approved = $licenses->where('status', 'approved')->sortByDesc(fn ($d) => $d->expires_at?->timestamp ?? 0);

        // 1) an approved license that is still valid
        $valid = $approved->first(fn ($d) => $d->expires_at && $d->expires_at->copy()->startOfDay()->gte($today));
        if ($valid) {
            $days = (int) $today->diffInDays($valid->expires_at->copy()->startOfDay(), false);
            return ['status' => $days <= 30 ? 'expiring' : 'valid', 'license' => $valid];
        }
        // 2) waiting for the owner
        if ($pending = $licenses->firstWhere('status', 'pending')) {
            return ['status' => 'pending', 'license' => $pending];
        }
        // 3) rejected after the latest approval
        $latestApproval = $approved->max(fn ($d) => $d->reviewed_at?->timestamp ?? 0) ?? 0;
        $rejected = $licenses->where('status', 'rejected')->sortByDesc(fn ($d) => $d->reviewed_at?->timestamp ?? 0)->first();
        if ($rejected && ($rejected->reviewed_at?->timestamp ?? 0) > $latestApproval) {
            return ['status' => 'rejected', 'license' => $rejected];
        }
        // 4) only expired approvals
        if ($approved->isNotEmpty()) {
            return ['status' => 'expired', 'license' => $approved->first()];
        }

        return ['status' => 'missing', 'license' => null];
    }

    /** Only riders are checked; everyone else can deliver. */
    public static function canDeliver(User $user, ?Collection $licenses = null): bool
    {
        if (! $user->isRider()) {
            return true;
        }

        return in_array(self::riderLicenseStatus($user, $licenses), ['valid', 'expiring'], true);
    }

    /** Plain-language explanation of the rider's license status. */
    public static function message(User $user, ?Collection $licenses = null): string
    {
        ['status' => $status, 'license' => $doc] = self::licenseInfo($user, $licenses);

        return match ($status) {
            'valid'    => "Your driver's license is valid until {$doc->expires_at->format('M j, Y')}.",
            'expiring' => "Your driver's license expires on {$doc->expires_at->format('M j, Y')}. Upload the renewed license soon.",
            'pending'  => "Your driver's license is waiting for the store owner's approval.",
            'rejected' => "Your driver's license was rejected: {$doc->rejection_reason} Upload it again.",
            'expired'  => "Your driver's license expired on {$doc->expires_at->format('M j, Y')}. Upload the renewed license.",
            default    => "Upload your driver's license before you can make deliveries.",
        };
    }

    /** Short note for rider pickers: null when the rider can deliver. */
    public static function pickerNote(string $status): ?string
    {
        return match ($status) {
            'valid', 'expiring' => null,
            'pending'           => 'waiting approval',
            'expired'           => 'license expired',
            'rejected'          => 'license rejected',
            default             => 'license missing',
        };
    }

    /**
     * can_deliver + license_note for a list of riders with ONE query (no N+1).
     *
     * @param  iterable<User>  $riders
     * @return array<int, array{can_deliver: bool, license_note: ?string, license_status: string}>
     */
    public static function forRiders(iterable $riders): array
    {
        $riders = collect($riders);
        $byUser = StaffDocument::whereIn('user_id', $riders->pluck('id'))->where('doc_type', 'drivers_license')->get()->groupBy('user_id');
        $out = [];
        foreach ($riders as $r) {
            $docs = $byUser->get($r->id, collect());
            $status = $r->isRider() ? self::riderLicenseStatus($r, $docs) : 'valid';
            $out[$r->id] = ['can_deliver' => in_array($status, ['valid', 'expiring'], true), 'license_note' => self::pickerNote($status), 'license_status' => $status];
        }

        return $out;
    }

    /** "{name} can't deliver yet: {message}", or null when the rider may be assigned. */
    public static function assignmentError(User $rider): ?string
    {
        return self::canDeliver($rider) ? null : "{$rider->name} can't deliver yet: " . self::message($rider);
    }
}
