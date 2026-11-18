<?php

use App\Models\LegalDocument;
use App\Services\LegalService;
use Illuminate\Support\Facades\DB;

uses(Tests\Concerns\BuildsLpgWorld::class);

const K7_OLD_TERMS = 'upload valid documents: a valid ID, BIR registration, Business Permit, Fire Safety Inspection Certificate (FSIC), DOE LPG license and LTO permit.';

test('the seeded Terms / Privacy Policy list exactly the documents the form asks for (no "LTO permit")', function () {
    foreach (['seller_terms', 'privacy_policy'] as $f) {
        $md = file_get_contents(resource_path("legal/{$f}.md"));
        expect($md)->not->toContain('LTO permit')->not->toContain('DOE LPG license')
            ->toContain("a valid government ID with a live selfie, BIR Certificate of Registration, Business / Mayor's Permit, Fire Safety Inspection Certificate (FSIC), DOE License to Operate (LPG retail outlet), and DTI Business Name certificate (or SEC registration for corporations / partnerships).");
    }
});

test('the K7 migration publishes a new MINOR version (old one kept); sellers who accepted the old one are not asked again; down() removes it', function () {
    $store = $this->makeStore();
    $owner = \App\Models\User::find($store->user_id);
    DB::table('legal_documents')->where('type', 'seller_terms')->delete();
    $v1 = LegalDocument::forceCreate(['type' => 'seller_terms', 'version' => 1, 'title' => 'Seller Terms', 'is_major' => true,
        'body' => "## 1. Eligibility\n- You must operate a legal LPG business in Cavite and " . K7_OLD_TERMS . "\n", 'published_at' => now()->subMonth()]);
    LegalService::accept($owner, [$v1->id], 'registration');
    $pendingBefore = collect(LegalService::pendingFor($owner)['documents'] ?? LegalService::pendingFor($owner) ?? [])->pluck('type')->all();

    $migration = require database_path('migrations/2026_11_24_000010_k7.php');
    $migration->up();

    $current = LegalService::current('seller_terms');
    expect($current->version)->toBe(2)->and($current->is_major)->toBeFalse()
        ->and($current->body)->toContain('DTI Business Name certificate')->not->toContain('LTO permit')
        ->and(LegalDocument::find($v1->id)->body)->toContain('LTO permit');                    // history kept
    $pendingAfter = collect(LegalService::pendingFor($owner)['documents'] ?? LegalService::pendingFor($owner) ?? [])->pluck('type')->all();
    expect($pendingAfter)->toBe($pendingBefore)->not->toContain('seller_terms');

    // Running it again changes nothing (the latest no longer has the old sentence)
    $migration->up();
    expect(LegalDocument::where('type', 'seller_terms')->count())->toBe(2);

    $migration->down();
    expect(LegalService::current('seller_terms')->id)->toBe($v1->id);
});
