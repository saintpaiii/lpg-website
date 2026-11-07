<?php

/*
 * Admin → Stores → "Before you approve": every item must be ticked before a seller application is approved.
 * The ticks, an optional note, who and when are saved in stores.approval_checks.
 */
return [
    'id_matches_owner'     => 'Valid ID is clear and the name matches the owner',
    'bir_matches'          => 'BIR certificate: business name / TIN look right',
    'permits_readable'     => 'All permits are readable, belong to this business and are not expired',
    'expiry_dates_match'   => 'Expiry dates typed by the seller match the documents',
    'address_matches_pin'  => 'Store address matches the map pin',
    'no_duplicate_concern' => 'Duplicate warnings checked (or none)',
];
