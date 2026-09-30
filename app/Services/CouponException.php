<?php

namespace App\Services;

/** A coupon cannot be applied — the message is shown to the customer. */
class CouponException extends \RuntimeException
{
}
