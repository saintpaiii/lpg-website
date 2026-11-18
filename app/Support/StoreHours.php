<?php

namespace App\Support;

use App\Models\Store;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Store opening hours (J4) — ONE place for "is it open", "when does it open", and the labels customers see.
 * stores.opening_hours = per weekday (1 = Monday … 7 = Sunday) {open: "08:00", close: "18:00", closed: bool, all_day: bool};
 * NULL (or every day all_day) = open 24 hours. stores.closed_today_until = the seller's "Closed today" switch.
 * Times are Asia/Manila. A closing time at or before the opening time runs past midnight (e.g. 18:00–02:00).
 * Ordering is allowed while closed — delivery / pick-up just start when the store opens.
 */
class StoreHours
{
    public const TZ = 'Asia/Manila';

    public const DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    /** One day's setting, normalised. */
    public static function day(?array $hours, int $isoDay): array
    {
        $d = $hours[$isoDay] ?? $hours[(string) $isoDay] ?? null;
        if (! is_array($d)) {
            return ['open' => '00:00', 'close' => '00:00', 'closed' => false, 'all_day' => true];
        }

        return [
            'open'    => self::time($d['open'] ?? '08:00'),
            'close'   => self::time($d['close'] ?? '18:00'),
            'closed'  => (bool) ($d['closed'] ?? false),
            'all_day' => (bool) ($d['all_day'] ?? false),
        ];
    }

    /** Validation-friendly normaliser for a submitted week (null / "always open" → null = 24 hours). */
    public static function normalise(?array $week): ?array
    {
        if (! $week) {
            return null;
        }
        $out = [];
        foreach (array_keys(self::DAYS) as $n) {
            $out[$n] = self::day($week, $n);
        }

        return collect($out)->every(fn ($d) => $d['all_day'] && ! $d['closed']) ? null : $out;
    }

    public static function isAlwaysOpen(Store $store): bool
    {
        return self::normalise($store->opening_hours) === null;
    }

    /** "Closed today" switch is on right now. */
    public static function closedToday(Store $store, ?CarbonInterface $at = null): bool
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);

        return $store->closed_today_until !== null && $store->closed_today_until->copy()->timezone(self::TZ)->gt($at);
    }

    public static function isOpenAt(Store $store, ?CarbonInterface $at = null): bool
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        if (self::closedToday($store, $at)) {
            return false;
        }
        $hours = $store->opening_hours;
        if (self::normalise($hours) === null) {
            return true;
        }

        // Today's window, or yesterday's window that runs past midnight
        foreach ([0, 1] as $back) {
            $date = $at->copy()->subDays($back)->startOfDay();
            $d = self::day($hours, $date->isoWeekday());
            if ($d['closed']) {
                continue;
            }
            if ($d['all_day']) {
                if ($back === 0) {
                    return true;
                }
                continue;
            }
            [$start, $end] = self::window($date, $d);
            if ($at->gte($start) && $at->lt($end)) {
                return true;
            }
        }

        return false;
    }

    /** When the store opens next (null = open now or never opens — every day closed). */
    public static function nextOpening(Store $store, ?CarbonInterface $at = null): ?CarbonInterface
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        if (self::isOpenAt($store, $at)) {
            return null;
        }
        $hours = $store->opening_hours;
        // "Closed today" ends at midnight: look from then on
        $from = self::closedToday($store, $at) ? $store->closed_today_until->copy()->timezone(self::TZ)->addSecond()->startOfMinute() : $at;

        for ($i = 0; $i <= 7; $i++) {
            $date = $from->copy()->addDays($i)->startOfDay();
            $d = self::day($hours, $date->isoWeekday());
            if ($d['closed']) {
                continue;
            }
            $start = $d['all_day'] ? $date->copy() : self::window($date, $d)[0];
            if ($start->gte($from)) {
                return $start;
            }
            if ($d['all_day'] || $from->lt(self::window($date, $d)[1])) {
                return $from->copy();   // inside that window already (e.g. right when "closed today" ends)
            }
        }

        return null;
    }

    /** When today's / the current window closes (null = open 24 hours or closed now). */
    public static function closesAt(Store $store, ?CarbonInterface $at = null): ?CarbonInterface
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        if (! self::isOpenAt($store, $at) || self::normalise($store->opening_hours) === null) {
            return null;
        }
        foreach ([0, 1] as $back) {
            $date = $at->copy()->subDays($back)->startOfDay();
            $d = self::day($store->opening_hours, $date->isoWeekday());
            if ($d['closed'] || $d['all_day']) {
                continue;
            }
            [$start, $end] = self::window($date, $d);
            if ($at->gte($start) && $at->lt($end)) {
                return $end;
            }
        }

        return null;   // open all day today
    }

    /**
     * What customers see: "Open 24 hours" / "Open now · closes 6:00 PM" / "Closed · opens 8:00 AM tomorrow".
     * @return array{open: bool, always: bool, label: string, opens_at: ?string, closed_today: bool}
     */
    public static function status(Store $store, ?CarbonInterface $at = null): array
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        $open = self::isOpenAt($store, $at);
        $always = self::normalise($store->opening_hours) === null;

        if ($open) {
            $closes = self::closesAt($store, $at);
            $label = $always ? 'Open 24 hours' : ($closes ? 'Open now · closes ' . self::clock($closes) : 'Open now · all day');
            return ['open' => true, 'always' => $always && ! self::closedToday($store, $at), 'label' => $label, 'opens_at' => null, 'closed_today' => false];
        }

        $next = self::nextOpening($store, $at);

        return [
            'open'         => false,
            'always'       => false,
            'label'        => $next ? 'Closed · opens ' . self::when($next, $at) : 'Closed',
            'opens_at'     => $next ? self::when($next, $at) : null,
            'closed_today' => self::closedToday($store, $at),
        ];
    }

    /** Today's hours in words, e.g. "8:00 AM – 6:00 PM", "Open 24 hours", "Closed today". */
    public static function todayLabel(Store $store, ?CarbonInterface $at = null): string
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        if (self::closedToday($store, $at)) {
            return 'Closed today';
        }

        return self::dayLabel(self::day($store->opening_hours, $at->isoWeekday()), self::normalise($store->opening_hours) === null);
    }

    /** The week for the store page: [{day: "Monday", hours: "8:00 AM – 6:00 PM", today: bool}]. */
    public static function week(Store $store, ?CarbonInterface $at = null): array
    {
        $at = ($at ?? Carbon::now())->copy()->timezone(self::TZ);
        $always = self::normalise($store->opening_hours) === null;

        return collect(self::DAYS)->map(fn ($name, $n) => [
            'day'   => $name,
            'hours' => self::dayLabel(self::day($store->opening_hours, $n), $always),
            'today' => $n === $at->isoWeekday(),
        ])->values()->all();
    }

    /** The note on cart / checkout / the seller's order page while closed (null when open). */
    public static function closedNote(Store $store, ?CarbonInterface $at = null): ?string
    {
        $s = self::status($store, $at);
        if ($s['open']) {
            return null;
        }

        return 'This store is closed now — delivery and pick-up start when it opens'
            . ($s['opens_at'] ? " at {$s['opens_at']}" : '') . '.';
    }

    /** Everything the customer pages need in one array. */
    public static function forCustomer(Store $store, ?CarbonInterface $at = null): array
    {
        return self::status($store, $at) + ['today' => self::todayLabel($store, $at), 'closed_note' => self::closedNote($store, $at)];
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static function dayLabel(array $d, bool $always): string
    {
        return match (true) {
            $always || $d['all_day'] => 'Open 24 hours',
            $d['closed']             => 'Closed',
            default                  => self::clockStr($d['open']) . ' – ' . self::clockStr($d['close']),
        };
    }

    /** [start, end] of a day's window; a close at / before the open runs to the next day. */
    private static function window(CarbonInterface $date, array $d): array
    {
        $start = Carbon::parse($date->toDateString() . ' ' . $d['open'], self::TZ);
        $end = Carbon::parse($date->toDateString() . ' ' . $d['close'], self::TZ);
        if ($end->lte($start)) {
            $end = $end->addDay();   // K8: reassign — safe whether Carbon is mutable or immutable
        }

        return [$start, $end];
    }

    /** "8:00 AM", "8:00 AM tomorrow", "8:00 AM Monday" */
    private static function when(CarbonInterface $t, CarbonInterface $now): string
    {
        $t = $t->copy()->timezone(self::TZ);
        $days = (int) $now->copy()->startOfDay()->diffInDays($t->copy()->startOfDay());

        return self::clock($t) . match (true) {
            $days === 0 => '',
            $days === 1 => ' tomorrow',
            default     => ' ' . $t->format('l'),
        };
    }

    private static function clock(CarbonInterface $t): string
    {
        return $t->copy()->timezone(self::TZ)->format('g:i A');
    }

    private static function clockStr(string $hm): string
    {
        return Carbon::createFromFormat('H:i', $hm, self::TZ)->format('g:i A');
    }

    private static function time($v): string
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $v) ? (string) $v : '08:00';
    }
}
