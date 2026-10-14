<?php

namespace App\Console\Commands;

use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use Database\Seeders\LegalDocumentSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * TEST DATABASES ONLY: wipe every Terms / Policy version and agreement and recreate version 1
 * from resources/legal/*.md. Users are simply asked to accept again through the popup.
 * Touches only legal_acceptances and legal_documents.
 */
class LegalReseedV1 extends Command
{
    protected $signature   = 'legal:reseed-v1';
    protected $description = 'Delete all policy versions and agreements and recreate version 1 from resources/legal (test databases only).';

    public function handle(): int
    {
        $this->line('Policy documents (all versions and drafts): ' . LegalDocument::count());
        $this->line('Policy agreements: ' . LegalAcceptance::count());

        if (! $this->confirm('This deletes ALL policy versions and agreements and recreates version 1. Continue?')) {
            $this->info('Nothing changed.');
            return self::SUCCESS;
        }

        DB::transaction(function () {
            LegalAcceptance::query()->delete();   // first: documents are restrictOnDelete for acceptances
            LegalDocument::query()->delete();
            (new LegalDocumentSeeder())->run();
        });

        $this->info('Done. Now: ' . LegalDocument::published()->orderBy('type')->get(['type', 'version'])
            ->map(fn ($d) => "{$d->type} v{$d->version}")->implode(', ') . '.');

        return self::SUCCESS;
    }
}
