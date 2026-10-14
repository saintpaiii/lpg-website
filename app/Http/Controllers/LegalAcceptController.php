<?php

namespace App\Http\Controllers;

use App\Services\LegalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** "Accept and continue" in the policy update popup. */
class LegalAcceptController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'document_ids'   => ['required', 'array', 'max:10'],
            'document_ids.*' => ['integer'],
        ]);

        // Only documents this user actually has pending can be accepted here
        $pending = collect(LegalService::pendingFor($request->user())['documents'] ?? [])->pluck('id');
        $ids     = $pending->intersect(array_map('intval', $data['document_ids']))->values()->all();

        if ($ids) {
            LegalService::accept($request->user(), $ids, 'update_popup', $request);
        }

        return back();
    }
}
