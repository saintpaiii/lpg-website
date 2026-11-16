<?php

namespace App\Support;

use App\Models\Store;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * The store permits sellers upload, which ones expire, and their status.
 * Dates are compared in Asia/Manila.
 */
class StoreDocuments
{
    /** key => [label, expiry column (null = does not expire)] */
    public const TYPES = [
        'bir_permit'      => ['label' => 'BIR Certificate of Registration',           'expiry' => null],
        'business_permit' => ['label' => "Business / Mayor's Permit",                 'expiry' => 'business_permit_expires_at'],
        'fsic_permit'     => ['label' => 'Fire Safety Inspection Certificate (FSIC)', 'expiry' => 'fsic_permit_expires_at'],
        // RA 11592: the DOE issues the License to Operate — it IS the "LTO" (the old separate lto_permit is no longer asked)
        'doe_lpg_license' => ['label' => 'DOE License to Operate (LTO) — LPG Retail Outlet', 'expiry' => 'doe_lpg_license_expires_at'],
        // Business-name registration: DTI (single owner) or SEC (corporation / partnership). The DTI certificate is valid
        // 5 years (dti_sec_expires_at, J3); SEC registration never expires — see expiryColumn($type, $kind).
        'dti_sec_registration' => ['label' => 'DTI Business Name or SEC Registration',   'expiry' => 'dti_sec_expires_at'],
    ];

    /** Required documents reviewed on the admin store page (+ every extra "other-{id}"), in review order. */
    public const REVIEW_DOCS = ['valid_id', 'bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'dti_sec_registration'];

    /** The two non-document checklist items. */
    public const REVIEW_ITEMS = ['address_pin', 'duplicates'];

    /** Reasons the admin picks when rejecting one document. */
    public const REJECT_REASONS = [
        'Blurry / unreadable',
        'Expired',
        'Wrong document',
        "Business name doesn't match",
        "Name on ID doesn't match the owner",
        'Edited / tampered',
        'Other',
    ];

    /** "Valid ID (owner)", "FSIC", "DTI Business Name certificate"… — short names for the review list and seller messages. */
    public static function reviewLabel(string $key, ?string $dtiSecKind = null): string
    {
        return match ($key) {
            'valid_id'             => 'Valid ID (owner)',
            'fsic_permit'          => 'FSIC',
            'doe_lpg_license'      => 'DOE License to Operate',
            'dti_sec_registration' => $dtiSecKind === 'sec' ? 'SEC Registration' : ($dtiSecKind === 'dti' ? 'DTI Business Name certificate' : 'DTI / SEC Registration'),
            'address_pin'          => 'Store address matches the map pin',
            'duplicates'           => 'Duplicate warnings checked (or none)',
            default                => self::label($key),
        };
    }

    /** dti_sec_kind values */
    public const DTI_SEC_KINDS = ['dti' => 'DTI', 'sec' => 'SEC'];

    /** Help line for a document type (registration forms, Store Documents). */
    public const HELP = [
        'doe_lpg_license'      => 'Issued by the Department of Energy under RA 11592 (valid 3–5 years).',
        'dti_sec_registration' => 'DTI Certificate of Business Name Registration, or SEC Certificate of Incorporation / Registration.',
    ];

    /** Messages for the DTI/SEC upload + its DTI / SEC choice (registration forms and Store Documents). */
    public static function dtiSecMessages(): array
    {
        return [
            'dti_sec_registration.required' => 'Please upload your DTI Business Name or SEC Registration.',
            'dti_sec_kind.required'         => 'Choose DTI (single owner) or SEC (corporation / partnership).',
            'dti_sec_kind.in'               => 'Choose DTI (single owner) or SEC (corporation / partnership).',
        ];
    }

    /** "DTI/SEC Registration (DTI)" etc. — the label shown next to a store's file. */
    public static function dtiSecLabel(?string $kind): string
    {
        return 'DTI/SEC Registration' . ($kind && isset(self::DTI_SEC_KINDS[$kind]) ? ' (' . self::DTI_SEC_KINDS[$kind] . ')' : '');
    }

    /** A permit expired longer than this hides the store from customers. */
    public const GRACE_DAYS = 7;

    /** Days before expiry when the owner is reminded. */
    public const REMIND_DAYS = [30, 7, 1];

    /** Max rejected uploads per document (and seller applications) within 30 days. */
    public const MAX_REJECTIONS = 5;

    /** Extra ("other") documents a seller may add on the application form. */
    public const MAX_OTHER_AT_REGISTRATION = 5;

    /** Cap on 'other' documents per store, counting pending + approved (registration / resubmission). */
    public const MAX_OTHER_TOTAL = 10;

    /** 'other' documents of a store that count toward MAX_OTHER_TOTAL (pending + approved). */
    public static function otherCount(int $storeId): int
    {
        return \App\Models\StoreDocumentSubmission::where('store_id', $storeId)
            ->where('doc_type', 'other')
            ->whereIn('status', ['pending', 'approved'])
            ->count();
    }

    /** Validation for "Other documents (optional)" on both application forms (rows with neither label nor file are dropped first). */
    public static function otherDocumentRules(): array
    {
        return [
            'other_documents'              => ['nullable', 'array', 'max:' . self::MAX_OTHER_AT_REGISTRATION],
            'other_documents.*.label'      => ['required_with:other_documents.*.file', 'nullable', 'string', 'max:100'],
            'other_documents.*.file'       => ['required_with:other_documents.*.label', 'nullable', \Illuminate\Validation\Rules\File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024)],
        ];
    }

    public static function otherDocumentMessages(): array
    {
        return [
            'other_documents.max'                    => 'You can add up to ' . self::MAX_OTHER_AT_REGISTRATION . ' extra documents.',
            'other_documents.*.label.required_with'  => 'Enter the name of this document.',
            'other_documents.*.label.max'            => 'Keep the name under 100 characters.',
            'other_documents.*.label.distinct'       => 'Each extra document needs a different name.',
            'other_documents.*.file.required_with'   => 'Choose a file for this document.',
            'other_documents.*.file.mimes'           => 'Use a JPG, PNG, WEBP or PDF file.',
            'other_documents.*.file.max'             => 'The file must be 5 MB or smaller.',
            'other_documents.*.expires_at.after'     => 'The date must be in the future.',
        ];
    }

    /** Keep only rows the seller actually filled in (an empty "+ Add another document" row is ignored). */
    public static function filledOtherRows(\Illuminate\Http\Request $request): array
    {
        $rows = (array) $request->input('other_documents', []);
        $out  = [];
        foreach ($rows as $i => $row) {
            $label = trim((string) ($row['label'] ?? ''));
            if ($label === '' && ! $request->hasFile("other_documents.$i.file")) {
                continue;
            }
            $out[$i] = $label;
        }

        return $out;
    }

    /**
     * Labels must be different within one submission (and from the store's earlier pending / approved extras);
     * at most MAX_OTHER_TOTAL extras per store. Throws a ValidationException keyed to the row.
     * @param array<int,string> $rows index => label
     */
    public static function assertOtherRowsAllowed(array $rows, ?int $storeId = null): void
    {
        $existing = $storeId
            ? \App\Models\StoreDocumentSubmission::where('store_id', $storeId)->where('doc_type', 'other')
                ->whereIn('status', ['pending', 'approved'])->pluck('label')->map(fn ($l) => mb_strtolower(trim((string) $l)))->all()
            : [];

        $seen = [];
        foreach ($rows as $i => $label) {
            $key = mb_strtolower($label);
            if ($key !== '' && (isset($seen[$key]) || in_array($key, $existing, true))) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "other_documents.$i.label" => 'Each extra document needs a different name.',
                ]);
            }
            $seen[$key] = true;
        }

        if ($storeId && count($rows) > 0 && self::otherCount($storeId) + count($rows) > self::MAX_OTHER_TOTAL) {
            $left = max(0, self::MAX_OTHER_TOTAL - self::otherCount($storeId));
            throw \Illuminate\Validation\ValidationException::withMessages([
                'other_documents' => "A store can have up to " . self::MAX_OTHER_TOTAL . " extra documents — you can add {$left} more.",
            ]);
        }
    }

    /**
     * Save the filled extra documents as pending 'other' submissions (local disk). Call inside the caller's transaction.
     * @param array<int,string> $rows index => label (from filledOtherRows)
     */
    public static function saveOtherDocuments(\Illuminate\Http\Request $request, Store $store, array $rows, int $userId): int
    {
        $n = 0;
        foreach ($rows as $i => $label) {
            $file = $request->file("other_documents.$i.file");
            if (! $file) {
                continue;
            }
            \App\Models\StoreDocumentSubmission::create([
                'store_id'     => $store->id,
                'doc_type'     => 'other',
                'label'        => $label,
                'file_path'    => $file->store('store_documents', 'local'),
                'expires_at'   => null,   // extra documents have no expiry (J3)
                'status'       => 'pending',
                'submitted_by' => $userId,
            ]);
            $n++;
        }

        return $n;
    }

    /**
     * Validation for the "Valid until" date the ADMIN confirms when accepting an expiring document (J3 — sellers no
     * longer type it; OCR pre-fills it). At most 5 years ahead.
     */
    public static function validUntilRule(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'date', 'after:today', 'before_or_equal:' . self::today()->addYears(5)->toDateString()];
    }

    public static function validUntilMessages(string $field = 'expires_at'): array
    {
        return [
            "{$field}.required"        => 'Enter the "valid until" date printed on the document.',
            "{$field}.after"           => 'This document has expired (the date is not after today) — reject it instead.',
            "{$field}.before_or_equal" => 'Please check the date (at most 5 years ahead).',
        ];
    }

    public static function label(string $type): string
    {
        return self::TYPES[$type]['label'] ?? $type;
    }

    /**
     * The store column holding the "valid until" date, or null when the document doesn't expire.
     * The DTI / SEC registration expires only when it is a DTI certificate ($dtiSecKind = 'dti').
     */
    public static function expiryColumn(string $type, ?string $dtiSecKind = null): ?string
    {
        if ($type === 'dti_sec_registration' && $dtiSecKind !== 'dti') {
            return null;
        }

        return self::TYPES[$type]['expiry'] ?? null;
    }

    /** Same, for one store (uses its DTI / SEC choice). */
    public static function expiryColumnFor(Store $store, string $type): ?string
    {
        return self::expiryColumn($type, $store->dti_sec_kind);
    }

    /** Reminder / banner label: "DTI Business Name certificate" instead of the combined DTI / SEC label. */
    public static function labelFor(Store $store, string $type): string
    {
        return $type === 'dti_sec_registration' ? self::reviewLabel($type, $store->dti_sec_kind) : self::label($type);
    }

    /** Types that CAN have an expiry date (DTI / SEC: only a DTI certificate — use expiryColumnFor / statusFor per store). */
    public static function expiringTypes(): array
    {
        return array_keys(array_filter(self::TYPES, fn ($t) => $t['expiry'] !== null));
    }

    public static function today(): CarbonInterface
    {
        return Carbon::now('Asia/Manila')->startOfDay();
    }

    public static function expiry(Store $store, string $type): ?CarbonInterface
    {
        $col = self::expiryColumnFor($store, $type);
        $date = $col ? $store->{$col} : null;

        return $date ? Carbon::parse($date->format('Y-m-d'), 'Asia/Manila')->startOfDay() : null;
    }

    /** Whole days until expiry (negative once expired); null without a date. */
    public static function daysLeft(Store $store, string $type): ?int
    {
        $exp = self::expiry($store, $type);

        return $exp ? (int) self::today()->diffInDays($exp, false) : null;
    }

    /** 'valid' | 'expiring' (≤ 30 days left) | 'expired' (date before today) | 'no_date' | 'no_expiry' (BIR) */
    public static function statusFor(Store $store, string $type): string
    {
        if (! self::expiryColumnFor($store, $type)) {
            return 'no_expiry';
        }
        $days = self::daysLeft($store, $type);

        return match (true) {
            $days === null => 'no_date',
            $days < 0      => 'expired',
            $days <= 30    => 'expiring',
            default        => 'valid',
        };
    }

    /** Card / badge data for one permit. */
    public static function summary(Store $store, string $type): array
    {
        $exp = self::expiry($store, $type);

        return [
            'type'       => $type,
            'label'      => self::labelFor($store, $type),
            'expires'    => $exp?->toDateString(),
            'expires_on' => $exp?->format('M d, Y'),
            'days_left'  => self::daysLeft($store, $type),
            'status'     => self::statusFor($store, $type),
        ];
    }

    /**
     * The most urgent permit problem for the seller banner (expired, or expiring within 7 days), or null.
     * Uses only the store row.
     */
    public static function alertFor(Store $store): ?array
    {
        $worst = null;
        foreach (self::expiringTypes() as $type) {
            $days = self::daysLeft($store, $type);
            if ($days === null || $days > 7) {
                continue;
            }
            if ($worst === null || $days < $worst['days_left']) {
                $worst = self::summary($store, $type);
            }
        }

        return $worst ? ['label' => $worst['label'], 'date' => $worst['expires_on'], 'status' => $worst['status'], 'days_left' => $worst['days_left']] : null;
    }
}
