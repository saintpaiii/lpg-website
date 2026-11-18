<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * K6 — "can't confirm" stock messages (StockService::assertAvailable): "Only expired cylinders left for …",
 * "Insufficient stock for …", "No inventory record for …".
 *
 * Web / Inertia requests go back to the page with the sentence as a red toast (flash 'error'); JSON / API callers get
 * a 422 with { message }. Thrown inside DB::transaction(), so nothing of the confirm is saved.
 */
class StockUnavailableException extends RuntimeException
{
    public function render(Request $request): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => $this->getMessage()], 422);
        }

        return back()->with('error', $this->getMessage());
    }
}
