<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\SellerWallet;
use App\Models\WithdrawalRequest;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WalletController extends Controller
{
    use GeneratesExport;
    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        $wallet = SellerWallet::firstOrCreate(
            ['store_id' => $store->id],
            [
                'balance'          => 0.00,
                'total_earned'     => 0.00,
                'total_withdrawn'  => 0.00,
                'total_commission' => 0.00,
            ]
        );

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $txQuery = $wallet->transactions()->orderByDesc('created_at');
        if ($dateFrom) $txQuery->whereDate('created_at', '>=', $dateFrom);
        if ($dateTo)   $txQuery->whereDate('created_at', '<=', $dateTo);

        $transactions = $txQuery
            ->paginate(20)
            ->through(fn ($t) => [
                'id'              => $t->id,
                'type'            => $t->type,
                'amount'          => (float) $t->amount,
                'commission'      => (float) $t->commission,
                'running_balance' => (float) $t->running_balance,
                'description'     => $t->description,
                'created_at'      => $t->created_at->format('M d, Y g:i A'),
            ]);

        $withdrawals = WithdrawalRequest::where('store_id', $store->id)
            ->orderByDesc('requested_at')
            ->limit(10)
            ->get()
            ->map(fn ($w) => [
                'id'               => $w->id,
                'amount'           => (float) $w->amount,
                'payment_method'   => $w->payment_method,
                'account_name'     => $w->account_name,
                'account_number'   => $w->account_number,
                'bank_name'        => $w->bank_name,
                'reference_number' => $w->reference_number,
                'status'           => $w->status,
                'rejection_reason' => $w->rejection_reason,
                'requested_at'     => $w->requested_at->format('M d, Y g:i A'),
                'released_at'      => $w->released_at?->format('M d, Y g:i A'),
            ]);

        return Inertia::render('seller/wallet', [
            'wallet' => [
                'balance'          => (float) $wallet->balance,
                'total_earned'     => (float) $wallet->total_earned,
                'total_withdrawn'  => (float) $wallet->total_withdrawn,
                'total_commission' => (float) $wallet->total_commission,
            ],
            'transactions' => $transactions,
            'withdrawals'  => $withdrawals,
            'date_from'    => $request->get('date_from') ?: '',
            'date_to'      => $request->get('date_to')   ?: '',
        ]);
    }

    public function export(Request $request)
    {
        $store  = $request->attributes->get('seller_store');
        $format = $request->get('format', 'csv');

        $wallet = SellerWallet::firstOrCreate(
            ['store_id' => $store->id],
            ['balance' => 0, 'total_earned' => 0, 'total_withdrawn' => 0, 'total_commission' => 0]
        );

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $txQuery = $wallet->transactions()->orderByDesc('created_at');
        if ($dateFrom) $txQuery->whereDate('created_at', '>=', $dateFrom);
        if ($dateTo)   $txQuery->whereDate('created_at', '<=', $dateTo);

        $transactions = $txQuery->get();

        $from = $dateFrom ?? now()->startOfMonth()->toDateString();
        $to   = $dateTo   ?? now()->toDateString();
        $filename = $this->exportFilename('wallet_transactions', $store->store_name, $from, $to, $format);

        $columns = [
            ['key' => 'created_at',      'label' => 'Date'],
            ['key' => 'type',            'label' => 'Type'],
            ['key' => 'description',     'label' => 'Description'],
            ['key' => 'amount',          'label' => 'Amount',  'align' => 'right'],
            ['key' => 'commission',      'label' => 'Commission', 'align' => 'right'],
            ['key' => 'running_balance', 'label' => 'Balance', 'align' => 'right'],
        ];

        $rows = $transactions->map(fn ($t) => [
            'created_at'      => $t->created_at->setTimezone('Asia/Manila')->format('M d, Y g:i A'),
            'type'            => ucfirst($t->type),
            'description'     => $t->description ?? '',
            'amount'          => ($t->type === 'credit' ? '+' : '−') . $this->peso((float) $t->amount),
            'commission'      => $t->commission > 0 ? $this->peso((float) $t->commission) : '—',
            'running_balance' => $this->peso((float) $t->running_balance),
        ])->values()->all();

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Wallet Transaction History',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Current Balance',  'value' => $this->peso((float) $wallet->balance)],
                    ['label' => 'Total Earned',     'value' => $this->peso((float) $wallet->total_earned)],
                    ['label' => 'Total Withdrawn',  'value' => $this->peso((float) $wallet->total_withdrawn)],
                    ['label' => 'Records',          'value' => count($rows)],
                ],
                'columns' => $columns,
                'rows'    => $rows,
            ]);
        }

        $headings = ['Date', 'Type', 'Description', 'Amount', 'Commission', 'Balance'];
        $csvRows  = array_map(fn ($r) => array_values($r), $rows);
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    public function requestWithdrawal(Request $request): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');

        $wallet = SellerWallet::where('store_id', $store->id)->first();
        $balance = $wallet ? (float) $wallet->balance : 0.0;

        $data = $request->validate([
            'amount'         => ['required', 'numeric', 'min:100', "max:{$balance}"],
            'payment_method' => ['required', 'in:gcash,bank_transfer,maya'],
            'account_name'   => ['required', 'string', 'max:255'],
            'account_number' => ['required', 'string', 'max:255'],
            'bank_name'      => ['required_if:payment_method,bank_transfer', 'nullable', 'string', 'max:255'],
            'notes'          => ['nullable', 'string', 'max:500'],
        ]);

        WithdrawalRequest::create([
            'store_id'       => $store->id,
            'amount'         => $data['amount'],
            'payment_method' => $data['payment_method'],
            'account_name'   => $data['account_name'],
            'account_number' => $data['account_number'],
            'bank_name'      => $data['bank_name'] ?? null,
            'status'         => 'pending',
            'requested_at'   => now(),
            'notes'          => $data['notes'] ?? null,
        ]);

        // Notify platform admins about the new withdrawal request
        NotificationService::sendToRole(
            'platform_admin',
            'payment',
            'Withdrawal Request',
            "{$store->store_name} requested a withdrawal of ₱" . number_format((float) $data['amount'], 2) . ' via ' . str_replace('_', ' ', $data['payment_method']) . '.',
            ['link' => '/admin/withdrawals']
        );

        return back()->with('success', 'Withdrawal request submitted. The admin will process it shortly.');
    }

    public function markReceived(Request $request, WithdrawalRequest $withdrawal): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');

        if ($withdrawal->store_id !== $store->id) {
            abort(403);
        }

        if ($withdrawal->status !== 'released') {
            return back()->with('error', 'Only released withdrawals can be confirmed as received.');
        }

        $withdrawal->update(['status' => 'received']);

        return back()->with('success', 'Withdrawal confirmed as received.');
    }
}
