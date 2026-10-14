<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Move IDs, selfies and permits uploaded before documents became private from the 'public' disk
 * (web-accessible) to the 'local' disk. Paths in the database stay the same.
 */
class MakeDocumentsPrivate extends Command
{
    protected $signature   = 'documents:make-private {--dry-run : Only count, do not move anything}';
    protected $description = 'Move IDs, selfies and permits from the public disk to the private disk.';

    private const COLUMNS = [
        User::class                => ['valid_id', 'valid_id_path', 'selfie_path'],
        VerificationRequest::class => ['valid_id_path', 'selfie_path', 'bir_permit_path', 'business_permit_path', 'fsic_permit_path', 'doe_lpg_license_path', 'lto_permit_path'],
        Store::class               => ['bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'lto_permit'],
    ];

    public function handle(): int
    {
        $public = Storage::disk('public');
        $local  = Storage::disk('local');
        $dry    = (bool) $this->option('dry-run');
        $paths  = [];

        foreach (self::COLUMNS as $model => $columns) {
            $model::withTrashed()->select($columns)->chunk(500, function ($rows) use ($columns, &$paths) {
                foreach ($rows as $row) {
                    foreach ($columns as $col) {
                        if ($row->{$col}) {
                            $paths[$row->{$col}] = true;   // the same file can be referenced from several rows
                        }
                    }
                }
            });
        }

        $moved = $already = $missing = $failed = 0;
        foreach (array_keys($paths) as $path) {
            if ($local->exists($path) && ! $public->exists($path)) { $already++; continue; }
            if (! $public->exists($path)) { $local->exists($path) ? $already++ : $missing++; continue; }
            if ($dry) { $moved++; continue; }

            $local->put($path, $public->get($path));
            if ($local->exists($path) && $local->size($path) === $public->size($path)) {
                $public->delete($path);
                $moved++;
            } else {
                $failed++;
                $this->warn("Could not copy {$path} — left on the public disk.");
            }
        }

        $this->info(($dry ? '[dry run] would move' : 'Moved') . " {$moved} file(s) to private storage; {$already} already private; {$missing} missing (skipped)"
            . ($failed ? "; {$failed} failed" : '') . '.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
