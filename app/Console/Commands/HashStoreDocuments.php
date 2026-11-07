<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Models\VerificationRequest;
use App\Services\DuplicateStoreService;
use Illuminate\Console\Command;

/**
 * One-off: SHA-256 of each existing store's required documents (valid_id excluded) into stores.document_hashes,
 * so the duplicate check can spot a document reused by a new applicant. Missing files are skipped (demo paths).
 * New uploads are hashed when they arrive — this never runs on a request.
 */
class HashStoreDocuments extends Command
{
    protected $signature   = 'stores:hash-documents {--force : Re-hash stores that already have hashes}';
    protected $description = 'Hash the required documents of existing stores (duplicate-store check).';

    public function handle(): int
    {
        $done = $skipped = $missing = 0;

        Store::withTrashed()->orderBy('id')->chunkById(100, function ($stores) use (&$done, &$skipped, &$missing) {
            foreach ($stores as $store) {
                if ($store->document_hashes && ! $this->option('force')) {
                    $skipped++;
                    continue;
                }
                $application = VerificationRequest::withTrashed()->where('user_id', $store->user_id)
                    ->where('type', 'seller_application')->latest()->first();

                $hashes = [];
                foreach (DuplicateStoreService::hashedTypes() as $type) {
                    $path = $store->{$type} ?: $application?->{"{$type}_path"};
                    if ($h = DuplicateStoreService::hashStored($path)) {
                        $hashes[$type] = $h;
                    } elseif ($path) {
                        $missing++;
                    }
                }
                $store->forceFill(['document_hashes' => $hashes ?: null])->saveQuietly();
                $done++;
            }
        });

        $this->info("Stores hashed: {$done} · Already had hashes: {$skipped} · Files not found (skipped): {$missing}");

        return self::SUCCESS;
    }
}
