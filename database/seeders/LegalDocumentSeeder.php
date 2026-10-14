<?php

namespace Database\Seeders;

use App\Models\LegalDocument;
use Illuminate\Database\Seeder;

/**
 * Version 1 of each Terms / Policy document, from resources/legal/*.md.
 * Safe on an existing database: a type that already has any row is left alone.
 */
class LegalDocumentSeeder extends Seeder
{
    public function run(): void
    {
        foreach (LegalDocument::TYPES as $type => $label) {
            if (LegalDocument::where('type', $type)->exists()) {
                continue;
            }
            LegalDocument::create([
                'type'           => $type,
                'version'        => 1,
                'title'          => $label,
                'body'           => file_get_contents(resource_path("legal/{$type}.md")),
                'change_summary' => 'First version',
                'is_major'       => true,
                'published_at'   => now(),
                'published_by'   => null,
                'created_by'     => null,
            ]);
        }
    }
}
