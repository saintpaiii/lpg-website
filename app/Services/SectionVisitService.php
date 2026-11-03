<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * When a user last opened a section (seller.orders, rider.deliveries, orders = the customer's My Orders, …).
 * Sidebar badges count what changed since then; list pages highlight rows that are new / updated since then.
 * Written by the TrackSectionVisit middleware (page visits and the user's own changes).
 */
class SectionVisitService
{
    /** Request attribute holding the previous visit of the section being viewed */
    public const SINCE_ATTRIBUTE = 'section_since';

    public static function lastVisit(User $user, string $section): ?CarbonInterface
    {
        $at = DB::table('section_visits')->where('user_id', $user->id)->where('section', $section)->value('visited_at');

        return $at ? Carbon::parse($at) : null;
    }

    /** @return array<string, CarbonInterface> section => visited_at */
    public static function visits(User $user): array
    {
        return DB::table('section_visits')->where('user_id', $user->id)->pluck('visited_at', 'section')
            ->map(fn ($at) => Carbon::parse($at))->all();
    }

    /** Mark sections as seen now and drop the user's cached sidebar badges. */
    public static function touch(User $user, string ...$sections): void
    {
        if (! $sections) {
            return;
        }
        $now = now();
        DB::table('section_visits')->upsert(
            array_map(fn ($s) => ['user_id' => $user->id, 'section' => $s, 'visited_at' => $now], array_unique($sections)),
            ['user_id', 'section'],
            ['visited_at'],
        );
        SidebarBadgeService::forget($user->id);
    }

    /** First time a section is counted: start from now, so old history doesn't show up as "new". */
    public static function baseline(User $user, array $sections): void
    {
        $now = now();
        DB::table('section_visits')->insertOrIgnore(
            array_map(fn ($s) => ['user_id' => $user->id, 'section' => $s, 'visited_at' => $now], $sections),
        );
    }

    /** The previous visit of the section this request shows (set by TrackSectionVisit); null = first visit. */
    public static function since(Request $request): ?CarbonInterface
    {
        return $request->attributes->get(self::SINCE_ATTRIBUTE);
    }

    /**
     * Row highlight: new = created (or, e.g., escalated) after the previous visit; updated = changed after it.
     * The user's own changes re-mark the section as seen, so they never count as "updated".
     *
     * @return array{is_new: bool, is_updated: bool, updated_at: ?string}|null
     */
    public static function flags(?CarbonInterface $since, $createdAt, $updatedAt): ?array
    {
        if (! $since) {
            return null;
        }
        $isNew = $createdAt && Carbon::parse($createdAt)->gt($since);
        $isUpdated = ! $isNew && $updatedAt && Carbon::parse($updatedAt)->gt($since);

        return $isNew || $isUpdated
            ? ['is_new' => (bool) $isNew, 'is_updated' => (bool) $isUpdated, 'updated_at' => $updatedAt ? Carbon::parse($updatedAt)->toIso8601String() : null]
            : null;
    }

    /** Flags for a model row (created_at / updated_at); $newOnly ignores updates (e.g. stores edit settings often). */
    public static function flagsFor(Request $request, $model, ?string $newColumn = null, bool $newOnly = false): ?array
    {
        $flags = static::flags(static::since($request), $model->{$newColumn ?? 'created_at'}, $model->updated_at);

        return $newOnly && ! ($flags['is_new'] ?? false) ? null : $flags;
    }

    /** ISO time of the previous visit for the page ("since your last visit" note). */
    public static function sinceIso(Request $request): ?string
    {
        return static::since($request)?->toIso8601String();
    }
}
