<?php

/*
 * Admin → Stores → review a seller application (J3). The checklist IS the per-document review on the store page:
 * each document line is ticked when the admin Accepts it in the viewer (stores.document_reviews), plus two items.
 * Approving saves which items were accepted, the optional note, who and when in stores.approval_checks.
 */
return [
    'valid_id'             => 'Valid ID (owner) — clear, the name matches the owner and the face matches the selfie',
    'bir_permit'           => 'BIR Certificate of Registration accepted',
    'business_permit'      => "Business / Mayor's Permit accepted (valid until confirmed)",
    'fsic_permit'          => 'FSIC accepted (valid until confirmed)',
    'doe_lpg_license'      => 'DOE License to Operate accepted (valid until confirmed)',
    'dti_sec_registration' => 'DTI / SEC registration accepted',
    'address_pin'          => 'Store address matches the map pin',
    'duplicates'           => 'Duplicate warnings checked (or none)',

    // Labels of the checklist before J3 — only to show the history of stores approved with it
    'legacy' => [
        'id_matches_owner'     => 'Valid ID is clear and the name matches the owner',
        'bir_matches'          => 'BIR certificate and DTI/SEC registration: business name / TIN look right',
        'permits_readable'     => 'All permits are readable, belong to this business and are not expired',
        'expiry_dates_match'   => 'Expiry dates typed by the seller match the documents',
        'address_matches_pin'  => 'Store address matches the map pin',
        'no_duplicate_concern' => 'Duplicate warnings checked (or none)',
    ],
];
