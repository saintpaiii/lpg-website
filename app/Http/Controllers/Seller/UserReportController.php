<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\UserReport;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UserReportController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'order_id'    => 'nullable|integer|exists:orders,id',
            'reported_id' => 'required|integer|exists:users,id',
            'category'    => 'required|in:fraud,fake_product,rude_behavior,non_delivery,overpricing,harassment,counterfeit,other',
            'subject'     => 'required|string|max:255',
            'description' => 'required|string|max:5000',
            'evidence'    => 'nullable|array|max:5',
            'evidence.*'  => 'file|mimes:jpg,jpeg,png,webp,mp4,pdf|max:10240',
        ]);

        $store = $request->user()->store;
        if (!$store) {
            abort(403, 'No store associated with this account.');
        }

        // Verify the order belongs to this store (if provided)
        if ($data['order_id']) {
            $order = Order::find($data['order_id']);
            if (!$order || $order->store_id !== $store->id) {
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
            'reported_store_id' => $store->id, // store reporting FROM
            'reported_id'       => $data['reported_id'],
            'order_id'          => $data['order_id'] ?? null,
            'type'              => 'seller_report',
            'category'          => $data['category'],
            'subject'           => $data['subject'],
            'description'       => $data['description'],
            'evidence_paths'    => $evidencePaths ?: null,
            'status'            => 'pending',
        ]);

        // Notify platform admins
        NotificationService::sendToRole('platform_admin', 'user_report', 'New Report Submitted',
            "A seller has submitted a report against a buyer: \"{$data['subject']}\"",
            ['report_id' => $report->id]
        );

        return back()->with('success', 'Your report has been submitted. We will review it shortly.');
    }
}
