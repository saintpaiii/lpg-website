<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\SellerWallet;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class WithdrawalController extends Controller
{
    use GeneratesExport;
    private function formatRequest(WithdrawalRequest $w): array
    {
        return [
            'id'               => $w->id,
            'store_id'         => $w->store_id,
            'store_name'       => $w->store->store_name ?? '—',
            'owner_name'       => $w->store->owner?->name ?? '—',
            'amount'           => (float) $w->amount,
            'payment_method'   => $w->payment_method,
            'account_name'     => $w->account_name,
            'account_number'   => $w->account_number,
            'bank_name'        => $w->bank_name,
            'reference_number' => $w->reference_number,
            'status'           => $w->status,
            'rejection_reason' => $w->rejection_reason,
            'notes'            => $w->notes,
            'requested_at'     => $w->requested_at->format('M d, Y g:i A'),
            'released_at'      => $w->released_at?->format('M d, Y'),
        ];
    }

    public function index(Request $request): Response
    {
        $tab = $request->get('tab', 'pending');

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $query = WithdrawalRequest::with('store.owner')->orderByDesc('requested_at');

        if ($tab === 'released') {
            $query->whereIn('status', ['released', 'received']);
        } elseif ($tab !== 'all') {
            $query->where('status', $tab);
        }

        if ($dateFrom) $query->whereDate('requested_at', '>=', $dateFrom);
        if ($dateTo)   $query->whereDate('requested_at', '<=', $dateTo);

        $requests = $query->paginate(20)->withQueryString()->through(fn ($w) => $this->formatRequest($w));

        $counts = [
            'pending'  => WithdrawalRequest::where('status', 'pending')->count(),
            'approved' => WithdrawalRequest::where('status', 'approved')->count(),
            'released' => WithdrawalRequest::whereIn('status', ['released', 'received'])->count(),
            'all'      => WithdrawalRequest::count(),
        ];

        $pendingTotal = (float) WithdrawalRequest::where('status', 'pending')->sum('amount');

        return Inertia::render('admin/withdrawals', [
            'requests'      => $requests,
            'tab'           => $tab,
            'counts'        => $counts,
            'pending_total' => $pendingTotal,
            'date_from'     => $request->get('date_from') ?: '',
            'date_to'       => $request->get('date_to')   ?: '',
        ]);
    }

    public function export(Request $request)
    {
        $tab    = $request->get('tab', 'all');
        $format = $request->get('format', 'csv');

        $query = WithdrawalRequest::with('store.owner')->orderByDesc('requested_at');
        if ($tab !== 'all') $query->where('status', $tab);
        if ($df = $request->get('date_from')) $query->whereDate('requested_at', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('requested_at', '<=', $dt);

        $withdrawals = $query->get();

        $from = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to   = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('withdrawals', 'LPG_Portal', $from, $to, $format);

        $columns = [
            ['key' => 'id',           'label' => 'ID',         'align' => 'right'],
            ['key' => 'store_name',   'label' => 'Store'],
            ['key' => 'owner_name',   'label' => 'Owner'],
            ['key' => 'amount',       'label' => 'Amount',     'align' => 'right'],
            ['key' => 'method',       'label' => 'Method'],
            ['key' => 'account',      'label' => 'Account'],
            ['key' => 'status',       'label' => 'Status'],
            ['key' => 'requested_at', 'label' => 'Requested'],
            ['key' => 'released_at',  'label' => 'Released'],
        ];

        $rows = $withdrawals->map(fn ($w) => [
            'id'           => $w->id,
            'store_name'   => $w->store?->store_name ?? '—',
            'owner_name'   => $w->store?->owner?->name ?? '—',
            'amount'       => $this->peso((float) $w->amount),
            'method'       => str_replace('_', ' ', $w->payment_method),
            'account'      => $w->payment_method === 'bank_transfer' && $w->bank_name
                                ? "{$w->bank_name} · {$w->account_name}"
                                : $w->account_name,
            'status'       => $w->status,
            'requested_at' => $w->requested_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'released_at'  => $w->released_at?->setTimezone('Asia/Manila')->format('M d, Y') ?? '—',
            '_amount'      => (float) $w->amount,
        ])->values()->all();

        $grandTotal = collect($rows)->sum('_amount');

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Withdrawal Requests Export',
                'orgName'      => 'LPG Portal — Platform Admin',
                'orgSub'       => 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Total Requests', 'value' => count($rows)],
                    ['label' => 'Total Amount',   'value' => $this->peso($grandTotal)],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => ['id' => '', 'store_name' => 'TOTAL', 'owner_name' => '', 'amount' => $this->peso($grandTotal), 'method' => '', 'account' => '', 'status' => '', 'requested_at' => '', 'released_at' => ''],
            ]);
        }

        $headings = ['ID', 'Store', 'Owner', 'Amount', 'Method', 'Account', 'Status', 'Requested', 'Released'];
        $csvRows  = array_map(fn ($r) => [$r['id'], $r['store_name'], $r['owner_name'], $r['amount'], $r['method'], $r['account'], $r['status'], $r['requested_at'], $r['released_at']], $rows);
        $csvRows[] = ['', 'TOTAL', '', $this->peso($grandTotal), '', '', '', '', ''];
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    public function approve(WithdrawalRequest $withdrawal): RedirectResponse
    {
        if ($withdrawal->status !== 'pending') {
            return back()->with('error', 'Only pending requests can be approved.');
        }

        $withdrawal->update(['status' => 'approved']);

        return back()->with('success', "Withdrawal request approved for {$withdrawal->store->store_name}.");
    }

    public function reject(Request $request, WithdrawalRequest $withdrawal): RedirectResponse
    {
        if (! in_array($withdrawal->status, ['pending', 'approved'])) {
            return back()->with('error', 'This request cannot be rejected at this stage.');
        }

        $data = $request->validate([
            'rejection_reason' => ['required', 'string', 'max:500'],
        ]);

        $withdrawal->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['rejection_reason'],
        ]);

        return back()->with('success', 'Withdrawal request rejected.');
    }

    public function markReleased(Request $request, WithdrawalRequest $withdrawal): RedirectResponse
    {
        if ($withdrawal->status !== 'approved') {
            return back()->with('error', 'Only approved requests can be released.');
        }

        $data = $request->validate([
            'reference_number' => ['required', 'string', 'max:255'],
        ]);

        $wallet = SellerWallet::where('store_id', $withdrawal->store_id)->first();

        if (! $wallet) {
            return back()->with('error', 'Store wallet not found.');
        }

        if ((float) $wallet->balance < (float) $withdrawal->amount) {
            return back()->with('error', 'Insufficient wallet balance to release this withdrawal.');
        }

        DB::transaction(function () use ($withdrawal, $wallet, $data) {
            $newBalance = round((float) $wallet->balance - (float) $withdrawal->amount, 2);

            WalletTransaction::create([
                'store_id'        => $withdrawal->store_id,
                'order_id'        => null,
                'type'            => 'withdrawal',
                'amount'          => $withdrawal->amount,
                'commission'      => 0.00,
                'running_balance' => max(0.00, $newBalance),
                'description'     => "Withdrawal #{$withdrawal->id} released via {$withdrawal->payment_method}",
            ]);

            $wallet->update([
                'balance'         => max(0.00, $newBalance),
                'total_withdrawn' => round((float) $wallet->total_withdrawn + (float) $withdrawal->amount, 2),
            ]);

            $withdrawal->update([
                'status'           => 'released',
                'released_at'      => now(),
                'reference_number' => $data['reference_number'],
            ]);
        });

        // Notify the store owner that their withdrawal was released
        $ownerId = $withdrawal->store?->user_id ?? null;
        if ($ownerId) {
            NotificationService::send(
                $ownerId,
                'payment',
                'Withdrawal Released',
                '₱' . number_format((float) $withdrawal->amount, 2) . ' withdrawal has been released via ' . str_replace('_', ' ', $withdrawal->payment_method) . '.',
                ['link' => '/seller/wallet']
            );
        }

        return back()->with('success', 'Withdrawal marked as released. Wallet balance updated.');
    }
}
