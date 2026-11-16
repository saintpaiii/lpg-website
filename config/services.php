<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Admin "Auto-read" of seller documents (warnings only). No key → skipped silently.
    'ocr_space' => [
        'key' => env('OCR_SPACE_API_KEY'),
        'url' => 'https://api.ocr.space/parse/image',
    ],

    // Face++ Compare (ID / driver's license vs live selfie). No key → "skipped" (admin reviews).
    // FACEPP_FAKE=pass|fail → no API call at all (demo / tests): pass = 95%, fail = 30%.
    'facepp' => [
        'key'      => env('FACEPP_API_KEY'),
        'secret'   => env('FACEPP_API_SECRET'),
        'endpoint' => env('FACEPP_ENDPOINT', 'https://api-us.faceplusplus.com/facepp/v3/compare'),
        'timeout'  => 15,
        'fake'     => env('FACEPP_FAKE'),
    ],

    'google' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect'      => env('GOOGLE_REDIRECT_URI'),
    ],

];
