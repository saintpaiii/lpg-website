<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\UserReport;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class UserReportController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'pending');
        $search = $request->get('search', '');

        $query = UserReport::with(['reporter', 'reported', 'reportedStore', 'order', 'resolver'])
            ->when($search, fn ($q) => $q->where(function ($q2) use ($search) {
                $q2->whereHas('reporter', fn ($u) => $u->where('name', 'like', "%{$search}%"))
                   ->orWhere('subject', 'like', "%{$search}%");
            }))
            ->latest();

        $items = match ($tab) {
            'pending'      => (clone $query)->where('status', 'pending')->paginate(20),
            'under_review' => (clone $query)->where('status', 'under_review')->paginate(20),
            'resolved'     => (clone $query)->whereIn('status', ['resolved', 'dismissed'])->paginate(20),
            default        => (clone $query)->paginate(20),
        };

        $counts = [
            'pending'      => UserReport::where('status', 'pending')->count(),
            'under_review' => UserReport::where('status', 'under_review')->count(),
            'resolved'     => UserReport::whereIn('status', ['resolved', 'dismissed'])->count(),
            'all'          => UserReport::count(),
        ];

        $transform = fn (UserReport $r) => [
            'id'               => $r->id,
            'type'             => $r->type,
            'category'         => $r->category,
            'subject'          => $r->subject,
            'description'      => $r->description,
            'status'           => $r->status,
            'admin_notes'      => $r->admin_notes,
            'resolution'       => $r->resolution,
            'resolved_at'      => $r->resolved_at?->format('M d, Y g:i A'),
            'created_at'       => $r->created_at->format('M d, Y g:i A'),
            'evidence_urls'    => collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
            'reporter'         => $r->reporter ? ['id' => $r->reporter->id, 'name' => $r->reporter->name, 'email' => $r->reporter->email] : null,
            'reported'         => $r->reported  ? ['id' => $r->reported->id,  'name' => $r->reported->name,  'email' => $r->reported->email]  : null,
            'reported_store'   => $r->reportedStore ? ['id' => $r->reportedStore->id, 'name' => $r->reportedStore->store_name] : null,
            'order_number'     => $r->order?->order_number,
            'resolver'         => $r->resolver  ? ['name' => $r->resolver->name] : null,
        ];

        return Inertia::render('admin/user-reports', [
            'items'  => $items->through($transform),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function update(Request $request, UserReport $userReport): RedirectResponse
    {
        $data = $request->validate([
            'status'      => 'required|in:pending,under_review,resolved,dismissed',
            'admin_notes' => 'nullable|string|max:2000',
            'resolution'  => 'nullable|string|max:2000',
        ]);

        $wasResolved = in_array($userReport->status, ['resolved', 'dismissed']);
        $isNowResolved = in_array($data['status'], ['resolved', 'dismissed']);

        $userReport->update([
            'status'      => $data['status'],
            'admin_notes' => $data['admin_notes'] ?? $userReport->admin_notes,
            'resolution'  => $data['resolution']  ?? $userReport->resolution,
            'resolved_at' => ($isNowResolved && !$wasResolved) ? now() : $userReport->resolved_at,
            'resolved_by' => ($isNowResolved && !$wasResolved) ? $request->user()->id : $userReport->resolved_by,
        ]);

        // Notify reporter when resolved
        if ($isNowResolved && !$wasResolved && $userReport->reporter_id) {
            $label = $data['status'] === 'resolved' ? 'resolved' : 'dismissed';
            NotificationService::send(
                $userReport->reporter_id,
                'report_resolved',
                'Your Report Has Been ' . ucfirst($label),
                "Your report \"{$userReport->subject}\" has been {$label}.",
                ['report_id' => $userReport->id]
            );
        }

        return back()->with('success', 'Report updated.');
    }

    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $reports = UserReport::with(['reporter', 'reported', 'reportedStore', 'order'])
            ->orderBy('created_at', 'desc')
            ->get();

        $headers = [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => 'attachment; filename="user-reports-' . now()->format('Y-m-d') . '.csv"',
        ];

        return response()->stream(function () use ($reports) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['ID', 'Type', 'Category', 'Subject', 'Status', 'Reporter', 'Reported', 'Store', 'Order', 'Created At', 'Resolved At']);
            foreach ($reports as $r) {
                fputcsv($out, [
                    $r->id,
                    $r->type,
                    $r->category,
                    $r->subject,
                    $r->status,
                    $r->reporter?->name,
                    $r->reported?->name,
                    $r->reportedStore?->store_name,
                    $r->order?->order_number,
                    $r->created_at->format('Y-m-d H:i'),
                    $r->resolved_at?->format('Y-m-d H:i'),
                ]);
            }
            fclose($out);
        }, 200, $headers);
    }
}
