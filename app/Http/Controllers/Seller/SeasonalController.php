<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\SalesHistory;
use App\Services\SalesHistoryDemoService;
use App\Services\SalesHistoryImportService;
use App\Services\StaffAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * J8 — Seller DSS → Seasonal tab: "Import past sales" (CSV preview → confirm), the import list, the template and
 * "Remove demo history". The routes sit behind module:dss + plan.feature:dss; writes need DSS full access
 * (dss.manage) — the owner always has it. Removing demo history is the owner's only.
 */
class SeasonalController extends Controller
{
    private const DIR = 'sales-imports';

    private function store(Request $request)
    {
        return $request->attributes->get('seller_store');
    }

    /** What this person may do on the Seasonal tab. */
    public static function abilities($user): array
    {
        $owner = $user->role === 'seller';

        return ['import' => $owner || StaffAccess::can($user, 'dss.manage'), 'owner' => $owner];
    }

    public function template(Request $request): Response
    {
        return response(SalesHistoryImportService::template($this->store($request)), 200, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="past-sales-template.csv"',
        ]);
    }

    /** Step 1: upload → preview (first 20 rows, counts per problem with row numbers). The file waits privately for step 2. */
    public function preview(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:' . (int) config('forecast.import.max_kb')], [
            'file.required' => 'Choose a CSV file.', 'file.mimes' => 'Upload a .csv file.', 'file.max' => 'The file can be at most 2 MB.',
        ]);
        $store = $this->store($request);
        $token = (string) Str::uuid();
        $path = $request->file('file')->storeAs(self::DIR, "{$token}.csv", 'local');
        $result = SalesHistoryImportService::parse($store, Storage::disk('local')->path($path));
        $request->session()->put("sales_import.{$token}", $store->id);

        return response()->json(['token' => $token] + collect($result)->except('valid')->all());
    }

    /** Step 2: import the valid rows of the previewed file. */
    public function import(Request $request): RedirectResponse
    {
        $data = $request->validate(['token' => 'required|uuid']);
        $store = $this->store($request);
        $path = self::DIR . "/{$data['token']}.csv";
        if ((int) $request->session()->get("sales_import.{$data['token']}") !== $store->id || ! Storage::disk('local')->exists($path)) {
            return back()->with('error', 'That preview expired — upload the file again.');
        }
        $result = SalesHistoryImportService::parse($store, Storage::disk('local')->path($path));
        $batch = SalesHistoryImportService::import($store, $result['valid'], $request->user()->id);
        Storage::disk('local')->delete($path);
        $request->session()->forget("sales_import.{$data['token']}");

        $skipped = $result['rows'] - $result['counts']['valid'];

        return back()->with('success', number_format($result['counts']['valid']) . ' row(s) of past sales imported'
            . ($skipped > 0 ? " ({$skipped} skipped)" : '') . '.')->with('import_batch', $batch);
    }

    public function destroyImport(Request $request, string $batch): RedirectResponse
    {
        $store = $this->store($request);
        abort_unless(SalesHistory::where('store_id', $store->id)->where('source', 'import')->where('import_batch', $batch)->exists(), 403);
        $n = SalesHistory::where('store_id', $store->id)->where('source', 'import')->where('import_batch', $batch)->delete();

        return back()->with('success', "Import deleted ({$n} row(s) removed).");
    }

    public function destroyDemo(Request $request): RedirectResponse
    {
        if ($request->user()->role !== 'seller') {
            return back()->with('error', 'Only the store owner can remove the demo history.');
        }
        $n = SalesHistoryDemoService::remove($this->store($request));

        return back()->with('success', $n ? 'Demo history removed.' : 'There was no demo history.');
    }
}
