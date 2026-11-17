<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A checkout rule the customer can fix (not enough stock, over the seller's max per order).
 * Its message is always shown to the customer — also in production — and nothing is saved.
 */
class CheckoutRuleException extends RuntimeException
{
    /** J6: the order no vehicle could carry — saved as a vehicle_capacity_miss AFTER the checkout transaction rolled back. */
    public ?array $capacityMiss = null;

    public function withCapacityMiss(int $storeId, array $load, string $reason): static
    {
        $this->capacityMiss = ['store_id' => $storeId, 'kg' => $load['kg'], 'tanks' => $load['tanks'], 'by_size' => $load['by_size'] ?? [], 'reason' => $reason];

        return $this;
    }
}
