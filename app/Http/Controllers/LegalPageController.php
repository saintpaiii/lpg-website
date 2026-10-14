<?php

namespace App\Http\Controllers;

use App\Models\LegalDocument;
use App\Services\LegalService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Public Terms / Policy pages: /terms, /seller-terms, /privacy (optional ?version=N for an older published version). */
class LegalPageController extends Controller
{
    public function show(Request $request): Response
    {
        $type    = array_search('/' . ltrim($request->path(), '/'), LegalDocument::PUBLIC_PATHS, true);
        abort_unless($type, 404);
        $current = LegalService::current($type);

        $doc = $current;
        if ($request->filled('version')) {
            $doc = LegalDocument::published()->where('type', $type)->where('version', (int) $request->query('version'))->first();
            abort_unless($doc, 404);
        }

        return Inertia::render('legal/show', [
            'type'     => $type,
            'label'    => LegalDocument::TYPES[$type],
            'document' => $doc ? [
                'title'          => $doc->title,
                'version'        => $doc->version,
                'effective_date' => $doc->published_at->timezone('Asia/Manila')->format('M d, Y'),
                'html'           => LegalService::render($doc),
                'is_current'     => $doc->id === $current?->id,
            ] : null,
            'current_version' => $current?->version,
            'links' => collect(LegalDocument::PUBLIC_PATHS)
                ->map(fn ($path, $t) => ['type' => $t, 'label' => LegalDocument::TYPES[$t], 'url' => $path])
                ->values(),
        ]);
    }
}
