<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use App\Services\LegalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Terms & Policies: edit a draft, preview it, publish it as the next version.
 * Published versions are never changed. Platform admins only — the 'admin' route middleware also
 * lets sellers in, so every action checks isAdmin() itself.
 */
class LegalDocumentController extends Controller
{
    public function index(Request $request): Response
    {
        $this->onlyAdmins($request);

        $docs = collect(LegalDocument::TYPES)->map(function ($label, $type) {
            $current = LegalService::current($type);

            return [
                'type'           => $type,
                'label'          => $label,
                'public_url'     => LegalDocument::PUBLIC_PATHS[$type],
                'version'        => $current?->version,
                'effective_date' => $current ? $this->date($current) : null,
                'accepted_count' => $current ? LegalAcceptance::where('legal_document_id', $current->id)->count() : 0,
                'has_draft'      => LegalDocument::draft()->where('type', $type)->exists(),
            ];
        })->values();

        return Inertia::render('admin/legal-index', ['documents' => $docs]);
    }

    public function edit(Request $request, string $type): Response
    {
        $this->onlyAdmins($request);

        $draft    = LegalDocument::draft()->where('type', $type)->first();
        $current  = LegalService::current($type);
        $versions = LegalDocument::published()->where('type', $type)
            ->with('publisher:id,name')->withCount('acceptances')
            ->orderByDesc('version')->get();

        // Without a draft the form starts from the current published text (publishing creates a new version)
        $source = $draft ?? $current;

        return Inertia::render('admin/legal-edit', [
            'type'         => $type,
            'label'        => LegalDocument::TYPES[$type],
            'public_url'   => LegalDocument::PUBLIC_PATHS[$type],
            'has_draft'    => (bool) $draft,
            'next_version' => ((int) $versions->max('version')) + 1,
            'audience'     => $type === 'seller_terms' ? 'Sellers' : ($type === 'customer_terms' ? 'Customers' : 'Customers and sellers'),
            'form'         => [
                'title'          => $source?->title ?? LegalDocument::TYPES[$type],
                'body'           => $source?->body ?? '',
                'change_summary' => $draft?->change_summary ?? '',
                'is_major'       => $draft ? (bool) $draft->is_major : true,
            ],
            'draft_saved_at' => $draft?->updated_at?->timezone('Asia/Manila')->format('M d, Y g:i A'),
            'versions'       => $versions->map(fn (LegalDocument $d) => [
                'id'             => $d->id,
                'version'        => $d->version,
                'published_date' => $this->date($d),
                'published_by'   => $d->publisher?->name ?? 'System',
                'is_major'       => (bool) $d->is_major,
                'change_summary' => $d->change_summary,
                'accepted_count' => $d->acceptances_count,
                'is_current'     => $d->id === $current?->id,
            ])->values(),
        ]);
    }

    public function saveDraft(Request $request, string $type): RedirectResponse
    {
        $this->onlyAdmins($request);
        $data = $this->validated($request, publishing: false);

        $this->upsertDraft($request, $type, $data);

        return back()->with('success', 'Draft saved. The public page has not changed.');
    }

    public function publish(Request $request, string $type): RedirectResponse
    {
        $this->onlyAdmins($request);
        $data = $this->validated($request, publishing: true);

        if (! LegalDocument::draft()->where('type', $type)->exists()) {
            return back()->with('error', 'Save a draft first, then publish it.');
        }
        $draft = $this->upsertDraft($request, $type, $data);   // publish exactly what is on screen
        $doc   = LegalService::publish($draft, $request->user());

        return redirect()->route('admin.legal.edit', $type)->with('success', $doc->is_major
            ? "Version {$doc->version} published. Users will be asked to accept it the next time they open the app."
            : "Version {$doc->version} published as a minor update. No one will be asked to accept again.");
    }

    public function discardDraft(Request $request, string $type): RedirectResponse
    {
        $this->onlyAdmins($request);

        LegalDocument::draft()->where('type', $type)->delete();

        return redirect()->route('admin.legal.edit', $type)->with('success', 'Draft discarded.');
    }

    public function preview(Request $request): JsonResponse
    {
        $this->onlyAdmins($request);
        $data = $request->validate(['body' => ['required', 'string', 'max:100000']]);

        return response()->json(['html' => LegalService::render(new LegalDocument(['body' => $data['body']]))]);
    }

    public function showVersion(Request $request, string $type, LegalDocument $document): Response
    {
        $this->onlyAdmins($request);
        abort_unless($document->type === $type && $document->published_at !== null, 404);

        return Inertia::render('admin/legal-version', [
            'type'     => $type,
            'label'    => LegalDocument::TYPES[$type],
            'document' => [
                'title'          => $document->title,
                'version'        => $document->version,
                'published_date' => $this->date($document),
                'published_by'   => $document->publisher?->name ?? 'System',
                'is_major'       => (bool) $document->is_major,
                'change_summary' => $document->change_summary,
                'html'           => LegalService::render($document),
            ],
        ]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function onlyAdmins(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403);
    }

    private function validated(Request $request, bool $publishing): array
    {
        return $request->validate([
            'title'          => ['required', 'string', 'max:255'],
            'body'           => ['required', 'string', 'max:100000'],
            'change_summary' => [$publishing ? 'required_if:is_major,true,1' : 'nullable', 'nullable', 'string', 'max:500'],
            'is_major'       => ['required', 'boolean'],
        ], [
            'change_summary.required_if' => 'Please describe what changed — users see this in the popup.',
        ]);
    }

    /** The one draft of this type (created when missing). */
    private function upsertDraft(Request $request, string $type, array $data): LegalDocument
    {
        $draft = LegalDocument::draft()->where('type', $type)->first()
            ?? new LegalDocument(['type' => $type, 'created_by' => $request->user()->id]);
        $draft->fill([
            'title'          => $data['title'],
            'body'           => $data['body'],
            'change_summary' => $data['change_summary'] ?? null,
            'is_major'       => (bool) $data['is_major'],
        ])->save();

        return $draft;
    }

    private function date(LegalDocument $doc): string
    {
        return $doc->published_at->timezone('Asia/Manila')->format('M d, Y');
    }
}
