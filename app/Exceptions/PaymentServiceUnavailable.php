<?php

namespace App\Exceptions;

use RuntimeException;
use Throwable;

/**
 * PayMongo could not be reached (no connection / DNS failure / timeout).
 * The original ConnectionException is kept as the previous exception.
 */
class PaymentServiceUnavailable extends RuntimeException
{
    public const MESSAGE = "We couldn't reach the payment service. Please check your internet connection and try again in a moment.";

    public const PROVIDER_ERROR = 'The payment service had a problem. Please try again in a moment.';

    /**
     * Customer-friendly text for a PayMongo failure, or null when the error has nothing to do with PayMongo.
     */
    public static function friendlyMessage(Throwable $e): ?string
    {
        return match (true) {
            $e instanceof self => self::MESSAGE,
            $e instanceof RuntimeException && str_starts_with($e->getMessage(), '[PayMongo]') => self::PROVIDER_ERROR,
            default => null,
        };
    }
}
