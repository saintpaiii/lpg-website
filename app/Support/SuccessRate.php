<?php

namespace App\Support;

/**
 * K11 — the ONE definition of a success / completion rate: of the things that have FINISHED, how many succeeded.
 * Work still in progress (deliveries assigned / picked up / in transit, orders not yet delivered or cancelled) is not a
 * failure, so it is left out of the denominator and reported on its own. Null when nothing has finished yet.
 */
class SuccessRate
{
    public static function of(int $succeeded, int $failed): ?int
    {
        $finished = $succeeded + $failed;

        return $finished > 0 ? (int) round($succeeded / $finished * 100) : null;
    }
}
