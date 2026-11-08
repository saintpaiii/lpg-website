<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\VerificationRequest;
use App\Services\DocumentOcrCheck;
use App\Services\DocumentOcrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * "Auto-read" of the VALID ID on a verification (customer ID verification or seller application).
 * Reads valid_id_path only — the selfie is never sent. Warnings only; the admin decides (faces are checked by eye).
 * Route middleware: permission:verifications.view, throttle:20,1.
 */
class VerificationOcrController extends Controller
{
    public function read(Request $request, VerificationRequest $verification): JsonResponse
    {
        abort_unless(in_array($verification->type, ['customer_id_verification', 'seller_application'], true), 404);

        $verification->loadMissing('user');
        $path = $verification->valid_id_path;

        if (! $path || ! $verification->user) {
            $result = DocumentOcrCheck::unavailable('missing');
        } elseif (! Storage::disk('local')->exists($path) && ! Storage::disk('public')->exists($path)) {
            $result = DocumentOcrCheck::unavailable('missing');
        } else {
            $disk = Storage::disk('local')->exists($path) ? 'local' : 'public';
            $text = DocumentOcrService::read(Storage::disk($disk)->path($path));
            $result = $text === null
                ? DocumentOcrCheck::unavailable(DocumentOcrService::$lastProblem ?? 'error')
                : DocumentOcrCheck::analyzeId($verification->user, $text);
        }

        $verification->forceFill(['ocr' => $result])->save();

        return response()->json(['key' => (string) $verification->id, 'ocr' => DocumentOcrController::present($result)]);
    }
}
