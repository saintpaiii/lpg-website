<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Order;
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
        $reports = UserReport::with(['reportedStore', 'order'])
            ->where('reporter_id', $request->user()->id)
            ->latest()
            ->paginate(20);

        return Inertia::render('customer/reports', [
            'reports' => $reports->through(fn (UserReport $r) => [
                'id'             => $r->id,
                'type'           => $r->type,
                'category'       => $r->category,
                'subject'        => $r->subject,
                'description'    => $r->description,
                'status'         => $r->status,
                'resolution'     => $r->resolution,
                'resolved_at'    => $r->resolved_at?->format('M d, Y'),
                'created_at'     => $r->created_at->format('M d, Y'),
                'order_number'   => $r->order?->order_number,
                'store_name'     => $r->reportedStore?->store_name,
                'evidence_urls'  => collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
            ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'order_id'            => 'nullable|integer|exists:orders,id',
            'reported_store_id'   => 'required|integer|exists:stores,id',
            'category'            => 'required|in:fraud,fake_product,rude_behavior,non_delivery,overpricing,harassment,counterfeit,other',
            'subject'             => 'required|string|max:255',
            'description'         => 'required|string|max:5000',
            'evidence'            => 'nullable|array|max:5',
            'evidence.*'          => 'file|mimes:jpg,jpeg,png,webp,mp4,pdf|max:10240',
        ]);

        // Verify the order belongs to this customer (if provided)
        if ($data['order_id']) {
            $order = Order::find($data['order_id']);
            $customer = \App\Models\Customer::where('user_id', $request->user()->id)->first();
            if (!$order || !$customer || $order->customer_id !== $customer->id) {
                abort(403);
            }
        }

        $evidencePaths = [];
        if ($request->hasFile('evidence')) {
            foreach ($request->file('evidence') as $file) {
                $path = $file->store('reports/evidence', 'public');
                $evidencePaths[] = $path;
            }
        }

        $report = UserReport::create([
            'reporter_id'       => $request->user()->id,
            'reported_store_id' => $data['reported_store_id'],
            'order_id'          => $data['order_id'] ?? null,
            'type'              => 'buyer_report',
            'category'          => $data['category'],
            'subject'           => $data['subject'],
            'description'       => $data['description'],
            'evidence_paths'    => $evidencePaths ?: null,
            'status'            => 'pending',
        ]);

        // Notify platform admins
        NotificationService::sendToRole('platform_admin', 'user_report', 'New Report Submitted',
            "A buyer has submitted a report against a seller: \"{$data['subject']}\"",
            ['report_id' => $report->id]
        );

        return back()->with('success', 'Your report has been submitted. We will review it shortly.');
    }
}
