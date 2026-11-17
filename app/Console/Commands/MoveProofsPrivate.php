<?php

namespace App\Console\Commands;

use App\Models\DeliveryProof;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * J6: move delivery proof photos saved before proofs became private from the 'public' disk (web-accessible under
 * /storage/delivery_proofs/…) to the private 'local' disk. Paths in the database stay the same; DeliveryProof::photo_url
 * then serves them through the authorized documents route. DRY RUN by default — pass --force to move.
 */
class MoveProofsPrivate extends Command
{
    protected $signature   = 'proofs:move-private {--force : Actually move the files (default is a dry run)}';
    protected $description = 'Move delivery proof photos from the public disk to the private disk (dry run unless --force).';

    public function handle(): int
    {
        $public = Storage::disk('public');
        $local  = Storage::disk('local');
        $force  = (bool) $this->option('force');
        $moved = $already = $missing = $failed = 0;

        DeliveryProof::whereNotNull('photo_path')->select(['id', 'photo_path'])->orderBy('id')
            ->chunkById(500, function ($rows) use ($public, $local, $force, &$moved, &$already, &$missing, &$failed) {
                foreach ($rows->pluck('photo_path')->unique() as $path) {
                    if (! $public->exists($path)) {
                        $local->exists($path) ? $already++ : $missing++;
                        continue;
                    }
                    if (! $force) {
                        $moved++;
                        continue;
                    }
                    if (! $local->exists($path)) {
                        $local->put($path, $public->get($path));
                    }
                    if ($local->exists($path) && $local->size($path) === $public->size($path)) {
                        $public->delete($path);
                        $moved++;
                    } else {
                        $failed++;
                        $this->warn("Could not copy {$path} — left on the public disk.");
                    }
                }
            });

        $this->info(($force ? 'Moved' : '[dry run] would move') . " {$moved} proof photo(s) to private storage; {$already} already private; {$missing} missing (skipped)"
            . ($failed ? "; {$failed} failed" : '') . '.' . ($force ? '' : ' Run with --force to move them.'));

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
