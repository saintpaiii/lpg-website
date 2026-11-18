<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * K7 — the seller document list in the Seller Terms and the Privacy Policy now matches the registration form
 * (valid ID + live selfie, BIR COR, Business / Mayor's Permit, FSIC, DOE License to Operate, DTI / SEC). There was
 * never a separate "LTO permit": the DOE License to Operate IS the LTO (RA 11592).
 *
 * Published versions are never edited: each document gets a NEW MINOR version (is_major = false), so the old version
 * stays in the history and nobody is asked to accept again (LegalService only re-asks on a major version — this is a
 * wording correction; the form already required exactly these documents). Drafts get the same wording.
 * A fresh install skips this (no published documents yet) — the seeder reads the updated resources/legal/*.md.
 */
return new class extends Migration
{
    private const SUMMARY = 'Seller document list corrected to match the application form (K7).';

    private const REPLACE = [
        'seller_terms' => [
            'upload valid documents: a valid ID, BIR registration, Business Permit, Fire Safety Inspection Certificate (FSIC), DOE LPG license and LTO permit.',
            "upload valid documents: a valid government ID with a live selfie, BIR Certificate of Registration, Business / Mayor's Permit, Fire Safety Inspection Certificate (FSIC), DOE License to Operate (LPG retail outlet), and DTI Business Name certificate (or SEC registration for corporations / partnerships).",
        ],
        'privacy_policy' => [
            'Business documents: valid ID, BIR registration, Business Permit, FSIC, DOE LPG license and LTO permit.',
            "Business documents: a valid government ID with a live selfie, BIR Certificate of Registration, Business / Mayor's Permit, Fire Safety Inspection Certificate (FSIC), DOE License to Operate (LPG retail outlet), and DTI Business Name certificate (or SEC registration for corporations / partnerships).",
        ],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('legal_documents')) {
            return;
        }
        $now = now();
        foreach (self::REPLACE as $type => [$old, $new]) {
            $latest = DB::table('legal_documents')->where('type', $type)->whereNotNull('published_at')->orderByDesc('version')->first();
            if ($latest && str_contains((string) $latest->body, $old)) {
                DB::table('legal_documents')->insert([
                    'type'           => $type,
                    'version'        => (int) DB::table('legal_documents')->where('type', $type)->max('version') + 1,
                    'title'          => $latest->title,
                    'body'           => str_replace($old, $new, (string) $latest->body),
                    'change_summary' => self::SUMMARY,
                    'is_major'       => false,
                    'published_at'   => $now,
                    'published_by'   => null,
                    'created_by'     => null,
                    'created_at'     => $now,
                    'updated_at'     => $now,
                ]);
            }
            foreach (DB::table('legal_documents')->where('type', $type)->whereNull('published_at')->get(['id', 'body']) as $draft) {
                if (str_contains((string) $draft->body, $old)) {
                    DB::table('legal_documents')->where('id', $draft->id)->update(['body' => str_replace($old, $new, (string) $draft->body), 'updated_at' => $now]);
                }
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('legal_documents')) {
            return;
        }
        foreach (self::REPLACE as $type => [$old, $new]) {
            // The K7 versions go; one already accepted by someone is kept (acceptances are proof and can't be moved)
            $ids = DB::table('legal_documents')->where('type', $type)->where('change_summary', self::SUMMARY)->pluck('id');
            $accepted = Schema::hasTable('legal_acceptances')
                ? DB::table('legal_acceptances')->whereIn('legal_document_id', $ids)->pluck('legal_document_id')->unique()
                : collect();
            DB::table('legal_documents')->whereIn('id', $ids->diff($accepted))->delete();
            foreach (DB::table('legal_documents')->where('type', $type)->whereNull('published_at')->get(['id', 'body']) as $draft) {
                if (str_contains((string) $draft->body, $new)) {
                    DB::table('legal_documents')->where('id', $draft->id)->update(['body' => str_replace($new, $old, (string) $draft->body)]);
                }
            }
        }
    }
};
