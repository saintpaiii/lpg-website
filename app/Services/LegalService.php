<?php

namespace App\Services;

use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Terms & Policies rules: current versions, who still has to accept what, recording acceptances,
 * rendering and publishing.
 *
 * A user is up to date for a document type when they accepted its latest MAJOR version or any newer
 * version. Minor versions (typos, wording) never ask anyone to accept again.
 */
class LegalService
{
    /** Latest published version of a type. */
    public static function current(string $type): ?LegalDocument
    {
        return LegalDocument::published()->where('type', $type)->orderByDesc('version')->first();
    }

    /** Document types this user must have accepted. Staff, riders and admins are never asked. */
    public static function requiredTypesFor(User $user): array
    {
        return match ($user->role) {
            'customer' => ['customer_terms', 'privacy_policy'],
            'seller'   => ['seller_terms', 'privacy_policy'],
            default    => [],
        };
    }

    /**
     * Current documents this user still has to accept, or null when nothing is pending.
     *
     * @return null|array{has_any_acceptance: bool, documents: LegalDocument[]}
     */
    public static function pendingFor(?User $user): ?array
    {
        if (! $user || ! $user->is_active) {
            return null;
        }
        $types = static::requiredTypesFor($user);
        if (! $types) {
            return null;
        }

        // Query 1: every published version of the needed types
        $docs = LegalDocument::published()->whereIn('type', $types)
            ->orderByDesc('version')
            ->get(['id', 'type', 'version', 'title', 'change_summary', 'is_major', 'published_at'])
            ->groupBy('type');
        if ($docs->isEmpty()) {
            return null;
        }

        // Query 2: what this user has accepted (any document)
        $accepted = LegalAcceptance::where('user_id', $user->id)->pluck('legal_document_id')->flip();

        $pending = [];
        foreach ($types as $type) {
            $versions = $docs->get($type);
            $major    = $versions?->firstWhere('is_major', true);   // newest first
            if (! $major) {
                continue;
            }
            $upToDate = $versions->contains(fn ($d) => $d->version >= $major->version && $accepted->has($d->id));
            if (! $upToDate) {
                $pending[] = $versions->first();   // the current version
            }
        }

        return $pending ? ['has_any_acceptance' => $accepted->isNotEmpty(), 'documents' => $pending] : null;
    }

    /** Record that the user agreed to these documents (already-recorded ones are left as they are). */
    public static function accept(User $user, array $documentIds, string $context, ?Request $request = null): void
    {
        foreach (array_unique(array_map('intval', $documentIds)) as $id) {
            LegalAcceptance::firstOrCreate(
                ['user_id' => $user->id, 'legal_document_id' => $id],
                [
                    'accepted_at' => now(),
                    'ip_address'  => $request?->ip(),
                    'user_agent'  => $request?->userAgent() ? Str::limit($request->userAgent(), 250, '') : null,
                    'context'     => $context,
                ],
            );
        }
    }

    /** Ids of the current published versions of these types (types without one are skipped). */
    public static function currentIds(array $types): array
    {
        return array_values(array_filter(array_map(fn ($t) => static::current($t)?->id, $types)));
    }

    /** Safe HTML of a document with {company_name}, {company_email}, {commission_rate} filled in. Works on unsaved models. */
    public static function render(LegalDocument $doc): string
    {
        $rate  = (float) Setting::get('default_commission_rate', '5.00');
        $email = (string) Setting::get('company_email', '');

        $text = strtr((string) $doc->body, [
            '{company_name}'    => (string) (Setting::get('company_name') ?: 'LPG Marketplace Cavite'),
            '{company_email}'   => $email !== '' ? $email : (string) config('mail.from.address'),
            '{commission_rate}' => static::formatRate($rate) . '%',
        ]);

        return Str::markdown($text, ['html_input' => 'strip', 'allow_unsafe_links' => false]);
    }

    /** Props for the seller application forms: the current Seller Terms (rendered) and the commission rate the seller agrees to. */
    public static function sellerTermsProps(): array
    {
        $doc = static::current('seller_terms');

        return [
            'seller_terms'    => $doc ? ['id' => $doc->id, 'title' => $doc->title, 'version' => $doc->version, 'html' => static::render($doc)] : null,
            'commission_rate' => (float) static::formatRate((float) Setting::get('default_commission_rate', '5.00')),
        ];
    }

    /** 5.00 → "5", 5.50 → "5.5" */
    public static function formatRate(float $rate): string
    {
        return rtrim(rtrim(number_format($rate, 2, '.', ''), '0'), '.');
    }

    /** Publish a draft as the next version of its type. */
    public static function publish(LegalDocument $draft, User $admin): LegalDocument
    {
        if ($draft->published_at !== null) {
            throw new InvalidArgumentException('Only drafts can be published.');
        }
        if (trim((string) $draft->title) === '' || trim((string) $draft->body) === '') {
            throw new InvalidArgumentException('A title and text are required before publishing.');
        }

        return DB::transaction(function () use ($draft, $admin) {
            $max = LegalDocument::published()->where('type', $draft->type)->lockForUpdate()->max('version');
            $draft->forceFill([
                'version'      => ((int) $max) + 1,
                'published_at' => now(),
                'published_by' => $admin->id,
            ])->save();

            return $draft;
        });
    }
}
