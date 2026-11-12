<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * First-time tutorials: remembers on the ACCOUNT which tours a user finished or skipped (so a tour runs once, also
 * on another device), the "Show tutorials automatically" switch, and "Reset all tutorials" (Help page).
 * Answers with JSON — the page updates its own copy (no reload).
 */
class TutorialController extends Controller
{
    /** POST /tutorials/{key}/done */
    public function done(Request $request, string $key): JsonResponse
    {
        return $this->mark($request, $key, 'done');
    }

    /** POST /tutorials/{key}/skip */
    public function skip(Request $request, string $key): JsonResponse
    {
        return $this->mark($request, $key, 'skipped');
    }

    /** POST /tutorials/reset — every tour (and the getting-started cards) shows again */
    public function reset(Request $request): JsonResponse
    {
        $request->user()->forceFill(['tutorials' => null])->save();

        return response()->json(['tutorials' => (object) [], 'tutorials_enabled' => (bool) $request->user()->tutorials_enabled]);
    }

    /** PUT /tutorials/settings {enabled} */
    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $request->user()->forceFill(['tutorials_enabled' => (bool) $data['enabled']])->save();

        return response()->json(['tutorials' => (object) ($request->user()->tutorials ?? []), 'tutorials_enabled' => (bool) $data['enabled']]);
    }

    private function mark(Request $request, string $key, string $field): JsonResponse
    {
        $user = $request->user();
        $all  = (array) ($user->tutorials ?? []);
        $entry = (array) ($all[$key] ?? []);
        $entry[$field] = now()->toIso8601String();
        $all[$key] = $entry + ['done' => null, 'skipped' => null];

        // Never grows without limit (keys come from the page)
        if (count($all) > 300) {
            $all = array_slice($all, -300, null, true);
        }

        $user->forceFill(['tutorials' => $all])->save();

        return response()->json(['key' => $key, 'entry' => $all[$key]]);
    }
}
