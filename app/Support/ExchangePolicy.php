<?php

namespace App\Support;

use App\Models\Store;

/**
 * Refill tank exchange policy (J4): which brands of empty tank the store takes and the condition rules.
 * stores.exchange_policy = {brands: [...], rules: [...], note}; NULL = the default (any brand + all 4 rules).
 */
class ExchangePolicy
{
    public const BRANDS = ['Petron Gasul', 'Solane', 'Shellane', 'Phoenix', 'Total', 'Pryce', 'Fiesta', 'Any brand'];

    public const RULES = [
        'No dents or rust',
        'No leaks',
        'Valve and collar intact',
        'Not past its requalification date (stamped on the collar)',
    ];

    /** Why a tank was not accepted at handover (key => label). */
    public const NOT_ACCEPTED_REASONS = [
        'wrong_brand'     => 'Wrong brand',
        'dented'          => 'Dented / rusty',
        'leaking'         => 'Leaking',
        'valve'           => 'Valve / collar damaged',
        'requalification' => 'Past requalification date',
        'other'           => 'Other',
    ];

    public static function default(): array
    {
        return ['brands' => ['Any brand'], 'rules' => self::RULES, 'note' => null];
    }

    /** The store's policy (default when not set), cleaned. */
    public static function for(Store $store): array
    {
        return self::clean($store->exchange_policy);
    }

    public static function clean(?array $p): array
    {
        if (! $p) {
            return self::default();
        }
        $brands = array_values(array_intersect(self::BRANDS, (array) ($p['brands'] ?? [])));
        $rules  = array_values(array_intersect(self::RULES, (array) ($p['rules'] ?? [])));
        $note   = trim((string) ($p['note'] ?? '')) ?: null;

        return ['brands' => $brands ?: ['Any brand'], 'rules' => $rules, 'note' => $note ? mb_substr($note, 0, 300) : null];
    }

    /** Validation rules for a submitted policy under $prefix (e.g. "exchange_policy"). */
    public static function rules(string $prefix = 'exchange_policy'): array
    {
        return [
            $prefix              => ['nullable', 'array'],
            "{$prefix}.brands"   => ['nullable', 'array'],
            "{$prefix}.brands.*" => ['string', 'in:' . implode(',', self::BRANDS)],
            "{$prefix}.rules"    => ['nullable', 'array'],
            "{$prefix}.rules.*"  => ['string', \Illuminate\Validation\Rule::in(self::RULES)],
            "{$prefix}.note"     => ['nullable', 'string', 'max:300'],
        ];
    }

    /** One line for chat / invoices: "Accepted brands: Solane, Petron Gasul · No dents or rust; No leaks". */
    public static function summary(array $p): string
    {
        $brands = in_array('Any brand', $p['brands'], true) ? 'Any brand' : implode(', ', $p['brands']);

        return "Accepted brands: {$brands}" . ($p['rules'] ? ' · ' . implode('; ', $p['rules']) : '') . ($p['note'] ? " · {$p['note']}" : '');
    }
}
