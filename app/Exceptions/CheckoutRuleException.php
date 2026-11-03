<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A checkout rule the customer can fix (not enough stock, over the seller's max per order).
 * Its message is always shown to the customer — also in production — and nothing is saved.
 */
class CheckoutRuleException extends RuntimeException
{
}
