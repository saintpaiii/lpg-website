<?php

return [
    'secret_key'     => env('PAYMONGO_SECRET_KEY', ''),
    'public_key'     => env('PAYMONGO_PUBLIC_KEY', ''),
    'webhook_secret' => env('PAYMONGO_WEBHOOK_SECRET', ''),
    'environment'    => env('PAYMONGO_ENVIRONMENT', 'sandbox'),
];
